-- Emergency rollback for legacy clients; removes the hard stop for stale multi-device writes.
-- Apply only if app regression requires legacy PostgREST writes to be temporarily restored.
grant insert,update,delete on table public.schedule_participants to authenticated;
grant insert,update,delete on table public.schedule_closures to authenticated;
grant insert,update,delete on table public.schedule_notices to authenticated;
