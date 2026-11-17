begin;
alter table public.order_offers add column if not exists push_sent_at timestamptz;

do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'ladygo_push_webhook_secret') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'),
      'ladygo_push_webhook_secret',
      'Private authentication secret for the LadyGo order-offer push webhook',
      null);
  end if;
end;
$$;

create or replace function public.ladygo_verify_push_webhook_secret(p_candidate text)
returns boolean language sql security definer
set search_path = vault, pg_temp
as $$
  select p_candidate is not null and exists (
    select 1 from vault.decrypted_secrets
    where name = 'ladygo_push_webhook_secret' and decrypted_secret = p_candidate
  );
$$;
revoke all on function public.ladygo_verify_push_webhook_secret(text) from public, anon, authenticated;
grant execute on function public.ladygo_verify_push_webhook_secret(text) to service_role;

create or replace function public.ladygo_dispatch_offer_push()
returns trigger language plpgsql security definer
set search_path = public, vault, net, pg_temp
as $$
declare v_secret text;
begin
  if new.status <> 'pending' then return new; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets
    where name = 'ladygo_push_webhook_secret';
  if v_secret is null then
    raise warning 'LadyGo push webhook secret is missing; offer push was not dispatched';
    return new;
  end if;
  perform net.http_post(
    url := 'https://itlzvcklnxznrtaqjttc.supabase.co/functions/v1/send-driver-offer-push',
    body := jsonb_build_object('record', to_jsonb(new)),
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-ladygo-webhook-secret', v_secret),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;
revoke all on function public.ladygo_dispatch_offer_push() from public, anon, authenticated;
drop trigger if exists ladygo_dispatch_offer_push_trigger on public.order_offers;
create trigger ladygo_dispatch_offer_push_trigger
after insert on public.order_offers for each row
execute function public.ladygo_dispatch_offer_push();
commit;