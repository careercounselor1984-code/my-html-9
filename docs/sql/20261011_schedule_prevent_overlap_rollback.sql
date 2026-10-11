-- Drop only the staged overlap guard. Does not delete or modify appointments.
drop trigger if exists schedule_prevent_consultation_overlap_trigger on public.schedule_events;
drop function if exists public.schedule_prevent_consultation_overlap();
