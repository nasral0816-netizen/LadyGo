-- Permit server-calculated final fare only inside the authenticated trip completion RPC.
-- Existing direct client updates remain restricted by the original state-machine guard.
create or replace function public.guard_order_update()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_role text;
  v_server_finalization boolean := coalesce(
    current_setting('ladygo.finalize_order_id', true) = old.id::text,
    false
  );
begin
  select role into v_role from public.profiles where id = auth.uid();

  if new.passenger_id is distinct from old.passenger_id
     or new.pickup_address is distinct from old.pickup_address
     or new.destination_address is distinct from old.destination_address
     or new.pickup_lat is distinct from old.pickup_lat
     or new.pickup_lng is distinct from old.pickup_lng
     or new.destination_lat is distinct from old.destination_lat
     or new.destination_lng is distinct from old.destination_lng
     or new.requested_for is distinct from old.requested_for
     or new.notes is distinct from old.notes
     or new.tariff_id is distinct from old.tariff_id
     or new.payment_method is distinct from old.payment_method
     or new.created_at is distinct from old.created_at then
    raise exception 'Order details are immutable';
  end if;

  if v_role = 'driver' and old.status = 'new' and new.status = 'accepted'
     and new.driver_id = auth.uid() and new.price_rub > 0
     and exists (
       select 1 from public.order_offers oo
       where oo.order_id = old.id and oo.driver_id = auth.uid() and oo.status = 'accepted'
     ) then
    return new;
  end if;

  if v_role = 'driver' and old.driver_id = auth.uid()
     and new.driver_id = old.driver_id
     and (
       (
         new.price_rub = old.price_rub
         and (
           (old.status = 'accepted' and new.status = 'arrived')
           or (old.status = 'arrived' and new.status = 'in_progress')
           or (old.status = 'in_progress' and new.status = 'completed')
           or (old.status in ('accepted','arrived','in_progress') and new.status = 'cancelled')
         )
       )
       or (
         v_server_finalization
         and old.status = 'in_progress'
         and new.status = 'completed'
         and new.final_price_rub is not null
         and new.final_price_rub > 0
         and new.price_rub = new.final_price_rub
         and new.actual_distance_km > 0
         and new.actual_duration_min > 0
       )
     ) then
    return new;
  end if;

  if v_role = 'passenger' and old.passenger_id = auth.uid()
     and new.passenger_id = old.passenger_id
     and new.driver_id is not distinct from old.driver_id
     and old.status in ('new','accepted','arrived','in_progress')
     and new.status = 'cancelled' then
    return new;
  end if;

  if v_role = 'admin' and new.status in ('cancelled','completed') then
    return new;
  end if;

  raise exception 'Invalid order status transition';
end;
$function$;
