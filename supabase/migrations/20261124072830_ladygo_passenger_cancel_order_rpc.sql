create or replace function public.ladygo_cancel_my_order(p_order_id uuid, p_reason text default 'Отменено пассажиром')
returns public.orders
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare v_order public.orders%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.orders
  set status='cancelled', cancelled_at=now(),
      cancellation_reason=left(coalesce(nullif(trim(p_reason),''),'Отменено пассажиром'),300)
  where id=p_order_id and passenger_id=auth.uid() and status='new' and driver_id is null
  returning * into v_order;
  if not found then raise exception 'Заказ не найден, уже принят водителем или не может быть отменён'; end if;
  return v_order;
end;
$function$;
revoke all on function public.ladygo_cancel_my_order(uuid,text) from public,anon;
grant execute on function public.ladygo_cancel_my_order(uuid,text) to authenticated;