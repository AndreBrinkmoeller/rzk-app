-- Änderungen direkt im Supabase-Dashboard (SQL Editor, ohne App-Login) nicht mehr blockieren.
create or replace function public.members_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Kein App-Login (z. B. SQL Editor im Dashboard): immer erlaubt
  if coalesce(auth.jwt() ->> 'email', '') = '' then
    return new;
  end if;
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
