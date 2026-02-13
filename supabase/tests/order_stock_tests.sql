-- Minimal SQL test suite for order/stock workflow
-- Run inside a transaction and rollback at the end.

BEGIN;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

DO $$
DECLARE
  v_item uuid;
  v_order uuid;
  v_line uuid;
  v_order2 uuid;
  v_line2 uuid;
  v_order3 uuid;
  v_line3 uuid;
  v_count int;
  v_stock numeric;
  v_status text;
  v_move uuid;
BEGIN
  -- Setup item + initial stock (10)
  INSERT INTO public.items (item_no, name, unit, price, current_stock, status, tags)
  VALUES ('T-001', 'Test Item', 'pcs', 10, 0, 'active', '{}')
  RETURNING id INTO v_item;

  INSERT INTO public.stock_movements (item_id, movement_type, qty, unit, reason_code, notes)
  VALUES (v_item, 'in', 10, 'pcs', 'correction', 'init stock');

  SELECT current_stock INTO v_stock FROM public.items WHERE id = v_item;
  IF v_stock <> 10 THEN
    RAISE EXCEPTION 'Test 1 failed: initial stock expected 10, got %', v_stock;
  END IF;

  -- Order 1: finalize books once
  INSERT INTO public.orders (status, total_chf) VALUES ('open', 0) RETURNING id INTO v_order;
  INSERT INTO public.order_lines (order_id, item_id, qty, price_chf, unit)
  VALUES (v_order, v_item, 5, 10, 'pcs')
  RETURNING id INTO v_line;

  PERFORM public.finalize_order(v_order);

  SELECT count(*) INTO v_count FROM public.stock_movements WHERE booking_key = 'sale:' || v_line;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Test 2 failed: expected 1 sale movement, got %', v_count;
  END IF;

  SELECT current_stock INTO v_stock FROM public.items WHERE id = v_item;
  IF v_stock <> 5 THEN
    RAISE EXCEPTION 'Test 3 failed: stock expected 5 after sale, got %', v_stock;
  END IF;

  -- Double finalize should error and not double book
  BEGIN
    PERFORM public.finalize_order(v_order);
    RAISE EXCEPTION 'Test 4 failed: second finalize should error';
  EXCEPTION WHEN OTHERS THEN
    -- ok
  END;

  SELECT count(*) INTO v_count FROM public.stock_movements WHERE booking_key = 'sale:' || v_line;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Test 5 failed: sale movement duplicated';
  END IF;

  -- Partial return (2)
  v_move := public.book_return(v_line, 2, 'partial return');
  IF v_move IS NULL THEN
    RAISE EXCEPTION 'Test 6 failed: return movement id null';
  END IF;

  SELECT current_stock INTO v_stock FROM public.items WHERE id = v_item;
  IF v_stock <> 7 THEN
    RAISE EXCEPTION 'Test 7 failed: stock expected 7 after partial return, got %', v_stock;
  END IF;

  -- Full return remaining (3)
  PERFORM public.book_return(v_line, 3, 'final return');
  SELECT current_stock INTO v_stock FROM public.items WHERE id = v_item;
  IF v_stock <> 10 THEN
    RAISE EXCEPTION 'Test 8 failed: stock expected 10 after full return, got %', v_stock;
  END IF;

  -- Over-return should error
  BEGIN
    PERFORM public.book_return(v_line, 1, 'over return');
    RAISE EXCEPTION 'Test 9 failed: over-return should error';
  EXCEPTION WHEN OTHERS THEN
    -- ok
  END;

  -- Cancel order only when open, no movement
  INSERT INTO public.orders (status, total_chf) VALUES ('open', 0) RETURNING id INTO v_order2;
  INSERT INTO public.order_lines (order_id, item_id, qty, price_chf, unit)
  VALUES (v_order2, v_item, 1, 10, 'pcs') RETURNING id INTO v_line2;

  PERFORM public.cancel_order(v_order2);

  SELECT status::text INTO v_status FROM public.orders WHERE id = v_order2;
  IF v_status <> 'storno' THEN
    RAISE EXCEPTION 'Test 10 failed: cancel did not set status storno';
  END IF;

  SELECT count(*) INTO v_count FROM public.stock_movements WHERE order_id = v_order2;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'Test 11 failed: cancel should not create movements';
  END IF;

  -- Cancel order when done should error
  INSERT INTO public.orders (status, total_chf) VALUES ('open', 0) RETURNING id INTO v_order3;
  INSERT INTO public.order_lines (order_id, item_id, qty, price_chf, unit)
  VALUES (v_order3, v_item, 1, 10, 'pcs') RETURNING id INTO v_line3;
  PERFORM public.finalize_order(v_order3);

  BEGIN
    PERFORM public.cancel_order(v_order3);
    RAISE EXCEPTION 'Test 12 failed: cancel on done should error';
  EXCEPTION WHEN OTHERS THEN
    -- ok
  END;

  -- Editing order lines after DONE should error
  BEGIN
    UPDATE public.order_lines SET qty = 2 WHERE id = v_line3;
    RAISE EXCEPTION 'Test 13 failed: order line edit after DONE should error';
  EXCEPTION WHEN OTHERS THEN
    -- ok
  END;
END $$;

ROLLBACK;
