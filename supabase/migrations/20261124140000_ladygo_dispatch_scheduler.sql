-- Optional Supabase pg_cron scheduler for unattended dispatch.
-- This migration does not create secrets. Add ladygo_dispatch_secret to Vault first.
do $$
declare v_secret text; v_command text;
begin
  if not exists(select 1 from pg_extension where extname='pg_cron')
     or not exists(select 1 from pg_extension where extname='pg_net') then
    raise notice 'LadyGo dispatch scheduler skipped: enable pg_cron and pg_net, then configure scheduler';
    return;
  end if;
  if to_regclass('vault.decrypted_secrets') is null then
    raise notice 'LadyGo dispatch scheduler skipped: configure Vault secret ladygo_dispatch_secret';
    return;
  end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets
    where name='ladygo_dispatch_secret' limit 1;
  if v_secret is null or length(v_secret)<32 then
    raise notice 'LadyGo dispatch scheduler skipped: Vault secret missing or too short';
    return;
  end if;
  v_command := $job$
    select net.http_post(
      url := 'https://itlzvcklnxznrtaqjttc.supabase.co/functions/v1/dispatch-loop',
      body := '{}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-ladygo-dispatch-secret',
        (select decrypted_secret from vault.decrypted_secrets where name='ladygo_dispatch_secret' limit 1)
      ),
      timeout_milliseconds := 10000
    );
  $job$;
  begin perform cron.unschedule('ladygo_dispatch_loop'); exception when others then null; end;
  perform cron.schedule('ladygo_dispatch_loop','* * * * *',v_command);
end $$;
