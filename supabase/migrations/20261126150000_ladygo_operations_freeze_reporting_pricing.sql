-- LadyGo operations, driver freeze, live line, reporting and editable pricing.
-- Additive migration: existing orders and profiles remain compatible.

alter table public.driver_presence add column if not exists online_since timestamptz;

alter table public.city_tariff_configs
  add column if not exists night_multiplier numeric(6,3) not null default 1.000,
  add column if not exists peak_multiplier numeric(6,3) not null default 1.000,
  add column if not exists weekend_multiplier numeric(6,3) not null default 1.000,
  add column if not exists surge_multiplier numeric(6,3) not null default 1.000,
  add column if not exists surge_driver_threshold integer not null default 2,
  add column if not exists child_surcharge_rub numeric(10,2) not null default 0,
  add column if not exists delivery_surcharge_rub numeric(10,2) not null default 0,
  add column if not exists commission_rate_pct numeric(5,2) not null default 0,
  add column if not exists updated_by uuid references public.profiles(id);

alter table public.city_tariff_configs
  drop constraint if exists city_tariff_configs_multipliers_check;
alter table public.city_tariff_configs
  add constraint city_tariff_configs_multipliers_check
  check (
    night_multiplier >= 1 and peak_multiplier >= 1 and weekend_multiplier >= 1
    and surge_multiplier >= 1 and surge_driver_threshold >= 0
    and child_surcharge_rub >= 0 and delivery_surcharge_rub >= 0
    and commission_rate_pct between 0 and 50
  );

create table if not exists public.driver_freezes (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  lifted_at timestamptz,
  lifted_by uuid references public.profiles(id),
  check (expires_at > created_at)
);
create index if not exists driver_freezes_active_idx
  on public.driver_freezes(driver_id, expires_at desc)
  where lifted_at is null;
alter table public.driver_freezes enable row level security;
drop policy if exists "admins read driver freezes" on public.driver_freezes;
create policy "admins read driver freezes" on public.driver_freezes
  for select to authenticated using (public.ladygo_is_admin());
revoke insert, update, delete on public.driver_freezes from anon, authenticated;

create or replace function public.ladygo_driver_is_frozen(p_driver_id uuid)
returns boolean
language sql stable security definer
set search_path = 'public', 'pg_temp'
as $$
  select exists (
    select 1 from public.driver_freezes f
    where f.driver_id = p_driver_id
      and f.lifted_at is null
      and f.expires_at > now()
  );
$$;
revoke all on function public.ladygo_driver_is_frozen(uuid) from public, anon, authenticated;
grant execute on function public.ladygo_driver_is_frozen(uuid) to service_role;

create or replace function public.ladygo_admin_freeze_driver(
  p_driver_id uuid,
  p_duration_hours integer,
  p_reason text
)
returns timestamptz
language plpgsql security definer
set search_path = 'public', 'pg_temp'
as $$
declare v_expiry timestamptz;
begin
  if not public.ladygo_is_admin() then raise exception 'Admin access required'; end if;
  if p_duration_hours not in (1,24,168,720) then
    raise exception 'Freeze duration must be 1, 24, 168 or 720 hours';
  end if;
  if length(btrim(coalesce(p_reason,''))) < 3 or length(btrim(p_reason)) > 500 then
    raise exception 'Укажи причину заморозки (от 3 до 500 символов).';
  end if;
  if not exists (
    select 1 from public.profiles p
    join public.driver_applications a on a.user_id=p.id and a.status='approved'
    where p.id=p_driver_id and p.role='driver'
  ) then raise exception 'Одобренный водитель не найден'; end if;

  update public.driver_freezes
    set lifted_at=now(), lifted_by=auth.uid()
    where driver_id=p_driver_id and lifted_at is null and expires_at>now();

  v_expiry := now() + make_interval(hours => p_duration_hours);
  insert into public.driver_freezes(driver_id,reason,created_by,expires_at)
    values(p_driver_id,btrim(p_reason),auth.uid(),v_expiry);

  insert into public.driver_presence(driver_id,is_online,updated_at)
    values(p_driver_id,false,now())
    on conflict(driver_id) do update set is_online=false,updated_at=now();
  return v_expiry;
end;
$$;
revoke all on function public.ladygo_admin_freeze_driver(uuid,integer,text) from public, anon;
grant execute on function public.ladygo_admin_freeze_driver(uuid,integer,text) to authenticated;

