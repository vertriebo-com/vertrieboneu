# VERTRIEBO MERKLISTE — Update 2026-05-24

Dieses Dokument ergänzt `src/docs/VERTRIEBO_MERKLISTE.md` und hält alle heutigen Entscheidungen, Fixes, Audits und späteren Merker fest.

> Grundregel: Bestehende funktionierende Systeme niemals komplett neu bauen oder ersetzen. Neue Features ergänzend einfügen, bestehende Entities/Funktionen/UI-Komponenten erweitern, rückwärtskompatibel bleiben und Matrix/Audit zentral prüfen.

---

## 1. Feste Entwicklungsregeln ab heute

### 1.1 Erweitern statt neu bauen

Für alle kommenden Features gilt:

- Bestehende Logik erhalten.
- Neue Features nur ergänzend einfügen.
- Keine kompletten Rewrites ohne ausdrückliche Freigabe.
- Keine Parallel-Systeme, wenn eine bestehende Entity/Funktion/UI-Komponente erweitert werden kann.
- Vor Änderungen immer prüfen: Was existiert schon? Welche Matrix/Audit-Tests gibt es? Welche Flows dürfen nicht kaputtgehen?

Beispiele:

- Keyword-System auf `OrgLearnedSignals`, `OrganizationKeywordProfile`, `startResearchRun`, `processLeadOutcomeFeedback`, `LearningLoopBox` und `RelevanceSection` aufsetzen.
- LocationIndex nicht ersetzen, sondern ergänzend für Coverage nutzen.
- E-Mail-MVP nicht neu bauen, sondern Follow-up/Logging ergänzen.
- Dashboard nicht neu bauen, sondern Sections/Boxen sauber einfügen.
- Plan-/Limit-Matrix zentral prüfen, keine hardcodierten Einzel-Fixes pro Plan.

### 1.2 Branchenübergreifend denken

Vertriebo ist ein branchenübergreifendes Vertriebs-CRM/SaaS mit über 40 Branchen.

Regeln:

- Keine Logik hart auf Gebäudereinigung, Hausverwaltung, Praxisreinigung oder einzelne Beispielbranchen zuschneiden.
- Beispiele im UI generisch halten oder dynamisch aus Taxonomie/Org-Daten lesen.
- Keyword-/Learning-Features müssen über `industry_id`, `TaxonomyEntry`, `target_customer_types`, `search_keyword_variants`, `OrganizationKeywordProfile`, `OrgLearnedSignals`, `source_query`, `matched_search_category`, `matched_target_customer_type` funktionieren.
- Audits mindestens mit mehreren `industry_id` prüfen.
- Keine branchenspezifischen festen Keywords im Code.

Gutes UI-Wording:

- Erfolgreiche Zielgruppen
- Starke Suchbegriffe
- Weniger passende Kategorien
- Diese Muster werden bei künftigen Recherchen stärker berücksichtigt.

Schlechtes UI-Wording:

- Hart codierte Beispiele wie „Hausverwaltungen funktionieren besonders gut“ oder „z. B. Büroreinigung, WEG-Verwaltung“.

---

## 2. Keyword-Learning Phase 1 — abgeschlossen

### Ziel

Vertriebo lernt aus echten Lead-Rückmeldungen, welche Zielgruppen, Suchbegriffe und Kategorien funktionieren.

### Umgesetzt

- `processLeadOutcomeFeedback` berechnet Keyword-Stats aus:
  - `source_query`
  - `matched_target_customer_type`
  - `matched_search_category`
  - `branche`
- Pro Keyword werden gepflegt:
  - `keyword`
  - `won_count`
  - `relevant_count`
  - `not_relevant_count`
  - `total_count`
  - `score`
  - `source`
  - `last_seen_at`
- Scoring:
  - gewonnen = +3
  - relevant = +1
  - nicht relevant = -2
- Nur Keywords mit `total_count >= 2` und positivem Score landen in `boosted_keywords`.
- Generische Begriffe wie Firma, Unternehmen, GmbH, Service, Deutschland, Sonstiges werden gefiltert.
- `büro` wurde aus der Generic-Term-Blocklist entfernt, weil es für viele Branchen ein valider Zielkundentyp sein kann.

### Sichtbarkeit

- `LearningLoopBox` im Dashboard zeigt:
  - Beste Zielgruppen
  - Starke Suchbegriffe
  - Weniger passend
