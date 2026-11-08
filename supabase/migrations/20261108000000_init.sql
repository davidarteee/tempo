-- Tempo — esquema inicial
-- Principis:
--  * Tots els IDs són UUID generats al client (permet creació offline i operacions idempotents).
--  * Cada fila sincronitzable té: user_id, updated_at (hora de modificació al client, per a LWW),
--    server_updated_at (assignat pel servidor, cursor de sincronització) i deleted_at (esborrat lògic).
--  * Last-Write-Wins per fila: el servidor ignora escriptures amb updated_at més antic que l'existent.
--  * Preparat per a compartir: els esdeveniments pertanyen a un "calendar" (un per defecte per usuari).

create extension if not exists pgcrypto;

-- ───────────────────────── Funcions comunes ─────────────────────────

create or replace function public.tempo_touch_server_updated_at()
returns trigger language plpgsql as $$
begin
  new.server_updated_at := now();
  return new;
end $$;

-- Last-Write-Wins: si una actualització arriba amb un updated_at anterior, es descarta en silenci.
create or replace function public.tempo_lww_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null; -- conserva la versió més nova
  end if;
  -- user_id no es pot canviar mai
  if tg_op = 'UPDATE' and new.user_id <> old.user_id then
    raise exception 'user_id is immutable';
  end if;
  return new;
end $$;

-- ───────────────────────── Perfils ─────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  timezone text not null default 'Europe/Madrid',
  week_start smallint not null default 1 check (week_start between 0 and 6),
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  default_calendar_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now()
);

-- ───────────────────────── Calendaris (preparació multiusuari) ─────────────────────────

create table public.calendars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade, -- propietari
  name text not null default 'Personal',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index calendars_one_default on public.calendars (user_id) where is_default;

alter table public.profiles
  add constraint profiles_default_calendar_fk foreign key (default_calendar_id)
  references public.calendars (id) on delete set null;

-- Futur: calendar_members (calendar_id, user_id, role) i invitacions.
-- Les polítiques RLS actuals es basen en user_id; quan s'afegeixi la compartició
-- només caldrà ampliar-les amb un EXISTS sobre calendar_members.

-- ───────────────────────── Categories (compartides entre esdeveniments i tasques) ─────────────────────────

create table public.categories (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  color text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index categories_sync_idx on public.categories (user_id, server_updated_at);

-- ───────────────────────── Esdeveniments ─────────────────────────
-- Recurrència: regla RFC 5545 (RRULE) a la mateixa fila. És el format que fa servir
-- Google Calendar, evita una taula 1:1 i permet expandir-la al client sense duplicar files.
-- "Aquesta i les futures" divideix la sèrie: s'afegeix UNTIL a l'original i es crea una
-- nova sèrie amb series_parent_id apuntant a l'original.

create table public.events (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  calendar_id uuid references public.calendars (id) on delete set null,
  category_id uuid references public.categories (id) on delete set null,
  title text not null check (char_length(title) between 1 and 300),
  description text,
  location text,
  all_day boolean not null default false,
  -- Elements amb hora
  start_at timestamptz,
  end_at timestamptz,
  -- Elements de tot el dia (end_date inclusiu)
  start_date date,
  end_date date,
  timezone text not null default 'Europe/Madrid',
  rrule text,                       -- p. ex. 'FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20270101T000000Z'
  series_parent_id uuid references public.events (id) on delete set null,
  reminders integer[] not null default '{}', -- minuts abans de l'inici (0 = a l'hora)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint events_time_shape check (
    (all_day and start_date is not null and (end_date is null or end_date >= start_date))
    or (not all_day and start_at is not null and (end_at is null or end_at >= start_at))
  )
);
create index events_sync_idx on public.events (user_id, server_updated_at);
create index events_range_idx on public.events (user_id, start_at);
create index events_range_date_idx on public.events (user_id, start_date);

-- Excepcions d'una ocurrència concreta (modificada o cancel·lada)
create table public.event_exceptions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid not null references public.events (id) on delete cascade,
  occurrence_key text not null,     -- inici original: ISO UTC (amb hora) o YYYY-MM-DD (tot el dia)
  cancelled boolean not null default false,
  title text,
  description text,
  location text,
  category_id uuid references public.categories (id) on delete set null,
  all_day boolean,
  start_at timestamptz,
  end_at timestamptz,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (event_id, occurrence_key)
);
create index event_exceptions_sync_idx on public.event_exceptions (user_id, server_updated_at);

