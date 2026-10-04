# Kostenblick – Phase 14A: Entscheidungen & Prüfung

> Bezug: `docs/specs/phase-14-finanztracker.md` (Abschnitte 3, 4, 4b, 5).
> Basis: `main` @ `3e42794` (Spec-Upload) bzw. Branch-Stand mit den
> verschobenen Fixtures. Geprüft gegen den Code, nicht nur gegen die Spec;
> Zahlen zu den Fixtures sind nachgerechnet, nicht geschätzt.
>
> **Status: wartet auf Freigabe durch Ercan (Human Gate).** Kein
> Produktivcode in dieser Phase.

## 0. Kurzfassung

| Thema | Ergebnis |
|---|---|
| E1–E10 | Tragfähig, aber mit mehreren nötigen Änderungen (unten fett markiert). Die größten: `isTransfer` → `flowType`, neue Entities ohne Soft-Delete, Restore v2 + Kategorie-Seeds, Dashboard-Umbau gegen Phase 9. |
| Sync (E9) | Entschieden: **kein Sync**. Code-seitig fast kostenlos (siehe 2.9), Restrisiko nur bei Verweisen auf synchronisierte Verträge. |
| DB v3 + Restore | Ohne Änderung würde **jedes bisherige Backup unwiederherstellbar** (`restore.ts:74`) und ein v2-Restore würde die neuen Kategorien löschen. Lösung in 2.8. |
| Doppelzählung Giro/Kreditkarte | Paarung funktioniert, braucht aber ein Datumsfenster (in den Fixtures 4–6 Tage Versatz). Echte Doppelzählungs-Lücke bei zeitversetztem Import → Regel in 4.3 (bestätigt Entscheidung 2 mit Präzisierung). |
| Sparziel-Formel | Entscheidung 3 zählt das Gesparte **doppelt**, wenn „Monatssaldo“ wie in E5 definiert ist → Präzisierung in 4.4. |
| Fixtures | Zwei echte Händlernamen gefunden und vor dem Commit anonymisiert (siehe 7). |

## 1. Bestätigte Entscheidungen (Ercan)

Wörtlich übernommen; darunter jeweils, was sie für Code und Spec bedeuten.

1. **Sync: NEIN.** Buchungen, Konten, Importchargen, Kategorieregeln und
   Sparziel bleiben nur lokal auf dem Gerät.
   - Die neuen Entities kommen **nicht** in `SYNC_ENTITY_TYPES`, keine
     Supabase-Migration. Der bestehende Sync bleibt unverändert und darf von
     den neuen Stores nicht beeinflusst werden, auch nicht über
     `syncQueue`-Einträge.
   - Backup/Restore ist damit die einzige Sicherung: Die neuen Stores
     **müssen** vollständig in Backup und Restore enthalten sein (inkl.
     Test). Hinweis „Backup erstellen?“ nach jedem Import (siehe 5).
   - Der Haushalts-Beitritt („Zusammenführen“/„Ersetzen“) darf lokale
     Buchungen nicht löschen.
2. **Kreditkarte: JA**, Einzelumsätze importieren (Spec 4b).
   `EIGENE KREDITKARTENABRECHN.` (Giro) und „Lastschrift“ (Kreditkarte)
   bilden ein Transfer-Paar und zählen nie als Ausgabe. Solange für einen
   Abrechnungszeitraum keine Kreditkarten-CSV importiert ist, zählt die
   Giro-Abrechnung als Ausgabe „Kreditkarte (nicht aufgeschlüsselt)“ –
   sobald die Einzelumsätze da sind, automatisch als Transfer.
   → Präzisierung des Begriffs „Abrechnungszeitraum“ in 4.3.
3. **Überweisungen auf eigene Spar-/Anlagekonten** (Sparkassen-Kategorie
   „Geldanlage“, `UEBERTRAG` auf eigene Konten) zählen als **Sparen**: weder
   Einnahme noch Ausgabe, eigene Kennzahl „Gespart“, Teil des
   Sparziel-Fortschritts: Fortschritt = (Monatssaldo + Gespart) / Ziel.
   Eigenes Feld statt `isTransfer`:
   `flowType: 'income' | 'expense' | 'transfer' | 'saving'`.
   → Definition von „Monatssaldo“ muss angepasst werden, sonst
   Doppelzählung (4.4). Gegenrichtung (Geld kommt vom Sparkonto zurück) ist
   offen (O-3).
4. **Navigation:** Home, Buchungen, Statistik, Verträge, Mehr
   (Abrechnungen unter „Mehr“).
5. **Sparkassen-Spalte „Kategorie“** als Startvorschlag
   (`categorySource: 'bank'`); manuelle Zuordnung und eigene Regeln haben
   Vorrang. → Zuordnungstabelle in 3.3.
6. **Sparziel-Höhe** wird in der App eingestellt, kein Code-Wert.

## 2. Prüfung E1–E10 gegen den Code

### 2.1 E1 – Neue Entity `Transaction`

