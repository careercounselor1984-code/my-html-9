-- Emergency legacy compatibility only; this weakens cross-device event concurrency safety.
grant insert,update,delete on table public.schedule_events to authenticated;
