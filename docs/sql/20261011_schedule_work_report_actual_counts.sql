-- Adds accurate raw entry counts while preserving legacy grouped fields.
CREATE OR REPLACE FUNCTION public.schedule_work_report(p_period text DEFAULT 'day'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me record; today_kr date; from_date date; to_date date;
 result jsonb;
begin
 select id,center,role,is_schedule_admin into me from public.schedule_staff
 where auth_user_id=auth.uid() and is_active and not must_change_password;
 if not found or not (me.role in ('manager','director') or me.is_schedule_admin) then
  raise exception '관리자만 직원 일정 보고를 확인할 수 있습니다';
 end if;
 today_kr:=(now() at time zone 'Asia/Seoul')::date;
 if p_period='day' then from_date:=today_kr;to_date:=today_kr;
 elsif p_period='week' then from_date:=date_trunc('week',today_kr)::date;to_date:=from_date+6;
 elsif p_period='month' then from_date:=date_trunc('month',today_kr)::date;to_date:=(from_date+interval '1 month - 1 day')::date;
 else raise exception '잘못된 보고 기간입니다';end if;
 with raw_work_rows as(
   select e.payload->>'type' as work_type
   from public.schedule_events e
   join public.schedule_staff s on s.id=e.staff_id
   where s.is_active and s.managed_in_schedule
     and e.event_date between from_date and to_date
     and (me.is_schedule_admin or me.role='director' or s.center=me.center)
     and coalesce(e.payload->>'kind','work')='work'
     and e.payload->>'type'=any(array[
        '연차','반차','2시간 연차','반반차','출장','외부교육','내부교육','외부홍보','외근'
     ])
 ),work_rows as (
   select e.staff_id,s.center,s.display_name as staff,e.event_date,
     e.payload->>'type' as work_type,
     min(case when e.payload->>'allDay'='true' then '종일' else coalesce(e.payload->>'time','') end) as first_time,
     max(case when e.payload->>'allDay'='true' then '종일' else coalesce(e.payload->>'end','') end) as last_time,
     bool_or(e.payload->>'allDay'='true') as all_day,
     count(*) as slots
   from public.schedule_events e
   join public.schedule_staff s on s.id=e.staff_id
   where s.is_active and s.managed_in_schedule
     and e.event_date between from_date and to_date
     and (me.is_schedule_admin or me.role='director' or s.center=me.center)
     and coalesce(e.payload->>'kind','work')='work'
     and e.payload->>'type'=any(array[
        '연차','반차','2시간 연차','반반차','출장','외부교육','내부교육','외부홍보','외근'
       ])
   group by e.staff_id,s.center,s.display_name,e.event_date,e.payload->>'type'
 ),
 branches as (
   select center,count(*) as scheduled_types,count(distinct staff_id) as staff_count,
     count(*) filter(where work_type in ('연차','반차','2시간 연차','반반차')) as leave_count,
     count(*) filter(where work_type not in ('연차','반차','2시간 연차','반반차')) as external_count
   from work_rows group by center
 ),
 all_branches as (
   select distinct s.center
   from public.schedule_staff s
   where s.managed_in_schedule and s.is_active
    and (me.is_schedule_admin or me.role='director' or s.center=me.center)
 )
 select jsonb_build_object(
   'period',p_period,'from',from_date,'to',to_date,
   'scope',case when me.role='director' or me.is_schedule_admin then '전체 4개 지사' else me.center end,
   'totalStaff',coalesce((select count(distinct staff_id) from work_rows),0),
   'totalEntries',coalesce((select count(*) from work_rows),0),
   'actualTotalEntries',coalesce((select count(*) from raw_work_rows),0),
   'actualLeaveEntries',coalesce((select count(*) from raw_work_rows where work_type in ('연차','반차','2시간 연차','반반차')),0),
   'actualExternalEntries',coalesce((select count(*) from raw_work_rows where work_type not in ('연차','반차','2시간 연차','반반차')),0),
   'leaveEntries',coalesce((select count(*) from work_rows where work_type in ('연차','반차','2시간 연차','반반차')),0),
   'externalEntries',coalesce((select count(*) from work_rows where work_type not in ('연차','반차','2시간 연차','반반차')),0),
   'centers',coalesce((
      select jsonb_agg(jsonb_build_object(
        'center',a.center,
        'staff',coalesce(b.staff_count,0),
        'entries',coalesce(b.scheduled_types,0),
        'leave',coalesce(b.leave_count,0),
        'external',coalesce(b.external_count,0)
      ) order by case a.center when '남부본사' then 1 when '동구지사' then 2 when '북부센터' then 3 when '서부센터' then 4 else 9 end)
      from all_branches a left join branches b on b.center=a.center),'[]'::jsonb),
   'entries',coalesce((
      select jsonb_agg(jsonb_build_object(
       'center',center,'staff',staff,'date',event_date,
       'type',work_type,'allDay',all_day,'start',first_time,'end',last_time,'slots',slots
      ) order by event_date,center,staff,work_type) from work_rows),'[]'::jsonb)
 ) into result;
 return result;
end;
$function$
;
