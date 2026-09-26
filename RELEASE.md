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
