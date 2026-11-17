-- LadyGo 2.0: let approved drivers see available and assigned orders.
begin;

drop policy if exists "ladygo drivers read available and assigned orders" on public.orders;
create policy "ladygo drivers read available and assigned orders"
on public.orders
for select
to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'driver'
  )
  and (
    (status = 'new' and driver_id is null)
    or driver_id = auth.uid()
  )
);

drop policy if exists "ladygo drivers decline available orders" on public.orders;
create policy "ladygo drivers decline available orders"
on public.orders
for update
to authenticated
using (
  status = 'new'
  and driver_id is null
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'driver'
  )
)
with check (
  status = 'declined'
  and driver_id is null
  and exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'driver'
  )
);

commit;
