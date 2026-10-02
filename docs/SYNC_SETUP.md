# Synchronisierung einrichten (Supabase)

Einmalige Einrichtung, ca. 10 Minuten. Danach synchronisiert Kostenblick
zwischen deinen Geräten und einer zweiten Person im Haushalt.

## 1. Supabase-Projekt anlegen

1. Auf [supabase.com](https://supabase.com) ein kostenloses Konto anlegen.
2. **New project** → Name z. B. `kostenblick`, Region **Frankfurt (eu-central-1)**,
   ein Datenbank-Passwort vergeben (wird für die App nicht gebraucht).
3. Warten, bis das Projekt bereit ist (1–2 Minuten).

## 2. Datenbank-Schema einspielen

1. Im Projekt links **SQL Editor** → **New query**.
2. Den kompletten Inhalt von
   `supabase/migrations/20261002120000_sync_schema.sql` einfügen → **Run**.
   Erwartet: „Success. No rows returned“.
3. Optional (erst für Dokument-Dateien in Phase 13F nötig): dasselbe mit
   `supabase/migrations/20261002120100_documents_bucket.sql`.

## 3. Login per Code aktivieren

Kostenblick meldet sich mit einem Code aus der E-Mail an, nicht mit einem
Link (ein Link würde auf dem iPhone in Safari statt in der installierten App
landen).

1. **Authentication** → **Emails** (bzw. **Email Templates**) → Vorlage
   **Magic Link** öffnen.
2. Betreff z. B. `Dein Kostenblick-Code`, Inhalt ersetzen durch:

   ```html
   <h2>Dein Anmeldecode</h2>
   <p>Gib diesen Code in Kostenblick ein: <strong>{{ .Token }}</strong></p>
   ```

3. Speichern.

Hinweis: Der eingebaute E-Mail-Versand von Supabase ist nur für wenige
E-Mails pro Stunde gedacht. Für zwei Personen reicht das; bei „rate limit“
kurz warten.

## 4. Zugangsdaten in die App eintragen

1. In Supabase **Project Settings** → **API** (bzw. **API Keys**):
   - **Project URL** kopieren (`https://….supabase.co`)
   - **anon / publishable key** kopieren (dieser Schlüssel ist öffentlich und
     darf in der App stehen – geschützt wird über die Datenbank-Regeln).
   - Den **service_role / secret key** niemals in die App eintragen.
2. In Kostenblick: **Mehr** → **Synchronisierung** → beide Werte einfügen →
   **Server speichern**.

## 5. Erstes Gerät verbinden

1. E-Mail eingeben → **Code senden** → Code aus der E-Mail eingeben.
2. **Neuen Haushalt anlegen**. Vorhandene Daten werden nach Bestätigung dem
   Haushalt zugeordnet und hochgeladen (vorher wird ein Backup angeboten).

## 6. Zweites Gerät / zweite Person

- **Eigenes zweites Gerät:** gleiche Schritte 4 und 5.1, dann unter
  „Deine Haushalte“ **Verbinden**.
- **Zweite Person:** Auf dem ersten Gerät **Einladungscode erstellen**
  (7 Tage gültig, einmal verwendbar). Die Person trägt auf ihrem Gerät die
  Server-Daten ein, meldet sich mit **ihrer eigenen E-Mail** an und gibt den
  Code unter **Mit Einladungscode beitreten** ein.

Sind auf dem neuen Gerät schon Daten, fragt die App: **Zusammenführen**
(lokale Einträge kommen dazu) oder **Ersetzen** (lokale Einträge werden
gelöscht, dann wird der Haushalt geladen).

## Wann wird synchronisiert?

Beim Öffnen der App, bei Rückkehr in die App (höchstens alle 30 Sekunden),
wenn das Gerät wieder online ist, und mit **Jetzt synchronisieren**. Kommen
Änderungen von einem anderen Gerät, erscheint oben „Neue Daten
synchronisiert“ → **Anzeigen**.

## Gut zu wissen

- Kostenlose Supabase-Projekte werden nach 7 Tagen ohne Nutzung pausiert.
  Die App läuft dann lokal normal weiter; im Dashboard das Projekt mit
  **Restore** wieder aktivieren.
- Dokument-Dateien (PDFs, Fotos) werden noch nicht übertragen, nur ihre
  Angaben. Das kommt in Phase 13F.
- Konflikte (beide ändern denselben Eintrag gleichzeitig) löst die App
  automatisch: die neuere Änderung gewinnt, die andere Version steht im
  Konfliktprotokoll unter **Synchronisierung**.
