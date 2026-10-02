-- Kostenblick – Speicher für Dokument-Dateien (Vorbereitung Phase 13F)
--
-- Optional für den ersten Sync-Test: wird erst gebraucht, wenn Dokument-
-- Dateien synchronisiert werden. Kann zusammen mit dem Sync-Schema oder
-- später ausgeführt werden.
--
-- Pfad je Datei: <householdId>/<storagePath>. Zugriff nur für Mitglieder
-- des Haushalts, dessen Id der erste Pfadteil ist.

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

create function public.can_access_document_path(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_folder text := split_part(p_name, '/', 1);
begin
  if v_folder !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.is_household_member(v_folder::uuid);
end;
$$;

revoke all on function public.can_access_document_path(text) from public, anon;
grant execute on function public.can_access_document_path(text) to authenticated;

create policy documents_select on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and public.can_access_document_path(name));

create policy documents_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and public.can_access_document_path(name));

create policy documents_update on storage.objects
  for update to authenticated
  using (bucket_id = 'documents' and public.can_access_document_path(name));

create policy documents_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and public.can_access_document_path(name));
