# Kostenblick – Phase 14: Finanztracker & Sparkassen-CSV-Import

> Ablage im Repo: `docs/specs/phase-14-finanztracker.md`
> Basis: `main` @ `9758fdf` (v1.1.0 + Sync 13B–13E). Offen sind noch 13F (Dokument-Dateien) und 13G (Zwei-Geräte-Test).
> Es gelten alle Regeln aus `CLAUDE.md`: phasenweise arbeiten, Build/Test/Lint grün, keine Business-Logik in Komponenten, kein Doppelzählen und keine erfundenen Werte.

## 1. Ziel

Kostenblick wird von einer Haushaltskosten-App zu einem **Finanztracker mit Fixkosten- und Vertragsbezug**:

- Monatlicher **Import der Sparkassen-CSV** (Girokonto). Doppelt importierte Zeiträume dürfen keine Duplikate erzeugen.
- **Einnahmen, Ausgaben, Saldo** pro Monat, Ausgaben nach Kategorie und eine Liste der letzten Buchungen.
- **Sparziel** pro Monat mit Fortschritt.
- **Fixkosten und Verträge** bleiben erhalten und werden mit echten Abbuchungen abgeglichen (Soll/Ist).
- Neues **Dashboard** nach dem Konzeptbild (Kennzahlkarten, Zeitverlauf, Kategorien, letzte Buchungen, Tipp-Karte).

Nicht Teil dieser Phase: Online-Banking-Anbindung (FinTS/PSD2), mehrere Banken außer der Sparkasse, eigene Kategorien und Budgets pro Kategorie.

## 2. Ist-Stand (relevant für die Planung)

- Die Entities liegen in `domain/models/entities.ts`. Beträge sind `number` in Euro, nicht in Cent; diese Konvention bleibt bestehen.
- `CostEntry` kennt nur Kosten, keine Einnahmen, keine Gegenpartei und keinen Duplikatschlüssel. `CostSource` enthält bereits `'import'`.
- Die Kategorien sind feste Seeds (`constants/categories.ts`), Nebenkosten-lastig und **nicht synchronisiert**.
- Es gibt zwei getrennte Pipelines: Das Dashboard rechnet über `CostEntry`, die Statistik über `Bill`. Diese Trennung ist in `CLAUDE.md` bewusst dokumentiert.
- `DATABASE_VERSION = 2`. Sync wurde bewusst ohne Versionssprung gebaut, damit alte Backups wiederherstellbar bleiben.
- Sync: `SYNC_ENTITY_TYPES` in `services/sync/syncTypes.ts`, geschützte Geldfelder serverseitig über `protected_fields()` in `supabase/migrations/…_sync_schema.sql`.

## 3. Architekturentscheidungen (in 14A bestätigen oder begründet ändern)

**E1 – Neue Entity `Transaction` statt `CostEntry` erweitern.**
Eine Buchung ist ein Kontoumsatz, also Cashflow. `CostEntry` bleibt für manuelle Kosten zuständig. Die Felder einer Buchung:
`accountId, bookingDate, valueDate, purchaseDate?, amount (vorzeichenbehaftet, € ), currency, counterpartyName, counterpartyIban?, purpose, bookingText, creditorId?, mandateReference?, endToEndReference?, categoryId?, categorySource ('manual'|'rule'|'contract'|'bank'|'none'), bankCategory?, originalAmount?, originalCurrency?, exchangeRate?, isReversal?, contractId?, importBatchId, dedupeKey, isTransfer (Umbuchung, zählt nicht als Einnahme/Ausgabe), notes?` plus die Sync-Felder.

**E2 – `Account`** (Konto): `name, bank ('sparkasse'), type ('giro'|'credit_card'), last4, identifierHash`. Die vollständige IBAN wird nicht gespeichert; zum Zuordnen einer CSV-Datei reicht der Hash.

**E3 – `ImportBatch`**: `accountId, filename, fileChecksum, importedAt, periodFrom, periodTo, counts {total, new, duplicates, skippedPending}`. Damit lässt sich ein Import vollständig rückgängig machen (Soft-Delete aller Buchungen der Charge).

