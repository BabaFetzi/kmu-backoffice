-- MWST (VAT) basics + invoice numbering

begin;

-- 1) VAT rates catalog
CREATE TABLE IF NOT EXISTS public.vat_rates (
  code text PRIMARY KEY,
  country text NOT NULL DEFAULT 'CH',
  name text NOT NULL,
  rate numeric(6,3) NOT NULL,
  valid_from date NOT NULL,
  valid_to date
);

-- Upsert Swiss rates from 2024-01-01
INSERT INTO public.vat_rates (code, country, name, rate, valid_from, valid_to)
VALUES
  ('CH_STD', 'CH', 'Standard (8.1%)', 8.1, '2024-01-01', NULL),
  ('CH_RED', 'CH', 'Reduziert (2.6%)', 2.6, '2024-01-01', NULL),
  ('CH_ACC', 'CH', 'Beherbergung (3.8%)', 3.8, '2024-01-01', NULL),
  ('CH_ZERO', 'CH', 'Nullsatz/Export (0%)', 0.0, '2024-01-01', NULL)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    rate = EXCLUDED.rate,
    valid_from = EXCLUDED.valid_from,
    valid_to = EXCLUDED.valid_to;

-- Optional: RLS for vat_rates (read-only)
ALTER TABLE public.vat_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vat_rates_select_all ON public.vat_rates;
CREATE POLICY vat_rates_select_all ON public.vat_rates FOR SELECT USING (true);

-- 2) Items: VAT code
ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS vat_code text DEFAULT 'CH_STD' NOT NULL;

-- 3) Orders: invoice numbering + VAT totals
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS invoice_no text,
  ADD COLUMN IF NOT EXISTS invoice_date date,
  ADD COLUMN IF NOT EXISTS supply_date date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'CHF' NOT NULL,
  ADD COLUMN IF NOT EXISTS net_total numeric(12,2) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS vat_total numeric(12,2) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS gross_total numeric(12,2) DEFAULT 0 NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_invoice_no ON public.orders(invoice_no);

-- 4) Order lines: VAT amounts (calculated)
ALTER TABLE public.order_lines
  ADD COLUMN IF NOT EXISTS vat_code text,
  ADD COLUMN IF NOT EXISTS vat_rate numeric(6,3),
  ADD COLUMN IF NOT EXISTS net_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS vat_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS gross_amount numeric(12,2);

-- 5) Invoice number sequence + function
CREATE SEQUENCE IF NOT EXISTS public.invoice_no_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_invoice_no() RETURNS text
LANGUAGE sql AS $$
  select 'INV-' || lpad(nextval('public.invoice_no_seq')::text, 6, '0');
$$;

-- 6) VAT calc on order_lines
CREATE OR REPLACE FUNCTION public.set_order_line_vat() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_supply_date date;
  v_code text;
  v_rate numeric(6,3);
  v_net numeric(12,2);
  v_vat numeric(12,2);
BEGIN
  -- supply date from order
  SELECT COALESCE(o.supply_date, o.order_date, CURRENT_DATE)
    INTO v_supply_date
  FROM public.orders o
  WHERE o.id = NEW.order_id;

  -- vat code from line -> item -> default
  SELECT COALESCE(NEW.vat_code, i.vat_code, 'CH_STD')
    INTO v_code
  FROM public.items i
  WHERE i.id = NEW.item_id;

  -- rate lookup by date
  SELECT vr.rate
    INTO v_rate
  FROM public.vat_rates vr
  WHERE vr.code = v_code
    AND vr.valid_from <= v_supply_date
    AND (vr.valid_to IS NULL OR vr.valid_to >= v_supply_date)
  ORDER BY vr.valid_from DESC
  LIMIT 1;

  IF v_rate IS NULL THEN
    v_rate := 0;
  END IF;

  v_net := ROUND(COALESCE(NEW.qty,0) * COALESCE(NEW.price_chf,0), 2);
  v_vat := ROUND(v_net * (v_rate / 100.0), 2);

  NEW.vat_code := v_code;
  NEW.vat_rate := v_rate;
  NEW.net_amount := v_net;
  NEW.vat_amount := v_vat;
  NEW.gross_amount := v_net + v_vat;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_lines_vat ON public.order_lines;