- `RelevanceSection` im LeadDetail zeigt spezifisch:
  - Zielgruppen-Match
  - Keyword-Match
  - Doppelmatch
  - reduzierte Kategorie

### Legacy-Support

Abgeschlossen:

- `boosted_keywords` unterstützt neues `object[]` und altes `string[]`.
- `priority_categories` unterstützt `object[]` und `string[]`.
- `excluded_categories` unterstützt `object[]` und `string[]`.
- `auditLearningVisibility`: 9/9 grün.

---

## 3. Keyword-System Phase 2 — KeywordProfile + Vorschläge — abgeschlossen

### Ziel

Neue Kunden sollen schon vor viel Feedback passende Suchbegriffe vorgeschlagen bekommen. Danach lernt Vertriebo weiter aus echten Ergebnissen.

### Neue/erweiterte Entity

`OrganizationKeywordProfile`

Wichtige Felder:

- `organization_id`
- `industry_id`
- `keyword`
- `keyword_type`
- `source`
- `status`: `suggested | active | boosted | reduced | blocked`
- `score`
- `won_count`
- `relevant_count`
- `not_relevant_count`
- `total_count`
- `used_in_research_count`
- `last_used_at`
- `last_feedback_at`
- `is_boosted`
- `is_reduced`
- `is_user_added`

### Keyword-Vorschläge

`generateKeywordSuggestions` nutzt dynamisch:

- `TaxonomyEntry`
- Onboarding-/Settings-Daten
- `OrganizationKeywordProfile`
- `OrgLearnedSignals`

Keine Hardcodings pro Branche.

### Suggested Flow

Für MVP gilt Option A:

- Vorschläge werden angezeigt.
- Nutzer klickt Vorschlag an.
- Dialog wird vorausgefüllt.
- Nutzer bestätigt.
- Keyword wird als `active` angelegt.

### UI

`KeywordProfilePanel` ist unter Settings → „Suchbegriffe“ eingebunden.

Nutzer kann:

- Vorschläge ansehen
- Keyword aktivieren
- Keyword blockieren
- eigenes Keyword hinzufügen

UI wurde generisch gemacht: keine festen Gebäudereinigungs-Beispiele.

### E2E-Beweis

Production-E2E erfolgreich:

- Org: `6a042bdb22ac907a26c5affe`
- ResearchRun: `6a13332395e08ff82b3a0506`
- Active Keyword: `TEST_KEYWORD_DO_NOT_USE` landete in `targetCustomerTypes`.
- Blocked Keyword: `TEST_BLOCKED_DO_NOT_USE` landete in `excludedCustomerTypes`.
- Blocked Keyword war nicht in `targetCustomerTypes`.
- `keyword_profile_summary` vorhanden.

### Testdaten

Testdaten wurden später bereinigt/entfernt:

- `TEST_KEYWORD_DO_NOT_USE`
- `TEST_BLOCKED_DO_NOT_USE`

---

## 4. Keyword-System muss mit Zielkunden, Dienstleistungen und Onboarding zusammenarbeiten

### Produktlogik

- Zielkunden = Wen will ich finden?
- Dienstleistungen = Was biete ich an?
- Keywords = zusätzliche Suchbegriffe/Lernschicht, um passende Firmen besser zu finden.

Keywords dürfen Zielkunden/Dienstleistungen nicht ersetzen und dürfen E-Mail-/KI-Positionierung nicht ungeprüft verändern.

### Single Source / Dedupe-Regeln

Keyword-Vorschläge müssen gegen diese Quellen deduplizieren:

- Onboarding `target_customer_types`
- Onboarding `excluded_customer_types`
- Onboarding `services`
- `OrganizationSettings.target_customer_types`
- `OrganizationSettings.own_services` bzw. `services`
- `TaxonomyEntry.target_customer_types`
- `TaxonomyEntry.own_services`
- `TaxonomyEntry.search_keyword_variants`
- `OrganizationKeywordProfile`
- `OrgLearnedSignals.boosted_keywords`

Wenn ein Begriff bereits aktiv ist als Zielkunde, Dienstleistung oder aktives/geboostetes Keyword, nicht erneut als neuer Vorschlag anzeigen.

Stattdessen markieren:

- Bereits aktiv über Zielkunden
- Bereits aktiv über Dienstleistungen
- Bereits aktiv als Keyword
- Bereits ausgeschlossen

