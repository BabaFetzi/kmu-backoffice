-- Document immutability for issued invoices/credit notes

begin;

CREATE OR REPLACE FUNCTION public.guard_document_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.invoice_no IS NOT NULL OR OLD.credit_note_no IS NOT NULL) THEN
    IF current_setting('app.allow_document_update', true) IS DISTINCT FROM '1' THEN
      RAISE EXCEPTION 'Beleg ist fixiert und darf nicht mehr geändert werden.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_document_update ON public.orders;
CREATE TRIGGER trg_guard_document_update
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_document_update();

CREATE OR REPLACE FUNCTION public.guard_document_delete() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (OLD.invoice_no IS NOT NULL OR OLD.credit_note_no IS NOT NULL) THEN
    RAISE EXCEPTION 'Beleg ist fixiert und darf nicht gelöscht werden.';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_document_delete ON public.orders;
CREATE TRIGGER trg_guard_document_delete
BEFORE DELETE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_document_delete();

CREATE OR REPLACE FUNCTION public.guard_document_line_update() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_order record;
BEGIN
  SELECT invoice_no, credit_note_no INTO v_order
  FROM public.orders
  WHERE id = COALESCE(NEW.order_id, OLD.order_id);

  IF v_order.invoice_no IS NOT NULL OR v_order.credit_note_no IS NOT NULL THEN
    RAISE EXCEPTION 'Beleg ist fixiert; Positionen dürfen nicht geändert werden.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_document_line_update ON public.order_lines;
CREATE TRIGGER trg_guard_document_line_update
BEFORE UPDATE OR DELETE ON public.order_lines
FOR EACH ROW
EXECUTE FUNCTION public.guard_document_line_update();

commit;
