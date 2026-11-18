create extension if not exists pg_cron with schema pg_catalog;
do $$
begin
  if exists (select 1 from cron.job where jobname = 'ladygo-expire-stale-offers') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'ladygo-expire-stale-offers';
  end if;
  perform cron.schedule('ladygo-expire-stale-offers', '* * * * *',
    'select public.ladygo_expire_stale_order_offers();');
end;
$$;
