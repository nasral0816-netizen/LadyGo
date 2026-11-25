-- Serialize super-admin grants so concurrent requests cannot exceed 15 regular admins.
-- Existing roles and user records are preserved.
create or replace function public.ladygo_set_admin_by_email(
  target_email text,
  grant_access boolean
)
returns void
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  target public.profiles%rowtype;
  admin_count integer;
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.is_super_admin = true
  ) then
    raise exception 'Недостаточно прав';
  end if;

  -- Serialize only grants; a count-then-update without a transaction lock
  -- can allow two concurrent calls to both observe 14 and create admin #15/#16.
  if grant_access then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('ladygo_admin_cap_15', 0)
    );
  end if;

  if target_email is null or length(trim(target_email)) < 5 then
    raise exception 'Укажи корректный email';
  end if;

  select * into target
  from public.profiles
  where lower(email) = lower(trim(target_email))
  for update;

  if not found then
    raise exception 'Пользователь с таким email ещё не зарегистрирован';
  end if;

  if target.id = auth.uid() then
    raise exception 'Нельзя изменять собственные права главного администратора';
  end if;

  if target.is_super_admin then
    raise exception 'Главного администратора нельзя снять';
  end if;

  if grant_access then
    if target.role = 'admin' then
      return;
    end if;

    select count(*) into admin_count
    from public.profiles
    where role = 'admin' and is_super_admin = false;

    if admin_count >= 15 then
      raise exception 'Достигнут лимит: 15 обычных администраторов';
    end if;

    if target.role not in ('passenger', 'driver') then
      raise exception 'Эту роль нельзя назначить администратором';
    end if;

    update public.profiles
    set admin_previous_role = target.role,
        role = 'admin'
    where id = target.id;
  else
    if target.role <> 'admin' then
      return;
    end if;

    update public.profiles
    set role = case
      when admin_previous_role in ('passenger','driver') then admin_previous_role
      else 'passenger'
    end,
    admin_previous_role = null
    where id = target.id;
  end if;
end;
$function$;

revoke all on function public.ladygo_set_admin_by_email(text, boolean) from public, anon;
grant execute on function public.ladygo_set_admin_by_email(text, boolean) to authenticated, service_role;
