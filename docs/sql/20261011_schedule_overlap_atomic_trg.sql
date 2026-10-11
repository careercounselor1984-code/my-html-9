-- Schedule atomic consultation exclusion + row revisions. Compatible with existing direct writers.
create or replace function public.schedule_enforce_consultation_overlap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
 is_new_consult boolean;
 new_start text;
 new_end text;
begin
 if new.staff_id is null or new.event_date is null then
   raise exception '상담 담당자와 날짜를 확인하세요';
 end if;
 is_new_consult := coalesce(new.payload->>'kind','')='consult'
     or (coalesce(new.payload->>'kind','')='' and new.payload->>'type'=any(array[
       '초기','해석','IAP','컨설팅','재진단','훈련등록','카드발급','신청','일경험','연계'
     ]));
 new_start := new.payload->>'time';
 new_end := nullif(new.payload->>'end','');
 if new_end is null and new_start ~ '^([01][0-9]|2[0-3]):(00|30)$' then
   new_end := to_char(to_timestamp(new_start,'HH24:MI') + interval '30 minutes','HH24:MI');
 end if;
 if is_new_consult and (coalesce((new.payload->>'allDay')::boolean,false)
     or new_start is null or new_start !~ '^([01][0-9]|2[0-3]):(00|30)$'
     or new_end is null or new_end !~ '^([01][0-9]|2[0-3]):(00|30)$'
     or new_end<=new_start) then
   raise exception '상담 시작·종료 시각을 확인하세요 (30분 단위)';
 end if;
 -- Serialization of all writes for the same counselor and date, including old clients.
 perform pg_advisory_xact_lock(hashtext(new.staff_id::text),hashtext(new.event_date::text));
 if exists (
   select 1 from public.schedule_events e
   where e.staff_id=new.staff_id and e.event_date=new.event_date and e.id<>new.id
     and (is_new_consult or coalesce(e.payload->>'kind','')='consult'
        or (coalesce(e.payload->>'kind','')='' and e.payload->>'type'=any(array[
         '초기','해석','IAP','컨설팅','재진단','훈련등록','카드발급','신청','일경험','연계'
        ])))
     and (coalesce((new.payload->>'allDay')::boolean,false)
        or coalesce((e.payload->>'allDay')::boolean,false)
        or (new_start < coalesce(nullif(e.payload->>'end',''),'99:99')
          and new_end > coalesce(nullif(e.payload->>'time',''),'00:00')))
 ) then
   raise exception '기존 상담 또는 근무 일정과 시간이 중복됩니다';
 end if;
 if TG_OP='UPDATE' then new.updated_at:=clock_timestamp(); end if;
 return new;
end;
$$;
revoke all on function public.schedule_enforce_consultation_overlap() from public,anon,authenticated;
drop trigger if exists schedule_enforce_consultation_overlap_trg on public.schedule_events;
create trigger schedule_enforce_consultation_overlap_trg
before insert or update of staff_id,event_date,payload on public.schedule_events
for each row execute function public.schedule_enforce_consultation_overlap();
