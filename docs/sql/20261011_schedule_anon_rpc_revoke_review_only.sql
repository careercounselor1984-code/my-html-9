-- REVIEW ONLY, do not apply automatically. 2026-10-11 security-advisor response.
-- 7 internal functions are callable by anon via inherited PUBLIC grants despite requiring staff auth.
-- Excludes schedule_director_morning_auth(p_token text), which is explicitly token-based and needs separate owner review.
-- PostgreSQL: REVOKE FROM anon alone does not remove EXECUTE inherited from PUBLIC.
revoke execute on function public.schedule_director_absence_action(p_action text,p_payload jsonb) from public, anon;
grant execute on function public.schedule_director_absence_action(p_action text,p_payload jsonb) to authenticated;
revoke execute on function public.schedule_work_alert_ack(p_keys text[]) from public, anon;
grant execute on function public.schedule_work_alert_ack(p_keys text[]) to authenticated;
revoke execute on function public.schedule_work_alert_feed() from public, anon;
grant execute on function public.schedule_work_alert_feed() to authenticated;
revoke execute on function public.schedule_work_notice_on_event() from public, anon;
-- Trigger-only function: no direct authenticated execute grant required.
revoke execute on function public.schedule_work_report(p_period text) from public, anon;
grant execute on function public.schedule_work_report(p_period text) to authenticated;
revoke execute on function public.schedule_work_report_ack(p_keys text[]) from public, anon;
grant execute on function public.schedule_work_report_ack(p_keys text[]) to authenticated;
revoke execute on function public.schedule_work_report_alert_feed() from public, anon;
grant execute on function public.schedule_work_report_alert_feed() to authenticated;