create or replace function public.ladygo_admin_unfreeze_driver(p_driver_id uuid)
returns boolean
language plpgsql security definer
set search_path = 'public', 'pg_temp'
as $$
begin
  if not public.ladygo_is_admin() then raise exception 'Admin access required'; end if;
  update public.driver_freezes set lifted_at=now(),lifted_by=auth.uid()
    where driver_id=p_driver_id and lifted_at is null and expires_at>now();
  insert into public.driver_presence(driver_id,is_online,updated_at)
    values(p_driver_id,false,now())
    on conflict(driver_id) do update set is_online=false,updated_at=now();
  return true;
end;
$$;
revoke all on function public.ladygo_admin_unfreeze_driver(uuid) from public, anon;
grant execute on function public.ladygo_admin_unfreeze_driver(uuid) to authenticated;

create or replace function public.ladygo_admin_list_live_drivers()
returns table(
  driver_id uuid, full_name text, phone text, is_online boolean,
  driver_status text, latitude double precision, longitude double precision,
  presence_updated_at timestamptz, online_since timestamptz,
  frozen_until timestamptz, freeze_reason text
)
language plpgsql stable security definer
set search_path = 'public', 'pg_temp'
as $$
begin
  if not public.ladygo_is_admin() then raise exception 'Admin access required'; end if;
  return query
  select p.id,
    coalesce(nullif(a.full_name,''),nullif(dp.display_name,''),'Водитель')::text,
    coalesce(dp.phone,p.phone)::text,
    coalesce(pr.is_online,false),
    case
      when f.expires_at is not null then 'frozen'
      when o.id is not null then 'in_order'
      when coalesce(pr.is_online,false) and pr.updated_at >= now()-interval '90 seconds' then 'available'
      when coalesce(pr.is_online,false) then 'stale'
      else 'offline'
    end::text,
    dl.latitude,dl.longitude,pr.updated_at,
    pr.online_since,
    f.expires_at,f.reason
  from public.profiles p
  join public.driver_applications a on a.user_id=p.id and a.status='approved'
  left join public.driver_profiles dp on dp.driver_id=p.id
  left join public.driver_presence pr on pr.driver_id=p.id
  left join public.driver_locations dl on dl.driver_id=p.id
  left join lateral (
    select max(df.expires_at) as expires_at, (array_agg(df.reason order by df.expires_at desc))[1] as reason
    from public.driver_freezes df
    where df.driver_id=p.id and df.lifted_at is null and df.expires_at>now()
  ) f on true
  left join lateral (
    select ord.id from public.orders ord
    where ord.driver_id=p.id and ord.status in ('accepted','arrived','in_progress')
    order by ord.created_at desc limit 1
  ) o on true
  where p.role='driver'
  order by coalesce(pr.is_online,false) desc, pr.updated_at desc nulls last, a.full_name;
end;
$$;
revoke all on function public.ladygo_admin_list_live_drivers() from public, anon;
grant execute on function public.ladygo_admin_list_live_drivers() to authenticated;

-- Replace heartbeat to enforce a freeze at the authoritative server boundary.
create or replace function public.ladygo_driver_heartbeat(
  p_is_online boolean,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_heading double precision default null
)
returns void language plpgsql security definer
set search_path = 'public', 'pg_temp'
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p
    join public.driver_applications da on da.user_id=p.id and da.status='approved'
    join public.driver_profiles dp on dp.driver_id=p.id
    where p.id=auth.uid() and p.role='driver'
  ) then raise exception 'Only verified drivers can change availability'; end if;
  if p_is_online and public.ladygo_driver_is_frozen(auth.uid()) then
    raise exception 'Водитель временно заморожен администратором и не может выйти на линию.';
  end if;
  if p_is_online and (
    p_latitude is null or p_longitude is null
    or p_latitude not between -90 and 90 or p_longitude not between -180 and 180
  ) then raise exception 'Valid GPS coordinates are required to go online'; end if;

  if p_is_online then
    insert into public.driver_locations(driver_id,latitude,longitude,heading,updated_at)
    values(auth.uid(),p_latitude,p_longitude,p_heading,now())
    on conflict(driver_id) do update set latitude=excluded.latitude,
      longitude=excluded.longitude,heading=excluded.heading,updated_at=now();
  end if;
  insert into public.driver_presence(driver_id,is_online,updated_at,online_since)
  values(auth.uid(),p_is_online,now(),case when p_is_online then now() else null end)
  on conflict(driver_id) do update set
    online_since=case
      when excluded.is_online and not public.driver_presence.is_online then now()
      when not excluded.is_online then null
      else public.driver_presence.online_since
    end,
    is_online=excluded.is_online,updated_at=now();