**E4 – `CategoryRule`**: `field ('counterpartyName'|'purpose'|'creditorId'|'counterpartyIban'), matchType ('contains'|'equals'), pattern, categoryId, priority, createdFrom ('manual'|'seed')`. Entsteht vor allem aus „Immer so zuordnen?“ nach einer manuellen Kategorisierung.

**E5 – `SavingsGoal`**: zunächst ein einziges Monatsziel: `monthlyTarget`. Fortschritt = Monatssaldo (Einnahmen − Ausgaben, ohne Umbuchungen) ÷ Ziel, begrenzt auf 0 bis 100 %. Ein negativer Saldo bedeutet 0 % und wird klar als solcher angezeigt.

**E6 – Kategorien additiv erweitern.** `CategoryType` bekommt `'income'`, `Category` ein optionales `group`. Neue Seeds: Wohnen, Lebensmittel, Mobilität, Freizeit, Versicherungen, Abos & Verträge, Gesundheit, Kleidung, Bargeld, Gehalt, Sonstige Einnahmen, Umbuchung. Die bestehenden Nebenkosten-Kategorien (Heizung, Wasser …) bekommen `group: 'wohnen'`. Bleiben feste Seeds (kein Sync nötig); eigene Kategorien folgen später.

**E7 – Keine Doppelzählung (Kernregel).**
- **Dashboard-Geldwerte** (Einnahmen, Ausgaben, Saldo, Kategorien, Zeitverlauf) kommen **ausschließlich aus `Transaction`**.
- **Verträge** liefern ein **Soll** (`monthlyCost`), das nie zu den Ausgaben addiert wird. Angezeigt wird es nur als Soll/Ist-Abgleich.
- **Bills** bleiben in Abrechnungen und Statistik. Vorauszahlungen und Nachzahlungen tauchen als echte Buchungen auf; die Jahresabrechnung wird nicht zusätzlich als Ausgabe gezählt.
- **Manuelle `CostEntry`** erscheinen im neuen Dashboard nicht als Ausgabe, damit eine bar bezahlte und zusätzlich manuell erfasste Ausgabe nicht doppelt zählt. Die Kostenübersicht bleibt unverändert. Diese Regel wird in `CLAUDE.md` dokumentiert.

**E8 – Datenbank v3.** Neue Stores: `accounts`, `transactions` (Indizes: `accountId`, `bookingDate`, `categoryId`, `dedupeKey` **unique pro Konto**, `importBatchId`, `contractId`, `updatedAt`, `deletedAt`), `importBatches`, `categoryRules`, `savingsGoals`. Die Migration ist rein additiv. **Ein Restore von v2-Backups muss weiter funktionieren** (Test!).

**E9 – Sync und Backup.** Die neuen Entities kommen in `SYNC_ENTITY_TYPES`, in Backup/Restore und in eine neue Supabase-Migration (`protected_fields` für `transactions.amount`, `savingsGoals.monthlyTarget`). **Human Gate:** Kontoumsätze landen damit in deinem Supabase-Projekt. Alternative ist eine Einstellung „Buchungen nur lokal“, die in 14A entschieden wird.

**E10 – Datenschutz.** Das Parsen läuft vollständig lokal, ohne Netzwerkzugriff. Keine Kontodaten in Logs. Die CSV-Datei selbst wird nicht gespeichert, nur Checksumme und Dateiname.

## 4. Sparkassen-CSV (CSV-CAMT V2)

Export im Online-Banking: Umsätze → Export → **„Excel (CSV-CAMT V2)“**.

| Eigenschaft | Wert |
|---|---|
| Kodierung | Windows-1252 → `new TextDecoder('windows-1252')` |
| Trennzeichen | `;`, alle Felder in Anführungszeichen, Felder können `;` und Zeilenumbrüche enthalten |
| Datum | `TT.MM.JJ` (z. B. `28.02.26`) |
| Betrag | `-1234,56` (Komma als Dezimaltrenner, Minus = Ausgabe) |
| Spalten | Auftragskonto, Buchungstag, Valutadatum, Buchungstext, Verwendungszweck, Glaeubiger ID, Mandatsreferenz, Kundenreferenz (End-to-End), Sammlerreferenz, Lastschrift Ursprungsbetrag, Auslagenersatz Ruecklastschrift, Beguenstigter/Zahlungspflichtiger, Kontonummer/IBAN, BIC (SWIFT-Code), Betrag, Waehrung, Info |