Bestätigt: eigene Entity statt `CostEntry` zu erweitern. `CostEntry`
(`entities.ts:71`) hat weder Vorzeichen-Semantik noch Gegenpartei oder
Duplikatschlüssel; eine Erweiterung würde die Kostenübersicht
(`centralCosts.ts`) und die Phase-9-Regeln mitreißen.

**Änderungen gegenüber der Spec:**
- **`isTransfer` entfällt**, ersetzt durch
  `flowType: 'income' | 'expense' | 'transfer' | 'saving'` (Entscheidung 3)
  plus `flowTypeSource: 'manual' | 'rule' | 'auto'`, analog zu
  `categorySource`. Grund: Die automatische Paarung (4.3) muss den Fluss
  später ändern und bei „Import rückgängig“ wieder zurücksetzen können,
  ohne je eine manuelle Festlegung zu überschreiben.
- **Neu: `transferPairId?`** (ID der Gegenbuchung). Ohne gespeicherte
  Verknüpfung lässt sich beim Rückgängigmachen eines Kreditkarten-Imports
  nicht sicher sagen, welche Giro-Buchung wieder zur Ausgabe wird.
- **Keine Sync-Felder** (`deletedAt`, `syncVersion`, `userId`), nur
  `PersistedEntity` (`id`, `createdAt`, `updatedAt`). CLAUDE.md verlangt
  die Sync-Felder nur für sync-fähige Entities, und Entscheidung 1 macht
  die neuen Entities ausdrücklich nicht sync-fähig. Zusätzlicher Grund: der
  eindeutige `dedupeKey`-Index (2.8).
- `originalAmount`/`originalCurrency`/`exchangeRate` nur setzen, wenn die
  CSV eine Originalwährung enthält (siehe 3.2: `0,00`/`1,00` sind dort
  Platzhalter, keine echten Werte).

### 2.2 E2 – `Account`

Bestätigt. Präzisierung:
- `identifierHash` = SHA-256 der normalisierten IBAN (Großbuchstaben, ohne
  Leerzeichen) bzw. des maskierten Kartenstrings
  (`0000 **** **** 0000`). `last4` daraus.
- Ehrliche Einordnung: Ein ungesalzener Hash ist bei bekannter
  Bankleitzahl in überschaubarer Zeit per Brute Force umkehrbar (etwa 10¹⁰
  Kontonummern). Er pseudonymisiert, er anonymisiert nicht. Weil die Daten
  nur lokal liegen, ist das vertretbar. **Empfehlung:** ein zufälliges Salz
  pro Account, im Account gespeichert. Kostet nichts, verhindert
  vorberechnete Tabellen, und die Zuordnung funktioniert weiter (für jede
  CSV über alle Accounts prüfen). Die Gegen-IBAN (`counterpartyIban`) liegt
  ohnehin im Klartext vor, weil Regeln sie brauchen.

### 2.3 E3 – `ImportBatch`

Bestätigt, mit einer **Änderung:** „Import rückgängig machen“ löscht die
Buchungen der Charge **hart** (in einer Transaktion), nicht per Soft-Delete.
Ein Soft-Delete würde den eindeutigen `dedupeKey` belegen, ein erneuter
Import derselben Datei würde dann mit `ConstraintError` scheitern (2.8). Ohne
Sync werden keine Tombstones gebraucht. Beim Rückgängigmachen werden
Transfer-Paare gelöst (`transferPairId` der Gegenbuchung entfernen,
`flowType` mit `flowTypeSource: 'auto'` neu ableiten).
Akzeptanztest: importieren → rückgängig → erneut importieren ergibt
dieselben Buchungen.

### 2.4 E4 – `CategoryRule`

Bestätigt, mit einer **Erweiterung:** optionales Ziel `flowType` neben
`categoryId`. In den Fixtures gehen Daueraufträge an dieselben eigenen
Gegenkonten mal als „Geldanlage“, mal als „Mobilität“ oder „Absicherung und
Vorsorge“ hinaus (siehe 4.4). Ein „eigenes Konto“ lässt sich nur über eine
Regel auf `counterpartyIban` zuverlässig markieren
(`→ flowType: 'saving'`).

### 2.5 E5 – `SavingsGoal`

Bestätigt (ein Monatsziel, in der App einstellbar → Entscheidung 6, in
IndexedDB statt `localStorage`, damit es im Backup landet). **Formel
geändert** durch Entscheidung 3, aber mit präzisierter Saldo-Definition,
siehe 4.4. Begrenzung 0–100 %, negativer Wert = 0 % mit klarer Anzeige,
bleibt.

### 2.6 E6 – Kategorien

Bestätigt im Grundsatz. **Konflikte:**
- **Doppelte Begriffe:** „Versicherungen“ gibt es schon (`insurance`,
  „Versicherung“), „Sonstiges“ (`other`) und „Telekommunikation“
  (`telecom`) auch. Bestehende IDs wiederverwenden, keine zweite Kategorie
  mit gleicher Bedeutung anlegen.
