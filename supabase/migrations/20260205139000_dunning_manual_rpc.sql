-- Manual dunning RPC with transactional log entry

begin;

create or replace function public.bump_dunning_level(
  p_order_id uuid,
  p_note text default null,
  p_max_level int default 3
) returns int
language plpgsql
security definer
as $$
declare
  v_order record;
  v_next int;
  v_note text;
begin
  select *
    into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order nicht gefunden: %', p_order_id;
  end if;

  if v_order.document_type = 'credit_note' then
    raise exception 'Mahnung nur fuer Rechnungen erlaubt.';
  end if;

  if coalesce(v_order.document_archived, false) then
    raise exception 'Archivierte Belege koennen nicht gemahnt werden.';
  end if;

  if v_order.payment_status = 'paid' then
    raise exception 'Beleg ist bereits bezahlt.';
  end if;

  v_next := least(greatest(coalesce(p_max_level, 3), 1), coalesce(v_order.dunning_level, 0) + 1);
  v_note := nullif(trim(coalesce(p_note, '')), '');

  -- Guard trigger for fixed documents allows updates only with this flag.
  perform set_config('app.allow_document_update', '1', true);

  update public.orders
     set dunning_level = v_next,
         dunning_last_at = now(),
         dunning_note = coalesce(v_note, dunning_note)
   where id = p_order_id;

  insert into public.dunning_log(order_id, created_by, level, note)
  values (
    p_order_id,
    coalesce(auth.uid(), v_order.created_by),
    v_next,
    coalesce(v_note, format('Mahnstufe manuell auf L%s gesetzt', v_next))
  );

  perform public.log_audit_event(
    'document.dunning_level_up',
    'orders',
    p_order_id,
    jsonb_build_object('level', v_next, 'note', coalesce(v_note, ''))
  );

  return v_next;
end;
$$;

commit;
