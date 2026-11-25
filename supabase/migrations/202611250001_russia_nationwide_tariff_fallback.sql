-- Nationwide default tariffs let LadyGo calculate quotes throughout the Russian Federation.
-- City-specific rows override this baseline when configured by an administrator.
create unique index if not exists city_tariff_configs_city_tariff_uidx
  on public.city_tariff_configs (city_id, tariff_id);

insert into public.city_tariff_configs
  (city_id, tariff_id, name, min_price_rub, included_km, included_min,
   free_wait_min, wait_per_min_rub, city_per_km_rub, city_per_min_rub,
   out_per_km_rub, out_per_min_rub, pickup_free_km, pickup_free_min, active)
values
  ('russia_default', 'economy', 'Эконом — базовый тариф РФ', 120, 1, 2, 3, 8, 18, 5, 22, 5.5, 1.5, 4, true),
  ('russia_default', 'comfort', 'Комфорт — базовый тариф РФ', 180, 1, 2, 3, 10, 24, 6, 29, 6.5, 1.5, 4, true),
  ('russia_default', 'comfort_plus', 'Доставка — базовый тариф РФ', 250, 2, 5, 3, 8, 14, 4, 18, 4.5, 1.5, 4, true)
on conflict (city_id, tariff_id) do update set
  name = excluded.name,
  min_price_rub = excluded.min_price_rub,
  included_km = excluded.included_km,
  included_min = excluded.included_min,
  free_wait_min = excluded.free_wait_min,
  wait_per_min_rub = excluded.wait_per_min_rub,
  city_per_km_rub = excluded.city_per_km_rub,
  city_per_min_rub = excluded.city_per_min_rub,
  out_per_km_rub = excluded.out_per_km_rub,
  out_per_min_rub = excluded.out_per_min_rub,
  pickup_free_km = excluded.pickup_free_km,
  pickup_free_min = excluded.pickup_free_min,
  active = excluded.active,
  updated_at = now();