### Onboarding-Key-Merker

Onboarding speichert Dienstleistungen aktuell unter `services`. `startResearchRun`/andere Logik nutzen teils `own_services`. Beide müssen beim Lesen berücksichtigt bzw. beim Speichern synchron gehalten werden.

### Audit

`auditKeywordSettingsIntegration` wurde repariert:

- Statuswerte: `pass | fail | skipped | warning`
- Kontrollierte Testdaten über `createKeywordTestData`
- Endstatus: grün
- Ergebnis: `passed=10`, `failed=0`, `skipped=0`, `warnings=0`

Geprüft:

- Onboarding-Zielkunde wird nicht doppelt vorgeschlagen.
- Onboarding-Dienstleistung wird nicht doppelt vorgeschlagen.
- Ausschlüsse werden berücksichtigt.
- Blocked gewinnt gegen active/boosted.
- Active Keywords ergänzen Recherche.
- Keine Cross-Org-Daten.

---

## 5. startResearchRun — aktuelles Verständnis

`startResearchRun` ist der Recherche-Planer.

Aufgabe:

- Login prüfen
- Organisation laden
- Zugriff prüfen
- Billing/Trial/Monatslimit prüfen
- Serial Run Lock prüfen
- Settings laden
- Stadt/Radius laden
- Branche/industry_id bestimmen
- Taxonomie laden
- `OrgLearnedSignals` laden
- `OrganizationKeywordProfile` laden
- TargetCustomerTypes/ExcludedCustomerTypes zusammenführen
- Koordinaten bestimmen
- LocationIndex + Grid planen
- `search_plan_json` bauen
- `ResearchRun` mit `status=queued` erstellen

Wichtig:

- `startResearchRun` sucht noch keine Firmen.
- `startResearchRun` erstellt nur den Suchauftrag.
- `processResearchRun` führt aus.

### Keyword-Reihenfolge im Suchplan

A) Basis: Zielkunden aus Settings/Onboarding oder Taxonomie-Fallback  
B) Ergänzung: active/boosted `OrganizationKeywordProfile`  
C) Ergänzung: `OrgLearnedSignals.boosted_keywords`  
D) Ausschluss: blocked/reduced Keywords + `excluded_customer_types` + learned excluded categories

Blocked gewinnt immer gegen active/boosted.

---

## 6. processResearchRun — aktuelles Verständnis + Fixes

`processResearchRun` ist die Ausführungsmaschine.

Aufgabe:

- `ResearchRun` laden
- Tenant-Check durchführen
- Processing-Lock setzen
- `search_plan_json` lesen
- Queries aus Taxonomie/TargetCustomerTypes bauen
- LocationIndex/Grid-Punkte rotieren
- Google Places abfragen
- Treffer deduplizieren
- Ketten/BadFit/falsche Treffer filtern
- Scoring ausführen
- Place Details holen
- `Company` speichern
- `UsageLog` erhöhen
- Fortschritt/Coverage speichern

### Catch-Block Fix abgeschlossen

Problem vorher:

- `organization_id`, `workerKey`, `run` waren im `catch` nicht sicher verfügbar.
- Danach gab es Shadowing durch inneres `const workerKey`.

Fix:

- Outer-Scope Variablen:
  - `let research_run_id = null`
  - `let organization_id = null`
  - `let workerKey = 'unknown'`
  - `let runSnapshot = null`
- Im try setzen:
  - `research_run_id = run.id`
  - `organization_id = run.organization_id`
  - `runSnapshot = run`
  - `workerKey = `${user.email}:${Date.now()}``
- Im catch nur noch:
  - `workerKey`
  - `runSnapshot?.batch_index`
  - `runSnapshot?.leads_saved`

Status: grün.

### Merker für später

Coverage-Zählung nutzt aktuell kumulative Counts. Später besser eindeutige Keys speichern:

- `searched_location_keys_json`

Nicht akut für MVP.

---

## 7. Lead-Quality-Scoring Audit — MVP grün

`auditLeadQualityScoring` wurde gebaut und überarbeitet.

### Ziel

Prüfen, ob die Lead-Engine gute und schlechte Treffer nachvollziehbar bewertet.

### Finaler Stand

Der Audit nutzt jetzt echte Engine-Funktionen als Audit-Kopie:

- `scoreCandidate`
- `checkBadFit`
- `isLikelyChain`
- `buildQueriesFromProfile`

Geprüft werden:

- echte Chain Detection
- echtes Scoring
- `shouldSave` true/false
- Score-Schwellen
- Diagnostics-Felder
- Engine-Version
- Query-Generierung
- ExcludedCustomerTypes werden aus Queries entfernt
- Target-Customer-Priorisierung

### Summary-Zählung korrigiert

Vorher war die Pass-Rate verzerrt. Jetzt:

- `total_tests = results.tests.length`
- `passed = status === 'pass'`
- `failed = status === 'fail' || status === 'error'`
- `skipped = status === 'skipped'`
- `warnings = status === 'warning' + globale warnings`

Status: grün für MVP.

### Merker für später

Engine-Funktionen aktuell kopiert. Langfristig besser:

- `shared/researchEngineScoring.js`

Dann nutzen `processResearchRun` und `auditLeadQualityScoring` garantiert dieselbe Logik.

---

## 8. Usage/Billing/Trial-Banner Merker

### Problem erkannt

`TrialStatusBanner` zeigte in Starter-Testphase:

- „0 von 300 Leads genutzt · 300 verbleibend“

obwohl bereits Leads im Planzeitraum verbraucht waren bzw. unten andere Usage angezeigt wurde.

### Regel

- CRM-Bestand = alle Firmenkontakte der Organisation
- Monatskontingent = nur planrelevante Leads im aktiven Plan-/Trial-Zeitraum
- Preview-Leads zählen nicht ins Starter/Professional/Gold-Monatskontingent

Beispiel:

- 10 kostenlose Vorschau-Leads + 24 Starter-Leads
- CRM-Bestand = 34
- Starter-Monatskontingent = 24 / 300

### Fix-Richtung

`TrialStatusBanner` muss dieselbe zentrale UsageSummary nutzen wie BillingSettings/getUsageSummary.

Nicht bei `usageInfo=null` automatisch 0 anzeigen; bei Ladezustand lieber Skeleton/„Nutzung wird geladen…“.

---

## 9. UX: Recherche-Start und Onboarding — abgeschlossen

### Problem

Beim Klick auf „Firmen recherchieren“ dauerte es ca. 30 Sekunden, bis der Nutzer sah, dass die Recherche läuft. Im Onboarding wirkte der letzte Schritt teils eingefroren/fehlerhaft, obwohl später Leads gefunden wurden.

### Produktregel

- `startResearchRun` = schnelle Auftragsbestätigung
- `processResearchRun` = Hintergrundausführung
- UI darf nicht warten, bis echte Leads fertig sind, bevor Fortschritt gezeigt wird.

### ResearchDialog

Umgesetzt:

- Sofort nach Klick: `phase=starting`
- Button disabled
- Spinner/Status sichtbar
- Nach 3s Hinweis: „Das kann kurz dauern…“
- Nach 10s Long-Wait-Hinweis
- Nach `startResearchRun` Success: `phase=running`
- Text: „Recherche läuft im Hintergrund“
- Polling alle 3 Sekunden
- Nutzer kann Dialog schließen; Recherche läuft weiter.

Status: grün.

### Onboarding LaunchStep

Finaler Fix:

Sobald `startResearchRun` eine `research_run_id` liefert:

```js
onLaunch({
  research_run_id: runId,
  status: 'queued',
  leads_saved: 0,
  research_started: true
});
return;
```

Dadurch navigiert `Onboarding.jsx` sofort zu:

```txt
/dashboard?research_started=1&run_id={runId}
```

Kein Warten mehr auf fertige Leads.

Status: grün.

---

## 10. UI/Modal-Design Merker

### Problem

Einige Dialoge wirkten wie dunkle Standardmodals und passten nicht zum hellen Vertriebo-Design.

Betroffen:

- „Keyword hinzufügen“
- „Firmen recherchieren“
- evtl. weitere Dialoge

### Design-Regel

Vertriebo-Dialoge sollen konsistent sein:

- heller Card-Look
- `bg-white`
- `text-slate-900`
- `border-slate-200`
- `rounded-2xl`
- dezenter Shadow
- klare Typografie
- blaue/violette CTA-Akzentfarbe
- Abbrechen als Outline
- mobil sauber
- kein dunkles Standardmodal

Nicht Logik ändern, nur Styling/Dialog-Basis angleichen.

