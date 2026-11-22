-- LadyGo Kislovodsk tariff adjustments.
-- Женский retains its existing price; Детский is 25% above it on distance/time/waiting rates.

update public.city_tariff_configs
set name = 'Женский', updated_at = now()
where city_id = 'kislovodsk' and tariff_id = 'economy';

-- Delivery starts at 300 RUB and includes 2 km / 5 minutes, then uses
-- moderate distance/time rates. Existing fixed courier route price remains 300 RUB.

update public.city_tariff_configs
set name = 'Детский',
    min_price_rub = 87.50,
    city_per_km_rub = 13.75,
    city_per_min_rub = 5.625,
    out_per_km_rub = 22.50,
    out_per_min_rub = 5.625,
    wait_per_min_rub = 7.50,
    updated_at = now()
where city_id = 'kislovodsk' and tariff_id = 'comfort';

update public.city_tariff_configs
set name = 'Доставка',
    min_price_rub = 300,
    included_km = 2,
    included_min = 5,
    city_per_km_rub = 8,
    city_per_min_rub = 3,
    out_per_km_rub = 15,
    out_per_min_rub = 4,
    wait_per_min_rub = 6,
    updated_at = now()
where city_id = 'kislovodsk' and tariff_id = 'comfort_plus';
