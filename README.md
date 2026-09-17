# Kostenblick

Kostenblick ist eine mobile-first Progressive Web App für private Haushalte
zur Verwaltung von Nebenkostenabrechnungen, Verträgen, Müllkosten,
Kündigungsfristen, Erinnerungen und Kostenstatistiken – offlinefähig und
später cloud-synchronisierbar.

> **Status:** Kosten-, Vertrags- und Abrechnungsverwaltung (inkl. Import von
> Abrechnungen per PDF/Foto mit OCR-Vorschlägen zur manuellen Prüfung) sowie
> das Dashboard sind nutzbar. Statistik-Detailauswertungen, Erinnerungen und
> echte Cloud-Synchronisierung folgen in weiteren Phasen – siehe
> [`CLAUDE.md`](./CLAUDE.md).

## Features

Geplanter Funktionsumfang (siehe `CLAUDE.md` für den Architektur- und
Phasenplan):

- Nebenkostenabrechnungen mit Dokumenten-Upload (PDF/Bilder) und **echter,
  lokaler OCR-Erkennung** (läuft vollständig im Browser, keine Cloud-OCR;
  Vorschläge, die immer manuell geprüft werden müssen, siehe unten)
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
