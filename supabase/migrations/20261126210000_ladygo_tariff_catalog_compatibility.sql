-- Keep the legacy tariff_rates catalog compatible with the new standard tariff.
alter table public.tariff_rates
  drop constraint if exists tariff_rates_tariff_id_check;
alter table public.tariff_rates
  add constraint tariff_rates_tariff_id_check
  check (tariff_id in ('standard','economy','comfort','comfort_plus','child'));

insert into public.tariff_rates(tariff_id,base_fare_rub,per_km_rub,minimum_fare_rub,is_active,updated_at)
select 'standard',base_fare_rub,per_km_rub,minimum_fare_rub,is_active,now()
from public.tariff_rates where tariff_id='economy'
on conflict(tariff_id) do update set
 base_fare_rub=excluded.base_fare_rub,
 per_km_rub=excluded.per_km_rub,
 minimum_fare_rub=excluded.minimum_fare_rub,
 is_active=excluded.is_active,
 updated_at=now();

insert into public.intercity_route_prices(from_city_id,to_city_id,tariff_id,fixed_price_rub,is_active)
values ('kislovodsk','stavropol','economy',6600,true),
       ('stavropol','kislovodsk','economy',6600,true)
on conflict(from_city_id,to_city_id,tariff_id) do update
set fixed_price_rub=excluded.fixed_price_rub,is_active=true,updated_at=now();
