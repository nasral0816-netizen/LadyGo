-- LadyGo 2.0 app compatibility and new-order notifications
begin;

-- Keep the fields used by the current mobile application.
alter table public.driver_applications
  add column if not exists license_info text;

-- A rejected applicant may apply again; only one pending/approved application is allowed.
alter table public.driver_applications
  drop constraint if exists driver_applications_user_id_key;

create unique index if not exists driver_applications_one_active_per_user
  on public.driver_applications(user_id)
  where status in ('pending','approved');

-- Notify every approved driver when a new passenger order is created.
create or replace function public.ladygo_notify_new_order()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'new' then
    insert into public.notifications(user_id, order_id, kind, title, body)
    select p.id, new.id, 'new_order', 'Новая заявка LadyGo',
      'Поступил новый заказ. Откройте список заявок, чтобы посмотреть маршрут.'
    from public.profiles p
    where p.role = 'driver';
  end if;
  return new;
end;
$$;

drop trigger if exists ladygo_new_order_notifications on public.orders;
create trigger ladygo_new_order_notifications
after insert on public.orders
for each row execute function public.ladygo_notify_new_order();

commit;
