begin;
drop policy if exists "ladygo driver update offered or assigned orders" on public.orders;
drop policy if exists "passenger cancel own order" on public.orders;
create policy "orders update by participant" on public.orders for update to authenticated
using (
  (passenger_id = (select auth.uid()) and status = 'new' and driver_id is null)
  or (
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'driver')
    and (driver_id = (select auth.uid()) or (
      status = 'new' and driver_id is null and exists (
        select 1 from public.order_offers oo where oo.order_id = orders.id
          and oo.driver_id = (select auth.uid()) and oo.status = 'pending'
      )
    ))
  )
)
with check (
  (passenger_id = (select auth.uid()) and status = 'cancelled' and driver_id is null and price_rub is null)
  or (driver_id = (select auth.uid()) and status in ('accepted','arrived','in_progress','completed'))
);

drop policy if exists "profile read own" on public.profiles;
create policy "profile read own" on public.profiles for select to authenticated
using (id = (select auth.uid()));

drop policy if exists "passenger create own order" on public.orders;
create policy "passenger create own order" on public.orders for insert to authenticated
with check (passenger_id = (select auth.uid()) and driver_id is null and status = 'new' and price_rub is null);

drop policy if exists "driver location read assigned trip" on public.driver_locations;
create policy "driver location read assigned trip" on public.driver_locations for select to authenticated
using (
  driver_id = (select auth.uid()) or public.ladygo_is_admin()
  or exists (select 1 from public.orders o where o.driver_id = driver_locations.driver_id
    and o.passenger_id = (select auth.uid()) and o.status in ('accepted','arrived','in_progress'))
);
drop policy if exists "driver location upsert own" on public.driver_locations;
create policy "driver location upsert own" on public.driver_locations for insert to authenticated
with check (driver_id = (select auth.uid()) and exists (
  select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'driver'
));
drop policy if exists "driver location update own" on public.driver_locations;
create policy "driver location update own" on public.driver_locations for update to authenticated
using (driver_id = (select auth.uid()))
with check (driver_id = (select auth.uid()) and exists (
  select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'driver'
));

drop policy if exists "notifications read own" on public.notifications;
create policy "notifications read own" on public.notifications for select to authenticated
using (user_id = (select auth.uid()));
drop policy if exists "notifications mark own read" on public.notifications;
create policy "notifications mark own read" on public.notifications for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "saved places manage own" on public.saved_places;
create policy "saved places manage own" on public.saved_places for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "drivers manage own push tokens" on public.driver_push_tokens;
create policy "drivers manage own push tokens" on public.driver_push_tokens for all to authenticated
using (driver_id = (select auth.uid()) and exists (
  select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'driver'
))
with check (driver_id = (select auth.uid()) and exists (
  select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'driver'
));

create index if not exists notifications_order_id_idx on public.notifications(order_id);
create index if not exists saved_places_user_id_idx on public.saved_places(user_id);
commit;