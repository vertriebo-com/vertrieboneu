# Vertriebo MVP – Live-Test Runbook

**Version:** 1.0  
**Datum:** 2026-05-27  
**Status:** Freigegeben (auditMvpLaunchReadiness → claim_status: YELLOW, launch_ready: true)  
**Ziel:** Kontrollierter Live-Test mit einer echten Org und echten Daten. Keine neuen Features während des Tests.

---

## Grundregel

> **Der Live-Test beweist, dass bestehende Kernflows stabil sind. Es wird nichts Neues gebaut.**

---

## 1. Vorbereitungen

### 1.1 Test-Org auswählen
- Eine Org wählen, die Onboarding abgeschlossen hat (`onboarding_done: true`)
- `platform_status: active` prüfen
- `billing_status: active | trialing | preview` prüfen
- Keine produktive Kundendaten nutzen – bevorzugt eine eigene Test-Org

### 1.2 Admin-/Owner-User prüfen
- Owner-E-Mail der Org bestätigen
- Login als Owner-User testen
- Rolle `organization_admin` oder `user` korrekt gesetzt?

### 1.3 Plan/Limit prüfen
```
Plan:              [Plan-Name eintragen]
max_leads_per_month: [Wert]
custom_monthly_lead_limit: [Wert oder null]
stripe_price_id:   [vorhanden?]
```

### 1.4 getUsageSummary prüfen
Ausführen über Dashboard → Backend Functions → `getUsageSummary` mit `{ "org_id": "<ID>" }`

Prüfen:
- [ ] `monthly_limit` ist eine Zahl (nicht null)
- [ ] `monthly_used` ist eine Zahl (nicht null)
- [ ] `monthly_remaining` ist eine Zahl (nicht null)
- [ ] `is_unlimited` korrekt gesetzt
- [ ] `plan_status: ok` (nicht `billing_plan_missing`)
- [ ] `diagnostic_warnings` leer oder nur bekannte Warnungen

### 1.5 auditMvpLaunchReadiness ausführen
```json
{ }
```
**Erwartetes Ergebnis:**
- [ ] `launch_ready: true`
- [ ] `red_blockers: []`
- [ ] `claim_status: yellow` oder `green`

### 1.6 auditGlobalTenantIsolation ausführen
```json
{ "org_id": "<ID>" }
```
**Erwartetes Ergebnis:**
- [ ] Keine Cross-Org Datenlecks
- [ ] `status: ok` oder `warnings` ohne Security-Blocker

---

## 2. Research-Test

### 2.1 Vorbereitung
- Branche auswählen (aus Onboarding-Profil der Test-Org)
- Ort/Radius aus den Org-Settings übernehmen
- Sicherstellen: Remaining Leads > 0 (nicht über Limit)

### 2.2 ResearchRun starten
- Dashboard → „Neue Leads suchen" oder Research-Button
- Anzahl: 10–25 Leads (kein großer Run im Live-Test)
- Run starten und warten (max. 3–5 Minuten)

### 2.3 Prüfen
- [ ] `ResearchRun` Entity erstellt (status: `queued` → `running` → `completed/partial`)
- [ ] `processResearchRun` hat korrekt durchgearbeitet
- [ ] `leads_saved > 0` (mindestens 1 Lead gespeichert)
- [ ] `duplicates_skipped` vorhanden (zeigt Deduplizierung aktiv)
- [ ] `chain_skipped_count` im Run (Kettenfilter aktiv)
- [ ] Kein `status: failed` ohne `error_message`
- [ ] ResearchObservabilityPanel im Dashboard sichtbar und zeigt Run-Daten
- [ ] `charged_lead_generation: true` nach Abschluss

**Bei Fehler:**
- `error_message` aus ResearchRun lesen
- `getResearchRunObservability` mit der Run-ID aufrufen
- `auditResearchRunQuality` ausführen

---

## 3. Lead-Detail-Test

Für **mindestens 3 Leads** aus dem Research-Run prüfen:

### 3.1 Für jeden Lead öffnen (`/leads/:id`)

- [ ] **CompanyInfo** lädt vollständig (Name, Adresse, Telefon, Website)
- [ ] **RelevanceSection** sichtbar (relevance_score, relevance_reason)
- [ ] **ProvenanceBadges** sichtbar (Datenherkunft pro Feld)
- [ ] **ContactsSection** sichtbar (auch wenn leer: kein Crash)
- [ ] **ActivityFeed** sichtbar und lädt (auch wenn leer: kein Crash)
- [ ] **Tasks-Tab** sichtbar
- [ ] **OpportunitySection** sichtbar (auch wenn leer: kein Crash)

