-- Kostenblick – Sync-Schema (Phase 13C)
--
-- Einmalig im Supabase-Dashboard unter "SQL Editor" ausführen.
--
-- Modell: Ein Haushalt (households) hat 1..n Mitglieder (household_members,
-- z. B. zwei gleichberechtigte Personen). Alle Fachdaten eines Haushalts
-- liegen generisch in sync_records (eine Zeile pro Entität, Inhalt als
-- JSON). Jede Änderung bekommt eine vom Server vergebene Revision (rev);
-- Geräte holen alles mit rev > ihrem Cursor.
--
-- Konflikte: ein echter Konflikt (Server-Revision != baseRev) wird per
-- Feld-Diff gegen die in sync_records_history aufbewahrte Baseline gelöst -
-- disjunkte Feldänderungen werden automatisch gemerged, ein Überlapp auf
-- einem geschützten Feld (protected_fields: Geldbeträge, Kündigungsfrist-
-- Felder) wird nie allein per Uhrzeit entschieden, sondern abgelehnt. Siehe
-- sync_push weiter unten.
--
-- Sicherheit: Row Level Security auf allen Tabellen. Clients dürfen nur
-- LESEN, und nur Daten ihrer eigenen Haushalte. Jedes Schreiben läuft über
-- die Funktionen unten (security definer), die Mitgliedschaft prüfen und
-- Revisionen vergeben – ein Client kann so weder fremde Haushalte
-- erreichen noch Revisionen fälschen.

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index household_members_user_idx on public.household_members (user_id);

create table public.household_invites (
  code text primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz
);

create table public.sync_records (
  household_id uuid not null references public.households (id) on delete cascade,
  entity_type text not null check (
    entity_type in ('properties', 'bills', 'billItems', 'costEntries', 'wasteCosts', 'contracts', 'reminders', 'documents')
  ),
  id text not null check (char_length(id) between 1 and 200),
  data jsonb not null check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 1000000),
  updated_at timestamptz not null,
  rev bigint not null,
  modified_by uuid references auth.users (id) on delete set null,
  primary key (household_id, entity_type, id)
);

create index sync_records_household_rev_idx on public.sync_records (household_id, rev);

-- Jede Revision, die eine Zeile je hatte - Grundlage für die Konflikt-
-- erkennung in sync_push (Baseline-Rekonstruktion: was sah das Gerät zuletzt,
-- bevor es seine eigene Änderung machte?). Nie direkt vom Client gelesen.
create table public.sync_records_history (
  household_id uuid not null,
  entity_type text not null,
  id text not null,
  rev bigint not null,
  data jsonb not null,
  updated_at timestamptz not null,
  primary key (household_id, entity_type, id, rev)
);

alter table public.sync_records_history enable row level security;
-- Absichtlich keine Policy -> kein direkter Zugriff, nicht einmal lesend.
revoke all on public.sync_records_history from anon, authenticated;

-- Globale Sequenz; Lücken sind unproblematisch. Innerhalb eines Haushalts
-- werden Schreibvorgänge per Advisory Lock serialisiert (sync_push), damit
-- Revisionen in Commit-Reihenfolge steigen und kein Gerät eine später
-- sichtbar werdende kleinere Revision überspringt.
create sequence public.sync_rev_seq;

-- ---------------------------------------------------------------------------
-- Felder, die bei einem echten Konflikt (siehe sync_push) nie allein per
-- "neuere Uhrzeit gewinnt" entschieden werden - Geldbeträge und die Felder,
-- die die Kündigungsfrist-Berechnung füttern (Kategorie C aus den
-- Architektur-Notizen, Phase 13B.1/13C). Ein Überlapp auf einem dieser
-- Felder wird abgelehnt statt stillschweigend überschrieben; disjunkte
-- Änderungen (verschiedene Felder) werden weiterhin automatisch gemerged.
-- ---------------------------------------------------------------------------

create function public.protected_fields(p_entity_type text)
returns text[]
language sql
immutable
as $$
  select case p_entity_type
    when 'bills' then array['totalAmount', 'advancePayments', 'balance']
    when 'billItems' then array['amount']
    when 'costEntries' then array['amount']
    when 'wasteCosts' then array['amount']
    when 'contracts' then array[
      'monthlyCost', 'yearlyCost', 'startDate', 'endDate',
      'cancellationPeriodValue', 'cancellationPeriodUnit'
    ]
    else array[]::text[]
  end;
