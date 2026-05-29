# Vertriebo Merkliste

Diese Datei ist die dauerhafte Projekt-Merkliste für Vertriebo. Vor größeren Änderungen, Base44-Prompts, Security-Fixes, Supabase-Migrationen und Live-Go-Entscheidungen immer zuerst diese Datei prüfen und danach aktualisieren.

Stand: 2026-05-28

---

## 1. Grundsatzentscheidung

Vertriebo wird aktuell mit Base44 gebaut, soll aber langfristig nicht dauerhaft an Base44 gebunden bleiben.

Zielarchitektur:

```txt
Kurzfristig: Base44 für MVP, UI, schnelle Entwicklung, Functions und Admin-Oberflächen.
Mittelfristig: Supabase/Postgres als produktionsfähiger Datenkern mit echter RLS.
Langfristig: Eigene API/Backend-Schicht + Supabase/Postgres + eigenes Hosting, damit ein eigener Entwickler das Projekt ohne Base44 weiterführen kann.
```

Wichtig:

```txt
Base44 jetzt nutzen, aber ab jetzt migrationsfähig bauen.
Keine neuen kritischen Produktlogiken hart an Base44-Entities koppeln.
```

---

## 2. Base44 ACL ist keine echte Mandanten-RLS

Base44 `x-acl` mit `read: user` bedeutet nur: eingeloggter Nutzer.

Es bedeutet NICHT automatisch:

```txt
record.organization_id gehört zur Organisation des Users
```

Deshalb gilt:

```txt
ACL schützt gegen anonymen Zugriff.
Mandantenisolation muss im Code passieren:
- Backend Functions mit AuthZ-Prüfung
- organization_id aus DB/Session ableiten
- nie blind organization_id aus dem Body vertrauen
- Frontend-Reads immer mit organization_id filtern, wenn noch nicht über Backend Function
```

Langfristig soll echte Mandantenisolation über Supabase/Postgres RLS erfolgen.

### Security-Scan-Klärung 2026-05-28

Der Base44-Security-Scanner kann keine echte `owner_only`- oder `same_organization_id_only`-RLS erkennen, weil Base44 diese deklarative Row-Level-Security auf Plattformebene nicht anbietet.

Daher können RLS-Warnungen für kundenspezifische Entities trotz gesetzter `x-acl` und Backend-Guards als Plattform-Limit / False Positive bestehen bleiben.

Aktuelle Bewertung aus Base44-Bericht:

```txt
- x-acl-Fixes sind gespeichert.
- GitHub-Sync hat keine Entity-Dateien überschrieben.
- Interner Audit auditEntityPermissionConsistency: 0 rote Entities, 3 gelbe, 13 grüne.
- Externer Base44-Security-Scanner erkennt Backend-Guards nicht.
- 23 RLS-Warnungen wurden als Platform-Limit / False Positive klassifiziert.
- Echte offene Sicherheitslücken laut Bericht: 0.
```

Wichtig: Diese Klassifizierung gilt nur, solange alle kritischen Datenzugriffe weiterhin über Backend-Guards, `organization_id`-Filter, `sharedAuthz` oder gleichwertige Checks laufen.

---

## 3. Sicherheitsregel für alle Kundendaten

Kein normaler Nutzer darf Daten einer anderen Organisation lesen, ändern oder löschen.

Für alle kundenspezifischen Entities gilt:

```txt
Company
Contact
ContactLog
Opportunity
Task
ResearchRun
LeadOutcome
Document
EmailTemplate
Blacklist
WeeklyBatch
ExternalCompanySource
OrganizationKeywordProfile
OrgLearnedSignals
UsageLog
QuotaReservation
Subscription
SupportNote
```

Pflichtlogik:

```txt
1. User authentifizieren.
2. organization_id darf nicht blind aus dem Body übernommen werden.
3. Bei bestehenden Datensätzen organization_id aus dem Datensatz laden.
4. Prüfen: PlatformAdmin oder Owner oder aktives OrganizationMember.
5. Erst danach lesen, schreiben, aktualisieren oder löschen.
```

---

## 4. sharedAuthz ist die kanonische Backend-AuthZ-Idee

