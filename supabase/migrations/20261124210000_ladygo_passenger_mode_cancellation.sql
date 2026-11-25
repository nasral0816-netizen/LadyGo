-- A driver account can also be the passenger who created a ride from Passenger mode.
-- Permit the authenticated owner to cancel their own unassigned/new order without changing
-- the role or weakening access to any other passenger's order.
create or replace function public.guard_order_update()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  actor_role text;
  request_role text;
begin
  select p.role into actor_role
  from public.profiles p
  where p.id = auth.uid();

  request_role := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif((nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'), '')
  );

  if request_role = 'service_role'
     and old.status = 'arrived'
     and new.status = old.status
     and old.driver_id is not null
     and new.driver_id = old.driver_id
     and (to_jsonb(new) - array['price_rub','estimated_price_rub','price_quote_id','pricing_breakdown'])
         = (to_jsonb(old) - array['price_rub','estimated_price_rub','price_quote_id','pricing_breakdown']) then
    return new;
  end if;

  if new.passenger_id is distinct from old.passenger_id
     or new.passenger_phone is distinct from old.passenger_phone
     or new.pickup_lat is distinct from old.pickup_lat
     or new.pickup_lng is distinct from old.pickup_lng
     or new.destination_lat is distinct from old.destination_lat
     or new.destination_lng is distinct from old.destination_lng
     or new.pickup_address is distinct from old.pickup_address
     or new.destination_address is distinct from old.destination_address
     or new.requested_for is distinct from old.requested_for
     or new.notes is distinct from old.notes
     or new.created_at is distinct from old.created_at
     or new.scheduled_at is distinct from old.scheduled_at
     or new.stops is distinct from old.stops
     or new.tariff_id is distinct from old.tariff_id
     or new.estimated_price_rub is distinct from old.estimated_price_rub
     or new.payment_method is distinct from old.payment_method then
    raise exception 'Данные заказа нельзя изменить после отправки';
  end if;

  if new.status = 'cancelled' and old.status in ('new','accepted','arrived')
     and new.driver_id is not distinct from old.driver_id
     and new.price_rub is not distinct from old.price_rub
     and new.cancelled_at is not null then
    if actor_role in ('passenger','driver') and old.passenger_id = auth.uid() then
      return new;
    elsif actor_role = 'driver' and old.driver_id = auth.uid()
       and old.status in ('accepted','arrived') then
      return new;
    end if;
  end if;

  if actor_role = 'driver' then
    if old.status = 'new' and new.status = 'accepted'
       and new.driver_id = auth.uid() and new.price_rub > 0 then
      return new;
    elsif old.status = 'new' and new.status = 'declined'
       and new.driver_id is null and new.price_rub is null then
      return new;
    elsif old.driver_id = auth.uid()
       and new.driver_id = old.driver_id
       and new.price_rub = old.price_rub
       and ((old.status = 'accepted' and new.status = 'arrived')
         or (old.status = 'arrived' and new.status = 'in_progress')
         or (old.status = 'in_progress' and new.status = 'completed')) then
      return new;
    end if;
  elsif actor_role = 'passenger'
        and old.passenger_id = auth.uid()
        and old.status = 'new'
        and new.status = 'cancelled'
        and new.driver_id is null
        and new.price_rub is null then
    return new;
  end if;

  raise exception 'Недопустимое изменение заказа';
end;
$function$;

create or replace function public.ladygo_cancel_active_order(p_order_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_order public.orders%rowtype;
  v_role text;
begin
  if auth.uid() is null then raise exception 'Требуется авторизация'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Заказ не найден'; end if;
  select role into v_role from public.profiles where id = auth.uid();

  if v_order.status not in ('new','accepted','arrived') then
    raise exception 'Эту поездку уже нельзя отменить через приложение';
  end if;

  if v_order.passenger_id = auth.uid() and v_role in ('passenger','driver') then
    null;
  elsif v_role = 'driver' and v_order.driver_id = auth.uid()
        and v_order.status in ('accepted','arrived') then
    null;
  else
    raise exception 'Нет прав на отмену этого заказа';
  end if;

  update public.orders
  set status = 'cancelled',
      cancelled_at = now(),
      cancellation_reason = nullif(left(trim(coalesce(p_reason,'')), 300), '')
  where id = p_order_id;
end;
$function$;

revoke all on function public.ladygo_cancel_active_order(uuid,text) from public, anon;
grant execute on function public.ladygo_cancel_active_order(uuid,text) to authenticated;
