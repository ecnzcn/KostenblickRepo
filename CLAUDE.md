# Kostenblick – Projektinstruktionen

## Projektziel

Kostenblick ist eine produktionsnahe, mobile-first Progressive Web App für
private Haushalte zur Verwaltung von:

- Nebenkostenabrechnungen (inkl. OCR-Auswertung von Dokumenten)
- jährlichen Kostenhistorien
- Müllkosten
- Strom-, Internet- und Telekommunikationsverträgen
- Vertragslaufzeiten und Kündigungsfristen
- automatischen Erinnerungen
- Statistiken und Jahresvergleichen
- Offline-Nutzung mit späterer Cloud-Synchronisierung

Primäres Zielgerät: **iPhone 15 Pro** (Safari/PWA). Responsive Priorität:
iPhone → iPad → Desktop. Aktuell steht kein Mac zur Verfügung – die gesamte
Architektur muss browserbasiert entwickel- und deploybar sein.

V1 bleibt bewusst fokussiert; die Domain-Struktur wird so gestaltet, dass
später eine native SwiftUI-App auf derselben Business-Logik aufbauen kann.

## Tech Stack

- React 19 + TypeScript (strict mode)
- Vite
- Tailwind CSS v4
- PWA via `vite-plugin-pwa` (Manifest, Service Worker, offline caching)
- IndexedDB (`idb`) als primäre lokale Datenquelle
- React Router für Navigation
- Vitest + Testing Library für Tests
- oxlint für Linting

Vermeide unnötige Abhängigkeiten. Nutze etablierte Libraries nur mit klarem
Mehrwert.

## Architektur

Domain-Driven, modular, mit klarer Trennung:

```
UI → Feature Logic → Use Case → Repository → Data Source
```

Business Logic darf **nicht** direkt in React-Komponenten implementiert
werden. Features sind so unabhängig wie möglich voneinander. Keine große
monolithische `App.tsx`.

Konzeptionelle Ziel-Architektur für eine spätere native SwiftUI-App:

```
SwiftUI View → ViewModel → UseCase → Repository → SwiftData / API
```

Die PWA folgt konzeptionell demselben Muster (Component → Hook/ViewModel →
UseCase → Repository → IndexedDB/API).

## Folder Structure

```
src/
├── app/            Routing- und App-Shell-Konfiguration
├── components/     Wiederverwendbare, feature-unabhängige UI-Bausteine
├── features/
│   ├── dashboard/
│   ├── statistics/
│   ├── bills/
│   ├── contracts/
│   ├── waste/
│   ├── documents/
│   └── settings/
├── domain/
│   ├── models/       Entities und Value Objects
│   ├── repositories/ Repository-Interfaces
│   └── usecases/     Business-Logik (z. B. Kündigungsfrist-Berechnung)
├── services/
│   ├── ocr/           OCRService-Abstraktion
│   ├── sync/           SyncService-Abstraktion
│   ├── notifications/  Reminder-Benachrichtigungen
│   └── storage/         Dokument-/Dateispeicherung
├── database/        IndexedDB-Setup (Schema, Migrations)
├── hooks/           Wiederverwendbare React-Hooks
├── utils/           Reine Hilfsfunktionen
├── constants/       Konstanten (Navigation, Kategorien, …)
└── types/           Gemeinsame TypeScript-Typen
```

Leere Ordner enthalten vorerst eine `.gitkeep`-Datei, bis sie in einer
späteren Phase befüllt werden.

## Domain Models

Mindestens folgende Entities:

`User`, `Property`, `Bill`, `BillItem`, `Category`, `CostEntry`,
`WasteCost`, `Contract`, `Reminder`, `Document`.

Jede persistierte Entity benötigt: `id`, `createdAt`, `updatedAt`.

Sync-fähige Entities benötigen zusätzlich: `deletedAt`, `syncVersion`.

## Wichtige Business Rules

### Kündigungsfrist

```
spätester Kündigungstermin = Vertragsende - Kündigungsfrist
```

Unterstützte Einheiten: `days`, `weeks`, `months`, `years`. Die Berechnung
wird zentral in `domain/usecases` implementiert, getestet und **nicht** in
einer React-Komponente dupliziert.

### OCR

OCR-Ergebnisse sind zunächst **Vorschläge**. Kein automatisch erkannter Wert
darf ohne Review-Mechanismus als endgültig gelten. Jeder erkannte Wert
benötigt `confidence`, `sourceText`, `manuallyVerified`. Bei niedriger
Confidence muss die UI eine manuelle Prüfung verlangen.