CREATE TRIGGER trg_order_lines_vat
BEFORE INSERT OR UPDATE ON public.order_lines
FOR EACH ROW
EXECUTE FUNCTION public.set_order_line_vat();

-- Backfill existing lines (fires VAT trigger)
UPDATE public.order_lines ol
SET vat_code = COALESCE(ol.vat_code, i.vat_code, 'CH_STD')
FROM public.items i
WHERE i.id = ol.item_id;

-- 7) Recalculate order totals
CREATE OR REPLACE FUNCTION public.recalc_order_totals(p_order_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.orders o
  SET net_total = COALESCE(t.net_total,0),
      vat_total = COALESCE(t.vat_total,0),
      gross_total = COALESCE(t.gross_total,0),
      total_chf = COALESCE(t.gross_total,0)
  FROM (
    SELECT order_id,
           SUM(COALESCE(net_amount,0)) AS net_total,
           SUM(COALESCE(vat_amount,0)) AS vat_total,
           SUM(COALESCE(gross_amount,0)) AS gross_total
    FROM public.order_lines
    WHERE order_id = p_order_id
    GROUP BY order_id
  ) t
  WHERE o.id = p_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_recalc_order_totals() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_order_id uuid;
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);
  PERFORM public.recalc_order_totals(v_order_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_order_lines_recalc ON public.order_lines;
CREATE TRIGGER trg_order_lines_recalc
AFTER INSERT OR UPDATE OR DELETE ON public.order_lines
FOR EACH ROW
EXECUTE FUNCTION public.trg_recalc_order_totals();

-- Backfill order totals
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.orders LOOP
    PERFORM public.recalc_order_totals(r.id);
  END LOOP;
END $$;

-- 8) Issue invoice on finalize (assumption: invoice = done order)
CREATE OR REPLACE FUNCTION public.finalize_order(p_order_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_order record;
  r record;
BEGIN
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order nicht gefunden: %', p_order_id;
  END IF;

  IF v_order.status <> 'open' THEN
    RAISE EXCEPTION 'Order muss OPEN sein (aktuell: %).', v_order.status;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.order_lines WHERE order_id = p_order_id) THEN
    RAISE EXCEPTION 'Order % hat keine Positionen.', v_order.order_no;
  END IF;

  -- Bestand prüfen
  FOR r IN
    SELECT ol.item_id, ol.qty, i.current_stock, i.name
    FROM public.order_lines ol
    JOIN public.items i ON i.id = ol.item_id
    WHERE ol.order_id = p_order_id
    FOR UPDATE OF i
  LOOP
    IF r.qty IS NULL OR r.qty <= 0 THEN
      RAISE EXCEPTION 'Ungültige Menge in Order % (Item %).', v_order.order_no, r.name;
    END IF;

    IF COALESCE(r.current_stock,0) < r.qty THEN
      RAISE EXCEPTION 'Nicht genug Bestand für "%": verfügbar %, benötigt % (Order %).',
        r.name, COALESCE(r.current_stock,0), r.qty, v_order.order_no;
    END IF;
  END LOOP;

  INSERT INTO public.stock_movements (
    item_id,
    movement_type,
    qty,
    unit,
    reason_code,
    booking_key,
    order_id,
    order_line_id,
    notes,
    created_by
  )
  SELECT
    ol.item_id,
    'out',
    ol.qty,
    COALESCE(ol.unit, 'pcs'),
    'sale',
    'sale:' || ol.id,
    v_order.id,
    ol.id,
    COALESCE(v_order.notes,''),
    v_order.created_by
  FROM public.order_lines ol
  WHERE ol.order_id = p_order_id
  ON CONFLICT (booking_key) DO NOTHING;

  -- ensure totals
  PERFORM public.recalc_order_totals(p_order_id);

  PERFORM set_config('app.allow_order_status_update', '1', true);

  UPDATE public.orders
  SET status = 'done',
      stock_applied = true,
      invoice_date = COALESCE(invoice_date, CURRENT_DATE),
      invoice_no = COALESCE(invoice_no, public.generate_invoice_no()),
      supply_date = COALESCE(supply_date, order_date, CURRENT_DATE)
  WHERE id = p_order_id;
END;
$$;

commit;
