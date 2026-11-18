begin;
alter table public.driver_applications add column if not exists review_note text;
alter table public.driver_applications add column if not exists license_info text;
drop trigger if exists on_driver_application_review on public.driver_applications;

create or replace function public.ladygo_is_admin()
returns boolean language sql stable security invoker
set search_path = public, pg_temp
as $$ select exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'); $$;
revoke all on function public.ladygo_is_admin() from public;
grant execute on function public.ladygo_is_admin() to authenticated;

create or replace function public.ladygo_review_driver_application()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Только администратор может проверять заявки';
  end if;
  if old.status = 'pending' and new.status in ('approved','rejected') then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
    if new.status = 'approved' then
      update public.profiles set role = 'driver', phone = new.phone where id = new.user_id;
    end if;
  elsif new.user_id is distinct from old.user_id
     or new.full_name is distinct from old.full_name
     or new.phone is distinct from old.phone
     or new.experience is distinct from old.experience
     or new.status is distinct from old.status then
    raise exception 'Недопустимое изменение заявки';
  end if;
  return new;
end;
$$;
revoke all on function public.ladygo_review_driver_application() from public, anon, authenticated;

drop policy if exists "driver read orders" on public.orders;
drop policy if exists "ladygo drivers read available and assigned orders" on public.orders;
drop policy if exists "passenger read own orders" on public.orders;
drop policy if exists "orders select by participant" on public.orders;
create policy "orders select by participant" on public.orders for select to authenticated
using (
  passenger_id = (select auth.uid()) or public.ladygo_is_admin()
  or (driver_id = (select auth.uid()) and exists (
    select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'driver'
  ))
  or (status = 'new' and driver_id is null
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'driver')
    and exists (select 1 from public.order_offers oo where oo.order_id = orders.id
      and oo.driver_id = (select auth.uid()) and oo.status = 'pending'))
);

drop policy if exists "driver update orders" on public.orders;
drop policy if exists "ladygo drivers decline available orders" on public.orders;
drop policy if exists "ladygo driver update offered or assigned orders" on public.orders;
drop policy if exists "passenger cancel own order" on public.orders;

drop policy if exists "read_applications" on public.driver_applications;
drop policy if exists "submit_own_application" on public.driver_applications;
drop policy if exists "admin_review_applications" on public.driver_applications;
drop policy if exists "driver applications read own or admin" on public.driver_applications;
drop policy if exists "driver applications create own" on public.driver_applications;
drop policy if exists "driver applications admin review" on public.driver_applications;
create policy "driver applications read own or admin" on public.driver_applications
for select to authenticated using (user_id = (select auth.uid()) or public.ladygo_is_admin());
create policy "driver applications create own" on public.driver_applications
for insert to authenticated with check (user_id = (select auth.uid()) and status = 'pending'
  and reviewed_by is null and reviewed_at is null);
create policy "driver applications admin review" on public.driver_applications
for update to authenticated using (public.ladygo_is_admin()) with check (public.ladygo_is_admin());

drop policy if exists "drivers read own order offers" on public.order_offers;
create policy "drivers read own order offers" on public.order_offers
for select to authenticated using (driver_id = (select auth.uid()));
drop policy if exists "drivers update own pending offers" on public.order_offers;
create policy "drivers update own pending offers" on public.order_offers
for update to authenticated using (driver_id = (select auth.uid()) and status = 'pending'
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'driver'))
with check (driver_id = (select auth.uid()) and status = 'skipped');