end;
$$;

-- Existing dispatch contract is preserved; frozen drivers are excluded from offers.
create or replace function public.ladygo_dispatch_next_driver(p_order_id uuid)
returns uuid language plpgsql security definer
set search_path = 'public', 'pg_temp'
as $$
declare v_order public.orders%rowtype; v_driver_id uuid;
begin
  select * into v_order from public.orders where id=p_order_id for update;
  if not found then return null; end if;
  update public.order_offers set status='expired',responded_at=now()
    where order_id=p_order_id and status='pending' and expires_at<=now();
  if v_order.status<>'new' or v_order.driver_id is not null
    or (v_order.scheduled_at is not null and v_order.scheduled_at>now()) then return null; end if;
  if exists(select 1 from public.order_offers where order_id=p_order_id and status='pending' and expires_at>now()) then return null; end if;
  if v_order.pickup_lat is null or v_order.pickup_lng is null then return null; end if;

  select p.id into v_driver_id
  from public.profiles p
  join public.driver_applications da on da.user_id=p.id and da.status='approved'
  join public.driver_profiles dprof on dprof.driver_id=p.id
  join public.driver_presence dp on dp.driver_id=p.id and dp.is_online=true and dp.updated_at>=now()-interval '90 seconds'
  join public.driver_locations dl on dl.driver_id=p.id and dl.updated_at>=now()-interval '90 seconds'
  where p.role='driver'
    and not public.ladygo_driver_is_frozen(p.id)
    and not exists(select 1 from public.order_offers x where x.driver_id=p.id and x.status='pending' and x.expires_at>now())
    and not exists(select 1 from public.orders x where x.driver_id=p.id and x.status in ('accepted','arrived','in_progress'))
    and not exists(select 1 from public.order_offers x where x.order_id=p_order_id and x.driver_id=p.id)
    and 6371.0*acos(least(1.0,greatest(-1.0,
      sin(radians(v_order.pickup_lat))*sin(radians(dl.latitude))
      +cos(radians(v_order.pickup_lat))*cos(radians(dl.latitude))*cos(radians(dl.longitude-v_order.pickup_lng))
    )))<=80
  order by 6371.0*acos(least(1.0,greatest(-1.0,
      sin(radians(v_order.pickup_lat))*sin(radians(dl.latitude))
      +cos(radians(v_order.pickup_lat))*cos(radians(dl.latitude))*cos(radians(dl.longitude-v_order.pickup_lng))
    ))) asc,dp.updated_at desc,p.created_at asc
  limit 1 for update of p skip locked;
  if v_driver_id is null then return null; end if;
  insert into public.order_offers(order_id,driver_id,status,offered_at,expires_at)
    values(p_order_id,v_driver_id,'pending',now(),now()+interval '30 seconds')
    on conflict(order_id,driver_id) do nothing;
  return v_driver_id;
end;
$$;
revoke all on function public.ladygo_dispatch_next_driver(uuid) from public, anon;
grant execute on function public.ladygo_dispatch_next_driver(uuid) to authenticated, service_role;

-- Re-check freeze after locking the order and before accepting the offer.
create or replace function public.ladygo_accept_order(p_order_id uuid,p_price numeric default null)
returns public.orders language plpgsql security definer
set search_path = 'public', 'pg_temp'
as $$
declare v_order public.orders%rowtype; v_offer public.order_offers%rowtype; v_price numeric(10,2);
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p
    join public.driver_applications da on da.user_id=p.id and da.status='approved'
    join public.driver_profiles dp on dp.driver_id=p.id
    where p.id=auth.uid() and p.role='driver'
  ) then raise exception 'Only verified drivers can accept orders'; end if;
  if public.ladygo_driver_is_frozen(auth.uid()) then
    raise exception 'Водитель заморожен и не может принимать заказы.';
  end if;
  select * into v_order from public.orders where id=p_order_id for update;
  if not found or v_order.status<>'new' or v_order.driver_id is not null then raise exception 'This order is no longer available'; end if;
  select * into v_offer from public.order_offers where order_id=p_order_id and driver_id=auth.uid()
    and status='pending' and expires_at>now() for update;
  if not found then raise exception 'Your offer has expired'; end if;
  v_price:=coalesce(v_order.estimated_price_rub,v_order.price_rub);
  if v_price is null or v_price<=0 then raise exception 'Server-quoted order price is missing'; end if;
  if p_price is not null and abs(p_price-v_price)>0.01 then raise exception 'Driver cannot change the quoted order price'; end if;
  update public.order_offers set status='accepted',responded_at=now() where id=v_offer.id;
  update public.order_offers set status='cancelled',responded_at=now()
    where order_id=p_order_id and id<>v_offer.id and status='pending';
  update public.orders set driver_id=auth.uid(),status='accepted',price_rub=v_price
    where id=p_order_id returning * into v_order;
  insert into public.contact_shares(order_id,passenger_id,driver_id,expires_at)
    values(v_order.id,v_order.passenger_id,auth.uid(),now()+interval '4 hours')
    on conflict(order_id) do update set passenger_id=excluded.passenger_id,
      driver_id=excluded.driver_id,expires_at=excluded.expires_at;
  return v_order;
