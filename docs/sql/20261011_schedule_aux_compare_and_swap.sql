-- Data-safe optimistic concurrency for supplementary schedule records.
-- Invoke only from an authenticated staff session; no browser-supplied staff id is trusted.
-- Read existing row FOR UPDATE and compare entire JSONB payload before update/delete.
-- Must be applied to Supabase before main starts calling this RPC.
create or replace function public.schedule_apply_aux_changes(p_table text,p_actions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
 me record;
 entry jsonb;
 operation text;
 entity_id text;
 raw_payload jsonb;
 final_payload jsonb;
 expected jsonb;
 desired_center text;
 owner_field text;
 prev_row record;
 saved integer:=0;
begin
 select s.id,s.center,s.display_name,s.role into me
 from public.schedule_staff s
 where s.auth_user_id=auth.uid() and s.is_active=true and not s.must_change_password;
 if not found then raise exception '직원 인증이 필요합니다';end if;
 if p_table not in ('schedule_participants','schedule_closures','schedule_notices') then
  raise exception '허용하지 않는 일정 저장 대상입니다';
 end if;
 if p_table<>'schedule_participants' and me.role not in ('manager','director') then
  raise exception '공통 휴무·행사 수정은 팀장/부장만 가능합니다';
 end if;
 if p_actions is null or jsonb_typeof(p_actions)<>'array'
    or jsonb_array_length(p_actions)>200 then
  raise exception '일정 변경 항목 형식 또는 수량 오류';
 end if;
 owner_field:=case when p_table='schedule_participants' then 'staff_id' else 'created_by' end;
 for entry in select value from jsonb_array_elements(p_actions) loop
  operation:=entry->>'op';entity_id:=entry->>'id';
  if operation is null or operation not in ('insert','update','delete')
     or entity_id is null or length(entity_id)<1 or length(entity_id)>120 then
    raise exception '일정 변경 요청을 확인하세요';
  end if;
  if operation in ('insert','update') then
   raw_payload:=entry->'payload';
   if raw_payload is null or jsonb_typeof(raw_payload)<>'object' then
    raise exception '일정 내용은 객체여야 합니다';
   end if;
   final_payload:=raw_payload-'readonly'-'_serverVersion'||jsonb_build_object('id',entity_id);
   if p_table='schedule_participants' then
    final_payload:=final_payload||jsonb_build_object('center',me.center,'owner',me.display_name);
   else
    desired_center:=final_payload->>'center';
    if desired_center is null or length(desired_center)>100
       or (me.role<>'director' and desired_center<>me.center) then
      raise exception '다른 지사의 공통 일정은 저장할 수 없습니다';
    end if;
   end if;
  end if;
  if operation='insert' then
   if p_table='schedule_participants' then
    insert into public.schedule_participants(id,staff_id,payload,updated_at)
      values(entity_id,me.id,final_payload,clock_timestamp());
   elsif p_table='schedule_closures' then
    insert into public.schedule_closures(id,center,created_by,payload,updated_at)
      values(entity_id,desired_center,me.id,final_payload,clock_timestamp());
   else
    insert into public.schedule_notices(id,center,created_by,payload,updated_at)
      values(entity_id,desired_center,me.id,final_payload,clock_timestamp());
   end if;
  else
   expected:=entry->'expectedPayload';
   if jsonb_typeof(expected) is distinct from 'object' then
    raise exception '일정 버전 충돌: 이전 기록 정보가 없습니다';
   end if;
   execute format('select payload, %I as row_owner from public.%I where id=$1 for update',owner_field,p_table)
      into prev_row using entity_id;
   if not found or prev_row.row_owner is distinct from me.id then
    raise exception '일정 버전 충돌: 기록이 삭제됐거나 내 수정 권한이 없습니다';
   end if;
   if prev_row.payload is distinct from expected then
    raise exception '일정 버전 충돌: 다른 기기에서 먼저 수정한 기록입니다';
   end if;
   if operation='delete' then
    execute format('delete from public.%I where id=$1',p_table) using entity_id;
   else
    if p_table<>'schedule_participants' then
     -- A staff member cannot move an existing shared record into an unauthorized center.
     execute format('update public.%I set payload=$1,center=$2,updated_at=clock_timestamp() where id=$3',p_table)
       using final_payload,desired_center,entity_id;
    else
     update public.schedule_participants set payload=final_payload,updated_at=clock_timestamp()
       where id=entity_id;
    end if;
   end if;
  end if;
  saved:=saved+1;
 end loop;
 return jsonb_build_object('ok',true,'saved',saved);
end;
$function$;
revoke execute on function public.schedule_apply_aux_changes(text,jsonb) from public,anon;
grant execute on function public.schedule_apply_aux_changes(text,jsonb) to authenticated;
