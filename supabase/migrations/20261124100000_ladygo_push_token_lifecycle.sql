-- Centralize push token registration and logout cleanup in authenticated RPCs.
-- The RPCs only write/delete rows owned by the current auth.uid().

create or replace function public.ladygo_register_push_token(
  p_expo_push_token text,
  p_device_platform text
)
returns void
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if p_expo_push_token is null
     or length(p_expo_push_token) < 20
     or length(p_expo_push_token) > 512 then
    raise exception 'Invalid Expo push token';
  end if;

  if p_device_platform is null or p_device_platform not in ('android','ios') then
    raise exception 'Unsupported device platform';
  end if;

  select role into v_role
  from public.profiles
  where id = v_user_id;
  if v_role is null then raise exception 'Profile not found'; end if;

  insert into public.user_push_tokens(
    user_id, expo_push_token, device_platform, updated_at
  ) values (
    v_user_id, p_expo_push_token, p_device_platform, now()
  )
  on conflict (user_id, expo_push_token)
  do update set device_platform = excluded.device_platform,
                updated_at = now();

  if v_role = 'driver' then
    insert into public.driver_push_tokens(
      driver_id, expo_push_token, device_platform, updated_at
    ) values (
      v_user_id, p_expo_push_token, p_device_platform, now()
    )
    on conflict (driver_id, expo_push_token)
    do update set device_platform = excluded.device_platform,
                  updated_at = now();
  else
    delete from public.driver_push_tokens
    where driver_id = v_user_id
      and expo_push_token = p_expo_push_token;
  end if;
end;
$function$;

revoke all on function public.ladygo_register_push_token(text,text) from public, anon;
grant execute on function public.ladygo_register_push_token(text,text) to authenticated;

create or replace function public.ladygo_unregister_push_token(p_expo_push_token text)
returns void
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  delete from public.user_push_tokens
  where user_id = auth.uid()
    and expo_push_token = p_expo_push_token;

  delete from public.driver_push_tokens
  where driver_id = auth.uid()
    and expo_push_token = p_expo_push_token;
end;
$function$;

revoke all on function public.ladygo_unregister_push_token(text) from public, anon;
grant execute on function public.ladygo_unregister_push_token(text) to authenticated;
