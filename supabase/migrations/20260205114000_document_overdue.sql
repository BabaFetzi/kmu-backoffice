-- Mark overdue invoices based on due_date

begin;

CREATE OR REPLACE FUNCTION public.mark_overdue_invoices() RETURNS int
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE public.orders
  SET payment_status = 'overdue'
  WHERE payment_status = 'open'
    AND due_date IS NOT NULL
    AND due_date < CURRENT_DATE;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

commit;
