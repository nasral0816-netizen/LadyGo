-- Store Expo push tokens per approved driver device.
begin;

create table if not exists public.driver_push_tokens (
  driver_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null unique,
  device_platform text not null check (device_platform in ('android','ios','web')),
  updated_at timestamptz not null default now(),
  primary key (driver_id, expo_push_token)
);

alter table public.driver_push_tokens enable row level security;

drop policy if exists "drivers manage own push tokens" on public.driver_push_tokens;
create policy "drivers manage own push tokens"
on public.driver_push_tokens for all to authenticated
using (driver_id = auth.uid())
with check (
  driver_id = auth.uid()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'driver')
);

commit;
