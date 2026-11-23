-- LadyGo live dispatch v1.
-- Adds the missing online-driver, GPS, offer and atomic trip lifecycle backend.
-- Safe additive migration: existing orders and user data are preserved.

alter table public.orders
  add column if not exists pickup_lat double precision,
  add column if not exists pickup_lng double precision,
  add column if not exists destination_lat double precision,
  add column if not exists destination_lng double precision,
  add column if not exists scheduled_at timestamptz,
  add column if not exists passenger_phone text,
  add column if not exists tariff_id text,
  add column if not exists estimated_price_rub numeric(10,2),
  add column if not exists payment_method text not null default 'cash';

do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.orders drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.orders
  add constraint ladygo_orders_status_check
  check (status in ('new','accepted','arrived','in_progress','completed','cancelled','declined'));

alter table public.orders drop constraint if exists orders_tariff_id_valid;
alter table public.orders
  add constraint orders_tariff_id_valid
  check (tariff_id is null or tariff_id in ('economy','comfort','child','comfort_plus'));

alter table public.orders drop constraint if exists ladygo_pickup_coordinates_pair;
alter table public.orders
  add constraint ladygo_pickup_coordinates_pair
  check (
    (pickup_lat is null and pickup_lng is null)
    or (pickup_lat between -90 and 90 and pickup_lng between -180 and 180)
  );

alter table public.orders drop constraint if exists ladygo_destination_coordinates_pair;
alter table public.orders
  add constraint ladygo_destination_coordinates_pair
  check (
    (destination_lat is null and destination_lng is null)
    or (destination_lat between -90 and 90 and destination_lng between -180 and 180)
  );

create table if not exists public.driver_presence (
  driver_id uuid primary key references public.profiles(id) on delete cascade,
  is_online boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.driver_presence enable row level security;
drop policy if exists "drivers read own presence" on public.driver_presence;
create policy "drivers read own presence" on public.driver_presence
for select to authenticated using (
  driver_id = (select auth.uid()) or public.ladygo_is_admin()
);

create table if not exists public.driver_locations (
  driver_id uuid primary key references public.profiles(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  heading double precision,
  updated_at timestamptz not null default now()
);
create index if not exists driver_locations_updated_idx
  on public.driver_locations(updated_at desc);
alter table public.driver_locations enable row level security;
drop policy if exists "drivers and assigned passengers read live locations" on public.driver_locations;
create policy "drivers and assigned passengers read live locations"
on public.driver_locations for select to authenticated using (
  driver_id = (select auth.uid())
  or exists (
    select 1 from public.orders o
    where o.driver_id = driver_locations.driver_id
      and o.passenger_id = (select auth.uid())
      and o.status in ('accepted','arrived','in_progress')
  )
);

create table if not exists public.order_offers (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','accepted','declined','expired','cancelled')),
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '25 seconds'),
  responded_at timestamptz,
  push_sent_at timestamptz,
  constraint order_offers_order_driver_key unique (order_id, driver_id)
);
create index if not exists order_offers_driver_status_idx
  on public.order_offers(driver_id, status, expires_at);
create index if not exists order_offers_order_status_idx
  on public.order_offers(order_id, status, expires_at);
create unique index if not exists order_offers_one_pending_per_driver_idx
  on public.order_offers(driver_id) where status = 'pending';
alter table public.order_offers enable row level security;
drop policy if exists "drivers read own order offers" on public.order_offers;
create policy "drivers read own order offers"
on public.order_offers for select to authenticated
using (driver_id = (select auth.uid()));

create table if not exists public.driver_push_tokens (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null,
  device_platform text not null check (device_platform in ('android','ios')),
  updated_at timestamptz not null default now(),
  constraint driver_push_tokens_driver_token_key unique (driver_id, expo_push_token)
);
create index if not exists driver_push_tokens_driver_idx
  on public.driver_push_tokens(driver_id);
alter table public.driver_push_tokens enable row level security;
drop policy if exists "drivers manage own push tokens" on public.driver_push_tokens;
create policy "drivers manage own push tokens"
on public.driver_push_tokens for all to authenticated
using (driver_id = (select auth.uid()))
with check (driver_id = (select auth.uid()));

-- Server-controlled driver availability and GPS heartbeat.
create or replace function public.ladygo_driver_heartbeat(
  p_is_online boolean,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_heading double precision default null
)
returns void
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'driver'
  ) then
    raise exception 'Only approved drivers can change availability';
  end if;

  insert into public.driver_presence(driver_id, is_online, updated_at)
  values (auth.uid(), p_is_online, now())
  on conflict (driver_id) do update
    set is_online = excluded.is_online, updated_at = now();

  if p_is_online and p_latitude is not null and p_longitude is not null then
    if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
      raise exception 'Invalid GPS coordinates';
    end if;
    insert into public.driver_locations(driver_id, latitude, longitude, heading, updated_at)
    values (auth.uid(), p_latitude, p_longitude, p_heading, now())
    on conflict (driver_id) do update set
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      heading = excluded.heading,
      updated_at = now();
  end if;
