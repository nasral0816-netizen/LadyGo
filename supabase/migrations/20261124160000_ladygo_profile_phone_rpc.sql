-- Allow each signed-in user to update only their own contact phone.
create or replace function public.ladygo_update_my_phone(p_phone text)
returns public.profiles
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $function$
declare
  v_phone text;
  v_profile public.profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  v_phone := nullif(regexp_replace(trim(coalesce(p_phone, '')), '[^0-9+]', '', 'g'), '');
  if v_phone is not null and v_phone !~ '^\+?[0-9]{7,15}$' then
    raise exception 'Invalid phone number';
  end if;

  update public.profiles
  set phone = v_phone
  where id = auth.uid()
  returning * into v_profile;

  if not found then
    raise exception 'Profile not found';
  end if;

  return v_profile;
end;
$function$;

revoke all on function public.ladygo_update_my_phone(text) from public, anon;
grant execute on function public.ladygo_update_my_phone(text) to authenticated;
