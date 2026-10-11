-- Goodjob shared-assignment/report-alert holiday table guard 2026-10-11
CREATE OR REPLACE FUNCTION public.schedule_shared_action(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 actor record; receiver record; post record; quota record;
 _id uuid; _staff uuid; _scope text; _kind text; _type text; _title text; _details text;
 _date date; _time text; _duration int; _start int; _finish int;
 _count int; _slots jsonb; _slot jsonb; _code text; _eid text; _previous record;
 _assign_id uuid; _can_manage boolean; _target_center text;
begin
 select s.id,s.center,s.role,s.display_name,s.is_schedule_admin,s.managed_in_schedule
 into actor from public.schedule_staff s
 where s.auth_user_id=auth.uid() and s.is_active and not s.must_change_password;
 if not found then raise exception '로그인한 활성 직원만 공유 일정을 이용할 수 있습니다';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception '요청 정보가 올바르지 않습니다';end if;

 if p_action='list' then
  return jsonb_build_object(
   'staff',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'center',s.center,'name',s.display_name,'role',s.role)
    order by s.center,s.display_name) from public.schedule_staff s
    where s.is_active and s.managed_in_schedule and s.center in ('남부본사','북부센터','동구지사','서부센터')),'[]'::jsonb),
   'posts',coalesce((select jsonb_agg(jsonb_build_object(
    'id',p.id,'kind',p.kind,'scope',p.scope,'title',p.title,'details',p.details,
    'consultType',p.consult_type,'date',p.work_date,'time',p.start_time,
    'duration',p.duration_minutes,'status',p.status,'creatorId',p.created_by,
    'creator',creator.display_name,'createdAt',p.created_at,
    'slots',coalesce((select jsonb_agg(jsonb_build_object(
      'center',q.center,'quota',q.required_count,
      'members',coalesce((select jsonb_agg(jsonb_build_object(
       'staffId',a.staff_id,'name',member.display_name,'by',manager.display_name,'own',a.assigned_by=a.staff_id)
       order by member.display_name)
       from public.schedule_shared_assignments a
       join public.schedule_staff member on member.id=a.staff_id
       join public.schedule_staff manager on manager.id=a.assigned_by
       where a.post_id=p.id and a.active and member.center=q.center),'[]'::jsonb))
      order by q.center) from public.schedule_shared_quotas q where q.post_id=p.id),'[]'::jsonb)
   ) order by p.work_date,p.start_time,p.created_at desc)
    from public.schedule_shared_posts p
    join public.schedule_staff creator on creator.id=p.created_by
    where p.status<>'deleted' and (p.scope='전체' or p.scope=actor.center or actor.is_schedule_admin or actor.role='director')
     and (p.work_date >= (now() at time zone 'Asia/Seoul')::date - 15
          or p.created_by=actor.id) and p.work_date<= (now() at time zone 'Asia/Seoul')::date+120
    ),'[]'::jsonb));
 end if;

 if p_action='create' then
  _kind=p_payload->>'kind';_scope=p_payload->>'scope';
  _type=coalesce(p_payload->>'consultType','신청');
  _title=btrim(coalesce(p_payload->>'title',''));
  _details=btrim(coalesce(p_payload->>'details',''));
  _date=(p_payload->>'date')::date;
  _time=p_payload->>'time';
  _duration=(p_payload->>'duration')::int;
  _slots=p_payload->'quotas';
  if _kind not in ('cover','promotion') or _scope not in ('전체','남부본사','북부센터','동구지사','서부센터')
   or length(_title) not between 2 and 100 or length(_details)>300 or
   _date is null or _date<(now() at time zone 'Asia/Seoul')::date
   or _date>(now() at time zone 'Asia/Seoul')::date+120 or
   _time is null or _time!~'^([01][0-9]|2[0-3]):(00|30)$' or
   _duration is null or _duration<30 or _duration>600 or mod(_duration,30)<>0 then
   raise exception '공유 일정의 제목·날짜·시간·기간을 확인하세요';
  end if;
  if _scope='전체' and not (actor.is_schedule_admin or actor.role='director') then
   raise exception '4개 지사 전체 일정은 관리자 또는 부장만 게시할 수 있습니다';
  end if;
  if _scope<>'전체' and actor.center<>_scope and not (actor.is_schedule_admin or actor.role='director') then
   raise exception '소속 지사의 일정만 게시할 수 있습니다';
  end if;
  if _kind='cover' then
   if _scope='전체' or _duration<>30 or _type not in ('초기','해석','IAP','컨설팅','재진단','훈련등록','카드발급','신청','일경험','연계')
    then raise exception '대신 상담은 단일 지사·30분 상담으로만 등록하세요';end if;
   if extract(isodow from _date) in (6,7) or (extract(isodow from _date)=5 and _time>='12:00') then
    raise exception '주말·금요일 12시 이후 상담 요청은 등록할 수 없습니다';
   end if;
  end if;
  _start=split_part(_time,':',1)::int*60+split_part(_time,':',2)::int;
  _finish=_start+_duration;
  if _start<360 or _finish>1440 then raise exception '근무시간은 06:00~24:00 범위에서 등록하세요';end if;
  if _kind='cover' and (_start<540 or (_start<780 and _start>=720) or (extract(isodow from _date)=5 and _finish>720) or _finish>1080) then
   raise exception '상담 요청 시간이 정규 상담시간 범위를 벗어납니다';end if;
  if _date=(now() at time zone 'Asia/Seoul')::date and _start <=
   (extract(hour from now() at time zone 'Asia/Seoul')::int*60+
    extract(minute from now() at time zone 'Asia/Seoul')::int) then
    raise exception '이미 지난 시간으로 공유 일정을 등록할 수 없습니다';end if;
  if _kind='cover' and exists(select 1 from public.schedule_closures c where c.center in ('all',_scope)
    and c.payload->>'start'<=_date::text and c.payload->>'end'>=_date::text) then
    raise exception '센터 휴무일에는 대신 상담을 요청할 수 없습니다';end if;
  if _kind='cover' and exists(select 1 from public.schedule_business_holidays h where h.holiday_date=_date) then
   raise exception '공휴일에는 대신 상담을 요청할 수 없습니다'; end if;
  if _kind='cover' and extract(year from _date)::int > (select coalesce(max(extract(year from holiday_date))::int,2026) from public.schedule_business_holidays) then
   raise exception '요청 연도의 공휴일 자료가 아직 확인되지 않았습니다'; end if;
  if _kind='cover' then
   _slots=jsonb_build_object(_scope,1);
  elsif _slots is null or jsonb_typeof(_slots)<>'object' then
   raise exception '필요한 지사별 인원을 입력하세요';end if;
  if (select count(*) from jsonb_each_text(_slots))=0 or
     (select count(*) from jsonb_each_text(_slots))>4 then raise exception '지사별 모집 인원을 확인하세요';end if;
  if _scope<>'전체' and (select count(*) from jsonb_each_text(_slots))<>1 then
   raise exception '지사 일정은 해당 지사 인원만 지정하세요';end if;
  insert into public.schedule_shared_posts(kind,scope,title,details,consult_type,work_date,start_time,duration_minutes,created_by)
  values(_kind,_scope,_title,_details,case when _kind='cover' then _type else null end,
  _date,_time,_duration,actor.id) returning id into _id;
  for _code,_slot in select key,value from jsonb_each(_slots) loop
   if _code not in ('남부본사','북부센터','동구지사','서부센터') or
    (_scope<>'전체' and _code<>_scope) or
    jsonb_typeof(_slot)<>'number' or (_slot::text)::int<1 or (_slot::text)::int>30 then
    raise exception '지사별 필요 인원은 1~30명으로 설정하세요';end if;
   insert into public.schedule_shared_quotas(post_id,center,required_count)
   values(_id,_code,(_slot::text)::int);
  end loop;
  return jsonb_build_object('ok',true,'id',_id,'action','created');
 end if;

 _id=(p_payload->>'postId')::uuid;
 if _id is null then raise exception '공유 일정이 지정되지 않았습니다';end if;
 perform pg_advisory_xact_lock(hashtext('sharedpost'),hashtext(_id::text));
 select * into post from public.schedule_shared_posts where id=_id for update;
 if not found then raise exception '공유 일정을 찾을 수 없습니다';end if;
 if post.scope<>'전체' and post.scope<>actor.center and not (actor.is_schedule_admin or actor.role='director') then
   raise exception '다른 지사의 공유 일정은 처리할 수 없습니다';end if;

 if p_action='cancel' then
  if post.created_by<>actor.id and not actor.is_schedule_admin and actor.role<>'director'
     and not (actor.role='manager' and actor.center=post.scope) then
   raise exception '작성자 또는 해당 지사 관리자만 취소할 수 있습니다';end if;
  if post.status='cancelled' then return jsonb_build_object('ok',true,'action','alreadyCancelled');end if;
  update public.schedule_shared_posts set status='cancelled',updated_at=now() where id=_id;
  delete from public.schedule_events e where e.id in
    (select a.calendar_event_id from public.schedule_shared_assignments a where a.post_id=_id and a.active and a.calendar_event_id is not null);
  update public.schedule_shared_assignments set active=false,calendar_event_id=null,updated_at=now() where post_id=_id and active;
  return jsonb_build_object('ok',true,'action','cancelled');
 end if;

 if post.status<>'open' then raise exception '이미 종료된 공유 일정입니다';end if;
 if p_action not in ('join','assign','leave') then raise exception '지원되지 않는 작업입니다';end if;
 _staff=case when p_action='join' then actor.id else
   case when p_payload->>'staffId' is null then actor.id else (p_payload->>'staffId')::uuid end end;
 select * into receiver from public.schedule_staff s where s.id=_staff and s.is_active and s.managed_in_schedule;
 if not found then raise exception '지정한 상담사를 찾을 수 없습니다';end if;
 if p_action='join' and not actor.managed_in_schedule then raise exception '부장은 직접 참여 신청할 수 없습니다';end if;
 if post.kind='cover' and receiver.id=post.created_by then
   raise exception '요청을 올린 상담사는 본인 요청을 직접 수락할 수 없습니다';
 end if;
 if p_action='assign' and not (actor.is_schedule_admin or actor.role='director'
   or (actor.role='manager' and actor.center=receiver.center)) then
   raise exception '해당 지사 팀장 또는 관리자가 직원 참여를 지정할 수 있습니다';end if;
 if receiver.center<>post.scope and post.scope<>'전체' then raise exception '모집 대상 지사가 아닙니다';end if;
 select * into quota from public.schedule_shared_quotas q where q.post_id=_id and q.center=receiver.center;
 if not found then raise exception '해당 지사는 모집 대상이 아닙니다';end if;
 perform pg_advisory_xact_lock(hashtext(receiver.id::text),hashtext(post.work_date::text));
 select * into _previous from public.schedule_shared_assignments a
 where a.post_id=_id and a.staff_id=receiver.id for update;

 if p_action='leave' then
  if _previous.post_id is null or not _previous.active then raise exception '참여 중인 직원이 아닙니다';end if;
  if receiver.id<>actor.id and not actor.is_schedule_admin and actor.role<>'director'
   and not (actor.role='manager' and actor.center=receiver.center) then
   raise exception '본인 또는 해당 지사 관리자가 참여를 취소할 수 있습니다';end if;
  if _previous.calendar_event_id is not null then
    delete from public.schedule_events where id=_previous.calendar_event_id and staff_id=receiver.id;
  end if;
  update public.schedule_shared_assignments set active=false,calendar_event_id=null,
   updated_at=now() where post_id=_id and staff_id=receiver.id;
  return jsonb_build_object('ok',true,'action','left','staff',receiver.display_name);
 end if;

 if found and _previous.active then return jsonb_build_object('ok',true,'action','alreadyJoined','staff',receiver.display_name);end if;
 select count(*) into _count from public.schedule_shared_assignments a
 join public.schedule_staff s on s.id=a.staff_id where a.post_id=_id and a.active and s.center=receiver.center;
 if _count>=quota.required_count then raise exception '해당 지사 모집 인원이 모두 찼습니다';end if;
 if post.work_date < (now() at time zone 'Asia/Seoul')::date then raise exception '이미 지난 일정입니다';end if;
 _start=split_part(post.start_time,':',1)::int*60+split_part(post.start_time,':',2)::int;
 _finish=_start+post.duration_minutes;
 _time=case when _finish=1440 then '24:00' else to_char(make_time(_finish/60%24,_finish%60,0),'HH24:MI') end;
 if post.work_date=(now() at time zone 'Asia/Seoul')::date and _start<=
    (extract(hour from now() at time zone 'Asia/Seoul')::int*60+
     extract(minute from now() at time zone 'Asia/Seoul')::int) then raise exception '이미 시작한 일정입니다';end if;
 if exists(
  select 1 from public.schedule_events e where e.staff_id=receiver.id and e.event_date=post.work_date and
   (coalesce(e.payload->>'allDay','false')='true' or
    (post.start_time<coalesce(e.payload->>'end','99:99') and _time>coalesce(e.payload->>'time','00:00')))
 ) then raise exception '선택한 상담사에게 이미 일정이 있습니다. 다른 사람이나 시간을 선택하세요';end if;
 _eid=gen_random_uuid()::text;
 insert into public.schedule_events(id,staff_id,event_date,payload,created_by_staff_id)
 values(_eid,receiver.id,post.work_date,jsonb_build_object(
  'id',_eid,'center',receiver.center,'owner',receiver.display_name,'date',post.work_date::text,
  'kind',case when post.kind='cover' then 'consult' else 'work' end,
  'type',case when post.kind='cover' then post.consult_type else '외부홍보' end,
  'title',case when post.kind='cover' then '공유 상담 요청' else post.title end,
  'time',post.start_time,'end',_time,'allDay',false,
  'trip',false,'quick',false,'memo','', 'specialWork',post.kind='promotion',
  'sharedPostId',post.id::text,'bookedBy',actor.display_name
 ),actor.id);
 insert into public.schedule_shared_assignments(post_id,staff_id,calendar_event_id,assigned_by,active)
 values(_id,receiver.id,_eid,actor.id,true)
 on conflict(post_id,staff_id) do update set active=true,calendar_event_id=excluded.calendar_event_id,
   assigned_by=excluded.assigned_by,updated_at=now();
 return jsonb_build_object('ok',true,'action',case when p_action='join' then 'joined' else 'assigned' end,
   'staff',receiver.display_name,'id',_id);
