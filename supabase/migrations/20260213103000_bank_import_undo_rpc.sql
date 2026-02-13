-- Undo for bank-imported payments (safe rollback of single posting)

begin;

create or replace function public.undo_bank_import_payment(
  p_payment_id uuid
) returns void
language plpgsql
security definer
as $$
declare
  v_payment public.payments%rowtype;
begin
  if p_payment_id is null then
    raise exception 'Payment-ID fehlt.';
  end if;

  select *
    into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Zahlung nicht gefunden: %', p_payment_id;
  end if;

  if coalesce(v_payment.method, '') <> 'Bankimport'
     or coalesce(upper(v_payment.note), '') not like 'BANKCSV|%' then
    raise exception 'Undo nur fuer Bankimport-Zahlungen erlaubt.';
  end if;

  delete from public.payments
  where id = v_payment.id;

  perform public.recalculate_order_payment_status(v_payment.order_id, now());

  perform public.log_audit_event(
    'payment.bankimport.undo',
    'orders',
    v_payment.order_id,
    jsonb_build_object(
      'payment_id', v_payment.id,
      'amount', v_payment.amount,
      'method', v_payment.method,
      'paid_at', v_payment.paid_at,
      'note', coalesce(v_payment.note, '')
    )
  );
end;
$$;

commit;
