-- Explicit Data API grants for newly created public tables.
-- RLS policies continue to constrain authenticated users.
grant select on public.driver_freezes to authenticated, service_role;
grant select, insert, update, delete on public.service_cities to authenticated;
grant select on public.service_cities to service_role;
grant select, update on public.intercity_route_prices to authenticated;
grant select on public.intercity_route_prices to service_role;
grant select, update on public.city_tariff_configs to authenticated;