end;
$function$;
revoke all on function public.ladygo_driver_heartbeat(boolean,double precision,double precision,double precision) from public, anon;
grant execute on function public.ladygo_driver_heartbeat(boolean,double precision,double precision,double precision) to authenticated;

-- Nearest active driver receives one short-lived offer. An expired/declined offer
-- is skipped and the passenger app can safely ask the server for the next driver.
create or replace function public.ladygo_dispatch_next_driver(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_order public.orders%rowtype;
  v_driver_id uuid;
begin
  select * into v_order
  from public.orders where id = p_order_id
  for update;

  if not found then return null; end if;

  if auth.uid() is not null and auth.uid() <> v_order.passenger_id
     and not exists (
       select 1 from public.order_offers oo
       where oo.order_id = p_order_id and oo.driver_id = auth.uid()
     ) then
    raise exception 'Not allowed to dispatch this order';
  end if;

  if v_order.status <> 'new' or v_order.driver_id is not null
     or (v_order.scheduled_at is not null and v_order.scheduled_at > now()) then
    return null;
  end if;

  update public.order_offers
  set status = 'expired', responded_at = now()
  where order_id = p_order_id and status = 'pending' and expires_at <= now();

  if exists (
    select 1 from public.order_offers
    where order_id = p_order_id and status = 'pending' and expires_at > now()
  ) then
    return null;
  end if;

  if v_order.pickup_lat is null or v_order.pickup_lng is null then
    return null;
  end if;

  select p.id into v_driver_id
  from public.profiles p
  join public.driver_presence dp
    on dp.driver_id = p.id and dp.is_online = true
   and dp.updated_at >= now() - interval '90 seconds'
  join public.driver_locations dl
    on dl.driver_id = p.id and dl.updated_at >= now() - interval '90 seconds'
  where p.role = 'driver'
    and p.id <> v_order.passenger_id
    and not exists (
      select 1 from public.order_offers pending
      where pending.driver_id = p.id and pending.status = 'pending'
        and pending.expires_at > now()
    )
    and not exists (
      select 1 from public.orders active
      where active.driver_id = p.id
        and active.status in ('accepted','arrived','in_progress')
    )
    and not exists (
      select 1 from public.order_offers previous
      where previous.order_id = p_order_id and previous.driver_id = p.id
    )
    and 6371.0 * acos(least(1.0, greatest(-1.0,
      sin(radians(v_order.pickup_lat)) * sin(radians(dl.latitude))
      + cos(radians(v_order.pickup_lat)) * cos(radians(dl.latitude))
      * cos(radians(dl.longitude - v_order.pickup_lng))
    ))) <= 80
  order by
    6371.0 * acos(least(1.0, greatest(-1.0,
      sin(radians(v_order.pickup_lat)) * sin(radians(dl.latitude))
      + cos(radians(v_order.pickup_lat)) * cos(radians(dl.latitude))
      * cos(radians(dl.longitude - v_order.pickup_lng))
    ))) asc,
    dp.updated_at desc,
    p.created_at asc
  limit 1
  for update of p skip locked;

  if v_driver_id is null then return null; end if;

  insert into public.order_offers(order_id, driver_id, status, offered_at, expires_at)
  values (p_order_id, v_driver_id, 'pending', now(), now() + interval '25 seconds')
  on conflict (order_id, driver_id) do nothing;

  return v_driver_id;
end;
$function$;
revoke all on function public.ladygo_dispatch_next_driver(uuid) from public, anon;
grant execute on function public.ladygo_dispatch_next_driver(uuid) to authenticated;

-- Atomic acceptance: only the driver who has a live offer can win the order.
create or replace function public.ladygo_accept_order(
  p_order_id uuid,
  p_price_rub numeric default null
)
returns public.orders
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_order public.orders%rowtype;
  v_offer public.order_offers%rowtype;
  v_price numeric(10,2);
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'driver'
  ) then raise exception 'Only approved drivers can accept orders'; end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.status <> 'new' or v_order.driver_id is not null then
    raise exception 'This order is no longer available';
  end if;

  select * into v_offer from public.order_offers
  where order_id = p_order_id and driver_id = auth.uid()
    and status = 'pending' and expires_at > now()
  for update;
  if not found then raise exception 'Your offer has expired'; end if;

  v_price := coalesce(p_price_rub, v_order.estimated_price_rub, v_order.price_rub);
  if v_price is null or v_price <= 0 then
    raise exception 'Order price is not configured';
  end if;

  update public.order_offers
  set status = 'accepted', responded_at = now()
  where id = v_offer.id;

  update public.order_offers
  set status = 'cancelled', responded_at = now()
  where order_id = p_order_id and id <> v_offer.id and status = 'pending';

  update public.orders
  set driver_id = auth.uid(), status = 'accepted', price_rub = v_price
  where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$function$;