- **„Umbuchung“ als Kategorie entfällt:** Transfer ist mit `flowType` ein
  Fluss, keine Kategorie. Beides parallel wäre eine zweite Quelle der
  Wahrheit.
- **Es fehlen Seeds, die die Spec selbst voraussetzt:** „Kreditkarte (nicht
  aufgeschlüsselt)“ (Entscheidung 2), „Steuern & Gebühren“ (4b spricht von
  „Kategorie Gebühren“, E6 hat keine), „Sparen“ (Entscheidung 3).
  Vorschlag, offen in O-4: „Einkäufe“, „Reisen“, „Bildung“ (Sparkassen-
  Kategorien ohne Gegenstück, 3.3).
- **Bestehende Installationen bekommen keine neuen Seeds:** Seeds werden
  nur bei `oldVersion < 1` geschrieben (`database.ts:77`). Der v3-Block muss
  fehlende Seeds ergänzen und `group: 'wohnen'` an den bestehenden setzen.
- **Restore löscht neue Seeds:** Restore ersetzt `categories` vollständig
  (`restore.ts:234`). Ein v2-Backup bringt nur die 11 alten Seeds mit.
  Nach dem Restore fehlen dann alle neuen Kategorien. Lösung in 2.8.
- `CategoryType` um `'income'` erweitern ist risikoarm: Kein Code filtert
  bisher nach `Category.type` (nur der Index `type` existiert).

### 2.7 E7 – Keine Doppelzählung

Bestätigt. **Konflikt mit Phase 9, bewusst in Kauf zu nehmen und in
CLAUDE.md zu dokumentieren:** Das Dashboard rechnet seit Phase 9 über die
zentrale Projektion Bill + WasteCost + CostEntry (`dashboard.ts:241`). E7
dreht das für die Geldwerte auf Buchungen um. Neben `Transaction` darf die
alte Projektion dort nicht weiterlaufen, denn Abrechnungen und Müllgebühren
werden real vom Girokonto bezahlt, tauchen also auch als Buchung auf.

Konkrete Folgen:
- `MonthlyCostCard`, `YearlyCostCard`, `CostTrendChart` und
  `CategoryCostChart` werden ersetzt bzw. auf Buchungen umgestellt.
- Der Satz „Bereits in den Jahreskosten oben enthalten.“
  (`WasteCostsSummaryCard.tsx:25`) wird falsch. Karte vom Dashboard nehmen
  oder Text ändern.
- `DashboardAggregationWarning` gehört zur alten Projektion und bleibt nur
  noch auf `/kostenuebersicht`.
- Die Kostenübersicht bleibt unverändert und rechnet weiter über die
  Projektion. Sie und das Dashboard zeigen damit absichtlich
  unterschiedliche Summen. Beide brauchen eine klare Beschriftung
  (Kostenübersicht: „erfasste Kosten“, Dashboard: „Kontobewegungen“).
- Nutzer ohne Import sehen sonst ein leeres Dashboard, obwohl sie
  Abrechnungen und Kosten erfasst haben. Deshalb: Empty State mit
  „Sparkassen-CSV importieren“ **und** Link „Kostenübersicht“.
- `RunningContractCostsCard` (Soll, Phase 11E) wird in 14F zum Soll/Ist,
  passt zu E7.

### 2.8 E8 – Datenbank v3

Additive Migration ist mit dem vorhandenen Muster möglich (`if (oldVersion
< N)`-Blöcke, `database.ts`). **Nötige Ergänzungen:**

1. **Eindeutigkeit:** zusammengesetzter Index `['accountId',
   'dedupeKey']`, `unique: true`. Funktioniert nur mit harter Löschung
   (2.3).
2. **Repository:** `IndexedDBRepository` setzt `SyncableEntity` mit
   Soft-Delete voraus und öffnet pro `save()` eine eigene Transaktion
   (`repository.ts:23/49`). Für 1.000+ Zeilen „in einer Transaktion“
   (14D) braucht es ein eigenes lokales Repository mit `bulkPut`/
   `deleteMany`. Es berührt die `syncQueue` nicht: `tracksSync()` gibt für
   Stores außerhalb `SYNC_ENTITY_TYPES` bereits `false` zurück
   (`repository.ts:80`).
3. **v3-Block:** fünf neue Stores, fehlende Kategorie-Seeds ergänzen,
   `group` an bestehenden Seeds setzen.
4. **Schema-Wechsel bei offener alter Verbindung:** `getDatabase()` hat
   keinen `blocking`-Handler. Ein noch offener Tab mit v2-Code blockiert das
   Upgrade auf v3, die neue Version hängt dann beim Laden. Das ist der erste
   Versionssprung nach dem Release, deshalb: `blocking() { db.close() }`
   ergänzen.
