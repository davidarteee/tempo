-- Recordatoris push: Supabase crida l'app (Vercel) cada minut perquè enviï els avisos pendents.
-- L'adreça de l'app i el CRON_SECRET es guarden a Supabase Vault (xifrats), no en aquest fitxer:
--   select vault.create_secret('https://<domini>.vercel.app', 'tempo_app_url');
--   select vault.create_secret('<CRON_SECRET>', 'tempo_cron_secret');
-- Per canviar-los: select vault.update_secret(id, '<nou valor>') from vault.secrets where name = '...';

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.tempo_dispatch_reminders()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_url text;
  secret text;
begin
  select decrypted_secret into app_url from vault.decrypted_secrets where name = 'tempo_app_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'tempo_cron_secret';
  if app_url is null or secret is null then
    return; -- encara no configurat
  end if;
  perform net.http_get(
    url := rtrim(app_url, '/') || '/api/cron/reminders',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 25000
  );
end $$;

revoke execute on function public.tempo_dispatch_reminders() from public, anon, authenticated;

-- Una sola tasca programada (si ja existeix, es reemplaça)
select cron.unschedule(jobid) from cron.job where jobname = 'tempo-reminders';
select cron.schedule('tempo-reminders', '* * * * *', 'select public.tempo_dispatch_reminders()');
