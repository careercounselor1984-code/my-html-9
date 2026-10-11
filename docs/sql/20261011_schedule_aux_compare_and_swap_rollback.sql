-- Rollback only after all deployed clients have stopped calling this function.
drop function if exists public.schedule_apply_aux_changes(text,jsonb);