-- ───────────────────────── Tasques ─────────────────────────
-- Entitat independent dels esdeveniments.

create table public.tasks (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  title text not null check (char_length(title) between 1 and 300),
  description text,
  due_date date,                    -- data límit opcional
  scheduled_date date,              -- dia en què apareix al calendari
  scheduled_time time,              -- hora opcional (hora local de "timezone")
  duration_minutes integer not null default 30 check (duration_minutes between 5 and 1440),
  timezone text not null default 'Europe/Madrid',
  rrule text,                       -- requereix scheduled_date
  completed_at timestamptz,         -- per a tasques no recurrents
  reminders integer[] not null default '{}',
  sort_order double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint tasks_rrule_needs_date check (rrule is null or scheduled_date is not null),
  constraint tasks_time_needs_date check (scheduled_time is null or scheduled_date is not null)
);
create index tasks_sync_idx on public.tasks (user_id, server_updated_at);
create index tasks_scheduled_idx on public.tasks (user_id, scheduled_date);

create table public.task_subtasks (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  done boolean not null default false,
  sort_order double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index task_subtasks_sync_idx on public.task_subtasks (user_id, server_updated_at);

-- Excepcions/estat per ocurrència de tasques recurrents (compleció, moviment, cancel·lació)
create table public.task_exceptions (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  occurrence_key text not null,     -- YYYY-MM-DD original
  cancelled boolean not null default false,
  completed_at timestamptz,
  title text,
  scheduled_date date,
  scheduled_time time,
  clear_time boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  server_updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (task_id, occurrence_key)
);
create index task_exceptions_sync_idx on public.task_exceptions (user_id, server_updated_at);

-- ───────────────────────── Notificacions push ─────────────────────────
-- Els recordatoris es defineixen per element (columna reminders). Aquí es guarden
-- les subscripcions del navegador i un registre per no enviar duplicats.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create table public.notification_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  item_key text not null,           -- '<tipus>:<id>:<occurrence>:<offset>'
  sent_at timestamptz not null default now(),
  primary key (user_id, item_key)
);

-- ───────────────────────── Google Calendar (opcional) ─────────────────────────
-- Les credencials NO són accessibles des del client (cap política RLS de lectura).
-- Només les rutes del servidor amb la service role hi accedeixen.

create table public.google_integrations (
  user_id uuid primary key references auth.users (id) on delete cascade,
  google_email text,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  google_calendar_id text not null default 'primary',
  sync_token text,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Estat públic (sense secrets) per mostrar-lo a la interfície
create view public.google_integration_status
with (security_invoker = true) as
  select user_id, google_email, google_calendar_id, last_synced_at, last_error
  from public.google_integrations;

create table public.google_sync_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  event_id uuid references public.events (id) on delete cascade,
  exception_id uuid references public.event_exceptions (id) on delete cascade,
  google_calendar_id text not null,
  google_event_id text not null,
  google_etag text,
  -- Empremta del contingut local en el moment de l'última sincronització:
  -- permet detectar canvis locals reals i evitar bucles.
  local_fingerprint text,
  local_updated_at timestamptz,
  last_synced_at timestamptz not null default now(),
  unique (user_id, google_calendar_id, google_event_id)
);
create index google_sync_records_event_idx on public.google_sync_records (event_id);

-- ───────────────────────── Triggers ─────────────────────────

do $$
declare t text;
begin
  foreach t in array array['profiles','calendars','categories','events','event_exceptions','tasks','task_subtasks','task_exceptions']
  loop
    execute format('create trigger %I_touch before insert or update on public.%I for each row execute function public.tempo_touch_server_updated_at()', t, t);
  end loop;
  foreach t in array array['calendars','categories','events','event_exceptions','tasks','task_subtasks','task_exceptions']
  loop
    execute format('create trigger %I_lww before update on public.%I for each row execute function public.tempo_lww_guard()', t, t);
  end loop;
end $$;

