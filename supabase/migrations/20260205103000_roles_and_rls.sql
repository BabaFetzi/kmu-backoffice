-- Roles + role-based RLS

begin;

-- 1) Roles enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM (
      'admin',
      'einkauf',
      'lager',
      'buchhaltung',
      'read_only'
    );
  END IF;
END $$;

-- 2) User roles
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles(role);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3) Role helpers
CREATE OR REPLACE FUNCTION public.has_role(p_role public.app_role) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = p_role
  );
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(p_roles public.app_role[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY (p_roles)
  );
$$;

-- 4) user_roles policies
DROP POLICY IF EXISTS user_roles_select_own ON public.user_roles;
CREATE POLICY user_roles_select_own ON public.user_roles
FOR SELECT USING (user_id = auth.uid() OR public.has_role('admin'));

DROP POLICY IF EXISTS user_roles_insert_admin ON public.user_roles;
CREATE POLICY user_roles_insert_admin ON public.user_roles
FOR INSERT WITH CHECK (public.has_role('admin'));

DROP POLICY IF EXISTS user_roles_delete_admin ON public.user_roles;
CREATE POLICY user_roles_delete_admin ON public.user_roles
FOR DELETE USING (public.has_role('admin'));

-- 5) Admin + read-only select policies (company-wide)
-- Customers
DROP POLICY IF EXISTS customers_select_roles ON public.customers;
CREATE POLICY customers_select_roles ON public.customers
FOR SELECT USING (public.has_any_role(ARRAY['admin','read_only','buchhaltung','einkauf','lager']::public.app_role[]));

DROP POLICY IF EXISTS customers_admin_write ON public.customers;
CREATE POLICY customers_admin_write ON public.customers
FOR INSERT WITH CHECK (public.has_role('admin'));
CREATE POLICY customers_admin_update ON public.customers
FOR UPDATE USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE POLICY customers_admin_delete ON public.customers
FOR DELETE USING (public.has_role('admin'));

-- Items
DROP POLICY IF EXISTS items_select_roles ON public.items;
CREATE POLICY items_select_roles ON public.items
FOR SELECT USING (public.has_any_role(ARRAY['admin','read_only','einkauf','lager','buchhaltung']::public.app_role[]));

DROP POLICY IF EXISTS items_admin_write ON public.items;
CREATE POLICY items_admin_write ON public.items
FOR INSERT WITH CHECK (public.has_role('admin'));
CREATE POLICY items_admin_update ON public.items
FOR UPDATE USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE POLICY items_admin_delete ON public.items
FOR DELETE USING (public.has_role('admin'));

-- Suppliers
DROP POLICY IF EXISTS suppliers_select_roles ON public.suppliers;
CREATE POLICY suppliers_select_roles ON public.suppliers
FOR SELECT USING (public.has_any_role(ARRAY['admin','read_only','einkauf','buchhaltung']::public.app_role[]));

DROP POLICY IF EXISTS suppliers_admin_write ON public.suppliers;
CREATE POLICY suppliers_admin_write ON public.suppliers
FOR INSERT WITH CHECK (public.has_role('admin'));
CREATE POLICY suppliers_admin_update ON public.suppliers
FOR UPDATE USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE POLICY suppliers_admin_delete ON public.suppliers
FOR DELETE USING (public.has_role('admin'));

-- Supplier items (prices)
DROP POLICY IF EXISTS supplier_items_select_roles ON public.supplier_items;
CREATE POLICY supplier_items_select_roles ON public.supplier_items
FOR SELECT USING (public.has_any_role(ARRAY['admin','read_only','einkauf','buchhaltung']::public.app_role[]));

DROP POLICY IF EXISTS supplier_items_admin_write ON public.supplier_items;
CREATE POLICY supplier_items_admin_write ON public.supplier_items
FOR INSERT WITH CHECK (public.has_role('admin'));
CREATE POLICY supplier_items_admin_update ON public.supplier_items
FOR UPDATE USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE POLICY supplier_items_admin_delete ON public.supplier_items
FOR DELETE USING (public.has_role('admin'));

