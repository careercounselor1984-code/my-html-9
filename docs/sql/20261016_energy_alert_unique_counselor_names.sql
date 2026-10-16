CREATE OR REPLACE FUNCTION public.schedule_energy_access_feed()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me record;today_kr date;next_day date;entries jsonb;alerts jsonb;
begin
 select id,center,role,is_schedule_admin into me from public.schedule_staff
 where auth_user_id=auth.uid() and is_active and not must_change_password;
 if not found or me.center<>'북부센터' or (me.role<>'manager' and not me.is_schedule_admin)
 then return jsonb_build_object('items','[]'::jsonb,'visits','[]'::jsonb);end if;
 today_kr:=(now() at time zone 'Asia/Seoul')::date;
 next_day:=public.schedule_next_business_day(today_kr);
 entries:=public.schedule_energy_access_summary(today_kr-1,today_kr+45);
 select coalesce(jsonb_agg(jsonb_build_object(
   'key','energy:'||(d.value->>'date')||':'||(d.value->>'signature'),
   'source','energy','kind','출입신청','scope','북부센터',
   'title','에너지고 학교 등록 · '||(d.value->>'date')||' · '||
      coalesce(people.names,'대상 확인 필요')||' ('||people.count::text||'명)',
   'date',d.value->>'date','seen',false
 ) order by d.value->>'date'),'[]'::jsonb)
 into alerts from jsonb_array_elements(entries) d(value)
 cross join lateral (
  select string_agg(n.name,' · ' order by n.name) as names,count(*) as count
  from (select distinct btrim(a.value->>'name') as name
   from jsonb_array_elements(coalesce(d.value->'appointments','[]'::jsonb)) a(value)
   where nullif(btrim(a.value->>'name'),'') is not null) n
 ) people
 where not (d.value->>'confirmed')::boolean
   and (d.value->>'date')::date between today_kr and next_day;
 return jsonb_build_object('items',alerts,'visits',entries);
end;
$function$;
