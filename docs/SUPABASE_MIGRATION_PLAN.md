# Supabase Migration Plan

Stand: 2026-05-29

Dieses Dokument beschreibt die vorbereitete Migrationsstrategie fuer Vertriebo von Base44 zu Supabase/Postgres. Es ist keine Sofort-Migration und kein Big-Bang. Base44 bleibt fuer MVP und Beta zunaechst aktiv.

## Ziel

Vertriebo soll langfristig nicht hart an Base44 gebunden bleiben.

Zielarchitektur:

```txt
Frontend -> Data Adapter -> eigene Backend/API-Schicht -> Supabase/Postgres -> externe Dienste
```

Supabase wird der produktive Datenkern fuer:

```txt
Mandantenfaehigkeit
Row Level Security
Datenexport
Reporting
Migration auf eigenes Hosting
```

## Grundregeln

```txt
Keine Big-Bang-Migration.
Keine produktiven Base44-Daten ohne Testexport migrieren.
Keine Security-Abkuerzungen.
Keine organization_id blind aus dem Client uebernehmen.
Keine Public Reads auf private Daten.
```

## Phasen

### Phase 1: Schema und RLS vorbereiten

Zuerst nur Tabellen, Policies, Indizes und Migrationen entwerfen.

Noch keine App auf Supabase umstellen.

### Phase 2: Public Forms parallel schreiben

Als erste echte Daten eignen sich:

```txt
waitlist_leads
investor_inquiries
support_notes
```

Warum:

```txt
wenig Risiko
klare Public-Insert-Use-Cases
gute RLS-Testbasis
PlatformAdmin kann Daten lesen
```

### Phase 3: Operations- und Audit-Daten spiegeln

Danach:

```txt
platform_audit_logs
activity_logs
usage_logs
quota_reservations
research_run_audits
```

Ziel:

```txt
Systembetrieb messbar machen
Debugging vereinfachen
Migration vorbereiten
```

### Phase 4: Core CRM-Daten spiegeln

Danach schrittweise:

```txt
companies
contacts
contact_logs
tasks
opportunities
lead_outcomes
org_learned_signals
organization_keyword_profiles
```

Wichtig:

```txt
zuerst parallel schreiben
spaeter parallel lesen vergleichen
erst danach Reads umstellen
```

### Phase 5: Dashboard und Leads lesen aus Supabase

Erst wenn Daten konsistent sind:

```txt
Dashboard Supabase Read
Leads Supabase Read
LeadDetail Supabase Read
Tasks Supabase Read
```

### Phase 6: Base44 als UI-Uebergang

Base44 kann voruebergehend weiter als UI/Workflow-Plattform dienen, waehrend Daten aus Supabase kommen.

### Phase 7: Eigenes Hosting und eigene API

Spaeter:

```txt
Vercel/Cloudflare/anderes Hosting
Supabase Auth oder eigener Auth Provider
eigene API/Edge Functions
Base44 verlassen
```

## Zieltabellen

### Mandanten und Nutzer

```sql
organizations
organization_members
invites
platform_admins
```

### CRM und Vertrieb

```sql
companies
contacts
contact_logs
tasks
opportunities
blacklist
weekly_batches
```

### Research Engine

```sql
research_runs
research_run_events
external_company_sources
location_index
lead_outcomes
org_learned_signals
organization_keyword_profiles
```

### Billing und Usage

```sql
plans
subscriptions
usage_logs
quota_reservations
billing_event_logs
```

### Public Forms und Support

```sql
waitlist_leads
investor_inquiries
agency_requests
support_notes
```

### System und Audit

```sql
platform_audit_logs
activity_logs
error_alert_rate_limits
app_settings
platform_config
```

## Wichtige Spalten

Jede kundenspezifische Tabelle braucht:

```sql
id uuid primary key default gen_random_uuid()
organization_id uuid not null
created_at timestamptz default now()
updated_at timestamptz default now()
created_by text
```

Viele Tabellen brauchen zusaetzlich:

```sql
archived_at timestamptz
archived_by text
metadata jsonb
```

Keine echten Deletes im Normalbetrieb. Erst Soft Delete / Archivierung.

## RLS Grundmodell

### Platform Admin

Platform Admins duerfen Plattformdaten sehen und verwalten.

Prinzip:

```sql
is_platform_admin(auth.uid())
```

### Organisation Member

Normale Nutzer duerfen nur Daten ihrer Organisation sehen.

Prinzip:

```sql
exists (
  select 1
  from organization_members om
  where om.organization_id = table.organization_id
    and om.user_id = auth.uid()
    and om.status = 'active'
)
```