`base44/functions/sharedAuthz/entry.ts` ist die kanonische AuthZ-Referenz.

Die Logik prüft:

```txt
- User ist eingeloggt
- PlatformAdmin-Rollen: admin, platform_owner, platform_admin
- organizationId ist Pflicht
- Organization existiert
- organization.platform_status !== suspended
- owner_email === user.email gilt als organization_admin
- OrganizationMember muss status === active haben
- Rollenprüfung über action oder requiredRoles
```

Wenn Base44 lokale Function-Imports nicht sauber erlaubt, muss die Logik inline kopiert werden. Trotzdem müssen Varianten möglichst nah an `sharedAuthz` bleiben.

Bei jeder neuen kritischen Backend Function prüfen:

```txt
Nutzt sie sharedAuthz oder eine gleichwertige Inline-Version?
```

---

## 5. organization_id niemals blind aus dem Body vertrauen

Besonders wichtig für Functions wie:

```txt
startResearchRun
processResearchRun
listCompanies
getDashboardData
getDailyActions
getResearchRunObservability
updateCompanySafe
updateTaskSafe
createOpportunity
updateOpportunityStage
upsertContact
blacklistCompany
deleteCompany
enrichCompany
processLeadOutcomeFeedback
```

Richtige Muster:

```txt
Bei einem bestehenden Datensatz:
- ID aus Body nehmen
- Datensatz laden
- organization_id aus DB-Datensatz nehmen
- Zugriff prüfen

Bei neuer Erstellung:
- organization_id aus sicherer Org-Auflösung nehmen
- nicht aus frei manipulierbarem Body übernehmen
```

---

## 6. Direkte Frontend-Entity-Zugriffe vermeiden

Frontend-Filter sind keine echte Sicherheitsgrenze.

Direkte Aufrufe wie diese sind langfristig zu vermeiden:

```js
base44.entities.Company.filter(...)
base44.entities.Company.update(...)
base44.entities.Task.update(...)
base44.entities.ResearchRun.filter(...)
```

Besser:

```txt
Backend Function oder Data Adapter verwenden.
```

Kurzfristig akzeptabel nur, wenn:

```txt
- organization_id Filter gesetzt ist
- keine fremde ID direkt update/delete auslösen kann
- keine sensiblen Plattformdaten gelesen werden
```

Für Writes gilt stärker:

```txt
Keine direkten Frontend-Writes auf kritische Entities ohne serverseitigen Cross-Check.
```

---

## 7. Safe Update Functions

Direkte Updates wurden gehärtet über:

```txt
updateCompanySafe
updateTaskSafe
```

Diese Functions müssen erhalten bleiben und bei weiteren Updates als Muster dienen.

Pflichtlogik:

```txt
- Datensatz per ID laden
- organization_id aus Datensatz nehmen
- PlatformAdmin / Owner / aktives OrganizationMember prüfen
- geschützte Felder aus patch entfernen
- erst danach update
```

Geschützte Felder dürfen nicht per Patch überschrieben werden, z. B.:

```txt
organization_id
created_by
company_id bei Tasks
google_place_id
source_provider
research_run_id
```

Wichtig:

```txt
IDs sind keine Sicherheitsgrenze.
```

Legacy-Hinweis:

```txt
Tasks ohne organization_id sind ein Altlasten-Risiko.
Langfristig muss jede kundenbezogene Entity eine organization_id haben.
```

---

## 8. Öffentliche Formular-Entities

Diese Entities dürfen öffentlich erstellt werden, aber niemals öffentlich lesbar sein:

```txt
WaitlistLead
InvestorInquiry
AgencyRequest
```

Regeln:

```txt
public create: ja
public read: nein
public update/delete: nein
admin/platform admin read/update/delete: ja
```

Pflichtschutz bei öffentlichen Formularen:

```txt
- Honeypot
- Dedupe
- Consent-Pflicht
- Rate Limit, wenn möglich
- keine öffentliche Listenfunktion
```

---

## 9. Nicht-authentifizierte Functions

Nicht jede unauthenticated Function ist automatisch falsch.

Erlaubte Muster:

