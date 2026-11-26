-- Add a standard passenger tariff while preserving legacy tariff IDs.
alter table public.city_tariff_configs
  drop constraint if exists city_tariff_configs_tariff_id_check;
alter table public.city_tariff_configs
  add constraint city_tariff_configs_tariff_id_check
  check (tariff_id in ('standard','economy','comfort','comfort_plus'));

alter table public.orders
  drop constraint if exists orders_tariff_id_valid;
alter table public.orders
  add constraint orders_tariff_id_valid
  check (tariff_id is null or tariff_id in ('standard','economy','comfort','comfort_plus','child'));

insert into public.city_tariff_configs(
 city_id,tariff_id,name,min_price_rub,included_km,included_min,free_wait_min,
 wait_per_min_rub,city_per_km_rub,city_per_min_rub,out_per_km_rub,out_per_min_rub,
 pickup_free_km,pickup_free_min,night_multiplier,peak_multiplier,weekend_multiplier,
 surge_multiplier,surge_driver_threshold,child_surcharge_rub,delivery_surcharge_rub,
 commission_rate_pct,active
)
select city_id,'standard','Обычный',min_price_rub,included_km,included_min,free_wait_min,
 wait_per_min_rub,city_per_km_rub,city_per_min_rub,out_per_km_rub,out_per_min_rub,
 pickup_free_km,pickup_free_min,night_multiplier,peak_multiplier,weekend_multiplier,
 surge_multiplier,surge_driver_threshold,0,0,commission_rate_pct,active
from public.city_tariff_configs where tariff_id='economy'
on conflict(city_id,tariff_id) do update set
 name=excluded.name,min_price_rub=excluded.min_price_rub,
 included_km=excluded.included_km,included_min=excluded.included_min,
 free_wait_min=excluded.free_wait_min,wait_per_min_rub=excluded.wait_per_min_rub,
 city_per_km_rub=excluded.city_per_km_rub,city_per_min_rub=excluded.city_per_min_rub,
 out_per_km_rub=excluded.out_per_km_rub,out_per_min_rub=excluded.out_per_min_rub,
 pickup_free_km=excluded.pickup_free_km,pickup_free_min=excluded.pickup_free_min,
 night_multiplier=excluded.night_multiplier,peak_multiplier=excluded.peak_multiplier,
 weekend_multiplier=excluded.weekend_multiplier,surge_multiplier=excluded.surge_multiplier,
 surge_driver_threshold=excluded.surge_driver_threshold,commission_rate_pct=excluded.commission_rate_pct;

update public.city_tariff_configs set name='Женский'
where tariff_id='economy';
update public.city_tariff_configs set name='Детский',child_surcharge_rub=50
where tariff_id='comfort';
update public.city_tariff_configs set name='Доставка',delivery_surcharge_rub=100
where tariff_id='comfort_plus';

insert into public.intercity_route_prices(from_city_id,to_city_id,tariff_id,fixed_price_rub,is_active)
values ('kislovodsk','stavropol','standard',6600,true),
       ('stavropol','kislovodsk','standard',6600,true)
on conflict(from_city_id,to_city_id,tariff_id) do update
set fixed_price_rub=excluded.fixed_price_rub,is_active=true,updated_at=now();
