# Kostenblick V1

## Release-Stand

Funktionale Basis (manuell auf dem iPhone geprüft und freigegeben):

    c67438cfa8e5f5755a0478a97859502f5fc3db41
    fix: complete phase 11e v1 ux and logic fixes

Der Tag `v1.0.0` zeigt auf den Commit, der direkt auf dieser Basis
aufbaut und ausschließlich Release-Finalisierung (Dokumentation,
Aufräumen ungenutzter Alt-Artefakte, Versionierung) enthält – keine
funktionalen Änderungen gegenüber dem oben genannten, geprüften Stand.

## Enthaltene wesentliche Bereiche

- Kostenverwaltung (`/kosten`): manuelle Kostenerfassung, Suche/Sortierung,
  Jahresfilter
- Nebenkostenabrechnungen (`/abrechnungen`): Erfassen, Bearbeiten, Import
  per PDF/Foto mit lokaler OCR-Erkennung (Tesseract, vollständig im
  Browser, keine Cloud-OCR), Review-Pflicht vor dem Speichern
- Verträge (`/vertraege`): Verwaltung, automatische
  Kündigungsfrist-Berechnung, Vertragsstatus (Aktiv/Bald fällig/Dringend/
  Abgelaufen), laufende Vertragskosten (separat ausgewiesen, nie in die
  tatsächlichen Kosten eingerechnet)
- Erinnerungen (`/erinnerungen`): automatische Kündigungsfrist-Erinnerungen
  (90/30/7/1 Tage, konfigurierbar), lokale Benachrichtigungen
- Dokumente (`/dokumente`): zentrale Verwaltung aller Abrechnungs-/
  Vertrags-/Müllkosten-Dokumente, Suche, Filter, Vorschau, Datei ersetzen
- Müllkosten (`/muell`): Erfassen/Bearbeiten/Löschen pro Jahr und
  Kategorie, Jahresvergleich, Dokumentverknüpfung
- Dashboard: monatliche/jährliche Gesamtkosten, Kategorie-Auswertung,
  laufende Vertragskosten, Vertragsfristen, letzte Abrechnung
- Kostenübersicht (`/kostenuebersicht`): kombiniert Abrechnungen,
  Müllkosten und manuelle Kosten zu einer Jahres-/Monatsansicht,
  transparente Warnung bei möglicher Doppelzählung
- Statistiken (`/statistik`): Jahres- und Mehrjahresvergleich,
  Kategorie-Aufschlüsselung, Top-Kostenpositionen, monatliche Entwicklung
- PWA: installierbar, offlinefähig (Service Worker, IndexedDB als primäre
  Datenquelle), iOS-Safari-Homescreen-Installation

## Technischer Zustand

- Tests: 495/495 bestanden
- TypeScript (`tsc --noEmit`): keine Fehler
- Lint (`oxlint`): keine Meldungen
- Build (`npm run build`): erfolgreich
- GitHub Pages: Deploy-Workflow läuft auf Push nach `main`, erfolgreich
  verifiziert

## Bewusst NICHT Bestandteil von V1

- Cloud Sync
- Multi-Device-Synchronisierung
- Authentifizierung
- Backend
- Supabase/Firebase
- Konfliktauflösung (Last-Write-Wins ist als künftige Strategie
  festgelegt, aber nicht implementiert)
- Weitere spätere Plattformfunktionen

Details zur Architektur, den Domain-Modellen und allen Business Rules
stehen in [`CLAUDE.md`](./CLAUDE.md).

## Kostenblick V1.1.0

### Release-Stand

    78da1bb4035fc5341ef4d9a0860a072c262cc738
    feat: add pwa update hint and app version

V1.1.0 baut direkt auf `v1.0.0` auf und enthält ausschließlich die Phasen
12B–12E - keine weiteren funktionalen Änderungen.

### Neu gegenüber V1.0.0

**Backup / Restore** (Phasen 12B/12C, „Mehr" → „Daten & Backup")

- vollständiger lokaler JSON-Backup-Export aller persistierten
  IndexedDB-Stores, inkl. `documentFiles` (Base64), Soft-Deleted Daten und
  Sync-Metadaten (`syncVersion`/`deletedAt`)
- vollständiger lokaler Restore derselben Datei - explizite
  Nutzerbestätigung nach Anzeige der Backup-Infos (Datum, Version, Anzahl
  je Store) erforderlich; ohne Bestätigung wird nichts verändert
- Restore ist ein **vollständiger Ersatz** aller Stores (kein Merge),
  läuft atomar in einer einzigen IndexedDB-Transaktion (alles oder
  nichts) und validiert Format-/Datenbankversion sowie offensichtliche
  Referenzfehler vor jedem Schreibzugriff

**Verträge** (`/vertraege`, Phase 12D)

- Suche über Anbieter, Tarif und Kategorie
- Filter nach Status (Aktiv/Nicht aktiv, basierend auf der bestehenden
  `isContractActive()`), Kategorie und Erinnerung (aktiviert/deaktiviert)
- Sortierung nach Kündigungsfrist (Standard, unverändert), Anbieter,
  monatlichen Kosten oder Vertragsbeginn
- Suche, Filter und Sortierung sind beliebig kombinierbar; „Filter
  zurücksetzen" setzt alles auf „Alle" zurück

**PWA** (Phase 12E)

- kontrollierter Hinweis „Neue Version verfügbar" statt eines
  unangekündigten automatischen Updates; „Jetzt aktualisieren" oder
  „Später"
- aktuell installierte App-Version sichtbar unter „Mehr" (aus derselben
  zentralen `APP_VERSION`-Quelle wie der Backup-Export)

### Technischer Zustand (V1.1.0)

- Tests: 590/590 bestanden
- TypeScript (`tsc -b`): keine Fehler
- Lint (`oxlint`): keine Meldungen
- Build (`npm run build`): erfolgreich
- GitHub Pages: Deploy-Workflow läuft auf Push nach `main`

### Bewusst NICHT Bestandteil von V1.1.0

- Cloud Sync
- Multi-Device-Synchronisierung
- Authentifizierung
- Backend
- Account-System
- Konfliktauflösung
- automatische Synchronisierung
- Multi-Property

`syncQueue`/`syncVersion` bleiben weiterhin lediglich vorbereitende
technische Elemente ohne aktiven Consumer (siehe „Sync"-Abschnitt in
[`CLAUDE.md`](./CLAUDE.md)).
