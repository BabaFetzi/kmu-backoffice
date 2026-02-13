drop extension if exists "pg_net";

create sequence "public"."order_no_seq";


  create table "public"."customers" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "owner_id" uuid not null default auth.uid(),
    "company_name" text not null,
    "contact_name" text,
    "email" text,
    "phone" text,
    "notes" text,
    "status" text not null default 'active'::text,
    "tags" text[] not null default '{}'::text[],
    "created_by" uuid default auth.uid(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."customers" enable row level security;


  create table "public"."items" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid not null default auth.uid(),
    "item_no" text,
    "name" text not null,
    "category" text,
    "unit" text not null default 'pcs'::text,
    "price" numeric(12,2),
    "current_stock" numeric(12,2) not null default 0,
    "status" text not null default 'active'::text,
    "tags" text[] not null default '{}'::text[],
    "notes" text
      );


alter table "public"."items" enable row level security;


  create table "public"."items__backup_20260202_113118" (
    "id" uuid,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "created_by" uuid,
    "item_no" text,
    "name" text,
    "category" text,
    "unit" text,
    "price" numeric(12,2),
    "current_stock" numeric(12,2),
    "status" text,
    "tags" text[],
    "notes" text
      );



  create table "public"."items__backup_20260202_123905" (
    "id" uuid,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "created_by" uuid,
    "item_no" text,
    "name" text,
    "category" text,
    "unit" text,
    "price" numeric(12,2),
    "current_stock" numeric(12,2),
    "status" text,
    "tags" text[],
    "notes" text
      );



  create table "public"."order_lines" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid not null default auth.uid(),
    "order_id" uuid not null,
    "item_id" uuid not null,
    "qty" numeric not null,
    "price_chf" numeric not null default 0,
    "unit" text default 'pcs'::text
      );


alter table "public"."order_lines" enable row level security;


  create table "public"."order_lines__backup_20260202_113118" (
    "id" uuid,
    "created_at" timestamp with time zone,
    "created_by" uuid,
    "order_id" uuid,
    "item_id" uuid,
    "qty" numeric,
    "price_chf" numeric
      );



  create table "public"."order_lines__backup_20260202_123905" (
    "id" uuid,
    "created_at" timestamp with time zone,
    "created_by" uuid,
    "order_id" uuid,
    "item_id" uuid,
    "qty" numeric,
    "price_chf" numeric
      );



  create table "public"."order_lines__backup_20260202_160752" (
    "id" uuid,
    "created_at" timestamp with time zone,
    "created_by" uuid,
    "order_id" uuid,
    "item_id" uuid,
    "qty" numeric,
    "price_chf" numeric
      );



  create table "public"."orders" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "created_by" uuid not null default auth.uid(),
    "order_no" text not null default public.generate_order_no(),
    "status" text not null default 'open'::text,
    "customer_id" uuid,
    "order_date" date not null default CURRENT_DATE,
    "notes" text,
    "total_chf" numeric not null default 0,
    "stock_applied" boolean not null default false,
    "stock_reversed" boolean not null default false
      );


alter table "public"."orders" enable row level security;


  create table "public"."orders__backup_20260202_113118" (
    "id" uuid,
    "created_at" timestamp with time zone,
    "created_by" uuid,
    "order_no" text,
    "status" text,
    "customer_id" uuid,
    "order_date" date,
    "notes" text,
    "total_chf" numeric,
    "stock_applied" boolean
      );



  create table "public"."orders__backup_20260202_123905" (
    "id" uuid,
    "created_at" timestamp with time zone,
    "created_by" uuid,
    "order_no" text,
    "status" text,
    "customer_id" uuid,
    "order_date" date,
    "notes" text,
    "total_chf" numeric,
    "stock_applied" boolean,
    "stock_reversed" boolean
      );



  create table "public"."orders__backup_20260202_160752" (
    "id" uuid,
    "created_at" timestamp with time zone,
    "created_by" uuid,
    "order_no" text,
    "status" text,
    "customer_id" uuid,
    "order_date" date,
    "notes" text,
    "total_chf" numeric,
    "stock_applied" boolean,
    "stock_reversed" boolean
      );



  create table "public"."stock_movements" (
    "id" uuid not null default gen_random_uuid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid not null default auth.uid(),
    "item_id" uuid not null,
    "movement_type" text not null,
    "qty" numeric(12,2) not null,
    "unit" text not null default 'pcs'::text,
    "reason" text,
    "reference" text,
    "notes" text,
    "delta_qty" numeric,
    "order_id" uuid,
    "order_line_id" uuid
      );


alter table "public"."stock_movements" enable row level security;


  create table "public"."stock_movements__backup_20260202_113118" (
    "id" uuid,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "created_by" uuid,
    "item_id" uuid,
    "movement_type" text,
    "qty" numeric(12,2),
    "unit" text,
    "reason" text,
    "reference" text,
    "notes" text,
    "delta_qty" numeric
      );



  create table "public"."stock_movements__backup_20260202_123905" (
    "id" uuid,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "created_by" uuid,
    "item_id" uuid,
    "movement_type" text,
    "qty" numeric(12,2),
    "unit" text,
    "reason" text,
    "reference" text,
    "notes" text,
    "delta_qty" numeric,
    "order_id" uuid,
    "order_line_id" uuid
      );



  create table "public"."stock_movements__backup_20260202_160752" (
    "id" uuid,
    "created_at" timestamp with time zone,
    "updated_at" timestamp with time zone,
    "created_by" uuid,
    "item_id" uuid,
    "movement_type" text,
    "qty" numeric(12,2),
    "unit" text,
    "reason" text,
    "reference" text,
    "notes" text,
    "delta_qty" numeric,
    "order_id" uuid,
    "order_line_id" uuid
      );


CREATE INDEX customers_created_at_idx ON public.customers USING btree (created_at DESC);

CREATE INDEX customers_email_idx ON public.customers USING btree (email);

CREATE UNIQUE INDEX customers_pkey ON public.customers USING btree (id);

CREATE INDEX customers_status_idx ON public.customers USING btree (status);

CREATE INDEX idx_order_lines_item ON public.order_lines USING btree (item_id);

CREATE INDEX idx_order_lines_order ON public.order_lines USING btree (order_id);

CREATE INDEX idx_orders_created_by ON public.orders USING btree (created_by);

CREATE INDEX idx_orders_customer ON public.orders USING btree (customer_id);

CREATE INDEX idx_orders_status ON public.orders USING btree (status);

CREATE INDEX idx_stock_movements_reference ON public.stock_movements USING btree (reference);

CREATE INDEX items_created_by_idx ON public.items USING btree (created_by);

CREATE UNIQUE INDEX items_created_by_item_no_unique ON public.items USING btree (created_by, item_no) WHERE ((item_no IS NOT NULL) AND (length(TRIM(BOTH FROM item_no)) > 0));

CREATE INDEX items_name_idx ON public.items USING btree (name);

CREATE UNIQUE INDEX items_pkey ON public.items USING btree (id);

CREATE INDEX items_status_idx ON public.items USING btree (status);

CREATE UNIQUE INDEX order_lines_pkey ON public.order_lines USING btree (id);

CREATE UNIQUE INDEX orders_order_no_unique ON public.orders USING btree (order_no);