Regeln:
- **Spalten über den Header-Namen zuordnen, nie über die Position.** Je nach Exportvariante fehlen Spalten (z. B. „Glaeubiger ID“). Fehlen Pflichtspalten (Buchungstag, Betrag, Auftragskonto), wird eine klare Fehlermeldung angezeigt, keine Teilimporte.
- Zeilen mit `Info` = „Umsatz vorgemerkt“ werden **übersprungen** und nur gezählt. Importiert werden nur gebuchte Umsätze.
- **Duplikatschlüssel:** `dedupeKey = SHA-256(ibanHash | Buchungstag | Betrag | Gegen-IBAN | normalisierter Verwendungszweck | End-to-End-Referenz) + ':' + n`, wobei `n` echte identische Zeilen **innerhalb derselben Datei** durchzählt (z. B. zweimal 2,50 € beim selben Bäcker am selben Tag). So sind überlappende Monatsexporte unproblematisch.
- Das `Auftragskonto` aus der CSV muss zum gewählten Konto passen (Hash-Vergleich). Bei einem unbekannten Konto wird angeboten, ein neues Konto anzulegen.
- Der Export ist im Online-Banking häufig auf einen begrenzten Zeitraum beschränkt (oft rund 90 Tage). Der monatliche Import ist deshalb der richtige Rhythmus.

**Erkenntnisse aus einem echten Export (09/2026):**
- Zeilenenden sind **LF** (nicht CRLF). Der Parser muss beides können.
- Es gibt eine **zusätzliche 18. Spalte `Kategorie`** mit der Sparkassen-eigenen Kategorisierung (z. B. „Lebensmittel und Drogerie“, „Einkommen“, „Geldanlage“, „Nicht zugeordnet“). Sie dient als **Startvorschlag** für die Kategorie (`categorySource: 'bank'`) über eine feste Zuordnungstabelle Sparkasse → Kostenblick. Eigene Regeln und manuelle Zuordnungen haben Vorrang.
- Echte identische Doppelzeilen kommen vor (z. B. zwei gleiche Bargeldauszahlungen am selben Tag). Der Zähler `:n` im `dedupeKey` ist also Pflicht.
- Buchungstexte mit Sonderbedeutung:
  - `EIGENE KREDITKARTENABRECHN.` ist eine Umbuchung zur Kreditkarte (siehe 4b).
  - `LS WIEDERGUTSCHRIFT` / `WIEDERGUTSCHRIFT` sind Rücklastschriften. Sie zählen nicht als Einnahme, sondern neutralisieren die ursprüngliche Lastschrift (gleiche Kategorie, positiver Betrag).
  - `UEBERTRAG (…)` sowie Daueraufträge mit Kategorie „Geldanlage“ sind Übertragungen auf eigene Konten bzw. Sparen (Behandlung siehe Entscheidungen).
  - `ENTGELTABSCHLUSS` / `ABSCHLUSS` sind Kontoführungsgebühren ohne Gegenpartei.
- Ein Export kann **zwei Jahre** umfassen (Erstimport der Historie). Die Import-Vorschau und das Speichern müssen über 1.000 Zeilen flüssig bewältigen.

### 4b. Sparkassen-Kreditkarte (eigenes CSV-Format)

Die Kreditkarten-Umsätze kommen als eigene CSV (gleiche Kodierung, `;`, Datum `TT.MM.JJ`) mit diesen Spalten: Umsatz getätigt von, Belegdatum, Buchungsdatum, Originalbetrag, Originalwährung, Umrechnungskurs, Buchungsbetrag, Buchungswährung, Transaktionsbeschreibung, Transaktionsbeschreibung Zusatz, Buchungsreferenz, Gebührenschlüssel, Länderkennzeichen, BAR-Entgelt+Buchungsreferenz, AEE+Buchungsreferenz, Abrechnungskennzeichen.

