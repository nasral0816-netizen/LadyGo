-- Give newly approved drivers offers for orders that are still waiting.
begin;

create or replace function public.ladygo_offer_waiting_orders_to_new_driver()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role = 'driver' and old.role is distinct from 'driver' then
    insert into public.order_offers(order_id, driver_id)
    select o.id, new.id
    from public.orders o
    where o.status = 'new'
      and o.driver_id is null
    on conflict (order_id, driver_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists ladygo_offer_waiting_orders_after_driver_approval on public.profiles;
create trigger ladygo_offer_waiting_orders_after_driver_approval
after update of role on public.profiles
for each row execute function public.ladygo_offer_waiting_orders_to_new_driver();

commit;
