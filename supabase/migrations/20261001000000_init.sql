-- Rambo Zambo Kegelverein – Grundschema
-- Zugriff: Nur eingetragene Mitglieder (E-Mail in "members") sehen Daten.
-- Admins (Vergnügungswarte) pflegen Termine, Abstimmungen, Kasse und Mitglieder.

create extension if not exists pgcrypto;

-- ───────────────────────── Mitglieder ─────────────────────────
create table public.members (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  first_name text not null,
  last_name text,
  nickname text,
  birthday date,
  birthday_visibility text not null default 'with_age'
    check (birthday_visibility in ('with_age','no_age','hidden')),
  phone text,
  title text,                         -- z. B. "Vergnügungswart", "Kassenprüfer"
  is_admin boolean not null default false,
  color text not null default '#4F5C76',
  active boolean not null default true,
  privacy_accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index members_email_key on public.members (lower(email));

create or replace function public.current_member_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.members
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and active
  limit 1
$$;

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_member_id() is not null
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.members where id = public.current_member_id()), false)
$$;

-- Vor dem Code-Versand prüfen, ob eine Adresse eingetragen ist (auch ohne Login aufrufbar).
create or replace function public.email_is_member(p_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where lower(email) = lower(trim(p_email)) and active)
$$;

-- Nicht-Admins dürfen an sich selbst nur persönliche Felder ändern.
create or replace function public.members_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    if new.email is distinct from old.email
       or new.is_admin is distinct from old.is_admin
       or new.active is distinct from old.active
       or new.title is distinct from old.title then
      raise exception 'Nur Admins dürfen E-Mail, Rolle oder Status ändern';
    end if;
  end if;
  return new;
end $$;
create trigger members_guard before update on public.members
  for each row execute function public.members_guard();

alter table public.members enable row level security;
create policy "members: selbst oder Admin lesen" on public.members
  for select using (id = public.current_member_id() or public.is_admin());
create policy "members: selbst oder Admin ändern" on public.members
  for update using (id = public.current_member_id() or public.is_admin());
create policy "members: Admin anlegen" on public.members
  for insert with check (public.is_admin());
create policy "members: Admin löschen" on public.members
  for delete using (public.is_admin());

-- Mitgliederverzeichnis für alle Mitglieder, Geburtstag je nach Wunsch gekürzt.
create or replace view public.member_directory as
select
  m.id, m.first_name, m.last_name, m.nickname, m.title, m.is_admin, m.color, m.phone, m.email,
  case when m.birthday_visibility = 'hidden' and m.id <> public.current_member_id() then null
       else extract(month from m.birthday)::int end as birth_month,
  case when m.birthday_visibility = 'hidden' and m.id <> public.current_member_id() then null
       else extract(day from m.birthday)::int end as birth_day,
  case when m.birthday_visibility = 'with_age' or m.id = public.current_member_id()
       then extract(year from m.birthday)::int end as birth_year
from public.members m
where m.active and public.is_member();

-- ───────────────────────── Termine ─────────────────────────
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default 'event' check (kind in ('stammtisch','event','trip')),
  starts_on date not null,
  ends_on date,
  start_time text,
  location text,
  note text,
  cost text,
  program jsonb not null default '[]'::jsonb,   -- [{"day":"Fr","text":"..."}]
  packing jsonb not null default '[]'::jsonb,   -- ["Personalausweis", ...]
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create index events_starts_on on public.events (starts_on);

create table public.rsvps (
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  status text not null check (status in ('yes','maybe','no')),
  updated_at timestamptz not null default now(),
  primary key (event_id, member_id)
);

create table public.packing_checks (
  event_id uuid not null references public.events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  item int not null,
  primary key (event_id, member_id, item)
);

alter table public.events enable row level security;
create policy "events: Mitglieder lesen" on public.events for select using (public.is_member());
create policy "events: Admin anlegen" on public.events for insert with check (public.is_admin());
create policy "events: Admin ändern" on public.events for update using (public.is_admin());
create policy "events: Admin löschen" on public.events for delete using (public.is_admin());

alter table public.rsvps enable row level security;
create policy "rsvps: Mitglieder lesen" on public.rsvps for select using (public.is_member());
create policy "rsvps: eigene anlegen" on public.rsvps for insert with check (member_id = public.current_member_id());
create policy "rsvps: eigene ändern" on public.rsvps for update using (member_id = public.current_member_id());
create policy "rsvps: eigene löschen" on public.rsvps for delete using (member_id = public.current_member_id());

