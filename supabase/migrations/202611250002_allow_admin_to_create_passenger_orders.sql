-- Permit the platform admin account to place passenger orders from the client app.
create or replace function public.ladygo_create_order_from_quote(
  p_pickup_address text, p_destination_address text,
  p_pickup_lat double precision, p_pickup_lng double precision,
  p_destination_lat double precision, p_destination_lng double precision,
  p_payment_method text, p_price_quote_id uuid
) returns public.orders language plpgsql security definer
set search_path to 'public', 'pg_temp' as $function$
declare v_uid uuid := auth.uid(); v_role text; v_quote public.price_quotes%rowtype; v_order public.orders%rowtype;
begin
  if v_uid is null then raise exception 'Authentication required'; end if;
  select role into v_role from public.profiles where id=v_uid;
  if v_role not in ('passenger','driver','admin') then raise exception 'Этот аккаунт не может создавать поездки'; end if;
  if v_role='driver' and not exists(select 1 from public.driver_applications where user_id=v_uid and status='approved') then raise exception 'Аккаунт водителя не прошёл проверку'; end if;
  if length(trim(coalesce(p_pickup_address,'')))<2 or length(trim(coalesce(p_destination_address,'')))<2 or p_pickup_lat not between -90 and 90 or p_pickup_lng not between -180 and 180 or p_destination_lat not between -90 and 90 or p_destination_lng not between -180 and 180 then raise exception 'Укажи корректные адреса и точки маршрута'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text,0));
  select * into v_order from public.orders where passenger_id=v_uid and status in ('new','accepted','arrived','in_progress') limit 1 for update;
  if found then return v_order; end if;
  select * into v_quote from public.price_quotes where id=p_price_quote_id and passenger_id=v_uid for update;
  if not found or v_quote.consumed_at is not null or v_quote.expires_at<=now() then raise exception 'Расчёт цены истёк или уже использован'; end if;
  if v_quote.pickup_lat is null or v_quote.pickup_lng is null or v_quote.destination_lat is null or v_quote.destination_lng is null or abs(v_quote.pickup_lat-p_pickup_lat)>0.00001 or abs(v_quote.pickup_lng-p_pickup_lng)>0.00001 or abs(v_quote.destination_lat-p_destination_lat)>0.00001 or abs(v_quote.destination_lng-p_destination_lng)>0.00001 then raise exception 'Маршрут не совпадает с расчётом цены'; end if;
  insert into public.orders(passenger_id,driver_id,pickup_address,destination_address,pickup_lat,pickup_lng,destination_lat,destination_lng,tariff_id,estimated_price_rub,payment_method,service_type,price_quote_id,status)
  values(v_uid,null,trim(p_pickup_address),trim(p_destination_address),p_pickup_lat,p_pickup_lng,p_destination_lat,p_destination_lng,v_quote.tariff_id,v_quote.amount_rub,case when p_payment_method='transfer_to_driver' then 'transfer_to_driver' else 'cash' end,case when v_quote.tariff_id='comfort_plus' then 'courier' else 'ride' end,v_quote.id,'new') returning * into v_order;
  return v_order;
end;
$function$;
