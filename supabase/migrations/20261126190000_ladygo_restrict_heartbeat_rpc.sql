-- Keep the driver heartbeat callable only by signed-in clients.
-- The SECURITY DEFINER body additionally binds every write to auth.uid().
revoke all on function public.ladygo_driver_heartbeat(boolean,double precision,double precision,double precision) from public, anon;
grant execute on function public.ladygo_driver_heartbeat(boolean,double precision,double precision,double precision) to authenticated;
