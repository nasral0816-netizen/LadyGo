-- Security hardening for driver media and fare acceptance.
-- Existing objects and paths are preserved; only bucket visibility changes.

update storage.buckets
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'ladygo-driver-media';

-- Replace the owner-only SELECT policy with one that also permits:
-- 1) admins reviewing driver applications;
-- 2) a passenger to view only the assigned driver's avatar/car photo
--    during that passenger's active trip.
drop policy if exists "ladygo driver media read own for replacement" on storage.objects;
drop policy if exists "ladygo driver media read owner admin assigned passenger" on storage.objects;
create policy "ladygo driver media read owner admin assigned passenger"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'ladygo-driver-media'
  and (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    or exists (
      select 1 from public.profiles admin_profile
      where admin_profile.id = (select auth.uid())
        and admin_profile.role = 'admin'
    )
    or exists (
      select 1
      from public.driver_profiles dp
      join public.orders o on o.driver_id = dp.driver_id
      where dp.driver_id::text = (storage.foldername(name))[1]
        and name in (dp.avatar_url, dp.vehicle_photo_url)
        and o.passenger_id = (select auth.uid())
        and o.status in ('accepted','arrived','in_progress')
    )
  )
);

-- Preserve the existing insert/update/delete owner policies. They intentionally
-- restrict every object path to the authenticated user's own UUID folder.

-- The driver must never set or negotiate a fare by changing the RPC argument.
-- Keep the existing RPC signature for backwards compatibility, but derive the
-- accepted fare only from the server-stored order quote.
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
    select 1 from public.profiles
    where id = auth.uid() and role = 'driver'
  ) then
    raise exception 'Only approved drivers can accept orders';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found or v_order.status <> 'new' or v_order.driver_id is not null then
    raise exception 'This order is no longer available';
  end if;

  select * into v_offer
  from public.order_offers
  where order_id = p_order_id
    and driver_id = auth.uid()
    and status = 'pending'
    and expires_at > now()
  for update;

  if not found then
    raise exception 'Your offer has expired';
  end if;

  v_price := coalesce(v_order.estimated_price_rub, v_order.price_rub);
  if v_price is null or v_price <= 0 then
    raise exception 'Server-quoted order price is missing';
  end if;

  -- Old clients may still send p_price_rub. Reject a mismatch instead of
  -- allowing a driver to override the passenger's stored quote.
  if p_price_rub is not null and abs(p_price_rub - v_price) > 0.01 then
    raise exception 'Driver cannot change the quoted order price';
  end if;

  update public.order_offers
  set status = 'accepted', responded_at = now()
  where id = v_offer.id;

  update public.order_offers
  set status = 'cancelled', responded_at = now()
  where order_id = p_order_id
    and id <> v_offer.id
    and status = 'pending';

  update public.orders
  set driver_id = auth.uid(),
      status = 'accepted',
      price_rub = v_price
  where id = p_order_id
  returning * into v_order;

  return v_order;
end;
$function$;

revoke all on function public.ladygo_accept_order(uuid,numeric) from public, anon;
grant execute on function public.ladygo_accept_order(uuid,numeric) to authenticated;
