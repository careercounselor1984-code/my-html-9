-- Legacy direct-write clients must not bypass schedule_apply_event_changes version checks.
-- New main index calls the authenticated RPC instead of the schedule_events table directly.
revoke insert,update,delete on table public.schedule_events from authenticated;
