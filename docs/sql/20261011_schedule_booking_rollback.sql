-- Restore only the two booking functions; preserve any holiday rows inserted by migration.
CREATE OR REPLACE FUNCTION public.schedule_book_for_colleague(_owner_name text, _date date, _time text, _type text, _title text, _trip boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor record; receiver record; eid text; new_end text; wd integer;
begin
 select id,center,display_name into actor from public.schedule_staff
  where auth_user_id=auth.uid() and is_active=true;
 if not found then raise exception '직원 로그인 후 이용하세요';end if;
 if _owner_name is null or length(trim(_owner_name))=0 then raise exception '담당 상담사를 선택하세요';end if;
 select id,center,display_name into receiver from public.schedule_staff
  where center=actor.center and display_name=trim(_owner_name) and is_active=true;
 if not found or receiver.id=actor.id then raise exception '같은 센터의 다른 상담사만 대신 예약할 수 있습니다';end if;
 if _date is null or _time !~ '^(09|10|11|13|14|15|16|17):(00|30)$'
    or length(trim(coalesce(_type,''))) not between 1 and 40
    or length(trim(coalesce(_title,''))) not between 1 and 100
 then raise exception '상담 날짜·시간·구분·이름을 확인하세요'; end if;
 wd:=extract(isodow from _date);
 if wd in (6,7) or (wd=5 and _time>='12:00') then
  raise exception '주말 또는 금요일 오후에는 예약할 수 없습니다';end if;
 if _date::text=any(array[
 '2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-03-01','2026-03-02',
 '2026-05-01','2026-05-05','2026-05-24','2026-05-25','2026-06-03','2026-06-06',
 '2026-07-17','2026-08-15','2026-08-17','2026-09-24','2026-09-25','2026-09-26',
 '2026-10-03','2026-10-05','2026-10-09','2026-12-25']) then
  raise exception '공휴일에는 상담을 예약할 수 없습니다'; end if;
 if exists (select 1 from public.schedule_closures o
    where o.center in ('all', actor.center)
       and o.payload->>'start'<=_date::text and o.payload->>'end'>=_date::text)
 then raise exception '센터 자체 휴무일에는 예약할 수 없습니다';end if;
 perform pg_advisory_xact_lock(hashtext(receiver.id::text),hashtext(_date::text));
 new_end:=to_char(to_timestamp(_time,'HH24:MI')+interval '30 minutes','HH24:MI');
 if exists (select 1 from public.schedule_events e
  where e.staff_id=receiver.id and e.event_date=_date
   and (coalesce((e.payload->>'allDay')::boolean,false)=true or
   (_time<coalesce(e.payload->>'end','99:99') and new_end>coalesce(e.payload->>'time','00:00'))))
 then raise exception '해당 상담사에게 이미 등록된 일정이 있습니다. 다른 시간을 선택하세요';end if;
 eid:=gen_random_uuid()::text;
 insert into public.schedule_events(id,staff_id,event_date,created_by_staff_id,payload)
 values(eid,receiver.id,_date,actor.id,
  jsonb_build_object('id',eid,'center',receiver.center,'owner',receiver.display_name,
  'date',_date::text,'kind','consult','type',trim(_type),'title',trim(_title),
  'time',_time,'end',new_end,'allDay',false,'trip',coalesce(_trip,false),
  'quick',false,'memo','','bookedBy',actor.display_name));
 return jsonb_build_object('id',eid,'owner',receiver.display_name,'date',_date::text,'time',_time);
end $function$
;

CREATE OR REPLACE FUNCTION public.schedule_book_from_journal(_request_id uuid, _date date, _time text, _type text, _title text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 actor record;
 event_id text;
 prior_event text;
 new_end text;
 weekday integer;
begin
 if auth.uid() is null then raise exception '일정관리 로그인이 필요합니다'; end if;
 select id,center,display_name into actor from public.schedule_staff
 where auth_user_id=auth.uid() and is_active=true and must_change_password=false;
 if not found then raise exception '직원 인증 또는 최초 비밀번호 변경이 필요합니다'; end if;
 if _request_id is null or _date is null
 or _time !~ '^(09|10|11|13|14|15|16|17):(00|30)$'
 or _type not in ('초기','해석','IAP','컨설팅','재진단','훈련등록','카드발급','신청','일경험','연계')
 or length(btrim(coalesce(_title,''))) not between 2 and 70 then
   raise exception '예약할 이름·날짜·시간·상담 구분을 확인하세요';
 end if;
 if _date < (now() at time zone 'Asia/Seoul')::date then
  raise exception '이미 지난 날짜에는 예약할 수 없습니다';
 end if;
 weekday:=extract(isodow from _date)::integer;
 if weekday in (6,7) or (weekday=5 and _time>='12:00') then
  raise exception '주말 또는 금요일 12시 이후에는 상담 예약이 제한됩니다';
 end if;
 if _date::text=any(array[
 '2026-01-01','2026-02-16','2026-02-17','2026-02-18','2026-03-01','2026-03-02',
 '2026-05-01','2026-05-05','2026-05-24','2026-05-25','2026-06-03','2026-06-06',
 '2026-07-17','2026-08-15','2026-08-17','2026-09-24','2026-09-25','2026-09-26',
 '2026-10-03','2026-10-05','2026-10-09','2026-12-25']) then
  raise exception '공휴일에는 상담을 예약할 수 없습니다';
 end if;
 if exists (
  select 1 from public.schedule_closures c
  where c.center in ('all',actor.center)
    and c.payload->>'start'<=_date::text
    and c.payload->>'end'>=_date::text
 ) then raise exception '센터 공동 휴무일입니다'; end if;
 perform pg_advisory_xact_lock(hashtext(actor.id::text), hashtext(_date::text));
 select r.event_id into prior_event from public.schedule_journal_booking_receipts r
 where r.staff_id=actor.id and r.request_id=_request_id;
 if found then
  return jsonb_build_object('ok',true,'id',prior_event,'date',_date::text,'time',_time,
    'name',btrim(_title),'consultType',_type,'alreadyProcessed',true);
 end if;
 new_end:=to_char(to_timestamp(_time,'HH24:MI')+interval '30 minutes','HH24:MI');
 if _date=(now() at time zone 'Asia/Seoul')::date and
    _time <= to_char(now() at time zone 'Asia/Seoul','HH24:MI') then
   raise exception '이미 지난 시간에는 예약할 수 없습니다';
 end if;
 if exists(
  select 1 from public.schedule_events e
  where e.staff_id=actor.id and e.event_date=_date
    and (coalesce((e.payload->>'allDay')::boolean,false)=true or
        (_time<coalesce(e.payload->>'end','99:99') and
         new_end>coalesce(e.payload->>'time','00:00')))
 ) then raise exception '이미 등록된 일정이 있는 시간입니다. 다른 시간을 선택하세요'; end if;
 event_id:=gen_random_uuid()::text;
 insert into public.schedule_events(id,staff_id,event_date,created_by_staff_id,payload)
 values(event_id,actor.id,_date,actor.id,
 jsonb_build_object(
  'id',event_id,'center',actor.center,'owner',actor.display_name,'date',_date::text,
  'kind','consult','type',_type,'title',btrim(_title),'time',_time,'end',new_end,
  'allDay',false,'trip',false,'quick',false,'memo','','source','journal'
 ));
 insert into public.schedule_journal_booking_receipts(request_id,staff_id,event_id)
 values(_request_id,actor.id,event_id);
 return jsonb_build_object('ok',true,'id',event_id,'date',_date::text,'time',_time,
 'name',btrim(_title),'consultType',_type,'alreadyProcessed',false);
end $function$
;