- Das Format wird **automatisch am Header erkannt**: Girokonto (CAMT V2) oder Kreditkarte. Die Kreditkarte ist ein eigenes `Account` (`type: 'credit_card'`, nur die letzten vier Ziffern der Karte).
- Maßgeblich sind `Buchungsbetrag` und `Buchungsdatum`; `Belegdatum` wird als Kaufdatum gespeichert.
- Bei Fremdwährungen werden Originalbetrag, Währung und Kurs gespeichert. Die Zeile `1% für Währungsumrechnung` ist eine eigene Gebührenbuchung (Kategorie Gebühren).
- **Keine Doppelzählung:** Die Girokonto-Buchung `EIGENE KREDITKARTENABRECHN.` und die Kreditkarten-Zeile `Lastschrift` mit gleichem positiven Betrag sind **ein Transfer-Paar** (`isTransfer = true` auf beiden Seiten). Als Ausgaben zählen nur die Einzelumsätze der Karte. Wird keine Kreditkarten-CSV importiert, zählt die Abrechnung auf dem Girokonto als eine Ausgabe in der Kategorie „Kreditkarte (nicht aufgeschlüsselt)“.
- `dedupeKey` für Kreditkarten: `SHA-256(kartenHash | Belegdatum | Buchungsdatum | Buchungsbetrag | Beschreibung | Buchungsreferenz) + ':n'`.

**Test-Fixtures:** liegen anonymisiert unter `src/test/fixtures/sparkasse/` (siehe dortige `README.md` mit den erwarteten Ergebnissen je Datei). **Echte, unbearbeitete Exporte werden nie committet.**

## 5. Teilphasen

Jede Teilphase: analysieren → umsetzen → testen → `npm run build && npm run test && npm run lint` → Commit(s) → kurzer Bericht. Erst danach die nächste.

### 14A – Discovery & Entscheidungen (kein Produktivcode)
- E1–E10 gegen den Code prüfen, Abweichungen begründen, offene Fragen sammeln.
- Entscheiden, wie die neue Navigation aussieht. Vorschlag: **Home, Buchungen, Statistik, Verträge, Mehr**; Abrechnungen wandern unter „Mehr“.
- Entscheiden, ob Buchungen synchronisiert werden (E9).
- Ergebnis: ein kurzes Entscheidungsdokument. **Human Gate: Freigabe durch Ercan.**

### 14B – Domain & Persistenz
- Entities, Repository-Interfaces und IndexedDB-Repositories, DB-Migration v3.
- Backup/Restore um die neuen Stores erweitern. Restore eines v2-Backups wird getestet.
- Sync-Typen und Supabase-Migration (falls freigegeben), inklusive SQL-Test.
- Kategorie-Seeds nach E6.
- **Akzeptanz:** Migration auf bestehenden Daten verlustfrei; alle bisherigen Tests grün.

### 14C – CSV-Parser (reine Funktionen)
- `domain/usecases/bankImport/parseSparkasseCsv.ts`: Datei → `ParsedBankStatement` (Zeilen mit Rohwerten und normalisierten Werten oder Fehler je Zeile).
- `computeDedupeKey`, `planImport(existing, parsed) → {new, duplicates, skippedPending}`.
- **Akzeptanz:** Alle Fixtures aus Abschnitt 4 sind abgedeckt; ein zweiter, überlappender Import ergibt 0 neue Duplikate.

### 14D – Import-Flow (UI)
- Route `/buchungen/import`: Auswählen → Format erkennen (Giro/Kreditkarte) → Prüfen → Vorschau → Speichern, analog zum bestehenden Bill-Import. Nach dem Import werden Transfer-Paare Giro ↔ Kreditkarte automatisch verknüpft.
- Die Vorschau zeigt: Zeitraum, Anzahl neu, Duplikate, vorgemerkte Umsätze, nicht kategorisierte Buchungen und die Summe aus Einnahmen und Ausgaben.
- Speichern in einer Transaktion; `ImportBatch` mit „Import rückgängig machen“.
- **Akzeptanz:** Vor dem Speichern existiert keine Buchung; Abbrechen hinterlässt nichts.

### 14E – Kategorisierung
- Regel-Engine `categorizeTransaction(tx, rules, contracts)`. Reihenfolge: manuell → Vertragszuordnung → eigene Regeln nach Priorität → Sparkassen-Kategorie (Mapping) → keine Kategorie.
- Mitgelieferte Basisregeln, konservativ (z. B. Gehalt nur über eine vom Nutzer gesetzte Regel; Supermärkte über bekannte Namen).
- Manuell ändern → Frage „Immer so zuordnen?“ → neue Regel → optional auf bestehende, nicht manuell gesetzte Buchungen anwenden.
- Umbuchungen auf eigene Konten markieren (`isTransfer`).
- **Akzeptanz:** Eine manuelle Zuordnung wird nie von einer Regel überschrieben.