end $function$
;

CREATE OR REPLACE FUNCTION public.schedule_work_report_alert_feed()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare me record;today_kr date;mon date;month_start date;today_count int;week_count int;month_count int;
 key text; is_week_open boolean;is_month_open boolean;seen boolean;
begin
 select id,center,role,is_schedule_admin into me from public.schedule_staff
 where auth_user_id=auth.uid() and is_active and not must_change_password;
 if not found or not(me.role in ('manager','director') or me.is_schedule_admin) then
  return jsonb_build_object('items','[]'::jsonb);
 end if;
 today_kr:=(now() at time zone 'Asia/Seoul')::date;
 if extract(isodow from today_kr)>5 then return jsonb_build_object('items','[]'::jsonb);end if;
 mon:=date_trunc('week',today_kr)::date;
 month_start:=date_trunc('month',today_kr)::date;
 -- First weekday in the relevant week/month; account for 2026 public holidays.
 with day_candidates as(
   select (mon + i) as d from generate_series(0,6) i
 ),biz as (
  select d from day_candidates where extract(isodow from d)<=5
     and not exists(select 1 from public.schedule_business_holidays h where h.holiday_date=d::date)
 )
 select coalesce(min(d)=today_kr,false) into is_week_open from biz;
 select coalesce(min(d)=today_kr,false) into is_month_open
 from generate_series(month_start,month_start+interval '12 days',interval '1 day') x(d)
 where extract(isodow from d)<=5 and not exists(select 1 from public.schedule_business_holidays h where h.holiday_date=d::date);
 select
   count(distinct case when e.event_date=today_kr then e.staff_id end),
   count(distinct case when e.event_date between mon and mon+6 then e.staff_id end),
   count(distinct e.staff_id)
 into today_count,week_count,month_count
 from public.schedule_events e join public.schedule_staff s on s.id=e.staff_id
 where s.is_active and s.managed_in_schedule
   and (me.role='director' or me.is_schedule_admin or s.center=me.center)
   and e.event_date between least(month_start,mon) and greatest((month_start+interval '1 month - 1 day')::date,mon+6)
   and coalesce(e.payload->>'kind','work')='work'
   and e.payload->>'type'=any(array['연차','반차','2시간 연차','반반차','출장','외부교육','내부교육','외부홍보','외근']);
 -- Don't interrupt with empty reports. The report panel is always accessible.
 if me.role<>'director' and today_count=0 and (not is_week_open or week_count=0) and (not is_month_open or month_count=0) then
   return jsonb_build_object('items','[]'::jsonb);
 end if;
 key:='report:'||today_kr::text;
 select exists(select 1 from public.schedule_alert_seen where staff_id=me.id and alert_key=key) into seen;
 return jsonb_build_object('items',jsonb_build_array(jsonb_build_object(
   'key',key,'source','report','scope',case when me.role='director' or me.is_schedule_admin then '전체' else me.center end,
   'kind',case when is_month_open then '월간' when is_week_open then '주간' else '일간' end,
   'title',case when is_month_open then '월초 종합보고 · ' when is_week_open then '주초 종합보고 · ' else '오늘 직원 일정 · ' end ||
     '오늘 '||today_count::text||'명'||case when is_week_open then ' / 이번 주 '||week_count::text||'명' else '' end ||
     case when is_month_open then ' / 이번 달 '||month_count::text||'명' else '' end,
   'date',today_kr::text,
   'seen',seen
  )));
end;
$function$
;