-- Revert only atomic RPC (existing bookings untouched).
drop function if exists public.schedule_apply_event_changes(jsonb);