### 3.2 Engine-Box prüfen (falls vorhanden)
- [ ] `lead_temperature` gesetzt (hot/warm/cold/unknown)
- [ ] `quality_tier` gesetzt (premium/strong/good/weak)
- [ ] `next_best_action` vorhanden

---

## 4. Contact-Test

### 4.1 Ansprechpartner hinzufügen
- Lead-Detail öffnen → Contacts-Tab
- „Kontakt hinzufügen" → Name, E-Mail, Telefon, Rolle ausfüllen
- Speichern

### 4.2 Als Primary setzen
- Kontakt als Primärkontakt markieren
- Prüfen ob `is_primary: true` gesetzt

### 4.3 Prüfen
- [ ] `Contact` Entity erstellt mit korrekter `organization_id` und `company_id`
- [ ] `ContactLog` geschrieben (Typ: „Sonstiges" oder ähnlich)
- [ ] ActivityFeed zeigt neuen Eintrag
- [ ] `Company.ansprechpartner` aktualisiert (falls buildPrimaryContactFromCompany greift)

---

## 5. Manual Email-Test

### 5.1 E-Mail vorbereiten
- Lead-Detail → „E-Mail vorbereiten" oder SendEmail-Button
- Vorlage auswählen oder Text eingeben
- Text kopieren (manueller Versand)

### 5.2 E-Mail senden (manuell)
- `mailto:`-Link öffnet E-Mail-Client
- E-Mail manuell aus dem Client senden

### 5.3 Kontakt dokumentieren
- Zurück in Vertriebo → „Kontakt dokumentieren"
- Typ: E-Mail, Ergebnis: „Manuell vorbereitet/gesendet"
- Nächsten Schritt und Follow-up-Datum setzen

### 5.4 Prüfen
- [ ] `ContactLog` geschrieben (`typ: E-Mail`, `sending_mode: manual_email_client`)
- [ ] `is_manual: true` im ContactLog
- [ ] Task erstellt für Follow-up
- [ ] ActivityFeed zeigt neuen Kontakt-Eintrag
- [ ] DailyActions enthält Follow-up für diese Firma (nach kurzer Wartezeit / Reload)

---

## 6. Opportunity-Test

### 6.1 Opportunity erstellen
- Lead-Detail → Opportunities-Tab → „Neue Opportunity"
- Titel, Wert (EUR), Wahrscheinlichkeit (%), geplantes Abschlussdatum ausfüllen
- Speichern

### 6.2 Stage ändern
- Stage von `new` → `contacted` → `qualified` durchklicken
- Prüfen ob Stage-Änderung gespeichert wird

### 6.3 Won/Lost (nur bei Test-Opportunity!)
- **NUR für diese Test-Opportunity** Won oder Lost setzen
- Kein Won/Lost bei echten Opportunities eines Kunden

### 6.4 Prüfen
- [ ] `Opportunity` Entity erstellt mit `organization_id`, `company_id`
- [ ] `ContactLog` geschrieben bei Stage-Änderung
- [ ] ActivityFeed zeigt Opportunity-Änderungen
- [ ] Dashboard Pipeline-Werte aktualisiert (nach Reload)
- [ ] Statistics-Seite zeigt Opportunity in Pipeline-Übersicht

---

## 7. Daily Actions-Test

### 7.1 getDailyActions prüfen
Ausführen über Backend Functions:
```json
{ "org_id": "<ID>", "limit": 10 }
```
Prüfen:
- [ ] `actions` Array nicht leer (vorausgesetzt es gibt Leads/Tasks)
- [ ] `action_type` Werte sind valide (call_lead, follow_up, schedule_task, …)
- [ ] `company_id` immer gesetzt
- [ ] `priority_score` vorhanden

### 7.2 Dashboard DailyActionList prüfen
- [ ] Aktionen werden im Dashboard angezeigt
- [ ] Kein Ladeloop / kein Crash

### 7.3 Routing prüfen
Auf eine Aktion klicken und prüfen ob der richtige Tab geöffnet wird:
- [ ] `action_type: schedule_task` → `/leads/:id?tab=tasks`
- [ ] `action_type: add_contact` → `/leads/:id?tab=contacts`
- [ ] `action_type: update_opportunity_stage` → `/leads/:id?tab=opportunities`
- [ ] `action_type: follow_up` → `/leads/:id?tab=tasks`

---

## 8. Documents-Test

### 8.1 Dokument hochladen
- Lead-Detail → Dokumente-Tab → Datei hochladen (PDF, max. 5 MB)
- Titel und Kategorie ausfüllen
- Speichern

### 8.2 Prüfen
- [ ] `Document` Entity erstellt
- [ ] `organization_id` korrekt gesetzt
- [ ] `company_id` korrekt gesetzt
- [ ] `file_url` vorhanden und abrufbar
- [ ] ActivityFeed zeigt Dokument-Upload

---

## 9. Billing/Usage-Test

### 9.1 getUsageSummary nach Research prüfen
Nach dem Research-Run nochmal `getUsageSummary` aufrufen:
- [ ] `monthly_used` um Anzahl neuer Leads erhöht
- [ ] `monthly_remaining` korrekt reduziert
- [ ] `monthly_limit` unverändert
- [ ] Alle Kernfelder sind Zahlen (kein null, kein undefined)

### 9.2 UI-Prüfung (Dashboard/Settings)
- [ ] UsageBar zeigt Fortschrittsbalken (nicht leer / nicht „–")
- [ ] Zahlen sind plausibel (used ≤ limit oder unlimited)
- [ ] Reset-Datum korrekt angezeigt
- [ ] Kein `NaN%` oder `undefined` im UI sichtbar

---

## 10. Abschluss-Audits

Nach Abschluss aller Tests die folgenden Audits ausführen:

| Audit | Payload | Erwartetes Ergebnis |
|---|---|---|
| `auditMvpLaunchReadiness` | `{}` | `launch_ready: true`, keine RED blocker |
| `auditGlobalTenantIsolation` | `{ "org_id": "<ID>" }` | Keine Cross-Org Lecks |
| `auditFrontendDataLoading` | `{ "org_id": "<ID>" }` | Keine kritischen Fehler |
| `auditManualEmailWorkflow` | `{ "org_id": "<ID>" }` | Manual Email korrekt dokumentiert |
| `auditNextBestActionReadiness` | `{ "org_id": "<ID>" }` | DailyActions liefert Aktionen |

---

## 11. Go/No-Go Entscheidung

### ✅ GO – wenn alle folgenden Punkte erfüllt:

- [ ] Keine RED Security/Tenant-Risiken in `auditMvpLaunchReadiness`
- [ ] Research liefert Leads (leads_saved > 0), kein undiagnostizierter Fehler
- [ ] LeadDetail lädt für alle 3 Test-Leads ohne Crash
- [ ] Manual Email korrekt dokumentiert (ContactLog + Task geschrieben)
- [ ] DailyActions zeigen sinnvolle Aktionen und Routing funktioniert
- [ ] UsageBar zeigt Zahlen (kein null/undefined/NaN)

### ❌ NO-GO – wenn eines der folgenden zutrifft:

- [ ] Cross-Org Daten sichtbar (Fremddaten in eigenem Account)
- [ ] Research bricht ohne `error_message` oder Diagnose ab
- [ ] LeadDetail crasht (500/weiße Seite) für normale Leads
- [ ] ContactLog oder ActivityFeed wird nach Aktion nicht geschrieben
- [ ] Usage/Billing zeigt null, undefined oder NaN für Kernwerte

---

## Nicht machen während des Live-Tests

- ❌ Keine neuen Features bauen
- ❌ Kein `dry_run: false` Backfill ausführen
- ❌ Keine Supabase-Migration durchführen
- ❌ Keine großen UI-Änderungen
- ❌ Kein Won/Lost bei echten Kunden-Opportunities

---

## Ergebnis festhalten

```
Test-Datum:          _______________
Test-Org:            _______________
Tester:              _______________
auditMvpLaunchReadiness claim_status:  _______________
Research leads_saved:  _______________
LeadDetail-Test:     PASS / FAIL
Contact-Test:        PASS / FAIL
Manual Email-Test:   PASS / FAIL
Opportunity-Test:    PASS / FAIL
DailyActions-Test:   PASS / FAIL
Usage/Billing-Test:  PASS / FAIL

GO / NO-GO:          _______________
Begründung:          _______________
``