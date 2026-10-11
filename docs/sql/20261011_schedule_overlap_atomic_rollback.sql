-- Roll back only the consultation overlap trigger. Preserve all events.
drop trigger if exists schedule_enforce_consultation_overlap_trg on public.schedule_events;
drop function if exists public.schedule_enforce_consultation_overlap();