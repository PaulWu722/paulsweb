-- 活動前提醒排程：每 10 分鐘呼叫 reminders function
-- 使用前把 <你的 CRON_SECRET> 換成你在 Edge Functions → Secrets 設定的同一組字串
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('event-reminders') where exists (select 1 from cron.job where jobname = 'event-reminders');
select cron.schedule(
  'event-reminders',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://gserdnkovlwfdgcaguqe.supabase.co/functions/v1/reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', '<你的 CRON_SECRET>'),
    body := '{}'::jsonb
  );
  $$
);
