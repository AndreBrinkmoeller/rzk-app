-- Regelmäßige Termine (Terminreihen)
alter table public.events add column if not exists series_id uuid;
alter table public.events add column if not exists series_rule text;   -- z. B. "alle 4 Wochen"
create index if not exists events_series on public.events (series_id, starts_on);

-- Chat-Hinweis bei einer Terminreihe nur einmal (für den ersten Termin der Reihe)
create or replace function public.post_system_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'events' then
    if new.series_id is not null and exists (
      select 1 from public.events where series_id = new.series_id and id <> new.id
    ) then
      return new;
    end if;
    insert into public.messages (member_id, kind, body, link)
    values (new.created_by, 'system',
      case when new.series_id is not null
        then 'hat eine Terminreihe angelegt: ' || new.title || coalesce(' (' || new.series_rule || ')', '')
        else 'hat einen neuen Termin angelegt: ' || new.title end,
      'event:' || new.id);
  elsif tg_table_name = 'polls' then
    insert into public.messages (member_id, kind, body, link)
    values (new.created_by, 'system', 'hat eine Abstimmung gestartet: ' || new.question, 'poll:' || new.id);
  end if;
  return new;
end $$;
