-- Review-only proposal: not deployed to production. Protect consultation overlaps for direct schedule_events upserts.
-- Applies to INSERT/UPDATE; requires browser and RPC integration validation before deployment.
create or replace function public.schedule_prevent_consultation_overlap()
returns trigger language plpgsql security invoker set search_path = ''
as $func$
declare
  new_consult boolean;
  start_time text;
  end_time text;
  is_allday boolean;
begin
  if new.staff_id is null or new.event_date is null then return new; end if;
  new_consult := coalesce(new.payload->>'kind','')='consult'
    or (coalesce(new.payload->>'kind','')='' and new.payload->>'type'=any(array[
      '초기','해석','IAP','컨설팅','재진단','훈련등록','카드발급','신청','일경험','연계'
    ]));
  start_time := new.payload->>'time';
  end_time := coalesce(nullif(new.payload->>'end',''),to_char(to_timestamp(start_time,'HH24:MI') + interval '30 minutes','HH24:MI'));
  is_allday := coalesce((new.payload->>'allDay')::boolean,false);
  if new_consult and (start_time is null or start_time !~ '^([01][0-9]|2[0-3]):(00|30)$'
      or end_time is null or end_time <= start_time or is_allday) then
    raise exception '상담의 시작·종료 시각을 확인하세요';
  end if;
  perform pg_advisory_xact_lock(hashtext(new.staff_id::text),hashtext(new.event_date::text));
  if exists (
    select 1 from public.schedule_events e
    where e.staff_id=new.staff_id and e.event_date=new.event_date and e.id<>new.id
      and (new_consult or coalesce(e.payload->>'kind','')='consult'
        or (coalesce(e.payload->>'kind','')='' and e.payload->>'type'=any(array[
          '초기','해석','IAP','컨설팅','재진단','훈련등록','카드발급','신청','일경험','연계'
        ])))
      and (is_allday or coalesce((e.payload->>'allDay')::boolean,false)
        or (start_time<coalesce(nullif(e.payload->>'end',''),'99:99')
          and end_time>coalesce(nullif(e.payload->>'time',''),'00:00')))
  ) then
    raise exception '기존 상담 또는 근무 일정과 시간이 중복됩니다';
  end if;
  return new;
end;
$func$;

drop trigger if exists schedule_prevent_consultation_overlap_trigger on public.schedule_events;
create trigger schedule_prevent_consultation_overlap_trigger
before insert or update of staff_id,event_date,payload on public.schedule_events
for each row execute function public.schedule_prevent_consultation_overlap();
