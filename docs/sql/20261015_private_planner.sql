-- Personal records never participate in team snapshots, notifications or exports.
create table if not exists public.schedule_private_items (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 kind text not null check (kind in ('todo','iap')),
 item_date date not null,
 payload jsonb not null check (jsonb_typeof(payload)='object' and octet_length(payload::text)<20000),
 updated_at timestamptz not null default clock_timestamp()
);
create index if not exists schedule_private_items_owner_day on public.schedule_private_items(user_id,item_date);
alter table public.schedule_private_items enable row level security;
revoke all on public.schedule_private_items from anon,authenticated;
grant select,insert,delete on public.schedule_private_items to authenticated;
grant update(item_date,payload,updated_at) on public.schedule_private_items to authenticated;
create policy private_items_select on public.schedule_private_items for select to authenticated
 using(user_id=(select auth.uid()) and exists(select 1 from public.schedule_staff s where s.auth_user_id=(select auth.uid()) and s.is_active and not s.must_change_password));
create policy private_items_insert on public.schedule_private_items for insert to authenticated
 with check(user_id=(select auth.uid()) and exists(select 1 from public.schedule_staff s where s.auth_user_id=(select auth.uid()) and s.is_active and not s.must_change_password));
create policy private_items_update on public.schedule_private_items for update to authenticated
 using(user_id=(select auth.uid()) and exists(select 1 from public.schedule_staff s where s.auth_user_id=(select auth.uid()) and s.is_active and not s.must_change_password))
 with check(user_id=(select auth.uid()) and exists(select 1 from public.schedule_staff s where s.auth_user_id=(select auth.uid()) and s.is_active and not s.must_change_password));
create policy private_items_delete on public.schedule_private_items for delete to authenticated
 using(user_id=(select auth.uid()) and exists(select 1 from public.schedule_staff s where s.auth_user_id=(select auth.uid()) and s.is_active and not s.must_change_password));