create or replace function public.ladygo_accept_order(p_order_id uuid, p_price numeric)
returns public.orders language plpgsql security invoker
set search_path = public, pg_temp
as $$
declare v_order public.orders;
begin
  if not exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'driver') then
    raise exception 'Только одобренный водитель может принять заказ';
  end if;
  if p_price is null or p_price <= 0 or p_price > 1000000 then
    raise exception 'Укажи корректную стоимость поездки';
  end if;
  if not exists (select 1 from public.order_offers where order_id = p_order_id
    and driver_id = (select auth.uid()) and status = 'pending') then
    raise exception 'Предложение уже пропущено или недоступно';
  end if;
  update public.orders set driver_id = (select auth.uid()), price_rub = p_price, status = 'accepted'
  where id = p_order_id and status = 'new' and driver_id is null returning * into v_order;
  if not found then raise exception 'Заказ уже принят или больше недоступен'; end if;
  return v_order;
end;
$$;
revoke all on function public.ladygo_accept_order(uuid,numeric) from public;
grant execute on function public.ladygo_accept_order(uuid,numeric) to authenticated;

create or replace function public.ladygo_update_trip_status(p_order_id uuid, p_status text)
returns public.orders language plpgsql security invoker
set search_path = public, pg_temp
as $$
declare v_order public.orders;
begin
  if p_status not in ('arrived','in_progress','completed') then raise exception 'Недопустимый статус поездки'; end if;
  update public.orders set status = p_status,
    arrived_at = case when p_status = 'arrived' then now() else arrived_at end,
    started_at = case when p_status = 'in_progress' then now() else started_at end,
    completed_at = case when p_status = 'completed' then now() else completed_at end
  where id = p_order_id and driver_id = (select auth.uid())
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

create or replace function public.ladygo_skip_order_offer(p_order_id uuid)
returns boolean language plpgsql security invoker
set search_path = public, pg_temp
as $$
declare v_changed integer;
begin
  if not exists (select 1 from public.profiles where id = (select auth.uid()) and role = 'driver') then
    raise exception 'Только водитель может пропустить предложение';
  end if;
  update public.order_offers set status = 'skipped', responded_at = now()
  where order_id = p_order_id and driver_id = (select auth.uid()) and status = 'pending';
  get diagnostics v_changed = row_count;
  return v_changed > 0;
end;
$$;
revoke all on function public.ladygo_skip_order_offer(uuid) from public;
grant execute on function public.ladygo_skip_order_offer(uuid) to authenticated;

create or replace function public.ladygo_close_order_offers()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'accepted' and old.status = 'new' then
    update public.order_offers set status = case when driver_id = new.driver_id then 'accepted' else 'expired' end,
      responded_at = now() where order_id = new.id and status = 'pending';
  elsif new.status in ('cancelled','completed') and old.status is distinct from new.status then
    update public.order_offers set status = 'expired', responded_at = now()
      where order_id = new.id and status = 'pending';
  end if;
  return new;
end;
$$;
revoke all on function public.ladygo_close_order_offers() from public, anon, authenticated;
drop trigger if exists ladygo_close_order_offers_trigger on public.orders;
create trigger ladygo_close_order_offers_trigger after update of status on public.orders
for each row execute function public.ladygo_close_order_offers();

create or replace function public.cancel_my_order(order_id uuid)
returns void language plpgsql security invoker
set search_path = public, pg_temp
as $$
begin
  update public.orders set status = 'cancelled', cancelled_at = now()
  where id = $1 and passenger_id = (select auth.uid()) and status = 'new' and driver_id is null;
  if not found then raise exception 'Можно отменить только собственную новую заявку'; end if;
end;
$$;
revoke all on function public.cancel_my_order(uuid) from public, anon;
grant execute on function public.cancel_my_order(uuid) to authenticated;

revoke all on function public.ladygo_notify_order_change() from public, anon, authenticated;
revoke all on function public.ladygo_notify_new_order() from public, anon, authenticated;
revoke all on function public.ladygo_create_order_offers() from public, anon, authenticated;
revoke all on function public.ladygo_offer_waiting_orders_to_new_driver() from public, anon, authenticated;
create index if not exists orders_passenger_id_idx on public.orders(passenger_id);
create index if not exists orders_driver_id_idx on public.orders(driver_id);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index if not exists driver_locations_updated_idx on public.driver_locations(updated_at desc);
commit;