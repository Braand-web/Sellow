-- Run after deploying message-notifications. The existing worker secret stays
-- inside Vault and is never returned to the browser or command output.
select cron.schedule('sellow-message-notifications','* * * * *',$$
  select net.http_post(
    url:=(select decrypted_secret from vault.decrypted_secrets where name='sellow_project_url')||'/functions/v1/message-notifications',
    headers:=jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name='sellow_email_worker_secret')),
    body:='{}'::jsonb,timeout_milliseconds:=100000
  );
$$);
