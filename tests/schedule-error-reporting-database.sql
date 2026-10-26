-- Only freshly generated synthetic accounts are used. ROLLBACK removes every fixture/report.
-- No real employee identity is used and no outbound email/push is triggered.
begin;
do $$
declare
 counselor_user uuid:=gen_random_uuid();manager_user uuid:=gen_random_uuid();other_user uuid:=gen_random_uuid();director_user uuid:=gen_random_uuid();
 counselor_staff uuid:=gen_random_uuid();issue uuid:=gen_random_uuid(); result jsonb; incident_id text; alert_key text; rejected boolean:=false;
begin
 insert into auth.users(id,email) values(counselor_user,counselor_user||'@fixture.invalid'),(manager_user,manager_user||'@fixture.invalid'),(other_user,other_user||'@fixture.invalid'),(director_user,director_user||'@fixture.invalid');
 insert into public.schedule_staff(id,auth_user_id,center,display_name,email,role,is_active,must_change_password)
 values(counselor_staff,counselor_user,'북부센터','검증상담사-'||left(counselor_user::text,8),counselor_user||'@fixture.invalid','counselor',true,false),
 (gen_random_uuid(),manager_user,'북부센터','검증팀장-'||left(manager_user::text,8),manager_user||'@fixture.invalid','manager',true,false),
 (gen_random_uuid(),other_user,'서부센터','검증타센터-'||left(other_user::text,8),other_user||'@fixture.invalid','manager',true,false),
 (gen_random_uuid(),director_user,'전체','검증부장-'||left(director_user::text,8),director_user||'@fixture.invalid','director',true,false);
 perform set_config('request.jwt.claim.sub',counselor_user::text,true);
 result:=public.schedule_save_issue_report(issue,'overlap',false,3);assert (result->>'ok')::boolean;incident_id:=result->>'id';alert_key:='saveerror:'||incident_id||':open';
 result:=public.schedule_save_issue_report(issue,'overlap',false,3);assert result->>'id'=incident_id;
 assert (select count(*)=1 from private.schedule_save_issues where staff_id=counselor_staff),'duplicate report';
 assert jsonb_array_length(public.schedule_save_issue_feed()->'items')=0,'counselor must not read manager feed';
 perform set_config('request.jwt.claim.sub',manager_user::text,true);
 result:=public.schedule_save_issue_feed();assert exists(select 1 from jsonb_array_elements(result->'items') x where x->>'key'=alert_key and x->>'status'='open' and (x->>'important')::boolean),'own center manager missing report';
 result:=public.schedule_save_issue_ack(array[alert_key]);assert (result->>'processed')::int=1;
 assert (select resolved_at is null from private.schedule_save_issues where id=incident_id::uuid),'read acknowledgement must not resolve incident';
 perform set_config('request.jwt.claim.sub',other_user::text,true);
 result:=public.schedule_save_issue_feed();assert not exists(select 1 from jsonb_array_elements(result->'items') x where x->>'key'=alert_key),'cross-center leak';
 result:=public.schedule_save_issue_ack(array[alert_key]);assert (result->>'processed')::int=0,'cross-center acknowledgement';
 perform set_config('request.jwt.claim.sub',director_user::text,true);
 result:=public.schedule_save_issue_feed();assert exists(select 1 from jsonb_array_elements(result->'items') x where x->>'key'=alert_key),'director scope';
 perform set_config('request.jwt.claim.sub',counselor_user::text,true);
 result:=public.schedule_save_issue_report(issue,'overlap',true,3);
 result:=public.schedule_save_issue_report(issue,'overlap',false,3); -- late retry cannot reopen resolved state
 assert (select resolved_at is not null from private.schedule_save_issues where id=incident_id::uuid),'resolved incident reopened by delayed report';
 perform set_config('request.jwt.claim.sub',manager_user::text,true);
 result:=public.schedule_save_issue_feed();assert exists(select 1 from jsonb_array_elements(result->'items') x where x->>'key'='saveerror:'||incident_id||':resolved' and x->>'status'='resolved' and not (x->>'important')::boolean),'resolution missing';
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.schedule_save_issue_report(gen_random_uuid(),'save',false,0);exception when others then rejected:=true;end;
 assert rejected,'unauthenticated report accepted';
 assert not has_table_privilege('authenticated','private.schedule_save_issues','SELECT'),'direct table access';
 assert not has_function_privilege('anon','public.schedule_save_issue_feed()','EXECUTE'),'anonymous feed access';
 assert has_function_privilege('authenticated','public.schedule_save_issue_report(uuid,text,boolean,integer)','EXECUTE'),'report RPC missing';
end $$;
select 'PASS: synthetic counselor report -> own manager -> acknowledgement -> resolution; dedup, other-center isolation, director scope, delayed retry, unauthenticated rejection and grants' as result;
rollback;
