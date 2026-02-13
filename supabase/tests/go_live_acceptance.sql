-- Go-live acceptance checks (read-only where possible)
-- Run in Supabase SQL Editor. Script must finish without ERROR.

BEGIN;

DO $go_live$
DECLARE
  v_cnt int;
  v_user uuid := gen_random_uuid();
  v_customer uuid;
  v_item uuid;
  v_order uuid;
  v_line uuid;
BEGIN
  -- Simulate authenticated user for auth.uid() in SQL editor context
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- 1) Core views/tables exist
  IF to_regclass('public.report_vat_by_rate_monthly') IS NULL THEN
    RAISE EXCEPTION 'Missing view: public.report_vat_by_rate_monthly';
  END IF;
  IF to_regclass('public.open_items_aging_view') IS NULL THEN
    RAISE EXCEPTION 'Missing view: public.open_items_aging_view';
  END IF;
  IF to_regclass('public.document_history_view') IS NULL THEN
    RAISE EXCEPTION 'Missing view: public.document_history_view';
  END IF;
  IF to_regclass('public.payments') IS NULL THEN
    RAISE EXCEPTION 'Missing table: public.payments';
  END IF;
  IF to_regclass('public.dunning_log') IS NULL THEN
    RAISE EXCEPTION 'Missing table: public.dunning_log';
  END IF;
  IF to_regclass('public.bank_import_runs') IS NULL THEN
    RAISE EXCEPTION 'Missing table: public.bank_import_runs';
  END IF;
  IF to_regclass('public.bank_import_run_rows') IS NULL THEN
    RAISE EXCEPTION 'Missing table: public.bank_import_run_rows';
  END IF;
  IF to_regprocedure('public.undo_bank_import_payment(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Missing function: public.undo_bank_import_payment(uuid)';
  END IF;

  -- 2) No duplicate sale/cancel movement bookings
  SELECT COUNT(*) INTO v_cnt
  FROM (
    SELECT booking_key
    FROM public.stock_movements
    WHERE booking_key ~ '^(sale|cancel):'
    GROUP BY booking_key
    HAVING COUNT(*) > 1
  ) q;

  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'Duplicate transactional stock movements detected: %', v_cnt;
  END IF;

  -- 3) Payment status consistency check (zero rows expected, if quality view exists)
  IF to_regclass('public.data_quality_issues_view') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_cnt
    FROM public.data_quality_issues_view
    WHERE issue_type = 'payment_status_mismatch';
  ELSIF to_regclass('public.data_quality_issues') IS NOT NULL THEN
    SELECT COUNT(*) INTO v_cnt
    FROM public.data_quality_issues
    WHERE issue_type = 'payment_status_mismatch';
  ELSE
    v_cnt := 0;
    RAISE NOTICE 'Skip check: no data quality view found';
  END IF;

  IF v_cnt > 0 THEN
    RAISE EXCEPTION 'Payment status mismatches found: %', v_cnt;
  END IF;

  -- 4) Document fixity triggers exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_guard_document_update'
  ) THEN
    RAISE EXCEPTION 'Missing trigger: trg_guard_document_update';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_guard_document_line_update'
  ) THEN
    RAISE EXCEPTION 'Missing trigger: trg_guard_document_line_update';
  END IF;

  -- 5) Lifecycle smoke test: OPEN -> DONE -> RETOURE -> STORNO
  -- Everything is wrapped by outer BEGIN/ROLLBACK.
  INSERT INTO public.company_profile (created_by, legal_name, street, zip, city, country, iban)
  VALUES (v_user, 'UAT Firma AG', 'Testweg 1', '9000', 'StGallen', 'CH', 'CH9300000000000000000')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.customers (owner_id, created_by, company_name, street, zip, city, country)
  VALUES (v_user, v_user, 'UAT Kunde AG', 'Kundengasse 5', '9001', 'StGallen', 'CH')
  RETURNING id INTO v_customer;

  INSERT INTO public.items (created_by, name, price, purchase_price, current_stock, unit)
  VALUES (v_user, 'UAT Artikel', 19.90, 8.50, 25, 'pcs')
  RETURNING id INTO v_item;

  INSERT INTO public.orders (created_by, customer_id, status, total_chf)
  VALUES (v_user, v_customer, 'open', 0)
  RETURNING id INTO v_order;

  INSERT INTO public.order_lines (created_by, order_id, item_id, qty, price_chf, unit)
  VALUES (v_user, v_order, v_item, 2, 19.90, 'pcs')
  RETURNING id INTO v_line;

  PERFORM public.finalize_order(v_order);

  SELECT COUNT(*) INTO v_cnt
  FROM public.orders
  WHERE id = v_order
    AND status = 'done'
    AND invoice_no IS NOT NULL;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Lifecycle test failed: order not finalized.';
  END IF;

  -- Required by document fixity guard when book_return updates order status
  PERFORM set_config('app.allow_document_update', '1', true);
  PERFORM public.book_return(v_line, 1, 'UAT-Retoure');

  SELECT COUNT(*) INTO v_cnt
  FROM public.orders
  WHERE id = v_order
    AND status = 'retoure';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Lifecycle test failed: retour status not set.';
  END IF;

  PERFORM public.cancel_order_after_done(v_order);

  SELECT COUNT(*) INTO v_cnt
  FROM public.orders
  WHERE id = v_order
    AND status = 'storno'
    AND document_type = 'credit_note'
    AND credit_note_no IS NOT NULL;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Lifecycle test failed: storno/credit note not created.';
  END IF;

  RAISE NOTICE 'Go-live acceptance checks passed.';
END
$go_live$;

ROLLBACK;