-- Orders
DROP POLICY IF EXISTS orders_select_roles ON public.orders;
CREATE POLICY orders_select_roles ON public.orders
FOR SELECT USING (public.has_any_role(ARRAY['admin','read_only','buchhaltung','einkauf','lager']::public.app_role[]));

DROP POLICY IF EXISTS orders_admin_write ON public.orders;
CREATE POLICY orders_admin_write ON public.orders
FOR INSERT WITH CHECK (public.has_role('admin'));
CREATE POLICY orders_admin_update ON public.orders
FOR UPDATE USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE POLICY orders_admin_delete ON public.orders
FOR DELETE USING (public.has_role('admin'));

-- Order lines
DROP POLICY IF EXISTS order_lines_select_roles ON public.order_lines;
CREATE POLICY order_lines_select_roles ON public.order_lines
FOR SELECT USING (public.has_any_role(ARRAY['admin','read_only','buchhaltung','einkauf','lager']::public.app_role[]));

DROP POLICY IF EXISTS order_lines_admin_write ON public.order_lines;
CREATE POLICY order_lines_admin_write ON public.order_lines
FOR INSERT WITH CHECK (public.has_role('admin'));
CREATE POLICY order_lines_admin_update ON public.order_lines
FOR UPDATE USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE POLICY order_lines_admin_delete ON public.order_lines
FOR DELETE USING (public.has_role('admin'));

-- Purchases
DROP POLICY IF EXISTS purchase_orders_select_roles ON public.purchase_orders;
CREATE POLICY purchase_orders_select_roles ON public.purchase_orders
FOR SELECT USING (public.has_any_role(ARRAY['admin','read_only','einkauf','lager','buchhaltung']::public.app_role[]));

DROP POLICY IF EXISTS purchase_orders_admin_write ON public.purchase_orders;
CREATE POLICY purchase_orders_admin_write ON public.purchase_orders
FOR INSERT WITH CHECK (public.has_role('admin'));
CREATE POLICY purchase_orders_admin_update ON public.purchase_orders
FOR UPDATE USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE POLICY purchase_orders_admin_delete ON public.purchase_orders
FOR DELETE USING (public.has_role('admin'));

-- Purchase lines
DROP POLICY IF EXISTS purchase_order_lines_select_roles ON public.purchase_order_lines;
CREATE POLICY purchase_order_lines_select_roles ON public.purchase_order_lines
FOR SELECT USING (public.has_any_role(ARRAY['admin','read_only','einkauf','lager','buchhaltung']::public.app_role[]));

DROP POLICY IF EXISTS purchase_order_lines_admin_write ON public.purchase_order_lines;
CREATE POLICY purchase_order_lines_admin_write ON public.purchase_order_lines
FOR INSERT WITH CHECK (public.has_role('admin'));
CREATE POLICY purchase_order_lines_admin_update ON public.purchase_order_lines
FOR UPDATE USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));
CREATE POLICY purchase_order_lines_admin_delete ON public.purchase_order_lines
FOR DELETE USING (public.has_role('admin'));

-- Stock movements (read-only for roles)
DROP POLICY IF EXISTS stock_movements_select_roles ON public.stock_movements;
CREATE POLICY stock_movements_select_roles ON public.stock_movements
FOR SELECT USING (public.has_any_role(ARRAY['admin','read_only','buchhaltung','lager']::public.app_role[]));

-- Tasks (allow roles to see all)
DROP POLICY IF EXISTS tasks_select_roles ON public.tasks;
CREATE POLICY tasks_select_roles ON public.tasks
FOR SELECT USING (public.has_any_role(ARRAY['admin','read_only','einkauf','lager','buchhaltung']::public.app_role[]));

-- Audit log (read for roles)
DROP POLICY IF EXISTS audit_log_select_roles ON public.audit_log;
CREATE POLICY audit_log_select_roles ON public.audit_log
FOR SELECT USING (public.has_any_role(ARRAY['admin','read_only','buchhaltung','lager']::public.app_role[]));

commit;