5. **Backup/Restore (Pflicht wegen Entscheidung 1):**
   - Ohne Änderung lehnt `checkBackupCompatibility()` jedes Backup mit
     `databaseVersion !== DATABASE_VERSION` ab (`restore.ts:74`). Nach dem
     Update ließe sich **kein einziges bisheriges Backup** mehr
     wiederherstellen. → `databaseVersion` 2 **und** 3 annehmen.
   - `BACKUP_FORMAT_VERSION` 1 → 2 (die Struktur bekommt neue Schlüssel;
     CLAUDE.md: erhöhen, wenn sich die Struktur ändert). Restore nimmt 1 und
     2 an. `validateBackup()` prüft die neuen Schlüssel nur bei
     `formatVersion ≥ 2`; fehlende Schlüssel eines v1-Backups gelten als
     leere Liste.
   - Ein v1-Backup ersetzt weiterhin **alles**, also auch die lokalen
     Buchungen (bisherige „vollständiger Ersatz“-Regel). Weil Buchungen
     nirgends sonst gesichert sind, muss die Bestätigung das deutlich sagen:
     „Dieses Backup enthält keine Buchungen. Die X Buchungen auf diesem
     Gerät werden gelöscht.“ Davor wird ein aktuelles Backup angeboten.
   - **Kategorien nach dem Restore:** im selben Restore-Vorgang alle
     fehlenden Standard-Seeds (nach ID) ergänzen. Das weicht bewusst von
     Phase 12C ab („vollständig ersetzt“) und wird in CLAUDE.md
     dokumentiert.
   - Referenzprüfung erweitern: Transaction→Account und
     Transaction→ImportBatch sind Pflicht, CategoryRule→Category ebenso.
     **Transaction→Contract darf nicht als Fehler gelten**, siehe 2.9.
   - Tests: Restore eines v2-Backups (alte Daten da, neue Stores leer,
     neue Seeds vorhanden), v3-Rundreise inkl. Buchungen, Atomizität wie in
     Phase 12C.

### 2.9 E9 – Sync

Durch Entscheidung 1 erledigt: kein Eintrag in `SYNC_ENTITY_TYPES`, keine
Supabase-Migration, keine `protected_fields`. Geprüft:
- **syncQueue:** `save()`/`delete()` schreiben nur für sync-fähige Stores
  in die Queue (`repository.ts:80–96`). Neue Stores sind automatisch
  ausgenommen. Ein Test sichert das ab.
- **Haushalt:** `clearLocalSyncData()` („Ersetzen“) und
  `adoptLocalDataIntoHousehold()` arbeiten nur auf `SYNC_ENTITY_TYPES` plus
  Queue (`householdData.ts:9`). Lokale Buchungen bleiben erhalten. Ein Test
  sichert das ab.
- **Restrisiko, Verweise auf synchronisierte Daten:**
  `Transaction.contractId` zeigt auf einen *synchronisierten* Vertrag. Nach
  „Ersetzen“ (der Haushalt bringt neue Vertrags-IDs mit) oder wenn ein
  anderes Gerät einen Vertrag löscht, zeigt die Verknüpfung ins Leere.
  Folgen:
  - Die UI zeigt „Vertrag nicht mehr vorhanden“, der Soll/Ist-Abgleich
    schlägt neu vor.
  - Die Restore-Referenzprüfung toleriert solche Verweise (sonst wäre ein
    Backup aus genau diesem Zustand nicht mehr wiederherstellbar).
  - **Nie** einen Verweis auf Buchungen am Vertrag speichern: der Vertrag
    synchronisiert, die Buchungen nicht.

### 2.10 E10 – Datenschutz

Bestätigt. Ergänzungen:
- `TextDecoder('windows-1252')` und `crypto.subtle` gibt es im Browser und
  in Node (in dieser Umgebung geprüft). Kein Netzwerk, keine neue
  Abhängigkeit.
- Fehlermeldungen nennen Zeilennummer und Spalte, nie den Zeileninhalt.
  Keine Kontodaten in `console`.
- Die Backup-Datei enthält künftig Kontoumsätze. Hinweis im Backup-Bereich:
  „Enthält deine Kontoumsätze – sicher aufbewahren.“

## 3. Prüfung Abschnitt 4 / 4b gegen die Fixtures

### 3.1 Girokonto (CSV-CAMT V2)

| Regel | Befund in den Fixtures | Folge |
|---|---|---|
| Kodierung Windows-1252, LF | Alle fünf Dateien Windows-1252, nur LF, kein CR | Parser kann LF und CRLF; zusätzlich UTF-8 erkennen (O-6) |
| `;`, Anführungszeichen, `;`/Umbruch im Feld, `""` | Kommen in `edgecases` vor | Eigener kleiner Parser, keine Bibliothek |
| Spalten über Header | 18 Spalten (mit `Kategorie`), Variante mit 16 ohne `Glaeubiger ID`/`Kategorie` | Header-Map, fehlende optionale Spalten = leer |
| Pflichtspalten | `fehlende-pflichtspalte` ohne `Betrag` | Fehler, kein Teilimport |
| Datum `TT.MM.JJ` | Bereich 09.12.24–22.09.26 | Jahr = 2000 + JJ |
| Betrag | `-1234,56`, `1.234,56` | Bestehendes `parseGermanAmount` (`utils/money.ts`) passt für Beträge |
| Vorgemerkt | 1 Zeile in `edgecases` | Überspringen und zählen |
| Doppelzeile | 15.05.26, −62,38 € zweimal | `:0`/`:1` |
| Verwendungszweck | `KREDITKARTENABRECHNUNG 17.0 7.26 …` (Leerzeichen mitten im Datum) | Siehe unten |

