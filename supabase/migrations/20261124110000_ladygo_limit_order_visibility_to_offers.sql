-- Restrict available order visibility to the driver who actually received
-- the live offer. Admins retain the full order view; passengers retain their
-- own-order policy. Atomic accept/status changes continue through SECURITY
-- DEFINER RPCs and the order state-machine trigger.

drop policy if exists "driver read orders" on public.orders;
drop policy if exists "drivers read offered and assigned orders" on public.orders;

create policy "drivers read offered and assigned orders"
on public.orders
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and (
        p.role = 'admin'
        or (
          p.role = 'driver'
          and (
            orders.driver_id = (select auth.uid())
            or exists (
              select 1
              from public.order_offers oo
              where oo.order_id = orders.id
                and oo.driver_id = (select auth.uid())
                and oo.status = 'pending'
                and oo.expires_at > now()
            )
          )
        )
      )
  )
);
