-- Bind each server price quote to the exact pickup and destination coordinates.
-- Existing quote rows remain readable; legacy rows without coordinates cannot create new orders.
alter table public.price_quotes
  add column if not exists pickup_lat double precision,
  add column if not exists pickup_lng double precision,
  add column if not exists destination_lat double precision,
  add column if not exists destination_lng double precision;

alter table public.price_quotes
  drop constraint if exists ladygo_price_quotes_pickup_coordinates_pair;
alter table public.price_quotes
  add constraint ladygo_price_quotes_pickup_coordinates_pair
  check (
    (pickup_lat is null and pickup_lng is null)
    or (pickup_lat between -90 and 90 and pickup_lng between -180 and 180)
  );

alter table public.price_quotes
  drop constraint if exists ladygo_price_quotes_destination_coordinates_pair;
alter table public.price_quotes
  add constraint ladygo_price_quotes_destination_coordinates_pair
  check (
    (destination_lat is null and destination_lng is null)
    or (destination_lat between -90 and 90 and destination_lng between -180 and 180)
  );

create or replace function public.validate_ladygo_price_quote()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public'
as $function$
declare
  q public.price_quotes%rowtype;
begin
  if auth.uid() is null or auth.uid() <> new.passenger_id then
    raise exception 'Недопустимый владелец заказа.';
  end if;

  if new.price_quote_id is null then
    raise exception 'Для заказа требуется актуальная фиксация цены. Пересчитай стоимость.';
  end if;

  select * into q
  from public.price_quotes
  where id = new.price_quote_id
    and passenger_id = new.passenger_id
  for update;

  if not found or q.consumed_at is not null or q.expires_at <= now() then
    raise exception 'Фиксация цены истекла или уже использована. Пересчитай стоимость.';
  end if;

  if q.pickup_lat is null or q.pickup_lng is null
     or q.destination_lat is null or q.destination_lng is null
     or new.pickup_lat is null or new.pickup_lng is null
     or new.destination_lat is null or new.destination_lng is null
     or abs(q.pickup_lat - new.pickup_lat) > 0.00001
     or abs(q.pickup_lng - new.pickup_lng) > 0.00001
     or abs(q.destination_lat - new.destination_lat) > 0.00001
     or abs(q.destination_lng - new.destination_lng) > 0.00001 then
    raise exception 'Маршрут не совпадает с маршрутом подтверждённой цены. Пересчитай стоимость.';
  end if;

  if q.tariff_id <> new.tariff_id
     or q.amount_rub <> coalesce(new.estimated_price_rub, -1) then
    raise exception 'Цена заказа не совпадает с подтверждённым расчётом.';
  end if;

  new.price_rub := q.amount_rub;
  new.pricing_breakdown := q.breakdown;
  update public.price_quotes set consumed_at = now() where id = q.id;
  return new;
end;
$function$;
