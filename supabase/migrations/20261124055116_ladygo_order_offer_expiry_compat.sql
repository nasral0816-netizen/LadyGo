-- Bring the existing legacy order_offers table forward to the current dispatch contract.
alter table public.order_offers
  add column if not exists offered_at timestamptz,
  add column if not exists expires_at timestamptz;

update public.order_offers
set offered_at = coalesce(offered_at, created_at, now()),
    expires_at = coalesce(expires_at, coalesce(created_at, now()) + interval '25 seconds');

alter table public.order_offers
  alter column offered_at set default now(),
  alter column offered_at set not null,
  alter column expires_at set default (now() + interval '25 seconds'),
  alter column expires_at set not null;

alter table public.order_offers
  drop constraint if exists order_offers_status_check;

alter table public.order_offers
  add constraint order_offers_status_check
  check (status = any (array['pending','accepted','declined','expired','cancelled','skipped']));

create index if not exists order_offers_driver_status_expiry_idx
  on public.order_offers(driver_id, status, expires_at);

create index if not exists order_offers_order_status_expiry_idx
  on public.order_offers(order_id, status, expires_at);

create unique index if not exists order_offers_one_pending_per_driver_idx
  on public.order_offers(driver_id) where status = 'pending';