---

## 11. LocationIndex / Gebietscoverage — abgeschlossen

Phase 1 LocationIndex wurde abgeschlossen:

- 16.477 Einträge importiert
- 0 Duplikate
- 0 fehlende Koordinaten
- 0 fehlende PLZ
- `resolveCoverageLocations` dedupliziert sauber
- `auditLocationIndex` lädt alle Seiten vollständig
- Plan-Matrix greift:
  - Free Preview: 3 Orte
  - Verified Trial: 5 Orte
  - Starter: 10 Orte
  - Professional: 25 Orte
  - Gold: 50 Orte
  - Agency: unlimited

`processResearchRun` nutzt LocationIndex + Grid kombiniert und berechnet `totalBatches = max(queryBatches, pointBatches)`, damit alle gewählten Orte erreichbar sind.

Merker:

- Für große Radien brauchen viele Orte entsprechend viele Batches.
- Coverage-Diagnostik vorhanden: `locations_remaining_count`, `coverage_complete`.

---

## 12. Landing-/Produktclaims heute geprüft

### Abgeschlossen/grün

- Lückenlose Gebiets-Abdeckung
- Priorisierte Tagesliste
- Komplette Kontakthistorie mit angepasstem Claim
- E-Mails & Follow-ups
- Vertriebssteuerung & Auswertung
- System das mitlernt / Lernende Vertriebsrecherche

### Starker finaler Learning-Claim

```txt
Lernende Vertriebsrecherche
Vertriebo schlägt passende Suchbegriffe vor, lernt aus Ihren Ergebnissen und berücksichtigt erfolgreiche Keywords automatisch bei zukünftigen Recherchen.
```

Oder:

```txt
System das mitlernt
Vertriebo erkennt erfolgreiche Zielgruppen, starke Suchbegriffe und weniger passende Kategorien – und passt zukünftige Recherchen automatisch daran an.
```

---

## 13. Offene/spätere Merker

### 13.1 Shared Research Engine Helper

Später auslagern:

- `scoreCandidate`
- `checkBadFit`
- `isLikelyChain`
- `buildQueriesFromProfile`

Ziel:

- `processResearchRun`
- `auditLeadQualityScoring`
- evtl. `testLeadSearchEngine`

nutzen dieselbe Datei.

Nicht jetzt groß umbauen, weil MVP stabil ist.

### 13.2 Coverage Unique Keys

Später `searched_location_keys_json` einführen, damit Coverage nicht nur kumulativ gezählt wird.

### 13.3 Kettenfilter branchenspezifisch steuerbar machen

Aktuell ist `isLikelyChain` hart mit Kettenliste. Für manche Branchen können große Unternehmen Zielkunden sein. Später optional über Taxonomie steuerbar machen.

### 13.4 UsageEvent/LeadUsageEvent als endgültige SSOT

Langfristig statt max()-Formel und Company-Zählung:

- atomare Usage Events
- Supabase RPC/Unique Index
- Shadow-Mode validieren, bevor primär.

### 13.5 UI Live-Checks

Nach jedem UX-Fix echte Browserprüfung:

- ResearchDialog Klick → sofort Feedback
- Onboarding letzter Schritt → Dashboard binnen 1–2 Sekunden
- ActiveResearchBanner zeigt queued/running
- kein Fehler/Reset mehr, wenn Run später erfolgreich ist

---

## 14. Statusübersicht 2026-05-24

| Block | Status |
|---|---|
| Entwicklungsregel „erweitern statt neu bauen“ | ✅ festgelegt |
| Branchenübergreifende Produktregel | ✅ festgelegt |
| Keyword-Learning Phase 1 | ✅ grün |
| Legacy-Support Keyword-Learning | ✅ grün |
| Keyword-System Phase 2 | ✅ grün |
| Keyword + Onboarding/Settings Integration | ✅ grün |
| startResearchRun Verständnis/Prüfung | ✅ dokumentiert |
| processResearchRun Catch-Block | ✅ grün |
| ResearchDialog UX | ✅ grün |
| Onboarding Redirect UX | ✅ grün |
| TrialStatusBanner Usage-Anbindung | ✅ Fix-Richtung dokumentiert |
| auditLeadQualityScoring | ✅ MVP-grün |
| Shared Engine Helper | ⏳ später |
| Coverage Unique Keys | ⏳ später |