**Normalisierung für den `dedupeKey`:** Das Leerzeichen in `17.0 7.26`
sieht nach einem festen Zeilenumbruch der Bank aus. Damit ein anders
umgebrochener Export denselben Schlüssel ergibt, beim Normalisieren
**alle** Leerzeichen entfernen und in Großbuchstaben umwandeln, nicht nur
mehrfache Leerzeichen zusammenfassen. Den angezeigten Verwendungszweck
nicht verändern.

**Zähler `:n`:** Identische Zeilen liegen immer am selben Buchungstag. Der
Export schneidet nach ganzen Tagen, also enthalten zwei überlappende
Exporte für einen gemeinsamen Tag dieselben identischen Zeilen. Der Zähler
ist damit stabil.

**Performance:** Für den Abgleich die vorhandenen Schlüssel des Kontos
einmal in ein `Set` laden statt pro Zeile im Index zu suchen. Schreiben per
`bulkPut` in einer Transaktion.

### 3.2 Kreditkarte (4b)

| Regel | Befund | Folge |
|---|---|---|
| Format am Header erkennen | Header mit Umlauten (`Umsatz getätigt von`, `Originalwährung`) | Erkennung funktioniert nur nach korrekter Dekodierung (O-6) |
| Pflichtspalten | In der Spec nicht festgelegt | Vorschlag: `Umsatz getätigt von`, `Buchungsdatum`, `Buchungsbetrag`, `Transaktionsbeschreibung` |
| Karte | `0000 **** **** 0000` (maskiert) | Hash des maskierten Strings, `last4` |
| Fremdwährung | 7 CHF-Zeilen, Kurs `0,94`/`0,93` | **Kurs nicht mit `parseGermanAmount` parsen**: rundet auf 2 Stellen, ein echter Kurs wie `0,9357` würde verfälscht |
| EUR-Zeilen | `Originalbetrag 0,00`, `Umrechnungskurs 1,00` | Platzhalter: `original*`/`exchangeRate` nur setzen, wenn `Originalwährung` gefüllt ist |
| Gebühr `1% für Währungsumrechnung` | Händlername steht im Feld `Zusatz` | Kategorie „Steuern & Gebühren“, Gegenpartei = `Zusatz` |
| `Lastschrift` | +2.232,77 (14.09.26), +1.182,72 (14.08.26) | **Immer** `transfer`, nie Einnahme |
| Vorgemerkte Umsätze | Keine `Info`-Spalte, `Abrechnungskennzeichen` überall leer | Vorgemerkte Kartenumsätze sind nicht erkennbar (O-7) |
| `Buchungsreferenz` | 66 verschiedene Werte, keine doppelt | `:n` nur als Absicherung |

### 3.3 Zuordnung Sparkassen-Kategorie → Kostenblick (Entscheidung 5)

(Alle 18 Kategorien aus der Fixture; Vorschlag, vorbehaltlich O-4/O-10.)

| Sparkasse | Kostenblick |
|---|---|
| Absicherung und Vorsorge | Versicherungen (bestehendes `insurance`) |
| Bargeld | Bargeld |
| Bekleidung | Kleidung |
| Bildung und Erziehung | Sonstiges (`other`) |
| Einkommen | Sonstige Einnahmen (mit `LOHN  GEHALT` → Gehalt, O-10) |
| Einkäufe | Einkäufe (neu, O-4) |
| Freizeit und Unterhaltung | Freizeit |
| Geldanlage | `flowType: 'saving'`, Kategorie „Sparen“ |
| Gesundheit und Wellness | Gesundheit |
| Lebensmittel und Drogerie | Lebensmittel |
| Mobilität | Mobilität |
| Nicht zugeordnet | keine (`categorySource: 'none'`) |
| Reisen | Freizeit |
| Sonstiges | keine (damit der Filter „unkategorisiert“ greift) |
| Sport und Hobby | Freizeit |
| Steuern und Gebühren | Steuern & Gebühren (neu) |
| Telekommunikation | Telekommunikation (bestehendes `telecom`) |
| Wohnen und Garten | Wohnen |

Strukturregeln gehen der Bank-Kategorie immer vor: `EIGENE
KREDITKARTENABRECHN.` hat in der Fixture die Bank-Kategorie „Sonstiges“,
ist aber Transfer bzw. „Kreditkarte (nicht aufgeschlüsselt)“.

