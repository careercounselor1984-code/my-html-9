-- Atomic, version-checked schedule event writes (2026-10-11).
-- Existing schedule table unchanged. Caller is resolved through auth.uid(), not user-supplied staff id.
create or replace function public.schedule_apply_event_changes(p_actions jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
 me record;
 item jsonb;
 op text;
 eid text;
 expect_version text;
 event_payload jsonb;
 event_day date;
 old_row public.schedule_events%rowtype;
 saved_row public.schedule_events%rowtype;
 result jsonb := '[]'::jsonb;
begin
 select s.id,s.center,s.display_name into me
 from public.schedule_staff s
 where s.auth_user_id=auth.uid() and s.is_active=true and not s.must_change_password;
 if not found then raise exception '직원 인증이 필요합니다'; end if;
 if p_actions is null or jsonb_typeof(p_actions)<>'array' or jsonb_array_length(p_actions)>100 then
   raise exception '일정 변경 요청 형식을 확인하세요';
 end if;
 for item in select value from jsonb_array_elements(p_actions) loop
   op:=item->>'op'; eid:=item->>'id'; expect_version:=item->>'expectedVersion';
   if eid is null or length(eid)>120 or length(eid)<1 or op not in ('insert','update','delete') then
     raise exception '일정 변경 요청에 잘못된 항목이 있습니다';
   end if;
   if op='insert' then
     if jsonb_typeof(item->'payload')<>'object' then raise exception '일정 내용 오류'; end if;
     event_day:=(item->>'date')::date;
     event_payload:=(item->'payload')-'readonly'-'_serverVersion' ||
       jsonb_build_object('id',eid,'date',event_day::text,'center',me.center,'owner',me.display_name);
     insert into public.schedule_events(id,staff_id,event_date,created_by_staff_id,payload)
       values(eid,me.id,event_day,me.id,event_payload)
       returning * into saved_row;
     result:=result||jsonb_build_array(jsonb_build_object('id',eid,'version',saved_row.updated_at::text,'op',op));
   else
     select * into old_row from public.schedule_events
       where id=eid and staff_id=me.id for update;
     if not found then raise exception '일정 버전 충돌: 다른 기기에서 삭제 또는 이동된 일정입니다'; end if;
     if expect_version is null or old_row.updated_at::text<>expect_version then
       raise exception '일정 버전 충돌: 다른 기기에서 먼저 수정했습니다';
     end if;
     if op='delete' then
       delete from public.schedule_events where id=eid and staff_id=me.id;
       result:=result||jsonb_build_array(jsonb_build_object('id',eid,'op',op));
     else
       if jsonb_typeof(item->'payload')<>'object' then raise exception '일정 내용 오류'; end if;
       event_day:=(item->>'date')::date;
       event_payload:=(item->'payload')-'readonly'-'_serverVersion' ||
         jsonb_build_object('id',eid,'date',event_day::text,'center',me.center,'owner',me.display_name);
       update public.schedule_events set event_date=event_day,payload=event_payload
        where id=eid and staff_id=me.id returning * into saved_row;
       result:=result||jsonb_build_array(jsonb_build_object('id',eid,'version',saved_row.updated_at::text,'op',op));
     end if;
   end if;
 end loop;
 return jsonb_build_object('ok',true,'changes',result);
end;
$$;
revoke execute on function public.schedule_apply_event_changes(jsonb) from public,anon;
grant execute on function public.schedule_apply_event_changes(jsonb) to authenticated;
