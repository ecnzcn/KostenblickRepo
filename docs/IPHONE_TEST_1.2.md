# iPhone-Test für Kostenblick 1.2.0

Ziel: Der Finanztracker funktioniert mit deinem **echten** Sparkassen-Export
auf dem iPhone. Dauer etwa 20 Minuten.

**Datenschutz:** Die CSV wird nur auf dem iPhone gelesen. Schicke sie nicht
weiter und lade sie nirgends hoch – auch nicht als Screenshot mit lesbaren
Namen oder IBANs. Für Rückmeldungen reichen Zahlen und die Texte der App.

## Vorbereitung

1. **Backup der aktuellen App:** „Mehr“ → „Daten & Backup“ → „Backup
   exportieren“ (in „Dateien“ sichern).
2. App aktualisieren: Kostenblick öffnen, bei „Neue Version verfügbar“ auf
   „Jetzt aktualisieren“ tippen. Unter „Mehr“ muss ganz unten
   „Version 1.2.0“ stehen.
3. Im Online-Banking der Sparkasse exportieren:
   - Girokonto: „Umsätze“ → Zeitraum **mindestens die letzten 3 vollen
     Monate** → „Export“ → **„Excel (CSV-CAMT V2)“**
   - Kreditkarte: denselben Zeitraum als CSV
   - Die Dateien nicht in Numbers/Excel öffnen und neu speichern.

## Ablauf

| # | Schritt | Erwartet | ✓ |
|---|---|---|---|
| 1 | „Buchungen“ → „Sparkassen-CSV importieren“ → Giro-CSV wählen | Vorschau mit Konto, Zeitraum, „Neue Buchungen“, „Vorgemerkt (übersprungen)“, Einnahmen/Ausgaben/Gespart – noch nichts gespeichert | |
| 2 | „… Buchungen speichern“ | „… Buchungen importiert“, Hinweis „Backup erstellen?“ | |
| 3 | „Weitere Datei importieren“ → Kreditkarten-CSV | Vorschau, dann speichern | |
| 4 | Dieselbe Giro-CSV noch einmal importieren | „Neue Buchungen 0“ und „Alle Buchungen dieser Datei sind bereits importiert.“ – kein Speichern-Button | |
| 5 | „Buchungen“: Liste, Suche nach einem Händler, Filter „Monat“ | Treffer passen; „Ohne Kategorie“ zeigt nur Buchungen ohne Kategorie | |
| 6 | Kreditkartenabrechnung auf dem Girokonto öffnen | „Umbuchung – zählt weder als Einnahme noch als Ausgabe“, verknüpft mit der Karten-Lastschrift | |
| 7 | Eine Buchung ohne Kategorie zuordnen → „Immer so zuordnen?“ → „Regel anlegen“ | Ähnliche Buchungen bekommen dieselbe Kategorie | |
| 8 | Dashboard, letzten **vollen** Monat wählen | Einnahmen/Ausgaben plausibel im Vergleich zum Kontoauszug, Vormonatsvergleich sichtbar | |
| 9 | Eine Umbuchung aufs eigene Tagesgeld öffnen, „Sparen (eigenes Konto)“ wählen | zählt danach unter „Gespart“, nicht unter „Ausgaben“ | |
| 10 | „Mehr“ → „Sparziel“ → Betrag speichern, zurück zum Dashboard | Sparziel-Karte mit Prozent | |
| 11 | Einen Vertrag öffnen (z. B. Handy) → „Abbuchungen“ → Vorschlag „Zuordnen“ | Monatsliste „erwartet … / abgebucht …“; „Verträge“ → „Fixkosten“ zeigt Soll/Ist | |
| 12 | „Mehr“ → „Daten & Backup“ → „Backup exportieren“ | Backup enthält jetzt Konten und Buchungen (Anzahl in der Restore-Vorschau sichtbar) | |
| 13 | Ein Import unter „Buchungen“ → „Importe“ → „Import rückgängig machen“ | Buchungen dieses Imports sind weg; danach erneut importierbar | |

## O-7: vorgemerkte Kreditkartenumsätze

Am besten an einem Tag exportieren, an dem es **noch nicht gebuchte**
Kartenzahlungen der letzten Tage gibt.

- Erscheinen diese Zahlungen nach dem Import in der Buchungsliste?
- Wenn ja: Steht in der Kreditkarten-CSV bei ihnen etwas in der Spalte
  „Abrechnungskennzeichen“ oder fehlt das Buchungsdatum? (Nur „ja/nein“ bzw.
  den Spaltenwert ohne Händlernamen melden.)
- Werden sie beim nächsten Export (nach der Buchung) **doppelt** angezeigt?

## Rückmeldung

Pro Schritt ✓ oder kurz, was stattdessen passiert ist (Text der Meldung,
keine Kontodaten). Bei einer Fehlermeldung beim Import: die Meldung
abschreiben – sie nennt Zeile und Spalte, nie den Inhalt.

Wenn etwas schiefgeht: „Mehr“ → „Daten & Backup“ → „Backup
wiederherstellen“ mit dem Backup aus der Vorbereitung.
