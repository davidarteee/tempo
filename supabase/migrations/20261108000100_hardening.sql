-- Enduriment segons els avisos de Supabase

-- search_path fix a les funcions de trigger
alter function public.tempo_touch_server_updated_at() set search_path = '';
alter function public.tempo_lww_guard() set search_path = '';

-- Les funcions de trigger no s'han de poder cridar via /rest/v1/rpc
revoke execute on function public.tempo_check_ownership() from public, anon, authenticated;
revoke execute on function public.tempo_check_parent_event() from public, anon, authenticated;
revoke execute on function public.tempo_check_parent_task() from public, anon, authenticated;
revoke execute on function public.tempo_handle_new_user() from public, anon, authenticated;
revoke execute on function public.tempo_touch_server_updated_at() from public, anon, authenticated;
revoke execute on function public.tempo_lww_guard() from public, anon, authenticated;

-- Índexs per a claus foranes
create index if not exists event_exceptions_category_idx on public.event_exceptions (category_id);
create index if not exists events_calendar_idx on public.events (calendar_id);
create index if not exists events_category_idx on public.events (category_id);
create index if not exists events_series_parent_idx on public.events (series_parent_id);
create index if not exists google_sync_records_exception_idx on public.google_sync_records (exception_id);
create index if not exists profiles_default_calendar_idx on public.profiles (default_calendar_id);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
create index if not exists task_subtasks_task_idx on public.task_subtasks (task_id);
create index if not exists tasks_category_idx on public.tasks (category_id);

-- notification_log i google_sync_records: RLS activat sense polítiques a propòsit
-- (només hi accedeix el servidor amb la service role).
