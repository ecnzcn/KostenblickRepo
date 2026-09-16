# Kostenblick

Kostenblick ist eine mobile-first Progressive Web App für private Haushalte
zur Verwaltung von Nebenkostenabrechnungen, Verträgen, Müllkosten,
Kündigungsfristen, Erinnerungen und Kostenstatistiken – offlinefähig und
später cloud-synchronisierbar.

> **Status:** Phase 1 (PWA-Grundgerüst). Die App enthält aktuell Navigation,
> Layout und die technische Basis. Fachliche Features (Domain-Modelle,
> IndexedDB, Dashboard, OCR, Statistik, Verträge, Reminder, Sync) folgen in
> den nächsten Entwicklungsphasen – siehe [`CLAUDE.md`](./CLAUDE.md).

## Features

Geplanter Funktionsumfang (siehe `CLAUDE.md` für den Architektur- und
Phasenplan):

- Nebenkostenabrechnungen mit Dokumenten-Upload (PDF/Bilder) und
  OCR-gestützter Datenerkennung (Vorschläge, die manuell geprüft werden)
- jährliche Kostenhistorien und Jahresvergleiche
- Müllkosten-Verwaltung
- Strom-, Internet- und Telekommunikationsverträge inkl. automatischer
  Kündigungsfrist-Berechnung
- Erinnerungen vor Kündigungsterminen (90/30/7/1 Tage, konfigurierbar)
- Dashboard mit monatlichen/jährlichen Gesamtkosten und
  Kategorie-Auswertung
- Statistiken mit Balken- und Liniendiagrammen
- Offline-First mit IndexedDB als primärer Datenquelle
- Sync-Abstraktion (V1: lokaler Mock, Last-Write-Wins-Konfliktstrategie)

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

## Lokale Entwicklung

Voraussetzung: Node.js ≥ 20.

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
├── features/        dashboard, statistics, bills, contracts, waste,
│                     documents, settings
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
