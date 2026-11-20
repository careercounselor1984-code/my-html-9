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
    )
    and exists (
      select 1 from public.schedule_staff s
      where s.auth_user_id=(select auth.uid())
        and s.is_active and not s.must_change_password
    )
  );
-- Never grant UPDATE/DELETE on this append-only evidence table.
