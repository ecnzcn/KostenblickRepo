-- Behaviour tests for the sync schema. Run against a scratch database:
--   psql -v ON_ERROR_STOP=1 -f supabase_stubs.sql -f ../migrations/*.sql -f sync_schema.test.sql
\set ON_ERROR_STOP 1
insert into auth.users values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222'),
  ('33333333-3333-3333-3333-333333333333');

create function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, false);
$$;
create function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', msg; end if;
  raise notice 'ok - %', msg;
end $$;
grant execute on all functions in schema pg_temp to authenticated;

set role authenticated;

-- Person A legt Haushalt an
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
create temp table t (k text primary key, v text);
insert into t select 'hh', public.create_household('Familie Z')::text;
select pg_temp.check((select count(*) from public.households) = 1, 'A sieht eigenen Haushalt');

-- Push: neu
select pg_temp.check(
  (public.sync_push((select v::uuid from t where k='hh'),
    '[{"entityType":"contracts","id":"c1","data":{"id":"c1","provider":"Telekom","updatedAt":"2026-10-01T10:00:00.000Z"},"updatedAt":"2026-10-01T10:00:00.000Z","baseRev":null}]')
   -> 0 ->> 'status') = 'applied', 'neuer Datensatz wird übernommen');

-- Einladung + Beitritt Person B
insert into t select 'code', public.create_household_invite((select v::uuid from t where k='hh'));
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
select pg_temp.check((select count(*) from public.sync_records) = 0, 'B sieht vor Beitritt nichts');
select pg_temp.check((select household_name from public.join_household(lower((select v from t where k='code'))))= 'Familie Z', 'B tritt per Code bei (Groß/Klein egal)');
select pg_temp.check((select count(*) from public.sync_records) = 1, 'B sieht nach Beitritt die Daten');
select pg_temp.check((select count(*) from public.household_members) = 2, 'zwei Mitglieder');

-- Person C: Code bereits verbraucht
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
do $$ begin
  perform public.join_household((select v from t where k='code'));
  raise exception 'FAILED: verbrauchter Code wurde akzeptiert';
exception when sqlstate '22023' then raise notice 'ok - verbrauchter Code wird abgelehnt';
end $$;
do $$ begin
  perform public.sync_push((select v::uuid from t where k='hh'), '[]');
  raise exception 'FAILED: Nicht-Mitglied darf pushen';
exception when sqlstate '42501' then raise notice 'ok - Nicht-Mitglied darf nicht pushen';
end $$;
select pg_temp.check((select count(*) from public.sync_records) = 0, 'C sieht keine fremden Daten');

-- Direktes Schreiben ist verboten
do $$ begin
  insert into public.sync_records values ((select v::uuid from t where k='hh'), 'contracts', 'x', '{"id":"x"}', now(), 999, null);
  raise exception 'FAILED: direktes Insert möglich';
exception when insufficient_privilege then raise notice 'ok - direktes Insert verboten';
end $$;

-- Konflikt: B ändert auf rev 1, A ändert offline älter -> A abgelehnt
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
insert into t select 'rev1', (select rev::text from public.sync_records where id='c1');
select pg_temp.check(
  (public.sync_push((select v::uuid from t where k='hh'),
    jsonb_build_array(jsonb_build_object('entityType','contracts','id','c1',
      'data', '{"id":"c1","provider":"B","updatedAt":"2026-10-01T13:00:00.000Z"}'::jsonb,
      'updatedAt','2026-10-01T13:00:00.000Z','baseRev',(select v::bigint from t where k='rev1'))))
   -> 0 ->> 'conflict') = 'false', 'B ändert ohne Konflikt');
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
insert into t select 'res', public.sync_push((select v::uuid from t where k='hh'),
    jsonb_build_array(jsonb_build_object('entityType','contracts','id','c1',
      'data', '{"id":"c1","provider":"A","updatedAt":"2026-10-01T12:00:00.000Z"}'::jsonb,
      'updatedAt','2026-10-01T12:00:00.000Z','baseRev',(select v::bigint from t where k='rev1'))))::text;
select pg_temp.check(((select v::jsonb from t where k='res') -> 0 ->> 'status') = 'rejected', 'ältere konkurrierende Änderung wird abgelehnt');
select pg_temp.check(((select v::jsonb from t where k='res') -> 0 -> 'server' -> 'data' ->> 'provider') = 'B', 'Ablehnung liefert Serverversion');

-- Neuere konkurrierende Änderung gewinnt, alte Version wird zurückgegeben
select pg_temp.check(
  (public.sync_push((select v::uuid from t where k='hh'),
    jsonb_build_array(jsonb_build_object('entityType','contracts','id','c1',
      'data', '{"id":"c1","provider":"A2","updatedAt":"2026-10-01T14:00:00.000Z"}'::jsonb,
      'updatedAt','2026-10-01T14:00:00.000Z','baseRev',(select v::bigint from t where k='rev1'))))
   -> 0 -> 'previous' -> 'data' ->> 'provider') = 'B', 'neuere Änderung gewinnt, überschriebene Version zurück');

-- Revisionen steigen, Pull per rev
select pg_temp.check((select max(rev) from public.sync_records) >= 3, 'Revisionen steigen');
select pg_temp.check((select count(*) from public.sync_records where rev > (select v::bigint from t where k='rev1')) = 1, 'Pull nach Cursor liefert nur Neueres');

-- Ungültige Eingaben
do $$ begin
  perform public.sync_push((select v::uuid from t where k='hh'),
    '[{"entityType":"contracts","id":"c2","data":{"id":"anders"},"updatedAt":"2026-10-01T10:00:00Z","baseRev":null}]');
  raise exception 'FAILED: id-Mismatch akzeptiert';
exception when sqlstate '22023' then raise notice 'ok - id-Mismatch abgelehnt';
end $$;
do $$ begin
  perform public.sync_push((select v::uuid from t where k='hh'),
    '[{"entityType":"categories","id":"x","data":{"id":"x"},"updatedAt":"2026-10-01T10:00:00Z","baseRev":null}]');
  raise exception 'FAILED: unbekannter Typ akzeptiert';
exception when check_violation then raise notice 'ok - unbekannter Entitätstyp abgelehnt';
end $$;

-- Storage-Policies
insert into storage.objects (bucket_id, name) values ('documents', (select v from t where k='hh') || '/datei.pdf');
select pg_temp.check((select count(*) from storage.objects) = 1, 'A darf in Haushaltsordner hochladen');
do $$ begin
  insert into storage.objects (bucket_id, name) values ('documents', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/x.pdf');
  raise exception 'FAILED: fremder Ordner beschreibbar';
exception when insufficient_privilege then raise notice 'ok - fremder Ordner verboten';
end $$;
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select pg_temp.check((select count(*) from storage.objects) = 0, 'C sieht keine fremden Dateien');

-- Anonym: gar nichts
reset role;
set role anon;
do $$ begin
  perform 1 from public.sync_records;
  raise exception 'FAILED: anon darf lesen';
exception when insufficient_privilege then raise notice 'ok - anon hat keinen Zugriff';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Feld-Level-Konfliktauflösung (disjunkte Änderungen mergen, geschützte
-- Felder nie per Uhrzeit, keine stille Wiederbelebung) - eigener Haushalt
-- mit frischem Vertrag, damit die Baseline-Historie eindeutig ist.
-- ---------------------------------------------------------------------------

set role authenticated;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
insert into t select 'hh2', public.create_household('Merge-Test')::text;
insert into t select 'm0', (public.sync_push((select v::uuid from t where k='hh2'),
    '[{"entityType":"contracts","id":"m1","data":{"id":"m1","provider":"E.ON","monthlyCost":50,"updatedAt":"2026-10-01T09:00:00.000Z"},"updatedAt":"2026-10-01T09:00:00.000Z","baseRev":null}]')
   -> 0 ->> 'rev');

-- Disjunkte Änderungen (monthlyCost vs. provider) werden gemerged, kein Konflikt.
select pg_temp.check(
  (public.sync_push((select v::uuid from t where k='hh2'),
    jsonb_build_array(jsonb_build_object('entityType','contracts','id','m1',
      'data', jsonb_build_object('id','m1','provider','E.ON','monthlyCost',60,'updatedAt','2026-10-01T10:00:00.000Z'),
      'updatedAt','2026-10-01T10:00:00.000Z','baseRev',(select v::bigint from t where k='m0'))))
   -> 0 ->> 'status') = 'applied', 'disjunkte Änderung 1 (monthlyCost) wird übernommen');
select pg_temp.check(
  (public.sync_push((select v::uuid from t where k='hh2'),
    jsonb_build_array(jsonb_build_object('entityType','contracts','id','m1',
      'data', jsonb_build_object('id','m1','provider','Vattenfall','monthlyCost',50,'updatedAt','2026-10-01T10:05:00.000Z'),
      'updatedAt','2026-10-01T10:05:00.000Z','baseRev',(select v::bigint from t where k='m0'))))
   -> 0 ->> 'conflict') = 'false', 'disjunkte Änderung 2 (provider) wird ohne Konfliktflag gemerged');
select pg_temp.check((select data ->> 'monthlyCost' from public.sync_records where id='m1') = '60', 'monthlyCost aus Änderung 1 blieb erhalten');
select pg_temp.check((select data ->> 'provider' from public.sync_records where id='m1') = 'Vattenfall', 'provider aus Änderung 2 wurde übernommen');

-- Überlapp auf einem geschützten Feld (monthlyCost): nie per Uhrzeit, auch
-- wenn die zweite Änderung "neuer" ist.
select pg_temp.check((select rev from public.sync_records where id='m1') is not null, 'Vorbereitung: aktuelle Revision bekannt');
insert into t select 'm_protrev', (select rev::text from public.sync_records where id='m1');
select pg_temp.check(
  (public.sync_push((select v::uuid from t where k='hh2'),
    jsonb_build_array(jsonb_build_object('entityType','contracts','id','m1',
      'data', jsonb_build_object('id','m1','provider','Vattenfall','monthlyCost',70,'updatedAt','2026-10-01T10:10:00.000Z'),
      'updatedAt','2026-10-01T10:10:00.000Z','baseRev',(select v::bigint from t where k='m_protrev'))))
   -> 0 ->> 'status') = 'applied', 'Änderung A (monthlyCost 70) wird übernommen');
select pg_temp.check(
  (public.sync_push((select v::uuid from t where k='hh2'),
    jsonb_build_array(jsonb_build_object('entityType','contracts','id','m1',
      'data', jsonb_build_object('id','m1','provider','Vattenfall','monthlyCost',80,'updatedAt','2026-10-01T10:20:00.000Z'),
      'updatedAt','2026-10-01T10:20:00.000Z','baseRev',(select v::bigint from t where k='m_protrev'))))
   -> 0 ->> 'status') = 'rejected', 'Änderung B (monthlyCost 80, selbe Baseline, neuer) wird trotzdem abgelehnt - geschütztes Feld');
select pg_temp.check((select data ->> 'monthlyCost' from public.sync_records where id='m1') = '70', 'Server behält Änderung A, überschreibt nicht stillschweigend mit B');

-- Baseline nicht rekonstruierbar (erfundenes baseRev) -> ablehnen, nie raten.
select pg_temp.check(
  (public.sync_push((select v::uuid from t where k='hh2'),
    jsonb_build_array(jsonb_build_object('entityType','contracts','id','m1',
      'data', jsonb_build_object('id','m1','provider','Vattenfall','monthlyCost',999,'updatedAt','2026-10-01T10:30:00.000Z'),
      'updatedAt','2026-10-01T10:30:00.000Z','baseRev', 999999)))
   -> 0 ->> 'status') = 'rejected', 'nicht rekonstruierbare Baseline wird abgelehnt statt geraten');

-- Anti-Resurrection: ein gelöschter Datensatz wird durch eine veraltete,
-- konkurrierende Änderung nie wiederbelebt.
select pg_temp.check(
  (public.sync_push((select v::uuid from t where k='hh2'),
    jsonb_build_array(jsonb_build_object('entityType','contracts','id','m1',
      'data', jsonb_build_object('id','m1','provider','Vattenfall','monthlyCost',70,'deletedAt','2026-10-01T10:40:00.000Z','updatedAt','2026-10-01T10:40:00.000Z'),
      'updatedAt','2026-10-01T10:40:00.000Z','baseRev',(select rev from public.sync_records where id='m1'))))
   -> 0 ->> 'status') = 'applied', 'Löschung wird übernommen');
select pg_temp.check(
  (public.sync_push((select v::uuid from t where k='hh2'),
    jsonb_build_array(jsonb_build_object('entityType','contracts','id','m1',
      'data', jsonb_build_object('id','m1','provider','Phone-Version','monthlyCost',70,'updatedAt','2026-10-01T10:50:00.000Z'),
      'updatedAt','2026-10-01T10:50:00.000Z','baseRev',(select v::bigint from t where k='m_protrev'))))
   -> 0 ->> 'status') = 'rejected', 'veraltete Änderung belebt gelöschten Datensatz nicht wieder');
select pg_temp.check((select data ->> 'deletedAt' from public.sync_records where id='m1') is not null, 'Datensatz bleibt gelöscht');

select 'ALL SYNC SCHEMA TESTS PASSED' as result;