## 4. Risiken

### 4.1 DB-Migration v3 und Restore alter Backups

Siehe 2.8. Zusammengefasst: ohne Anpassung (a) kein bisheriges Backup
mehr wiederherstellbar, (b) ein v2-Restore löscht die neuen Kategorien,
(c) ein v2-Restore löscht still alle Buchungen, (d) das Upgrade kann an
einem offenen alten Tab hängen. Alle vier lassen sich ohne
Architekturänderung lösen; jede bekommt einen Test.

### 4.2 Sync-Migration

Keine (Entscheidung 1). Restrisiko nur bei Vertragsverweisen (2.9).

### 4.3 Doppelzählung Girokonto ↔ Kreditkarte

**Aus den Fixtures nachgerechnet:**

| Giro `EIGENE KREDITKARTENABRECHN.` | Kreditkarte `Lastschrift` | Versatz |
|---|---|---|
| 18.09.26 −2.232,77 | 14.09.26 +2.232,77 | 4 Tage |
| 20.08.26 −1.182,72 | 14.08.26 +1.182,72 | 6 Tage |
| 20.07.26 −2,90 | – (vor Beginn der Karten-CSV) | – |
| 19.06.26 −780,73 | – | – |

Dazu `05.03.25 KREDITKARTENABRECHNUNG −139,59` an eine *andere*
Gegenpartei. Das ist eine andere Buchungsart, offenbar eine andere Karte
(O-2).

**Paarungsregel (Vorschlag):** gleicher Betrag auf den Cent, Giro-Datum
0–10 Tage nach dem Karten-`Lastschrift`-Datum, 1:1, nächstliegendes Datum
zuerst. Danach `flowType: 'transfer'` und `transferPairId` auf beiden
Seiten.

**Lücke im Wortlaut von Entscheidung 2:** „sobald die Einzelumsätze da
sind“ ist nicht dasselbe wie „die Lastschrift-Zeile ist da“. Ein realer
Ablauf:
1. Am 22.09. die Kreditkarten-CSV importieren: Umsätze bis 22.09., noch
   keine Lastschrift für die nächste Abrechnung.
2. Am 20.10. die Giro-CSV importieren: enthält die Abrechnung vom 18.10.,
   die sich noch nicht paaren lässt.
3. Ergebnis: Die Umsätze 15.–22.09. zählen als Ausgabe **und** die volle
   Abrechnung zählt als „Kreditkarte (nicht aufgeschlüsselt)“.
   **Doppelzählung**, bis die nächste Kreditkarten-CSV kommt.

**Empfehlung, präzisiert Entscheidung 2 (O-1):** Eine ungepaarte
Giro-Abrechnung zählt nur dann als Ausgabe, wenn für ihren Zeitraum (seit
der letzten gepaarten Lastschrift dieses Kartenkontos) **keine**
Kartenumsätze importiert sind. Andernfalls gilt sie vorläufig als Transfer
mit dem sichtbaren Hinweis „Kreditkarten-Export unvollständig, bitte
aktuelle Kreditkarten-CSV importieren“. Ohne Kartenkonto bleibt es bei der
Ausgabe. Das lieber kurzzeitig zu niedrig, dafür klar markiert, statt
doppelt (E7 Kernregel).

**Bewusst kein errechneter „Rest“** (Abrechnungsbetrag minus zugeordnete
Umsätze): Die Abrechnungsgrenzen stehen nicht in der CSV
(`Abrechnungskennzeichen` leer). Die Fixture-Summen passen wegen der
skalierten Beträge auch innerhalb eines vollständigen Fensters nicht zur
Lastschrift (1.277,13 € gegenüber 2.232,77 €). Ein Rest wäre damit
erfunden.

**Rand der Kartenhistorie:** Die Karten-CSV beginnt am 16.07.26
(Belegdatum). Die am 20.08. gepaarte Abrechnung kann ältere Umsätze
enthalten, die nicht importiert sind. Hinweis an der Paarung: „Einzelumsätze
erst ab 16.07.26 vorhanden“, statt still zu wenig Ausgaben zu zeigen.

### 4.4 Sparen: Formel und Gegenrichtung

**Doppelzählung in der Formel:** Beispiel: Einnahmen 3.000 €, Ausgaben
2.000 €, 500 € aufs Tagesgeld.
- Mit dem Saldo aus E5 (Einnahmen − Ausgaben = 1.000 €) ergibt
  (Saldo + Gespart) / Ziel = 1.500 €. Tatsächlich übrig sind aber nur
  1.000 €; die 500 € stecken schon im Saldo.
- Die Formel aus Entscheidung 3 stimmt, wenn „Monatssaldo“ das ist, was auf
  dem Girokonto übrig bleibt: Einnahmen − Ausgaben − Gespart = 500 €.
  Dann gilt (500 + 500) / Ziel = 1.000 €.

