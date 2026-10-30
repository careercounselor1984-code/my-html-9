-- Additive schema. Access is exclusively through the authenticated center-board
-- Edge Function; browser roles have no direct table access.
create table public.schedule_center_cards (
 id uuid primary key default gen_random_uuid(),
 center text not null,
 created_by uuid not null references public.schedule_staff(id),
 title text not null check (length(title) between 1 and 160),
 content text not null check (length(content) between 1 and 12000),
 kind text not null check (kind in ('memo','notice','request')),
 priority text not null default 'normal' check (priority in ('normal','important','urgent')),
 pinned boolean not null default false,
 status text not null default 'open' check (status in ('open','done')),
 deadline timestamptz,
 expires_at timestamptz,
 revision integer not null default 1 check (revision > 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index schedule_center_cards_feed on public.schedule_center_cards(center,status,updated_at desc);
create table public.schedule_center_responses (
 card_id uuid not null references public.schedule_center_cards(id) on delete cascade,
 staff_id uuid not null references public.schedule_staff(id),
 quantity integer check (quantity between 0 and 100000),
 content text not null default '' check (length(content)<=4000),
 updated_at timestamptz not null default now(),
 primary key(card_id,staff_id)
);
create index schedule_center_responses_staff on public.schedule_center_responses(staff_id);
create table public.schedule_center_acknowledgements (
 card_id uuid not null references public.schedule_center_cards(id) on delete cascade,
 staff_id uuid not null references public.schedule_staff(id),
 revision integer not null,
 primary key(card_id,staff_id)
);
create index schedule_center_acknowledgements_staff on public.schedule_center_acknowledgements(staff_id);
alter table public.schedule_center_cards enable row level security;
alter table public.schedule_center_responses enable row level security;
alter table public.schedule_center_acknowledgements enable row level security;
create policy center_cards_edge_only on public.schedule_center_cards for all to authenticated using(false) with check(false);
create policy center_responses_edge_only on public.schedule_center_responses for all to authenticated using(false) with check(false);
create policy center_acknowledgements_edge_only on public.schedule_center_acknowledgements for all to authenticated using(false) with check(false);
revoke all on public.schedule_center_cards,public.schedule_center_responses,public.schedule_center_acknowledgements from public,anon,authenticated;
grant all on public.schedule_center_cards,public.schedule_center_responses,public.schedule_center_acknowledgements to service_role;