CREATE UNIQUE INDEX orders_pkey ON public.orders USING btree (id);

CREATE INDEX stock_movements_created_at_idx ON public.stock_movements USING btree (created_at);

CREATE INDEX stock_movements_created_by_idx ON public.stock_movements USING btree (created_by);

CREATE INDEX stock_movements_item_idx ON public.stock_movements USING btree (item_id);

CREATE UNIQUE INDEX stock_movements_pkey ON public.stock_movements USING btree (id);

CREATE UNIQUE INDEX ux_stock_movements_out_once_per_line ON public.stock_movements USING btree (order_id, order_line_id) WHERE (movement_type = 'out'::text);

CREATE UNIQUE INDEX ux_stock_movements_out_one_per_line ON public.stock_movements USING btree (order_line_id) WHERE (movement_type = 'out'::text);

alter table "public"."customers" add constraint "customers_pkey" PRIMARY KEY using index "customers_pkey";

alter table "public"."items" add constraint "items_pkey" PRIMARY KEY using index "items_pkey";

alter table "public"."order_lines" add constraint "order_lines_pkey" PRIMARY KEY using index "order_lines_pkey";

alter table "public"."orders" add constraint "orders_pkey" PRIMARY KEY using index "orders_pkey";

alter table "public"."stock_movements" add constraint "stock_movements_pkey" PRIMARY KEY using index "stock_movements_pkey";

alter table "public"."customers" add constraint "customers_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text]))) not valid;

alter table "public"."customers" validate constraint "customers_status_check";

alter table "public"."items" add constraint "items_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'archived'::text]))) not valid;

alter table "public"."items" validate constraint "items_status_check";

alter table "public"."order_lines" add constraint "order_lines_item_fk" FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE RESTRICT not valid;

alter table "public"."order_lines" validate constraint "order_lines_item_fk";

alter table "public"."order_lines" add constraint "order_lines_order_fk" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE not valid;

alter table "public"."order_lines" validate constraint "order_lines_order_fk";

alter table "public"."order_lines" add constraint "order_lines_qty_check" CHECK ((qty > (0)::numeric)) not valid;

alter table "public"."order_lines" validate constraint "order_lines_qty_check";

alter table "public"."orders" add constraint "orders_customer_fk" FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL not valid;

alter table "public"."orders" validate constraint "orders_customer_fk";

alter table "public"."orders" add constraint "orders_order_no_unique" UNIQUE using index "orders_order_no_unique";

alter table "public"."orders" add constraint "orders_status_check" CHECK ((status = ANY (ARRAY['open'::text, 'done'::text, 'storno'::text, 'retoure'::text]))) not valid;

alter table "public"."orders" validate constraint "orders_status_check";

alter table "public"."stock_movements" add constraint "stock_movements_item_id_fkey" FOREIGN KEY (item_id) REFERENCES public.items(id) ON DELETE CASCADE not valid;

alter table "public"."stock_movements" validate constraint "stock_movements_item_id_fkey";

alter table "public"."stock_movements" add constraint "stock_movements_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE SET NULL not valid;

alter table "public"."stock_movements" validate constraint "stock_movements_order_id_fkey";

alter table "public"."stock_movements" add constraint "stock_movements_order_line_id_fkey" FOREIGN KEY (order_line_id) REFERENCES public.order_lines(id) ON DELETE SET NULL not valid;

alter table "public"."stock_movements" validate constraint "stock_movements_order_line_id_fkey";

alter table "public"."stock_movements" add constraint "stock_movements_qty_check" CHECK ((qty > (0)::numeric)) not valid;

alter table "public"."stock_movements" validate constraint "stock_movements_qty_check";

alter table "public"."stock_movements" add constraint "stock_movements_type_check" CHECK ((movement_type = ANY (ARRAY['in'::text, 'out'::text, 'adjust'::text, 'inventory'::text]))) not valid;

alter table "public"."stock_movements" validate constraint "stock_movements_type_check";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.apply_order_cancelled_stock_once()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_ref text;
  v_applied boolean;
  v_reversed boolean;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  -- nur wenn status wirklich wechselt
  if coalesce(old.status,'') = coalesce(new.status,'') then
    return new;
  end if;

  -- NUR STORNO darf Voll-Reversal machen
  if new.status <> 'storno' then
    return new;
  end if;

  select stock_applied, stock_reversed
    into v_applied, v_reversed
  from public.orders
  where id = new.id
  for update;

  -- Wenn nie ausgebucht wurde: nix zu reversen
  if coalesce(v_applied,false) = false then
    return new;
  end if;

  -- Wenn schon reversed: nix tun
  if coalesce(v_reversed,false) = true then
    return new;
  end if;

  v_ref := coalesce(new.order_no::text, 'ORDER:' || new.id::text);

  -- Reverse = IN für jede Line
  insert into public.stock_movements (
    item_id, movement_type, qty, unit,
    reason, reference, notes,
    order_id, order_line_id, created_by
  )
  select
    ol.item_id,
    'in',
    ol.qty,
    coalesce(ol.unit, 'pcs'),
    'order_storno',
    'STORNO:' || v_ref,
    coalesce(new.notes,''),
    new.id,
    ol.id,
    new.created_by
  from public.order_lines ol
  where ol.order_id = new.id;

  update public.orders
  set stock_reversed = true
  where id = new.id;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_order_done_stock_once()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_line record;
  v_ref text;
  v_applied boolean;
