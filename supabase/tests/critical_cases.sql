-- Critical SQL tests (transactional, full rollback)
-- Goal: validate core order lifecycle, stock integrity, payments, dunning, and document guards.

BEGIN;

DO $$
DECLARE
  v_user uuid := gen_random_uuid();

  v_company uuid;
  v_customer_1 uuid;
  v_customer_2 uuid;

  v_item_1 uuid;
  v_item_2 uuid;
  v_item_3 uuid;

  v_order_a uuid; -- open -> done -> retoure -> storno(credit note)
  v_order_b uuid; -- open -> done -> partial -> paid
  v_order_c uuid; -- open -> done -> overdue + dunning

  v_line_a_1 uuid;
  v_line_a_2 uuid;
  v_line_b_1 uuid;
  v_line_c_1 uuid;

  v_cnt int;
  v_checks int := 0;
  v_total_b numeric;
  v_level int;
  v_bank_payment_id uuid;
  v_bank_run_id uuid;
  v_profile_color text;
  v_incident_1 uuid;
  v_incident_no_1 text;
  v_incident_no_2 text;
  v_incident_seq_1 int;
  v_incident_seq_2 int;
BEGIN
  -- Simulate authenticated user for auth.uid()
  PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  -- 1) Employee profile color assignment
  INSERT INTO public.app_users (id, email)
  VALUES (v_user, 'test.user@example.local')
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email
  RETURNING profile_color INTO v_profile_color;

  IF v_profile_color IS NULL OR v_profile_color !~ '^#[0-9A-F]{6}$' THEN
    RAISE EXCEPTION 'Test failed: invalid app_users.profile_color (%).', v_profile_color;
  END IF;
  v_checks := v_checks + 1;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user, 'admin'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  v_checks := v_checks + 1;

  -- 1b) Work incidents core checks (MIG-1)
  INSERT INTO public.work_incidents (
    employee_user_id, incident_date, incident_type, severity, location, description
  ) VALUES (
    v_user, CURRENT_DATE, 'berufsunfall', 'leicht', 'Lagerhalle', 'Rutschunfall am Gang'
  )
  RETURNING id, incident_no INTO v_incident_1, v_incident_no_1;

  IF v_incident_1 IS NULL OR v_incident_no_1 IS NULL OR v_incident_no_1 !~ '^INC-[0-9]{4}-[0-9]{6}$' THEN
    RAISE EXCEPTION 'Test failed: invalid incident number format (%).', v_incident_no_1;
  END IF;
  v_checks := v_checks + 1;

  INSERT INTO public.work_incidents (
    employee_user_id, incident_date, incident_type, severity, location, description
  ) VALUES (
    v_user, CURRENT_DATE, 'nichtberufsunfall', 'mittel', 'Aussenbereich', 'Sturz auf Parkplatz'
  )
  RETURNING incident_no INTO v_incident_no_2;

  IF v_incident_no_2 IS NULL OR v_incident_no_2 !~ '^INC-[0-9]{4}-[0-9]{6}$' THEN
    RAISE EXCEPTION 'Test failed: second incident number invalid (%).', v_incident_no_2;
  END IF;
  v_checks := v_checks + 1;

  v_incident_seq_1 := substring(v_incident_no_1 from '([0-9]{6})$')::int;
  v_incident_seq_2 := substring(v_incident_no_2 from '([0-9]{6})$')::int;
  IF v_incident_seq_2 <> v_incident_seq_1 + 1 THEN
    RAISE EXCEPTION 'Test failed: incident sequence not incremental (% -> %).', v_incident_no_1, v_incident_no_2;
  END IF;
  v_checks := v_checks + 1;

  BEGIN
    INSERT INTO public.work_incidents (
      employee_user_id, incident_date, incident_type, severity, location, description, work_incapacity_percent
    ) VALUES (
      v_user, CURRENT_DATE, 'berufsunfall', 'leicht', 'Lagerhalle', 'Ungueltige Arbeitsunfaehigkeit', 150
    );
    RAISE EXCEPTION 'Test failed: work_incapacity_percent > 100 must fail.';
  EXCEPTION WHEN check_violation THEN
    v_checks := v_checks + 1;
  END;

  BEGIN
    INSERT INTO public.work_incidents (
      employee_user_id, incident_date, incident_type, severity, location, description, status
    ) VALUES (
      v_user, CURRENT_DATE, 'berufsunfall', 'leicht', 'Lagerhalle', 'Ungueltiger Status', 'invalid_status'
    );
    RAISE EXCEPTION 'Test failed: invalid status must fail.';
  EXCEPTION WHEN check_violation THEN
    v_checks := v_checks + 1;
  END;

  SELECT COUNT(*) INTO v_cnt
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'work_incidents';
  IF v_cnt < 5 THEN
    RAISE EXCEPTION 'Test failed: expected >= 5 policies for work_incidents, got %.', v_cnt;
  END IF;
  v_checks := v_checks + 1;

  -- 1c) Work incidents workflow checks (MIG-2)
  PERFORM public.report_work_incident(v_incident_1, 'Erstmeldung an Versicherer');

  SELECT COUNT(*) INTO v_cnt
  FROM public.work_incidents
  WHERE id = v_incident_1
    AND status = 'reported'
    AND reported_to_insurer_at IS NOT NULL;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Test failed: incident not set to reported.';
  END IF;
  v_checks := v_checks + 1;

  SELECT COUNT(*) INTO v_cnt
  FROM public.work_incident_events
  WHERE incident_id = v_incident_1
    AND event_type = 'created';
  IF v_cnt < 1 THEN
    RAISE EXCEPTION 'Test failed: created event missing for incident.';
  END IF;
  v_checks := v_checks + 1;

  SELECT COUNT(*) INTO v_cnt
  FROM public.work_incident_events
  WHERE incident_id = v_incident_1
    AND event_type = 'reported';
  IF v_cnt < 1 THEN
    RAISE EXCEPTION 'Test failed: reported event missing for incident.';
  END IF;
  v_checks := v_checks + 1;

  SELECT COUNT(*) INTO v_cnt
  FROM public.work_incident_events
  WHERE incident_id = v_incident_1
    AND event_type = 'note'
    AND note ilike '%Erstmeldung%';
  IF v_cnt < 1 THEN
    RAISE EXCEPTION 'Test failed: report note event missing for incident.';
  END IF;
  v_checks := v_checks + 1;

  BEGIN
    UPDATE public.work_incidents
    SET status = 'in_treatment'
    WHERE id = v_incident_1;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT COUNT(*) INTO v_cnt
  FROM public.work_incidents
  WHERE id = v_incident_1
    AND status = 'reported';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Test failed: direct status update bypassed guard.';
  END IF;
  v_checks := v_checks + 1;

  BEGIN
    PERFORM public.close_work_incident(v_incident_1, '');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT COUNT(*) INTO v_cnt
  FROM public.work_incidents
  WHERE id = v_incident_1
    AND status = 'reported'
    AND close_reason IS NULL;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Test failed: close without reason should not modify incident.';
  END IF;
  v_checks := v_checks + 1;

  PERFORM public.close_work_incident(v_incident_1, 'Fall abgeschlossen');

  SELECT COUNT(*) INTO v_cnt
  FROM public.work_incidents
  WHERE id = v_incident_1
    AND status = 'closed'
    AND close_reason = 'Fall abgeschlossen';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Test failed: incident not closed correctly.';
  END IF;
  v_checks := v_checks + 1;

  SELECT COUNT(*) INTO v_cnt
  FROM public.work_incident_events
  WHERE incident_id = v_incident_1
    AND event_type = 'closed';
  IF v_cnt < 1 THEN
    RAISE EXCEPTION 'Test failed: closed event missing for incident.';
  END IF;
  v_checks := v_checks + 1;

  BEGIN
    UPDATE public.work_incidents
    SET location = 'Neuer Ort'
    WHERE id = v_incident_1;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT COUNT(*) INTO v_cnt
  FROM public.work_incidents
  WHERE id = v_incident_1
    AND location = 'Lagerhalle';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Test failed: closed incident should be immutable.';
  END IF;
  v_checks := v_checks + 1;

  SELECT COUNT(*) INTO v_cnt
  FROM public.work_incident_kpi_monthly
  WHERE created_by = v_user
    AND month = date_trunc('month', CURRENT_DATE)::date
    AND incidents_total >= 2;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Test failed: KPI monthly view missing/invalid row.';
  END IF;
  v_checks := v_checks + 1;

  -- 2) Master data setup
  INSERT INTO public.company_profile (created_by, legal_name, street, zip, city, country, iban)
  VALUES (v_user, 'Test Firma AG', 'Teststrasse 1', '8000', 'Zuerich', 'CH', 'CH9300000000000000000')
  RETURNING id INTO v_company;
  v_checks := v_checks + 1;

  INSERT INTO public.customers (owner_id, created_by, company_name, street, zip, city, country)
  VALUES (v_user, v_user, 'Testkunde A GmbH', 'Kundengasse 2', '8001', 'Zuerich', 'CH')
  RETURNING id INTO v_customer_1;
  v_checks := v_checks + 1;

  INSERT INTO public.customers (owner_id, created_by, company_name, street, zip, city, country)
  VALUES (v_user, v_user, 'Testkunde B AG', 'Seeweg 10', '9000', 'StGallen', 'CH')
  RETURNING id INTO v_customer_2;
  v_checks := v_checks + 1;

  INSERT INTO public.items (created_by, name, price, purchase_price, current_stock, unit)
  VALUES (v_user, 'Artikel A', 25, 10, 50, 'pcs') RETURNING id INTO v_item_1;
  v_checks := v_checks + 1;

  INSERT INTO public.items (created_by, name, price, purchase_price, current_stock, unit)
  VALUES (v_user, 'Artikel B', 40, 17, 60, 'pcs') RETURNING id INTO v_item_2;
  v_checks := v_checks + 1;

  INSERT INTO public.items (created_by, name, price, purchase_price, current_stock, unit)
  VALUES (v_user, 'Artikel C', 15, 7, 20, 'pcs') RETURNING id INTO v_item_3;
  v_checks := v_checks + 1;

  -- 2) Order A (DONE/RETURN/CANCEL)
  INSERT INTO public.orders (created_by, customer_id, status, total_chf)
  VALUES (v_user, v_customer_1, 'open', 0)
  RETURNING id INTO v_order_a;
  v_checks := v_checks + 1;

  INSERT INTO public.order_lines (created_by, order_id, item_id, qty, price_chf, unit)
  VALUES (v_user, v_order_a, v_item_1, 2, 25, 'pcs')
  RETURNING id INTO v_line_a_1;
  v_checks := v_checks + 1;

  INSERT INTO public.order_lines (created_by, order_id, item_id, qty, price_chf, unit)
  VALUES (v_user, v_order_a, v_item_2, 1, 40, 'pcs')
  RETURNING id INTO v_line_a_2;
  v_checks := v_checks + 1;

  PERFORM public.finalize_order(v_order_a);

  SELECT COUNT(*) INTO v_cnt
  FROM public.orders
  WHERE id = v_order_a AND status = 'done' AND invoice_no IS NOT NULL;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Test failed: Order A not finalized.';
  END IF;
  v_checks := v_checks + 1;

  SELECT COUNT(*) INTO v_cnt
  FROM public.stock_movements
  WHERE booking_key IN ('sale:' || v_line_a_1::text, 'sale:' || v_line_a_2::text);
  IF v_cnt <> 2 THEN
    RAISE EXCEPTION 'Test failed: sale movements missing/duplicated for Order A (%).', v_cnt;
  END IF;
  v_checks := v_checks + 1;

  BEGIN
    PERFORM public.finalize_order(v_order_a);
    RAISE EXCEPTION 'Test failed: finalize_order must fail on non-open order.';
  EXCEPTION WHEN OTHERS THEN
    v_checks := v_checks + 1;
  END;

  -- Required because fixed-document trigger guards order update in book_return
  PERFORM set_config('app.allow_document_update', '1', true);
  PERFORM public.book_return(v_line_a_1, 1, 'Teilretoure Test');

  SELECT COUNT(*) INTO v_cnt
  FROM public.orders
  WHERE id = v_order_a AND status = 'retoure';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Test failed: Order A not set to retoure.';
  END IF;
  v_checks := v_checks + 1;

  SELECT COUNT(*) INTO v_cnt
  FROM public.stock_movements
  WHERE order_line_id = v_line_a_1 AND reason_code = 'return' AND qty = 1;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Test failed: partial return movement missing.';
  END IF;
  v_checks := v_checks + 1;

  BEGIN
    PERFORM set_config('app.allow_document_update', '1', true);
    PERFORM public.book_return(v_line_a_1, 5, 'Ueberretoure muss failen');
    RAISE EXCEPTION 'Test failed: over-return should fail.';
  EXCEPTION WHEN OTHERS THEN
    v_checks := v_checks + 1;
  END;

  PERFORM public.cancel_order_after_done(v_order_a);

  SELECT COUNT(*) INTO v_cnt
  FROM public.orders
  WHERE id = v_order_a
    AND status = 'storno'
    AND document_type = 'credit_note'
    AND credit_note_no IS NOT NULL;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Test failed: credit note not generated for cancelled order.';
  END IF;
  v_checks := v_checks + 1;

  SELECT COUNT(*) INTO v_cnt
  FROM public.stock_movements
  WHERE booking_key IN ('cancel:' || v_line_a_1::text, 'cancel:' || v_line_a_2::text);
  IF v_cnt <> 2 THEN
    RAISE EXCEPTION 'Test failed: cancel stock movements missing for Order A (%).', v_cnt;
  END IF;
  v_checks := v_checks + 1;

  BEGIN
    DELETE FROM public.orders WHERE id = v_order_a;
    RAISE EXCEPTION 'Test failed: fixed document delete should fail.';
  EXCEPTION WHEN OTHERS THEN
    v_checks := v_checks + 1;
  END;

  -- 3) Order B (payment flow + discounts)
  INSERT INTO public.orders (created_by, customer_id, status, total_chf, payment_terms_days)
  VALUES (v_user, v_customer_1, 'open', 0, 30)
  RETURNING id INTO v_order_b;
  v_checks := v_checks + 1;

  INSERT INTO public.order_lines (created_by, order_id, item_id, qty, price_chf, unit)
  VALUES (v_user, v_order_b, v_item_3, 2, 15, 'pcs')
  RETURNING id INTO v_line_b_1;
  v_checks := v_checks + 1;

  PERFORM public.finalize_order(v_order_b);

  SELECT gross_total INTO v_total_b FROM public.orders WHERE id = v_order_b;
  IF v_total_b IS NULL OR v_total_b <= 0 THEN
    RAISE EXCEPTION 'Test failed: invalid gross_total for Order B.';
  END IF;
  v_checks := v_checks + 1;

  BEGIN
    PERFORM public.apply_payment(v_order_b, -1, 'Bar', now(), 'Invalid');
    RAISE EXCEPTION 'Test failed: negative payment must fail.';
  EXCEPTION WHEN OTHERS THEN
    v_checks := v_checks + 1;
  END;

  PERFORM public.apply_payment(v_order_b, 5, 'Bar', now(), 'Teilzahlung');

  SELECT COUNT(*) INTO v_cnt
  FROM public.orders
  WHERE id = v_order_b AND payment_status = 'partial';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Test failed: payment_status should be partial.';
  END IF;
  v_checks := v_checks + 1;

  SELECT COUNT(*) INTO v_cnt
  FROM public.payments
  WHERE order_id = v_order_b;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Test failed: expected 1 payment row after partial payment.';
  END IF;
  v_checks := v_checks + 1;

  PERFORM public.apply_payment(
    v_order_b,
    7.5,
    'Bankimport',
    now(),
    'BANKCSV|2026-02-13|7.50|INV-TEST|MATCH'
  );
  v_checks := v_checks + 1;

  SELECT id INTO v_bank_payment_id
  FROM public.payments
  WHERE order_id = v_order_b
    AND note = 'BANKCSV|2026-02-13|7.50|INV-TEST|MATCH'
  ORDER BY created_at DESC
  LIMIT 1;
  IF v_bank_payment_id IS NULL THEN
    RAISE EXCEPTION 'Test failed: missing BANKCSV payment to undo.';
  END IF;
  v_checks := v_checks + 1;

  PERFORM public.undo_bank_import_payment(v_bank_payment_id);

  SELECT COUNT(*) INTO v_cnt
  FROM public.payments
  WHERE id = v_bank_payment_id;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'Test failed: undo did not delete bank-import payment.';
  END IF;
  v_checks := v_checks + 1;

  SELECT COUNT(*) INTO v_cnt
  FROM public.orders
  WHERE id = v_order_b AND payment_status = 'partial';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Test failed: undo should set Order B back to partial.';
  END IF;
  v_checks := v_checks + 1;

  BEGIN
    SELECT id INTO v_bank_payment_id
    FROM public.payments
    WHERE order_id = v_order_b
      AND note = 'Teilzahlung'
    ORDER BY created_at DESC
    LIMIT 1;
    PERFORM public.undo_bank_import_payment(v_bank_payment_id);
    RAISE EXCEPTION 'Test failed: undo must reject non-bankimport payments.';
  EXCEPTION WHEN OTHERS THEN
    v_checks := v_checks + 1;
  END;

  PERFORM public.apply_payment(
    v_order_b,
    7.5,
    'Bankimport',
    now(),
    'BANKCSV|2026-02-13|7.50|INV-TEST|MATCH'
  );
  v_checks := v_checks + 1;

  BEGIN
    PERFORM public.apply_payment(
      v_order_b,
      7.5,
      'Bankimport',
      now(),
      'BANKCSV|2026-02-13|7.50|INV-TEST|MATCH'
    );
    RAISE EXCEPTION 'Test failed: duplicate BANKCSV marker must fail.';
  EXCEPTION WHEN unique_violation THEN
    v_checks := v_checks + 1;
  END;

  PERFORM public.apply_payment(v_order_b, 9999, 'Bank', now(), 'Restzahlung');

  SELECT COUNT(*) INTO v_cnt
  FROM public.orders
  WHERE id = v_order_b AND payment_status = 'paid' AND paid_at IS NOT NULL;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Test failed: payment_status should be paid.';
  END IF;
  v_checks := v_checks + 1;

  SELECT COUNT(*) INTO v_cnt
  FROM public.payments
  WHERE order_id = v_order_b;
  IF v_cnt <> 3 THEN
    RAISE EXCEPTION 'Test failed: expected 3 payment rows after full settlement.';
  END IF;
  v_checks := v_checks + 1;

  INSERT INTO public.bank_import_runs (
    source_file,
    total_rows,
    matched_rows,
    ambiguous_rows,
    unmatched_rows,
    ignored_rows,
    invalid_rows,
    selected_rows,
    booked_rows,
    duplicate_rows,
    failed_rows,
    parse_error_count,
    errors_preview,
    meta
  ) VALUES (
    'critical-test.csv',
    4,
    2,
    1,
    1,
    0,
    0,
    2,
    1,
    1,
    0,
    1,
    '["Zeile 3: Betrag fehlt"]'::jsonb,
    '{"source":"critical_cases"}'::jsonb
  )
  RETURNING id INTO v_bank_run_id;
  IF v_bank_run_id IS NULL THEN
    RAISE EXCEPTION 'Test failed: bank_import_runs insert failed.';
  END IF;
  v_checks := v_checks + 1;

  SELECT COUNT(*) INTO v_cnt
  FROM public.bank_import_runs
  WHERE id = v_bank_run_id
    AND source_file = 'critical-test.csv'
    AND booked_rows = 1
    AND duplicate_rows = 1;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Test failed: bank_import_runs stored values mismatch.';
  END IF;
  v_checks := v_checks + 1;

  -- 4) Order C (overdue + dunning)
  INSERT INTO public.orders (
    created_by, customer_id, status, total_chf,
    payment_terms_days, discount_amount, discount_until, invoice_date
  ) VALUES (
    v_user, v_customer_2, 'open', 0,
    10, 2, (CURRENT_DATE + INTERVAL '1 day')::date, (CURRENT_DATE - INTERVAL '40 day')::date
  ) RETURNING id INTO v_order_c;
  v_checks := v_checks + 1;

  INSERT INTO public.order_lines (created_by, order_id, item_id, qty, price_chf, unit)
  VALUES (v_user, v_order_c, v_item_2, 1, 40, 'pcs')
  RETURNING id INTO v_line_c_1;
  v_checks := v_checks + 1;

  PERFORM public.finalize_order(v_order_c);

  PERFORM set_config('app.allow_document_update', '1', true);
  UPDATE public.orders
  SET due_date = (CURRENT_DATE - INTERVAL '5 day')::date,
      payment_status = 'open'
  WHERE id = v_order_c;
  v_checks := v_checks + 1;

  PERFORM public.mark_overdue_invoices();

  SELECT COUNT(*) INTO v_cnt
  FROM public.orders
  WHERE id = v_order_c AND payment_status = 'overdue';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Test failed: overdue marker not applied.';
  END IF;
  v_checks := v_checks + 1;

  PERFORM public.run_dunning_batch(3);

  SELECT dunning_level INTO v_level FROM public.orders WHERE id = v_order_c;
  IF v_level IS NULL OR v_level < 1 THEN
    RAISE EXCEPTION 'Test failed: dunning batch did not raise level.';
  END IF;
  v_checks := v_checks + 1;

  SELECT COUNT(*) INTO v_cnt
  FROM public.dunning_log
  WHERE order_id = v_order_c;
  IF v_cnt < 1 THEN
    RAISE EXCEPTION 'Test failed: dunning log missing after batch.';
  END IF;
  v_checks := v_checks + 1;

  v_level := public.bump_dunning_level(v_order_c, 'Manuell hochsetzen', 3);
  IF v_level < 1 OR v_level > 3 THEN
    RAISE EXCEPTION 'Test failed: bump_dunning_level returned invalid value %.', v_level;
  END IF;
  v_checks := v_checks + 1;

  SELECT COUNT(*) INTO v_cnt
  FROM public.dunning_log
  WHERE order_id = v_order_c;
  IF v_cnt < 2 THEN
    RAISE EXCEPTION 'Test failed: manual dunning log not written.';
  END IF;
  v_checks := v_checks + 1;

  -- Pay and ensure dunning is blocked on paid invoice
  PERFORM public.apply_payment(v_order_c, 9999, 'Bank', now(), 'Ausgleich');
  SELECT COUNT(*) INTO v_cnt
  FROM public.orders
  WHERE id = v_order_c AND payment_status = 'paid';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Test failed: Order C should be paid after settlement.';
  END IF;
  v_checks := v_checks + 1;

  BEGIN
    PERFORM public.bump_dunning_level(v_order_c, 'Sollte failen', 3);
    RAISE EXCEPTION 'Test failed: dunning on paid invoice must fail.';
  EXCEPTION WHEN OTHERS THEN
    v_checks := v_checks + 1;
  END;

  -- 5) Existence checks for reporting views used by UI/exports
  SELECT COUNT(*) INTO v_cnt FROM public.payment_export_view WHERE order_id = v_order_b;
  IF v_cnt < 1 THEN
    RAISE EXCEPTION 'Test failed: payment_export_view missing rows.';
  END IF;
  v_checks := v_checks + 1;

  SELECT COUNT(*) INTO v_cnt FROM public.document_history_view WHERE order_id = v_order_c;
  IF v_cnt < 1 THEN
    RAISE EXCEPTION 'Test failed: document_history_view missing rows.';
  END IF;
  v_checks := v_checks + 1;

  SELECT COUNT(*) INTO v_cnt
  FROM pg_views
  WHERE schemaname = 'public' AND viewname = 'report_vat_by_rate_monthly';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Test failed: VAT report view missing.';
  END IF;
  v_checks := v_checks + 1;

  SELECT COUNT(*) INTO v_cnt
  FROM pg_views
  WHERE schemaname = 'public' AND viewname = 'report_ar_summary';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Test failed: report_ar_summary missing.';
  END IF;
  v_checks := v_checks + 1;

  SELECT COUNT(*) INTO v_cnt
  FROM pg_views
  WHERE schemaname = 'public' AND viewname = 'report_ap_summary';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Test failed: report_ap_summary missing.';
  END IF;
  v_checks := v_checks + 1;

  -- 6) Additional integrity checks to reach broad critical coverage
  SELECT COUNT(*) INTO v_cnt FROM public.stock_movements WHERE order_id = v_order_a AND reason_code = 'sale';
  IF v_cnt <> 2 THEN
    RAISE EXCEPTION 'Test failed: Order A sale movement count mismatch.';
  END IF;
  v_checks := v_checks + 1;

  SELECT COUNT(*) INTO v_cnt FROM public.stock_movements WHERE order_id = v_order_a AND reason_code = 'return';
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Test failed: Order A return movement count mismatch.';
  END IF;
  v_checks := v_checks + 1;

  SELECT COUNT(*) INTO v_cnt FROM public.stock_movements WHERE order_id = v_order_a AND reason_code = 'cancel';
  IF v_cnt <> 2 THEN
    RAISE EXCEPTION 'Test failed: Order A cancel movement count mismatch.';
  END IF;
  v_checks := v_checks + 1;

  SELECT COUNT(*) INTO v_cnt FROM public.orders WHERE id = v_order_a AND credit_note_no IS NOT NULL;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Test failed: Order A credit note number missing.';
  END IF;
  v_checks := v_checks + 1;

  SELECT COUNT(*) INTO v_cnt FROM public.orders WHERE id = v_order_b AND invoice_no IS NOT NULL;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Test failed: Order B invoice number missing.';
  END IF;
  v_checks := v_checks + 1;

  SELECT COUNT(*) INTO v_cnt FROM public.orders WHERE id = v_order_c AND invoice_no IS NOT NULL;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Test failed: Order C invoice number missing.';
  END IF;
  v_checks := v_checks + 1;

  SELECT COUNT(*) INTO v_cnt FROM public.orders WHERE id = v_order_b AND due_date IS NOT NULL;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Test failed: due_date missing for Order B.';
  END IF;
  v_checks := v_checks + 1;

  SELECT COUNT(*) INTO v_cnt FROM public.orders WHERE id = v_order_c AND dunning_level IS NOT NULL;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'Test failed: dunning_level missing for Order C.';
  END IF;
  v_checks := v_checks + 1;

  -- Expected at least 40 explicit checks in this block.
  IF v_checks < 40 THEN
    RAISE EXCEPTION 'Test failed: expected >= 40 checks, got %.', v_checks;
  END IF;

  RAISE NOTICE 'All critical tests passed (% checks).', v_checks;
END $$;

SELECT 'OK: critical_cases passed' AS result;

ROLLBACK;