```txt
submitWaitlistLead: public wegen Landing-Formular, aber mit Honeypot/Dedupe/Consent
submitInvestorInquiry: public wegen Investor-Formular, aber mit Honeypot/Dedupe/Consent
submitAgencyRequest: public wegen Anfrageformular, aber mit Honeypot/Rate Limit
stripeWebhook: keine User-Auth, aber Stripe-Signaturprüfung Pflicht
Scheduled Functions: kein User-Kontext, aber nicht öffentlich missbrauchbar machen
```

Nicht akzeptabel für Produktion:

```txt
generateLeads: deprecated -> löschen/deaktivieren oder PlatformAdmin-only
runUnifiedResearch: deprecated -> löschen/deaktivieren oder PlatformAdmin-only
parallelQuotaTest: Testmodus ohne Auth -> entfernen oder PlatformAdmin-only
simulateProcessResearchRun: nur PlatformAdmin oder löschen
testPlatformAuth: nur PlatformAdmin oder löschen
testQuotaEnforcement: nur PlatformAdmin oder löschen
sendBrevoEmail: nicht frei für jeden eingeloggten Nutzer; mindestens Rollen- und Org-Check
```

Aktueller Sicherheitsstand laut Base44-Bericht vom 2026-05-28:

```txt
- generateLeads: DEPRECATED-Guard, 410 für Nicht-Admins.
- runUnifiedResearch: DEPRECATED-Guard, 410 für Nicht-Admins.
- parallelQuotaTest: 403 für Nicht-PlatformAdmins.
- simulateProcessResearchRun: 403 für Nicht-PlatformAdmins.
- testPlatformAuth: 403 für Nicht-PlatformAdmins.
- testQuotaEnforcement: 403 für Nicht-PlatformAdmins.
- sendBrevoEmail: muss Tenant-/Rollencheck behalten; nicht frei für alle User.
- processLeadOutcomeFeedback: Sicherheitslücke gefunden und gefixt.
```

`processLeadOutcomeFeedback`-Regel:

```txt
- Daily-Run-Modus ohne organization_id darf nur PlatformAdmin oder Scheduler/System-Kontext ausführen.
- Einzel-Org-Modus darf nur Owner, aktives OrganizationMember oder PlatformAdmin ausführen.
- Falls kein echter Scheduler registriert ist, direkte Aufrufe streng schützen.
```

Vor Live-Go muss der Security Scan hierzu sauber sein oder die verbleibenden Warnungen müssen als bewusst akzeptierte Plattformlimits dokumentiert sein.

---

## 10. Supabase ist der Ziel-Datenkern

Supabase/Postgres soll schrittweise eingeführt werden, nicht als hektischer Big-Bang.

Zieltabellen:

```txt
organizations
organization_members
companies
contacts
contact_logs
tasks
opportunities
research_runs
usage_logs
quota_reservations
waitlist_leads
investor_inquiries
support_notes
plans
subscriptions
activity_logs
platform_admins
```

Supabase muss liefern:

```txt
- echte Postgres RLS
- organization_id-Isolation auf DB-Ebene
- sichere Public Inserts für Waitlist/Investor
- PlatformAdmin-Policies
- Indexes
- SQL-Migrationen
- updated_at Trigger
```

Migrationsstrategie:

```txt
Phase 1: Supabase-Schema + RLS vorbereiten.
Phase 2: WaitlistLead, InvestorInquiry, SupportNote direkt oder parallel nach Supabase schreiben.
Phase 3: UsageLog, ResearchRun-Audit, QuotaReservation parallel nach Supabase.
Phase 4: Company, Contact, Task, Opportunity, ContactLog schrittweise spiegeln.
Phase 5: Dashboard/Leads lesen aus Supabase statt Base44.
Phase 6: Base44 nur noch UI/Übergang.
Phase 7: eigenes Hosting/API und Base44 verlassen.
```

---

## 11. Data Adapter Layer

Es wurde ein Data Adapter Layer angelegt bzw. vorbereitet.

Ziel:

```txt
UI-Komponenten sollen künftig nicht wissen, ob Daten aus Base44 oder Supabase kommen.
```

Wunschstruktur:

```txt
src/lib/data/
- companies.js
- contacts.js
- tasks.js
- opportunities.js
- researchRuns.js
- dashboard.js
- waitlist.js
- investors.js
- supportNotes.js
- usage.js
- organizations.js
```

Oder zentral:

```txt
src/lib/dataAdapter.js
```

Regel für neue Features:

```txt
Nicht direkt base44.entities in neue UI-Komponenten schreiben.
Immer Backend Function oder Data Adapter nutzen.
```

Späterer Wechsel:

```txt
DATA_BACKEND=base44
DATA_BACKEND=supabase
```

Dann wird intern umgeschaltet, ohne die UI komplett umzubauen.

---

## 12. GitHub, ZIP und Ausstieg aus Base44

Eine Base44-ZIP-Datei ist nicht die komplette SaaS-Infrastruktur.

ZIP/GitHub enthält typischerweise:

```txt
- Frontend-Code
- Komponenten
- Seiten
- Teile der Logik
```

ZIP/GitHub enthält nicht automatisch:

```txt
- Base44 Hosting
- Base44 Entity-Datenbank
- Live Functions
- Secrets
- Automationen
- Auth-Provider-Konfiguration
- produktive Datenmigration
```

Für den Ausstieg braucht man:

```txt
1. Hosting, z. B. Vercel
2. Datenbank, z. B. Supabase/Postgres
3. Auth
4. Backend/API oder Edge Functions
5. Secrets/ENV
6. Datenexport aus Base44
7. Import-/Migrationsskripte
8. DNS/Domain-Umstellung
9. Adapter-Schicht im Code
```

Große Unternehmen trennen:

```txt
Frontend -> eigene API -> Datenbank -> externe Dienste
```

Diese Trennung ist ab jetzt auch für Vertriebo das Ziel.

---

## 13. Research Engine und Gebietsabdeckung

Die automatische Gebietsabdeckung ist ein starkes Vertriebo-Feature.

Aktueller Kern:

```txt
LocationIndex
LocationIndex-basierter Resolver
coveredLocations
selectedLocationsCount
locations_searched_count
searched_locations_json
coverage_complete
ActiveResearchBanner mit Orte-Fortschritt
```

Wichtige Regeln:

```txt
- LocationIndex-Orte vor Grid-Punkten verwenden
- special_postal_recipient nie als Suchort nutzen
- PLZ/Ort möglichst aus LocationIndex auflösen
- Google nur als Fallback
- Orte deduplizieren über searched_locations_json
- locations_searched_count darf nie über selected_locations_count laufen
```

UI-Begriff:

```txt
Automatische Gebietsrecherche
Automatische Gebietsabdeckung
```

Nicht technisch nennen:

```txt
coverage_mode
location_index_plus_grid
```

---

## 14. processResearchRun Regeln

`processResearchRun` ist sicherheitskritisch.

Regeln:

```txt
- Auth erforderlich
- research_run_id aus Body okay
- organization_id NICHT aus Body vertrauen
- ResearchRun per ID laden
- organization_id aus ResearchRun nehmen
- Owner/Member/PlatformAdmin prüfen
- erst danach outer-scope research_run_id für Error-Handler setzen
- Processing Lock beachten
- Fresh Read nach Lock-Gewinn
- Max-Runtime/Watchdog sauber behandeln
```

Alle Writes müssen dieselbe organization_id nutzen:

```txt
Company.create
UsageLog
ResearchRun.update
Audit/Event-Logs
```

---

## 15. E-Mail-MVP

Aktueller E-Mail-MVP:

```txt
Vertriebo versendet in der MVP-Version keine E-Mails automatisch.
Der Text wird vorbereitet.
User kann kopieren oder mailto öffnen.
Kontakt wird nur dokumentiert, wenn User es aktiv bestätigt.
```

Nicht behaupten:

```txt
E-Mails werden über Brevo versendet
Tracking ist aktiv
```

Falls `sendBrevoEmail` existiert:

```txt
Nicht frei für alle eingeloggten Nutzer.
Nur mit Rollencheck und organization_id-Check oder deaktivieren.
```

---

## 16. Feedback, Waitlist und Investor-Daten

Feedback:

