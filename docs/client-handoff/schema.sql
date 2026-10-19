-- New feature only: no existing client or appointment is moved by this migration.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.schedule_client_handoff_batches (
 request_id uuid primary key,
 source_id uuid not null references public.schedule_staff(id),
 actor_id uuid not null references public.schedule_staff(id),
 plan_hash text not null,
 reason text not null check(length(reason) between 2 and 300),
 before_data jsonb not null,
 after_data jsonb not null,
 created_at timestamptz not null default now(),
 reversed_at timestamptz,
 reversed_by uuid references public.schedule_staff(id)
);
alter table private.schedule_client_handoff_batches enable row level security;
revoke all on private.schedule_client_handoff_batches from public,anon,authenticated;
grant usage on schema private to service_role;
grant all on private.schedule_client_handoff_batches to service_role;

create or replace function public.schedule_client_handoff(p_action text,p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 actor public.schedule_staff%rowtype; src public.schedule_staff%rowtype; dest public.schedule_staff%rowtype;
 person public.schedule_private_items%rowtype; ev public.schedule_events%rowtype; roster public.schedule_participants%rowtype;
 batch private.schedule_client_handoff_batches%rowtype;
 selected_source_id uuid; rid uuid; item jsonb; appointment jsonb; snapshot jsonb; moved jsonb;
 plan jsonb; planned jsonb:='[]'; before_rows jsonb:='[]'; before_events jsonb:='[]'; after_rows jsonb:='[]'; after_events jsonb:='[]'; created_people jsonb:='[]';
 event_ids text[]:=array[]::text[]; person_ids uuid[]:=array[]::uuid[]; duplicate_keys text[]:=array[]::text[];
 normalized_reg text; dkey text; pid text; participant_version timestamptz; hash text; why text;
 target_ids uuid[]; target_id uuid; client_count int:=0; event_count int:=0;
 today date:=(now() at time zone 'Asia/Seoul')::date;
begin
 select * into actor from public.schedule_staff where auth_user_id=auth.uid() and is_active and not must_change_password;
 if not found or not(actor.is_schedule_admin or actor.role in ('director','manager')) then raise exception '관리자 권한이 필요합니다' using errcode='42501';end if;
 if p_action='meta' then
  return jsonb_build_object('sources',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.display_name,'center',s.center) order by s.center,s.display_name) from public.schedule_staff s where not s.is_active and s.auth_user_id is not null and (actor.is_schedule_admin or actor.role='director' or s.center=actor.center)),'[]'::jsonb),
   'targets',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.display_name,'center',s.center) order by s.center,s.display_name) from public.schedule_staff s where s.is_active and not s.must_change_password and s.managed_in_schedule and s.auth_user_id is not null and (actor.is_schedule_admin or actor.role='director' or s.center=actor.center)),'[]'::jsonb));
 end if;
 if jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>200000 then raise exception '요청 형식을 확인하세요';end if;
 selected_source_id:=(p_payload->>'sourceId')::uuid;
 select * into src from public.schedule_staff where id=selected_source_id for update;
 if not found or not(actor.is_schedule_admin or actor.role='director' or src.center=actor.center) then raise exception '해당 직원의 자료에 접근할 권한이 없습니다' using errcode='42501';end if;
 if p_action='history' then
  return jsonb_build_object('rows',coalesce((select jsonb_agg(jsonb_build_object('requestId',b.request_id,'at',b.created_at,'actor',s.display_name,'reason',b.reason,'clients',jsonb_array_length(b.after_data->'clients'),'events',jsonb_array_length(b.after_data->'events'),'reversedAt',b.reversed_at) order by b.created_at desc) from (select * from private.schedule_client_handoff_batches where source_id=src.id order by created_at desc limit 30)b join public.schedule_staff s on s.id=b.actor_id),'[]'::jsonb));
 end if;
 if p_action='rollback' then
  if src.is_active then raise exception '기존 담당자 계정이 활성 상태여서 자동 취소할 수 없습니다';end if;
  rid:=(p_payload->>'requestId')::uuid;
  select * into batch from private.schedule_client_handoff_batches where request_id=rid and source_id=src.id for update;
  if not found then raise exception '인계 이력을 찾을 수 없습니다';end if;
  if batch.reversed_at is not null then return jsonb_build_object('ok',true,'reversed',true,'requestId',rid);end if;
  -- Every affected row must still be exactly the post-transfer version. No silent overwrites.
  for snapshot in select value from jsonb_array_elements(batch.after_data->'clients') loop
   select * into person from public.schedule_private_items where id=(snapshot->>'id')::uuid for update;
   if not found or person.user_id<>(snapshot->>'userId')::uuid or person.updated_at<>(snapshot->>'version')::timestamptz or md5(jsonb_build_object('payload',person.payload,'itemDate',person.item_date)::text)<>snapshot->>'fingerprint' then raise exception '인계 후 내담자 자료가 변경되어 자동 취소할 수 없습니다';end if;
   if not(actor.is_schedule_admin or actor.role='director') and not exists(select 1 from public.schedule_staff where auth_user_id=person.user_id and center=actor.center) then raise exception '취소 범위를 벗어났습니다' using errcode='42501';end if;
  end loop;
  for snapshot in select value from jsonb_array_elements(batch.after_data->'events') loop
   select * into ev from public.schedule_events where id=snapshot->>'id' for update;
   if not found or ev.staff_id<>(snapshot->>'staffId')::uuid or ev.updated_at<>(snapshot->>'version')::timestamptz then raise exception '인계 후 상담예약이 변경되어 자동 취소할 수 없습니다';end if;
  end loop;
  for snapshot in select value from jsonb_array_elements(batch.after_data->'participants') loop
   select * into roster from public.schedule_participants where id=snapshot->>'id' for update;
   if not found or roster.updated_at<>(snapshot->>'version')::timestamptz or md5(roster.payload::text)<>snapshot->>'fingerprint' or roster.staff_id<>(snapshot->>'staffId')::uuid or exists(select 1 from public.schedule_events e where e.payload->>'participantId'=snapshot->>'id' and not (e.id=any(array(select x->>'id' from jsonb_array_elements(batch.after_data->'events')x)))) then raise exception '인계 후 참여자 자동완성 자료가 사용되어 자동 취소할 수 없습니다';end if;
  end loop;
  for snapshot in select value from jsonb_array_elements(batch.before_data->'clients') loop
   normalized_reg:=lower(regexp_replace(coalesce(snapshot->'payload'->>'regNo',''),'\s','','g'));
   if normalized_reg<>'' and exists(select 1 from public.schedule_private_items p where p.user_id=(snapshot->>'user_id')::uuid and p.kind='iap' and p.id<>(snapshot->>'id')::uuid and lower(regexp_replace(coalesce(p.payload->>'regNo',''),'\s','','g'))=normalized_reg) then raise exception '기존 담당자에게 같은 등록번호가 생겨 자동 취소할 수 없습니다';end if;
   update public.schedule_private_items set user_id=(snapshot->>'user_id')::uuid,item_date=(snapshot->>'item_date')::date,payload=snapshot->'payload',updated_at=clock_timestamp() where id=(snapshot->>'id')::uuid;
  end loop;
  for snapshot in select value from jsonb_array_elements(batch.before_data->'events') loop
   update public.schedule_events set staff_id=(snapshot->>'staff_id')::uuid,event_date=(snapshot->>'event_date')::date,payload=snapshot->'payload',updated_at=clock_timestamp() where id=snapshot->>'id';
  end loop;
  delete from public.schedule_participants where id in (select value->>'id' from jsonb_array_elements(batch.after_data->'participants'));
  update private.schedule_client_handoff_batches set reversed_at=now(),reversed_by=actor.id where request_id=rid;
  return jsonb_build_object('ok',true,'reversed',true,'requestId',rid);
 end if;
 if p_action not in ('list','preview','commit') then raise exception '지원하지 않는 작업입니다';end if;
 if src.is_active or src.auth_user_id is null then raise exception '기존 담당자 계정을 먼저 비활성화해야 인계할 수 있습니다';end if;
 if p_action='list' then
  return jsonb_build_object('clients',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.payload->>'name','regNo',p.payload->>'regNo','type',p.payload->>'type','iapDate',p.payload->>'iapDate','serviceEnd',p.payload->>'serviceEnd','status',p.payload->>'clientStatus','version',p.updated_at::text) order by p.payload->>'name',p.id) from public.schedule_private_items p where p.user_id=src.auth_user_id and p.kind='iap'),'[]'::jsonb),
   'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'name',e.payload->>'title','date',e.event_date,'time',e.payload->>'time','end',e.payload->>'end','type',e.payload->>'type','version',e.updated_at::text) order by e.event_date,e.payload->>'time',e.id) from public.schedule_events e where e.staff_id=src.id and coalesce(e.payload->>'kind','consult')='consult' and (e.event_date>today or (e.event_date=today and e.payload->>'time'>to_char(now() at time zone 'Asia/Seoul','HH24:MI')))),'[]'::jsonb));
 end if;
 plan:=p_payload->'assignments';why:=trim(coalesce(p_payload->>'reason',''));
 if jsonb_typeof(plan)<>'array' or jsonb_array_length(plan) not between 1 and 100 or length(why) not between 2 and 300 then raise exception '인계 대상 1~100명과 사유를 입력하세요';end if;
 hash:=md5(jsonb_build_object('sourceId',src.id,'assignments',plan,'reason',why)::text);
 if p_action='commit' then
  rid:=(p_payload->>'requestId')::uuid;
  if rid is null or p_payload->>'previewHash' is distinct from hash then raise exception '미리보기를 다시 확인하세요';end if;
  select * into batch from private.schedule_client_handoff_batches where request_id=rid;
  if found then
   if batch.plan_hash<>hash or batch.source_id<>src.id then raise exception '다른 인계에 사용된 요청 번호입니다';end if;
   return jsonb_build_object('ok',true,'requestId',rid,'clients',jsonb_array_length(batch.after_data->'clients'),'events',jsonb_array_length(batch.after_data->'events'),'alreadyApplied',true,'reversed',batch.reversed_at is not null);
  end if;
 end if;
 perform pg_advisory_xact_lock(hashtext('schedule-client-handoff'),hashtext(src.id::text));
 -- Target employee status is locked until the transaction ends, preventing concurrent deactivation.
 target_ids:=array(select distinct (value->>'targetId')::uuid from jsonb_array_elements(plan));
 perform 1 from public.schedule_staff where id=any(target_ids) order by id for update;
 for item in select value from jsonb_array_elements(plan) loop
  select * into person from public.schedule_private_items where id=(item->>'clientId')::uuid and user_id=src.auth_user_id and kind='iap' for update;
  if not found or person.id=any(person_ids) or person.updated_at is distinct from (item->>'version')::timestamptz then raise exception '내담자 자료가 변경되었습니다. 목록을 다시 확인하세요';end if;
  person_ids:=array_append(person_ids,person.id);
  select * into dest from public.schedule_staff where id=(item->>'targetId')::uuid and is_active and not must_change_password and managed_in_schedule and auth_user_id is not null;
  if not found or dest.id=src.id or not(actor.is_schedule_admin or actor.role='director' or dest.center=actor.center) then raise exception '새 담당자의 활성 상태와 센터 권한을 확인하세요' using errcode='42501';end if;
  normalized_reg:=lower(regexp_replace(coalesce(person.payload->>'regNo',''),'\s','','g'));
  dkey:=dest.auth_user_id::text||':'||normalized_reg;
  if normalized_reg<>'' and (dkey=any(duplicate_keys) or exists(select 1 from public.schedule_private_items p where p.user_id=dest.auth_user_id and p.kind='iap' and lower(regexp_replace(coalesce(p.payload->>'regNo',''),'\s','','g'))=normalized_reg)) then raise exception '새 담당자에게 같은 등록번호가 있습니다. 중복 자료를 먼저 확인하세요';end if;
  if normalized_reg<>'' then duplicate_keys:=array_append(duplicate_keys,dkey);end if;
  if jsonb_typeof(coalesce(item->'events','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(item->'events','[]'::jsonb))>100 then raise exception '함께 인계할 예약을 확인하세요';end if;
  for appointment in select value from jsonb_array_elements(coalesce(item->'events','[]'::jsonb)) loop
   select * into ev from public.schedule_events where id=appointment->>'id' and staff_id=src.id for update;
   if not found or ev.id=any(event_ids) or ev.updated_at is distinct from (appointment->>'version')::timestamptz or coalesce(ev.payload->>'kind','consult')<>'consult' or ev.event_date<today or (ev.event_date=today and coalesce(ev.payload->>'time','00:00')<=to_char(now() at time zone 'Asia/Seoul','HH24:MI')) then raise exception '선택한 예약이 변경되었거나 이미 시작되었습니다';end if;
   if coalesce(ev.payload->>'time','') !~ '^([01][0-9]|2[0-3]):(00|30)$' or coalesce(ev.payload->>'end','') !~ '^([01][0-9]|2[0-3]):(00|30)$' or coalesce(ev.payload->>'end','')<=coalesce(ev.payload->>'time','') then raise exception '예약 시작/종료 시간을 확인하세요';end if;
   if exists(select 1 from public.schedule_handoffs where event_id=ev.id and status='pending') then raise exception '개별 인계 요청 중인 예약입니다. 기존 요청을 먼저 취소하세요';end if;
   perform pg_advisory_xact_lock(hashtext(dest.id::text),hashtext(ev.event_date::text));
   if exists(select 1 from public.schedule_events e where e.staff_id=dest.id and e.event_date=ev.event_date and (coalesce(e.payload->>'allDay','false')='true' or ((ev.payload->>'time')<coalesce(e.payload->>'end','99:99') and (ev.payload->>'end')>coalesce(e.payload->>'time','00:00')))) or exists(select 1 from public.schedule_events e where e.id in (select value->>'id' from jsonb_array_elements(coalesce(item->'events','[]'::jsonb))) and e.id<>ev.id and e.event_date=ev.event_date and ev.payload->>'time'<coalesce(e.payload->>'end','99:99') and ev.payload->>'end'>coalesce(e.payload->>'time','00:00')) or exists(select 1 from jsonb_array_elements(planned)x cross join lateral jsonb_array_elements(x->'events')e where x->>'targetId'=dest.id::text and (e->>'date')::date=ev.event_date and ev.payload->>'time'<e->>'end' and ev.payload->>'end'>e->>'time') then raise exception '새 담당자의 기존 일정 또는 함께 인계할 예약과 시간이 겹칩니다';end if;
   event_ids:=array_append(event_ids,ev.id);before_events:=before_events||jsonb_build_array(to_jsonb(ev));event_count:=event_count+1;
  end loop;
  before_rows:=before_rows||jsonb_build_array(to_jsonb(person));
  planned:=planned||jsonb_build_array(jsonb_build_object('clientId',person.id,'name',person.payload->>'name','regNo',person.payload->>'regNo','targetId',dest.id,'targetName',dest.display_name,'targetCenter',dest.center,'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'date',e.event_date,'time',e.payload->>'time','end',e.payload->>'end','name',e.payload->>'title')) from public.schedule_events e where e.id in (select value->>'id' from jsonb_array_elements(coalesce(item->'events','[]'::jsonb)))),'[]'::jsonb)));
 end loop;
 if event_count>200 then raise exception '한 번에 예약 200건 이하로 인계하세요';end if;
 if p_action='preview' then return jsonb_build_object('ok',true,'previewHash',hash,'clients',jsonb_array_length(plan),'events',event_count,'rows',planned);end if;
 -- Snapshot and updates form one atomic transaction. Any failure rolls back everything.
 for item in select value from jsonb_array_elements(plan) loop
  select * into dest from public.schedule_staff where id=(item->>'targetId')::uuid;
  update public.schedule_private_items set user_id=dest.auth_user_id,updated_at=clock_timestamp() where id=(item->>'clientId')::uuid returning * into person;
  after_rows:=after_rows||jsonb_build_array(jsonb_build_object('id',person.id,'userId',person.user_id,'version',person.updated_at,'fingerprint',md5(jsonb_build_object('payload',person.payload,'itemDate',person.item_date)::text)));client_count:=client_count+1;
  if jsonb_array_length(coalesce(item->'events','[]'::jsonb))>0 then
   pid:=gen_random_uuid()::text;
   insert into public.schedule_participants(id,staff_id,payload) values(pid,dest.id,jsonb_build_object('id',pid,'name',person.payload->>'name','owner',dest.display_name,'center',dest.center,'tag','')) returning * into roster;
   created_people:=created_people||jsonb_build_array(jsonb_build_object('id',pid,'version',roster.updated_at,'staffId',roster.staff_id,'fingerprint',md5(roster.payload::text)));
   for appointment in select value from jsonb_array_elements(item->'events') loop
    update public.schedule_events set staff_id=dest.id,updated_at=clock_timestamp(),payload=payload||jsonb_build_object('owner',dest.display_name,'center',dest.center,'participantId',pid,'clientRecordId',person.id::text,'handoffBatchId',rid::text) where id=appointment->>'id' returning * into ev;
    after_events:=after_events||jsonb_build_array(jsonb_build_object('id',ev.id,'staffId',ev.staff_id,'version',ev.updated_at));
   end loop;
  end if;
 end loop;
 insert into private.schedule_client_handoff_batches(request_id,source_id,actor_id,plan_hash,reason,before_data,after_data) values(rid,src.id,actor.id,hash,why,jsonb_build_object('clients',before_rows,'events',before_events),jsonb_build_object('clients',after_rows,'events',after_events,'participants',created_people));
 return jsonb_build_object('ok',true,'requestId',rid,'clients',client_count,'events',event_count);
end $$;
revoke execute on function public.schedule_client_handoff(text,jsonb) from public,anon;
grant execute on function public.schedule_client_handoff(text,jsonb) to authenticated,service_role;