end;
$$;
revoke all on function public.ladygo_accept_order(uuid,numeric) from public, anon;
grant execute on function public.ladygo_accept_order(uuid,numeric) to authenticated;

create or replace function public.ladygo_admin_report(p_start timestamptz,p_end timestamptz)
returns jsonb language plpgsql stable security definer
set search_path = 'public', 'pg_temp'
as $$
declare v_result jsonb;
begin
  if not public.ladygo_is_admin() then raise exception 'Admin access required'; end if;
  if p_start is null or p_end is null or p_end<=p_start or p_end-p_start>interval '366 days' then
    raise exception 'Период отчёта должен быть не более 366 дней.';
  end if;
  select jsonb_build_object(
    'period',jsonb_build_object('start',p_start,'end',p_end),
    'orders',jsonb_build_object(
      'total',count(*),
      'completed',count(*) filter(where o.status='completed'),
      'cancelled',count(*) filter(where o.status='cancelled'),
      'in_progress',count(*) filter(where o.status in ('new','accepted','arrived','in_progress'))
    ),
    'revenue_rub',coalesce(sum(coalesce(o.price_rub,o.estimated_price_rub,0)) filter(where o.status='completed'),0),
    'average_check_rub',coalesce(avg(coalesce(o.price_rub,o.estimated_price_rub,0)) filter(where o.status='completed'),0),
    'drivers_unique',count(distinct o.driver_id) filter(where o.driver_id is not null),
    'by_city',coalesce((select jsonb_agg(x) from (
      select coalesce(nullif(pq.city_id,''),'не указан') city,
        count(*) orders,
        coalesce(sum(coalesce(o2.price_rub,o2.estimated_price_rub,0)) filter(where o2.status='completed'),0) revenue_rub
      from public.orders o2
      left join public.price_quotes pq on pq.id=o2.price_quote_id
      where o2.created_at>=p_start and o2.created_at<p_end
      group by 1 order by 1
    ) x),'[]'::jsonb),
    'by_tariff',coalesce((select jsonb_agg(x) from (
      select coalesce(o3.tariff_id,'не указан') tariff,count(*) orders,
        coalesce(sum(coalesce(o3.price_rub,o3.estimated_price_rub,0)) filter(where o3.status='completed'),0) revenue_rub
      from public.orders o3 where o3.created_at>=p_start and o3.created_at<p_end
      group by 1 order by 1
    ) x),'[]'::jsonb),
    'drivers_on_line',(
      select count(*) from public.driver_presence dp
      join public.profiles p on p.id=dp.driver_id and p.role='driver'
      where dp.is_online and dp.updated_at>=now()-interval '90 seconds'
    ),
    'drivers_frozen',(
      select count(distinct f.driver_id) from public.driver_freezes f
      where f.lifted_at is null and f.expires_at>now()
    )
  ) into v_result
  from public.orders o where o.created_at>=p_start and o.created_at<p_end;
  return v_result;
end;
$$;
revoke all on function public.ladygo_admin_report(timestamptz,timestamptz) from public, anon;
grant execute on function public.ladygo_admin_report(timestamptz,timestamptz) to authenticated;

-- Only administrators may edit tariff configuration.
drop policy if exists "admins manage city tariff configs" on public.city_tariff_configs;
create policy "admins manage city tariff configs" on public.city_tariff_configs
  for all to authenticated
  using (public.ladygo_is_admin())
  with check (public.ladygo_is_admin());
