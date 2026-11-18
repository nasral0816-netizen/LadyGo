begin;

-- Водитель может удалить собственную координату при завершении смены.
grant delete on public.driver_locations to authenticated;
drop policy if exists "driver location delete own" on public.driver_locations;
create policy "driver location delete own"
on public.driver_locations
for delete to authenticated
using (
  driver_id = (select auth.uid())
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'driver'
  )
);

create index if not exists driver_presence_online_updated_idx
on public.driver_presence (updated_at desc)
where is_online = true;

-- Предлагаем заказ ближайшему водителю с актуальной геопозицией.
-- Координаты доступны диспетчерской функции, но не открываются другим водителям.
create or replace function public.ladygo_dispatch_next_driver(p_order_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_driver_id uuid;
begin
  if not exists (
    select 1 from public.orders
    where id = p_order_id and status = 'new' and driver_id is null
  ) then
    return null;
  end if;

  if exists (
    select 1 from public.order_offers
    where order_id = p_order_id and status = 'pending'
  ) then
    return null;
  end if;

  select p.id
    into v_driver_id
  from public.orders o
  join public.profiles p on p.role = 'driver'
  join public.driver_presence dp
    on dp.driver_id = p.id
   and dp.is_online = true
   and dp.updated_at >= now() - interval '2 minutes'
  left join public.driver_locations dl
    on dl.driver_id = p.id
  where o.id = p_order_id
    and o.status = 'new'
    and o.driver_id is null
    and not exists (
      select 1
      from public.order_offers oo
      where oo.order_id = p_order_id
        and oo.driver_id = p.id
    )
  order by
    case
      when o.pickup_lat is not null
       and o.pickup_lng is not null
       and dl.updated_at >= now() - interval '90 seconds'
      then 0 else 1
    end asc,
    case
      when o.pickup_lat is not null
       and o.pickup_lng is not null
       and dl.updated_at >= now() - interval '90 seconds'
      then
        6371.0 * acos(least(1.0, greatest(-1.0,
          sin(radians(o.pickup_lat)) * sin(radians(dl.latitude))
          + cos(radians(o.pickup_lat)) * cos(radians(dl.latitude))
          * cos(radians(dl.longitude - o.pickup_lng))
        )))
      else null
    end asc nulls last,
    dp.updated_at desc,
    p.created_at asc,
    p.id asc
  limit 1;

  if v_driver_id is null then
    return null;
  end if;

  insert into public.order_offers(order_id, driver_id, status)
  values (p_order_id, v_driver_id, 'pending')
  on conflict (order_id, driver_id) do nothing;

  return v_driver_id;
end;
$$;
revoke all on function public.ladygo_dispatch_next_driver(uuid)
from public, anon, authenticated;

-- Если приложение водителя не подтверждало активность 2 минуты,
-- автоматически снимаем его с линии. Существующий триггер освободит
-- его ожидающее предложение и передаст заказ следующему водителю.
create or replace function public.ladygo_expire_stale_order_offers()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  update public.order_offers
  set status = 'expired',
      responded_at = now()
  where status = 'pending'
    and created_at < now() - interval '30 seconds';

  get diagnostics v_count = row_count;

  update public.driver_presence
  set is_online = false,
      updated_at = now()
  where is_online = true
    and updated_at < now() - interval '2 minutes';

  return v_count;
end;
$$;
revoke all on function public.ladygo_expire_stale_order_offers()
from public, anon, authenticated;

commit;