```txt
SupportNote
FeedbackWidget
PlatformAdmin Tab Feedback
```

Wichtig:

```txt
Normale Nutzer dürfen Feedback erstellen.
PlatformAdmin sieht Feedback.
Normale Nutzer dürfen nicht alle SupportNotes lesen.
```

Waitlist:

```txt
/landing Coming-soon/Produktseite
WaitlistLead
PlatformAdmin Tab Interessenten
```

Investor:

```txt
Footer-Link Investor Relations
/investors
InvestorInquiry
PlatformAdmin Tab Investoren
```

Regel:

```txt
Keine automatischen Bulk-Mails vor sauberem E-Mail-/Consent-Konzept.
Erst sammeln, anzeigen, kopieren/status setzen.
```

---

## 17. Deprecated/Test Functions

Vor öffentlichem Live-Go müssen Test-/Legacy-Functions entfernt oder hart PlatformAdmin-only sein.

Besonders:

```txt
generateLeads
runUnifiedResearch
parallelQuotaTest
simulateProcessResearchRun
testPlatformAuth
testQuotaEnforcement
```

Diese dürfen im Produktivsystem nicht öffentlich, anonym oder nur schwach geschützt erreichbar sein.

Kanonischer Research-Flow:

```txt
startResearchRun
processResearchRun
getResearchRunObservability
listCompanies
```

Alte Research-Flows nicht wiederbeleben.

---

## 18. Security-Header

Base44 erlaubt laut aktueller Projektklärung keine direkte Plattform-Konfiguration für:

```txt
X-Frame-Options
Permissions-Policy
Content-Security-Policy
```

Diese Punkte sind als Base44-Plattformlimit dokumentiert.

Für späteres eigenes Hosting/Vercel/Cloudflare vormerken:

```txt
- X-Frame-Options oder frame-ancestors in CSP setzen.
- Permissions-Policy restriktiv setzen.
- Content-Security-Policy sauber definieren.
- HSTS aktivieren.
```

---

## 19. Live-Go-Regel

Vor Live-Go prüfen:

```txt
1. Security Scan: keine echten kritischen ACL/RLS-Probleme; verbleibende RLS-Warnungen müssen als Base44-Plattformlimit / False Positive dokumentiert sein.
2. Deprecated/Test Functions entfernt oder PlatformAdmin-only.
3. Public Forms: create public, read admin-only.
4. Kundendaten: organization_id-Isolation in Backend und Frontend geprüft.
5. Safe Update Functions für kritische Writes.
6. GitHub Sync aktuell.
7. Keine neuen Base44-Direktabhängigkeiten ohne Adapter.
8. ResearchRun mit echtem Ort testen, z. B. 35708 Haiger / 25 km.
9. Dashboard, Leads, LeadDetail, Tasks, Settings, PlatformAdmin prüfen.
10. Feedback/Waitlist/Investor-Daten im PlatformAdmin sichtbar.
11. Security-Header-Limits dokumentiert oder bei eigenem Hosting gesetzt.
```

---

## 20. Was Base44 NICHT tun soll

```txt
- Keine neuen großen Features vor Security-/Migration-Basis.
- Keine deprecated Research-Flows reaktivieren.
- Keine organization_id aus dem Body blind vertrauen.
- Keine direkten Frontend-Writes auf kritische Entities.
- Keine öffentlichen Reads auf WaitlistLead, InvestorInquiry, AgencyRequest.
- Keine Bulk-Mail-Funktion ohne Consent-/E-Mail-Konzept.
- Keine technischen IDs im UI anzeigen, wenn menschenlesbare Labels möglich sind.
- Keine Supabase-Migration als Big-Bang durchführen.
- Keine Änderungen ohne Merkliste prüfen/aktualisieren.
- Keine Security-Scan-Warnungen pauschal ignorieren; immer als echtes Risiko oder dokumentiertes Plattformlimit klassifizieren.
```

---

## 21. Merksatz

```txt
Base44 ist die schnelle Bauplattform.
Supabase/Postgres wird der echte Datenkern.
Die Adapter-/Backend-Schicht ist die Brücke, damit Vertriebo später nicht kaputtgeht.
```
