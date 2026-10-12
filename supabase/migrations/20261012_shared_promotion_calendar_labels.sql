-- Use the first line of a promotion's freeform details as its calendar event
-- name (e.g., '북구간호학원 국취 설명회'), not the recruitment preset title.
-- Skip generic instruction presets.
CREATE OR REPLACE FUNCTION public.schedule_promotion_display_title(p_title text, p_details text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO ''
AS $label$
  SELECT CASE
    WHEN length(d.first_line) BETWEEN 2 AND 100
     AND d.first_line NOT IN (
       '장소와 세부 내용은 추후 안내하겠습니다.',
       '진행 장소 및 준비사항은 요청자에게 확인해 주세요.',
       '센터에 집결하여 함께 이동합니다.',
       '행사 장소로 직접 집결해 주세요.'
     ) THEN d.first_line
    ELSE coalesce(nullif(btrim(p_title),''),'홍보·행사')
  END
  FROM (SELECT btrim(split_part(replace(coalesce(p_details,''),E'\r\n',E'\n'),E'\n',1)) AS first_line) d;
$label$;

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
  'title',case when post.kind='cover' then '공유 상담 요청' else public.schedule_promotion_display_title(post.title,post.details) end,
  'time',post.start_time,'end',_time,'allDay',false,
  'trip',false,'quick',false,'memo','', 'specialWork',false,
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

CREATE OR REPLACE FUNCTION public.schedule_shared_manage(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 me record; post record; _id uuid; _title text; _details text;
 _newdate date; _newtime text; _duration int; _ct text;
 _count int; _slots jsonb; _code text; _quota jsonb; _hours int;
 _has_joined boolean; _changed_logistics boolean;
begin
 select s.id,s.center,s.role,s.is_schedule_admin into me from public.schedule_staff s
 where s.auth_user_id=auth.uid() and s.is_active and not s.must_change_password;
 if not found then raise exception '로그인한 직원만 관리할 수 있습니다';end if;
 if p_action not in ('edit','complete','delete') then raise exception '지원되지 않는 작업입니다';end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception '요청 정보가 올바르지 않습니다';end if;
 _id=(p_payload->>'postId')::uuid;
 if _id is null then raise exception '게시글을 선택하세요';end if;
 perform pg_advisory_xact_lock(hashtext('sharedpost'),hashtext(_id::text));
 select * into post from public.schedule_shared_posts where id=_id for update;
 if not found or post.status='deleted' then raise exception '삭제되었거나 존재하지 않는 요청입니다';end if;
 if not (post.created_by=me.id or me.is_schedule_admin or me.role='director'
   or (me.role='manager' and me.center=post.scope))
 then raise exception '작성자 또는 지사 관리자만 요청을 변경할 수 있습니다';end if;
 if p_action='complete' then
  if post.status='completed' then return jsonb_build_object('ok',true,'action','completed');end if;
  if post.status<>'open' then raise exception '이미 취소된 요청은 완료 처리할 수 없습니다';end if;
  update public.schedule_shared_posts set status='completed',updated_at=now() where id=_id;
  -- Keep accepted employees' linked calendar events when completing.
  return jsonb_build_object('ok',true,'action','completed');
 end if;
 if p_action='delete' then
  -- Soft delete the post for audit history, but remove linked employee events.
  update public.schedule_shared_posts set status='deleted',updated_at=now() where id=_id;
  delete from public.schedule_events e where e.id in
   (select a.calendar_event_id from public.schedule_shared_assignments a
     where a.post_id=_id and a.active and a.calendar_event_id is not null);
  update public.schedule_shared_assignments set active=false,calendar_event_id=null,updated_at=now()
   where post_id=_id and active;
  return jsonb_build_object('ok',true,'action','deleted');
 end if;
 if post.status<>'open' then raise exception '모집 중인 글만 수정할 수 있습니다';end if;
 _title=btrim(coalesce(p_payload->>'title',''));
 _details=btrim(coalesce(p_payload->>'details',''));
 if length(_title) not between 2 and 100 or length(_details)>300 then
  raise exception '제목 2~100자, 안내 300자 이하로 입력하세요';
 end if;
 _newdate=coalesce((p_payload->>'date')::date,post.work_date);
 _newtime=coalesce(p_payload->>'time',post.start_time);
 _duration=coalesce((p_payload->>'duration')::int,post.duration_minutes);
 _ct=coalesce(p_payload->>'consultType',post.consult_type);
 if _newtime!~'^([01][0-9]|2[0-3]):(00|30)$' or _duration not between 30 and 600
  or mod(_duration,30)<>0 then raise exception '시간 및 소요시간을 확인하세요';end if;
 if post.kind='cover' and (_duration<>30 or _ct not in
  ('초기','해석','IAP','컨설팅','재진단','훈련등록','카드발급','신청','일경험','연계'))
 then raise exception '대신 상담은 30분 및 등록된 상담 구분으로만 수정할 수 있습니다';end if;
 _hours=split_part(_newtime,':',1)::int*60+split_part(_newtime,':',2)::int;
 if _hours<360 or _hours+_duration>1440 then raise exception '근무 일정 시간 범위를 벗어났습니다';end if;
 if post.kind='cover' and
 (extract(isodow from _newdate) in(6,7) or
  (extract(isodow from _newdate)=5 and _hours+_duration>720) or
  _hours<540 or (_hours>=720 and _hours<780) or _hours+_duration>1080) then
   raise exception '정규 상담 가능한 시간으로 수정하세요';end if;
 _slots=p_payload->'quotas';
 _changed_logistics=(_newdate is distinct from post.work_date
   or _newtime is distinct from post.start_time or _duration is distinct from post.duration_minutes
   or _ct is distinct from post.consult_type);
 if _slots is not null and post.kind='promotion' then
  if jsonb_typeof(_slots)<>'object' then raise exception '인원 정보를 확인하세요';end if;
  if (select count(*) from public.schedule_shared_quotas where post_id=_id)<>
     (select count(*) from jsonb_object_keys(_slots)) then
   raise exception '모집 지사의 구성을 수정할 수 없습니다. 기존 지사 정원을 변경하세요';
  end if;
  for _code,_quota in select key,value from jsonb_each(_slots) loop
    if not exists(select 1 from public.schedule_shared_quotas
       where post_id=_id and center=_code)
    or jsonb_typeof(_quota)<>'number' or
       (_quota::text)::int not between 1 and 30 then
       raise exception '등록된 지사의 모집 인원만 1~30명 범위에서 변경할 수 있습니다';
    end if;
    if not exists(select 1 from public.schedule_shared_quotas
        where post_id=_id and center=_code and required_count=(_quota::text)::int)
      then _changed_logistics=true;end if;
  end loop;
 end if;
 select exists(select 1 from public.schedule_shared_assignments where post_id=_id and active)
 into _has_joined;
 if _changed_logistics and _has_joined then
  raise exception '참여자가 있는 글은 제목·안내 내용만 수정할 수 있습니다';
 end if;
 if _changed_logistics then
  if _newdate<(now() at time zone 'Asia/Seoul')::date
    or _newdate>(now() at time zone 'Asia/Seoul')::date+120 then
    raise exception '날짜는 오늘부터 120일 이내로 입력하세요';end if;
  if _newdate=(now() at time zone 'Asia/Seoul')::date and _newtime<=
   to_char(now() at time zone 'Asia/Seoul','HH24:MI') then
    raise exception '이미 지난 시간으로 수정할 수 없습니다';end if;
 end if;
 update public.schedule_shared_posts
  set title=_title,details=_details,work_date=_newdate,start_time=_newtime,
   duration_minutes=_duration,consult_type=case when kind='cover' then _ct else null end,
   updated_at=now()
 where id=_id;
 -- Keep linked calendar labels in sync when an announcement is edited.
 -- Preserve names that were manually customized by the assigned staff.
 if post.kind='promotion' and (_title is distinct from post.title or _details is distinct from post.details) then
   update public.schedule_events e
   set payload=jsonb_set(e.payload,'{title}',to_jsonb(public.schedule_promotion_display_title(_title,_details)),true),
       updated_at=now()
   from public.schedule_shared_assignments a
   where a.post_id=_id and a.active and a.calendar_event_id=e.id
     and (e.payload->>'title'=post.title
          or e.payload->>'title'=public.schedule_promotion_display_title(post.title,post.details));
 end if;
 if _slots is not null and post.kind='promotion' then
  update public.schedule_shared_quotas q
    set required_count=( _slots->>q.center)::int
    where q.post_id=_id;
 end if;
 return jsonb_build_object('ok',true,'action','edited','detailsOnly',_has_joined);
end $function$
;

-- Repair only calendar events linked to accepted shared promotion posts.
-- Never modify consultation events or manually renamed promotion entries.
UPDATE public.schedule_events e
SET payload=jsonb_set(
      jsonb_set(e.payload,'{title}',
        to_jsonb(CASE
          WHEN e.payload->>'title'=p.title OR e.payload->>'title' IS NULL
          THEN public.schedule_promotion_display_title(p.title,p.details)
          ELSE e.payload->>'title'
        END),true),
      '{specialWork}','false'::jsonb,true),
    updated_at=now()
FROM public.schedule_shared_assignments a
JOIN public.schedule_shared_posts p ON p.id=a.post_id
WHERE a.calendar_event_id=e.id AND a.active AND p.kind='promotion'
  AND (
    coalesce(e.payload->>'specialWork','false')<>'false'
    OR (e.payload->>'title'=p.title
      AND public.schedule_promotion_display_title(p.title,p.details)<>p.title)
  );