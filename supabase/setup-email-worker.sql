-- Run after deploying purchase-emails and storing the project URL and the
-- EMAIL_WORKER_SECRET in Vault as sellow_project_url and sellow_email_worker_secret.
-- Secrets themselves are never included in this file or in Git.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$
declare v_job record;
begin
  for v_job in select jobid from cron.job where jobname='sellow-purchase-emails' loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end $$;
select cron.schedule('sellow-purchase-emails','* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='sellow_project_url') || '/functions/v1/purchase-emails',
    headers := jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name='sellow_email_worker_secret')),
    body := '{}'::jsonb
  );
$job$);