**Empfehlung (O-5):** Kennzahlkarte „Saldo“ = Einnahmen − Ausgaben −
Gespart („frei übrig“), Karte „Gespart“ separat, Fortschritt =
(Saldo + Gespart) / Ziel. So gilt die Formel wörtlich und nichts zählt
doppelt.

**Fixtures zeigen weitere Fälle:**
- Hinaus mit „Geldanlage“: Daueraufträge −41,21/−45,71, Online-Überweisung
  −440,05, `UEBERTRAG` −200,00 (`edgecases`) → `saving`.
- `UEBERTRAG (UEBERWEISUNG)` −31,87/−14,19 mit Kategorie „Sonstiges“ →
  `saving` nach Entscheidung 3 (`UEBERTRAG` reicht).
- **Zurück:** `UEBERTRAG (GUTSCHR. UEBERW)` +76,36 (×2), +46,27 (×2) vom
  selben Gegenkonto, das die −440,05 bekam. Nicht geregelt (O-3).
- Daueraufträge an dieselben Gegenkonten mit „Mobilität“ (−39,33) bzw.
  „Absicherung und Vorsorge“ (−174,20) bleiben ohne Regel Ausgaben. Für
  „eigenes Konto“ braucht es die Regel aus 2.4.

### 4.5 Positive Beträge in Ausgabekategorien

Die Spec regelt nur Rücklastschriften. In der Giro-Fixture gibt es 29
positive Buchungen außerhalb „Einkommen“, z. B.:
- Erstattungen und Gutschriften: „Absicherung und Vorsorge“ +846,06,
  „Wohnen und Garten“ +221,14.
- Bareinzahlungen in „Bargeld“, darunter **+11.538,74**.
- Eine Bareinzahlung mit Bank-Kategorie „Bildung und Erziehung“ (+938,10).
  Die Bank-Kategorie ist bei Einzahlungen offensichtlich unzuverlässig.

Würde man positive Beträge in Ausgabekategorien stur als Ausgabenminderung
verbuchen, wäre z. B. die Kategorie Bargeld im Februar stark negativ.
**Empfehlung (O-8):**
- Rücklastschriften (`LS WIEDERGUTSCHRIFT`, `WIEDERGUTSCHRIFT`): wie in der
  Spec `expense` mit positivem Betrag, mindern die Ausgaben ihrer
  Kategorie.
- Sonst bestimmt das Vorzeichen: positiv = `income`.
  `BARGELDEINZAHLUNG*` ohne Bank-Kategorie-Vorschlag, Startkategorie
  „Sonstige Einnahmen“.
- Ordnet der Nutzer eine positive Buchung manuell einer Ausgabekategorie
  zu, gilt sie als Erstattung (`expense`, mindert die Ausgaben).

### 4.6 Navigation (Entscheidung 4)

`NAV_ITEMS` (`navigation.ts:73`) ändern; CLAUDE.md, Abschnitt UI/UX nennt
die alte Navigation wörtlich und wird angepasst. Hinweise:
- „Mehr“ braucht einen Eintrag „Abrechnungen“.
- Auf `/abrechnungen` ist danach kein Navigationspunkt aktiv. Das ist heute
  schon so für `/kosten`, `/dokumente` und `/muell`; konsistent, aber eine
  Kleinigkeit fürs Feintuning.
- Bestehende Layout-Tests, die die Navigationsreihenfolge prüfen, werden
  angepasst.

„Statistik“ bleibt Bill-basiert (Nebenkosten). In der neuen Navigation
direkt neben „Buchungen“ könnte man dort Buchungsstatistiken erwarten
(O-9).

## 5. Backup-Erinnerung (Entscheidung 1)

Es gibt **keine** Backup-Erinnerung. Der Bereich „Daten & Backup“ hat nur
den Button „Backup exportieren“, ohne Datum des letzten Backups und ohne
Hinweis. Für die neue Lage (Buchungen nur lokal) reicht das nicht.
Vorschlag:
1. Nach jedem erfolgreichen Import: Hinweis „Backup erstellen?“ mit einem
   Button, der direkt exportiert. „Später“ schließt den Hinweis, ohne zu
   speichern.
2. „Daten & Backup“ zeigt „Letztes Backup: <Datum>“ und einen Hinweis, wenn
   seitdem Buchungen importiert wurden. Der Zeitpunkt liegt in
   `localStorage`: ein gerätebezogener Komfortwert, keine Fachdaten.
3. Hinweis zur Vertraulichkeit der Backup-Datei (2.10).
4. Warnung vor einem v1-Restore, der Buchungen löschen würde (2.8).

## 6. Offene Fragen an Ercan (mit Empfehlung)

- **O-1 Kreditkarten-Zeitraum:** Präzisierung aus 4.3 übernehmen
  (ungepaarte Abrechnung vorläufig als Transfer, wenn Kartenumsätze für den
  Zeitraum vorliegen)? *Empfehlung: ja.*
