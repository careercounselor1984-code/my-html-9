-- Review-only migration until end-to-end authenticated tests are approved.
-- Consultation entries and calendar changes are append-only, separate from 20 KB IAP payloads.
create table if not exists public.schedule_client_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id uuid not null references public.schedule_private_items(id) on delete cascade,
  reg_no text not null check (reg_no ~ '^A[0-9]{10,30}$'),
  activity_type text not null check (activity_type in ('consultation','date_change','status_change')),
  source_key text not null check (length(source_key) between 10 and 180),
  activity_date date not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint schedule_client_activity_details_check check (
    jsonb_typeof(details) = 'object' and octet_length(details::text) < 5000
  ),
  constraint schedule_client_activity_source_unique unique(user_id, source_key)
);
create index if not exists schedule_client_activity_owner_reg_date
  on public.schedule_client_activity (user_id, client_id, activity_date desc, created_at desc);
create index if not exists schedule_client_activity_consult_date
  on public.schedule_client_activity (user_id, activity_date desc)
  where activity_type='consultation';
alter table public.schedule_client_activity enable row level security;
revoke all on public.schedule_client_activity from public, anon, authenticated;
grant select, insert on public.schedule_client_activity to authenticated;
drop policy if exists schedule_client_activity_select on public.schedule_client_activity;
create policy schedule_client_activity_select on public.schedule_client_activity
  for select to authenticated
  using (
    user_id=(select auth.uid())
    and exists (
      select 1 from public.schedule_private_items c
      where c.id=client_id and c.user_id=(select auth.uid()) and c.kind='iap'
    )
    and exists (
      select 1 from public.schedule_staff s
      where s.auth_user_id=(select auth.uid())
        and s.is_active and not s.must_change_password
    )
  );
drop policy if exists schedule_client_activity_insert on public.schedule_client_activity;
create policy schedule_client_activity_insert on public.schedule_client_activity
  for insert to authenticated
  with check (
    user_id=(select auth.uid())
    and exists (
      select 1 from public.schedule_private_items c
      where c.id=client_id and c.user_id=(select auth.uid()) and c.kind='iap'
        and upper(regexp_replace(coalesce(c.payload->>'regNo',''),'[[:space:]]','','g'))=reg_no
    )
    and exists (
      select 1 from public.schedule_staff s
      where s.auth_user_id=(select auth.uid())
        and s.is_active and not s.must_change_password
    )
  );
-- Never grant UPDATE/DELETE on this append-only evidence table.

-- Atomic compare-and-swap: an edited client row and its audit must both commit, or neither.
-- SECURITY INVOKER keeps existing schedule_private_items and activity RLS effective.
create or replace function public.schedule_client_commit_and_audit(
  p_client_id uuid,
  p_expected_at timestamptz,
  p_payload jsonb,
  p_item_date date,
  p_source text,
  p_changes jsonb
)
returns table (id uuid, kind text, item_date date, payload jsonb, updated_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $
declare
  v_before public.schedule_private_items%rowtype;
  v_after public.schedule_private_items%rowtype;
  v_user uuid := auth.uid();
  v_reg text;
  v_type text;
  v_key text;
begin
  if v_user is null then
    raise exception '직원 로그인이 필요합니다.';
  end if;
  if p_source not in ('journal','iap_auto','calendar_manual')
     or p_source is null
     or jsonb_typeof(p_changes) <> 'array'
     or octet_length(coalesce(p_changes::text,'')) >= 2600
     or p_item_date is null then
    raise exception '변경 이력 정보를 확인해 주세요.';
  end if;
  if jsonb_typeof(p_payload) <> 'object' or octet_length(coalesce(p_payload::text,'')) >= 19500 then
    raise exception '내담자 일정 저장 용량/형식을 확인해 주세요.';
  end if;
  select c.* into v_before
  from public.schedule_private_items c
  where c.id=p_client_id and c.user_id=v_user and c.kind='iap'
  for update;
  if not found or v_before.updated_at is distinct from p_expected_at then
    raise exception '다른 기기에서 자료를 수정했습니다. 새로고침 후 다시 확인해 주세요.';
  end if;
  v_reg := upper(regexp_replace(coalesce(p_payload->>'regNo',''),'[[:space:]]','','g'));
  if v_reg !~ '^A[0-9]{10,30}

     or v_reg <> upper(regexp_replace(coalesce(v_before.payload->>'regNo',''),'[[:space:]]','','g')) then
    raise exception 'IAP 등록번호가 기존 내담자와 다릅니다.';
  end if;
  v_type := case when (p_payload->>'clientStatus') is distinct from
                        (v_before.payload->>'clientStatus')
                 or (p_payload->>'statusDate') is distinct from
                        (v_before.payload->>'statusDate')
                 then 'status_change' else 'date_change' end;
  update public.schedule_private_items c
  set payload=p_payload, item_date=p_item_date, updated_at=clock_timestamp()
  where c.id=p_client_id and c.user_id=v_user and c.kind='iap'
    and c.updated_at=p_expected_at
  returning c.* into v_after;
  if not found then
    raise exception '다른 기기에서 내담자를 수정했습니다. 변경사항을 다시 확인해 주세요.';
  end if;
  v_key := 'change:'||p_client_id::text||':'||md5(p_expected_at::text||':'||v_reg);
  insert into public.schedule_client_activity
    (user_id,client_id,reg_no,activity_type,source_key,activity_date,details)
  values (
    v_user,p_client_id,v_reg,v_type,v_key,
    (now() at time zone 'Asia/Seoul')::date,
    jsonb_build_object('source',p_source,'changes',p_changes,
      'before_hash',md5(v_before.payload::text),'after_hash',md5(p_payload::text))
  );
  return query select v_after.id,v_after.kind,v_after.item_date,v_after.payload,v_after.updated_at;
end;
$;
revoke all on function public.schedule_client_commit_and_audit(uuid,timestamptz,jsonb,date,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.schedule_client_commit_and_audit(uuid,timestamptz,jsonb,date,text,jsonb)
  to authenticated;