Die UI kommuniziert ausschließlich über die `OCRService`-Schnittstelle
(`extractText`, `analyzeDocument`, `extractBillData`,
`calculateConfidence`). Die konkrete OCR-Implementierung muss austauschbar
sein.

### Statistik

Kosten müssen nach Monat, Jahr und Kategorie auswertbar sein.

```
prozentuale Veränderung = ((newValue - oldValue) / oldValue) * 100
```

Bei `oldValue === 0` muss eine sichere Sonderbehandlung erfolgen (keine
Division durch 0).

### Sync

Abstraktion über `SyncService` mit `sync()`, `pushChanges()`,
`pullChanges()`, `resolveConflict()`. V1 nutzt einen Mock/lokalen Sync.
Konfliktstrategie: **Last Write Wins** anhand von `updatedAt`.

## PWA-Regeln

- installierbar (Manifest + Icons)
- offline-fähig (Service Worker, offline caching)
- funktioniert auf iOS Safari und als Home-Screen-PWA (`standalone`)
- mobile-first, iPhone 15 Pro als primäres Zielgerät
- IndexedDB als primäre lokale Datenquelle; die App darf nicht voraussetzen,
  dass dauerhaft Internet verfügbar ist
- lokale Änderungen werden für spätere Synchronisierung vorgemerkt

## Sicherheitsregeln

NIEMALS:

- API Keys committen
- Secrets im Source Code speichern
- Passwörter hardcoden
- private Dokumente öffentlich ausliefern
- sensible Daten in Debug-Logs schreiben
- erfundene API-Endpunkte oder API Keys verwenden

Privates GitHub Repository verwenden.

## Coding Standards

- TypeScript strict mode
- keine Fake-Implementierungen als fertige Features ausgeben – wenn ein
  externes System (z. B. echtes OCR-Backend, Cloud-Sync) noch nicht
  existiert: Interface erstellen, Mock verwenden, klar dokumentieren
- keine stillen Fehler; verständliche Fehlermeldungen statt Stack Traces im
  UI
- alle Bereiche benötigen sinnvolle Empty States
- Touch Targets mindestens 44px
- semantisches HTML, ARIA, Tastatur- und Screenreader-Zugänglichkeit,
  ausreichender Kontrast

## UI/UX

Apple-inspiriert, minimalistisch, hochwertig, ruhig, mobile-first. Große
Kennzahlen, dezente Karten, übersichtliche Diagramme, viel Weißraum.

Navigation (Bottom Nav auf Mobile, Sidebar ab Desktop-Breakpoint):
Home, Statistik, Abrechnungen, Verträge, Mehr.

Desktop ist keine einfach vergrößerte Mobile-UI – zusätzlicher Platz wird
sinnvoll genutzt (z. B. Sidebar-Navigation statt Bottom Nav).

## Testregeln

Tests sind insbesondere erforderlich für:

- Kündigungsfristberechnung
- Monats- und Jahreskosten
- Jahresvergleich / prozentuale und absolute Veränderung
- BillItem-Summen
- Sync-Konflikte
- Datenvalidierung

Vor Abschluss jeder Entwicklungsphase:

```
npm run build
npm run test
npm run lint
```

Keine Phase gilt als abgeschlossen, wenn Build, Tests oder Lint
fehlschlagen. UI-Änderungen zusätzlich im Browser (idealerweise bei
iPhone-15-Pro-Viewport) verifizieren und auf Console-Errors prüfen.

## Git-Regeln

Saubere, logisch getrennte, kleine Commits, z. B.:

```
feat: initialize pwa
feat: add domain models
feat: add indexeddb repository
feat: add dashboard
feat: add bill management
feat: add ocr workflow
feat: add statistics
feat: add contracts
feat: add reminders
feat: add offline support
feat: add sync abstraction
```

Keine Secrets committen. Keine riesigen, unstrukturierten Commits.

## Entwicklungsprinzip

Nicht mehrere große Features gleichzeitig implementieren. Phasenweise
vorgehen: analysieren → implementieren → testen → Build → Fehler beheben →
Commit. Erst danach die nächste Phase beginnen.

Bei jeder größeren Architekturänderung muss diese Datei (`CLAUDE.md`)
aktualisiert werden.