### Public Inserts

Nur fuer Public Forms:

```txt
waitlist_leads: public insert, admin read
investor_inquiries: public insert, admin read
agency_requests: public insert, admin read
```

Kein Public Select.

## Beispiel RLS Policies

### companies

```sql
alter table companies enable row level security;

create policy companies_select_own_org
on companies for select
to authenticated
using (
  is_platform_admin(auth.uid())
  or is_org_member(auth.uid(), organization_id)
);

create policy companies_insert_own_org
on companies for insert
to authenticated
with check (
  is_platform_admin(auth.uid())
  or is_org_member(auth.uid(), organization_id)
);

create policy companies_update_own_org
on companies for update
to authenticated
using (
  is_platform_admin(auth.uid())
  or is_org_member(auth.uid(), organization_id)
)
with check (
  is_platform_admin(auth.uid())
  or is_org_member(auth.uid(), organization_id)
);
```

### waitlist_leads

```sql
alter table waitlist_leads enable row level security;

create policy waitlist_insert_public
on waitlist_leads for insert
to anon, authenticated
with check (true);

create policy waitlist_admin_read
on waitlist_leads for select
to authenticated
using (is_platform_admin(auth.uid()));
```

## Helper Functions

```sql
create or replace function is_platform_admin(user_id uuid)
returns boolean
language sql
security definer
as $$
  select exists (
    select 1 from platform_admins pa
    where pa.user_id = is_platform_admin.user_id
      and pa.status = 'active'
  );
$$;
```

```sql
create or replace function is_org_member(user_id uuid, org_id uuid)
returns boolean
language sql
security definer
as $$
  select exists (
    select 1 from organization_members om
    where om.user_id = is_org_member.user_id
      and om.organization_id = is_org_member.org_id
      and om.status = 'active'
  );
$$;
```

## Indizes

Pflichtindizes:

```sql
create index idx_companies_org on companies(organization_id);
create index idx_companies_org_status on companies(organization_id, status);
create index idx_companies_org_place on companies(organization_id, google_place_id);
create index idx_tasks_org on tasks(organization_id);
create index idx_research_runs_org on research_runs(organization_id);
create index idx_lead_outcomes_org_company on lead_outcomes(organization_id, company_id);
create index idx_usage_logs_org_month on usage_logs(organization_id, created_at);
create index idx_platform_audit_logs_created on platform_audit_logs(created_at desc);
```

## Data Adapter Strategie

UI soll nicht direkt wissen, ob Daten aus Base44 oder Supabase kommen.

Zielstruktur:

```txt
src/lib/data/organizations.js
src/lib/data/companies.js
src/lib/data/tasks.js
src/lib/data/researchRuns.js
src/lib/data/leadOutcomes.js
src/lib/data/waitlist.js
src/lib/data/investors.js
src/lib/data/supportNotes.js
src/lib/data/usage.js
```

Umschaltung spaeter:

```txt
DATA_BACKEND=base44
DATA_BACKEND=supabase
```

Regel:

```txt
Neue kritische Features nicht mehr direkt mit base44.entities in UI-Komponenten verdrahten.
Backend Function oder Data Adapter nutzen.
```

## Migration Testing

Vor jeder echten Migration:

```txt
1. Export aus Base44 erzeugen.
2. Mapping pruefen.
3. Import in Supabase Staging.
4. Row Counts vergleichen.
5. Stichproben pro Organisation.
6. RLS-Test: Org A darf Org B nicht sehen.
7. PlatformAdmin darf alle relevanten Daten sehen.
8. Public Forms duerfen insert, aber nicht select.
9. App gegen Staging testen.
10. Rollback-Plan definieren.
```

## Reihenfolge der ersten echten Umsetzung

Empfohlen:

```txt
1. Supabase Projekt erstellen.
2. SQL Migration 001_core_schema.sql schreiben.
3. SQL Migration 002_rls_policies.sql schreiben.
4. SQL Migration 003_indexes.sql schreiben.
5. Public Forms Tabellen zuerst testen.
6. DataAdapter fuer waitlist/investors/supportNotes bauen.
7. Parallel Write fuer Public Forms aktivieren.
8. PlatformAdmin Read optional gegen Supabase testen.
```

## Keine Sofort-Migration

Aktueller Status:

```txt
Base44 bleibt fuer MVP/Beta aktiv.
Supabase wird vorbereitet.
Erste echte Migration nur nach erfolgreichem Beta-Flow und Staging-Test.
```
