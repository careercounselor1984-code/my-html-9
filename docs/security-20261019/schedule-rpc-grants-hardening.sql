REVOKE EXECUTE ON FUNCTION public.schedule_work_alert_ack(text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.schedule_work_notice_on_event() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.schedule_work_notice_on_event() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.schedule_work_report(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.schedule_work_alert_feed() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.schedule_work_report_ack(text[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.schedule_director_absence_action(text,jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.schedule_work_report_alert_feed() FROM PUBLIC, anon;