### 14F – Fixkosten & Verträge (Soll/Ist)
- Vertrag ↔ Buchung zuordnen, zuerst über Gläubiger-ID oder Mandatsreferenz, dann über den Gegenparteinamen. Vorschläge bestätigt der Nutzer.
- Vertragsdetail: Abbuchungen der letzten Monate, Abweichung zum Soll („erwartet 39,99 €, abgebucht 44,99 €“) und Hinweis auf eine fehlende Abbuchung.
- Fixkosten-Übersicht: Summe der Vertrags-Sollwerte gegenüber den tatsächlichen Abbuchungen im Monat.
- **Akzeptanz:** Soll-Werte fließen nie in die Ausgaben-Summen ein (E7).

### 14G – Neues Dashboard & Buchungsliste
- Dashboard nach dem Konzeptbild: Kennzahlkarten (Einnahmen, Ausgaben, Saldo, Sparziel) mit Vormonatsvergleich über das bestehende `calculatePercentageChange`; Zeitverlauf Einnahmen/Ausgaben; Donut und Balken „Ausgaben nach Kategorie“; letzte Buchungen; Monatswähler.
- Charts als handgerollte SVG-Komponenten wie bisher, keine neue Chart-Library, `sr-only`-Alternativen.
- Buchungsliste `/buchungen`: Suche, Filter (Monat, Kategorie, Einnahme/Ausgabe, unkategorisiert), Detail mit Kategorie ändern.
- Empty State ohne Buchungen: Erklärung und Button „Sparkassen-CSV importieren“.
- Desktop mit Sidebar und zusätzlichen Spalten, Mobile wie im Konzept-Handy.
- **Akzeptanz:** Alle Dashboard-Zahlen sind aus Buchungen nachrechenbar (Use-Case-Tests); Prüfung im iPhone-15-Pro-Viewport.

### 14H – Sparziel & Tipp-Karte
- Sparziel in den Einstellungen setzen; Fortschritt nach E5.
- Tipps sind regelbasiert und ausschließlich aus echten Daten abgeleitet (z. B. „Freizeit −12 % zum Vormonat“, „3 Buchungen ohne Kategorie“, „Vertrag X teurer abgebucht als hinterlegt“). Ohne Datenbasis gibt es keinen Tipp, keine Floskeln.

### 14I – Abschluss
- `CLAUDE.md` und `RELEASE.md` aktualisieren, Version 1.2.0.
- Manueller Test auf dem iPhone mit einem echten Export.

## 6. Startprompt für Claude Code

> Lies `CLAUDE.md` und `docs/specs/phase-14-finanztracker.md`. Führe **nur Phase 14A** aus: Prüfe die Entscheidungen E1–E10 gegen den aktuellen Code, benenne Konflikte und Risiken, beantworte die offenen Punkte aus 14A mit Empfehlung und lege das Ergebnis als `docs/specs/phase-14a-entscheidungen.md` an. Schreibe keinen Produktivcode. Danach stoppen und auf Freigabe warten.

## 7. Entscheidungen von Ercan

Stand: offen bis zur Bestätigung. Vorschlag in Klammern; Claude Code übernimmt die bestätigte Fassung in `phase-14a-entscheidungen.md`.

1. Buchungen über Supabase synchronisieren? (Vorschlag: ja, mit Schalter „Buchungen nur lokal“)
2. Kreditkarten-CSV mit importieren? (Vorschlag: ja, nach 4b)
3. Daueraufträge auf eigene Spar-/Anlagekonten („Geldanlage“, `UEBERTRAG`)? (Vorschlag: gelten als **Sparen** – keine Ausgabe, zählen zum Sparziel-Fortschritt)
4. Navigation: Home, Buchungen, Statistik, Verträge, Mehr. (Vorschlag: so übernehmen)
5. Sparkassen-Kategorie als Startvorschlag nutzen. (Vorschlag: ja)
6. Höhe des Sparziels: wird in der App eingestellt, kein Code-Wert.