begin
  -- Sicherheit: nur bei done
  if new.status is distinct from 'done' then
    return new;
  end if;

  -- Lock die Order-Zeile (verhindert Race Conditions bei Doppelclick)
  select stock_applied into v_applied
  from public.orders
  where id = new.id
  for update;

  -- Wenn schon angewendet: nix tun
  if coalesce(v_applied, false) = true then
    return new;
  end if;

  v_ref := coalesce(new.order_no::text, 'ORDER:' || new.id::text);

  -- Für jede Line: 1x OUT
  insert into public.stock_movements (
    item_id, movement_type, qty, unit,
    reason, reference, notes,
    order_id, order_line_id, created_by
  )
  select
    ol.item_id,
    'out',
    ol.qty,
    coalesce(ol.unit, 'pcs'),
    'order_done',
    v_ref,
    coalesce(new.notes, ''),
    new.id,
    ol.id,
    new.created_by
  from public.order_lines ol
  where ol.order_id = new.id
  -- das matched deinen partial unique index (order_line_id) WHERE movement_type='out'
  on conflict (order_line_id) where movement_type = 'out' do nothing;

  update public.orders
  set stock_applied = true
  where id = new.id;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_order_stock(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_already boolean;
  v_line record;
begin
  -- Sperre / Idempotenz: nur einmal anwenden
  select stock_applied into v_already
  from public.orders
  where id = p_order_id;

  if v_already then
    return;
  end if;

  -- Für jede Position eine OUT-Bewegung erzeugen
  for v_line in
    select item_id, qty
    from public.order_lines
    where order_id = p_order_id
  loop
    insert into public.stock_movements (item_id, movement_type, qty, reason)
    values (v_line.item_id, 'out', v_line.qty, 'Auftrag (auto)');

    -- apply_stock_movement Trigger aktualisiert current_stock
  end loop;

  -- markieren als angewendet
  update public.orders
  set stock_applied = true
  where id = p_order_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_stock_movement()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  update public.items
  set current_stock = coalesce(current_stock, 0) + coalesce(new.delta_qty, 0)
  where id = new.item_id;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.book_order_return(p_order_line_id uuid, p_qty numeric, p_notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_line record;
  v_order record;
  v_ref text;
  v_returned numeric;
begin
  if p_qty is null or p_qty <= 0 then
    raise exception 'p_qty muss > 0 sein';
  end if;

  select ol.*
    into v_line
  from public.order_lines ol
  where ol.id = p_order_line_id;

  if not found then
    raise exception 'order_line_id nicht gefunden: %', p_order_line_id;
  end if;

  select o.*
    into v_order
  from public.orders o
  where o.id = v_line.order_id
  for update;

  if v_order.status not in ('done','retoure') then
    raise exception 'Retoure nur möglich bei done/retoure. Aktuell: %', v_order.status;
  end if;

  if coalesce(v_order.stock_applied,false) = false then
    raise exception 'Retoure nicht möglich: Lager wurde für diesen Auftrag noch nicht angewendet (stock_applied=false).';
  end if;

  -- bereits retournierte Menge (nur unsere Retour-Movements zählen)
  select coalesce(sum(sm.qty),0)
    into v_returned
  from public.stock_movements sm
  where sm.order_line_id = p_order_line_id
    and sm.movement_type = 'in'
    and sm.reason = 'order_return';

  if (v_returned + p_qty) > v_line.qty then
    raise exception 'Überretoure: bereits retour % + neu % > geliefert %', v_returned, p_qty, v_line.qty;
  end if;

  v_ref := coalesce(v_order.order_no::text, 'ORDER:' || v_order.id::text);

  insert into public.stock_movements (
    item_id, movement_type, qty, unit,
    reason, reference, notes,
    order_id, order_line_id, created_by
  ) values (
    v_line.item_id,
    'in',
    p_qty,
    coalesce(v_line.unit,'pcs'),
    'order_return',
    'RET:' || v_ref,
    coalesce(p_notes,''),
    v_order.id,
    v_line.id,
    v_order.created_by
  );

  -- Orderstatus auf retoure setzen (und DONE->RETOURE ist jetzt erlaubt)
  if v_order.status <> 'retoure' then
    update public.orders
    set status = 'retoure'
    where id = v_order.id;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.create_return_movement(p_order_id uuid, p_order_line_id uuid, p_qty numeric, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_item_id uuid;
  v_order_no text;
  v_created_by uuid;
  v_status text;

  v_out_total numeric;
  v_in_returns numeric;
  v_remaining numeric;

  v_new_id uuid;
begin
  if p_order_id is null or p_order_line_id is null then
    raise exception 'order_id und order_line_id dürfen nicht null sein';
  end if;

  if p_qty is null or p_qty <= 0 then
    raise exception 'qty muss > 0 sein';
  end if;

  -- Order Infos + Status prüfen
  select order_no, created_by, status
    into v_order_no, v_created_by, v_status
  from public.orders
  where id = p_order_id;

  if v_order_no is null then
    raise exception 'Order % nicht gefunden', p_order_id;
  end if;

  -- Optional aber sinnvoll: Retouren nur bei done oder cancelled erlauben (weil es eine Lieferung gab)
  if v_status not in ('done','cancelled') then
    raise exception 'Retouren sind nur möglich, wenn die Order done oder cancelled ist. Aktueller Status: %', v_status;
  end if;

  -- Line Infos
  select item_id
    into v_item_id
  from public.order_lines
  where id = p_order_line_id
    and order_id = p_order_id;

  if v_item_id is null then
    raise exception 'Order-Line % nicht gefunden oder gehört nicht zur Order %', p_order_line_id, p_order_id;
  end if;

  -- Wie viel wurde ausgeliefert (OUT)?
  select coalesce(sum(qty),0)
    into v_out_total
  from public.stock_movements
  where order_id = p_order_id
    and order_line_id = p_order_line_id
    and movement_type = 'out';

  if v_out_total <= 0 then
    raise exception 'Für diese Order-Line gibt es keine OUT-Buchung (nichts ausgeliefert).';
  end if;

  -- Wie viel wurde bereits retourniert (IN mit reason='return')?
  select coalesce(sum(qty),0)
    into v_in_returns
  from public.stock_movements
  where order_id = p_order_id
    and order_line_id = p_order_line_id
    and movement_type = 'in'
    and reason = 'return';

  v_remaining := v_out_total - v_in_returns;

  if p_qty > v_remaining then
    raise exception 'Retourenmenge zu hoch. Verfügbar: %, angefragt: %', v_remaining, p_qty;
  end if;

  -- Movement schreiben
  insert into public.stock_movements (
    item_id,
    movement_type,
    qty,
    unit,
    reason,
    reference,
    notes,
    order_id,
    order_line_id,
    created_by
  )
  values (
    v_item_id,
    'in',
    p_qty,
    'pcs',
    'return',
    v_order_no,
    coalesce(p_notes,''),
    p_order_id,
    p_order_line_id,
    coalesce(auth.uid(), v_created_by)
  )
  returning id into v_new_id;

  return v_new_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.fulfill_order_on_done()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  r record;
  avail numeric;
begin
  -- done darf man im MVP nicht zurücksetzen
  if tg_op = 'UPDATE' then
    if old.status = 'done' and new.status <> 'done' then
      raise exception 'Auftrag % ist DONE und kann im MVP nicht zurückgesetzt werden.', new.order_no;
    end if;

    -- nur bei Transition zu done ausführen
    if old.status <> 'done' and new.status = 'done' then

      -- Positionen müssen existieren
      if not exists (select 1 from public.order_lines where order_id = new.id) then
        raise exception 'Auftrag % hat keine Positionen.', new.order_no;
      end if;

      -- 1) Validierung: Bestand reicht?
      for r in
        select
          ol.item_id,
          ol.qty,
          coalesce(i.current_stock, 0) as current_stock,
          coalesce(i.name, '(unbekannt)') as item_name
        from public.order_lines ol
        join public.items i on i.id = ol.item_id
        where ol.order_id = new.id
      loop
        if r.qty is null or r.qty <= 0 then
          raise exception 'Ungültige Menge in Auftrag % (Item %).', new.order_no, r.item_name;
        end if;

        avail := coalesce(r.current_stock, 0);

        if avail < r.qty then
          raise exception 'Nicht genug Bestand für "%": verfügbar %, benötigt % (Auftrag %).',
            r.item_name, avail, r.qty, new.order_no;
        end if;
      end loop;

      -- 2) Bewegungen schreiben (OUT)
      insert into public.stock_movements (item_id, movement_type, qty, reason, created_by)
      select
        ol.item_id,
        'out',
        ol.qty,
        ('Auftrag ' || new.order_no),
        new.created_by
      from public.order_lines ol
      where ol.order_id = new.id;

    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.fulfill_order_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_order_no text;
  v_new jsonb;
begin
  -- Nur wenn Status wirklich von "nicht done" -> "done" wechselt
  if not (new.status = 'done' and (old.status is distinct from 'done')) then
    return new;
  end if;

  -- Safe: record -> jsonb, damit fehlende Felder nicht crashen
  v_new := to_jsonb(new);

  -- Nimm die erste passende ID/Nummer (order_no ist bei dir sichtbar als AUF-00000x)
  v_order_no :=
    coalesce(
      v_new ->> 'order_no',
      v_new ->> 'number',
      v_new ->> 'order_number',
      new.id::text
    );

  insert into public.stock_movements (
    item_id,
    movement_type,
    qty,
    unit,
    reason,
    reference,
    created_by
  )
  select
    ol.item_id,
    'out' as movement_type,
    sum(ol.qty)::numeric as qty,
    coalesce(max(i.unit), '') as unit,
    'Auftrag ' || v_order_no as reason,
    'order:' || new.id::text || ':item:' || ol.item_id::text as reference,
    auth.uid() as created_by
  from public.order_lines ol
  left join public.items i on i.id = ol.item_id
  where ol.order_id = new.id
  group by ol.item_id
  on conflict (reference) do nothing;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.generate_order_no()
 RETURNS text
 LANGUAGE sql
AS $function$
  select 'AUF-' || lpad(nextval('public.order_no_seq')::text, 6, '0');
$function$
;

CREATE OR REPLACE FUNCTION public.on_order_done_apply_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  -- Nur beim Wechsel auf done
  if (tg_op = 'UPDATE')
     and (new.status = 'done')
     and (coalesce(old.status,'') <> 'done') then

    perform public.apply_order_stock(new.id);
  end if;

  return new;
end;
$function$
;

create or replace view "public"."order_line_return_status" as  SELECT id AS order_line_id,
    order_id,
    item_id,
    qty AS ordered_qty,
    COALESCE(( SELECT sum(sm.qty) AS sum
           FROM public.stock_movements sm
          WHERE ((sm.order_line_id = ol.id) AND (sm.movement_type = 'out'::text))), (0)::numeric) AS out_qty,
    COALESCE(( SELECT sum(sm.qty) AS sum
           FROM public.stock_movements sm
          WHERE ((sm.order_line_id = ol.id) AND (sm.movement_type = 'in'::text) AND (sm.reason = 'return'::text))), (0)::numeric) AS return_qty,
    GREATEST((COALESCE(( SELECT sum(sm.qty) AS sum
           FROM public.stock_movements sm
          WHERE ((sm.order_line_id = ol.id) AND (sm.movement_type = 'out'::text))), (0)::numeric) - COALESCE(( SELECT sum(sm.qty) AS sum
           FROM public.stock_movements sm
          WHERE ((sm.order_line_id = ol.id) AND (sm.movement_type = 'in'::text) AND (sm.reason = 'return'::text))), (0)::numeric)), (0)::numeric) AS return_remaining
   FROM public.order_lines ol;


create or replace view "public"."orders_with_flags" as  SELECT id,
    created_at,
    created_by,
    order_no,
    status,
    customer_id,
    order_date,
    notes,
    total_chf,
    stock_applied,
    stock_reversed,
    (EXISTS ( SELECT 1
           FROM public.stock_movements sm
          WHERE ((sm.order_id = o.id) AND (sm.movement_type = 'in'::text) AND (sm.reason = 'return'::text)))) AS has_return,
    COALESCE(( SELECT count(*) AS count
           FROM public.stock_movements sm
          WHERE ((sm.order_id = o.id) AND (sm.movement_type = 'in'::text) AND (sm.reason = 'return'::text))), (0)::bigint) AS return_count,
    ( SELECT max(sm.created_at) AS max
           FROM public.stock_movements sm
          WHERE ((sm.order_id = o.id) AND (sm.movement_type = 'in'::text) AND (sm.reason = 'return'::text))) AS last_return_at
   FROM public.orders o;


CREATE OR REPLACE FUNCTION public.prepare_stock_movement()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_stock numeric;
  v_qty numeric;
  v_delta numeric;
begin
  v_qty := coalesce(new.qty, 0);

  select coalesce(current_stock, 0)
    into v_stock
  from public.items
  where id = new.item_id
  for update;

  if new.movement_type = 'in' then
    new.delta_qty := v_qty;

  elsif new.movement_type = 'out' then
    new.delta_qty := -v_qty;

    if v_stock < v_qty then
      raise exception 'Nicht genug Bestand. Aktuell: %, Abgang: %', v_stock, v_qty;
    end if;

  elsif new.movement_type = 'inventory' then
    -- INVENTUR = Zielbestand
    new.delta_qty := v_qty - v_stock;

  elsif new.movement_type = 'adjust' then
    -- ADJUST: wenn delta_qty mitgegeben wird, verwenden wir sie (kann +/- sein).
    -- sonst interpretieren wir qty als +qty
    v_delta := coalesce(new.delta_qty, v_qty);
    new.delta_qty := v_delta;

    if (v_stock + v_delta) < 0 then
      raise exception 'Adjust würde Bestand negativ machen. Aktuell: %, Delta: %', v_stock, v_delta;
    end if;

  else
    raise exception 'Unknown movement_type: %', new.movement_type;
  end if;

  -- falls unit fehlt
  if new.unit is null or length(trim(new.unit)) = 0 then
    new.unit := 'pcs';
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.prevent_done_to_open()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  -- vorher: blockt DONE -> alles
  if old.status = 'done' and new.status <> 'done' then
    -- erlauben: done -> retoure
    if new.status = 'retoure' then
      return new;
    end if;

    raise exception 'Order % ist bereits done und darf nicht zurückgesetzt werden (nur Retoure erlaubt).', old.id;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.recompute_stock_all()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
declare
  it record;
  mv record;
  v_stock numeric;
  v_prev  numeric;
  v_delta numeric;
begin
  -- Start: alles auf 0
  update public.items set current_stock = 0;

  for it in select id from public.items loop
    v_stock := 0;

    for mv in
      select id, movement_type, coalesce(qty,0) as qty
      from public.stock_movements
      where item_id = it.id
      order by created_at asc, id asc
    loop
      v_prev := v_stock;

      if mv.movement_type = 'inventory' then
        v_stock := mv.qty;
      elseif mv.movement_type = 'in' then
        v_stock := v_stock + mv.qty;
      elseif mv.movement_type = 'out' then
        v_stock := v_stock - mv.qty;
      end if;

      v_delta := v_stock - v_prev;
      update public.stock_movements set delta_qty = v_delta where id = mv.id;
    end loop;

    update public.items set current_stock = v_stock where id = it.id;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.repair_missing_out_movements(p_order_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$declare
  v_order_no text;
  v_created_by uuid;
  v_status text;
  v_inserted int := 0;
begin
  -- Order check
  select order_no, created_by, status
    into v_order_no, v_created_by, v_status
  from public.orders
  where id = p_order_id;

  if v_order_no is null then
    raise exception 'Order % nicht gefunden', p_order_id;
  end if;

  if v_status <> 'done' then
    raise exception 'Repair ist nur für done Orders gedacht. Status=%', v_status;
  end if;

  -- Für jede Line: wenn noch kein OUT existiert -> OUT nachtragen
  with missing as (
    select ol.id as order_line_id, ol.item_id, ol.qty
    from public.order_lines ol
    where ol.order_id = p_order_id
      and ol.qty > 0
      and not exists (
        select 1
        from public.stock_movements sm
        where sm.order_id = p_order_id
          and sm.order_line_id = ol.id
          and sm.movement_type = 'out'
      )
  )
  insert into public.stock_movements (
    item_id,
    movement_type,
    qty,
    unit,
    reason,
    reference,
    notes,
    order_id,
    order_line_id,
    created_by
  )
  select
    m.item_id,
    'out',
    m.qty,
    'pcs',
    'repair_out_missing',
    v_order_no,
    'Auto-Repair: fehlende OUT-Buchung nachgetragen',
    p_order_id,
    m.order_line_id,
    coalesce(auth.uid(), v_created_by)
  from missing m
  on conflict (order_line_id) do nothing;


  get diagnostics v_inserted = row_count;
  return v_inserted;
end$function$
;

CREATE OR REPLACE FUNCTION public.set_order_no_if_missing()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.order_no is null or new.order_no = '' then
    new.order_no := public.generate_order_no();
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

grant delete on table "public"."customers" to "anon";

grant insert on table "public"."customers" to "anon";

grant references on table "public"."customers" to "anon";

grant select on table "public"."customers" to "anon";

grant trigger on table "public"."customers" to "anon";

grant truncate on table "public"."customers" to "anon";

grant update on table "public"."customers" to "anon";

grant delete on table "public"."customers" to "authenticated";

grant insert on table "public"."customers" to "authenticated";

grant references on table "public"."customers" to "authenticated";

grant select on table "public"."customers" to "authenticated";

grant trigger on table "public"."customers" to "authenticated";

grant truncate on table "public"."customers" to "authenticated";

grant update on table "public"."customers" to "authenticated";

grant delete on table "public"."customers" to "service_role";

grant insert on table "public"."customers" to "service_role";

grant references on table "public"."customers" to "service_role";

grant select on table "public"."customers" to "service_role";

grant trigger on table "public"."customers" to "service_role";

grant truncate on table "public"."customers" to "service_role";

grant update on table "public"."customers" to "service_role";

grant delete on table "public"."items" to "anon";

grant insert on table "public"."items" to "anon";

grant references on table "public"."items" to "anon";

grant select on table "public"."items" to "anon";

grant trigger on table "public"."items" to "anon";

grant truncate on table "public"."items" to "anon";

grant update on table "public"."items" to "anon";

grant delete on table "public"."items" to "authenticated";

grant insert on table "public"."items" to "authenticated";

grant references on table "public"."items" to "authenticated";

grant select on table "public"."items" to "authenticated";

grant trigger on table "public"."items" to "authenticated";

grant truncate on table "public"."items" to "authenticated";

grant update on table "public"."items" to "authenticated";

grant delete on table "public"."items" to "service_role";

grant insert on table "public"."items" to "service_role";

grant references on table "public"."items" to "service_role";

grant select on table "public"."items" to "service_role";

grant trigger on table "public"."items" to "service_role";

grant truncate on table "public"."items" to "service_role";

grant update on table "public"."items" to "service_role";

grant delete on table "public"."items__backup_20260202_113118" to "anon";

grant insert on table "public"."items__backup_20260202_113118" to "anon";

grant references on table "public"."items__backup_20260202_113118" to "anon";

grant select on table "public"."items__backup_20260202_113118" to "anon";

grant trigger on table "public"."items__backup_20260202_113118" to "anon";

grant truncate on table "public"."items__backup_20260202_113118" to "anon";

grant update on table "public"."items__backup_20260202_113118" to "anon";

grant delete on table "public"."items__backup_20260202_113118" to "authenticated";

grant insert on table "public"."items__backup_20260202_113118" to "authenticated";

grant references on table "public"."items__backup_20260202_113118" to "authenticated";

grant select on table "public"."items__backup_20260202_113118" to "authenticated";

grant trigger on table "public"."items__backup_20260202_113118" to "authenticated";

grant truncate on table "public"."items__backup_20260202_113118" to "authenticated";

grant update on table "public"."items__backup_20260202_113118" to "authenticated";

grant delete on table "public"."items__backup_20260202_113118" to "service_role";

grant insert on table "public"."items__backup_20260202_113118" to "service_role";

grant references on table "public"."items__backup_20260202_113118" to "service_role";

grant select on table "public"."items__backup_20260202_113118" to "service_role";

grant trigger on table "public"."items__backup_20260202_113118" to "service_role";

grant truncate on table "public"."items__backup_20260202_113118" to "service_role";

grant update on table "public"."items__backup_20260202_113118" to "service_role";

grant delete on table "public"."items__backup_20260202_123905" to "anon";

grant insert on table "public"."items__backup_20260202_123905" to "anon";

grant references on table "public"."items__backup_20260202_123905" to "anon";

grant select on table "public"."items__backup_20260202_123905" to "anon";

grant trigger on table "public"."items__backup_20260202_123905" to "anon";

grant truncate on table "public"."items__backup_20260202_123905" to "anon";

grant update on table "public"."items__backup_20260202_123905" to "anon";

grant delete on table "public"."items__backup_20260202_123905" to "authenticated";

grant insert on table "public"."items__backup_20260202_123905" to "authenticated";

grant references on table "public"."items__backup_20260202_123905" to "authenticated";

grant select on table "public"."items__backup_20260202_123905" to "authenticated";

grant trigger on table "public"."items__backup_20260202_123905" to "authenticated";

grant truncate on table "public"."items__backup_20260202_123905" to "authenticated";

grant update on table "public"."items__backup_20260202_123905" to "authenticated";

grant delete on table "public"."items__backup_20260202_123905" to "service_role";

grant insert on table "public"."items__backup_20260202_123905" to "service_role";

grant references on table "public"."items__backup_20260202_123905" to "service_role";

grant select on table "public"."items__backup_20260202_123905" to "service_role";

grant trigger on table "public"."items__backup_20260202_123905" to "service_role";

grant truncate on table "public"."items__backup_20260202_123905" to "service_role";

grant update on table "public"."items__backup_20260202_123905" to "service_role";

grant delete on table "public"."order_lines" to "anon";

grant insert on table "public"."order_lines" to "anon";

grant references on table "public"."order_lines" to "anon";

grant select on table "public"."order_lines" to "anon";

grant trigger on table "public"."order_lines" to "anon";

grant truncate on table "public"."order_lines" to "anon";

grant update on table "public"."order_lines" to "anon";

grant delete on table "public"."order_lines" to "authenticated";

grant insert on table "public"."order_lines" to "authenticated";

grant references on table "public"."order_lines" to "authenticated";

grant select on table "public"."order_lines" to "authenticated";

grant trigger on table "public"."order_lines" to "authenticated";

grant truncate on table "public"."order_lines" to "authenticated";

grant update on table "public"."order_lines" to "authenticated";

grant delete on table "public"."order_lines" to "service_role";

grant insert on table "public"."order_lines" to "service_role";

grant references on table "public"."order_lines" to "service_role";

grant select on table "public"."order_lines" to "service_role";

grant trigger on table "public"."order_lines" to "service_role";

grant truncate on table "public"."order_lines" to "service_role";

grant update on table "public"."order_lines" to "service_role";

grant delete on table "public"."order_lines__backup_20260202_113118" to "anon";

grant insert on table "public"."order_lines__backup_20260202_113118" to "anon";

grant references on table "public"."order_lines__backup_20260202_113118" to "anon";

grant select on table "public"."order_lines__backup_20260202_113118" to "anon";

grant trigger on table "public"."order_lines__backup_20260202_113118" to "anon";

grant truncate on table "public"."order_lines__backup_20260202_113118" to "anon";

grant update on table "public"."order_lines__backup_20260202_113118" to "anon";

grant delete on table "public"."order_lines__backup_20260202_113118" to "authenticated";

grant insert on table "public"."order_lines__backup_20260202_113118" to "authenticated";

grant references on table "public"."order_lines__backup_20260202_113118" to "authenticated";

grant select on table "public"."order_lines__backup_20260202_113118" to "authenticated";

grant trigger on table "public"."order_lines__backup_20260202_113118" to "authenticated";

grant truncate on table "public"."order_lines__backup_20260202_113118" to "authenticated";

grant update on table "public"."order_lines__backup_20260202_113118" to "authenticated";

grant delete on table "public"."order_lines__backup_20260202_113118" to "service_role";

grant insert on table "public"."order_lines__backup_20260202_113118" to "service_role";

grant references on table "public"."order_lines__backup_20260202_113118" to "service_role";

grant select on table "public"."order_lines__backup_20260202_113118" to "service_role";

grant trigger on table "public"."order_lines__backup_20260202_113118" to "service_role";

grant truncate on table "public"."order_lines__backup_20260202_113118" to "service_role";

grant update on table "public"."order_lines__backup_20260202_113118" to "service_role";

grant delete on table "public"."order_lines__backup_20260202_123905" to "anon";

grant insert on table "public"."order_lines__backup_20260202_123905" to "anon";

grant references on table "public"."order_lines__backup_20260202_123905" to "anon";

grant select on table "public"."order_lines__backup_20260202_123905" to "anon";

grant trigger on table "public"."order_lines__backup_20260202_123905" to "anon";

grant truncate on table "public"."order_lines__backup_20260202_123905" to "anon";

grant update on table "public"."order_lines__backup_20260202_123905" to "anon";

grant delete on table "public"."order_lines__backup_20260202_123905" to "authenticated";

grant insert on table "public"."order_lines__backup_20260202_123905" to "authenticated";

grant references on table "public"."order_lines__backup_20260202_123905" to "authenticated";

grant select on table "public"."order_lines__backup_20260202_123905" to "authenticated";

grant trigger on table "public"."order_lines__backup_20260202_123905" to "authenticated";

grant truncate on table "public"."order_lines__backup_20260202_123905" to "authenticated";

grant update on table "public"."order_lines__backup_20260202_123905" to "authenticated";

grant delete on table "public"."order_lines__backup_20260202_123905" to "service_role";

grant insert on table "public"."order_lines__backup_20260202_123905" to "service_role";

grant references on table "public"."order_lines__backup_20260202_123905" to "service_role";

grant select on table "public"."order_lines__backup_20260202_123905" to "service_role";

grant trigger on table "public"."order_lines__backup_20260202_123905" to "service_role";

grant truncate on table "public"."order_lines__backup_20260202_123905" to "service_role";

grant update on table "public"."order_lines__backup_20260202_123905" to "service_role";

grant delete on table "public"."order_lines__backup_20260202_160752" to "anon";

grant insert on table "public"."order_lines__backup_20260202_160752" to "anon";

grant references on table "public"."order_lines__backup_20260202_160752" to "anon";

grant select on table "public"."order_lines__backup_20260202_160752" to "anon";

grant trigger on table "public"."order_lines__backup_20260202_160752" to "anon";

grant truncate on table "public"."order_lines__backup_20260202_160752" to "anon";

grant update on table "public"."order_lines__backup_20260202_160752" to "anon";

grant delete on table "public"."order_lines__backup_20260202_160752" to "authenticated";

grant insert on table "public"."order_lines__backup_20260202_160752" to "authenticated";

grant references on table "public"."order_lines__backup_20260202_160752" to "authenticated";

grant select on table "public"."order_lines__backup_20260202_160752" to "authenticated";

grant trigger on table "public"."order_lines__backup_20260202_160752" to "authenticated";

grant truncate on table "public"."order_lines__backup_20260202_160752" to "authenticated";

grant update on table "public"."order_lines__backup_20260202_160752" to "authenticated";

grant delete on table "public"."order_lines__backup_20260202_160752" to "service_role";

grant insert on table "public"."order_lines__backup_20260202_160752" to "service_role";

grant references on table "public"."order_lines__backup_20260202_160752" to "service_role";

grant select on table "public"."order_lines__backup_20260202_160752" to "service_role";

grant trigger on table "public"."order_lines__backup_20260202_160752" to "service_role";

grant truncate on table "public"."order_lines__backup_20260202_160752" to "service_role";

grant update on table "public"."order_lines__backup_20260202_160752" to "service_role";

grant delete on table "public"."orders" to "anon";

grant insert on table "public"."orders" to "anon";

grant references on table "public"."orders" to "anon";

grant select on table "public"."orders" to "anon";

grant trigger on table "public"."orders" to "anon";

grant truncate on table "public"."orders" to "anon";

grant update on table "public"."orders" to "anon";

grant delete on table "public"."orders" to "authenticated";

grant insert on table "public"."orders" to "authenticated";

grant references on table "public"."orders" to "authenticated";

grant select on table "public"."orders" to "authenticated";

grant trigger on table "public"."orders" to "authenticated";

grant truncate on table "public"."orders" to "authenticated";

grant update on table "public"."orders" to "authenticated";

grant delete on table "public"."orders" to "service_role";

grant insert on table "public"."orders" to "service_role";

grant references on table "public"."orders" to "service_role";

grant select on table "public"."orders" to "service_role";

grant trigger on table "public"."orders" to "service_role";

grant truncate on table "public"."orders" to "service_role";

grant update on table "public"."orders" to "service_role";

grant delete on table "public"."orders__backup_20260202_113118" to "anon";

grant insert on table "public"."orders__backup_20260202_113118" to "anon";

grant references on table "public"."orders__backup_20260202_113118" to "anon";

grant select on table "public"."orders__backup_20260202_113118" to "anon";

grant trigger on table "public"."orders__backup_20260202_113118" to "anon";

grant truncate on table "public"."orders__backup_20260202_113118" to "anon";

grant update on table "public"."orders__backup_20260202_113118" to "anon";

grant delete on table "public"."orders__backup_20260202_113118" to "authenticated";

grant insert on table "public"."orders__backup_20260202_113118" to "authenticated";

grant references on table "public"."orders__backup_20260202_113118" to "authenticated";

grant select on table "public"."orders__backup_20260202_113118" to "authenticated";

grant trigger on table "public"."orders__backup_20260202_113118" to "authenticated";

grant truncate on table "public"."orders__backup_20260202_113118" to "authenticated";

grant update on table "public"."orders__backup_20260202_113118" to "authenticated";

grant delete on table "public"."orders__backup_20260202_113118" to "service_role";

grant insert on table "public"."orders__backup_20260202_113118" to "service_role";

grant references on table "public"."orders__backup_20260202_113118" to "service_role";

grant select on table "public"."orders__backup_20260202_113118" to "service_role";

grant trigger on table "public"."orders__backup_20260202_113118" to "service_role";

grant truncate on table "public"."orders__backup_20260202_113118" to "service_role";

grant update on table "public"."orders__backup_20260202_113118" to "service_role";

grant delete on table "public"."orders__backup_20260202_123905" to "anon";

grant insert on table "public"."orders__backup_20260202_123905" to "anon";

grant references on table "public"."orders__backup_20260202_123905" to "anon";

grant select on table "public"."orders__backup_20260202_123905" to "anon";

grant trigger on table "public"."orders__backup_20260202_123905" to "anon";

grant truncate on table "public"."orders__backup_20260202_123905" to "anon";

grant update on table "public"."orders__backup_20260202_123905" to "anon";

grant delete on table "public"."orders__backup_20260202_123905" to "authenticated";

grant insert on table "public"."orders__backup_20260202_123905" to "authenticated";

grant references on table "public"."orders__backup_20260202_123905" to "authenticated";

grant select on table "public"."orders__backup_20260202_123905" to "authenticated";

grant trigger on table "public"."orders__backup_20260202_123905" to "authenticated";

grant truncate on table "public"."orders__backup_20260202_123905" to "authenticated";

grant update on table "public"."orders__backup_20260202_123905" to "authenticated";

grant delete on table "public"."orders__backup_20260202_123905" to "service_role";

grant insert on table "public"."orders__backup_20260202_123905" to "service_role";

grant references on table "public"."orders__backup_20260202_123905" to "service_role";

grant select on table "public"."orders__backup_20260202_123905" to "service_role";

grant trigger on table "public"."orders__backup_20260202_123905" to "service_role";

grant truncate on table "public"."orders__backup_20260202_123905" to "service_role";

grant update on table "public"."orders__backup_20260202_123905" to "service_role";

grant delete on table "public"."orders__backup_20260202_160752" to "anon";

grant insert on table "public"."orders__backup_20260202_160752" to "anon";

grant references on table "public"."orders__backup_20260202_160752" to "anon";

grant select on table "public"."orders__backup_20260202_160752" to "anon";

grant trigger on table "public"."orders__backup_20260202_160752" to "anon";

grant truncate on table "public"."orders__backup_20260202_160752" to "anon";

grant update on table "public"."orders__backup_20260202_160752" to "anon";

grant delete on table "public"."orders__backup_20260202_160752" to "authenticated";

grant insert on table "public"."orders__backup_20260202_160752" to "authenticated";

grant references on table "public"."orders__backup_20260202_160752" to "authenticated";

grant select on table "public"."orders__backup_20260202_160752" to "authenticated";

grant trigger on table "public"."orders__backup_20260202_160752" to "authenticated";

grant truncate on table "public"."orders__backup_20260202_160752" to "authenticated";

grant update on table "public"."orders__backup_20260202_160752" to "authenticated";

grant delete on table "public"."orders__backup_20260202_160752" to "service_role";

grant insert on table "public"."orders__backup_20260202_160752" to "service_role";

grant references on table "public"."orders__backup_20260202_160752" to "service_role";

grant select on table "public"."orders__backup_20260202_160752" to "service_role";

grant trigger on table "public"."orders__backup_20260202_160752" to "service_role";

grant truncate on table "public"."orders__backup_20260202_160752" to "service_role";

grant update on table "public"."orders__backup_20260202_160752" to "service_role";

grant delete on table "public"."stock_movements" to "anon";

grant insert on table "public"."stock_movements" to "anon";

grant references on table "public"."stock_movements" to "anon";

grant select on table "public"."stock_movements" to "anon";

grant trigger on table "public"."stock_movements" to "anon";

grant truncate on table "public"."stock_movements" to "anon";

grant update on table "public"."stock_movements" to "anon";

grant delete on table "public"."stock_movements" to "authenticated";

grant insert on table "public"."stock_movements" to "authenticated";

grant references on table "public"."stock_movements" to "authenticated";

grant select on table "public"."stock_movements" to "authenticated";

grant trigger on table "public"."stock_movements" to "authenticated";

grant truncate on table "public"."stock_movements" to "authenticated";

grant update on table "public"."stock_movements" to "authenticated";

grant delete on table "public"."stock_movements" to "service_role";

grant insert on table "public"."stock_movements" to "service_role";

grant references on table "public"."stock_movements" to "service_role";

grant select on table "public"."stock_movements" to "service_role";

grant trigger on table "public"."stock_movements" to "service_role";

grant truncate on table "public"."stock_movements" to "service_role";

grant update on table "public"."stock_movements" to "service_role";

grant delete on table "public"."stock_movements__backup_20260202_113118" to "anon";

grant insert on table "public"."stock_movements__backup_20260202_113118" to "anon";

grant references on table "public"."stock_movements__backup_20260202_113118" to "anon";

grant select on table "public"."stock_movements__backup_20260202_113118" to "anon";

grant trigger on table "public"."stock_movements__backup_20260202_113118" to "anon";

grant truncate on table "public"."stock_movements__backup_20260202_113118" to "anon";

grant update on table "public"."stock_movements__backup_20260202_113118" to "anon";

grant delete on table "public"."stock_movements__backup_20260202_113118" to "authenticated";

grant insert on table "public"."stock_movements__backup_20260202_113118" to "authenticated";

grant references on table "public"."stock_movements__backup_20260202_113118" to "authenticated";

grant select on table "public"."stock_movements__backup_20260202_113118" to "authenticated";

grant trigger on table "public"."stock_movements__backup_20260202_113118" to "authenticated";

grant truncate on table "public"."stock_movements__backup_20260202_113118" to "authenticated";

grant update on table "public"."stock_movements__backup_20260202_113118" to "authenticated";

grant delete on table "public"."stock_movements__backup_20260202_113118" to "service_role";

grant insert on table "public"."stock_movements__backup_20260202_113118" to "service_role";

grant references on table "public"."stock_movements__backup_20260202_113118" to "service_role";

grant select on table "public"."stock_movements__backup_20260202_113118" to "service_role";

grant trigger on table "public"."stock_movements__backup_20260202_113118" to "service_role";

grant truncate on table "public"."stock_movements__backup_20260202_113118" to "service_role";

grant update on table "public"."stock_movements__backup_20260202_113118" to "service_role";

grant delete on table "public"."stock_movements__backup_20260202_123905" to "anon";

grant insert on table "public"."stock_movements__backup_20260202_123905" to "anon";

grant references on table "public"."stock_movements__backup_20260202_123905" to "anon";

grant select on table "public"."stock_movements__backup_20260202_123905" to "anon";

grant trigger on table "public"."stock_movements__backup_20260202_123905" to "anon";

grant truncate on table "public"."stock_movements__backup_20260202_123905" to "anon";

grant update on table "public"."stock_movements__backup_20260202_123905" to "anon";

grant delete on table "public"."stock_movements__backup_20260202_123905" to "authenticated";

grant insert on table "public"."stock_movements__backup_20260202_123905" to "authenticated";

grant references on table "public"."stock_movements__backup_20260202_123905" to "authenticated";

grant select on table "public"."stock_movements__backup_20260202_123905" to "authenticated";

grant trigger on table "public"."stock_movements__backup_20260202_123905" to "authenticated";

grant truncate on table "public"."stock_movements__backup_20260202_123905" to "authenticated";

grant update on table "public"."stock_movements__backup_20260202_123905" to "authenticated";

grant delete on table "public"."stock_movements__backup_20260202_123905" to "service_role";

grant insert on table "public"."stock_movements__backup_20260202_123905" to "service_role";

grant references on table "public"."stock_movements__backup_20260202_123905" to "service_role";

grant select on table "public"."stock_movements__backup_20260202_123905" to "service_role";

grant trigger on table "public"."stock_movements__backup_20260202_123905" to "service_role";

grant truncate on table "public"."stock_movements__backup_20260202_123905" to "service_role";

grant update on table "public"."stock_movements__backup_20260202_123905" to "service_role";

grant delete on table "public"."stock_movements__backup_20260202_160752" to "anon";

grant insert on table "public"."stock_movements__backup_20260202_160752" to "anon";

grant references on table "public"."stock_movements__backup_20260202_160752" to "anon";

grant select on table "public"."stock_movements__backup_20260202_160752" to "anon";

grant trigger on table "public"."stock_movements__backup_20260202_160752" to "anon";

grant truncate on table "public"."stock_movements__backup_20260202_160752" to "anon";

grant update on table "public"."stock_movements__backup_20260202_160752" to "anon";

grant delete on table "public"."stock_movements__backup_20260202_160752" to "authenticated";

grant insert on table "public"."stock_movements__backup_20260202_160752" to "authenticated";

grant references on table "public"."stock_movements__backup_20260202_160752" to "authenticated";

grant select on table "public"."stock_movements__backup_20260202_160752" to "authenticated";

grant trigger on table "public"."stock_movements__backup_20260202_160752" to "authenticated";

grant truncate on table "public"."stock_movements__backup_20260202_160752" to "authenticated";

grant update on table "public"."stock_movements__backup_20260202_160752" to "authenticated";

grant delete on table "public"."stock_movements__backup_20260202_160752" to "service_role";

grant insert on table "public"."stock_movements__backup_20260202_160752" to "service_role";

grant references on table "public"."stock_movements__backup_20260202_160752" to "service_role";

grant select on table "public"."stock_movements__backup_20260202_160752" to "service_role";

grant trigger on table "public"."stock_movements__backup_20260202_160752" to "service_role";

grant truncate on table "public"."stock_movements__backup_20260202_160752" to "service_role";

grant update on table "public"."stock_movements__backup_20260202_160752" to "service_role";


  create policy "customers_delete_own"
  on "public"."customers"
  as permissive
  for delete
  to public
using ((created_by = auth.uid()));



  create policy "customers_insert_own"
  on "public"."customers"
  as permissive
  for insert
  to public
with check ((created_by = auth.uid()));



  create policy "customers_select_own"
  on "public"."customers"
  as permissive
  for select
  to public
using ((created_by = auth.uid()));



  create policy "customers_update_own"
  on "public"."customers"
  as permissive
  for update
  to public
using ((created_by = auth.uid()))
with check ((created_by = auth.uid()));



  create policy "items_delete_own"
  on "public"."items"
  as permissive
  for delete
  to public
using ((created_by = auth.uid()));



  create policy "items_insert_own"
  on "public"."items"
  as permissive
  for insert
  to public
with check ((created_by = auth.uid()));



  create policy "items_select_own"
  on "public"."items"
  as permissive
  for select
  to public
using ((created_by = auth.uid()));



  create policy "items_update_own"
  on "public"."items"
  as permissive
  for update
  to public
using ((created_by = auth.uid()))
with check ((created_by = auth.uid()));



  create policy "order_lines_delete_own"
  on "public"."order_lines"
  as permissive
  for delete
  to public
using ((created_by = auth.uid()));



  create policy "order_lines_insert_own"
  on "public"."order_lines"
  as permissive
  for insert
  to public
with check ((created_by = auth.uid()));



  create policy "order_lines_select_own"
  on "public"."order_lines"
  as permissive
  for select
  to public
using ((created_by = auth.uid()));



  create policy "order_lines_update_own"
  on "public"."order_lines"
  as permissive
  for update
  to public
using ((created_by = auth.uid()))
with check ((created_by = auth.uid()));



  create policy "orders_delete_own"
  on "public"."orders"
  as permissive
  for delete
  to public
using ((created_by = auth.uid()));



  create policy "orders_insert_own"
  on "public"."orders"
  as permissive
  for insert
  to public
with check ((created_by = auth.uid()));



  create policy "orders_select_own"
  on "public"."orders"
  as permissive
  for select
  to public
using ((created_by = auth.uid()));



  create policy "orders_update_own"
  on "public"."orders"
  as permissive
  for update
  to public
using ((created_by = auth.uid()))
with check ((created_by = auth.uid()));



  create policy "stock_movements_delete_own"
  on "public"."stock_movements"
  as permissive
  for delete
  to public
using ((created_by = auth.uid()));



  create policy "stock_movements_insert_own"
  on "public"."stock_movements"
  as permissive
  for insert
  to public
with check ((created_by = auth.uid()));



  create policy "stock_movements_select_own"
  on "public"."stock_movements"
  as permissive
  for select
  to public
using ((created_by = auth.uid()));



  create policy "stock_movements_update_own"
  on "public"."stock_movements"
  as permissive
  for update
  to public
using ((created_by = auth.uid()))
with check ((created_by = auth.uid()));


CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER items_set_updated_at BEFORE UPDATE ON public.items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_orders_cancelled_apply_stock_once AFTER UPDATE OF status ON public.orders FOR EACH ROW WHEN ((new.status = 'storno'::text)) EXECUTE FUNCTION public.apply_order_cancelled_stock_once();

CREATE TRIGGER trg_orders_done_apply_stock_once AFTER UPDATE OF status ON public.orders FOR EACH ROW WHEN ((new.status = 'done'::text)) EXECUTE FUNCTION public.apply_order_done_stock_once();

CREATE TRIGGER trg_prevent_done_to_open BEFORE UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.prevent_done_to_open();

CREATE TRIGGER trg_set_order_no BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.set_order_no_if_missing();

CREATE TRIGGER trg_apply_stock_movement AFTER INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

CREATE TRIGGER trg_prepare_stock_movement BEFORE INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.prepare_stock_movement();

drop trigger if exists "protect_buckets_delete" on "storage"."buckets";

drop trigger if exists "protect_objects_delete" on "storage"."objects";

CREATE TRIGGER objects_delete_delete_prefix AFTER DELETE ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.delete_prefix_hierarchy_trigger();

CREATE TRIGGER objects_insert_create_prefix BEFORE INSERT ON storage.objects FOR EACH ROW EXECUTE FUNCTION storage.objects_insert_prefix_trigger();

CREATE TRIGGER objects_update_create_prefix BEFORE UPDATE ON storage.objects FOR EACH ROW WHEN (((new.name <> old.name) OR (new.bucket_id <> old.bucket_id))) EXECUTE FUNCTION storage.objects_update_prefix_trigger();

CREATE TRIGGER prefixes_create_hierarchy BEFORE INSERT ON storage.prefixes FOR EACH ROW WHEN ((pg_trigger_depth() < 1)) EXECUTE FUNCTION storage.prefixes_insert_trigger();

CREATE TRIGGER prefixes_delete_hierarchy AFTER DELETE ON storage.prefixes FOR EACH ROW EXECUTE FUNCTION storage.delete_prefix_hierarchy_trigger();


