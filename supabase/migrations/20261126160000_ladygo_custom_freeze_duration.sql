create or replace function public.ladygo_admin_freeze_driver(
  p_driver_id uuid,
  p_duration_hours integer,
  p_reason text
)
returns timestamptz
language plpgsql security definer
set search_path = 'public', 'pg_temp'
as $$
declare v_expiry timestamptz;
begin
  if not public.ladygo_is_admin() then raise exception 'Admin access required'; end if;
  if p_duration_hours is null or p_duration_hours < 1 or p_duration_hours > 8760 then
    raise exception 'Срок заморозки должен быть от 1 до 8760 часов.';
  end if;
  if length(btrim(coalesce(p_reason,''))) < 3 or length(btrim(p_reason)) > 500 then
    raise exception 'Укажи причину заморозки (от 3 до 500 символов).';
  end if;
  if not exists (
    select 1 from public.profiles p
    join public.driver_applications a on a.user_id=p.id and a.status='approved'
    where p.id=p_driver_id and p.role='driver'
  ) then raise exception 'Одобренный водитель не найден'; end if;

  update public.driver_freezes
    set lifted_at=now(), lifted_by=auth.uid()
    where driver_id=p_driver_id and lifted_at is null and expires_at>now();

  v_expiry := now() + make_interval(hours => p_duration_hours);
  insert into public.driver_freezes(driver_id,reason,created_by,expires_at)
    values(p_driver_id,btrim(p_reason),auth.uid(),v_expiry);

  insert into public.driver_presence(driver_id,is_online,updated_at,online_since)
    values(p_driver_id,false,now(),null)
    on conflict(driver_id) do update set is_online=false,online_since=null,updated_at=now();
  return v_expiry;
end;
$$;
revoke all on function public.ladygo_admin_freeze_driver(uuid,integer,text) from public, anon;
grant execute on function public.ladygo_admin_freeze_driver(uuid,integer,text) to authenticated;
