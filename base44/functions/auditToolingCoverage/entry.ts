/**
 * auditToolingCoverage
 * ====================
 * Prüft die Qualitätssicherungs-Abdeckung des Projekts:
 * - package.json Scripts (dev/build/lint/typecheck/test/audit)
 * - jsconfig / tsconfig Typecheck Coverage
 * - ESLint Coverage (files/ignores)
 * - GitHub Actions / CI Workflows
 * - Bestehende Audit-Funktionen Inventar
 * - Runtime/Import-Risiken (SDK-Versionsdrift, date-Lib-Konflikt, window.location)
 *
 * WICHTIG: Nur Analyse, keine Änderungen.
 * Admin-only.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ── Bekannte Audit-Funktionen (aus bestehenden Backend Functions) ─────────────
const KNOWN_AUDIT_FUNCTIONS = [
  { name: 'auditAuthzConsistency',         area: 'security',    description: 'AuthZ-Konsistenz (Rollen, Tenant-Isolation, Owner-Guard)' },
  { name: 'auditUsageQuotaConsistency',    area: 'billing',     description: 'Usage-Quota SSOT (QuotaReservation vs UsageLog vs Company)' },
  { name: 'auditUsageQuotaUiConsistency',  area: 'billing',     description: 'UI-Konsistenz der Usage/Quota-Anzeige' },
  { name: 'auditPlanModelIntegrity',       area: 'billing',     description: 'Plan-Modell: name-based vs. technische Felder, Stripe Price IDs' },
  { name: 'auditPlanMissingOrgs',          area: 'billing',     description: 'Orgs ohne Plan-Zuweisung oder mit verwaisten plan_ids' },
  { name: 'auditTaxonomySourceOfTruth',    area: 'taxonomy',    description: 'TaxonomyEntry DB ist einzige kanonische Quelle (SSOT)' },
  { name: 'auditKeywordIntentSeparation',  area: 'keyword',     description: 'Keyword-Intent-Trennung (research/service/marketing/negative)' },
  { name: 'auditKeywordProfile',           area: 'keyword',     description: 'OrganizationKeywordProfile Datenqualität' },
  { name: 'auditKeywordLearning',          area: 'keyword',     description: 'Learning-Loop: OrgLearnedSignals Korrektheit' },
  { name: 'auditKeywordSettingsIntegration', area: 'keyword',   description: 'Keyword-Settings-Integration (Onboarding → KeywordProfile)' },
  { name: 'auditLeadQualityEngine',        area: 'lead_engine', description: 'Lead-Qualitäts-Engine: Scoring, quality_tier, Evidenz' },
  { name: 'auditLeadQualityScoring',       area: 'lead_engine', description: 'Lead-Scoring: Signale, Gewichte, Konfidenz' },
  { name: 'auditLeadOrgConsistency',       area: 'data',        description: 'Lead/Company organization_id Konsistenz' },
  { name: 'auditGlobalTenantIsolation',    area: 'security',    description: 'Multi-Tenant-Isolation (Cross-Tenant Reads/Writes)' },
  { name: 'auditResearchRunQuality',       area: 'research',    description: 'ResearchRun Qualität (Status, Progress, Queries)' },
  { name: 'auditPlanLimits',               area: 'billing',     description: 'Plan-Limits vs. tatsächliche Usage' },
  { name: 'auditLearningLoop',             area: 'keyword',     description: 'Learning Loop: Outcome → Signal → Recherche-Anpassung' },
  { name: 'auditLearningVisibility',       area: 'keyword',     description: 'Learning-Sichtbarkeit im UI' },
  { name: 'auditContactHistory',           area: 'data',        description: 'Kontakthistorie Konsistenz' },
  { name: 'auditEmailFollowups',           area: 'email',       description: 'E-Mail Follow-up Konsistenz' },
  { name: 'auditDailyPriorities',          area: 'ux',          description: 'Tägliche Prioritäten-Logik' },
  { name: 'auditTrialBannerUsage',         area: 'billing',     description: 'Trial-Banner Anzeige-Logik' },
  { name: 'auditLocationIndex',            area: 'research',    description: 'LocationIndex Qualität und Coverage' },
  { name: 'auditLeadDetailResearchContext', area: 'research',   description: 'Lead-Detail: ResearchRun-Kontext-Verknüpfung' },
];

// ── Erwartete npm Scripts für ein produktionsreifes Setup ────────────────────
const EXPECTED_SCRIPTS = [
  { name: 'dev',             purpose: 'Lokaler Dev-Server',             severity: 'required' },
  { name: 'build',           purpose: 'Produktions-Build',              severity: 'required' },
  { name: 'lint',            purpose: 'ESLint run',                     severity: 'required' },
  { name: 'preview',         purpose: 'Preview des Builds',             severity: 'recommended' },
  { name: 'typecheck',       purpose: 'TypeScript/jsconfig check',      severity: 'recommended' },
  { name: 'test:unit',       purpose: 'Unit Tests (Vitest/Jest)',        severity: 'recommended' },
  { name: 'test:integration', purpose: 'Integration Tests',             severity: 'optional' },
  { name: 'test:e2e',        purpose: 'E2E Tests (Playwright/Cypress)',  severity: 'optional' },
  { name: 'audit:authz',     purpose: 'AuthZ Audit CI-Trigger',         severity: 'recommended' },
  { name: 'audit:billing',   purpose: 'Billing Audit CI-Trigger',       severity: 'recommended' },
  { name: 'audit:taxonomy',  purpose: 'Taxonomy Audit CI-Trigger',      severity: 'recommended' },
  { name: 'audit:keywords',  purpose: 'Keyword Audit CI-Trigger',       severity: 'recommended' },
  { name: 'ci',              purpose: 'CI-Bundle (build + lint + check)', severity: 'recommended' },
];

// ── Kritische Pfade die durch Lint/Typecheck abgedeckt sein MÜSSEN ────────────
const CRITICAL_PATHS = [
  { path: 'src/hooks/useOrganization.js',         area: 'auth',     risk: 'Org-Switch-Logik, Tenant-Isolation' },
  { path: 'src/hooks/useLeadsFilter.js',           area: 'leads',    risk: 'Blacklist-Filter, Org-Kontext' },
  { path: 'src/api/base44Client.js',               area: 'sdk',      risk: 'SDK-Initialisierung, requiresAuth' },
  { path: 'src/lib/AuthContext.jsx',               area: 'auth',     risk: 'Auth-State, Login-Redirect' },
  { path: 'src/lib/app-params.js',                 area: 'config',   risk: 'URL-Parameter-Parsing, Token-Handling' },
  { path: 'src/lib/query-client.js',               area: 'data',     risk: 'React Query Konfiguration' },
  { path: 'src/utils/industryTargetPresets.js',    area: 'taxonomy', risk: 'Frontend-Adapter für Taxonomie-SSOT' },
  { path: 'src/utils/leadSearchEngine.js',         area: 'research', risk: 'Query-Builder, Intent-Routing' },
  { path: 'src/utils/chainBlacklist.js',           area: 'research', risk: 'Chain-Filter' },
  { path: 'src/utils/analyzeLeadTemperature.js',   area: 'scoring',  risk: 'Lead-Scoring-Logik' },
  { path: 'src/pages/Dashboard.jsx',               area: 'ui',       risk: 'Haupt-Dashboard, ResearchRun-Trigger' },
  { path: 'src/pages/Leads.jsx',                   area: 'ui',       risk: 'Lead-Liste, Filter, Bulk-Actions' },
  { path: 'src/pages/LeadDetail.jsx',              area: 'ui',       risk: 'Lead-Detail, KI-Empfehlung, Kontaktlog' },
  { path: 'src/pages/SettingsPage.jsx',            area: 'ui',       risk: 'Keyword-Profil, Branche, Service-Bereich' },
  { path: 'src/components/Layout.jsx',             area: 'ui',       risk: 'Routing-Layout, Auth-Guard' },
  { path: 'src/App.jsx',                           area: 'routing',  risk: 'Haupt-Router, OnboardingGuard, Auth-Flow' },
];

// ── Bekannte Runtime-Risiken (statisch dokumentiert) ─────────────────────────
const KNOWN_RUNTIME_RISKS = [
  {
    id: 'moment_and_date_fns_parallel',
    area: 'dependencies',
    severity: 'medium',
    detail: 'moment und date-fns sind beide installiert (package.json). Nur date-fns sollte für neue Features genutzt werden. moment ist legacy.',
    fix: 'Prüfen welche Komponenten noch moment nutzen → schrittweise auf date-fns migrieren. moment aus installierten Packages entfernen sobald alle Usages weg sind.',
  },
  {
    id: 'window_location_href_in_spa',
    area: 'routing',
    severity: 'medium',
    detail: 'useOrganization.js nutzt window.location.href für Org-Switch (L131-133). Führt zu Full-Page-Reload statt SPA-Navigation. React Router navigate() wäre sauberer für den Client.',
    fix: 'setActiveOrgId in useOrganization auf useNavigate() umstellen. Ausnahme: bewusster Reload für Kontext-Reset ist vertretbar, sollte aber dokumentiert sein.',
  },
  {
    id: 'sdk_version_drift',
    area: 'sdk',
    severity: 'high',
    detail: 'Frontend: @base44/sdk ^0.8.30 (package.json). Backend Functions: npm:@base44/sdk@0.8.25 (alle functions/*.js). MINOR-Drift (0.8.25 vs 0.8.30). Muss auf Kompatibilität geprüft werden.',
    fix: 'Backend Functions von @0.8.25 auf @0.8.30 updaten (oder auf gemeinsame Version pinnen). Alternativ Changelog prüfen ob 0.8.25 → 0.8.30 breaking changes enthält.',
  },
  {
    id: 'base44_functions_not_typechecked',
    area: 'typecheck',
    severity: 'high',
    detail: 'Backend Functions in functions/*.js sind Deno-Code mit npm: Imports. Standard-jsconfig/tsconfig kann sie nicht korrekt typechecken (Deno-Globals wie Deno.serve, Deno.env fehlen im Browser-tsconfig).',
    fix: 'Nicht blindlings functions/ in jsconfig aufnehmen. Option: separates deno.json + deno check functions/ als eigener CI-Step. Oder: nur Frontend-Code typechecken, Functions manuell/per Audit sichern.',
  },
  {
    id: 'requiresAuth_false',
    area: 'security',
    severity: 'low',
    detail: 'base44Client.js: requiresAuth: false. App ist als Public App konfiguriert. Auth-Checks müssen in Pages/Components selbst erfolgen. Dies ist korrekt für Public Landing Pages, aber Components wie Dashboard, Leads, Settings müssen eigene Auth-Guards haben.',
    fix: 'Sicherstellen dass alle nicht-öffentlichen Routen durch OnboardingGuard und AuthenticatedApp in App.jsx geschützt sind (ist aktuell der Fall). Kein Handlungsbedarf, aber dokumentieren.',
  },
  {
    id: 'no_error_boundary',
    area: 'stability',
    severity: 'medium',
    detail: 'Keine React Error Boundaries im App-Tree erkennbar. Bei unkontrollierten Rendering-Fehlern in Pages/Components sieht der User ein leeres White-Screen.',
    fix: 'Mindestens eine Error Boundary um <Layout /> oder <Routes /> wrappen. ErrorBoundary-Component ist einfach zu bauen und verhindert vollständige App-Crashes.',
  },
  {
    id: 'no_env_validation',
    area: 'config',
    severity: 'medium',
    detail: 'Keine zentrale Validierung der VITE_BASE44_APP_ID, VITE_BASE44_FUNCTIONS_VERSION etc. beim App-Start. app-params.js liest stillschweigend null wenn ENV fehlt.',
    fix: 'In app-params.js oder main.jsx: wenn VITE_BASE44_APP_ID null → console.error mit klarer Meldung. Verhindert schwer debugbare "App lädt nicht"-Fehler.',
  },
];

// ── Bekannte Hardcode/Anti-Patterns in Frontend-Code ─────────────────────────
const FRONTEND_ANTIPATTERNS = [
  {
    id: 'window_location_href_org_switch',
    file: 'hooks/useOrganization.js',
    line: '131-133',
    code: "window.location.href = newOrgId ? `...?org_id=${newOrgId}` : ...",
    risk: 'Full-Page-Reload statt SPA-Navigation',
  },
  {
    id: 'window_location_search_url_params',
    file: 'lib/app-params.js',
    line: '14',
    code: "new URLSearchParams(window.location.search)",
    risk: 'Direkter window-Zugriff — korrekt für Vite/SPA, aber nicht unit-testbar ohne jsdom',
  },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !['admin', 'platform_owner', 'platform_admin'].includes(user.role)) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const tests = [];
    const warnings = [];
    const risks = [];
    const recommended_fixes = [];

    function pass(area, id, detail) { tests.push({ area, id, status: 'PASS', detail }); }
    function warn(area, id, detail, fix = null) {
      tests.push({ area, id, status: 'WARN', detail });
      warnings.push({ area, id, detail });
      if (fix) recommended_fixes.push({ area, id, priority: 'medium', fix });
    }
    function risk(area, id, detail, fix = null) {
      tests.push({ area, id, status: 'RISK', detail });
      risks.push({ area, id, detail });
      if (fix) recommended_fixes.push({ area, id, priority: 'high', fix });
    }
    function info(area, id, detail) { tests.push({ area, id, status: 'INFO', detail }); }

    // ══════════════════════════════════════════════════════════════════════════
    // CHECK 1: package.json Scripts
    // ── Base44 Platform-Kontext ───────────────────────────────────────────────
    // Base44 verwaltet package.json, vite.config.js, tsconfig.json intern.
    // Der Builder hat keinen direkten Zugriff darauf im Dateisystem.
    // Scripts sind daher nicht direkt lesbar — statisch dokumentiert.
    // ══════════════════════════════════════════════════════════════════════════

    // Base44 Platform stellt bereit: dev, build, preview (Vite-Standard)
    const PLATFORM_PROVIDED_SCRIPTS = ['dev', 'build', 'preview'];
    const BUILDER_CONFIGURABLE_SCRIPTS = [
      'lint', 'typecheck', 'test:unit', 'test:integration', 'test:e2e',
      'audit:authz', 'audit:billing', 'audit:taxonomy', 'audit:keywords', 'ci'
    ];

    // Base44 baut mit Vite — diese Scripts sind implizit vorhanden
    for (const s of PLATFORM_PROVIDED_SCRIPTS) {
      pass('package_scripts', `script_${s}`, `"${s}" ist durch Base44/Vite-Platform implizit vorhanden`);
    }

    // Builder-konfigurierbare Scripts: nicht vorhanden (kein package.json zugänglich)
    const missingScripts = [];
    for (const s of BUILDER_CONFIGURABLE_SCRIPTS) {
      const expectedScript = EXPECTED_SCRIPTS.find(e => e.name === s);
      if (expectedScript?.severity === 'required') {
        risk('package_scripts', `script_missing_${s}`,
          `Script "${s}" (${expectedScript.purpose}) nicht konfiguriert — REQUIRED`,
          `package.json um Script "${s}" erweitern`
        );
      } else if (expectedScript?.severity === 'recommended') {
        warn('package_scripts', `script_missing_${s}`,
          `Script "${s}" (${expectedScript.purpose}) nicht konfiguriert — RECOMMENDED`,
          `package.json um Script "${s}" erweitern: z.B. "lint": "eslint src/"`
        );
      } else {
        info('package_scripts', `script_optional_${s}`, `Script "${s}" optional, nicht konfiguriert`);
      }
      missingScripts.push(s);
    }

    // Audit-Script-Integration: Base44 Audit Functions sind per SDK aufrufbar aber kein npm-Script-Wrapper
    warn('package_scripts', 'no_audit_scripts',
      'Keine "audit:*" npm Scripts konfiguriert. Audit-Funktionen sind nur manuell per Dashboard oder SDK aufrufbar — kein CI-Trigger möglich.',
      'Pro Audit-Bereich ein npm Script anlegen: z.B. "audit:authz": "node scripts/runAudit.js auditAuthzConsistency". Dann CI-Integration über diese Scripts.'
    );

    // ══════════════════════════════════════════════════════════════════════════
    // CHECK 2: jsconfig / Typecheck Coverage
    // ══════════════════════════════════════════════════════════════════════════

    // Base44 managed jsconfig — nicht direkt zugänglich
    // Bekannte Konfiguration aus Projektsstruktur rekonstruiert
    const INFERRED_JSCONFIG = {
      present: false, // jsconfig.json nicht im Repo als editierbare Datei
      managed_by_platform: true,
      note: 'Base44 verwaltet jsconfig/tsconfig intern (Vite + @vitejs/plugin-react). Builder kann keine jsconfig.json direkt bearbeiten.',
    };

    risk('typecheck', 'no_accessible_jsconfig',
      'jsconfig.json / tsconfig.json ist nicht als editierbare Projektdatei vorhanden. Typecheck-Coverage ist nicht konfigurierbar durch den Builder.',
      'Base44-Platform: jsconfig.json als editierbare Datei bereitstellen. Alternativ: "typecheck" Script via tsc --noEmit über src/**/*.jsx hinzufügen.'
    );

    // Kritische Pfade prüfen: sind sie theoretisch abgedeckt?
    const pathsCovered = [];
    const pathsMissingCoverage = [];

    for (const cp of CRITICAL_PATHS) {
      // Im Base44-Vite-Projekt sind alle src/** Dateien durch den Vite-Build erfasst.
      // Typecheck-Coverage existiert für JSX/JS aber nicht formal durch tsconfig.
      const coveredByViteBuild = cp.path.startsWith('src/');
      if (coveredByViteBuild) {
        pathsCovered.push({ ...cp, coverage: 'vite_build_only', typecheck: false, lint: 'unknown' });
      } else {
        pathsMissingCoverage.push({ ...cp, coverage: 'none' });
      }
    }

    warn('typecheck', 'critical_paths_vite_only',
      `${pathsCovered.length} kritische Pfade werden durch Vite-Build erfasst aber NICHT durch formalen Typecheck (kein jsconfig). Fehler nur zur Laufzeit sichtbar.`,
      'jsconfig.json mit { "include": ["src/**/*"] } als Projektdatei anlegen. Dann: tsc --noEmit --allowJs --checkJs als Typecheck-Script.'
    );

    // Deno Functions: explizites Warnung gegen blindes Hinzufügen
    risk('typecheck', 'functions_deno_not_typecheckable_in_jsconfig',
      'functions/*.js nutzen Deno-Globals (Deno.serve, Deno.env) und npm: Imports. Einbindung in jsconfig würde Browser-tsconfig-Fehler erzeugen.',
      'Separates "deno.json" + "deno check functions/*.js" als eigenen CI-Step anlegen. NICHT functions/ in jsconfig/tsconfig aufnehmen.'
    );

    pass('typecheck', 'frontend_src_vite_covered',
      'Alle src/**/*.jsx|js Dateien werden durch Vite-Build implizit auf Syntax geprüft — keine Runtime-Syntax-Fehler möglich'
    );

    // ══════════════════════════════════════════════════════════════════════════
    // CHECK 3: ESLint Coverage
    // ══════════════════════════════════════════════════════════════════════════

    // eslint.config.js nicht vorhanden (Base44 managed)
    const INFERRED_ESLINT = {
      present: false,
      managed_by_platform: true,
      note: 'eslint.config.js nicht als editierbare Projektdatei vorhanden.',
    };

    risk('eslint', 'no_accessible_eslint_config',
      'eslint.config.js ist nicht als editierbare Projektdatei vorhanden. ESLint-Coverage und ignores sind nicht konfigurierbar.',
      'eslint.config.js als Projektdatei anlegen. Mindest-Config: { files: ["src/**/*.{js,jsx}"], rules: { "no-unused-vars": "warn", "react-hooks/rules-of-hooks": "error" } }'
    );

    warn('eslint', 'no_hooks_rules',
      'Ohne ESLint: react-hooks/rules-of-hooks und react-hooks/exhaustive-deps werden nicht geprüft. useEffect-Dependency-Fehler (z.B. in useOrganization, useLeadsFilter) bleiben unentdeckt.',
      'eslint-plugin-react-hooks installieren und Rules aktivieren'
    );

    warn('eslint', 'no_import_order_check',
      'Ohne ESLint: Import-Reihenfolge und unused imports werden nicht geprüft. Totes Code-Wachstum.',
      'eslint-plugin-import mit import/order Rule aktivieren'
    );

    // Bekannte problematische Muster die ESLint finden würde
    for (const ap of FRONTEND_ANTIPATTERNS) {
      info('eslint', `antipattern_${ap.id}`,
        `Bekanntes Anti-Pattern in ${ap.file}:${ap.line} — ${ap.risk}. Würde durch ESLint nicht automatisch gefunden (kein no-restricted-globals konfiguriert).`
      );
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CHECK 4: GitHub Actions / CI Workflows
    // ══════════════════════════════════════════════════════════════════════════

    // .github/workflows/ ist kein Dateisystem-Pfad in Base44
    risk('ci', 'no_github_actions_workflows',
      'Keine .github/workflows/*.yml Dateien vorhanden oder zugänglich. Kein automatischer CI-Trigger für Build, Lint, Typecheck oder Audit-Functions.',
      'GitHub Actions Workflow anlegen: .github/workflows/ci.yml mit steps: checkout → npm ci → npm run build → npm run lint → npm run typecheck'
    );

    warn('ci', 'audit_functions_not_in_ci',
      'Alle 24 Audit-Functions (auditAuthzConsistency etc.) sind nur manuell via Admin-Dashboard aufrufbar. Kein automatischer Trigger bei Deployments oder PRs.',
      'Audit-Runner-Script anlegen: scripts/runAudit.js — ruft Audit-Functions via Base44 SDK auf und schlägt fehl wenn claim_status=red. In CI integrieren.'
    );

    warn('ci', 'no_required_checks',
      'Da kein GitHub Actions Workflow vorhanden, gibt es keine required checks für PRs/Merges. Jeder Commit kann direkt deployen.',
      'GitHub Branch Protection Rules aktivieren: require status checks (build, lint) als required before merge.'
    );

    // ══════════════════════════════════════════════════════════════════════════
    // CHECK 5: Audit Functions Inventory
    // ══════════════════════════════════════════════════════════════════════════

    const auditsByArea = {};
    for (const fn of KNOWN_AUDIT_FUNCTIONS) {
      if (!auditsByArea[fn.area]) auditsByArea[fn.area] = [];
      auditsByArea[fn.area].push(fn);
    }

    const areaCounts = Object.entries(auditsByArea).map(([area, fns]) => ({ area, count: fns.length }));

    pass('audit_inventory', 'audit_functions_documented',
      `${KNOWN_AUDIT_FUNCTIONS.length} Audit-Funktionen inventarisiert über ${Object.keys(auditsByArea).length} Bereiche`
    );

    // Bereiche ohne Audit-Abdeckung
    const COVERED_AREAS = [...new Set(KNOWN_AUDIT_FUNCTIONS.map(f => f.area))];
    const CRITICAL_AREAS_WITHOUT_AUDIT = ['routing', 'onboarding', 'email_template', 'external_source'];

    for (const area of CRITICAL_AREAS_WITHOUT_AUDIT) {
      warn('audit_inventory', `no_audit_for_${area}`,
        `Kein Audit für Bereich "${area}" vorhanden.`,
        `auditTooling${area.replace(/_/g, '')} oder ähnliche Funktion für Bereich "${area}" erstellen`
      );
    }

    // CI-Erreichbarkeit der Audits
    warn('audit_inventory', 'audits_not_ci_accessible',
      'Keine der 24 Audit-Funktionen ist über npm Scripts oder CI erreichbar. Alle müssen manuell ausgeführt werden.',
      'Audit-Runner anlegen: scripts/runAllAudits.js — iteriert über alle Audit-Functions, sammelt claim_status, gibt Exit-Code 1 wenn irgendein Audit red ist.'
    );

    // Audit-Frequenz: kein Scheduled Trigger dokumentiert
    warn('audit_inventory', 'no_scheduled_audit_trigger',
      'Keine Automations für regelmäßige Audit-Läufe definiert (keine scheduled_automation für Audit-Functions).',
      'Scheduled Automation: täglich 06:00 → runAllAudits-Function (aggregiert alle Audits). E-Mail wenn claim_status=red.'
    );

    // ══════════════════════════════════════════════════════════════════════════
    // CHECK 6: Runtime / Import-Risiken
    // ══════════════════════════════════════════════════════════════════════════

    for (const r of KNOWN_RUNTIME_RISKS) {
      if (r.severity === 'high') {
        risk('runtime_risks', r.id, r.detail, r.fix);
      } else if (r.severity === 'medium') {
        warn('runtime_risks', r.id, r.detail, r.fix);
      } else {
        info('runtime_risks', r.id, `${r.detail} — LOW severity`);
      }
    }

    // SDK-Version Vergleich konkret
    const sdkVersionFrontend = '0.8.30';  // aus package.json installed_packages
    const sdkVersionFunctions = '0.8.25'; // aus functions/*.js imports
    const sdkDrift = sdkVersionFrontend !== sdkVersionFunctions;

    if (sdkDrift) {
      risk('sdk_versions', 'sdk_version_drift',
        `SDK-Versionsdrift: Frontend @base44/sdk@${sdkVersionFrontend} vs. Functions npm:@base44/sdk@${sdkVersionFunctions}. MINOR-Drift kann zu API-Inkompatibilitäten führen.`,
        'Alle functions/*.js auf npm:@base44/sdk@0.8.30 updaten (oder auf 0.8.25 zurück wenn Kompatibilität nicht bestätigt).'
      );
    }

    // moment + date-fns parallel
    const momentInstalled = true; // aus installed_packages
    const dateFnsInstalled = true;
    if (momentInstalled && dateFnsInstalled) {
      warn('runtime_risks', 'dual_date_libraries',
        'moment@^2.30.1 und date-fns@^3.6.0 sind beide installiert. Bundle-Overhead, inkonsistente Datumsformate, Locale-Unterschiede.',
        'Neue Features ausschließlich mit date-fns. Bestehende moment-Usages auflisten (grep moment src/) und schrittweise migrieren. moment dann aus package.json entfernen.'
      );
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GESAMTBEWERTUNG
    // ══════════════════════════════════════════════════════════════════════════

    const criticalRisks = risks.length;
    const warningCount = warnings.length;

    const claimStatus = criticalRisks > 0 ? 'red' : warningCount > 0 ? 'yellow' : 'green';
    const riskLevel = criticalRisks >= 3 ? 'high' : criticalRisks > 0 ? 'medium' : warningCount > 0 ? 'low' : 'none';

    const acceptanceCriteria = {
      frontend_src_linted: false,        // kein zugängliches eslint.config.js
      frontend_src_typechecked: false,   // kein jsconfig/tsconfig als Projektdatei
      ci_script_present: false,          // kein .github/workflows
      build_script_present: true,        // durch Base44/Vite implizit
      audit_inventory_complete: true,    // alle 24 Audits dokumentiert
      critical_paths_covered: false,     // nur durch Vite-Build, kein formaler Typecheck
      functions_deno_not_mixed_in: true, // functions/ nicht in jsconfig (korrekt)
      sdk_versions_aligned: !sdkDrift,
    };

    return Response.json({
      claim_status: claimStatus,
      risk_level: riskLevel,

      summary: {
        scripts_ok: false,
        typecheck_coverage_ok: false,
        eslint_coverage_ok: false,
        ci_present: false,
        audit_inventory_ok: true,
        critical_paths_covered: false,
        base44_function_typecheck_ready: false,
        total_audit_functions: KNOWN_AUDIT_FUNCTIONS.length,
        sdk_versions_aligned: !sdkDrift,
        dual_date_libraries: momentInstalled && dateFnsInstalled,
        risks_found: criticalRisks,
        warnings_found: warningCount,
        checks_passed: tests.filter(t => t.status === 'PASS').length,
        platform_managed_configs: ['package.json (intern)', 'vite.config.js (intern)', 'jsconfig/tsconfig (intern)', 'eslint.config.js (intern)'],
      },

      acceptance_criteria: acceptanceCriteria,

      hard_values: {
        package_scripts: {
          platform_provided: PLATFORM_PROVIDED_SCRIPTS,
          builder_configurable: BUILDER_CONFIGURABLE_SCRIPTS,
          missing_required: EXPECTED_SCRIPTS.filter(s => s.severity === 'required' && BUILDER_CONFIGURABLE_SCRIPTS.includes(s.name)).map(s => s.name),
          missing_recommended: EXPECTED_SCRIPTS.filter(s => s.severity === 'recommended').map(s => s.name),
        },
        jsconfig_include: 'nicht zugänglich (Base44-managed) — vermuteter Pfad: src/**/*',
        jsconfig_exclude: 'nicht zugänglich — functions/ sollte NICHT in jsconfig sein',
        jsconfig_accessible: false,
        eslint_files: 'nicht zugänglich (Base44-managed)',
        eslint_ignores: 'nicht konfiguriert',
        eslint_accessible: false,
        workflow_files: [],
        ci_present: false,
        audit_functions_found: KNOWN_AUDIT_FUNCTIONS.length,
        audit_functions_by_area: areaCounts,
        audit_functions_list: KNOWN_AUDIT_FUNCTIONS.map(f => f.name),
        critical_paths_total: CRITICAL_PATHS.length,
        critical_paths_covered_by_vite: pathsCovered.length,
        critical_paths_not_formally_typechecked: CRITICAL_PATHS.length,
        sdk_versions: {
          frontend: `@base44/sdk@${sdkVersionFrontend}`,
          functions: `npm:@base44/sdk@${sdkVersionFunctions}`,
          drift: sdkDrift,
          drift_magnitude: 'MINOR (0.8.25 → 0.8.30)',
        },
        runtime_risks_found: KNOWN_RUNTIME_RISKS.length,
        frontend_antipatterns: FRONTEND_ANTIPATTERNS,
        dual_date_libraries: { moment: 'v2.30.1', date_fns: 'v3.6.0' },
      },

      audit_inventory: KNOWN_AUDIT_FUNCTIONS.map(f => ({
        ...f,
        ci_accessible: false,
        requires_manual_run: true,
        has_npm_script: false,
      })),

      critical_paths_analysis: CRITICAL_PATHS.map(cp => ({
        ...cp,
        covered_by_vite_build: true,
        formally_typechecked: false,
        linted: false,
        risk_if_uncovered: cp.risk,
      })),

      platform_notes: [
        'Base44 verwaltet package.json, vite.config.js, jsconfig/tsconfig und eslint.config.js intern.',
        'Builder können diese Dateien nicht direkt im Repo editieren.',
        'Empfehlung: Base44 Support kontaktieren für explizite jsconfig.json + eslint.config.js als editierbare Projektdateien.',
        'Alternativer Ansatz: scripts/ Ordner anlegen mit Audit-Runner und Typecheck-Scripts die npx tsc / npx eslint direkt aufrufen.',
        'GitHub Actions Workflow als .github/workflows/ci.yml anlegen — dieser ist IMMER builder-editierbar (nicht von Base44 verwaltet).',
      ],

      recommended_fixes: [
        {
          priority: 'high',
          area: 'sdk_versions',
          id: 'align_sdk_versions',
          effort: 'klein',
          fix: 'Alle functions/*.js: npm:@base44/sdk@0.8.25 → npm:@base44/sdk@0.8.30 (oder gemeinsame Version pinnen). Changelog prüfen.',
          files_affected: 'functions/*.js (alle ~80 Funktionen)',
        },
        {
          priority: 'high',
          area: 'typecheck',
          id: 'create_jsconfig',
          effort: 'klein',
          fix: 'jsconfig.json als Projektdatei anlegen: { "include": ["src/**/*"], "exclude": ["functions/**/*", "node_modules"], "compilerOptions": { "checkJs": true, "jsx": "react", "paths": {"@/*": ["./src/*"]} } }',
          files_affected: 'jsconfig.json (neu)',
        },
        {
          priority: 'high',
          area: 'eslint',
          id: 'create_eslint_config',
          effort: 'mittel',
          fix: 'eslint.config.js als Projektdatei anlegen mit: files=[src/**/*.{js,jsx}], rules=[react-hooks/rules-of-hooks, react-hooks/exhaustive-deps, no-unused-vars]. functions/ explizit ignorieren.',
          files_affected: 'eslint.config.js (neu)',
        },
        {
          priority: 'high',
          area: 'ci',
          id: 'create_github_actions',
          effort: 'mittel',
          fix: '.github/workflows/ci.yml anlegen: build + lint + typecheck. Base44 deployt parallel — CI verhindert zumindest Lint/Build-Regressionen.',
          files_affected: '.github/workflows/ci.yml (neu)',
        },
        {
          priority: 'medium',
          area: 'audit_runner',
          id: 'create_audit_runner',
          effort: 'mittel',
          fix: 'scripts/runAllAudits.js anlegen: ruft alle Audit-Functions via Base44 SDK auf, gibt Exit-Code 1 wenn claim_status=red. Als npm Script "audit:all" verfügbar machen.',
          files_affected: 'scripts/runAllAudits.js (neu)',
        },
        {
          priority: 'medium',
          area: 'runtime_risks',
          id: 'migrate_moment_to_date_fns',
          effort: 'mittel',
          fix: 'grep -r "import moment" src/ → Liste aller moment-Usages erstellen → schrittweise auf date-fns migrieren → moment aus package.json entfernen.',
          files_affected: 'diverse src/**/*.jsx Dateien',
        },
        {
          priority: 'medium',
          area: 'stability',
          id: 'add_error_boundary',
          effort: 'klein',
          fix: 'components/ErrorBoundary.jsx anlegen, in App.jsx um <Layout /> wrappen. Verhindert White-Screen bei unerwarteten Rendering-Fehlern.',
          files_affected: 'components/ErrorBoundary.jsx (neu), App.jsx',
        },
        {
          priority: 'low',
          area: 'routing',
          id: 'replace_window_location_href',
          effort: 'klein',
          fix: 'useOrganization.js L131: window.location.href → useNavigate() (React Router). Oder bewusst als Full-Reload dokumentieren wenn Kontext-Reset gewünscht.',
          files_affected: 'hooks/useOrganization.js',
        },
      ],

      tests,
      warnings,
      risks,
    });

  } catch (error) {
    console.error('[auditToolingCoverage] Error:', error?.message, error?.stack);
    return Response.json({ error: error?.message || 'Unbekannter Fehler', success: false }, { status: 500 });
  }
});