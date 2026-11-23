-- Server-signed fare quotes and idempotent order creation. Additive only.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
    where conrelid='public.tariff_rates'::regclass and contype='c'
      and pg_get_constraintdef(oid) ilike '%tariff_id%'
  loop execute format('alter table public.tariff_rates drop constraint %I',c.conname); end loop;
end $$;
alter table public.tariff_rates add constraint ladygo_tariff_rates_id_check
  check (tariff_id in ('economy','comfort','child','comfort_plus'));
alter table public.tariff_rates add column if not exists per_minute_rub numeric(10,2) not null default 0 check (per_minute_rub >= 0);
insert into public.tariff_rates(tariff_id,base_fare_rub,per_km_rub,minimum_fare_rub,per_minute_rub,is_active)
values('comfort_plus',0,0,0,0,false) on conflict(tariff_id) do nothing;

alter table public.orders
  add column if not exists quote_base_fare_rub numeric(10,2),
  add column if not exists quote_per_km_rub numeric(10,2),
  add column if not exists quote_per_minute_rub numeric(10,2),
  add column if not exists quote_minimum_fare_rub numeric(10,2),
  add column if not exists quote_distance_km numeric(10,3),
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists final_price_rub numeric(10,2),
  add column if not exists actual_distance_km numeric(10,3),
  add column if not exists actual_duration_min integer;

create table if not exists public.ladygo_price_quotes(
  id uuid primary key, passenger_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique, tariff_id text not null,
  pickup_lat double precision not null check(pickup_lat between -90 and 90),
  pickup_lng double precision not null check(pickup_lng between -180 and 180),
  destination_lat double precision not null check(destination_lat between -90 and 90),
  destination_lng double precision not null check(destination_lng between -180 and 180),
  estimated_distance_km numeric(10,3) not null check(estimated_distance_km>0),
  estimated_duration_min integer not null check(estimated_duration_min>0),
  estimated_price_rub numeric(10,2) not null check(estimated_price_rub>0),
  base_fare_rub numeric(10,2) not null, per_km_rub numeric(10,2) not null,
  per_minute_rub numeric(10,2) not null, minimum_fare_rub numeric(10,2) not null,
  expires_at timestamptz not null, consumed_at timestamptz,
  order_id uuid references public.orders(id) on delete set null, created_at timestamptz not null default now()
);
create index if not exists ladygo_price_quotes_passenger_expiry_idx on public.ladygo_price_quotes(passenger_id,expires_at desc);
alter table public.ladygo_price_quotes enable row level security;
revoke all on public.ladygo_price_quotes from public,anon,authenticated;

create table if not exists public.ladygo_order_requests(
  id bigint generated always as identity primary key,
  passenger_id uuid not null references public.profiles(id) on delete cascade,
  idempotency_key text not null, order_id uuid not null references public.orders(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint ladygo_order_requests_user_key unique(passenger_id,idempotency_key)
);
alter table public.ladygo_order_requests enable row level security;
revoke all on public.ladygo_order_requests from public,anon,authenticated;

create or replace function public.ladygo_create_order_from_quote(
  p_passenger_id uuid,p_quote_id uuid,p_token_hash text,p_idempotency_key text,
  p_pickup_address text,p_destination_address text,p_payment_method text
) returns public.orders language plpgsql security definer set search_path='public','pg_temp'
as $function$
declare v_quote public.ladygo_price_quotes%rowtype; v_order public.orders%rowtype; v_existing_order_id uuid;
begin
  if p_passenger_id is null or p_quote_id is null or p_token_hash is null or length(p_token_hash)<>64
    or p_idempotency_key is null or length(p_idempotency_key)<12 or length(p_idempotency_key)>128
    or coalesce(length(trim(p_pickup_address)),0)<2 or coalesce(length(trim(p_destination_address)),0)<2
    or p_payment_method not in ('cash','card') then raise exception 'Invalid order request'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_passenger_id::text||':'||p_idempotency_key,0));
  select order_id into v_existing_order_id from public.ladygo_order_requests
    where passenger_id=p_passenger_id and idempotency_key=p_idempotency_key;
  if v_existing_order_id is not null then
    select * into v_order from public.orders where id=v_existing_order_id;
    if found then return v_order; end if;
  end if;
  select * into v_quote from public.ladygo_price_quotes
    where id=p_quote_id and passenger_id=p_passenger_id and token_hash=p_token_hash
      and expires_at>now() and consumed_at is null for update;
  if not found then raise exception 'Price quote is expired, already used, or invalid'; end if;
  if not exists(select 1 from public.profiles where id=p_passenger_id and role='passenger')
    then raise exception 'Only passenger accounts can create orders'; end if;
  insert into public.orders(
    passenger_id,driver_id,pickup_address,destination_address,pickup_lat,pickup_lng,
    destination_lat,destination_lng,passenger_phone,requested_for,notes,tariff_id,
    estimated_price_rub,payment_method,price_rub,status,quote_base_fare_rub,
    quote_per_km_rub,quote_per_minute_rub,quote_minimum_fare_rub,quote_distance_km
  ) values(
    p_passenger_id,null,trim(p_pickup_address),trim(p_destination_address),
    v_quote.pickup_lat,v_quote.pickup_lng,v_quote.destination_lat,v_quote.destination_lng,
    null,'Как можно скорее',null,v_quote.tariff_id,v_quote.estimated_price_rub,
    p_payment_method,null,'new',v_quote.base_fare_rub,v_quote.per_km_rub,
    v_quote.per_minute_rub,v_quote.minimum_fare_rub,v_quote.estimated_distance_km
  ) returning * into v_order;
  update public.ladygo_price_quotes set consumed_at=now(),order_id=v_order.id where id=v_quote.id;
  insert into public.ladygo_order_requests(passenger_id,idempotency_key,order_id)
    values(p_passenger_id,p_idempotency_key,v_order.id);
  return v_order;
