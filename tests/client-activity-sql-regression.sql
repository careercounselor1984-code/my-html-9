\set ON_ERROR_STOP on
\echo 'Create isolated Postgres fixture (NO production DB)'
create schema auth;
create role anon nologin;
create role authenticated nologin;
grant usage on schema public,auth to authenticated;
create function auth.uid() returns uuid language sql stable security invoker
as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant execute on function auth.uid() to authenticated;
create table auth.users(id uuid primary key);
create table public.schedule_staff (
 id uuid primary key,
 auth_user_id uuid not null references auth.users(id),
 is_active boolean not null,
 must_change_password boolean not null
);
create table public.schedule_private_items (
 id uuid primary key,
 user_id uuid not null references auth.users(id),
 kind text not null check (kind in ('iap','todo')),
 item_date date not null,
 payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<20000),
 updated_at timestamptz not null default clock_timestamp()
);
alter table public.schedule_private_items enable row level security;
grant select,insert,update on public.schedule_private_items to authenticated;
grant select on public.schedule_staff to authenticated;
create policy own_read on public.schedule_private_items
 for select to authenticated using (user_id=auth.uid() and exists(
  select 1 from public.schedule_staff s where s.auth_user_id=auth.uid() and s.is_active and not s.must_change_password
 ));
create policy own_update on public.schedule_private_items
 for update to authenticated
 using (user_id=auth.uid())
 with check (user_id=auth.uid());
insert into auth.users values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into public.schedule_staff values
 ('11111111-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',true,false),
 ('11111111-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002',true,false);
insert into public.schedule_private_items (id,user_id,kind,item_date,payload) values
 ('22222222-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','iap','2026-11-01',
 '{"regNo":"A12345678901","name":"Synthetic A","iapDate":"2026-11-01","clientStatus":"active"}'::jsonb),
 ('22222222-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','iap','2026-11-01',
 '{"regNo":"A98765432109","name":"Synthetic B","iapDate":"2026-11-01","clientStatus":"active"}'::jsonb);
\ir ../supabase/migrations/20261121_schedule_client_activity.sql
\echo 'RLS and role permissions'
do $$
begin
 if has_table_privilege('anon','public.schedule_client_activity','SELECT') then raise exception 'Anonymous read allowed'; end if;
 if has_table_privilege('authenticated','public.schedule_client_activity','UPDATE') then raise exception 'Audit update allowed'; end if;
 if has_table_privilege('authenticated','public.schedule_client_activity','DELETE') then raise exception 'Audit delete allowed'; end if;
 if not has_table_privilege('authenticated','public.schedule_client_activity','INSERT') then raise exception 'Staff insert missing'; end if;
 if has_function_privilege('anon','public.schedule_client_commit_and_audit(uuid,timestamptz,jsonb,date,text,jsonb)','EXECUTE') then raise exception 'Anon RPC allowed'; end if;
 if not has_function_privilege('authenticated','public.schedule_client_commit_and_audit(uuid,timestamptz,jsonb,date,text,jsonb)','EXECUTE') then raise exception 'Staff RPC not executable'; end if;
end $$;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
insert into public.schedule_client_activity(user_id,client_id,reg_no,activity_type,source_key,activity_date,details)
values ('00000000-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000001','A12345678901','consultation','journal:test:20261121','2026-11-21','{"pageId":"p05"}'::jsonb);
do $$
begin
 if (select count(*) from public.schedule_client_activity)<>1 then raise exception 'Owner read failed'; end if;
 begin
  insert into public.schedule_client_activity(user_id,client_id,reg_no,activity_type,source_key,activity_date)
  values ('00000000-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000002','A98765432109','consultation','journal:forged:other:1','2026-11-21');
  raise exception 'Cross-owner insert incorrectly allowed';
 exception when insufficient_privilege or check_violation then null;
 end;
 begin
  insert into public.schedule_client_activity(user_id,client_id,reg_no,activity_type,source_key,activity_date)
  values ('00000000-0000-4000-8000-000000000001','22222222-0000-4000-8000-000000000001','A99999999999','consultation','journal:forged:reg:1','2026-11-21');
  raise exception 'Mismatched IAP insert incorrectly allowed';
 exception when insufficient_privilege or check_violation then null;
 end;
 if (select count(*) from public.schedule_client_activity)<>1 then raise exception 'Forbidden insert left rows'; end if;
end $$;
\echo 'Atomic status and audit commit'
select id from public.schedule_client_commit_and_audit(
 '22222222-0000-4000-8000-000000000001'::uuid,
 (select updated_at from public.schedule_private_items where id='22222222-0000-4000-8000-000000000001'),
 '{"regNo":"A12345678901","name":"Synthetic A","iapDate":"2026-11-01","clientStatus":"employed","statusDate":"2026-11-20"}'::jsonb,
 '2026-11-01'::date, 'journal',
 '[{"field":"clientStatus","from":"active","to":"employed"}]'::jsonb
);
do $$
begin
 if (select payload->>'clientStatus' from public.schedule_private_items where id='22222222-0000-4000-8000-000000000001') <> 'employed'
 then raise exception 'Atomic payload not committed';end if;
 if (select count(*) from public.schedule_client_activity where activity_type='status_change')<>1
 then raise exception 'Atomic audit not committed';end if;
end $$;
reset role;
\echo 'Force audit permission error; original calendar row MUST roll back'
revoke insert on public.schedule_client_activity from authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
do $$
begin
 begin
  perform * from public.schedule_client_commit_and_audit(
   '22222222-0000-4000-8000-000000000001'::uuid,
   (select updated_at from public.schedule_private_items where id='22222222-0000-4000-8000-000000000001'),
   '{"regNo":"A12345678901","name":"Synthetic A","iapDate":"2026-11-01","clientStatus":"ended","statusDate":"2026-11-21"}'::jsonb,
   '2026-11-01'::date, 'journal', '[{"field":"clientStatus","from":"employed","to":"ended"}]'::jsonb
  );
  raise exception 'An unaudited client change was accepted';
 exception when insufficient_privilege then null;
 end;
 if (select payload->>'clientStatus' from public.schedule_private_items where id='22222222-0000-4000-8000-000000000001') <> 'employed'
 then raise exception 'Audit failure changed client status';end if;
end $$;
reset role;
grant insert on public.schedule_client_activity to authenticated;
\echo 'Cross-user visibility, JWT revoked staff'
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
do $$
begin
 if (select count(*) from public.schedule_client_activity)<>0 then raise exception 'Other employee can read audit';end if;
 begin
  perform * from public.schedule_client_commit_and_audit(
   '22222222-0000-4000-8000-000000000001'::uuid,now(),
   '{"regNo":"A12345678901","clientStatus":"ended"}'::jsonb,'2026-11-21'::date,'journal','[]'::jsonb);
  raise exception 'Other employee updated client';
 exception when others then
  if sqlerrm = 'Other employee updated client' then raise; end if;
 end;
end $$;
reset role;
update public.schedule_staff set is_active=false where auth_user_id='00000000-0000-4000-8000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
do $$
begin
 if (select count(*) from public.schedule_client_activity)<>0 then raise exception 'Inactive employee can read';end if;
end $$;
\echo 'PASS isolated Postgres: RLS, cross-account, reg validation, atomic rollback, revocation'