alter table public.packing_checks enable row level security;
create policy "packing: eigene lesen" on public.packing_checks for select using (member_id = public.current_member_id());
create policy "packing: eigene anlegen" on public.packing_checks for insert with check (member_id = public.current_member_id());
create policy "packing: eigene löschen" on public.packing_checks for delete using (member_id = public.current_member_id());

-- ───────────────────────── Abstimmungen ─────────────────────────
create table public.polls (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  kind text not null default 'single' check (kind in ('single','multi','dates')),
  options jsonb not null,                 -- ["Hamburg","Wien"] bzw. ["2027-04-16", ...]
  closes_on date,
  closed boolean not null default false,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) >= 2)
);

create table public.poll_votes (
  poll_id uuid not null references public.polls(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  answer jsonb not null,                  -- single/multi: [0,2]; dates: ["y","m","n"]
  updated_at timestamptz not null default now(),
  primary key (poll_id, member_id)
);

create or replace function public.poll_is_open(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.polls
    where id = p and not closed and (closes_on is null or closes_on >= current_date))
$$;

alter table public.polls enable row level security;
create policy "polls: Mitglieder lesen" on public.polls for select using (public.is_member());
create policy "polls: Admin anlegen" on public.polls for insert with check (public.is_admin());
create policy "polls: Admin ändern" on public.polls for update using (public.is_admin());
create policy "polls: Admin löschen" on public.polls for delete using (public.is_admin());

alter table public.poll_votes enable row level security;
create policy "votes: Mitglieder lesen" on public.poll_votes for select using (public.is_member());
create policy "votes: eigene abgeben" on public.poll_votes for insert
  with check (member_id = public.current_member_id() and public.poll_is_open(poll_id));
create policy "votes: eigene ändern" on public.poll_votes for update
  using (member_id = public.current_member_id() and public.poll_is_open(poll_id));
create policy "votes: eigene zurückziehen" on public.poll_votes for delete
  using (member_id = public.current_member_id() and public.poll_is_open(poll_id));

-- ───────────────────────── Kasse ─────────────────────────
create table public.ledger (
  id uuid primary key default gen_random_uuid(),
  booked_on date not null default current_date,
  description text not null,
  amount numeric(10,2) not null check (amount <> 0),   -- Einnahmen positiv, Ausgaben negativ
  category text not null check (category in ('start','dues','income','expense')),
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.ledger enable row level security;
create policy "ledger: Mitglieder lesen" on public.ledger for select using (public.is_member());
create policy "ledger: Admin anlegen" on public.ledger for insert with check (public.is_admin());
create policy "ledger: Admin ändern" on public.ledger for update using (public.is_admin());
create policy "ledger: Admin löschen" on public.ledger for delete using (public.is_admin());

-- ───────────────────────── Chat ─────────────────────────
create table public.messages (
  id bigint generated always as identity primary key,
  member_id uuid references public.members(id) on delete set null,
  kind text not null default 'text' check (kind in ('text','system')),
  body text,
  image_path text,
  link text,                                -- z. B. "event:<uuid>" oder "poll:<uuid>"
  created_at timestamptz not null default now(),
  check (body is not null or image_path is not null)
);
create index messages_created_at on public.messages (created_at desc);

create table public.message_reactions (
  message_id bigint not null references public.messages(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  emoji text not null check (char_length(emoji) <= 16),
  primary key (message_id, member_id, emoji)
);

alter table public.messages enable row level security;
create policy "messages: Mitglieder lesen" on public.messages for select using (public.is_member());
create policy "messages: eigene schreiben" on public.messages for insert
  with check (member_id = public.current_member_id() and kind = 'text');
create policy "messages: eigene oder Admin löschen" on public.messages for delete
  using (member_id = public.current_member_id() or public.is_admin());

alter table public.message_reactions enable row level security;
create policy "reactions: Mitglieder lesen" on public.message_reactions for select using (public.is_member());
create policy "reactions: eigene setzen" on public.message_reactions for insert with check (member_id = public.current_member_id());
create policy "reactions: eigene entfernen" on public.message_reactions for delete using (member_id = public.current_member_id());

-- Hinweise im Chat, wenn Termine oder Abstimmungen angelegt werden
create or replace function public.post_system_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'events' then
    insert into public.messages (member_id, kind, body, link)
    values (new.created_by, 'system', 'hat einen neuen Termin angelegt: ' || new.title, 'event:' || new.id);
  elsif tg_table_name = 'polls' then
    insert into public.messages (member_id, kind, body, link)
    values (new.created_by, 'system', 'hat eine Abstimmung gestartet: ' || new.question, 'poll:' || new.id);
  end if;
  return new;
end $$;
create trigger events_system_message after insert on public.events
  for each row execute function public.post_system_message();
create trigger polls_system_message after insert on public.polls
  for each row execute function public.post_system_message();

-- ───────────────────────── Fotos ─────────────────────────
create table public.albums (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  event_id uuid references public.events(id) on delete set null,
  created_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references public.albums(id) on delete cascade,
  path text not null,
  width int,
  height int,
  uploaded_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);
create index photos_album on public.photos (album_id, created_at desc);

alter table public.albums enable row level security;
create policy "albums: Mitglieder lesen" on public.albums for select using (public.is_member());
create policy "albums: Mitglieder anlegen" on public.albums for insert
  with check (public.is_member() and created_by = public.current_member_id());
create policy "albums: Ersteller oder Admin ändern" on public.albums for update
  using (created_by = public.current_member_id() or public.is_admin());
create policy "albums: Ersteller oder Admin löschen" on public.albums for delete
  using (created_by = public.current_member_id() or public.is_admin());

alter table public.photos enable row level security;
create policy "photos: Mitglieder lesen" on public.photos for select using (public.is_member());
create policy "photos: eigene hochladen" on public.photos for insert
  with check (uploaded_by = public.current_member_id());
create policy "photos: eigene oder Admin löschen" on public.photos for delete
  using (uploaded_by = public.current_member_id() or public.is_admin());

-- ───────────────────────── Push ─────────────────────────
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create table public.notification_prefs (
  member_id uuid primary key references public.members(id) on delete cascade,
  chat boolean not null default true,
  chat_mentions_only boolean not null default false,
  events boolean not null default true,
  reminders boolean not null default true,
  polls boolean not null default true,
  poll_closing boolean not null default true,
  birthdays boolean not null default true,
  photos boolean not null default false,
  ledger boolean not null default false
);

alter table public.push_subscriptions enable row level security;
create policy "push: eigene lesen" on public.push_subscriptions for select using (member_id = public.current_member_id());
create policy "push: eigene anlegen" on public.push_subscriptions for insert with check (member_id = public.current_member_id());
create policy "push: eigene ändern" on public.push_subscriptions for update using (member_id = public.current_member_id());
create policy "push: eigene löschen" on public.push_subscriptions for delete using (member_id = public.current_member_id());

alter table public.notification_prefs enable row level security;
create policy "prefs: eigene lesen" on public.notification_prefs for select using (member_id = public.current_member_id());
create policy "prefs: eigene anlegen" on public.notification_prefs for insert with check (member_id = public.current_member_id());
create policy "prefs: eigene ändern" on public.notification_prefs for update using (member_id = public.current_member_id());

-- ───────────────────────── Rechte & Realtime ─────────────────────────
revoke all on public.member_directory from anon;
grant select on public.member_directory to authenticated;
revoke execute on function public.email_is_member(text) from public;
grant execute on function public.email_is_member(text) to anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.messages, public.message_reactions, public.rsvps, public.poll_votes,
      public.events, public.polls, public.ledger, public.photos;
  end if;
end $$;

-- ───────────────────────── Speicher für Fotos ─────────────────────────
-- Bucket "media": fotos/<album-id>/<datei> und chat/<datei>; nur für Mitglieder.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public) values ('media', 'media', false)
      on conflict (id) do nothing;

    execute $p$create policy "media: Mitglieder lesen" on storage.objects
      for select to authenticated using (bucket_id = 'media' and public.is_member())$p$;
    execute $p$create policy "media: Mitglieder hochladen" on storage.objects
      for insert to authenticated with check (bucket_id = 'media' and public.is_member())$p$;
    execute $p$create policy "media: eigene oder Admin löschen" on storage.objects
      for delete to authenticated using (bucket_id = 'media' and (owner = auth.uid() or public.is_admin()))$p$;
  end if;
end $$;