end;
$function$;
revoke all on function public.ladygo_create_order_from_quote(uuid,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.ladygo_create_order_from_quote(uuid,uuid,text,text,text,text,text) to service_role;

create or replace function public.ladygo_update_trip_status(p_order_id uuid,p_status text)
returns public.orders language plpgsql security definer set search_path='public','pg_temp'
as $function$
declare v_order public.orders%rowtype; v_distance_km numeric(10,3); v_duration_min integer; v_final_price numeric(10,2);
begin
  if auth.uid() is null or not exists(
    select 1 from public.profiles p join public.driver_applications da on da.user_id=p.id and da.status='approved'
    join public.driver_profiles dp on dp.driver_id=p.id where p.id=auth.uid() and p.role='driver'
  ) then raise exception 'Only verified drivers can update trip status'; end if;
  if p_status not in ('arrived','in_progress','completed','cancelled') then raise exception 'Unsupported trip status'; end if;
  select * into v_order from public.orders where id=p_order_id and driver_id=auth.uid() for update;
  if not found then raise exception 'Trip not found'; end if;
  if not ((v_order.status='accepted' and p_status in ('arrived','cancelled'))
    or (v_order.status='arrived' and p_status in ('in_progress','cancelled'))
    or (v_order.status='in_progress' and p_status in ('completed','cancelled')))
    then raise exception 'Invalid trip status transition'; end if;
  if p_status='in_progress' then
    update public.orders set status=p_status,started_at=coalesce(started_at,now()) where id=p_order_id returning * into v_order;
  elsif p_status='completed' then
    if v_order.started_at is null then raise exception 'Trip start time is missing'; end if;
    with points as(
      select latitude,longitude,lag(latitude) over(order by recorded_at,id) prev_lat,
        lag(longitude) over(order by recorded_at,id) prev_lng
      from public.trip_tracks where order_id=p_order_id and actor_id=auth.uid() and actor_role='driver'
    ),segments as(
      select 6371.0*2*asin(least(1.0,sqrt(
        power(sin(radians(latitude-prev_lat)/2),2)
        +cos(radians(prev_lat))*cos(radians(latitude))*power(sin(radians(longitude-prev_lng)/2),2)
      ))) km from points where prev_lat is not null and prev_lng is not null
    ) select coalesce(sum(km),0)::numeric(10,3) into v_distance_km from segments;
    v_duration_min:=greatest(1,ceil(extract(epoch from(now()-v_order.started_at))/60.0)::integer);
    if v_distance_km<=0 then raise exception 'GPS track is not available; keep location enabled and retry'; end if;
    if v_order.quote_per_km_rub is null then raise exception 'Fare snapshot is missing for this order'; end if;
    v_final_price:=greatest(coalesce(v_order.quote_minimum_fare_rub,0),
      coalesce(v_order.quote_base_fare_rub,0)+v_distance_km*coalesce(v_order.quote_per_km_rub,0)
      +v_duration_min*coalesce(v_order.quote_per_minute_rub,0));
    update public.orders set status='completed',completed_at=now(),actual_distance_km=v_distance_km,
      actual_duration_min=v_duration_min,final_price_rub=round(v_final_price,2),price_rub=round(v_final_price,2)
      where id=p_order_id returning * into v_order;
    update public.driver_presence set is_online=false,updated_at=now() where driver_id=auth.uid();
  else
    update public.orders set status='cancelled' where id=p_order_id returning * into v_order;
    update public.driver_presence set is_online=false,updated_at=now() where driver_id=auth.uid();
  end if;
  return v_order;
end;
$function$;
revoke all on function public.ladygo_update_trip_status(uuid,text) from public,anon;
grant execute on function public.ladygo_update_trip_status(uuid,text) to authenticated;
