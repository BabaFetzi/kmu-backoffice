-- Tasks module with user assignment

begin;

-- 1) App users (from auth)
CREATE TABLE IF NOT EXISTS public.app_users (
  id uuid PRIMARY KEY DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  email text
);

DROP TRIGGER IF EXISTS trg_app_users_updated_at ON public.app_users;
CREATE TRIGGER trg_app_users_updated_at
BEFORE UPDATE ON public.app_users
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_users_select_all ON public.app_users;
CREATE POLICY app_users_select_all ON public.app_users
FOR SELECT USING (true);

DROP POLICY IF EXISTS app_users_insert_own ON public.app_users;
CREATE POLICY app_users_insert_own ON public.app_users
FOR INSERT WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS app_users_update_own ON public.app_users;
CREATE POLICY app_users_update_own ON public.app_users
FOR UPDATE USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- 2) Tasks
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL DEFAULT auth.uid(),

  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open',
  due_date date,

  assigned_to uuid,
  order_id uuid,
  item_id uuid,
  supplier_id uuid,
  customer_id uuid,
  purchase_order_id uuid
);

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_status_check,
  ADD CONSTRAINT tasks_status_check
  CHECK (status = ANY (ARRAY['open','in_progress','done']));

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_assigned_fk,
  ADD CONSTRAINT tasks_assigned_fk FOREIGN KEY (assigned_to) REFERENCES public.app_users(id) ON DELETE SET NULL;

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_order_fk,
  ADD CONSTRAINT tasks_order_fk FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL;

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_item_fk,
  ADD CONSTRAINT tasks_item_fk FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE SET NULL;

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_supplier_fk,
  ADD CONSTRAINT tasks_supplier_fk FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_customer_fk,
  ADD CONSTRAINT tasks_customer_fk FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_po_fk,
  ADD CONSTRAINT tasks_po_fk FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks(due_date);

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON public.tasks;
CREATE TRIGGER trg_tasks_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tasks_select_own ON public.tasks;
CREATE POLICY tasks_select_own ON public.tasks
FOR SELECT USING (created_by = auth.uid() OR assigned_to = auth.uid());

DROP POLICY IF EXISTS tasks_insert_own ON public.tasks;
CREATE POLICY tasks_insert_own ON public.tasks
FOR INSERT WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS tasks_update_own ON public.tasks;
CREATE POLICY tasks_update_own ON public.tasks
FOR UPDATE USING (created_by = auth.uid() OR assigned_to = auth.uid())
WITH CHECK (created_by = auth.uid() OR assigned_to = auth.uid());

DROP POLICY IF EXISTS tasks_delete_own ON public.tasks;
CREATE POLICY tasks_delete_own ON public.tasks
FOR DELETE USING (created_by = auth.uid());

commit;
