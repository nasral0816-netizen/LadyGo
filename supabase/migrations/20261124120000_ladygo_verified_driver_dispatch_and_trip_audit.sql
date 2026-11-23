-- Verified-driver dispatch and trip audit foundation.
-- Additive only: reuse driver_presence as driver availability, existing driver_locations
-- and order_offers. No existing order or user rows are removed.

-- A driver must have an approved application and the materialized driver profile.
-- Merely changing profiles.role to "driver" is not sufficient.
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
    select 1
    from public.profiles p
    join public.driver_applications da on da.user_id = p.id and da.status = 'approved'
    join public.driver_profiles dp on dp.driver_id = p.id
    where p.id = auth.uid() and p.role = 'driver'
  ) then
    raise exception 'Only verified drivers can change availability';
  end if;

  if p_is_online and (
    p_latitude is null or p_longitude is null
    or p_latitude not between -90 and 90
    or p_longitude not between -180 and 180
  ) then
    raise exception 'Valid GPS coordinates are required to go online';
  end if;

  insert into public.driver_presence(driver_id, is_online, updated_at)
  values (auth.uid(), p_is_online, now())
  on conflict (driver_id) do update
    set is_online = excluded.is_online, updated_at = now();

  if p_is_online then
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
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then return null; end if;

  update public.order_offers
  set status = 'expired', responded_at = now()
  where status = 'pending' and expires_at <= now();

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

  if v_order.pickup_lat is null or v_order.pickup_lng is null then return null; end if;

  select p.id into v_driver_id
  from public.profiles p
  join public.driver_applications da
    on da.user_id = p.id and da.status = 'approved'
  join public.driver_profiles dprof on dprof.driver_id = p.id
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
    select 1
    from public.profiles p
    join public.driver_applications da on da.user_id = p.id and da.status = 'approved'
    join public.driver_profiles dp on dp.driver_id = p.id
    where p.id = auth.uid() and p.role = 'driver'
  ) then
    raise exception 'Only verified drivers can accept orders';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found or v_order.status <> 'new' or v_order.driver_id is not null then
    raise exception 'This order is no longer available';
  end if;

  select * into v_offer from public.order_offers
  where order_id = p_order_id and driver_id = auth.uid()
    and status = 'pending' and expires_at > now()
  for update;
  if not found then raise exception 'Your offer has expired'; end if;

  v_price := coalesce(v_order.estimated_price_rub, v_order.price_rub);
  if v_price is null or v_price <= 0 then
    raise exception 'Server-quoted order price is missing';
  end if;
  if p_price_rub is not null and abs(p_price_rub - v_price) > 0.01 then
    raise exception 'Driver cannot change the quoted order price';
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

  insert into public.contact_shares(order_id, passenger_id, driver_id, expires_at)
  values (v_order.id, v_order.passenger_id, auth.uid(), now() + interval '4 hours')
  on conflict (order_id) do update
    set passenger_id = excluded.passenger_id,
        driver_id = excluded.driver_id,
        expires_at = excluded.expires_at;

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
    select 1 from public.profiles p
    join public.driver_applications da on da.user_id = p.id and da.status = 'approved'
    join public.driver_profiles dp on dp.driver_id = p.id
    where p.id = auth.uid() and p.role = 'driver'
  ) then raise exception 'Only verified drivers can decline offers'; end if;

  update public.order_offers
  set status = 'declined', responded_at = now()
  where order_id = p_order_id and driver_id = auth.uid()
    and status = 'pending' and expires_at > now();

  if not found then raise exception 'Offer is no longer active'; end if;
  return public.ladygo_dispatch_next_driver(p_order_id);
end;
$function$;
revoke all on function public.ladygo_decline_order(uuid) from public, anon;
grant execute on function public.ladygo_decline_order(uuid) to authenticated;

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
    select 1
    from public.profiles p
    join public.driver_applications da on da.user_id = p.id and da.status = 'approved'
    join public.driver_profiles dp on dp.driver_id = p.id
    where p.id = auth.uid() and p.role = 'driver'
  ) then
    raise exception 'Only verified drivers can update trip status';
  end if;

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

