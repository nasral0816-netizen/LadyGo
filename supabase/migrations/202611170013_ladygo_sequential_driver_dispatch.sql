begin;
create or replace function public.ladygo_dispatch_next_driver(p_order_id uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_driver_id uuid;
begin
  if not exists (select 1 from public.orders where id = p_order_id and status = 'new' and driver_id is null) then return null; end if;
  if exists (select 1 from public.order_offers where order_id = p_order_id and status = 'pending') then return null; end if;
  select p.id into v_driver_id from public.profiles p
  where p.role = 'driver' and not exists (
    select 1 from public.order_offers oo where oo.order_id = p_order_id and oo.driver_id = p.id
  )
  order by p.created_at asc, p.id asc limit 1;
  if v_driver_id is null then return null; end if;
  insert into public.order_offers(order_id, driver_id, status)
  values (p_order_id, v_driver_id, 'pending')
  on conflict (order_id, driver_id) do nothing;
  return v_driver_id;
end;
$$;
revoke all on function public.ladygo_dispatch_next_driver(uuid) from public, anon, authenticated;

create or replace function public.ladygo_create_order_offers()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'new' and new.driver_id is null then perform public.ladygo_dispatch_next_driver(new.id); end if;
  return new;
end;
$$;
revoke all on function public.ladygo_create_order_offers() from public, anon, authenticated;

create or replace function public.ladygo_offer_waiting_orders_to_new_driver()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_order_id uuid;
begin
  if new.role = 'driver' and old.role is distinct from 'driver' then
    for v_order_id in select id from public.orders where status = 'new' and driver_id is null order by created_at asc
    loop perform public.ladygo_dispatch_next_driver(v_order_id); end loop;
  end if;
  return new;
end;
$$;
revoke all on function public.ladygo_offer_waiting_orders_to_new_driver() from public, anon, authenticated;

create or replace function public.ladygo_dispatch_after_offer_response()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if old.status = 'pending' and new.status in ('skipped','expired') then
    perform public.ladygo_dispatch_next_driver(new.order_id);
  end if;
  return new;
end;
$$;
revoke all on function public.ladygo_dispatch_after_offer_response() from public, anon, authenticated;
drop trigger if exists ladygo_dispatch_after_offer_response_trigger on public.order_offers;
create trigger ladygo_dispatch_after_offer_response_trigger after update of status on public.order_offers
for each row execute function public.ladygo_dispatch_after_offer_response();

drop trigger if exists ladygo_create_order_offers_trigger on public.orders;
create trigger ladygo_create_order_offers_trigger after insert on public.orders
for each row execute function public.ladygo_create_order_offers();
drop trigger if exists ladygo_new_order_notifications on public.orders;

do $$
declare v_order_id uuid;
begin
  for v_order_id in select id from public.orders where status = 'new' and driver_id is null order by created_at asc
  loop perform public.ladygo_dispatch_next_driver(v_order_id); end loop;
end;
$$;

create or replace function public.ladygo_expire_stale_order_offers()
returns integer language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  update public.order_offers set status = 'expired', responded_at = now()
  where status = 'pending' and created_at < now() - interval '30 seconds';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.ladygo_expire_stale_order_offers() from public, anon, authenticated;
commit;