revoke all on function public.ladygo_accept_order(uuid,numeric) from public, anon;
grant execute on function public.ladygo_accept_order(uuid,numeric) to authenticated;

create or replace function public.ladygo_decline_order(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'driver'
  ) then raise exception 'Only approved drivers can decline offers'; end if;

  update public.order_offers
  set status = 'declined', responded_at = now()
  where order_id = p_order_id and driver_id = auth.uid() and status = 'pending';

  if not found then raise exception 'Offer is no longer active'; end if;
  return public.ladygo_dispatch_next_driver(p_order_id);
end;
$function$;
revoke all on function public.ladygo_decline_order(uuid) from public, anon;
grant execute on function public.ladygo_decline_order(uuid) to authenticated;

-- Enforce the complete trip state machine inside the database.
create or replace function public.guard_order_update()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_role text;
begin
  select role into v_role from public.profiles where id = auth.uid();

  if new.passenger_id is distinct from old.passenger_id
     or new.pickup_address is distinct from old.pickup_address
     or new.destination_address is distinct from old.destination_address
     or new.pickup_lat is distinct from old.pickup_lat
     or new.pickup_lng is distinct from old.pickup_lng
     or new.destination_lat is distinct from old.destination_lat
     or new.destination_lng is distinct from old.destination_lng
     or new.requested_for is distinct from old.requested_for
     or new.notes is distinct from old.notes
     or new.tariff_id is distinct from old.tariff_id
     or new.payment_method is distinct from old.payment_method
     or new.created_at is distinct from old.created_at then
    raise exception 'Order details are immutable';
  end if;

  if v_role = 'driver' and old.status = 'new' and new.status = 'accepted'
     and new.driver_id = auth.uid() and new.price_rub > 0
     and exists (
       select 1 from public.order_offers oo
       where oo.order_id = old.id and oo.driver_id = auth.uid() and oo.status = 'accepted'
     ) then
    return new;
  end if;

  if v_role = 'driver' and old.driver_id = auth.uid()
     and new.driver_id = old.driver_id and new.price_rub = old.price_rub
     and ((old.status = 'accepted' and new.status = 'arrived')
       or (old.status = 'arrived' and new.status = 'in_progress')
       or (old.status = 'in_progress' and new.status = 'completed')
       or (old.status in ('accepted','arrived','in_progress') and new.status = 'cancelled')) then
    return new;
  end if;

  if v_role = 'passenger' and old.passenger_id = auth.uid()
     and new.passenger_id = old.passenger_id and new.driver_id is not distinct from old.driver_id
     and old.status in ('new','accepted','arrived','in_progress') and new.status = 'cancelled' then
    return new;
  end if;

  if v_role = 'admin' and new.status in ('cancelled','completed') then
    return new;
  end if;

  raise exception 'Invalid order status transition';
