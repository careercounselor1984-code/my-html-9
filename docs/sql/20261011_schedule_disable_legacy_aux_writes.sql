-- Execute only after the aux CAS RPC has been deployed and tested.
-- Legacy schedule clients using PostgREST direct upsert/delete will safely fail instead of overwriting fresh cross-device data.
-- New client uses SECURITY DEFINER public.schedule_apply_aux_changes and does not need direct DML.
revoke insert,update,delete on table public.schedule_participants from authenticated;
revoke insert,update,delete on table public.schedule_closures from authenticated;
revoke insert,update,delete on table public.schedule_notices from authenticated;
