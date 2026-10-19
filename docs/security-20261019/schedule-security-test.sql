-- Run after hardening inside a transaction; ALWAYS roll back fixtures and employee status changes.
do $$
declare a record;b record;result jsonb;event_id text:='security-audit-'||gen_random_uuid()::text;rejected boolean:=false;
begin
 select s.id,s.auth_user_id,s.center into a from public.schedule_staff s where s.is_active and not s.must_change_password and s.auth_user_id is not null and s.role<>'director' and exists(select 1 from public.schedule_staff x where x.center=s.center and x.id<>s.id and x.is_active) limit 1;
 if a.id is null then raise exception 'No same-center test actor';end if;
 select id into b from public.schedule_staff where center=a.center and id<>a.id and is_active limit 1;
 perform set_config('request.jwt.claim.sub',a.auth_user_id::text,true);
 insert into public.schedule_events(id,staff_id,event_date,payload) values(event_id,b.id,current_date+90,'{"kind":"work","type":"PRIVATE_SENTINEL","title":"PRIVATE_SENTINEL","memo":"PRIVATE_SENTINEL","phone":"PRIVATE_SENTINEL","customSecret":"PRIVATE_SENTINEL","time":"09:00","end":"09:30"}');
 result:=public.schedule_get_snapshot_v17();
 if not exists(select 1 from jsonb_array_elements(result->'events') e where e->>'id'=event_id) then raise exception 'Missing shared event';end if;
 if exists(select 1 from jsonb_array_elements(result->'events') e where e->>'id'=event_id and (e ? 'phone' or e ? 'memo' or e ? 'customSecret' or e->>'title'<>'업무 일정' or e->>'type'<>'기타')) then raise exception 'Colleague data leak';end if;
 if exists(select 1 from jsonb_array_elements(result->'events') e where e->>'center'<>a.center) then raise exception 'Cross-center event leak';end if;
 if exists(select 1 from jsonb_array_elements(public.schedule_staff_directory()) e where e->>'center'<>a.center) then raise exception 'Cross-center staff leak';end if;
 execute 'set local role authenticated';
 if exists(select 1 from public.schedule_events where staff_id<>a.id) then raise exception 'RLS event ownership failed';end if;
 if exists(select 1 from public.schedule_participants where staff_id<>a.id) then raise exception 'RLS participant ownership failed';end if;
 execute 'reset role';
 update public.schedule_staff set must_change_password=true where id=a.id;
 begin perform public.schedule_get_snapshot_v17();exception when others then rejected:=true;end;
 if not rejected then raise exception 'Password gate bypass';end if;
 update public.schedule_staff set must_change_password=false,is_active=false where id=a.id;
 if public.schedule_my_staff_id() is not null then raise exception 'Inactive identity allowed';end if;
 rejected:=false;begin perform public.schedule_get_snapshot_v17();exception when others then rejected:=true;end;
 if not rejected then raise exception 'Inactive snapshot allowed';end if;
 execute 'set local role authenticated';
 if exists(select 1 from public.schedule_events) or exists(select 1 from public.schedule_participants) then raise exception 'Inactive RLS allowed';end if;
 execute 'reset role';
 raise notice 'PASS: whitelist, center isolation, RLS ownership, password gate, revocation';
end $$;