-- Auditable state changes; phone numbers and full addresses are intentionally
-- excluded from the event payload.
create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  event text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text not null check (actor_role in ('passenger','driver','admin','system')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists order_events_order_created_idx
  on public.order_events(order_id, created_at desc);
alter table public.order_events enable row level security;
drop policy if exists "participants and admins read order events" on public.order_events;
create policy "participants and admins read order events"
on public.order_events for select to authenticated
using (
  public.ladygo_is_admin()
  or exists (
    select 1 from public.orders o
    where o.id = order_events.order_id
      and (o.passenger_id = (select auth.uid()) or o.driver_id = (select auth.uid()))
  )
);
revoke insert, update, delete on public.order_events from anon, authenticated;

create or replace function public.ladygo_log_order_event()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_event text;
  v_payload jsonb;
begin
  select p.role into v_role from public.profiles p where p.id = v_actor;
  if tg_op = 'INSERT' then
    v_event := 'order_created';
    v_payload := jsonb_build_object('status', new.status, 'tariff_id', new.tariff_id);
  elsif new.status is distinct from old.status then
    v_event := 'status_changed';
    v_payload := jsonb_build_object('from', old.status, 'to', new.status);
  elsif new.driver_id is distinct from old.driver_id then
    v_event := 'driver_assigned';
    v_payload := jsonb_build_object('driver_assigned', new.driver_id is not null);
  else
    return new;
  end if;

  insert into public.order_events(order_id, event, actor_id, actor_role, payload)
  values (
    new.id, v_event, v_actor,
    case when v_role in ('passenger','driver','admin') then v_role else 'system' end,
    coalesce(v_payload, '{}'::jsonb)
  );
  return new;
end;
$function$;
revoke all on function public.ladygo_log_order_event() from public, anon, authenticated;
drop trigger if exists ladygo_order_event_log on public.orders;
create trigger ladygo_order_event_log
after insert or update of status, driver_id on public.orders
for each row execute function public.ladygo_log_order_event();

-- Contact access is a short-lived authorization lease, not a copy of phone data.
create table if not exists public.contact_shares (
  order_id uuid primary key references public.orders(id) on delete cascade,
  passenger_id uuid not null references public.profiles(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.contact_shares enable row level security;
drop policy if exists "active trip participants read contact lease" on public.contact_shares;
create policy "active trip participants read contact lease"
on public.contact_shares for select to authenticated
using (
  auth.uid() in (passenger_id, driver_id)
  and expires_at > now()
  and exists (
    select 1 from public.orders o
    where o.id = contact_shares.order_id
      and o.passenger_id = contact_shares.passenger_id
      and o.driver_id = contact_shares.driver_id
      and o.status in ('accepted','arrived','in_progress')
  )
);
revoke insert, update, delete on public.contact_shares from anon, authenticated;

-- Realtime is limited to the live GPS table; high-volume track history remains
-- queryable by trip participants but is not broadcast to every subscriber.
create table if not exists public.trip_tracks (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  actor_role text not null check (actor_role in ('passenger','driver')),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  heading double precision,
  speed_mps double precision,
  recorded_at timestamptz not null default now()
);
create index if not exists trip_tracks_order_time_idx
  on public.trip_tracks(order_id, recorded_at desc);
alter table public.trip_tracks enable row level security;
drop policy if exists "trip participants read tracks" on public.trip_tracks;
create policy "trip participants read tracks"
on public.trip_tracks for select to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = trip_tracks.order_id
      and (o.passenger_id = (select auth.uid()) or o.driver_id = (select auth.uid()))
  )
  or public.ladygo_is_admin()
);
revoke insert, update, delete on public.trip_tracks from anon, authenticated;

create or replace function public.ladygo_record_trip_location(
  p_order_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_heading double precision default null,
  p_speed_mps double precision default null
)
returns boolean
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_order public.orders%rowtype;
  v_role text;
  v_last public.trip_tracks%rowtype;
  v_elapsed double precision;
  v_distance_m double precision;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90
     or p_longitude not between -180 and 180
     or (p_speed_mps is not null and (p_speed_mps < 0 or p_speed_mps > 70)) then
    raise exception 'Invalid GPS sample';
  end if;

  select * into v_order from public.orders where id = p_order_id;
  if not found or v_order.status not in ('accepted','arrived','in_progress') then
    raise exception 'Trip is not active';
  end if;

  select role into v_role from public.profiles where id = auth.uid();
  if v_role = 'driver' and v_order.driver_id = auth.uid() then
    null;
  elsif v_role = 'passenger' and v_order.passenger_id = auth.uid() then
    null;
  else
    raise exception 'Not a trip participant';
  end if;

  select * into v_last from public.trip_tracks
  where order_id = p_order_id and actor_id = auth.uid()
  order by recorded_at desc limit 1;

  if found then
    v_elapsed := greatest(0.001, extract(epoch from (now() - v_last.recorded_at)));
    if v_elapsed < 4 then return false; end if;
    v_distance_m := 6371000 * 2 * asin(least(1.0, sqrt(
      power(sin(radians(p_latitude - v_last.latitude) / 2), 2)
      + cos(radians(v_last.latitude)) * cos(radians(p_latitude))
      * power(sin(radians(p_longitude - v_last.longitude) / 2), 2)
    )));
    if (v_distance_m / v_elapsed) > 70 then
      raise exception 'GPS sample exceeds plausible travel speed';
    end if;
  end if;

  insert into public.trip_tracks(
    order_id, actor_id, actor_role, latitude, longitude, heading, speed_mps
  ) values (
    p_order_id, auth.uid(), v_role, p_latitude, p_longitude, p_heading, p_speed_mps
  );

  if v_role = 'driver' then
    update public.driver_locations
    set latitude = p_latitude, longitude = p_longitude,
        heading = p_heading, updated_at = now()
    where driver_id = auth.uid();
  end if;

  return true;
end;
$function$;
revoke all on function public.ladygo_record_trip_location(uuid,double precision,double precision,double precision,double precision) from public, anon;
grant execute on function public.ladygo_record_trip_location(uuid,double precision,double precision,double precision,double precision) to authenticated;

grant select on public.order_events, public.contact_shares, public.trip_tracks to authenticated;

-- The scheduler invokes dispatch with the server-only Supabase service role.
grant execute on function public.ladygo_dispatch_next_driver(uuid) to service_role;
