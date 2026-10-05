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
│   ├── costOverview/
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

Seit Phase 6 sind `domain/usecases/reminders/`, `services/notifications/`
und `features/reminders/` befüllt (siehe „Vertragsmanagement &
Erinnerungen"-Abschnitt unten).

Seit Phase 7 ist `features/documents/` befüllt (siehe
„Dokumentenverwaltung"-Abschnitt unten). `domain/usecases/documents.ts`,
`services/storage/` und der `documents`/`documentFiles`-Store bestanden
bereits seit Phase 4 (Bill-Import) und wurden in Phase 7 erweitert statt
neu gebaut.

Seit Phase 8 ist `features/waste/` befüllt (siehe
„Müllkostenverwaltung"-Abschnitt unten). Die `WasteCost`-Entity und ihr
IndexedDB-Store bestanden bereits seit Phase 2 und wurden unverändert
weiterverwendet (bis auf eine additive Erweiterung von `WasteCategory` um
`bulky`/„Sperrmüll" – kein Feld, keine Migration).

Seit Phase 9 ist `domain/usecases/centralCosts.ts` sowie
`features/costOverview/` neu hinzugekommen (siehe „Zentrale
Kostenübersicht"-Abschnitt unten) – ein reines Read-Model-Modul ohne neue
Entity und ohne neuen IndexedDB-Store; `DATABASE_VERSION` bleibt bei 2.

Phase 10 (siehe „Datenqualität, Erreichbarkeit & technische
Konsolidierung"-Abschnitt unten) hat keine Ordnerstruktur verändert – nur
ein additives `Bill`-Feld, eine deaktivierte Schreibstelle in
`database/repository.ts` und eine ergänzte Settings-Navigation.
`DATABASE_VERSION` bleibt bei 2.

Seit Phase 14B gibt es die lokalen Finanz-Entities (`Account`,
`Transaction`, `ImportBatch`, `CategoryRule`, `SavingsGoal`) samt Stores und
`domain/repositories/financeRepositories.ts`; `DATABASE_VERSION` ist **3**
(siehe „Finanztracker"-Abschnitt unten). Seit Phase 14D liegen der
Buchungs-Import und die Buchungsseite unter `features/transactions/`.

## Domain Models

Mindestens folgende Entities:

`User`, `Property`, `Bill`, `BillItem`, `Category`, `CostEntry`,
`WasteCost`, `Contract`, `Reminder`, `Document`; seit Phase 14 zusätzlich
`Account`, `Transaction`, `ImportBatch`, `CategoryRule`, `SavingsGoal`
(nur lokal, nicht sync-fähig).

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

### Vertragsmanagement & Erinnerungen (Phase 6, `src/domain/usecases/reminders/`)

Erweitert die bestehende Vertragsverwaltung (`domain/usecases/contracts.ts`,
`features/contracts/`) um eine automatische Erinnerungs-Engine – keine
zweite Contract-/Reminder-Implementierung, sondern eine Erweiterung der
bestehenden.

**Vertragsstatus**: zentral in `getContractStatus()`
(`domain/usecases/reminders/contractStatus.ts`), nie im UI dupliziert.
Grenzwerte `CONTRACT_URGENT_DAYS = 30` / `CONTRACT_UPCOMING_DAYS = 90`
(`src/constants/contracts.ts`) sind die einzige Quelle für diese Zahlen.
`expired` (Frist bereits vorbei, Tage < 0) → `urgent` (0–30 Tage) →
`upcoming` (31–90 Tage) → `active` (> 90 Tage, oder gar keine
Kündigungsfrist bekannt).

**Reminder-Engine**: `generateContractReminders()`
(`domain/usecases/reminders/generateContractReminders.ts`) wird bei jedem
`createContract`/`updateContract` automatisch aufgerufen (siehe
`domain/usecases/contracts.ts`) und ist **idempotent** – wiederholtes
Aufrufen erzeugt nie doppelte Reminder. Sie berechnet die
90/30/7/1-Tage-Reminder (`calculateReminderDates.ts`, konfigurierbar über
die Settings, siehe unten) relativ zu `Contract.calculatedCancellationDate`
und gleicht sie mit den bereits gespeicherten Remindern ab:

- ein noch passender, unveränderter Reminder bleibt unverändert
- ändert sich das Kündigungsdatum (z. B. durch ein bearbeitetes
  Vertragsende), wird der bestehende Reminder mit gleichem Intervall **an
  Ort und Stelle aktualisiert** (gleiche `id`), nie gelöscht und neu
  angelegt
- ein nicht mehr benötigtes Intervall (deaktiviert oder Vertrag ohne
  Kündigungsdatum/Reminder deaktiviert) wird gelöscht
- ein bereits **erledigter** (`status: 'dismissed'`) Reminder ist
  historisch und wird von einer Neuberechnung nie angefasst

Beim Löschen eines Vertrags (`deleteContract`) werden über
`removeContractReminders()` alle zugehörigen Reminder mit gelöscht – keine
verwaisten Reminder auf `/erinnerungen`.

**Reminder-Identifikation**: `Reminder` bekam ein neues, **optionales**
Feld `offsetDays` (wie viele Tage vor dem Zieldatum der Reminder feuert) –
additiv, ohne IndexedDB-Schema-/Versionswechsel (Objektspeicher sind
schemalos pro Wert; `DATABASE_VERSION` bleibt bei 2). Ältere Datensätze
ohne dieses Feld funktionieren unverändert weiter (siehe Testfall
„backward compatibility" in `src/test/reminders.usecase.test.ts`).

**Erinnerungs-Intervalle (Settings)**: welche der vier Standardintervalle
aktiv sind, wird in `localStorage` gespeichert
(`domain/usecases/reminders/reminderSettings.ts`), nicht in IndexedDB –
eine Handvoll Booleans ist keine synchronisationspflichtige Fachdatensicht
und rechtfertigt keinen eigenen Object Store samt Migration. Fällt auf
„alle aktiv" zurück, wenn `localStorage` fehlt oder der Wert defekt ist.

**Erinnerungsseite** (`/erinnerungen`, `src/features/reminders/`):
`getRemindersOverview()` lädt Reminder/Contracts/Categories genau einmal
und gruppiert in Überfällig/Heute/In 7 Tagen/Später (jeweils
chronologisch), gefiltert auf nicht-erledigte Reminder mit noch
existierendem (nicht gelöschtem) Vertrag. „Als erledigt markieren" ruft
`dismissReminder()`.

**Dashboard**: Die bestehende „Vertragsfristen"-Karte
(`UpcomingContractsCard`) wurde zu „Nächste Vertragsfristen" umbenannt und
ihre CTA zeigt jetzt auf `/erinnerungen` statt `/vertraege` – ihre
Datengrundlage (`getUpcomingContractDeadlines` in
`domain/usecases/dashboard.ts`, direkt aus `Contract` abgeleitet) blieb
unverändert. **Wichtig**: Diese Erweiterung rührt die
`CostEntry`/`Bill`/`BillItem`/Statistics-Pipelines nicht an – siehe den
PR-#7-Cleanup oben, dieselbe Regel gilt weiterhin.

**Notifications**: `NotificationService`-Abstraktion
(`src/services/notifications/`, `BrowserNotificationService` als einzige
Implementierung, analog `activeOcrService.ts`). Eine lokale PWA kann eine
zeitgesteuerte Zustellung ohne aktive App **nicht zusichern** – deshalb
prüft `notifyDueReminders()` (`domain/usecases/reminders/
checkDueReminders.ts`) beim App-Start (`useDueReminderNotifications` in
`App.tsx`) fällige/überfällige Reminder und versucht eine lokale
Notification, statt einen nicht einlösbaren Hintergrund-Job zu behaupten.
Ein erfolgreich benachrichtigter Reminder wird auf `status: 'sent'`
gesetzt, damit er nicht bei jedem App-Start erneut benachrichtigt. Die
Berechtigung wird nie automatisch beim Start angefragt, sondern nur über
einen expliziten Button in den Einstellungen (`NotificationSettings`).

**Teststrategie**: `contractStatus.test.ts`/`calculateReminderDates.test.ts`
(reine Funktionen, alle Grenzfälle aus der Spezifikation),
`reminders.usecase.test.ts` (Idempotenz, Contract-Update-Reconciliation,
Contract-Delete-Cleanup, IndexedDB-Integration, Altdaten-Kompatibilität),
`checkDueReminders.test.ts` (Notification-Orchestrierung mit einem
Fake-`NotificationService`), `RemindersPage.test.tsx`/
`contracts.ui.test.tsx`/`SettingsPage.tsx`-Tests für die UI.

**Suche, Filter & Sortierung (Phase 12D, `features/contracts/
contractFilters.ts`)**: Übernimmt unverändert das bereits etablierte Muster
von `billFilters.ts`/`documentFilters.ts`/`costFilters.ts` – eine reine
`filterAndSort*()`-Funktion über die bereits geladene Liste, angewandt in
der Page-Komponente (kein erneuter IndexedDB-Zugriff pro Tastendruck/
Filterwechsel). Suche durchsucht `provider`/`tariff` sowie den Namen der
verknüpften `Category` (analog `costFilters.ts`). Der Status-Filter
(Aktiv/Nicht aktiv/Alle) nutzt ausschließlich die bereits bestehende
`isContractActive()` (`domain/usecases/contracts.ts`) – keine zweite,
lokale Definition von „aktiv". Die vormals in `useContracts.ts` inline
berechnete Standard-Sortierung (`sortByUpcomingDeadline` – nächste
Kündigungsfrist zuerst, sonst alphabetisch nach Anbieter) wurde unverändert
nach `contractFilters.ts` verschoben und bleibt der Default (`sort:
'upcoming_deadline'`), damit sich die Reihenfolge einer ungefilterten Liste
durch diese Phase nicht ändert. Bewusst **kein** separater
„Kündigungsdatum auf-/absteigend"-Sortierpunkt neben diesem Default, da
beides zu verwechselbar nah beieinander läge. Ein „Filter zurücksetzen"-
Button (bislang kein bestehendes Pattern dafür) setzt Suche/Status/
Kategorie/Erinnerung/Sortierung gemeinsam auf die Defaults zurück und ist
deaktiviert, solange ohnehin schon alles auf „Alle" steht.

### Dokumentenverwaltung (Phase 7, `domain/usecases/documents.ts`,
`features/documents/`)

Zentralisiert die bereits seit Phase 4 bestehende Dokumentablage
(`Document`-Entity, `documentFiles`-Blob-Store, `DocumentStorageService`) zu
einer eigenständigen, durchsuchbaren Verwaltung – **keine** neue Entity,
**keine** neue IndexedDB-Version, **keine** Many-to-Many-Verknüpfung.
`Bill.documentId`/`Contract.documentId`/`WasteCost.documentId` bleiben die
einzige Verknüpfungsart (1:1 pro Dokument).

**Architektur**: `UI (DocumentsPage/DocumentDetailPage) → domain/usecases/
documents.ts → documentRepository/documentStorageService → IndexedDB
(documents-Store für Metadaten, documentFiles-Store für Blobs)`. Wie bei
Contracts/Bills gibt es keine eigene "Service"-Klasse, sondern ein
Use-Case-Modul aus Funktionen – konsistent mit dem übrigen Projektstil.

**Reference-Management (zentral, `documents.ts`)**:
`getLinkedEntity()`/`isDocumentReferenced()` prüfen `Bill`/`Contract`/
`WasteCost` generisch auf ein passendes `documentId` (ein Dokument ist in V1
nie an mehr als eine Entity gebunden, die Prüfung deckt trotzdem den
generischen Fall ab). `deleteDocumentIfUnreferenced()` wird beim Löschen
der **referenzierenden** Entity aufgerufen (`deleteBillWithItems`,
`deleteContract`) – vorher bestand hier für Bills sogar eine Lücke (ein
gelöschtes Bill ließ sein Dokument verwaist zurück), die mit dieser
zentralen Funktion behoben wurde. `deleteDocumentAndClearReferences()` ist
der Gegenpart für das explizite Löschen **eines Dokuments** direkt in der
Dokumentenverwaltung (`/dokumente/:id`) – hier wird das Dokument immer
gelöscht, aber die verweisende Entity wird um `documentId` bereinigt (bei
Bills zusätzlich `ocrStatus` zurückgesetzt), damit nie eine tote Referenz
übrig bleibt.

**Contract-Dokumente**: `Contract.documentId` war als Feld bereits
vorhanden, aber ungenutzt – es gab keinen Upload-Weg. Phase 7 ergänzt
`setContractDocument()`/`removeContractDocument()` sowie einen Upload-/
Anzeige-/Löschen-Block auf `ContractDetailPage` (analog zum bestehenden
Bill-Dokument-Block). `ContractInput` bekam bewusst **kein** `documentId`-
Feld – ein Dokument wird über die Detailseite angehängt, nicht über das
Formular, damit ein normaler `updateContract()`-Aufruf ein bereits
angehängtes Dokument nie versehentlich überschreibt
(`buildCandidate()` übernimmt `documentId` explizit vom bestehenden
Datensatz).

**WasteCost**: `WasteCost.documentId` existiert im Domain-Modell, aber es
gibt in Phase 7 weiterhin **keine** WasteCost-UI (`features/waste/` bleibt
`.gitkeep`) – das Anlegen eines Aufbaus einer vollständigen
Müllkosten-Verwaltung wäre eine eigene, hier nicht beauftragte Phase (siehe
„Müllkostenverwaltung" weiter unten – dort seit Phase 8 umgesetzt). Die
generische Referenzprüfung deckt WasteCost dennoch mit ab, falls/wenn diese
UI einmal entsteht.

**Checksum**: `calculateChecksum()` nutzt die im Browser eingebaute Web
Crypto API (`crypto.subtle.digest('SHA-256', …)`) – keine zusätzliche
Abhängigkeit. Wird beim Speichern (`saveDocumentFile`) und beim Ersetzen
(`replaceDocumentFile`) gesetzt.

**Datei ersetzen** (`replaceDocumentFile`): speichert die neue Datei unter
einem neuen Storage-Key, aktualisiert Metadaten/Checksum, setzt
`ocrStatus` auf `not_started` zurück (der bisherige OCR-Text bezieht sich
nicht mehr auf den neuen Inhalt) und löscht den alten Blob erst, **nachdem**
der neue Datensatz sicher gespeichert ist – ein Fehler mittendrin lässt nie
ein Dokument ganz ohne lesbare Datei zurück.

**Liste/Suche/Filter/Sortierung** (`/dokumente`): `listDocumentsOverview()`
lädt alle Dokument-**Metadaten** (nie die Blobs – die Liste bleibt schnell
auch bei vielen/großen Dateien) einmal zusammen mit ihrer verknüpften
Entity. Suche/Filter/Sortierung (`features/documents/documentFilters.ts`)
sind reine, lokale Funktionen über die bereits geladene Liste – keine
externe Suche, keine wiederholten IndexedDB-Zugriffe pro Tastenanschlag.

**Detailseite** (`/dokumente/:id`): zeigt Metadaten, OCR-Status/-Text und
die verknüpfte Entity (klickbar zu Bill/Contract/WasteCost, sofern eine
Detailseite existiert – seit Phase 8 auch für WasteCost, siehe unten). Die
Vorschau (`DocumentViewer`, seit Phase 4 vorhanden) lädt den Blob erst bei
Klick auf „Vorschau anzeigen" – nie automatisch beim Öffnen der Seite.

**Teststrategie**: `documents.test.ts` (Checksum, Replace, Validierung),
`documentLifecycle.usecase.test.ts` (Reference-Detection, Cascade-Löschung
bei Bill/Contract/WasteCost, `deleteDocumentAndClearReferences`,
Overview-Listing), `documents.ui.test.tsx` (Liste, Suche, Filter, Detail,
Löschen mit/ohne Bestätigung), plus Erweiterungen in `contracts.ui.test.tsx`/
`bills.ui.test.tsx`/`DashboardPage.test.tsx`/`SettingsPage.test.tsx` für
die jeweiligen Integrationen.

**Bugfix in Phase 8**: `PageHeader`s `<h1>`/`<p>` hatten kein
`overflow-wrap`/`break-words` – ein langer, leerzeichenloser Titel (z. B.
ein Dateiname wie `gebuehrenbescheid.pdf`) lief dadurch auf Mobile über den
Viewport hinaus (horizontales Scrollen). Betraf potenziell jede Seite mit
einem `PageHeader`, wurde aber erst durch einen realistisch langen
Dateinamen in der Phase-8-QA sichtbar; behoben durch `break-words` auf
Titel und Untertitel.

### Müllkostenverwaltung (Phase 8, `domain/usecases/wasteCosts.ts`,
`features/waste/`)

Macht die bereits seit Phase 2 bestehende `WasteCost`-Entity und ihren
IndexedDB-Store nutzbar – **keine** neue Entity, **keine** neue
IndexedDB-Version. Einzige additive Domain-Änderung: `WasteCategory` wurde
um `'bulky'` (Sperrmüll) ergänzt (reiner String-Literal-Typ, kein Feld,
kein Schema-Wechsel).

**Kategorien**: zentral in `src/constants/waste.ts`
(`WASTE_CATEGORY_LABELS`/`WASTE_CATEGORY_OPTIONS`), nicht im generischen
`Category`-Entity-System (das ist für Cost-/Bill-Kategorien mit Icon
gedacht, passt fachlich nicht zu den sechs fest vorgegebenen
Müllkosten-Kategorien) und nicht mehrfach in UI-Komponenten hartkodiert.

**Architektur**: `UI (WasteCostsPage/WasteCostFormPage/
WasteCostDetailPage) → domain/usecases/wasteCosts.ts → wasteCostRepository
→ IndexedDB`. Wie bei Bills/Contracts/Costs ein reines Funktions-Use-Case-
Modul, keine Service-Klasse. `getWasteCostSummary()` reicht die
Jahresvergleichslogik an das bereits vorhandene, getestete
`calculateYearOverYearChange()` (aus `domain/usecases/statistics/
calculateYearComparison.ts`) durch, statt die 0-Vorjahr-/kein-Vorjahr-
Sonderfälle ein zweites Mal zu implementieren.

**Performance**: `listWasteCosts()` lädt alle Einträge genau einmal;
Jahre, Jahresfilterung und die Jahres-/Kategoriensumme
(`getWasteCostYears`/`listWasteCostsByYear`/`getWasteCostSummary`) sind
reine Funktionen, die im Hook (`useWasteCosts`) per `useMemo` über die
bereits geladene Liste laufen – ein Jahreswechsel im UI löst keinen
erneuten IndexedDB-Zugriff aus.

**Dokumentintegration**: Anders als bei Contract (wo das Dokument über
eine separate `setContractDocument()`/`removeContractDocument()`-Aktion
auf der Detailseite angehängt wird) ist das Dokument bei WasteCost ein
ganz normales Feld von `WasteCostInput` – es wird direkt im Erfassen-/
Bearbeiten-Formular gewählt (neue Datei hochladen **oder** ein bereits
vorhandenes, noch nicht verknüpftes Dokument auswählen) und zusammen mit
den übrigen Feldern gespeichert. `updateWasteCost()` vergleicht dafür den
alten mit dem neuen `documentId` und räumt ein geändertes oder entferntes
Dokument über die bestehende, referenzgeprüfte
`deleteDocumentIfUnreferenced()` auf – nie wird ein Dokument gelöscht, das
noch anderweitig gebraucht wird, und nie bleibt ein nicht mehr
referenziertes Dokument liegen. `deleteWasteCost()` räumt beim Löschen des
gesamten Eintrags ebenso auf. Ein neu hochgeladenes, aber dann am
Speichern gescheitertes Dokument wird in `WasteCostFormPage` best-effort
zurückgerollt (kein verwaistes Dokument bei einem fehlgeschlagenen
Speichervorgang).

**Dashboard**: eine eigene, kompakte Karte (`WasteCostsSummaryCard`) nutzt
ausschließlich `getWasteCostSummary()` – keine eigene Berechnungslogik im
Dashboard-Code. `getDashboardData()` lädt `wasteCostRepository.getAll()`
zusätzlich zu den bestehenden Repositories und reicht das Ergebnis nur
durch; die `CostEntry`-basierte Dashboard-Pipeline bleibt unangetastet.

**Statistik-Integration**: bewusst (noch) nicht vorgenommen. Die
Statistik-Pipeline (Phase 5) liest bewusst ausschließlich aus
`billRepository`/`billItemRepository`, um Doppelzählung zu vermeiden (siehe
„Statistik"-Abschnitt oben). `WasteCost` dort einfach zusätzlich in
dieselbe Summe zu addieren, würde dieses Prinzip verletzen und wäre eine
unsaubere Erweiterung ohne konzeptionelle Anpassung der Datenquellen-
Trennung. Müllkosten sind in Phase 8 daher ausschließlich über `/muell`
und die Dashboard-Karte sichtbar; eine spätere, bewusste Zusammenführung
aller Kostenquellen (Bills, CostEntry, WasteCost) für die Statistik ist ein
eigenes, künftiges Arbeitspaket.

**Teststrategie**: `wasteCosts.usecase.test.ts` (Validierung, CRUD,
Jahresfilter, Jahres-/Kategoriensumme, Jahresvergleich inkl.
0-Vorjahr-/kein-Vorjahr-Fälle), Erweiterung von
`documentLifecycle.usecase.test.ts` um WasteCost+Document-Fälle (create→
read/update/delete, Dokument wechseln/entfernen, Referenzprüfung beim
Löschen), `waste.ui.test.tsx` (Liste, Jahresfilter, Empty States, Erfassen,
Bearbeiten, Löschen, Dokument hochladen/auswählen/öffnen), plus
Erweiterungen in `DashboardPage.test.tsx`/`SettingsPage.test.tsx`.

### Zentrale Kostenübersicht (Phase 9, `domain/usecases/centralCosts.ts`,
`features/costOverview/`)

Bis Phase 8 verwendeten Dashboard (`CostEntry`-Pipeline) und Statistik
(`Bill`/`BillItem`-Pipeline) unterschiedliche Datenquellen für „Kosten
dieses Jahres" – für dasselbe Jahr konnten dadurch zwei unterschiedliche
Zahlen angezeigt werden, ohne dass für Nutzer erkennbar war, ob sich z. B.
Müllkosten bereits in einer Jahressumme befinden. Phase 9 schafft dafür
eine **zentrale Kostenprojektion** – ausdrücklich ein **Read Model**, das
zur Laufzeit aus bereits bestehenden Entities berechnet wird, **keine**
neue persistierte Entity, **kein** neuer IndexedDB-Store, **keine**
Datenbankmigration (`DATABASE_VERSION` bleibt bei 2). `Bill`, `WasteCost`
und `CostEntry` bleiben jeweils ihre eigene Source of Truth; nichts wird
dupliziert gespeichert.

**Source-of-Truth-Regeln** (verbindlich, siehe `centralCosts.ts`):
`Bill.totalAmount` für Abrechnungen (niemals zusätzlich mit der
BillItem-Summe addiert – dieselbe Regel wie in der Statistik, siehe oben),
`WasteCost.amount` für Müllkosten, `CostEntry.amount` für manuell erfasste
Kosten. `Contract.monthlyCost`/`yearlyCost` fließen **bewusst nicht** ein –
das sind vertragliche/laufende Konditionen, keine tatsächlich angefallenen
Kosten; `centralCosts.ts` importiert `contractRepository` an keiner Stelle.
(Seit Phase 11E gibt es dafür eine separate, nie in diese Projektion
eingerechnete Anzeige – siehe `calculateRunningContractCosts()` in
`domain/usecases/contracts.ts`, auf Dashboard und `/kostenuebersicht`.)

**Kernbausteine**: `buildCentralCostItems(bills, wasteCosts, costEntries)`
bildet aus jeder `Bill` (bei `Bill.totalAmount`, nie ihren `BillItem`s),
jedem `WasteCost` und jedem `CostEntry` **ohne** bereits gesetzte `billId`
genau ein `CentralCostItem`. `getCentralCostsByYear`/`-ByMonth`/
`-ByCategory`/`getCentralCostSummary` leiten daraus Jahres-, Monats- und
Kategorieansichten ab; `getCentralCostData(year)` lädt Bills/BillItems/
WasteCosts/CostEntries/Categories genau einmal (analog `getStatisticsData`)
und ruft die reinen Funktionen darauf auf – keine mehrfachen
IndexedDB-Zugriffe pro Karte/Diagramm.

**CostEntry-Deduplizierung**: Ein `CostEntry` mit bereits gesetzter
`billId` gilt als durch diese `Bill` bereits abgedeckt und wird von der
zentralen Projektion **ausgeschlossen** statt zusätzlich gezählt. Ohne
gesetzte `billId` erfolgt **keine** heuristische Zuordnung anhand von
Betrag/Datum/Beschreibung – dafür existiert aktuell ohnehin kein
schreibender Code-Pfad, der `billId` automatisch setzt (`createCostEntry`
lässt es weiterhin unangetastet).

**Doppelzählung wird erkannt, nie automatisch aufgelöst**:
`detectCostAggregationWarnings()` prüft, ob für ein Jahr gleichzeitig ein
`WasteCost`-Eintrag **und** entweder ein `BillItem` mit
`categoryId === 'waste'` oder ein nicht-Bill-verknüpfter `CostEntry` mit
`categoryId === 'waste'` existieren, und erzeugt dann eine
`CostAggregationWarning` (`possible_duplicate_waste` bzw.
`possible_duplicate_manual_entry`). Es wird dabei **nichts** gelöscht,
verrechnet oder aus der Summe entfernt – die Kostenübersicht zeigt die
Warnung transparent an und überlässt die Prüfung dem Nutzer.

**Kategorien**: `WasteCost` wird in der zentralen Projektion der
bestehenden, bereits geseedeten zentralen `Category` mit der ID `'waste'`
zugeordnet (`CENTRAL_WASTE_CATEGORY_ID`) – keine neue, synthetische
Kategorie. Die ursprüngliche, granularere `WasteCategory`
(residual/organic/…) geht dabei nicht verloren, sondern bleibt zusätzlich
als `wasteCategory` auf dem einzelnen `CentralCostItem` erhalten. Das
zweite Kategoriesystem (`WasteCategory`) wird dadurch **nicht** abgeschafft
oder umgebaut.

**Zeitliche Zuordnung**: Eine `Bill` wird – wie in der Statistik – nur
einem Kalendermonat zugeordnet, wenn ihr Zeitraum vollständig in einem
Monat liegt (`getCentralCostsByMonth` nutzt dafür direkt die bestehende
`calculateMonthlyStatistics`-Logik wieder). Ein `CostEntry` wird über sein
eigenes Datum zugeordnet. Ein `WasteCost` hat **keine** Monatsgranularität
und wird **nie** künstlich auf Monate verteilt – er fließt ausschließlich
in `CentralCostSummary.unallocatedForMonthView` ein
(`= totalAmount - monthlyAttributedTotal`), das die Kostenübersicht auf
`/kostenuebersicht` transparent unterhalb des Monatsdiagramms ausweist,
statt eine Genauigkeit vorzutäuschen, die die Daten nicht hergeben.

**Neue Seite** (`/kostenuebersicht`, `src/features/costOverview/`):
Jahresauswahl, Gesamtkosten mit Aufteilung Abrechnungen/Müll/Manuell
(`CostOverviewSummaryCard`), Warnungen (`CostOverviewWarnings`,
rendert nichts, wenn `warnings` leer ist), Monatsdiagramm mit
Unallocated-Hinweis (`CostOverviewMonthlyChart`) und Kategorieaufschlüsselung
(`CostOverviewCategoryChart`). Erreichbar über „Mehr" (Settings) und einen
„Kostenübersicht →"-Link direkt über den Kosten-Karten auf dem Dashboard –
bewusst **nicht** in der fünfteiligen Bottom-Nav/Sidebar (Home, Statistik,
Abrechnungen, Verträge, Mehr bleibt unverändert).

**Dashboard-Integration**: `getDashboardData()`
(`domain/usecases/dashboard.ts`) berechnet `currentMonthCost`/
`previousMonthCost`/`currentYearCost`/`previousYearCost`/`monthlyCosts`/
`categoryCosts` jetzt über dieselbe zentrale Projektion (Bill + WasteCost +
CostEntry) statt ausschließlich über `CostEntry` – das behebt die
eingangs beschriebene Diskrepanz. Die bereits vorhandenen, weiterhin
exportierten und eigenständig getesteten reinen Funktionen
`getMonthlyCosts`/`getYearlyCosts`/`getCostsByCategory` (CostEntry-only)
bleiben unverändert bestehen, werden von `getDashboardData()` selbst aber
nicht mehr aufgerufen. Die bestehende `WasteCostsSummaryCard` bleibt
erhalten (kein Rückbau einer funktionierenden, getesteten Karte), bekommt
aber den Hinweis „Bereits in den Jahreskosten oben enthalten.", damit nie
der Eindruck entsteht, die dort gezeigte Müllkosten-Zahl käme zur
Jahreskosten-Kachel addiert obendrauf.

**Statistik-Integration**: bewusst **nicht** vorgenommen. `/statistik`
liest weiterhin ausschließlich aus `billRepository`/`billItemRepository`
(siehe „Statistik"-Abschnitt oben) – diese Pipeline demonstriert exakt die
gleichen Bill-only-Garantien, die die zentrale Projektion für Bills
übernimmt, und ein Umbau hätte ein unnötiges Regressionsrisiko für eine
bereits fein austarierte, eigenständig getestete Fläche bedeutet, ohne vom
Auftrag zwingend gefordert zu sein („nur wenn dadurch die bestehenden
fachlichen Regeln exakt erhalten bleiben"). Eine spätere, bewusste
Zusammenführung ist ein eigenes, zukünftiges Arbeitspaket.

**Teststrategie**: `centralCosts.usecase.test.ts` (Source-of-Truth pro
Quelle, Ausschluss von BillItems aus der Summe, Bill-verknüpfte
CostEntry-Deduplizierung, Monats-/Jahreslogik inkl. Nicht-Verteilung von
Jahresabrechnungen und WasteCost, Kategorie-Mapping, Warnungserkennung
inkl. „erzeugt keine Warnung, wenn kein WasteCost existiert"-Gegenprobe,
IndexedDB-Integrationstest), `CostOverviewPage.test.tsx` (gemockte
Use-Case-Schicht für UI-Zustände), `costOverviewPage.integration.test.tsx`
(IndexedDB-Fixtures → Use Case → gerenderte Seite, inkl. der
Doppelzählungs-Warnung), Erweiterungen in `dashboard.test.ts`/
`DashboardPage.test.tsx`/`SettingsPage.test.tsx` für die neue Quelle bzw.
den neuen Link.

### Phase 10 – Datenqualität, Erreichbarkeit & technische Konsolidierung

**Bill**: `Bill.totalAmount` bleibt die alleinige Quelle für Aggregationen
(Statistik, `centralCosts.ts`) – unverändert. Neu ist das additive, optionale
Feld `Bill.totalAmountConfirmed?: boolean`: `true` kennzeichnet einen
bewusst bestätigten Gesamtbetrag (z. B. aus einem geprüften Import), der
legitim von der Summe der Positionen abweichen darf; `false`/`undefined`
bedeutet, `totalAmount` ist einfach aus den Positionen abgeleitet, wie bei
einer normalen manuellen Abrechnung. `createBillWithItems` setzt das Feld
automatisch anhand von `input.totalAmount`. `updateBillWithItems`
überschreibt einen bestätigten Betrag beim Bearbeiten **nicht** mehr
automatisch – auch nicht, wenn sich Kostenpositionen ändern. Eine
Neuberechnung erfolgt ausschließlich über die explizite Nutzeraktion „Aus
Positionen neu berechnen" (`BillInput.recalculateTotalAmount`), nie über
einen impliziten Zahlenvergleich. `BillFormPage` zeigt bei einer bestätigten
Bill bestätigten Betrag, aktuelle Positionssumme und Differenz nebeneinander
an, bevor der Nutzer sich entscheidet.

**SyncQueue**: Die beiden produktiven Aufrufe von `enqueueSyncChange()` in
`database/repository.ts` (`save()`/`delete()`) wurden entfernt, da bislang
kein Consumer existiert und die Queue sonst unbegrenzt und folgenlos
wächst. Der `syncQueue`-Store, `SyncQueueItem`, sowie
`getPendingSyncChanges()`/`removeSyncChange()` bleiben als vorbereitete
Infrastruktur bestehen. Die eigentlichen Sync-Metadaten (`updatedAt`,
`syncVersion`, `deletedAt`) werden von `withSyncMetadata()` weiterhin
unverändert gepflegt – unabhängig von der Queue. *(Überholt seit Phase
13B: `save()`/`delete()` markieren wieder, jetzt mit deterministischem,
begrenztem Schlüssel und einem Consumer – siehe „Sync“.)*

**Settings**: `/kosten` (bislang ohne dauerhaften Navigationszugang) ist
jetzt in `SettingsPage.tsx` verlinkt, im bestehenden Muster der anderen
sekundären Bereiche. Der zuvor funktionslose „Synchronisierung"-Menüpunkt
wurde entfernt, statt eine nicht existierende Funktion anzudeuten.

**Tote Felder**: `CostEntry.contractId` und die ungenutzten
`CostSource`-Varianten `'bill'`/`'contract'`/`'import'` (nur `'manual'`
wird tatsächlich verwendet) bleiben unverändert bestehen. Ihre künftige
Bedeutung ist unklar – möglicherweise für eine nie gebaute, zu `billId`
symmetrische Verknüpfung/Dedup-Logik gegenüber `Contract` vorgesehen –,
daher werden sie bewusst nicht entfernt.

### Backup Export (Phase 12B, `domain/usecases/backup.ts`)

Ein vollständiger, lokaler Backup-Export als eine herunterladbare JSON-Datei
(„Mehr" → „Daten & Backup" → „Backup exportieren") – ausschließlich
lesend, verändert/löscht/komprimiert nie etwas. Das Wiederherstellen dieser
Datei ist seit Phase 12C möglich – siehe „Backup-Wiederherstellung /
Restore" weiter unten.

**Format**: `{ formatVersion, exportedAt, appVersion, databaseVersion,
data: { … } }`. `formatVersion` (aktuell `1`) beschreibt ausschließlich die
Struktur dieser Backup-Datei selbst und wird nur erhöht, wenn sich diese
ändert – getrennt von `databaseVersion`, die unverändert aus dem
bestehenden `DATABASE_VERSION` (`database/schema.ts`) übernommen wird,
statt als eigene Zahl dupliziert zu werden. `appVersion` kommt direkt aus
`package.json` (`src/constants/appVersion.ts`, JSON-Import statt
manuell gepflegter String).

**Enthaltene Daten**: jeder tatsächlich persistierte Store – `users`,
`properties`, `bills`, `billItems`, `categories`, `costEntries`,
`wasteCosts`, `contracts`, `reminders`, `documents`, `documentFiles`,
`syncQueue`. `users`/`properties` sind seit V1 praktisch ungenutzt (siehe
Phase 12A) und `syncQueue` ist mangels Consumer immer leer – beide werden
trotzdem exportiert, für ein wirklich vollständiges Backup statt eines
reinen UI-Exports. Für jede sync-fähige Entität wird bewusst
`getAllIncludingDeleted()` verwendet: ein echtes Backup enthält auch
soft-deleted Datensätze, nicht nur aktive. `Category` hat kein Soft-Delete-
Konzept, `categoryRepository.getAll()` liefert hier bereits alles.

**Dokumentdateien**: `documentFiles` (Store `{ id, blob }`, siehe
`database/schema.ts`) wird verlustfrei als Base64 serialisiert
(`utils/base64.ts`, `blobToBase64`/`base64ToBlob` – reine `btoa`/`atob`-
Chunking-Funktionen, keine neue Abhängigkeit), zusammen mit dem
`Blob.type` als `mimeType`. Dateiname/Größe/Checksum bleiben ausschließlich
auf der `Document`-Entity selbst (keine Duplizierung). Der Export nimmt
**keine** Verknüpfung zwischen `documents` und `documentFiles` an – ein
`Document` ohne passenden `documentFiles`-Eintrag (Dateninkonsistenz) führt
nicht zu einem Fehler, sondern taucht einfach ohne zugehörige Datei auf.

**Architektur**: `UI (BackupSettings) → createBackup() (domain/usecases/
backup.ts) → Repositories → IndexedDB`; `buildBackup()`/`validateBackup()`
sind reine, ohne IndexedDB testbare Funktionen (gleiches Muster wie
`buildCentralCostData`). `validateBackup()` prüft nur die Struktur des
gerade erzeugten Exports (Format vorhanden, Arrays sind Arrays, …) – die
weiterführende Kompatibilitäts- und Referenzprüfung einer zum Import
vorgelegten Datei lebt bewusst separat in `domain/usecases/restore.ts`
(siehe unten), nicht hier.

**Teststrategie**: `utils/base64.test.ts` (Base64-Rundreise, inkl. großer/
binärer Inhalte – läuft unter Node statt jsdom, siehe unten),
`test/backup.usecase.test.ts` (reine `buildBackup()`/`validateBackup()`-
Fälle), `test/backup.integration.test.ts` (echtes IndexedDB inkl. Dokument-
Blob-Rundreise, verwaistes Dokument ohne Datei, Soft-Delete – ebenfalls
unter Node, aus demselben Grund wie `documentStorage.test.ts`: jsdoms
Blob/File übersteht `fake-indexeddb`s `structuredClone`-Emulation nicht),
`SettingsPage.test.tsx` (Export-Button, Erfolg, verständliche
Fehlermeldung statt Stacktrace).

### Backup-Wiederherstellung / Restore (Phase 12C, `domain/usecases/restore.ts`)

Restore ist ausdrücklich ein **Human Gate**-Feature: Auswahl, Lesen und
Prüfen einer Backup-Datei sind rein lesend (`evaluateBackupFile()` fasst
IndexedDB an keiner Stelle an) – es wird nichts verändert, bevor der
Nutzer die angezeigten Backup-Informationen gesehen und die
Wiederherstellung ausdrücklich per Klick bestätigt hat. Eine Dateiauswahl
allein bestätigt nie etwas.

**Semantik**: vollständiger Ersatz, keine Zusammenführung. Jeder Store aus
`RESTORE_STORE_NAMES` (alle zwölf aus dem Backup-Format) wird geleert und
exakt aus `backup.data` neu befüllt – auch soft-deleted Datensätze bleiben
mit ihrem ursprünglichen `deletedAt`/`syncVersion`/ihrer `id` erhalten
(keine Bereinigung), und Kategorien werden ebenfalls vollständig ersetzt,
nicht mit den beim Erststart geseedeten Standardkategorien zusammengeführt.
*(Geändert in Phase 14B: fehlende Standardkategorien werden nach dem Ersetzen
ergänzt, und seit Format 2 sind es 17 Stores – siehe „Finanztracker“.)*
`syncQueue` wird strukturell mit wiederhergestellt, aber nie ausgeführt
oder angestoßen – dafür existiert ohnehin kein Consumer (siehe „Sync"
unten). Restore ruft bewusst keine Use-Case-Funktionen wie `createContract`/
`updateContract()` auf (die z. B. automatisch Reminder regenerieren würden),
sondern schreibt direkt in die Stores – die im Backup enthaltenen Reminder
sind exakt die, die nach dem Restore existieren, nicht neu berechnete.

**Atomizität**: `performRestore()` öffnet eine einzige native IndexedDB-
`readwrite`-Transaktion über alle zwölf Stores hinweg (`idb`s
`db.transaction([...storeNames], 'readwrite')` unterstützt das direkt –
das ist bereits mit der bestehenden Architektur möglich, keine
Architekturänderung nötig). Jeder Store wird innerhalb dieser einen
Transaktion erst geleert und dann befüllt; schlägt auch nur ein einzelner
Schreibvorgang fehl, wird die gesamte Transaktion abgebrochen
(`tx.abort()`, zusätzlich zum nativen Abbruch durch einen echten
IndexedDB-Fehler) und **kein** Store wird verändert – die Datenbank bleibt
exakt im Zustand von vor dem Restore-Versuch. `documentFiles` werden vor
dem Öffnen der Transaktion synchron von Base64 zu `Blob` dekodiert, damit
die Transaktion nie auf ein asynchrones `await` wartet, das sie vorzeitig
automatisch committen lassen könnte.

**Validierung (vier Stufen, in `restore.ts`)**: (1) kein gültiges JSON →
Fehler; (2) gültiges JSON, aber keine Kostenblick-Backup-Struktur (bestehende
`validateBackup()` aus `backup.ts`) → Fehler; (3) strukturell gültig, aber
`formatVersion`/`databaseVersion` nicht mit dieser App-Version kompatibel
(`checkBackupCompatibility()`, Vergleich gegen `BACKUP_FORMAT_VERSION`/
`DATABASE_VERSION`, nie einen hartkodierten Duplikatwert) → Fehler mit dem
Text „Dieses Backupformat wird von dieser Version von Kostenblick nicht
unterstützt." bzw. einem analogen Datenbankversions-Hinweis; (4) strukturell
und versionsseitig gültig, aber referenziell klar defekt
(`validateBackupReferences()`: BillItem→Bill, Reminder→Contract,
CostEntry→Bill, Bill/Contract/WasteCost→Document) → Fehler. Ein `Document`
ohne passenden `documentFiles`-Eintrag wird bewusst **nicht** als Fehler
gewertet – das ist ein bereits akzeptierter, in Phase 12B selbst getesteter
Datenzustand, kein Zeichen für ein defektes Backup. Es findet **keine**
automatische Formatmigration statt; eine andere `databaseVersion` wird
abgelehnt, nie automatisch konvertiert. *(Geändert in Phase 14B: Format 1 /
Datenbank 2 wird weiter angenommen, die fehlenden Finanz-Stores gelten als
leer – siehe „Finanztracker“.)* Dies ist bewusst keine vollständige
Nachbildung der fachlichen Validierungsregeln der übrigen Domain (z. B.
Kündigungsfristlogik) – nur offensichtliche strukturelle/referenzielle
Plausibilität.

**UI** (`BackupSettings.tsx`, gleicher „Daten & Backup"-Abschnitt wie der
Export, keine neue Route/Navigation): Datei auswählen → Backup-Infos
(Exportdatum, App-Version, Anzahl je Store) und eine deutliche Warnung
anzeigen → explizit bestätigen oder abbrechen → erst dann `performRestore()`.
„Abbrechen" ändert nachweislich nichts. Während des Restores ist der
Bestätigen-Button ausgeblendet (kein gleichzeitiger zweiter Restore
möglich); Erfolg/Fehler werden in verständlichem Deutsch angezeigt, nie als
Stacktrace.

**Refresh nach dem Restore**: bewusst kein neuer globaler State-Mechanismus.
Jede Seite lädt ihre Daten bereits beim Mounten frisch aus IndexedDB (siehe
z. B. `ContractDetailPage`, `DashboardPage`) – es gibt keinen
seitenübergreifenden Cache, der nach einem Restore aktiv invalidiert werden
müsste. Ein Navigieren zu einer anderen Seite oder ein Reload zeigt die
wiederhergestellten Daten automatisch.

**Teststrategie**: `test/restore.usecase.test.ts` (reine Funktionen:
`getBackupSummary`, `checkBackupCompatibility` inkl. der beiden
Ablehnungsfälle, `validateBackupReferences` inkl. der expliziten
Gegenprobe „Document ohne documentFiles wird nicht abgelehnt",
`evaluateBackupFile` für alle vier Stufen), `test/restore.integration.test.ts`
(echtes IndexedDB unter Node – vollständiger Ersatz statt Merge,
Soft-Delete-Erhalt, Contracts/Reminder ohne Neuberechnung, Dokument-Datei
byte-exakt über `ArrayBuffer`-Vergleich, Kategorien-Ersatz, ein
**Atomizitätstest**, der einen Datensatz ohne `id` einschleust – ein
echter, nativer IndexedDB-Fehler statt eines gemockten – und prüft, dass
alle vorherigen Daten in jedem betroffenen Store danach unverändert sind,
sowie ein Export→Ändern→Restore-Rundreisentest), Erweiterungen in
`SettingsPage.test.tsx` (Dateiauswahl, Info-Anzeige, Ablehnung bei
ungültigem JSON/inkompatibler Version, Abbrechen ändert nichts, Bestätigen
ersetzt die Daten, verständliche Fehlermeldung bei einem fehlschlagenden
Restore).

**Bekannte Einschränkungen**: es gibt keine Vorschau einzelner Datensätze
vor dem Restore (nur Zähler pro Store) und keine Teilwiederherstellung
(z. B. „nur Verträge") – beides wäre über den beauftragten Umfang
hinausgegangen. Ein Restore ersetzt immer alle zwölf Stores gemeinsam.

### Sync (Phase 13B–13E)

Einrichtung für Nutzer: `docs/SYNC_SETUP.md`. Architektur-Bericht: Phase 13A
(Claude-Doc „Kostenblick – Phase 13A: Sync Architecture Discovery“).

**Modell**: entity-basierter Delta-Sync über Supabase. Ein Haushalt hat 1..n
gleichberechtigte Mitglieder (eigene E-Mail je Person). Alle Fachdaten
liegen serverseitig generisch in `sync_records` (eine Zeile pro Entität,
Inhalt als JSON) mit einer vom Server vergebenen Revision `rev`. Geräte
holen alles mit `rev > Cursor`; der Cursor liegt je Haushalt in
`localStorage` (`syncSettings.ts`) – bewusst keine IndexedDB-Versions-
änderung, damit ältere Backups wiederherstellbar bleiben.

**Synchronisierte Typen**: `SYNC_ENTITY_TYPES` in
`services/sync/syncTypes.ts` (properties, bills, billItems, costEntries,
wasteCosts, contracts, reminders, documents). Nicht synchronisiert:
`categories` (feste Seeds), `users` (ungenutzt), `documentFiles` (eigene
Pipeline, Phase 13F), Reminder-Intervall-Einstellungen (gerätelokal) und
alle Finanz-Stores aus Phase 14 (`accounts`, `transactions`,
`importBatches`, `categoryRules`, `savingsGoals` – bewusst nur lokal).

**Lokale Markierung**: `IndexedDBRepository.save()/delete()` schreiben in
derselben Transaktion einen `syncQueue`-Eintrag mit deterministischem
Schlüssel `<entityType>:<id>` (begrenzt auf einen Eintrag pro Datensatz –
die Queue wächst nie unbegrenzt, auch ohne eingerichteten Sync).
`serverRev` (zuletzt gesehene Server-Revision) ist rein lokale Buchhaltung:
`save()` übernimmt den gespeicherten Wert, wenn der Aufrufer ihn nicht
mitgibt, und legt den Schlüssel nie an, solange ein Datensatz nie
synchronisiert wurde. Vor dem Senden wird er entfernt (`toServerData`).

**Ablauf** (`SyncEngine.run()`): erst Push aller markierten Datensätze (mit
`baseRev`), dann Pull ab Cursor. Gepullte/bestätigte Datensätze schreibt
`IndexedDbSyncLocalStore` direkt in die Stores (nie über `save()`, sonst
würden sie erneut markiert). Ein lokal markierter Datensatz wird beim Pull
nie überschrieben.

**Konflikte** (Server, SQL `sync_push`, identisch in `InMemorySyncServer`):
Server-Revision = `baseRev` → übernehmen, kein Konflikt. Weicht die
Server-Revision ab, wird gegen die in `sync_records_history` aufbewahrte
Baseline (der Stand bei `baseRev`) gedifft, welche Felder jede Seite
tatsächlich geändert hat:
- **disjunkte Felder** (z. B. Gerät A ändert `monthlyCost`, Gerät B
  `provider`) → beide Änderungen werden automatisch gemerged, kein
  Konfliktflag – nichts geht verloren.
- **Überlapp auf einem geschützten Feld** (`protected_fields`: Geldbeträge
  und die Felder, die die Kündigungsfrist-Berechnung füttern – Kategorie C
  aus den Architektur-Notizen) → wird **nie** per Uhrzeit entschieden,
  sondern abgelehnt; die Serverversion bleibt unverändert, die eigene
  (abgelehnte) Version bleibt lokal/im Konfliktprotokoll erhalten. Kein
  Geldbetrag wird je stillschweigend durch eine "neuere" fremde Änderung
  überschrieben.
- **Überlapp auf unkritischen Feldern** → wie bisher: neuere `updatedAt`
  gewinnt, bei Gleichstand der Server; die unterlegene Version landet im
  Konfliktprotokoll (`localStorage`, max. 50, in den Einstellungen
  sichtbar).
- **Baseline nicht rekonstruierbar** (z. B. sehr alter/unplausibler
  `baseRev`) oder der Server hält bereits einen Tombstone, während die
  Änderung `deletedAt` zurücksetzen würde → ablehnen statt raten
  (Kategorie-C-Fallback bzw. Anti-Resurrection) – ein gelöschter
  Datensatz wird durch eine veraltete, konkurrierende Änderung nie wieder
  aktiv.

Die Geräteuhr entscheidet also nur noch über echte, unkritische
Feld-Überlappungen, nie über Geldbeträge/Kündigungsfristen und nie über
die Pull-Reihenfolge.

**Reminder-IDs**: generierte Kündigungs-Reminder haben die deterministische
ID `reminder:<contractId>:<offsetDays>:<YYYY-MM-DD>`, damit zwei Geräte
keine Duplikate erzeugen. Ein erledigter Reminder mit gleichem Offset und
Datum gilt als erfüllt und wird nicht neu erzeugt.

**Haushalt & Migration** (`services/sync/householdData.ts`): beim Anlegen/
Verbinden werden in EINER Transaktion alle `userId` auf die `householdId`
gesetzt und alle Datensätze (inkl. Soft-Deletes) markiert. Beitritt mit
vorhandenen lokalen Daten: Nutzer wählt „Zusammenführen“ oder „Ersetzen“
(Human Gate, Backup wird angeboten). Neue Entitäten bekommen
`getCurrentOwnerId()` (Haushalt oder `local-user`). Nach einem Restore auf
einem verbundenen Gerät werden alle Datensätze erneut markiert und der
Cursor zurückgesetzt.

**Login**: E-Mail-Code (OTP), kein Magic Link – ein Link öffnet auf iOS
Safari statt der installierten PWA (getrennter Speicher).

**Auslöser** (`hooks/useAutoSync.ts`): App-Start, Rückkehr in den
Vordergrund (max. alle 30 s), `online`-Event, Button. Kein Background Sync
(gibt es in iOS-PWAs nicht). Brachte ein Lauf fremde Änderungen, fragt ein
Banner, bevor die Seiten neu geladen werden (Remount der Routen über
`dataVersion`), damit offene Formulare nicht verloren gehen.

**Server**: `supabase/migrations/*.sql`. RLS: Mitglieder dürfen nur lesen;
jedes Schreiben läuft über `security definer`-Funktionen
(`create_household`, `create_household_invite`, `join_household`,
`sync_push`), die Mitgliedschaft prüfen und Revisionen vergeben. Pro
Haushalt serialisiert ein Advisory Lock die Pushes, damit Revisionen in
Commit-Reihenfolge steigen. Tests: `supabase/tests/sync_schema.test.sql`
gegen ein lokales Postgres mit `supabase_stubs.sql`.

`supabase-js` wird erst bei eingerichtetem Sync nachgeladen (eigener Chunk).

**Noch offen**: Dokument-Dateien (13F), Release/Zwei-Geräte-Test (13G).

### Finanztracker (Phase 14, `docs/specs/`)

Spec: `docs/specs/phase-14-finanztracker.md`; verbindliche Entscheidungen
und Abweichungen davon: `docs/specs/phase-14a-entscheidungen.md`
(freigegeben); Zielbild: `docs/specs/phase-14-konzept.jpg`. Test-Fixtures:
`src/test/fixtures/sparkasse/` (anonymisiert, Windows-1252 mit LF,
`.gitattributes` `-text` – nie neu speichern; echte Exporte nie
committen).

**Nur lokal**: Konten, Buchungen, Importe, Regeln und Sparziel werden nicht
synchronisiert. Ihre Entities erweitern nur `PersistedEntity` (kein
`deletedAt`/`syncVersion`/`userId`) und werden hart gelöscht
(`IndexedDBSimpleRepository`, mit `saveMany`/`deleteMany` in je einer
Transaktion). Sie stehen nicht in `SYNC_ENTITY_TYPES`, schreiben daher nie
in die `syncQueue`, und der Haushalts-Beitritt („Ersetzen“/„Zusammenführen“)
lässt sie unberührt (Tests in `financeRepositories.test.ts`).
`Transaction.contractId` darf auf einen nicht mehr vorhandenen Vertrag
zeigen (Verträge synchronisieren, Buchungen nicht) – Leser behandeln das
als „nicht verknüpft“; am `Contract` wird nie ein Verweis auf Buchungen
gespeichert.

**Buchungsfluss**: `flowType` (`income`/`expense`/`transfer`/`saving`)
statt `isTransfer`, mit `flowTypeSource` analog zu `categorySource`.
`transferPairId` verknüpft Giro-Abrechnung und Kreditkarten-Lastschrift.

**Datenbank v3**: rein additiver `oldVersion < 3`-Block in
`database/database.ts` (fünf Stores; `transactions` mit eindeutigem Index
`accountDedupe` = `[accountId, dedupeKey]`, deshalb harte Löschung). Neue
Standardkategorien (`constants/categories.ts`) erreichen bestehende
Installationen über `mergeDefaultCategories()` im Upgrade – fehlende werden
ergänzt, bestehende bekommen nur ihr `group`, nichts wird umbenannt.
`CategoryType` kennt `'income'`; `useCategories()` blendet
Einnahme-Kategorien für die Kosten-/Abrechnungs-/Vertragsformulare aus.
`getDatabase()` schließt bei `blocking` die eigene Verbindung, damit ein
späteres Upgrade nicht an einem offenen Tab hängt. Migrationstest mit einer
exakt wie Release 1.1 angelegten v2-Datenbank:
`databaseMigration.test.ts` (`createSchema(…, upToVersion)`).

**Backup/Restore**: `BACKUP_FORMAT_VERSION = 2` (Finanz-Stores sind die
einzige Sicherung der Buchungen). Restore nimmt Format 1–2 und Datenbank
2–3 an; `upgradeBackupData()` füllt die Finanz-Stores eines Format-1-Backups
mit leeren Listen, `categoriesToRestore()` ergänzt fehlende
Standardkategorien. Referenzprüfung zusätzlich für Buchung→Konto,
Buchung→Import, Import→Konto, Regel→Kategorie (nicht Buchung→Vertrag).
Würde ein Restore Buchungen dieses Geräts löschen, nennt die Bestätigung das
vorher ausdrücklich (`describeBookingLoss`). Tests: `financeBackup.test.ts`.

**CSV-Parser (Phase 14C, `domain/usecases/bankImport/`)**: reine Funktionen,
kein IndexedDB, kein Netzwerk. `decodeBankFile()` liest Bytes strikt als
UTF-8 (z. B. aus Numbers/Excel neu gespeichert), sonst als Windows-1252
(Sparkassen-Original). `csv.ts` ist ein eigener kleiner RFC-4180-Leser
(`;`, `""`, Umbrüche im Feld, LF/CRLF) – keine Bibliothek.
`parseSparkasseCsv()` erkennt Giro (CSV-CAMT V2) bzw. Kreditkarte am
Header, ordnet Spalten **nur über den Namen** zu, lehnt fehlende
Pflichtspalten und Dateien mit mehreren Konten komplett ab (kein
Teilimport) und liefert pro fehlerhafter Zeile eine Meldung mit Zeile und
Spalte, nie mit Feldinhalt. Vorgemerkte Umsätze werden nur gezählt
(`pendingCount`). Beträge: `parseBankAmount` (striktes deutsches Format,
nutzt `parseGermanAmount`); Umrechnungskurse: `parseExchangeRate` (nie auf
Cent gerundet); `Originalbetrag`/`Umrechnungskurs` nur bei echter
Fremdwährung (`0,00`/`1,00` sind Platzhalter). Kreditkartenzeilen bekommen
einen strukturellen `bookingText` (`KARTENUMSATZ`/`LASTSCHRIFT`/`GEBUEHR`,
`CREDIT_CARD_BOOKING_TEXT`). `computeDedupeKeys()`: SHA-256 über die
Felder aus Spec 4/4b (JSON-Array, Verwendungszweck ohne jedes Leerzeichen
und in Großbuchstaben) + `:n` für identische Zeilen derselben Datei;
`planImport()` teilt gegen die vorhandenen Schlüssel in neu/doppelt und
liefert die `ImportBatchCounts`. Kontozuordnung über
`accountIdentity.ts` (gesalzener Hash, `findMatchingAccount`). Tests:
`sparkasseCsv.test.ts` gegen alle fünf Fixtures, inkl. überlappender
Exporte, UTF-8-/CRLF-Varianten und 2.340 Zeilen. Die Tests lesen die
Fixtures per `node:fs` (nur `readFileSync` ist in `src/test/nodeFs.d.ts`
deklariert – die App selbst hat keine Node-Typen).

**Import-Flow (Phase 14D, `bankImport/importTransactions.ts`,
`features/transactions/`)**: `/buchungen/import` läuft über Datei wählen →
Vorschau → Speichern. `prepareImport()` liest, prüft und ordnet das Konto
zu (gesalzener Hash; unbekanntes Konto → wird erst beim Speichern
angelegt, Name editierbar) und baut die Vorschau (Zeitraum, neu/doppelt/
vorgemerkt, ohne Kategorie, Einnahmen/Ausgaben/Gespart) – **schreibt
nichts**. `commitImport()` speichert Konto, `ImportBatch`, Buchungen und
die neu entstehenden Kartenpaare in **einer** IndexedDB-Transaktion
(Fehler → nichts gespeichert); Vorschauen mit Zeilenfehlern oder ohne neue
Buchungen lassen sich nicht speichern. `undoImport()` löscht die Buchungen
einer Charge hart und verknüpft den Rest neu – derselbe Export lässt sich
danach erneut importieren. `/buchungen` zeigt bisher die Importe (mit
„Import rückgängig machen“ nach Bestätigung) und den Hinweis auf fehlende
Kartenumsätze; die Buchungsliste selbst folgt in 14G.

**Erst-Einordnung** (`classifyBankRow`, bis 14E eigene Regeln bringt):
Strukturregeln vor Bank-Kategorie – `EIGENE KREDITKARTENABRECHN.`/
`KREDITKARTENABRECHNUNG` → Ausgabe „Kreditkarte (nicht aufgeschlüsselt)“,
`UEBERTRAG…` oder Kategorie „Geldanlage“ → `saving` (beide Richtungen,
Rückflüsse mindern „Gespart“), `LS WIEDERGUTSCHRIFT`/`WIEDERGUTSCHRIFT` →
Ausgabe mit positivem Betrag (`isReversal`), `BARGELDEINZAHLUNG…` →
„Sonstige Einnahmen“, `ENTGELTABSCHLUSS`/`ABSCHLUSS` → Gebühren; sonst
entscheidet das Vorzeichen (positiv = Einnahme, O-8), die Sparkassen-
Kategorie ist nur Startvorschlag (`SPARKASSE_CATEGORY_MAP` in
`constants/bankCategories.ts`, `LOHN  GEHALT` → Gehalt, O-10). Eine
Einnahme bekommt nie eine Ausgabekategorie. Kreditkarte: `LASTSCHRIFT` →
`transfer`, Fremdwährungsgebühr → Gebühren, Kartenumsätze vorerst ohne
Kategorie.

**Kartenpaare** (`reconcileCardSettlements`, rein, nach jedem Import und
jedem Rückgängigmachen über alle Buchungen): Giro-Abrechnung und
Karten-„Lastschrift“ mit centgenau gleichem Betrag, Giro 0–10 Tage danach
(`SETTLEMENT_PAIRING_WINDOW_DAYS`), nächstes Datum zuerst, 1:1 → beide
`transfer` mit `transferPairId`. Ungepaarte Giro-Abrechnung: Ausgabe
„Kreditkarte (nicht aufgeschlüsselt)“ – außer es gibt seit der letzten
gepaarten Lastschrift schon Kartenumsätze, dann vorläufig `transfer`
(`isProvisionalSettlement`, Hinweis auf `/buchungen`), damit nichts doppelt
zählt (O-1). Ein manuell gesetzter `flowType` wird nie angefasst, eine
manuelle Kategorie bleibt.

**Backup-Erinnerung** (`domain/usecases/backupReminder.ts`): Zeitpunkt des
letzten Backups dieses Geräts in `localStorage` (Komfortwert, gesetzt von
„Backup exportieren“ und `downloadBackup()`); „Daten & Backup“ zeigt ihn
und warnt, wenn seitdem Buchungen importiert wurden, plus Hinweis, dass
das Backup Kontoumsätze enthält. Nach jedem Import fragt die Seite
„Backup erstellen?“ (Button lädt direkt herunter, „Später“ blendet aus).

**Kategorisierung (Phase 14E, `domain/usecases/categorization/`)**:
`categorizeTransaction()` ist die eine, reine Regel-Engine – Reihenfolge:
manuell → verknüpfter Vertrag (`Transaction.contractId`, fehlender Vertrag
wird ignoriert) → eigene Regeln (höchste `priority` zuerst) →
Strukturregeln aus `classifyBankRow` → Standardregeln
(`constants/standardCategoryRules.ts`: wenige eindeutige Händlernamen als
ganzes Wort, bei Kreditkarten der Händlerkategorie-Code `merchantCategoryCode`
aus „Gebührenschlüssel“) → Sparkassen-Kategorie → keine. Eine manuelle
Kategorie oder ein manueller `flowType` wird **nie** geändert
(`recategorize()` liefert sie unverändert zurück). Kategorie und Fluss
gehören zusammen: eine Einnahme-Kategorie heißt Einnahme, eine
Ausgabe-Kategorie Ausgabe (positive Buchung = Erstattung, O-8), „Sparen“
heißt `saving`. Giro-Kartenabrechnungen und Karten-Lastschriften
überlässt die Engine `reconcileCardSettlements`. Der Import kategorisiert
neue Buchungen schon mit den gespeicherten Regeln.

Manuell (`transactionCategorization.ts`): `setTransactionAssignment()`
speichert die Wahl aus **einem** Auswahlfeld (Kategorie / Sparen /
Umbuchung / ohne Kategorie) als `manual` und verknüpft die Kartenpaare neu.
Danach fragt die Detailseite „Immer so zuordnen?“ (`RulePrompt`):
Vorschläge vom genauesten Feld an (Gläubiger-ID, IBAN, Name, Verwendungszweck;
Name/Zweck editierbar), mit Anzahl der betroffenen bestehenden Buchungen
(`countRuleMatches`). `createRule()` speichert die Regel mit der bisher
höchsten Priorität und wendet sie auf Wunsch in einer Transaktion auf die
passenden, nicht manuellen Buchungen an. Eigene Regeln stehen vor den
Strukturregeln – eine Regel auf ein eigenes Konto (IBAN → Sparen) ist so der
Weg, Überweisungen auf eigene Konten zu markieren. Regel löschen lässt
bereits zugeordnete Buchungen unverändert.

UI: `/buchungen/:id` (Detail mit Zuordnung, Quelle der Zuordnung,
Kartenpaar-Link, Vorläufig-Hinweis), Liste „Ohne Kategorie“ auf
`/buchungen`, `/regeln` (Liste, Löschen mit Bestätigung, Erklärung der
Standardregeln; verlinkt unter „Mehr“). Die vollständige Buchungsliste mit
Suche/Filtern bleibt 14G.

Tests: `categorization.test.ts` (Reihenfolge, Priorität, manuell bleibt,
Vertrag, Eigenes-Konto-Regel, Erstattung, MCC, keine Ausgabekategorie auf
Einnahmen, Kartenabrechnungen), `categorizationFlow.test.ts` (echtes
IndexedDB: manuell speichern, Paar lösen, Regel anwenden ohne manuelle
anzufassen, IBAN-Regel, Regel beim nächsten Import, Löschen),
`categorization.ui.test.tsx`.

Tests: `bankImportFlow.test.ts` (Einordnung, Paarung inkl. O-1-Fall,
Vorschau schreibt nichts, Speichern, Konto wiedererkannt, Kartenpaare aus
den Fixtures, Rückgängig + erneuter Import, Atomizität),
`transactions.ui.test.tsx` (Vorschau, Speichern, Abbrechen, Fehlerdatei,
bereits importiert, zweite Datei, Rückgängig, Mehr-Link, Backup-Hinweis).

**Fixkosten & Verträge (Phase 14F, `domain/usecases/fixedCosts/`)**:
Eine Vertragsverknüpfung ist eine `CategoryRule` mit `contractId` (Feld
`mandateReference` > `creditorId` > `counterpartyName`, immer `equals`);
die Buchung trägt `Transaction.contractId`, der Vertrag nie einen Verweis
auf Buchungen. Die Engine verknüpft nur Ausgaben (keine Einnahmen,
Umbuchungen, Kartenabrechnungen); eine bestehende Verknüpfung bleibt,
Vertragsregeln sind keine Kategorieregeln, Regeln gelöschter Verträge
werden ignoriert. Verknüpfte Buchungen bekommen die Vertragskategorie
(manuelle Kategorie bleibt). `updateContract`/`deleteContract` rufen
`refreshContractBookings()` – nach dem Löschen bleibt der tote Verweis
(„Vertrag nicht mehr vorhanden“), die Kategorie kommt wieder aus den
übrigen Regeln. Per Sync geänderte Verträge wirken erst bei der nächsten
Neuberechnung (Import/Regel).

`contractLinks.ts`: `suggestContractLinks()` (Gruppen nach dem genauesten
Merkmal; Vorschlag nur bei Anbietername im Namen/Zweck oder ≥ 2 Monaten mit
±25 % des Monatswerts – nichts wird ohne Bestätigung verknüpft),
`linkContract()` (über `saveRuleAndApply`, eine Transaktion, auch aus der
Buchungsdetailseite), `unlinkContract()` (Regeln + Verweise weg, Buchungen
neu kategorisiert). `contractComparison.ts` (rein): Soll = Vertragswert,
Ist = Netto der verknüpften Buchungen (Rücklastschrift mindert). Rhythmus
aus den Abbuchungsmonaten (untere Median-Lücke ≤ 1 monatlich, 11–13
jährlich, sonst unregelmäßig ohne Soll-Vergleich; Einzelbuchung nach
Betrag). „Abbuchung fehlt“ nur in einem vollständig importierten Monat
(`coveredMonthsByAccount`: Monat liegt ganz in den zusammengeführten
Import-Zeiträumen **jedes** Kontos der Buchungen) nach der ersten
verknüpften Abbuchung und innerhalb der Vertragslaufzeit; Abweichung auf
den Cent genau. `buildFixedCostOverview()`: Soll-Summe der im Monat
aktiven Verträge vs. Ist-Summe der verknüpften Abbuchungen – **Soll fließt
nie in Ausgaben ein (E7)**. Standardmonat = neuester vollständig
importierter Monat.

UI: Abschnitt „Abbuchungen“ auf `/vertraege/:id` (Vorschläge mit
„Zuordnen“, Monatsliste „erwartet …, abgebucht …“, Verknüpfung aufheben),
„Vertrag zuordnen“ auf `/buchungen/:id`, `/vertraege/fixkosten`
(Monatswahl, Soll/Ist, Status je Vertrag; verlinkt von `/vertraege` und der
Dashboard-Karte „Laufende Vertragskosten“), `/regeln` zeigt „→ Vertrag …“.
Tests: `fixedCosts.test.ts` (rein), `contractLinks.test.ts` (IndexedDB mit
Fixture, keine syncQueue-Einträge), `categorization.test.ts`
(Vertragsregeln), `fixedCosts.ui.test.tsx`.

## PWA-Regeln

- installierbar (Manifest + Icons)
- offline-fähig (Service Worker, offline caching)
- funktioniert auf iOS Safari und als Home-Screen-PWA (`standalone`)
- mobile-first, iPhone 15 Pro als primäres Zielgerät
- IndexedDB als primäre lokale Datenquelle; die App darf nicht voraussetzen,
  dass dauerhaft Internet verfügbar ist
- lokale Änderungen werden für die Synchronisierung vorgemerkt (syncQueue)

**Update-Hinweis (Phase 12E)**: `registerType: 'prompt'` (nicht
`'autoUpdate'`) + `injectRegister: false` in `vite.config.ts` – ein neuer
Service Worker aktiviert sich nie unangekündigt selbst. `src/hooks/
usePwaUpdate.ts` ist die **einzige** Stelle, die `virtual:pwa-register/
react`s `useRegisterSW()` aufruft (registriert den Service Worker also
genau einmal, siehe `App.tsx`); `src/components/PwaUpdateBanner.tsx` ist
eine reine, prop-gesteuerte Komponente (kein Zugriff auf das virtuelle
Modul), die den Hinweis „Neue Version verfügbar" mit „Jetzt
aktualisieren"/„Später" zeigt – bewusst **nicht** über das bestehende
Toast-System (`ToastProvider`), da ein Toast automatisch verschwindet und
keine Aktionsbuttons trägt, dieser Hinweis aber bis zu einer Nutzerentscheidung
sichtbar bleiben muss. „Später" setzt nur lokalen React-State zurück –
keine Persistenz in IndexedDB/localStorage; bei einem erneuten Update
erscheint der Hinweis wieder. Der eigentliche Reload nach „Jetzt
aktualisieren" ist vite-plugin-pwas eigenes Standardverhalten
(`updateServiceWorker()` sendet ein Skip-Waiting an den wartenden Service
Worker; der Reload selbst passiert beim `controlling`-Event) – keine
eigene Reload-Logik in der App. Betrifft nur die Auslieferung/den
Update-Mechanismus der App selbst, nie IndexedDB-Daten.

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
Home, Buchungen, Statistik, Verträge, Mehr (seit Phase 14D; „Abrechnungen“
ist seitdem unter „Mehr“ verlinkt – Entscheidung 4 in
`docs/specs/phase-14a-entscheidungen.md`).

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
