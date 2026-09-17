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

Seit Phase 4 sind `services/ocr/` und `services/storage/` befüllt (siehe
OCR-Abschnitt unten). Der Import-Workflow selbst liegt bewusst unter
`features/bills/import/`, nicht unter `features/documents/` (weiterhin
`.gitkeep`) – er ist inhaltlich ein Bill-Feature (erzeugt am Ende eine
`Bill`), das Dokumente nur als Nebenprodukt mitführt; `features/documents/`
bleibt für eine spätere, bill-unabhängige Dokumentenverwaltung reserviert.

Seit Phase 5 ist `domain/usecases/statistics/` befüllt (siehe
„Statistik"-Abschnitt unten für die Architektur- und Datenquellen-
Entscheidungen).

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

### OCR & Dokument-Import (Phase 4, echte lokale OCR seit Phase 4.1)

OCR-Ergebnisse sind zunächst **Vorschläge**. Kein automatisch erkannter Wert
darf ohne Review-Mechanismus als endgültig gelten. Jeder erkannte Wert
benötigt `confidence`, `sourceText`, `manuallyVerified`. Bei niedriger
Confidence muss die UI eine manuelle Prüfung verlangen. Die Review-UI zeigt
dazu immer einen Hinweis, dass erkannte Werte vor dem Speichern zu prüfen
sind (siehe „Review & Persistenz" unten) – OCR-Ergebnisse werden nie als
fertige, garantiert korrekte Daten dargestellt.

Die UI kommuniziert ausschließlich über die `OCRService`-Schnittstelle
(`src/services/ocr/OCRService.ts`): `extractText`, `analyzeDocument`,
`extractBillData` (alle mit optionalem zweiten Parameter `OCROptions` -
`onProgress`/`signal` - für Fortschritt und Abbruch), plus ein optionales
`dispose()` zum Freigeben von Ressourcen. `src/services/ocr/
activeOcrService.ts` ist die **einzige** Stelle, die entscheidet, welche
Implementierung tatsächlich läuft (aktuell `LocalOCRService`); sie lädt
diese Implementierung per dynamischem `import()` erst beim ersten
tatsächlichen OCR-Aufruf, damit Tesseract/pdfjs-dist nicht im initialen
Bundle jeder Seite landen (siehe „Performance & Bundle-Größe" unten). Kein
Aufrufer importiert `LocalOCRService`, `tesseract.js` oder `pdfjs-dist`
direkt.

`MockOCRService` (`src/services/ocr/MockOCRService.ts`) bleibt erhalten,
wird aber von der App selbst nicht mehr verwendet - sie liest keine echten
Dateiinhalte, sondern liefert einen festen, plausiblen deutschen
Abrechnungstext. Tests, die schnelle/deterministische OCR-Ergebnisse statt
echter (langsamer, WASM-basierter) Erkennung brauchen, importieren sie
direkt oder mocken `activeOcrService.ts` (siehe `billImport.integration.
test.tsx`).

`LocalOCRService` (`src/services/ocr/LocalOCRService.ts`) ist die echte,
vollständig lokale (offline-fähige) Implementierung:

- **PDF**: zuerst wird die eingebettete Textebene gelesen
  (`services/ocr/pdf/pdfDocument.ts`, via `pdfjs-dist`). Ist genug
  verwertbarer Text vorhanden (`hasUsableText`), wird **kein** OCR
  ausgeführt. Andernfalls gilt das PDF als gescannt: jede Seite wird einzeln
  auf ein `<canvas>` gerendert, per OCR erkannt und wieder freigegeben
  (nie alle Seiten gleichzeitig im Speicher), Ergebnisse werden in
  Seitenreihenfolge mit `--- Seite N ---`-Trennern zusammengeführt.
- **Bilder** (JPEG/PNG/WebP): OCR läuft direkt auf der Datei.
- **OCR-Engine**: `tesseract.js` (WASM, läuft in einem eigenen Worker,
  blockiert die UI nicht), deutsches Sprachmodell
  (`4.0.0_best_int`, LSTM). Worker/Core/Sprachdaten sind lokal unter
  `public/vendor/tesseract/` bzw. `public/tessdata/` gebündelt (siehe deren
  `README.md`) statt von einem CDN geladen zu werden - es findet **kein**
  Netzwerkzugriff auf einen externen OCR-Anbieter statt, und nach dem
  ersten Laden sind diese Assets via Workbox `CacheFirst` dauerhaft
  gecacht (siehe `vite.config.ts`), die OCR funktioniert danach offline.
- **Fortschritt**: `OCRProgress` (`stage`, optional `current`/`total`,
  `message`) - nie eine erfundene Prozentzahl. `current`/`total` werden nur
  gesetzt, wenn sie echt bekannt sind (Seite X von Y; Tesseracts eigener,
  gemessener Recognize-Fortschritt 0-100). Ohne bekannten Fortschritt zeigt
  die UI einen reinen (indeterminate) Spinner.
- **Abbruch**: `OCROptions.signal` (AbortSignal). Bricht die Verarbeitung
  zwischen Seiten/Schritten ab und wirft `OCRCancelledError`
  (`services/ocr/OCRCancelledError.ts`); die Import-Seite unterscheidet das
  von einem echten Fehler und räumt das zwischenzeitlich gespeicherte
  `Document` wieder auf, ohne eine Fehlermeldung zu zeigen.
- **Ressourcen**: `dispose()` beendet den Tesseract-Worker
  (`services/ocr/tesseract/tesseractWorker.ts`); `ImportBillPage` ruft das
  beim Verlassen des Import-Screens auf. Canvas-Objekte werden nach jeder
  Seite sofort verkleinert/freigegeben, PDF-Dokumente/-Seiten werden über
  `loadingTask.destroy()`/`page.cleanup()` geschlossen.
- **Normalisierung**: `domain/usecases/ocrNormalization.ts`
  (`normalizeOcrText`) räumt vor dem Parsen nur Formatierungsrauschen auf
  (Zeilenenden, Zeilen-Leerraum, überzählige Leerzeilen) - Ziffern,
  Währungszeichen und die Spaltenbreite innerhalb einer Zeile werden nie
  verändert, da finanzielle Werte nie automatisch "korrigiert" werden
  dürfen. Der Bill Parser selbst braucht dagegen nur noch **ein**
  trennendes Leerzeichen zwischen Beschreibung und Betrag einer
  Kostenposition (statt zuvor zwei) - echter Tesseract-Output rekonstruiert
  Zeilen mit einfachen Leerzeichen und verliert die ursprüngliche
  Spaltenausrichtung eines gedruckten Dokuments; ohne diese Lockerung wurde
  in einem echten Browsertest keine einzige Kostenposition erkannt.
  Ausgeschlossen bleibt dabei die reine Ganzzahl-Variante des
  Betragsmusters (kein Komma/Punkt für Cent-Beträge), damit eine
  zufällige Zahl in einer anderen Zeile (z. B. „Seite 2 von 5") nicht als
  Kostenposition fehlinterpretiert wird.

**Zwei konkrete, beim echten Browsertest gefundene und behobene Bugs**
(nicht beschönigt, siehe auch PR-Beschreibung):

1. `pdfjs-dist` 6.x ruft intern `Map.prototype.getOrInsertComputed` auf
   (ein sehr neues, noch von keiner getesteten Browser-Engine
   implementiertes Map-Upsert-API) - jedes `page.render()` schlug dadurch
   mit `TypeError: ...getOrInsertComputed is not a function` fehl und
   brach damit jede gescannte PDF-Seite. Behoben durch einen minimalen,
   spec-treuen Polyfill (`services/ocr/pdf/mapUpsertPolyfill.ts`), der die
   Methode nur ergänzt, wenn sie fehlt.
2. Die Textebenen-Extraktion (`extractPdfPageTexts`) hat ursprünglich alle
   Textfragmente einer PDF-Seite ohne Zeilenumbrüche zu einer einzigen
   Zeile zusammengefügt - für den zeilenbasierten Parser dadurch praktisch
   unbrauchbar (Kostenpositionen ließen sich nicht mehr trennen). Behoben,
   indem pdfjs' eigenes `hasEOL`-Flag pro Textfragment genutzt wird, um
   Zeilenumbrüche an der richtigen Stelle wiederherzustellen.

(Abweichung von der ursprünglichen Planung: Es gibt keine separate
`calculateConfidence`-Methode auf `OCRService` – Confidence-Werte kommen
immer vom Provider selbst; ihre *Interpretation* ist zentral in
`src/constants/confidence.ts` (`getConfidenceLevel`,
`CONFIDENCE_THRESHOLDS`: hoch ≥ 0.90, mittel ≥ 0.70, sonst niedrig) und dort
für UI und Use Cases gemeinsam verfügbar.)

**Grenzen der OCR** (bewusst nicht beschönigt): Die Erkennungsqualität
hängt stark von der Dokumentqualität ab (Auflösung, Kontrast, Schräglage);
handschriftlicher Text wird nicht unterstützt; ungewöhnliche Layouts (z. B.
sehr schmale oder unregelmäßige Spaltenabstände bei Kostenpositionen)
können eine manuelle Korrektur in der Review-UI erfordern, da der Parser
die Trennung Beschreibung/Betrag u. a. an mehreren Leerzeichen erkennt; sehr
große/mehrseitige Dokumente brauchen entsprechend mehr Verarbeitungszeit.
**OCR-Ergebnisse sind und bleiben Vorschläge - sie werden erst durch die
explizite Bestätigung des Nutzers zu verbindlichen Finanzdaten.**

**Performance & Bundle-Größe**: `tesseract.js`, `pdfjs-dist` und
`LocalOCRService` werden nicht in das Haupt-Bundle kompiliert, sondern
liegen in einem eigenen, erst bei Bedarf per `import()` geladenen Chunk
(`activeOcrService.ts`); ebenso sind der PDF.js-Worker-Chunk sowie die
Tesseract-/Sprachdaten-Assets explizit von der PWA-Precache-Liste
ausgenommen (`vite.config.ts`, `globIgnores`) und werden stattdessen per
Workbox-`runtimeCaching` erst beim ersten OCR-Aufruf geladen und dauerhaft
gecacht. Ergebnis: Nutzer, die nie eine Abrechnung importieren, laden diese
mehreren MB nie herunter. Seiten eines gescannten PDFs werden einzeln
gerendert/erkannt/freigegeben statt alle gleichzeitig im Speicher zu
halten.

**Teststrategie OCR**: `LocalOCRService`s eigentliche Business-Logik
(Entscheidung Text-PDF vs. OCR, Seitenreihenfolge, Fortschritt, Abbruch,
Fehlerweitergabe) ist in `LocalOCRService.test.ts` mit gemockten
`pdf/pdfDocument.ts`- und `tesseract/tesseractWorker.ts`-Grenzen getestet,
da Tesseracts WASM-Worker in Vitest/jsdom nicht sinnvoll läuft. Die
tatsächliche Erkennung (echtes Bild, echtes Text-PDF, echtes gescanntes
mehrseitiges PDF) ist stattdessen mit einem echten Browser (Playwright)
verifiziert worden. UI-/Integrationstests, die den kompletten Import-Flow
durchspielen (`billImport.integration.test.tsx`), mocken
`activeOcrService.ts` auf `MockOCRService`, um schnell und deterministisch
zu bleiben.

**Bill Parser** (`domain/usecases/billParser.ts`, `parseBillText`): reine,
providerunabhängige Funktion, die rohen OCR-Text in ein `ParsedBill`
(`domain/models/ocr.ts`) überführt – deutsche Beträge (`1.234,56 €`,
`1234,56`, …) und Labels (Gesamtkosten/Gesamt/Summe/Betriebskosten/
Nebenkosten, Vorauszahlungen/Vorauszahlung) werden zeilenweise gesucht, ohne
ein festes Layout anzunehmen. Kategorie-Zuordnung läuft über ein
Keyword→Category-Mapping, das ausschließlich gegen die tatsächlich
vorhandenen `Category`-IDs (aus `categoryRepository`) validiert wird, mit
Fallback auf `other` bei geringer Sicherheit.

**Dokument-Speicherung**: `DocumentStorageService`
(`src/services/storage/DocumentStorageService.ts`) kapselt, *wo* die rohen
Bytes eines importierten Dokuments liegen (`save`/`get`/`delete`).
`IndexedDbDocumentStorageService` ist die V1-Implementierung – Blobs liegen
in einem eigenen `documentFiles`-Object-Store (Schema-Version 2), getrennt
vom `documents`-Store, der nur Metadaten (`Document`-Entity) hält. So landen
nie Base64-/Blob-Daten in normalen Entity-Feldern, und eine spätere
Cloud-Anbindung ersetzt nur die Storage-Implementierung.

**Review & Persistenz**: Der Import-Workflow (`src/features/bills/import/`,
Route `/abrechnungen/import`) läuft über
Select → Processing (indeterminate, keine Fake-Prozentanzeige) → Review →
Speichern. Vor dem expliziten Klick auf „Abrechnung speichern" existiert
keine fertige `Bill` – nur das `Document` wird vorab gespeichert und bei
Abbruch wieder gelöscht. Manuelle Korrektur einer erkannten
Position/eines Feldes setzt `confidence = 1` und `manuallyVerified = true`
(zentral in `ImportItemRow`/`importTypes.ts`). Die Konsistenzprüfung
(Summe der Kostenpositionen vs. erkannte Gesamtsumme) sowie
Nachzahlung/Guthaben nutzen ausschließlich die bestehende zentrale Logik aus
`domain/usecases/bills.ts` (`sumBillItems`, `calculateBillBalance`) – keine
Neuimplementierung in der UI. `BillInput`/`BillItemInput` wurden minimal um
optionale `documentId`/`confidence`/`sourceText`/`manuallyVerified` erweitert
(Default weiterhin „vollständig bestätigt" für manuelle Eingabe), sodass
`createBillWithItems` für beide Wege (manuell und Import) dieselbe,
einmal getestete Persistenz-Logik nutzt.

### Statistik (Phase 5, `src/domain/usecases/statistics/`)

Kosten müssen nach Monat, Jahr und Kategorie auswertbar sein.

```
prozentuale Veränderung = ((newValue - oldValue) / oldValue) * 100
```

Bei `oldValue === 0` muss eine sichere Sonderbehandlung erfolgen (keine
Division durch 0). Zentral implementiert in `calculateYearOverYearChange`
(nutzt intern das bereits vorhandene `calculatePercentageChange`):
`percent` ist `undefined`, wenn es kein Vorjahr gibt (kein Vergleich
möglich), und `null`, wenn das Vorjahr existiert, aber 0 € beträgt (keine
gültige Vergleichsbasis). Die UI zeigt in beiden Fällen nie eine
Prozentzahl, sondern „Noch kein Vorjahresvergleich" bzw. „Keine
Vergleichsbasis" / „—" (`formatPercentChangeOrDash` in
`src/utils/formatters.ts`).

**Datenquelle**: Die Statistik liest bewusst **direkt aus `billRepository`/
`billItemRepository`**, nicht aus der bestehenden, `CostEntry`-basierten
Dashboard-Pipeline (`getDashboardData`). `createBillWithItems` erzeugt
keine `CostEntry`-Einträge, importierte/erfasste Abrechnungen fließen also
nicht in die alten Dashboard-Summen ein – die beiden Pipelines sind aktuell
bewusst getrennte, parallele Datenquellen. Für Phase 5 ergeben die unten
beschriebenen Bill-vs-BillItems-Regeln nur auf Basis der Bills selbst Sinn,
daher diese explizite Entscheidung.

**Keine doppelte Zählung (No double counting)**: `Bill.totalAmount` ist die
alleinige Quelle für „was hat dieses Jahr gekostet"
(`StatisticsSummary.totalAmount`, Summe von `Bill.totalAmount` pro Jahr).
Die Summe der `BillItem`-Beträge (`itemizedAmount`) wird **niemals** zu
`totalAmount` addiert – sie dient ausschließlich der Kategorien-/
Positions-Aufschlüsselung. Eine Differenz zwischen beiden
(`unassignedDifference = totalAmount - itemizedAmount`) wird transparent
angezeigt statt still korrigiert (z. B. „Gesamtkosten: 1.940 €,
Kostenpositionen: 1.850 €, nicht zugeordnete Differenz: 90 €" in
`BillDiscrepancyNotice`). BillItems ohne `categoryId` verschwinden nicht,
sondern laufen unter „Nicht zugeordnet".

**Monatsdaten**: Ein Bill wird einem Kalendermonat nur zugeordnet, wenn
`periodStart` und `periodEnd` vollständig innerhalb desselben Monats liegen
(`calculateMonthlyStatistics`). Eine typische Jahresabrechnung
(`periodStart` = 1. Jan, `periodEnd` = 31. Dez) wird bewusst **keinem**
Monat zugeordnet – eine gleichmäßige Verteilung über 12 Monate würde eine
Genauigkeit vortäuschen, die die Daten nicht hergeben. Fehlen zuordenbare
Monate, zeigt die UI stattdessen „Für dieses Jahr liegen noch nicht
genügend monatlich zuordenbare Daten vor." Der Monatsdurchschnitt
(`calculateAverageMonthlyCost`) wird ausschließlich über Monate mit echten
Daten gebildet, nie als `Jahresgesamt / 12`.

**Kosten pro m²**: In Phase 5 **nicht implementiert**. `Property` hat kein
Flächenfeld und wird aktuell nirgends in der UI verwaltet; ein verstecktes
Pflichtfeld oder eine geschätzte Fläche wäre laut Datenqualitätsregeln
verboten. Die Fallback-Option „Feature zunächst nicht anzeigen" wird
genutzt.

**Architektur**: `UI (StatisticsPage + Charts) → useStatisticsData-Hook →
calculateStatistics.ts (+ calculateYearComparison/-CategoryStatistics/
-TopCostPositions/-MonthlyStatistics) → billRepository/billItemRepository/
categoryRepository → IndexedDB`. `getStatisticsData()` lädt Bills/BillItems/
Categories genau einmal und leitet daraus alle Ansichten (Summary,
Kategorien, Top-Positionen, Monats- und Mehrjahresvergleich) ab – keine
mehrfachen IndexedDB-Zugriffe pro Seitenaufruf. Charts sind wie im
Dashboard handgerollte SVG/CSS-Komponenten (keine neue Chart-Library
nötig); Balkendiagramme tragen zusätzlich eine `sr-only`-Textliste als
barrierefreie Alternativdarstellung.

**Dashboard-Integration**: Bewusst (noch) keine. Das bestehende Dashboard
rechnet weiterhin ausschließlich über die `CostEntry`-basierte
`getDashboardData()`-Pipeline; Phase 5 erweitert das Dashboard nicht um
eine zweite, `Bill`-basierte Kostenanzeige, da beide Pipelines aktuell
unterschiedliche Gesamtsummen liefern können (siehe „Datenquelle" oben) und
das für Nutzer wie ein Fehler wirken könnte. Die Statistik ist in Phase 5
ausschließlich über `/statistik` erreichbar. Eine Zusammenführung beider
Kostenquellen ist ein eigenes, künftiges Arbeitspaket.

**Teststrategie**: Reine Kalkulationsfunktionen sind co-located getestet
(z. B. `calculateCategoryStatistics.ts` über `src/test/
statistics.usecase.test.ts`, analog zum bestehenden `dashboard.test.ts`-
Muster); dieselbe Datei enthält auch den IndexedDB-Integrationstest
(Fixtures → `getStatisticsData` → Ergebnis). `StatisticsPage.test.tsx`
mockt die Use-Case-Schicht für UI-Zustände (Loading/Error/Empty/Daten,
Jahreswechsel); `statisticsPage.integration.test.tsx` prüft den vollen Weg
IndexedDB-Fixtures → Use Case → gerenderte Seite ohne Mocks.

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
