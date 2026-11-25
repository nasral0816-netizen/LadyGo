-- Give each driver a strict 30-second response window.
-- Acceptance is already guarded by expires_at > now(); this aligns dispatch
-- and the default with the in-app countdown and push TTL.
alter table public.order_offers
  alter column expires_at set default (now() + interval '30 seconds');

create or replace function public.ladygo_dispatch_next_driver(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_order public.orders%rowtype;
  v_driver_id uuid;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then return null; end if;

  update public.order_offers
  set status = 'expired', responded_at = now()
  where order_id = p_order_id and status = 'pending' and expires_at <= now();

  if v_order.status <> 'new' or v_order.driver_id is not null
     or (v_order.scheduled_at is not null and v_order.scheduled_at > now()) then
    return null;
  end if;

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
  join public.driver_applications da on da.user_id = p.id and da.status = 'approved'
  join public.driver_profiles dprof on dprof.driver_id = p.id
  join public.driver_presence dp on dp.driver_id = p.id
    and dp.is_online = true and dp.updated_at >= now() - interval '90 seconds'
  join public.driver_locations dl on dl.driver_id = p.id
    and dl.updated_at >= now() - interval '90 seconds'
  where p.role = 'driver'
    and not exists (
      select 1 from public.order_offers pending
      where pending.driver_id = p.id and pending.status = 'pending'
        and pending.expires_at > now()
    )
    and not exists (
      select 1 from public.orders active
      where active.driver_id = p.id and active.status in ('accepted','arrived','in_progress')
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
  order by 6371.0 * acos(least(1.0, greatest(-1.0,
      sin(radians(v_order.pickup_lat)) * sin(radians(dl.latitude))
      + cos(radians(v_order.pickup_lat)) * cos(radians(dl.latitude))
      * cos(radians(dl.longitude - v_order.pickup_lng))
    ))) asc, dp.updated_at desc, p.created_at asc
  limit 1 for update of p skip locked;

  if v_driver_id is null then return null; end if;

  insert into public.order_offers(order_id, driver_id, status, offered_at, expires_at)
  values (p_order_id, v_driver_id, 'pending', now(), now() + interval '30 seconds')
  on conflict (order_id, driver_id) do nothing;

  return v_driver_id;
end;
$function$;
