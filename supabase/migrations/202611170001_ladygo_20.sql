-- LadyGo 2.0 additive migration
-- Review and run in Supabase SQL Editor after taking a database backup.
begin;

alter table public.orders add column if not exists destination_lat double precision;
alter table public.orders add column if not exists destination_lng double precision;
alter table public.orders add column if not exists arrived_at timestamptz;
alter table public.orders add column if not exists started_at timestamptz;
alter table public.orders add column if not exists completed_at timestamptz;
alter table public.orders add column if not exists cancelled_at timestamptz;
alter table public.orders add column if not exists cancellation_reason text;

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('new','accepted','arrived','in_progress','declined','cancelled','completed'));

alter table public.orders drop constraint if exists destination_coordinates_pair;
alter table public.orders add constraint destination_coordinates_pair check (
  (destination_lat is null and destination_lng is null) or
  (destination_lat between -90 and 90 and destination_lng between -180 and 180)
);

create table if not exists public.driver_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  full_name text not null,
  phone text not null,
  experience text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.driver_locations (
  driver_id uuid primary key references public.profiles(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  heading double precision,
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  address text not null,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  constraint saved_place_coordinates_pair check (
    (latitude is null and longitude is null) or
    (latitude between -90 and 90 and longitude between -180 and 180)
  )
);

alter table public.driver_applications enable row level security;
alter table public.driver_locations enable row level security;
alter table public.notifications enable row level security;
alter table public.saved_places enable row level security;

create or replace function public.ladygo_is_admin()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;
revoke all on function public.ladygo_is_admin() from public;
grant execute on function public.ladygo_is_admin() to authenticated;

drop policy if exists "driver applications read own or admin" on public.driver_applications;
create policy "driver applications read own or admin" on public.driver_applications
for select to authenticated using (user_id = auth.uid() or public.ladygo_is_admin());

drop policy if exists "driver applications create own" on public.driver_applications;
create policy "driver applications create own" on public.driver_applications
for insert to authenticated with check (
  user_id = auth.uid() and status = 'pending' and reviewed_by is null and reviewed_at is null
);

drop policy if exists "driver applications admin review" on public.driver_applications;
create policy "driver applications admin review" on public.driver_applications
for update to authenticated using (public.ladygo_is_admin())
with check (public.ladygo_is_admin());

drop policy if exists "driver location read assigned trip" on public.driver_locations;
create policy "driver location read assigned trip" on public.driver_locations
for select to authenticated using (
  driver_id = auth.uid()
  or exists (
    select 1 from public.orders o
    where o.driver_id = driver_locations.driver_id
      and o.passenger_id = auth.uid()
      and o.status in ('accepted','arrived','in_progress')
  )
  or public.ladygo_is_admin()
);

drop policy if exists "driver location upsert own" on public.driver_locations;
create policy "driver location upsert own" on public.driver_locations
for insert to authenticated with check (
  driver_id = auth.uid()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'driver')
);

drop policy if exists "driver location update own" on public.driver_locations;
create policy "driver location update own" on public.driver_locations
for update to authenticated using (driver_id = auth.uid())
with check (
  driver_id = auth.uid()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'driver')
);

drop policy if exists "notifications read own" on public.notifications;
create policy "notifications read own" on public.notifications
for select to authenticated using (user_id = auth.uid());

drop policy if exists "notifications mark own read" on public.notifications;
create policy "notifications mark own read" on public.notifications
for update to authenticated using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "saved places manage own" on public.saved_places;
create policy "saved places manage own" on public.saved_places
for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.ladygo_accept_order(p_order_id uuid, p_price numeric)
returns public.orders language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_order public.orders;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'driver') then
    raise exception 'Только одобренный водитель может принять заказ';
  end if;
  if p_price is null or p_price <= 0 then
    raise exception 'Укажи корректную стоимость поездки';
  end if;
  update public.orders
  set driver_id = auth.uid(), price_rub = p_price, status = 'accepted'
  where id = p_order_id and status = 'new' and driver_id is null
  returning * into v_order;
  if not found then raise exception 'Заказ уже принят или больше недоступен'; end if;
  return v_order;
end;
$$;
revoke all on function public.ladygo_accept_order(uuid,numeric) from public;
grant execute on function public.ladygo_accept_order(uuid,numeric) to authenticated;

create or replace function public.ladygo_update_trip_status(p_order_id uuid, p_status text)
returns public.orders language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_order public.orders;
begin
  if p_status not in ('arrived','in_progress','completed') then
    raise exception 'Недопустимый статус поездки';
  end if;
  update public.orders
  set status = p_status,
      arrived_at = case when p_status = 'arrived' then now() else arrived_at end,
      started_at = case when p_status = 'in_progress' then now() else started_at end,
      completed_at = case when p_status = 'completed' then now() else completed_at end
  where id = p_order_id and driver_id = auth.uid()
    and ((status = 'accepted' and p_status = 'arrived')
      or (status = 'arrived' and p_status = 'in_progress')
      or (status = 'in_progress' and p_status = 'completed'))
  returning * into v_order;
  if not found then raise exception 'Нельзя изменить статус: проверь назначение и текущий этап поездки'; end if;
  return v_order;
end;
$$;
revoke all on function public.ladygo_update_trip_status(uuid,text) from public;
grant execute on function public.ladygo_update_trip_status(uuid,text) to authenticated;

create or replace function public.ladygo_notify_order_change()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_title text; v_body text;
begin
  if new.status is not distinct from old.status then return new; end if;
  v_title := case new.status
    when 'accepted' then 'Водитель принял заказ'
    when 'arrived' then 'Водитель прибыл'
    when 'in_progress' then 'Поездка началась'
    when 'completed' then 'Поездка завершена'
    when 'cancelled' then 'Заказ отменён'
    when 'declined' then 'Заявка отклонена'
    else 'Обновление поездки' end;
  v_body := case new.status
    when 'accepted' then 'Стоимость поездки: ' || coalesce(new.price_rub::text, 'уточняется') || ' ₽'
    when 'arrived' then 'Водитель ожидает у места подачи.'
    when 'in_progress' then 'Желаем приятной поездки!'
    when 'completed' then 'Спасибо, что выбрали LadyGo.'
    when 'cancelled' then 'Заказ был отменён.'
    when 'declined' then 'Водитель не смог принять заявку.'
    else 'Статус вашей поездки изменился.' end;
  insert into public.notifications(user_id, order_id, kind, title, body)
  values (new.passenger_id, new.id, new.status, v_title, v_body);
  if new.driver_id is not null and new.driver_id is distinct from old.driver_id then
    insert into public.notifications(user_id, order_id, kind, title, body)
    values (new.driver_id, new.id, 'assigned', 'Новый заказ назначен вам', 'Откройте LadyGo, чтобы посмотреть детали.');
  end if;
  return new;
end;
$$;

drop trigger if exists ladygo_order_notifications on public.orders;
create trigger ladygo_order_notifications after update of status, driver_id on public.orders
for each row execute function public.ladygo_notify_order_change();

do $$ begin
  alter publication supabase_realtime add table public.driver_locations;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; when undefined_object then null; end $$;

commit;
