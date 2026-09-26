# Kostenblick

Kostenblick ist eine mobile-first Progressive Web App für private Haushalte
zur Verwaltung von Nebenkostenabrechnungen, Verträgen, Müllkosten,
Kündigungsfristen, Erinnerungen und Kostenstatistiken – offlinefähig und
später cloud-synchronisierbar.

> **Status:** V1 (siehe [`RELEASE.md`](./RELEASE.md)). Kosten-, Vertrags- und Abrechnungsverwaltung (inkl. Import von
> Abrechnungen per PDF/Foto mit OCR-Vorschlägen zur manuellen Prüfung), das
> Dashboard, die Statistik-Seite (`/statistik`: Jahres- und
> Mehrjahresvergleich, Kategorie-Aufschlüsselung, Top-Kostenpositionen,
> monatliche Entwicklung soweit Daten das hergeben), automatische
> Kündigungsfrist-Erinnerungen (`/erinnerungen`, inkl. lokaler
> Benachrichtigungen), eine zentrale Dokumentenverwaltung (`/dokumente`:
> Suche, Filter, Vorschau, Verknüpfung zu Abrechnung/Vertrag/Müllkosten)
> sowie eine Müllkostenverwaltung (`/muell`: Jahresübersicht,
> Kategorien-Aufschlüsselung, Jahresvergleich) sind nutzbar. Eine zentrale
> Kostenübersicht (`/kostenuebersicht`) kombiniert Abrechnungen, Müllkosten
> und manuell erfasste Kosten zu einer einzigen, konsistenten
> Jahres-/Monatsansicht und macht mögliche Doppelzählungen (z. B. Müllkosten
> sowohl in einer Abrechnung als auch separat erfasst) transparent, statt sie
> stillschweigend zu verrechnen; das Dashboard nutzt dieselbe Datenbasis.
> Echte Cloud-Synchronisierung folgt in weiteren Phasen – siehe
> [`CLAUDE.md`](./CLAUDE.md).

## Features

Geplanter Funktionsumfang (siehe `CLAUDE.md` für den Architektur- und
Phasenplan):

- Nebenkostenabrechnungen mit Dokumenten-Upload (PDF/Bilder) und **echter,
  lokaler OCR-Erkennung** (läuft vollständig im Browser, keine Cloud-OCR;
  Vorschläge, die immer manuell geprüft werden müssen, siehe unten)
- jährliche Kostenhistorien und Jahresvergleiche
- Müllkosten-Verwaltung (`/muell`): Erfassen/Bearbeiten/Löschen pro Jahr
  und Kategorie (Restmüll, Biomüll, Gelber Sack/Gelbe Tonne, Papier,
  Sperrmüll, Weitere Müllkosten), Jahresfilter, Jahres- und
  Kategoriensummen, Vorjahresvergleich, optionale Dokumentverknüpfung
  (z. B. Gebührenbescheid)
- Strom-, Internet- und Telekommunikationsverträge inkl. automatischer
  Kündigungsfrist-Berechnung
- Vertragsstatus (Aktiv/Bald fällig/Dringend/Abgelaufen) und automatische
  Erinnerungen vor Kündigungsterminen (90/30/7/1 Tage, konfigurierbar) mit
  eigener Erinnerungsseite (`/erinnerungen`) und optionalen lokalen
  Benachrichtigungen
- Dashboard mit monatlichen/jährlichen Gesamtkosten und
  Kategorie-Auswertung
- Statistik-Seite (`/statistik`): Gesamtkosten und Vorjahresvergleich pro
  Jahr, Kosten nach Kategorie, wichtigste Kostenpositionen, monatliche
  Entwicklung (nur wenn Abrechnungen tatsächlich einem Monat zuordenbar
  sind – keine erfundene Verteilung), Mehrjahresvergleich; Bill-Gesamtsumme
  und Summe der Kostenpositionen werden nie doppelt gezählt, eine Differenz
  wird transparent angezeigt statt still korrigiert
- Zentrale Dokumentenverwaltung (`/dokumente`): alle Rechnungen, Verträge
  und sonstigen Unterlagen an einem Ort, mit Suche, Filter nach Typ/
  OCR-Status, Sortierung, PDF-/Bild-Vorschau, Datei ersetzen und
  Verknüpfung zur zugehörigen Abrechnung/zum Vertrag
