-- Demo seed: customers + orders with mixed lifecycle states
-- Safe to run multiple times (idempotent by seed keys in notes).

BEGIN;

DO $$
DECLARE
  v_user uuid;
  v_customer_a uuid;
  v_customer_b uuid;
  v_customer_c uuid;
  v_customer_d uuid;
  v_item_1 uuid;
  v_item_2 uuid;
  v_item_3 uuid;
  v_order uuid;
  v_line uuid;
BEGIN
  -- 1) Pick one existing app user as owner
  SELECT id
    INTO v_user
  FROM public.app_users
  ORDER BY created_at
  LIMIT 1;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Kein User in public.app_users gefunden.';
  END IF;

   -- 2) Simulate authenticated context for auth.uid() checks in RPCs
   PERFORM set_config('request.jwt.claim.sub', v_user::text, true);
   PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
   -- Allow controlled updates on fixed documents for lifecycle RPCs in this seed run.
   PERFORM set_config('app.allow_document_update', '1', true);

  -- 3) Ensure company profile exists for finalize_order()
  INSERT INTO public.company_profile (
    created_by, legal_name, trading_name, street, zip, city, country, vat_uid, iban, bank_name, email, phone
  )
  VALUES (
    v_user, 'Backoffice Praxisfirma AG', 'Backoffice', 'Musterstrasse 10', '7310', 'Bad Ragaz', 'CH',
    'CHE-000.000.000 MWST', 'CH9300000000000000000', 'Demo Bank', 'office@example.ch', '+41 81 000 00 00'
  )
  ON CONFLICT (created_by) DO UPDATE
  SET legal_name = EXCLUDED.legal_name,
      trading_name = EXCLUDED.trading_name,
      street = EXCLUDED.street,
      zip = EXCLUDED.zip,
      city = EXCLUDED.city,
      country = EXCLUDED.country,
      vat_uid = EXCLUDED.vat_uid,
      iban = EXCLUDED.iban,
      bank_name = EXCLUDED.bank_name,
      email = EXCLUDED.email,
      phone = EXCLUDED.phone;

  -- 4) Customers (upsert-like by company_name + created_by)
  INSERT INTO public.customers (owner_id, created_by, company_name, contact_name, email, phone, street, zip, city, country, status, notes)
  SELECT v_user, v_user, 'Alpenwerk GmbH', 'Nina Meier', 'info@alpenwerk.ch', '+41 44 111 11 11', 'Werkstrasse 2', '8005', 'Zürich', 'CH', 'active', '[SEED:DEMO:CUSTOMER:A]'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.customers c WHERE c.created_by = v_user AND c.company_name = 'Alpenwerk GmbH'
  );

  INSERT INTO public.customers (owner_id, created_by, company_name, contact_name, email, phone, street, zip, city, country, status, notes)
  SELECT v_user, v_user, 'RheinTech AG', 'Luca Frei', 'finance@rheintech.ch', '+41 71 222 22 22', 'Industriestrasse 8', '9000', 'St. Gallen', 'CH', 'active', '[SEED:DEMO:CUSTOMER:B]'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.customers c WHERE c.created_by = v_user AND c.company_name = 'RheinTech AG'
  );

  INSERT INTO public.customers (owner_id, created_by, company_name, contact_name, email, phone, street, zip, city, country, status, notes)
  SELECT v_user, v_user, 'Seehandel KLG', 'Mara Kohler', 'office@seehandel.ch', '+41 41 333 33 33', 'Seegasse 5', '6003', 'Luzern', 'CH', 'active', '[SEED:DEMO:CUSTOMER:C]'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.customers c WHERE c.created_by = v_user AND c.company_name = 'Seehandel KLG'
  );

  INSERT INTO public.customers (owner_id, created_by, company_name, contact_name, email, phone, street, zip, city, country, status, notes)
  SELECT v_user, v_user, 'Nordlicht Services', 'Jonas Brunner', 'team@nordlicht.ch', '+41 31 444 44 44', 'Marktplatz 12', '3011', 'Bern', 'CH', 'active', '[SEED:DEMO:CUSTOMER:D]'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.customers c WHERE c.created_by = v_user AND c.company_name = 'Nordlicht Services'
  );

  SELECT id INTO v_customer_a FROM public.customers WHERE created_by = v_user AND company_name = 'Alpenwerk GmbH' LIMIT 1;
  SELECT id INTO v_customer_b FROM public.customers WHERE created_by = v_user AND company_name = 'RheinTech AG' LIMIT 1;
  SELECT id INTO v_customer_c FROM public.customers WHERE created_by = v_user AND company_name = 'Seehandel KLG' LIMIT 1;
  SELECT id INTO v_customer_d FROM public.customers WHERE created_by = v_user AND company_name = 'Nordlicht Services' LIMIT 1;

  -- 5) Reuse existing items; create fallback items if there are too few
  SELECT id INTO v_item_1 FROM public.items WHERE COALESCE(status, 'active') = 'active' ORDER BY created_at LIMIT 1;
  SELECT id INTO v_item_2 FROM public.items WHERE COALESCE(status, 'active') = 'active' ORDER BY created_at OFFSET 1 LIMIT 1;
  SELECT id INTO v_item_3 FROM public.items WHERE COALESCE(status, 'active') = 'active' ORDER BY created_at OFFSET 2 LIMIT 1;

  IF v_item_1 IS NULL THEN
    INSERT INTO public.items (created_by, name, item_no, category, unit, price, purchase_price, current_stock, status, notes)
    VALUES (v_user, 'Demo Artikel A', 'DEMO-A', 'Elektronik', 'pcs', 49.00, 30.00, 200, 'active', '[SEED:DEMO:ITEM:A]')
    RETURNING id INTO v_item_1;
  END IF;

  IF v_item_2 IS NULL THEN
    INSERT INTO public.items (created_by, name, item_no, category, unit, price, purchase_price, current_stock, status, notes)
    VALUES (v_user, 'Demo Artikel B', 'DEMO-B', 'Elektronik', 'pcs', 79.00, 52.00, 200, 'active', '[SEED:DEMO:ITEM:B]')
    RETURNING id INTO v_item_2;
  END IF;

  IF v_item_3 IS NULL THEN
    INSERT INTO public.items (created_by, name, item_no, category, unit, price, purchase_price, current_stock, status, notes)
    VALUES (v_user, 'Demo Artikel C', 'DEMO-C', 'Elektronik', 'pcs', 129.00, 90.00, 200, 'active', '[SEED:DEMO:ITEM:C]')
    RETURNING id INTO v_item_3;
  END IF;

  UPDATE public.items
  SET current_stock = GREATEST(COALESCE(current_stock, 0), 300),
      price = GREATEST(COALESCE(price, 0), 10),
      purchase_price = GREATEST(COALESCE(purchase_price, 0), 5)
  WHERE id IN (v_item_1, v_item_2, v_item_3);

  -- 6) OPEN order
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE notes = '[SEED:DEMO:ORDER:OPEN]') THEN
    INSERT INTO public.orders (created_by, customer_id, status, order_date, notes)
    VALUES (v_user, v_customer_a, 'open', CURRENT_DATE - 2, '[SEED:DEMO:ORDER:OPEN]')
    RETURNING id INTO v_order;

    INSERT INTO public.order_lines (created_by, order_id, item_id, qty, price_chf, unit)
    VALUES
      (v_user, v_order, v_item_1, 3, 49.00, 'pcs'),
      (v_user, v_order, v_item_2, 1, 79.00, 'pcs');
  END IF;

  -- 7) DONE order (via RPC finalize)
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE notes = '[SEED:DEMO:ORDER:DONE]') THEN
    INSERT INTO public.orders (created_by, customer_id, status, order_date, notes)
    VALUES (v_user, v_customer_b, 'open', CURRENT_DATE - 15, '[SEED:DEMO:ORDER:DONE]')
    RETURNING id INTO v_order;

    INSERT INTO public.order_lines (created_by, order_id, item_id, qty, price_chf, unit)
    VALUES
      (v_user, v_order, v_item_1, 2, 49.00, 'pcs'),
      (v_user, v_order, v_item_3, 1, 129.00, 'pcs');

    PERFORM public.finalize_order(v_order);
  END IF;

  -- 8) RETOURE order (open -> done -> partial return)
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE notes = '[SEED:DEMO:ORDER:RETOURE]') THEN
    INSERT INTO public.orders (created_by, customer_id, status, order_date, notes)
    VALUES (v_user, v_customer_c, 'open', CURRENT_DATE - 20, '[SEED:DEMO:ORDER:RETOURE]')
    RETURNING id INTO v_order;

    INSERT INTO public.order_lines (created_by, order_id, item_id, qty, price_chf, unit)
    VALUES (v_user, v_order, v_item_2, 4, 79.00, 'pcs')
    RETURNING id INTO v_line;

    PERFORM public.finalize_order(v_order);
    PERFORM public.book_return(v_line, 1, 'Seed: Teilretoure');
  END IF;

  -- 9) STORNO order (open -> done -> storno with credit note)
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE notes = '[SEED:DEMO:ORDER:STORNO]') THEN
    INSERT INTO public.orders (created_by, customer_id, status, order_date, notes)
    VALUES (v_user, v_customer_d, 'open', CURRENT_DATE - 30, '[SEED:DEMO:ORDER:STORNO]')
    RETURNING id INTO v_order;

    INSERT INTO public.order_lines (created_by, order_id, item_id, qty, price_chf, unit)
    VALUES (v_user, v_order, v_item_3, 1, 129.00, 'pcs');

    PERFORM public.finalize_order(v_order);
    PERFORM public.cancel_order_after_done(v_order);
  END IF;

  -- 10) Additional historical done orders
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE notes = '[SEED:DEMO:ORDER:HIST-1]') THEN
    INSERT INTO public.orders (created_by, customer_id, status, order_date, notes)
    VALUES (v_user, v_customer_a, 'open', CURRENT_DATE - 45, '[SEED:DEMO:ORDER:HIST-1]')
    RETURNING id INTO v_order;

    INSERT INTO public.order_lines (created_by, order_id, item_id, qty, price_chf, unit)
    VALUES (v_user, v_order, v_item_1, 5, 49.00, 'pcs');

    PERFORM public.finalize_order(v_order);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE notes = '[SEED:DEMO:ORDER:HIST-2]') THEN
    INSERT INTO public.orders (created_by, customer_id, status, order_date, notes)
    VALUES (v_user, v_customer_b, 'open', CURRENT_DATE - 60, '[SEED:DEMO:ORDER:HIST-2]')
    RETURNING id INTO v_order;

    INSERT INTO public.order_lines (created_by, order_id, item_id, qty, price_chf, unit)
    VALUES
      (v_user, v_order, v_item_2, 2, 79.00, 'pcs'),
      (v_user, v_order, v_item_3, 2, 129.00, 'pcs');

    PERFORM public.finalize_order(v_order);
  END IF;

  RAISE NOTICE 'Seed erstellt: Kunden + Aufträge mit OPEN, DONE, RETOURE, STORNO.';
END $$;

COMMIT;
