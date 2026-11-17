-- Driver-specific order offers: skipping affects only one driver.
begin;

create table if not exists public.order_offers (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','accepted','skipped','expired')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (order_id, driver_id)
);

create index if not exists order_offers_driver_pending_idx
  on public.order_offers(driver_id, created_at)
  where status = 'pending';

alter table public.order_offers enable row level security;

drop policy if exists "drivers read own order offers" on public.order_offers;
create policy "drivers read own order offers"
on public.order_offers for select to authenticated
using (driver_id = auth.uid());

drop policy if exists "drivers update own pending offers" on public.order_offers;
create policy "drivers update own pending offers"
on public.order_offers for update to authenticated
using (driver_id = auth.uid() and status = 'pending')
with check (driver_id = auth.uid() and status in ('skipped'));

create or replace function public.ladygo_create_order_offers()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'new' and new.driver_id is null then
    insert into public.order_offers(order_id, driver_id)
    select new.id, p.id
    from public.profiles p
    where p.role = 'driver'
    on conflict (order_id, driver_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists ladygo_create_order_offers_trigger on public.orders;
create trigger ladygo_create_order_offers_trigger
after insert on public.orders
for each row execute function public.ladygo_create_order_offers();

-- Backfill offers for orders that were already waiting when this migration is applied.
insert into public.order_offers(order_id, driver_id)
select o.id, p.id
from public.orders o
cross join public.profiles p
where o.status = 'new'
  and o.driver_id is null
  and p.role = 'driver'
on conflict (order_id, driver_id) do nothing;

create or replace function public.ladygo_skip_order_offer(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_changed integer;
begin
  update public.order_offers
  set status = 'skipped', responded_at = now()
  where order_id = p_order_id
    and driver_id = auth.uid()
    and status = 'pending';
  get diagnostics v_changed = row_count;
  return v_changed > 0;
end;
$$;

revoke all on function public.ladygo_skip_order_offer(uuid) from public;
grant execute on function public.ladygo_skip_order_offer(uuid) to authenticated;

create or replace function public.ladygo_accept_order(p_order_id uuid, p_price numeric)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders;
  v_has_offers boolean;
begin
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'driver'
  ) then
    raise exception 'Только одобренный водитель может принять заказ';
  end if;

  if p_price is null or p_price <= 0 or p_price > 1000000 then
    raise exception 'Укажи корректную стоимость поездки';
  end if;

  select exists (
    select 1 from public.order_offers where order_id = p_order_id
  ) into v_has_offers;

  if v_has_offers and not exists (
    select 1 from public.order_offers
    where order_id = p_order_id
      and driver_id = auth.uid()
      and status = 'pending'
  ) then
    raise exception 'Предложение уже пропущено или недоступно';
  end if;

  update public.orders
  set driver_id = auth.uid(),
      price_rub = p_price,
      status = 'accepted'
  where id = p_order_id
    and status = 'new'
    and driver_id is null
  returning * into v_order;

  if not found then
    raise exception 'Заказ уже принят или больше недоступен';
  end if;

  update public.order_offers
  set status = case when driver_id = auth.uid() then 'accepted' else 'expired' end,
      responded_at = now()
  where order_id = p_order_id
    and status = 'pending';

  return v_order;
end;
$$;

revoke all on function public.ladygo_accept_order(uuid,numeric) from public;
grant execute on function public.ladygo_accept_order(uuid,numeric) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.order_offers;
exception when duplicate_object then null; when undefined_object then null;
end $$;

commit;
