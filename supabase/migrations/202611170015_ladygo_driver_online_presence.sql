begin;
create table if not exists public.driver_presence (
  driver_id uuid primary key references public.profiles(id) on delete cascade,
  is_online boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.driver_presence enable row level security;
drop policy if exists "drivers read own presence" on public.driver_presence;
create policy "drivers read own presence" on public.driver_presence
for select to authenticated using (driver_id = (select auth.uid()));
drop policy if exists "drivers create own presence" on public.driver_presence;
create policy "drivers create own presence" on public.driver_presence
for insert to authenticated with check (driver_id = (select auth.uid())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'driver'));
drop policy if exists "drivers update own presence" on public.driver_presence;
create policy "drivers update own presence" on public.driver_presence
for update to authenticated using (driver_id = (select auth.uid()))
with check (driver_id = (select auth.uid())
  and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'driver'));

create or replace function public.ladygo_dispatch_next_driver(p_order_id uuid)
returns uuid language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_driver_id uuid;
begin
  if not exists (select 1 from public.orders where id = p_order_id and status = 'new' and driver_id is null) then return null; end if;
  if exists (select 1 from public.order_offers where order_id = p_order_id and status = 'pending') then return null; end if;
  select p.id into v_driver_id from public.profiles p
  join public.driver_presence dp on dp.driver_id = p.id and dp.is_online = true
  where p.role = 'driver' and not exists (
    select 1 from public.order_offers oo where oo.order_id = p_order_id and oo.driver_id = p.id
  )
  order by dp.updated_at desc, p.created_at asc, p.id asc limit 1;
  if v_driver_id is null then return null; end if;
  insert into public.order_offers(order_id, driver_id, status)
  values (p_order_id, v_driver_id, 'pending') on conflict (order_id, driver_id) do nothing;
  return v_driver_id;
end;
$$;
revoke all on function public.ladygo_dispatch_next_driver(uuid) from public, anon, authenticated;

create or replace function public.ladygo_handle_driver_presence_change()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_order_id uuid;
begin
  if new.is_online and (tg_op = 'INSERT' or old.is_online is distinct from true) then
    for v_order_id in select id from public.orders
      where status = 'new' and driver_id is null order by created_at asc
    loop perform public.ladygo_dispatch_next_driver(v_order_id); end loop;
  elsif not new.is_online and old.is_online is distinct from false then
    update public.order_offers set status = 'expired', responded_at = now()
    where driver_id = new.driver_id and status = 'pending';
  end if;
  return new;
end;
$$;
revoke all on function public.ladygo_handle_driver_presence_change() from public, anon, authenticated;
drop trigger if exists ladygo_driver_presence_dispatch on public.driver_presence;
create trigger ladygo_driver_presence_dispatch
after insert or update of is_online on public.driver_presence
for each row execute function public.ladygo_handle_driver_presence_change();
commit;
