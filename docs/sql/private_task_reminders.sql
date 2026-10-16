-- Private task reminders: browser opt-in is separate from existing schedule alerts.
create table if not exists public.schedule_task_devices (
 user_id uuid not null references auth.users(id) on delete cascade,
 endpoint text not null check(length(endpoint)<=1800 and endpoint like 'https://%'),
 p256dh text not null check(length(p256dh) between 1 and 180),
 auth text not null check(length(auth) between 1 and 90),
 created_at timestamptz not null default clock_timestamp(),
 primary key(user_id,endpoint)
);
alter table public.schedule_task_devices enable row level security;
revoke all on public.schedule_task_devices from public,anon,authenticated;
grant select,insert,delete on public.schedule_task_devices to authenticated;
grant all on public.schedule_task_devices to service_role;
create policy task_devices_select on public.schedule_task_devices for select to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.schedule_staff s where s.auth_user_id=(select auth.uid()) and s.is_active and not s.must_change_password));
create policy task_devices_insert on public.schedule_task_devices for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.schedule_staff s where s.auth_user_id=(select auth.uid()) and s.is_active and not s.must_change_password));
create policy task_devices_delete on public.schedule_task_devices for delete to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.schedule_staff s where s.auth_user_id=(select auth.uid()) and s.is_active and not s.must_change_password));
create table if not exists public.schedule_task_reminders (
 task_id uuid primary key references public.schedule_private_items(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 remind_at timestamptz not null,
 delivered_at timestamptz,
 lease_until timestamptz,
 lease_token uuid,
 attempts integer not null default 0,
 last_error text
);
create index if not exists task_reminders_ready on public.schedule_task_reminders(remind_at) where delivered_at is null;
create index if not exists task_reminders_owner on public.schedule_task_reminders(user_id);
alter table public.schedule_task_reminders enable row level security;
revoke all on public.schedule_task_reminders from public,anon,authenticated;
grant select on public.schedule_task_reminders to authenticated;
grant all on public.schedule_task_reminders to service_role;
create policy task_reminders_select on public.schedule_task_reminders for select to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.schedule_staff s where s.auth_user_id=(select auth.uid()) and s.is_active and not s.must_change_password));
-- Internal trigger needs elevated table rights because browser callers may not write the queue.
-- It never takes a user id argument: the authenticated owner is taken from the protected task row.
create or replace function public.schedule_sync_task_reminder() returns trigger
language plpgsql security definer set search_path='' as $$
declare at_time timestamptz;
begin
 if new.kind<>'todo' or coalesce(new.payload->>'entryType','task')='memo' or new.payload->>'done'='true' or new.payload->>'reminderEnabled' is distinct from 'true' then
   delete from public.schedule_task_reminders where task_id=new.id;return new;
 end if;
 begin at_time:=(new.payload->>'remindAt')::timestamptz;
 exception when others then raise exception '알림 시간을 확인하세요'; end;
 if at_time is null then raise exception '알림 시간을 입력하세요';end if;
 insert into public.schedule_task_reminders(task_id,user_id,remind_at) values(new.id,new.user_id,at_time)
 on conflict(task_id) do update set
 user_id=excluded.user_id,remind_at=excluded.remind_at,
 delivered_at=case when schedule_task_reminders.remind_at=excluded.remind_at then schedule_task_reminders.delivered_at else null end,
 lease_until=case when schedule_task_reminders.remind_at=excluded.remind_at then schedule_task_reminders.lease_until else null end,
 lease_token=case when schedule_task_reminders.remind_at=excluded.remind_at then schedule_task_reminders.lease_token else null end,
 attempts=case when schedule_task_reminders.remind_at=excluded.remind_at then schedule_task_reminders.attempts else 0 end,
 last_error=case when schedule_task_reminders.remind_at=excluded.remind_at then schedule_task_reminders.last_error else null end;
 return new;
end $$;
revoke all on function public.schedule_sync_task_reminder() from public,anon,authenticated;
drop trigger if exists schedule_task_reminder_sync on public.schedule_private_items;
create trigger schedule_task_reminder_sync after insert or update of payload on public.schedule_private_items for each row execute function public.schedule_sync_task_reminder();
create or replace function public.schedule_claim_task_reminders(p_limit integer default 40)
returns table(task_id uuid,user_id uuid,remind_at timestamptz,lease_token uuid)
language sql security invoker set search_path='' as $$
 update public.schedule_task_reminders r set lease_token=gen_random_uuid(),lease_until=clock_timestamp()+interval '3 minutes',attempts=r.attempts+1
 from (select q.task_id from public.schedule_task_reminders q where q.delivered_at is null and q.remind_at<=clock_timestamp() and q.remind_at>=clock_timestamp()-interval '24 hours' and (q.lease_until is null or q.lease_until<clock_timestamp()) order by q.remind_at for update skip locked limit least(greatest(p_limit,1),40)) ready
 where r.task_id=ready.task_id returning r.task_id,r.user_id,r.remind_at,r.lease_token;
$$;
revoke all on function public.schedule_claim_task_reminders(integer) from public,anon,authenticated;
grant execute on function public.schedule_claim_task_reminders(integer) to service_role;
