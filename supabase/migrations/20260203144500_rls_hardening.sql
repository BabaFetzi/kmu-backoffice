-- RLS hardening for workflow safety

begin;

-- Ensure RLS enabled on new returns table
ALTER TABLE public.order_line_returns ENABLE ROW LEVEL SECURITY;

-- Policies for order_line_returns
DROP POLICY IF EXISTS order_line_returns_select_own ON public.order_line_returns;
CREATE POLICY order_line_returns_select_own
  ON public.order_line_returns
  FOR SELECT
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS order_line_returns_insert_own ON public.order_line_returns;
CREATE POLICY order_line_returns_insert_own
  ON public.order_line_returns
  FOR INSERT
  WITH CHECK (created_by = auth.uid());

-- No update/delete for returns from client
DROP POLICY IF EXISTS order_line_returns_update_own ON public.order_line_returns;
DROP POLICY IF EXISTS order_line_returns_delete_own ON public.order_line_returns;

-- Orders: require server-side flag for any update
DROP POLICY IF EXISTS orders_update_own ON public.orders;
CREATE POLICY orders_update_own
  ON public.orders
  FOR UPDATE
  USING (created_by = auth.uid() AND current_setting('app.allow_order_status_update', true) = '1')
  WITH CHECK (created_by = auth.uid() AND current_setting('app.allow_order_status_update', true) = '1');

-- Stock movements: immutable from client (insert + select only)
DROP POLICY IF EXISTS stock_movements_update_own ON public.stock_movements;
DROP POLICY IF EXISTS stock_movements_delete_own ON public.stock_movements;

commit;