- Zentrale Kostenübersicht (`/kostenuebersicht`): kombiniert Abrechnungen,
  Müllkosten und manuell erfasste Kosten zu einer Jahres-/Monatsansicht
  ohne Vertragskosten, mit transparenter Warnung bei möglicher
  Doppelzählung statt stiller Verrechnung; Dashboard-Kostenkarten nutzen
  dieselbe Datenbasis
- Offline-First mit IndexedDB als primärer Datenquelle
- Laufende Vertragskosten (`Contract.monthlyCost`/`yearlyCost` aktiver
  Verträge) werden auf Dashboard und Kostenübersicht separat ausgewiesen -
  nie in die tatsächlichen Kosten eingerechnet
- Vorbereitete, aber noch **nicht aktive** Sync-Infrastruktur (Soft-Delete,
  `syncVersion`); eine echte Synchronisierung (Mock oder Cloud) ist noch
  nicht implementiert - siehe [`CLAUDE.md`](./CLAUDE.md), Abschnitt „Sync"

## Tech Stack

- [React](https://react.dev/) + TypeScript (strict mode)
- [Vite](https://vite.dev/)
- [Tailwind CSS](https://tailwindcss.com/) v4
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) (Manifest, Service
  Worker, Offline-Caching)
- [idb](https://github.com/jakearchibald/idb) (IndexedDB)
- [React Router](https://reactrouter.com/)
- [Vitest](https://vitest.dev/) + [Testing Library](https://testing-library.com/)
- [oxlint](https://oxc.rs/docs/guide/usage/linter.html)
- [tesseract.js](https://github.com/naptha/tesseract.js) (lokale OCR, WASM,
  läuft in einem Web Worker) + [pdfjs-dist](https://github.com/mozilla/pdf.js)
  (PDF-Textextraktion und -Rendering)

## Lokale Abrechnungs-OCR

Beim Import einer Abrechnung (PDF oder Foto) wird der Dokumentinhalt
**vollständig im Browser** ausgewertet - es wird kein Dokument an einen
externen OCR-Anbieter (Google, Microsoft, OpenAI, AWS, Azure, …) gesendet.

- **Unterstützte Formate**: PDF, JPEG, PNG, WebP (max. 20 MB).
- Ein **PDF mit eingebettetem Text** wird direkt ausgelesen, ohne OCR.
- Ein **gescanntes PDF** (kein Text vorhanden) wird Seite für Seite
  gerendert und per OCR erkannt (deutsches Sprachmodell).
- Ein **Foto/Bild** wird direkt per OCR erkannt.
- Die OCR-Engine (Tesseract-Worker, WASM-Kern, deutsches Sprachmodell) wird
  beim ersten Import einmalig geladen und danach dauerhaft im Browser
  gecacht - die Funktion arbeitet danach offline weiter.
- **Grenzen**: Die Erkennungsqualität hängt von der Dokumentqualität ab,
  handschriftlicher Text wird nicht unterstützt, und ungewöhnliche Layouts
  können eine manuelle Korrektur erfordern. **Erkannte Werte sind immer nur
  Vorschläge** - sie müssen vor dem Speichern in der Review-Ansicht geprüft
  und bestätigt werden, bevor daraus eine Abrechnung wird.

## Vertragserinnerungen & Benachrichtigungen

Für jeden Vertrag mit Vertragsende und Kündigungsfrist werden automatisch
Erinnerungen berechnet (Standard: 90/30/7/1 Tage vor der Kündigungsfrist,
konfigurierbar unter „Mehr" → Vertragserinnerungen) und sind unter
`/erinnerungen` gruppiert nach Überfällig/Heute/In 7 Tagen/Später
einsehbar.

- Beim Öffnen der App wird geprüft, ob Erinnerungen fällig/überfällig
  sind, und - sofern Benachrichtigungen aktiviert wurden - eine lokale
  Browser-Benachrichtigung versucht.
- **Grenzen**: Eine reine lokale PWA kann eine zeitgesteuerte
  Benachrichtigung **nicht garantieren**, ohne dass die App zwischenzeitlich
  geöffnet wird - es gibt (bewusst) keinen Push-Backend-Server in Phase 6.
  Fällige Erinnerungen bleiben unabhängig davon jederzeit unter
  `/erinnerungen` sichtbar.
- Die Berechtigung für Benachrichtigungen wird nie automatisch beim
  App-Start angefragt, sondern nur über einen expliziten Button in den
  Einstellungen - die App funktioniert vollständig, auch ohne dass
  Benachrichtigungen erlaubt werden.

## Dokumentenverwaltung

Alle importierten/angehängten Dateien (Abrechnungen, Vertragsdokumente,
sonstige Unterlagen) sind zentral unter `/dokumente` einsehbar, erreichbar
über „Mehr" → Dokumente.

- **Liste**: Suche (Dateiname, erkannter OCR-Text, verknüpfte Abrechnung/
  verknüpfter Vertrag), Filter nach Dokumenttyp und OCR-Status, Sortierung
  (neueste/älteste zuerst, Dateiname, Größe). Die Liste lädt dabei nur
  Metadaten - nie die eigentlichen Dateiinhalte.
- **Detailseite**: Metadaten, OCR-Status/-Text, Verknüpfung zur Abrechnung
  oder zum Vertrag (anklickbar), Vorschau (PDF/Bild, erst bei Klick auf
  „Vorschau anzeigen" geladen), Herunterladen, Datei ersetzen, Dokument
  löschen (mit Warnhinweis, falls es noch verknüpft ist).
- Wird eine Abrechnung oder ein Vertrag gelöscht, wird ihr Dokument nur
  mitgelöscht, wenn keine andere Stelle mehr darauf verweist - so bleiben
  nie verwaiste Dateien zurück.
- Verträge können nachträglich über die Vertrags-Detailseite ein
  Vertragsdokument erhalten (Upload direkt dort, keine separate
  Import-Maske nötig).

## Müllkostenverwaltung

Unter `/muell` (erreichbar über „Mehr" → Müllkosten, das Dashboard oder
den Schnellzugriff) lassen sich Müllgebühren pro Jahr und Kategorie
erfassen, bearbeiten und löschen.

- **Jahresübersicht**: ein Jahresfilter (‹ Jahr ›) zeigt Gesamtsumme,
  Kategorien-Aufschlüsselung und den Vergleich zum Vorjahr (absolute und
  prozentuale Veränderung) für das gewählte Jahr; ohne Vorjahresdaten wird
  „Kein Vergleich verfügbar" statt einer erfundenen Zahl angezeigt.
- **Erfassen/Bearbeiten**: dasselbe Formular für beide Fälle - Jahr,
  Kategorie, Betrag und optionale Notiz, dazu wahlweise ein neues Dokument
  hochladen oder ein bereits vorhandenes, noch nicht verknüpftes Dokument
  auswählen (Wiederverwendung der zentralen Dokumentenverwaltung aus
  Phase 7 - keine zweite Dokumentlogik).
- **Löschen**: mit Bestätigung; ein verknüpftes Dokument wird dabei nur
  gelöscht, wenn keine andere Stelle mehr darauf verweist.

## Zentrale Kostenübersicht

Unter `/kostenuebersicht` (erreichbar über „Mehr" oder den
„Kostenübersicht →"-Link direkt über den Kosten-Karten auf dem Dashboard)
werden Abrechnungen, Müllkosten und manuell erfasste Kosten zu einer
konsistenten Ansicht zusammengeführt - ohne eine neue Datenbank-Entity,
rein zur Laufzeit berechnet.

- **Jahresgesamt**: eine Kennzahl je gewähltem Jahr, darunter die
  Aufteilung nach Quelle (Abrechnungen/Müll/Manuell). Vertragskosten
  (`Contract.monthlyCost`/`yearlyCost`) fließen **nicht** ein - das sind
  vertragliche Konditionen, keine tatsächlich angefallenen Kosten.
- **Monatsentwicklung**: nur tatsächlich einem Monat zuordenbare Beträge
  (Abrechnungen mit eindeutigem Zeitraum, manuell erfasste Kosten über ihr
  Datum) - Müllkosten und Jahresabrechnungen werden nie künstlich auf
  Monate verteilt; was dadurch nicht in der Monatsansicht auftaucht, wird
  separat als „nicht monatlich zuordenbar" ausgewiesen.
- **Kategorien**: Müllkosten laufen unter der zentralen Kategorie „Müll" -
  die ursprüngliche, genauere Müll-Kategorie (Restmüll, Biomüll, …) bleibt
  dabei je Eintrag erhalten, nur eben zusätzlich zentral eingeordnet.
- **Warnung bei möglicher Doppelzählung**: Enthält eine Abrechnung eine
  Kostenposition mit Kategorie „Müll" **und** existiert für dasselbe Jahr
  zusätzlich ein separater Müllkosten-Eintrag, wird ein Hinweis angezeigt -
  nichts wird automatisch gelöscht oder verrechnet, die Prüfung bleibt
  beim Nutzer.
- Das bestehende `/kosten`-Feature (manuelle Kostenerfassung) bleibt
  unverändert bestehen; die zentrale Kostenübersicht ersetzt es nicht,
  sondern kombiniert seine Daten mit denen aus Abrechnungen und
  Müllkosten.

## Lokale Entwicklung

Voraussetzung: Node.js ≥ 22 (einige Dev-Dependencies wie `vitest`/`jsdom`
setzen dies voraus).

```bash
npm install
npm run dev
```

Die App läuft danach standardmäßig unter `http://localhost:5173`.

## Build

```bash
npm run build
```

Erstellt einen produktionsfertigen Build inkl. Service Worker und
Manifest in `dist/`.

```bash
npm run preview
```

Startet einen lokalen Server für den produktiven Build (zum Testen von
PWA-Verhalten wie Offline-Caching und Installierbarkeit).

## Test & Lint

```bash
npm run test       # Vitest einmalig ausführen
npm run test:watch # Vitest im Watch-Modus
npm run lint        # oxlint
```

Vor Abschluss jeder Entwicklungsphase werden Build, Tests und Lint
ausgeführt (siehe `CLAUDE.md`).

## Deployment

Die App ist eine statische PWA (Ergebnis von `npm run build` in `dist/`)
und kann auf jedem Static-Hosting-Anbieter mit HTTPS bereitgestellt werden
(z. B. Vercel, Netlify, Cloudflare Pages, GitHub Pages). HTTPS ist
zwingend erforderlich, damit der Service Worker und die
Installierbarkeit auf iOS funktionieren.

## PWA-Installation auf dem iPhone (Safari)

1. Seite in **Safari** auf dem iPhone öffnen (nicht Chrome – iOS erlaubt
   PWA-Installation nur über Safari).
2. Auf das **Teilen-Symbol** tippen (Quadrat mit Pfeil nach oben).
3. **„Zum Home-Bildschirm"** auswählen.
4. Namen bestätigen und auf **„Hinzufügen"** tippen.

Die App startet danach im Standalone-Modus (ohne Browser-UI) und nutzt den
Service Worker für Offline-Zugriff auf bereits geladene Inhalte.

## Architekturübersicht

Domain-Driven, mit klarer Trennung von UI und Geschäftslogik:

```
UI → Feature Logic → Use Case → Repository → Data Source (IndexedDB / API)
```

```
src/
├── app/            Routing- und App-Shell-Konfiguration
├── components/     Wiederverwendbare UI-Bausteine (Layout, Icons, …)
├── features/        dashboard, statistics, bills, contracts, reminders,
│                     waste, documents, settings
├── domain/          models, repositories, usecases
├── services/         ocr, sync, notifications, storage
├── database/        IndexedDB-Setup
├── hooks/, utils/, constants/, types/
```

Business-Logik ist bewusst nicht an React gebunden, damit dieselbe
Domain-Struktur später einer nativen SwiftUI-App
(`View → ViewModel → UseCase → Repository → SwiftData/API`) als Vorbild
dienen kann.

Details zu Domain-Modellen, Business Rules, Coding- und Git-Standards
stehen in [`CLAUDE.md`](./CLAUDE.md).
