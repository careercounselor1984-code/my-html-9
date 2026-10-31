-- Existing cards remain general until their author/center manager classifies them.
alter table public.schedule_center_cards
 add column category text not null default 'general'
 check (category in ('general','employment','company','center','case'));
create index schedule_center_cards_category on public.schedule_center_cards(center,category,status,updated_at desc);
