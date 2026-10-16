select cron.schedule('goodjob-private-task-reminders','* * * * *',$task_job$
select net.http_post(
 url := 'https://hnhccnyitrlzqprnredi.supabase.co/functions/v1/schedule-task-reminders',
 headers := jsonb_build_object('Content-Type','application/json','X-Morning-Key',
   (select decrypted_secret from vault.decrypted_secrets where name='goodjob_schedule_director_morning_20261011')),
 body := '{}'::jsonb,
 timeout_milliseconds := 15000
);
$task_job$);
