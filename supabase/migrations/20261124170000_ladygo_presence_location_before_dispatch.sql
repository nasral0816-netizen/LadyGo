create or replace function public.ladygo_driver_heartbeat(
  p_is_online boolean,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_heading double precision default null
)
returns void
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null or not exists (
    select 1
    from public.profiles p
    join public.driver_applications da on da.user_id = p.id and da.status = 'approved'
    join public.driver_profiles dp on dp.driver_id = p.id
    where p.id = auth.uid() and p.role = 'driver'
  ) then
    raise exception 'Only verified drivers can change availability';
  end if;

  if p_is_online and (
    p_latitude is null or p_longitude is null
    or p_latitude not between -90 and 90
    or p_longitude not between -180 and 180
  ) then
    raise exception 'Valid GPS coordinates are required to go online';
  end if;

  -- Write the fresh location first: the presence trigger dispatches waiting
  -- orders immediately when the driver transitions to online.
  if p_is_online then
    insert into public.driver_locations(driver_id, latitude, longitude, heading, updated_at)
    values (auth.uid(), p_latitude, p_longitude, p_heading, now())
    on conflict (driver_id) do update set
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      heading = excluded.heading,
      updated_at = now();
  end if;

  insert into public.driver_presence(driver_id, is_online, updated_at)
  values (auth.uid(), p_is_online, now())
  on conflict (driver_id) do update
    set is_online = excluded.is_online, updated_at = now();
end;
$function$;
