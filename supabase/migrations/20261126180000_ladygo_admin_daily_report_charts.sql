create or replace function public.ladygo_admin_report(p_start timestamptz,p_end timestamptz)
returns jsonb language plpgsql stable security definer
set search_path = 'public', 'pg_temp'
as $$
declare v_result jsonb;
begin
  if not public.ladygo_is_admin() then raise exception 'Admin access required'; end if;
  if p_start is null or p_end is null or p_end<=p_start or p_end-p_start>interval '366 days' then
    raise exception 'Период отчёта должен быть не более 366 дней.';
  end if;
  select jsonb_build_object(
    'period',jsonb_build_object('start',p_start,'end',p_end),
    'orders',jsonb_build_object(
      'total',count(*),
      'completed',count(*) filter(where o.status='completed'),
      'cancelled',count(*) filter(where o.status='cancelled'),
      'in_progress',count(*) filter(where o.status in ('new','accepted','arrived','in_progress'))
    ),
    'revenue_rub',coalesce(sum(coalesce(o.price_rub,o.estimated_price_rub,0)) filter(where o.status='completed'),0),
    'average_check_rub',coalesce(avg(coalesce(o.price_rub,o.estimated_price_rub,0)) filter(where o.status='completed'),0),
    'commission_rub',coalesce((
      select sum(coalesce(ox.price_rub,ox.estimated_price_rub,0)*coalesce(ct.commission_rate_pct,0)/100)
      from public.orders ox
      left join public.price_quotes qx on qx.id=ox.price_quote_id
      left join public.city_tariff_configs ct on ct.city_id=qx.city_id and ct.tariff_id=ox.tariff_id
      where ox.created_at>=p_start and ox.created_at<p_end and ox.status='completed'
    ),0),
    'drivers_unique',count(distinct o.driver_id) filter(where o.driver_id is not null),
    'by_city',coalesce((select jsonb_agg(x) from (
      select coalesce(nullif(pq.city_id,''),'не указан') city,count(*) orders,
        coalesce(sum(coalesce(o2.price_rub,o2.estimated_price_rub,0)) filter(where o2.status='completed'),0) revenue_rub
      from public.orders o2 left join public.price_quotes pq on pq.id=o2.price_quote_id
      where o2.created_at>=p_start and o2.created_at<p_end
      group by 1 order by 1
    ) x),'[]'::jsonb),
    'by_tariff',coalesce((select jsonb_agg(x) from (
      select coalesce(o3.tariff_id,'не указан') tariff,count(*) orders,
        coalesce(sum(coalesce(o3.price_rub,o3.estimated_price_rub,0)) filter(where o3.status='completed'),0) revenue_rub
      from public.orders o3 where o3.created_at>=p_start and o3.created_at<p_end
      group by 1 order by 1
    ) x),'[]'::jsonb),
    'by_day',coalesce((select jsonb_agg(x order by x.day_key) from (
      select to_char(date_trunc('day',o4.created_at),'YYYY-MM-DD' ) day_key,
        count(*) orders,
        count(distinct o4.driver_id) filter(where o4.driver_id is not null) active_drivers,
        coalesce(sum(coalesce(o4.price_rub,o4.estimated_price_rub,0)) filter(where o4.status='completed'),0) revenue_rub
      from public.orders o4 where o4.created_at>=p_start and o4.created_at<p_end
      group by date_trunc('day',o4.created_at)
    ) x),'[]'::jsonb),
    'drivers_on_line',(
      select count(*) from public.driver_presence dp
      join public.profiles p on p.id=dp.driver_id and p.role='driver'
      where dp.is_online and dp.updated_at>=now()-interval '90 seconds'
    ),
    'drivers_frozen',(
      select count(distinct f.driver_id) from public.driver_freezes f
      where f.lifted_at is null and f.expires_at>now()
    )
  ) into v_result
  from public.orders o where o.created_at>=p_start and o.created_at<p_end;
  return v_result;
end;
$$;
revoke all on function public.ladygo_admin_report(timestamptz,timestamptz) from public, anon;
grant execute on function public.ladygo_admin_report(timestamptz,timestamptz) to authenticated;
