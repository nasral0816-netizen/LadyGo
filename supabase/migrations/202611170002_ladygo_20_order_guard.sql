-- LadyGo 2.0 compatibility patch for existing order guard and driver approval.
begin;

create or replace function public.guard_order_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_role text;
begin
  select p.role into actor_role
  from public.profiles p
  where p.id = auth.uid();

  if new.passenger_id is distinct from old.passenger_id
     or new.passenger_phone is distinct from old.passenger_phone
     or new.pickup_lat is distinct from old.pickup_lat
     or new.pickup_lng is distinct from old.pickup_lng
     or new.destination_lat is distinct from old.destination_lat
     or new.destination_lng is distinct from old.destination_lng
     or new.pickup_address is distinct from old.pickup_address
     or new.destination_address is distinct from old.destination_address
     or new.requested_for is distinct from old.requested_for
     or new.notes is distinct from old.notes
     or new.created_at is distinct from old.created_at then
    raise exception 'Данные заказа нельзя изменить после отправки';
  end if;

  if actor_role = 'driver' then
    if old.status = 'new' and new.status = 'accepted'
       and new.driver_id = auth.uid() and new.price_rub > 0 then
      return new;
    elsif old.status = 'new' and new.status = 'declined'
       and new.driver_id is null and new.price_rub is null then
      return new;
    elsif old.driver_id = auth.uid()
       and new.driver_id = old.driver_id
       and new.price_rub = old.price_rub
       and (
         (old.status = 'accepted' and new.status = 'arrived')
         or (old.status = 'arrived' and new.status = 'in_progress')
         or (old.status = 'in_progress' and new.status = 'completed')
       ) then
      return new;
    end if;
  elsif actor_role = 'passenger'
        and old.passenger_id = auth.uid()
        and old.status = 'new'
        and new.status = 'cancelled'
        and new.driver_id is null
        and new.price_rub is null then
    return new;
  end if;

  raise exception 'Недопустимое изменение заказа';
end;
$$;

create or replace function public.ladygo_review_driver_application()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status = 'pending' and new.status in ('approved','rejected') then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();

    if new.status = 'approved' then
      update public.profiles set role = 'driver', phone = new.phone
      where id = new.user_id;
    end if;
  elsif new.user_id is distinct from old.user_id
     or new.full_name is distinct from old.full_name
     or new.phone is distinct from old.phone
     or new.experience is distinct from old.experience
     or new.status is distinct from old.status then
    raise exception 'Изменять заявку может только администратор';
  end if;
  return new;
end;
$$;

drop trigger if exists ladygo_driver_application_review on public.driver_applications;
create trigger ladygo_driver_application_review
before update on public.driver_applications
for each row execute function public.ladygo_review_driver_application();

commit;