$$;

-- Oberste JSON-Schlüssel, deren Wert sich zwischen a und b unterscheidet.
-- updatedAt/createdAt/syncVersion zählen nie als inhaltliche Änderung -
-- sonst würde die bei jeder lokalen Bearbeitung ohnehin neue updatedAt
-- jeden echten Konflikt fälschlich wie einen Feld-Überlapp aussehen lassen.
create function public.jsonb_changed_keys(a jsonb, b jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(key), array[]::text[])
  from (
    select key from jsonb_object_keys(a) as key
    union
    select key from jsonb_object_keys(b) as key
  ) keys
  where key not in ('updatedAt', 'createdAt', 'syncVersion')
    and a -> key is distinct from b -> key;
$$;

-- ---------------------------------------------------------------------------
-- Hilfsfunktion: ist der angemeldete Nutzer Mitglied des Haushalts?
-- ---------------------------------------------------------------------------

create function public.is_household_member(p_household uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = p_household and m.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security: nur lesen, nur eigene Haushalte
-- ---------------------------------------------------------------------------

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.sync_records enable row level security;

create policy households_select on public.households
  for select to authenticated using (public.is_household_member(id));

create policy household_members_select on public.household_members
  for select to authenticated using (public.is_household_member(household_id));

create policy sync_records_select on public.sync_records
  for select to authenticated using (public.is_household_member(household_id));

-- household_invites: absichtlich keine Policy -> kein direkter Zugriff.

revoke all on public.households, public.household_members, public.household_invites, public.sync_records from anon, authenticated;
grant select on public.households, public.household_members, public.sync_records to authenticated;
revoke all on sequence public.sync_rev_seq from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Haushalt anlegen
-- ---------------------------------------------------------------------------

create function public.create_household(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_household uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  insert into public.households (name, created_by)
  values (coalesce(nullif(btrim(p_name), ''), 'Mein Haushalt'), v_user)
  returning id into v_household;
  insert into public.household_members (household_id, user_id) values (v_household, v_user);
  return v_household;
end;
$$;

-- ---------------------------------------------------------------------------
-- Einladungscode erzeugen (7 Tage gültig, einmal verwendbar)
-- ---------------------------------------------------------------------------

create function public.create_household_invite(p_household uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_raw text;
  v_code text;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not public.is_household_member(p_household) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
  v_raw := upper(replace(gen_random_uuid()::text, '-', ''));
  v_code := substr(v_raw, 1, 4) || '-' || substr(v_raw, 5, 4);
  insert into public.household_invites (code, household_id, created_by, expires_at)
  values (v_code, p_household, v_user, now() + interval '7 days');
  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Haushalt per Einladungscode beitreten
-- ---------------------------------------------------------------------------

create function public.join_household(p_code text)
returns table (household_id uuid, household_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_invite public.household_invites%rowtype;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_invite
  from public.household_invites i
  where i.code = upper(btrim(p_code))
  for update;

  if not found or v_invite.expires_at < now() or (v_invite.used_at is not null and v_invite.used_by is distinct from v_user) then
    raise exception 'invalid_invite' using errcode = '22023';
  end if;

  insert into public.household_members (household_id, user_id)
  values (v_invite.household_id, v_user)
  on conflict do nothing;

  update public.household_invites
  set used_by = v_user, used_at = coalesce(used_at, now())
  where code = v_invite.code;

  return query
  select h.id, h.name from public.households h where h.id = v_invite.household_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Änderungen hochladen (Push) mit Konflikterkennung
--
-- p_changes: [{ "entityType", "id", "data", "updatedAt", "baseRev" }, ...]
--
-- Pro Änderung:
--   * neu, oder Server-Revision = baseRev     -> übernehmen, neue Revision
--   * Server-Revision weicht ab (echter Konflikt): Baseline bei rev=baseRev
--     aus sync_records_history laden und gegen beide Seiten diffen:
--       - Baseline fehlt (altes/unbekanntes baseRev)      -> ablehnen
--       - Tombstone auf dem Server, Änderung löscht deletedAt -> ablehnen
--         (keine stille Wiederbelebung gelöschter Datensätze)
--       - geänderte Felder beider Seiten disjunkt          -> mergen, kein
--         Konfliktflag (nichts geht verloren)
--       - Überlapp, aber nur auf nicht-geschützten Feldern -> neuere
--         updatedAt gewinnt ("conflict": true, "previous" = überschriebene
--         Version)
--       - Überlapp auf einem geschützten Feld (siehe protected_fields)
--         -> ablehnen, Serverversion bleibt unverändert; nie ein Geldbetrag
--         oder Kündigungsfrist-Feld allein per Uhrzeit entschieden
-- Gleiche Semantik wie InMemorySyncServer im Client (Tests).
-- ---------------------------------------------------------------------------

create function public.sync_push(p_household uuid, p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_change jsonb;
  v_type text;
  v_id text;
  v_data jsonb;
  v_updated timestamptz;
  v_base bigint;
  v_cur public.sync_records%rowtype;
  v_baseline public.sync_records_history%rowtype;
  v_client_changed text[];
  v_server_changed text[];
  v_overlap text[];
  v_protected text[];
  v_merged jsonb;
  v_merged_updated timestamptz;
  v_field text;
  v_rev bigint;
  v_results jsonb := '[]'::jsonb;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not public.is_household_member(p_household) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
  if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) > 500 then
    raise exception 'invalid_batch' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_household::text, 0));

  for v_change in select value from jsonb_array_elements(p_changes)
  loop
    v_type := v_change ->> 'entityType';
    v_id := v_change ->> 'id';
    v_data := v_change -> 'data';
    v_updated := (v_change ->> 'updatedAt')::timestamptz;
    v_base := nullif(v_change ->> 'baseRev', '')::bigint;

    if v_id is null or v_data is null or jsonb_typeof(v_data) <> 'object' or v_data ->> 'id' is distinct from v_id then
      raise exception 'invalid_change' using errcode = '22023';
    end if;

    select * into v_cur
    from public.sync_records r
    where r.household_id = p_household and r.entity_type = v_type and r.id = v_id
    for update;

    if not found then
      v_rev := nextval('public.sync_rev_seq');
      insert into public.sync_records (household_id, entity_type, id, data, updated_at, rev, modified_by)
      values (p_household, v_type, v_id, v_data, v_updated, v_rev, v_user);
      insert into public.sync_records_history (household_id, entity_type, id, rev, data, updated_at)
      values (p_household, v_type, v_id, v_rev, v_data, v_updated);
      v_results := v_results || jsonb_build_object(
        'entityType', v_type, 'id', v_id, 'status', 'applied', 'rev', v_rev, 'conflict', false);
      continue;
    end if;

    if v_cur.rev = v_base then
      v_rev := nextval('public.sync_rev_seq');
      update public.sync_records
      set data = v_data, updated_at = v_updated, rev = v_rev, modified_by = v_user
      where household_id = p_household and entity_type = v_type and id = v_id;
      insert into public.sync_records_history (household_id, entity_type, id, rev, data, updated_at)
      values (p_household, v_type, v_id, v_rev, v_data, v_updated);
      v_results := v_results || jsonb_build_object(
        'entityType', v_type, 'id', v_id, 'status', 'applied', 'rev', v_rev, 'conflict', false);
      continue;
    end if;

    -- Echter Konflikt: v_cur.rev != v_base. Zuerst Anti-Resurrection, dann
    -- Baseline laden und Feld-Diff versuchen.
    if v_cur.data ->> 'deletedAt' is not null and v_data ->> 'deletedAt' is null then
      v_results := v_results || jsonb_build_object(
        'entityType', v_type, 'id', v_id, 'status', 'rejected',
        'server', jsonb_build_object(
          'entityType', v_cur.entity_type, 'id', v_cur.id, 'data', v_cur.data,
          'updatedAt', v_cur.data ->> 'updatedAt', 'rev', v_cur.rev));
      continue;
    end if;

    select * into v_baseline
    from public.sync_records_history h
    where h.household_id = p_household and h.entity_type = v_type and h.id = v_id and h.rev = v_base;

    if not found then
      -- Baseline nicht (mehr) rekonstruierbar - niemals raten, lieber
      -- ablehnen (Kategorie-C-Fallback, siehe Architektur-Notizen 13C.2).
      v_results := v_results || jsonb_build_object(
        'entityType', v_type, 'id', v_id, 'status', 'rejected',
        'server', jsonb_build_object(
          'entityType', v_cur.entity_type, 'id', v_cur.id, 'data', v_cur.data,
          'updatedAt', v_cur.data ->> 'updatedAt', 'rev', v_cur.rev));
      continue;
    end if;

    v_client_changed := public.jsonb_changed_keys(v_baseline.data, v_data);
    v_server_changed := public.jsonb_changed_keys(v_baseline.data, v_cur.data);
    select coalesce(array_agg(x), array[]::text[]) into v_overlap
    from unnest(v_client_changed) x where x = any(v_server_changed);
    v_protected := public.protected_fields(v_type);

    if array_length(v_overlap, 1) is null then
      -- Disjunkte Änderungen: beide Seiten bleiben erhalten.
      v_merged := v_cur.data;
      foreach v_field in array v_client_changed loop
        v_merged := jsonb_set(v_merged, array[v_field], v_data -> v_field);
      end loop;
      v_merged_updated := greatest(v_updated, v_cur.updated_at);
      v_merged := jsonb_set(v_merged, array['updatedAt'], to_jsonb(v_merged_updated));
      v_rev := nextval('public.sync_rev_seq');
      update public.sync_records
      set data = v_merged, updated_at = v_merged_updated, rev = v_rev, modified_by = v_user
      where household_id = p_household and entity_type = v_type and id = v_id;
      insert into public.sync_records_history (household_id, entity_type, id, rev, data, updated_at)
      values (p_household, v_type, v_id, v_rev, v_merged, v_merged_updated);
      v_results := v_results || jsonb_build_object(
        'entityType', v_type, 'id', v_id, 'status', 'applied', 'rev', v_rev, 'conflict', false);
      continue;
    end if;

    if exists (select 1 from unnest(v_overlap) f where f = any(v_protected)) then
      -- Überlapp auf einem geschützten Feld: nie per Uhrzeit entscheiden.
      v_results := v_results || jsonb_build_object(
        'entityType', v_type, 'id', v_id, 'status', 'rejected',
        'server', jsonb_build_object(
          'entityType', v_cur.entity_type, 'id', v_cur.id, 'data', v_cur.data,
          'updatedAt', v_cur.data ->> 'updatedAt', 'rev', v_cur.rev));
      continue;
    end if;

    -- Überlapp, aber nur auf unkritischen Feldern: wie bisher nach Uhrzeit.
    if v_updated > v_cur.updated_at then
      v_rev := nextval('public.sync_rev_seq');
      update public.sync_records
      set data = v_data, updated_at = v_updated, rev = v_rev, modified_by = v_user
      where household_id = p_household and entity_type = v_type and id = v_id;
      insert into public.sync_records_history (household_id, entity_type, id, rev, data, updated_at)
      values (p_household, v_type, v_id, v_rev, v_data, v_updated);
      v_results := v_results || jsonb_build_object(
        'entityType', v_type, 'id', v_id, 'status', 'applied', 'rev', v_rev, 'conflict', true,
        'previous', jsonb_build_object(
          'entityType', v_cur.entity_type, 'id', v_cur.id, 'data', v_cur.data,
          'updatedAt', v_cur.data ->> 'updatedAt', 'rev', v_cur.rev));
      continue;
    end if;

    v_results := v_results || jsonb_build_object(
      'entityType', v_type, 'id', v_id, 'status', 'rejected',
      'server', jsonb_build_object(
        'entityType', v_cur.entity_type, 'id', v_cur.id, 'data', v_cur.data,
        'updatedAt', v_cur.data ->> 'updatedAt', 'rev', v_cur.rev));
  end loop;

  return v_results;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ausführungsrechte: nur angemeldete Nutzer
-- ---------------------------------------------------------------------------

revoke all on function public.is_household_member(uuid) from public, anon;
revoke all on function public.create_household(text) from public, anon;
revoke all on function public.create_household_invite(uuid) from public, anon;
revoke all on function public.join_household(text) from public, anon;
revoke all on function public.sync_push(uuid, jsonb) from public, anon;
revoke all on function public.protected_fields(text) from public, anon;
revoke all on function public.jsonb_changed_keys(jsonb, jsonb) from public, anon;

grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.create_household_invite(uuid) to authenticated;
grant execute on function public.join_household(text) to authenticated;
grant execute on function public.sync_push(uuid, jsonb) to authenticated;
grant execute on function public.protected_fields(text) to authenticated;
grant execute on function public.jsonb_changed_keys(jsonb, jsonb) to authenticated;