- **O-2 `KREDITKARTENABRECHNUNG`** (andere Buchungsart, andere
  Gegenpartei): als Ausgabe „Kreditkarte (nicht aufgeschlüsselt)“, nie
  automatisch gepaart? *Empfehlung: ja.*
- **O-3 Geld vom Sparkonto zurück** (`UEBERTRAG (GUTSCHR. UEBERW)`): mindert
  „Gespart“ (netto)? *Empfehlung: ja, Gespart = Netto-Abfluss auf eigene
  Sparkonten, kann im Monat negativ sein und wird dann als „Entnahme“
  angezeigt.*
- **O-4 Zusätzliche Seeds:** „Einkäufe“, „Reisen“, „Bildung“ ergänzen oder
  auf Sonstiges/Freizeit abbilden? *Empfehlung: „Einkäufe“ ergänzen (7
  Buchungen in der Fixture), „Reisen“ und „Sport und Hobby“ → Freizeit,
  „Bildung“ → Sonstiges.*
- **O-5 Saldo-Definition:** Karte „Saldo“ = Einnahmen − Ausgaben − Gespart
  (4.4)? *Empfehlung: ja.*
- **O-6 UTF-8-Dateien:** Wer die CSV in Numbers/Excel öffnet und neu
  speichert, bekommt UTF-8. Automatisch erkennen (UTF-8 strikt versuchen,
  sonst Windows-1252)? *Empfehlung: ja, kostet wenige Zeilen.*
- **O-7 Vorgemerkte Kartenumsätze:** sind im Kreditkarten-Format nicht
  erkennbar. Alles importieren und auf „Abrechnungskennzeichen“ im echten
  Export achten? *Empfehlung: ja, beim iPhone-Test mit echtem Export
  prüfen (14I).*
- **O-8 Positive Beträge:** Regel aus 4.5 übernehmen? *Empfehlung: ja.*
- **O-9 Statistik-Menüpunkt:** bleibt Nebenkosten-Statistik? *Empfehlung:
  in Phase 14 ja, Titel auf „Nebenkosten-Statistik“ präzisieren;
  Buchungsstatistik später.*
- **O-10 Gehalt aus Bank-Kategorie:** „Einkommen“ + Buchungstext
  `LOHN  GEHALT` → „Gehalt“ als Startvorschlag (`categorySource: 'bank'`)?
  Das weicht von 14E ab („Gehalt nur über eine vom Nutzer gesetzte Regel“).
  *Empfehlung: ja, weil es nur ein Vorschlag mit sichtbarer Quelle ist;
  übriges „Einkommen“ → „Sonstige Einnahmen“.*

## 7. Plan-Änderungen für 14B–14I

- **14B:** zusätzlich lokales Repository (Bulk, harte Löschung), Restore
  v1/v2-kompatibel inkl. Seed-Ergänzung, `blocking`-Handler, Tests aus
  2.8/2.9. Ohne Sync-Typen und ohne Supabase-Migration.
- **14C:** Normalisierung aus 3.1, Kurs-Parsing aus 3.2, UTF-8-Erkennung
  (O-6), Formaterkennung Giro/Karte.
- **14D:** Paarung und Zeitraum-Regel aus 4.3, Hinweis „Backup erstellen?“,
  „Import rückgängig“ inkl. Lösen der Paare.
- **14E:** `flowType`-Ableitung (Strukturregeln → manuell → Regeln →
  Bank-Kategorie), Regeln mit `flowType`-Ziel, Zuordnungstabelle 3.3.
- **14G:** Dashboard-Umbau nach 2.7 inkl. Empty State mit Link zur
  Kostenübersicht; Saldo nach O-5.
- **14I:** CLAUDE.md: neue Regel E7 (Dashboard nur aus Buchungen),
  geänderte Restore-Regel für Kategorien, Navigation, „Buchungen nur
  lokal“.

## 8. Ablage und Datenhygiene (Schritt 1)

- Verschoben: Spec nach `docs/specs/`, Fixtures und README nach
  `src/test/fixtures/sparkasse/`. `.gitattributes`:
  `src/test/fixtures/sparkasse/*.csv -text`. Die CSVs sind byte-identisch
  geblieben (Windows-1252, LF).
- **Gefunden und behoben:** In `sparkasse-kreditkarte-sample.csv` standen
  in den beiden Gebührenzeilen „1% für Währungsumrechnung“ (Belegdatum
  24./25.08.26) noch echte Händlernamen im Feld `Transaktionsbeschreibung
  Zusatz`. Beide sind byte-genau durch die Platzhalter „Ort 29“/„Ort 30“
  ersetzt worden (eigener Commit, Kodierung unverändert). Keine echten
  IBANs, Kartennummern oder Personennamen gefunden.
- **Achtung:** Die ursprünglichen Werte stehen weiter in der Git-Historie
  (`3e42794`, Upload direkt auf `main`). Sie zu entfernen hieße, die
  Historie von `main` umzuschreiben (Force-Push). Das wurde bewusst nicht
  gemacht; die Entscheidung liegt bei Ercan.
