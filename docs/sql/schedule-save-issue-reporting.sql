-- Additive manager error reporting. No counseling payload or client name is accepted.
create table private.schedule_save_issues (
 id uuid primary key default gen_random_uuid(),
 staff_id uuid not null references public.schedule_staff(id),
 issue_key uuid not null,
 center text not null,
 error_code text not null check (error_code in ('overlap','version','validation','network','backup','save')),
 pending_count integer not null check (pending_count between 0 and 10000),
 opened_at timestamptz not null default now(),
 resolved_at timestamptz,
 unique(staff_id,issue_key)
);
create index schedule_save_issues_center_opened_idx on private.schedule_save_issues(center,opened_at desc);
alter table private.schedule_save_issues enable row level security;
revoke all on private.schedule_save_issues from public,anon,authenticated;

create function private.schedule_save_issue_report(p_issue_key uuid,p_code text,p_resolved boolean,p_pending_count integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me record; result_id uuid;
begin
 select id,center into me from public.schedule_staff where auth_user_id=auth.uid() and is_active and not must_change_password;
 if not found then raise exception '직원 인증이 필요합니다';end if;
 if p_issue_key is null or p_code is null or p_code not in ('overlap','version','validation','network','backup','save')
  or p_resolved is null or p_pending_count is null or p_pending_count not between 0 and 10000 then raise exception '오류 보고 형식을 확인하세요';end if;
 perform pg_advisory_xact_lock(hashtext(me.id::text),hashtext('save_issue_report'));
 if not exists(select 1 from private.schedule_save_issues where staff_id=me.id and issue_key=p_issue_key)
   and (select count(*) from private.schedule_save_issues where staff_id=me.id and opened_at>now()-interval '1 day')>=100 then
  raise exception '오류 보고 요청이 너무 많습니다. 잠시 후 다시 시도하세요';
 end if;
 insert into private.schedule_save_issues(staff_id,issue_key,center,error_code,pending_count,resolved_at)
 values(me.id,p_issue_key,me.center,p_code,p_pending_count,case when p_resolved then now() end)
 on conflict(staff_id,issue_key) do update set
  resolved_at=coalesce(schedule_save_issues.resolved_at,excluded.resolved_at)
 returning id into result_id;
 return jsonb_build_object('ok',true,'id',result_id);
end $$;

create function private.schedule_save_issue_feed()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me record;
begin
 select id,center,role into me from public.schedule_staff where auth_user_id=auth.uid() and is_active and not must_change_password;
 if not found then raise exception '직원 인증이 필요합니다';end if;
 if me.role not in ('manager','director') then return jsonb_build_object('items','[]'::jsonb);end if;
 return jsonb_build_object('items',coalesce((select jsonb_agg(x.item order by x.resolved,x.opened_at desc) from (
  select jsonb_build_object(
   'key','saveerror:'||i.id::text||case when i.resolved_at is null then ':open' else ':resolved' end,
   'source','saveerror','scope',i.center,'kind',i.error_code,'important',i.resolved_at is null,
   'title',s.display_name||' · 일정 저장 오류 '||case when i.resolved_at is null then '[미해결]' else '[해결]' end,
   'reporter',s.display_name,'date',(i.opened_at at time zone 'Asia/Seoul')::date::text,
   'openedAt',i.opened_at,'resolvedAt',i.resolved_at,'pendingCount',i.pending_count,
   'status',case when i.resolved_at is null then 'open' else 'resolved' end,
   'detail',case i.error_code when 'overlap' then '상담·근무 시간 중복' when 'version' then '다른 기기와 일정 수정 충돌'
    when 'validation' then '일정 입력값 확인 필요' when 'network' then '서버 연결 실패' when 'backup' then '기기 미저장 자료 백업 실패' else '서버 저장 실패' end,
   'seen',exists(select 1 from public.schedule_alert_seen a where a.staff_id=me.id and a.alert_key='saveerror:'||i.id::text||case when i.resolved_at is null then ':open' else ':resolved' end)
  ) as item,i.opened_at,i.resolved_at is not null as resolved
  from private.schedule_save_issues i join public.schedule_staff s on s.id=i.staff_id
  where (me.role='director' or i.center=me.center) and (i.resolved_at is null or i.resolved_at>now()-interval '30 days')
  order by i.resolved_at is not null,i.opened_at desc limit 200
 ) x),'[]'::jsonb));
end $$;

create function private.schedule_save_issue_ack(p_keys text[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare me record; n integer;
begin
 select id,center,role into me from public.schedule_staff where auth_user_id=auth.uid() and is_active and not must_change_password;
 if not found or me.role not in ('manager','director') then raise exception '팀장·부장만 오류 보고를 확인할 수 있습니다';end if;
 if p_keys is null or cardinality(p_keys)>40 then raise exception '확인 항목은 최대 40건입니다';end if;
 insert into public.schedule_alert_seen(staff_id,alert_key)
 select me.id,k from unnest(p_keys) k where exists(select 1 from private.schedule_save_issues i
  where (me.role='director' or i.center=me.center) and k='saveerror:'||i.id::text||case when i.resolved_at is null then ':open' else ':resolved' end)
 on conflict do nothing;
 get diagnostics n=row_count;
 return jsonb_build_object('ok',true,'processed',n);
end $$;

-- Narrow public RPC wrappers; privileged implementations remain outside the exposed schema.
create function public.schedule_save_issue_report(p_issue_key uuid,p_code text,p_resolved boolean,p_pending_count integer)
returns jsonb language sql security invoker set search_path='' as $$ select private.schedule_save_issue_report(p_issue_key,p_code,p_resolved,p_pending_count); $$;
create function public.schedule_save_issue_feed()
returns jsonb language sql stable security invoker set search_path='' as $$ select private.schedule_save_issue_feed(); $$;
create function public.schedule_save_issue_ack(p_keys text[])
returns jsonb language sql security invoker set search_path='' as $$ select private.schedule_save_issue_ack(p_keys); $$;
revoke all on function private.schedule_save_issue_report(uuid,text,boolean,integer),private.schedule_save_issue_feed(),private.schedule_save_issue_ack(text[]),
 public.schedule_save_issue_report(uuid,text,boolean,integer),public.schedule_save_issue_feed(),public.schedule_save_issue_ack(text[]) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.schedule_save_issue_report(uuid,text,boolean,integer),private.schedule_save_issue_feed(),private.schedule_save_issue_ack(text[]),
 public.schedule_save_issue_report(uuid,text,boolean,integer),public.schedule_save_issue_feed(),public.schedule_save_issue_ack(text[]) to authenticated;