end;
$function$;

create or replace function public.ladygo_update_trip_status(
  p_order_id uuid,
  p_status text
)
returns public.orders
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare v_order public.orders%rowtype;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles where id = auth.uid() and role = 'driver'
  ) then raise exception 'Only approved drivers can update trip status'; end if;

  if p_status not in ('arrived','in_progress','completed','cancelled') then
    raise exception 'Unsupported trip status';
  end if;

  update public.orders
  set status = p_status
  where id = p_order_id and driver_id = auth.uid()
    and ((status = 'accepted' and p_status in ('arrived','cancelled'))
      or (status = 'arrived' and p_status in ('in_progress','cancelled'))
      or (status = 'in_progress' and p_status in ('completed','cancelled')))
  returning * into v_order;

  if not found then raise exception 'Trip status cannot be changed'; end if;

  if p_status = 'cancelled' then
    update public.order_offers set status = 'cancelled', responded_at = now()
    where order_id = p_order_id and status = 'pending';
  end if;
  return v_order;
end;
$function$;
revoke all on function public.ladygo_update_trip_status(uuid,text) from public, anon;
grant execute on function public.ladygo_update_trip_status(uuid,text) to authenticated;

create or replace function public.ladygo_cancel_my_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare v_order public.orders%rowtype;
begin
  update public.orders
  set status = 'cancelled'
  where id = p_order_id and passenger_id = auth.uid()
    and status in ('new','accepted','arrived','in_progress')
  returning * into v_order;
  if not found then raise exception 'This trip can no longer be cancelled'; end if;

  update public.order_offers set status = 'cancelled', responded_at = now()
  where order_id = p_order_id and status = 'pending';
  return v_order;
end;
$function$;
revoke all on function public.ladygo_cancel_my_order(uuid) from public, anon;
grant execute on function public.ladygo_cancel_my_order(uuid) to authenticated;

-- Offer push delivery is optional: in-app realtime offers remain functional
-- when Vault secret or pg_net is not configured.
create or replace function public.ladygo_push_new_driver_offer()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'vault', 'net', 'pg_temp'
as $function$
declare v_secret text;
begin
  begin
    select decrypted_secret into v_secret
    from vault.decrypted_secrets
    where name = 'ladygo_push_webhook_secret'
    limit 1;
  exception when others then
    return new;
  end;

  if v_secret is null then return new; end if;

  begin
    perform net.http_post(
      url := 'https://itlzvcklnxznrtaqjttc.supabase.co/functions/v1/send-driver-offer-push',
      body := jsonb_build_object('record', to_jsonb(new)),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-ladygo-webhook-secret', v_secret
      ),
      timeout_milliseconds := 5000
    );
  exception when others then
    raise warning 'LadyGo driver offer push was not sent: %', sqlerrm;
  end;
  return new;
end;
$function$;
revoke all on function public.ladygo_push_new_driver_offer() from public, anon, authenticated;
drop trigger if exists ladygo_push_new_driver_offer_trigger on public.order_offers;
create trigger ladygo_push_new_driver_offer_trigger
after insert on public.order_offers
for each row execute function public.ladygo_push_new_driver_offer();

create or replace function public.ladygo_dispatch_new_order()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
begin
  perform public.ladygo_dispatch_next_driver(new.id);
  return new;
end;
$function$;
revoke all on function public.ladygo_dispatch_new_order() from public, anon, authenticated;
drop trigger if exists ladygo_dispatch_new_order_trigger on public.orders;
create trigger ladygo_dispatch_new_order_trigger
after insert on public.orders
for each row execute function public.ladygo_dispatch_new_order();

-- Publish only the rows needed for live app updates.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='orders') then
    alter publication supabase_realtime add table public.orders;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='order_offers') then
    alter publication supabase_realtime add table public.order_offers;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='driver_locations') then
    alter publication supabase_realtime add table public.driver_locations;
  end if;
exception when undefined_object then
  raise notice 'supabase_realtime publication is not available; enable it in Supabase';
end $$;