-- Usuari nou: perfil, calendari per defecte i categories inicials (editables i esborrables)
create or replace function public.tempo_handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare cal_id uuid := gen_random_uuid();
begin
  insert into public.calendars (id, user_id, name, is_default) values (cal_id, new.id, 'Personal', true);
  insert into public.profiles (id, display_name, avatar_url, default_calendar_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url',
    cal_id
  );
  insert into public.categories (id, user_id, name, color, sort_order) values
    (gen_random_uuid(), new.id, 'Personal',    '#0A84FF', 0),
    (gen_random_uuid(), new.id, 'Universitat', '#AF52DE', 1),
    (gen_random_uuid(), new.id, 'Treball',     '#FF9F0A', 2),
    (gen_random_uuid(), new.id, 'Esport',      '#30D158', 3),
    (gen_random_uuid(), new.id, 'Altres',      '#8E8E93', 4);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.tempo_handle_new_user();

-- ───────────────────────── RLS ─────────────────────────

alter table public.profiles enable row level security;
alter table public.calendars enable row level security;
alter table public.categories enable row level security;
alter table public.events enable row level security;
alter table public.event_exceptions enable row level security;
alter table public.tasks enable row level security;
alter table public.task_subtasks enable row level security;
alter table public.task_exceptions enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_log enable row level security;
alter table public.google_integrations enable row level security;
alter table public.google_sync_records enable row level security;

create policy "profiles: own row" on public.profiles
  for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

do $$
declare t text;
begin
  foreach t in array array['calendars','categories','events','event_exceptions','tasks','task_subtasks','task_exceptions','push_subscriptions']
  loop
    execute format($f$create policy "%s: own rows" on public.%I for all to authenticated
      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))$f$, t, t);
  end loop;
end $$;

-- google_integrations: el client només pot llegir l'estat i desconnectar (esborrar).
-- No hi ha política SELECT directa: els tokens només són visibles per a la service role.
create policy "google_integrations: delete own" on public.google_integrations
  for delete to authenticated using (user_id = (select auth.uid()));
-- La vista security_invoker necessita SELECT; es concedeix només sobre columnes no secretes.
revoke all on public.google_integrations from anon, authenticated;
grant delete on public.google_integrations to authenticated;
grant select (user_id, google_email, google_calendar_id, last_synced_at, last_error)
  on public.google_integrations to authenticated;
create policy "google_integrations: read status" on public.google_integrations
  for select to authenticated using (user_id = (select auth.uid()));
grant select on public.google_integration_status to authenticated;

-- notification_log i google_sync_records: només servidor (sense polítiques per al client)
revoke all on public.notification_log from anon, authenticated;
revoke all on public.google_sync_records from anon, authenticated;

-- Integritat: les referències entre files han de ser del mateix usuari
create or replace function public.tempo_check_ownership()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.category_id is not null and not exists (select 1 from categories c where c.id = new.category_id and c.user_id = new.user_id) then
    raise exception 'category does not belong to user';
  end if;
  return new;
end $$;
create trigger events_ownership before insert or update of category_id on public.events
  for each row execute function public.tempo_check_ownership();
create trigger tasks_ownership before insert or update of category_id on public.tasks
  for each row execute function public.tempo_check_ownership();

create or replace function public.tempo_check_parent_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from events e where e.id = new.event_id and e.user_id = new.user_id) then
    raise exception 'event does not belong to user';
  end if;
  return new;
end $$;
create trigger event_exceptions_parent before insert on public.event_exceptions
  for each row execute function public.tempo_check_parent_event();

create or replace function public.tempo_check_parent_task()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from tasks t where t.id = new.task_id and t.user_id = new.user_id) then
    raise exception 'task does not belong to user';
  end if;
  return new;
end $$;
create trigger task_subtasks_parent before insert on public.task_subtasks
  for each row execute function public.tempo_check_parent_task();
create trigger task_exceptions_parent before insert on public.task_exceptions
  for each row execute function public.tempo_check_parent_task();

-- ───────────────────────── Realtime ─────────────────────────

alter publication supabase_realtime add table
  public.profiles, public.categories, public.events, public.event_exceptions,
  public.tasks, public.task_subtasks, public.task_exceptions;
