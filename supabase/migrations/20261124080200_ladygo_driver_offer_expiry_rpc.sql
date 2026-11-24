create or replace function public.ladygo_expire_my_offer(p_order_id uuid)
returns boolean language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_changed integer;
begin
 if auth.uid() is null or not exists(select 1 from public.profiles p join public.driver_applications da on da.user_id=p.id and da.status='approved' where p.id=auth.uid() and p.role='driver') then raise exception 'Only verified drivers can expire their own offers'; end if;
 update public.order_offers set status='expired',responded_at=now()
 where order_id=p_order_id and driver_id=auth.uid() and status='pending' and expires_at<=now();
 get diagnostics v_changed=row_count; return v_changed>0;
end;$function$;
revoke all on function public.ladygo_expire_my_offer(uuid) from public,anon;
grant execute on function public.ladygo_expire_my_offer(uuid) to authenticated;