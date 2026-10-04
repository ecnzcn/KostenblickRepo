# Sparkassen-Test-Fixtures (anonymisiert)

Die Dateien sind aus echten Sparkassen-Exporten abgeleitet und **vollständig anonymisiert**: Namen, Verwendungszwecke, IBANs, BICs, Gläubiger-IDs, Mandats- und End-to-End-Referenzen sind durch konsistente Platzhalter ersetzt. Beträge sind zufällig skaliert. Struktur, Kodierung (Windows-1252), Zeilenenden (LF), Spaltenreihenfolge, Buchungstexte und Sparkassen-Kategorien sind original.

**Niemals echte, unbearbeitete Kontoexporte ins Repo committen.**

| Datei | Inhalt | Erwartung |
|---|---|---|
| `sparkasse-giro-camt-v2-sample.csv` | 117 Girokonto-Umsätze (CSV-CAMT V2 **mit** zusätzlicher Spalte `Kategorie`), alle 28 vorkommenden Buchungstext-Typen, alle 18 Sparkassen-Kategorien | Wird vollständig geparst. Die Doppelzeile `15.05.26` (Bargeldauszahlung, zwei identische Zeilen) ergibt **2** Buchungen mit unterschiedlichem `dedupeKey` (Suffix `:0`/`:1`). Ein zweiter Import derselben Datei ergibt 0 neue Buchungen. |
| `sparkasse-giro-edgecases.csv` | 8 synthetische Sonderfälle | 1× `Umsatz vorgemerkt` → übersprungen und gezählt; Verwendungszweck mit `;` und Zeilenumbruch; Umlaute; Betrag mit Tausenderpunkt (`1.234,56` → 1234.56); zwei identische Bäckerei-Zeilen → 2 Buchungen; `LS WIEDERGUTSCHRIFT` (Rücklastschrift); `UEBERTRAG` auf eigenes Konto mit Kategorie `Geldanlage`; Entgelt ohne Gegenpartei. |
| `sparkasse-giro-ohne-optionale-spalten.csv` | Ohne `Glaeubiger ID` und ohne `Kategorie` | Wird trotzdem geparst (Zuordnung über Header-Namen). |
| `sparkasse-giro-fehlende-pflichtspalte.csv` | Ohne `Betrag` | Klare Fehlermeldung, kein Teilimport. |
| `sparkasse-kreditkarte-sample.csv` | 66 Kreditkarten-Umsätze (eigenes Sparkassen-Kreditkartenformat) | Fremdwährung CHF mit Umrechnungskurs; separate Gebührenzeilen `1% für Währungsumrechnung`; Zeilen `Lastschrift` mit **positivem** Betrag = Ausgleich der Kartenabrechnung vom Girokonto. |

**Konsistenz zwischen den Dateien:** Die Kreditkarten-`Lastschrift`-Beträge (2.232,77 € / 1.182,72 €) entsprechen exakt den Girokonto-Buchungen `EIGENE KREDITKARTENABRECHN.` (−2.232,77 € / −1.182,72 €). Werden beide Dateien importiert, darf dieser Betrag nicht doppelt als Ausgabe zählen.
