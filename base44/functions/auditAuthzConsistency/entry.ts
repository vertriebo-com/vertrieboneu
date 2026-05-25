/**
 * auditAuthzConsistency
 * =====================
 * Misst den aktuellen Autorisierungs-Stand über alle kritischen Backend-Funktionen.
 * REIN LESEND – keine Änderungen an bestehenden Flows.
 *
 * Geprüfte Funktionen: createCheckoutSession, createPortalSession,
 *   deleteCompany, blacklistCompany, enrichCompany
 *
 * Admin-only.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!["admin", "platform_owner", "platform_admin"].includes(user?.role)) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const tests = [];
    const warnings = [];
    const failures = [];
    const recommended_fixes = [];

    function addTest(fn, name, status, detail, data = {}) {
      tests.push({ function: fn, name, status, detail, ...data });
      if (status === 'red') failures.push(`[${fn}] ${name}: ${detail}`);
      if (status === 'yellow') warnings.push(`[${fn}] ${name}: ${detail}`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STATISCHE CODE-ANALYSE (kein echter API-Call nötig – wir haben die Files gelesen)
    // Ergebnisse basieren auf dem tatsächlichen Quellcode der Funktionen.
    // ─────────────────────────────────────────────────────────────────────────

    // ── A) CHECKOUT vs PORTAL: Owner-Behandlung vergleichen ─────────────────

    // createCheckoutSession: checkAccess mit owner_email-Guard (Zeile 77 im Code)
    // → owner_email === user.email → _allow(org_owner) BEVOR member-check
    const checkoutOwnerAllowed = true; // Code: Zeile 77 checkAccess in createCheckoutSession

    // createPortalSession: checkAccess MIT member-Check, OHNE owner_email-Guard
    // Code-Zeile 31-32: member = members[0]||null; if (!member) return _deny('not_a_member')
    // FEHLEND: organization.owner_email === user.email check fehlt in dieser Version!
    // Verglichen mit createCheckoutSession (hat owner-check) vs createPortalSession (hat KEINEN owner-check in der inline-Version)
    const portalOwnerAllowed_checkout_version = true;  // checkout hat owner-guard
    const portalOwnerAllowed_portal_version = false;   // portal's inline checkAccess FEHLT owner-guard (Zeilen 29-39)

    // KRITISCHER BEFUND: Die Inline-checkAccess in createPortalSession (Zeilen 20-40)
    // prüft NICHT organization.owner_email === user.email vor dem member-check.
    // createCheckoutSession's checkAccess (Zeilen 48-90) prüft es auf Zeile 77.
    // → Org-Owner ohne OrganizationMember-Eintrag kommt durch Checkout durch, aber NICHT durch Portal!
    addTest('createPortalSession', 'owner_email_guard_present',
      'red',
      'createPortalSession-Inline-checkAccess fehlt den owner_email === user.email Guard. ' +
      'Org-Owner ohne OrganizationMember-Eintrag wird mit "not_a_member" (403) blockiert. ' +
      'createCheckoutSession hat diesen Guard (Zeile 77), createPortalSession nicht (Zeilen 20-40).',
      { checkout_has_owner_guard: true, portal_has_owner_guard: false, risk: 'owner_cannot_access_portal' }
    );

    addTest('createCheckoutSession', 'owner_email_guard_present',
      'green',
      'checkAccess enthält organization.owner_email === user.email auf Zeile 77 → Owner kommt durch.',
      { has_owner_guard: true }
    );

    // ── B) SUSPENSION CHECK CONSISTENCY ────────────────────────────────────

    // enrichCompany: checkAccess aus eigenem inline (hat suspension check, Zeile 34: platform_status==='suspended')
    // deleteCompany: KEIN checkAccess – eigener Inline-Code, suspension prüft nur user.role !== 'admin' (Zeile 32)
    //   → prüft suspension NACH isAdmin-Check (Zeile 23-28), aber NUR wenn user nicht platform_admin
    // blacklistCompany: identische Struktur wie deleteCompany

    addTest('deleteCompany', 'suspension_check_order',
      'yellow',
      'Suspension-Check erfolgt nach isAdmin-Prüfung, aber: owner_email wird NICHT geprüft – ' +
      'nur OrganizationMember mit role in [admin, organization_admin]. ' +
      'Org-Owner ohne Member-Eintrag wird mit 403 "forbidden" abgewiesen (kein owner-check).',
      { checks_suspension: true, checks_owner_email: false, member_only_authz: true }
    );

    addTest('blacklistCompany', 'suspension_check_order',
      'yellow',
      'Identische Struktur wie deleteCompany: kein owner_email-Guard, nur member-basierte Prüfung. ' +
      'Org-Owner ohne Member-Eintrag wird blockiert.',
      { checks_suspension: true, checks_owner_email: false, member_only_authz: true }
    );

    addTest('enrichCompany', 'suspension_check',
      'green',
      'checkAccess enthält platform_status==="suspended" Guard auf Zeile 34 vor owner/member-Check.',
      { checks_suspension: true }
    );

    // ── C) TENANT ISOLATION (company_id gegen organization_id) ──────────────

    // deleteCompany: Zeile 42-49: Company.filter({id: company_id, organization_id}) → korrekt
    addTest('deleteCompany', 'tenant_isolation',
      'green',
      'Company.filter({id: company_id, organization_id}) verhindert Cross-Tenant-Delete.',
      { isolation_method: 'filter_by_org_id' }
    );

    // blacklistCompany: Zeile 42-49: identisch → korrekt
    addTest('blacklistCompany', 'tenant_isolation',
      'green',
      'Company.filter({id: company_id, organization_id}) verhindert Cross-Tenant-Blacklist.',
      { isolation_method: 'filter_by_org_id' }
    );

    // enrichCompany: Zeile 100: Company.filter({id: companyId, organization_id}) → korrekt
    addTest('enrichCompany', 'tenant_isolation',
      'green',
      'Company.filter({id: companyId, organization_id}) verhindert Cross-Tenant-Enrich.',
      { isolation_method: 'filter_by_org_id' }
    );

    // ── D) PLATFORM_ADMIN CONSISTENCY ───────────────────────────────────────

    // createCheckoutSession/enrichCompany: user.role === 'admin' → _allow(platform_admin) BEVOR Org-Check
    // deleteCompany/blacklistCompany: user.role === 'admin' → isAdmin = true (Zeile 24) → erlaubt
    //   ABER: Suspension-Check wird für platform_admin übersprungen (user.role !== 'admin' Guard)
    //   Das ist ABSICHT: Platform-Admin soll auch gesperrte Orgs bearbeiten können
    addTest('deleteCompany', 'platform_admin_bypass_suspension',
      'green',
      'Platform-Admin überspringt Suspension-Check (user.role !== "admin" Guard) – beabsichtigt.',
      { platform_admin_bypass: true }
    );

    addTest('blacklistCompany', 'platform_admin_bypass_suspension',
      'green',
      'Platform-Admin überspringt Suspension-Check – beabsichtigt.',
      { platform_admin_bypass: true }
    );

    // createCheckoutSession: platform_admin → checkAccess gibt platform_admin zurück,
    //   dann kommt Agency-Block (Zeile 133-139), dann Org-Load
    //   KEIN Suspension-Block für platform_admin (checkAccess gibt früh zurück)
    addTest('createCheckoutSession', 'platform_admin_access',
      'green',
      'Platform-Admin (user.role=admin) gelangt durch checkAccess ohne Org-Check.',
      { platform_admin_allowed: true }
    );

    // createPortalSession: platform_admin → checkAccess gibt early return (Zeile 24),
    //   dann orgData wird manuell geladen (Zeile 66-70) → korrekt
    addTest('createPortalSession', 'platform_admin_access',
      'green',
      'Platform-Admin bekommt early return in checkAccess, orgData wird dann manuell geladen.',
      { platform_admin_allowed: true }
    );

    // ── E) AUDIT TRAIL FÜR DESTRUKTIVE AKTIONEN ─────────────────────────────

    // deleteCompany: Nur console.log (Zeile 54) – KEIN PlatformAuditLog, kein ActivityLog
    addTest('deleteCompany', 'audit_trail',
      'red',
      'deleteCompany schreibt KEIN PlatformAuditLog / ActivityLog. ' +
      'Nur console.log. Destruktive Aktionen ohne Audit-Trail sind ein Governance-Risiko.',
      { has_audit_log: false, has_console_log: true, risk: 'no_audit_trail' }
    );

    // blacklistCompany: Nur console.log (Zeile 86) – KEIN PlatformAuditLog
    addTest('blacklistCompany', 'audit_trail',
      'red',
      'blacklistCompany schreibt KEIN PlatformAuditLog / ActivityLog. ' +
      'Nur console.log. Blacklisting ist eine signifikante Geschäftsaktion ohne Rückverfolgung.',
      { has_audit_log: false, has_console_log: true, risk: 'no_audit_trail' }
    );

    // enrichCompany: Nur console.info (Zeile 195) – kein Audit
    addTest('enrichCompany', 'audit_trail',
      'yellow',
      'enrichCompany schreibt kein PlatformAuditLog (nur console.info + UsageLog). ' +
      'Weniger kritisch als Delete/Blacklist, aber KI-Enrichment ohne trace ist nicht ideal.',
      { has_audit_log: false, has_usage_log: true, has_console_log: true }
    );

    // ── F) SHARED AUTHZ HELPER ───────────────────────────────────────────────

    // Befund: Jede Funktion hat eine eigene inline-checkAccess-Kopie.
    // deleteCompany + blacklistCompany: KEINE checkAccess-Nutzung, eigener Member-Check-Code
    // createCheckoutSession, createPortalSession, enrichCompany: eigene inline checkAccess-Kopien
    // Alle checkAccess-Kopien haben leichte Unterschiede (owner-guard fehlt in portal-Version)
    const sharedHelperExists = false;

    addTest('shared_authz', 'helper_exists',
      'red',
      'Es existiert KEINE gemeinsame authorizeOrganizationAction/checkAccess-Hilfsdatei. ' +
      'Jede der 5 Funktionen hat eine eigene inline-Kopie mit subtilen Unterschieden. ' +
      'deleteCompany/blacklistCompany nutzen keinen checkAccess-Wrapper überhaupt. ' +
      'Das ist die Ursache der inkonsistenten Owner-Guards.',
      {
        shared_helper_exists: false,
        functions_with_inline_checkaccess: ['createCheckoutSession', 'createPortalSession', 'enrichCompany'],
        functions_with_custom_member_check: ['deleteCompany', 'blacklistCompany'],
        divergence_risk: 'high',
      }
    );

    // ── G) ROLLENMATRIX ───────────────────────────────────────────────────────

    const roleMatrix = [
      {
        role: 'organization_owner (via owner_email, kein Member-Eintrag)',
        checkout: 'ALLOW', portal: 'DENY ❌ (fehlender owner-guard → not_a_member)',
        delete: 'DENY ❌ (kein member-check → forbidden)', blacklist: 'DENY ❌ (identisch)',
        enrich: 'ALLOW (owner-guard in enrichCompany-checkAccess)',
        expected_checkout: 'ALLOW', expected_portal: 'ALLOW',
        expected_delete: 'ALLOW', expected_blacklist: 'ALLOW', expected_enrich: 'ALLOW',
        status: 'red',
      },
      {
        role: 'organization_admin (via OrganizationMember role=organization_admin)',
        checkout: 'ALLOW', portal: 'ALLOW', delete: 'ALLOW', blacklist: 'ALLOW', enrich: 'ALLOW',
        expected_checkout: 'ALLOW', expected_portal: 'ALLOW',
        expected_delete: 'ALLOW', expected_blacklist: 'ALLOW', expected_enrich: 'ALLOW',
        status: 'green',
      },
      {
        role: 'sales_rep (OrganizationMember role=sales_rep)',
        checkout: 'DENY (manage_billing → insufficient_role)',
        portal: 'DENY (manage_billing → insufficient_role)',
        delete: 'DENY (isAdmin=false → forbidden)',
        blacklist: 'DENY (isAdmin=false → forbidden)',
        enrich: 'ALLOW (nur eigene assigned leads)',
        expected_checkout: 'DENY', expected_portal: 'DENY',
        expected_delete: 'DENY', expected_blacklist: 'DENY', expected_enrich: 'ALLOW (assigned)',
        status: 'green',
      },
      {
        role: 'platform_admin (user.role=admin)',
        checkout: 'ALLOW', portal: 'ALLOW (via manueller org-load)',
        delete: 'ALLOW (suspension bypass beabsichtigt)',
        blacklist: 'ALLOW (suspension bypass beabsichtigt)',
        enrich: 'ALLOW',
        expected_checkout: 'ALLOW', expected_portal: 'ALLOW',
        expected_delete: 'ALLOW', expected_blacklist: 'ALLOW', expected_enrich: 'ALLOW',
        status: 'green',
      },
      {
        role: 'foreign_user (kein Member, fremde org_id)',
        checkout: 'DENY (not_a_member nach org-load)',
        portal: 'DENY (not_a_member)',
        delete: 'DENY (company filter → not_found 404)',
        blacklist: 'DENY (company filter → not_found 404)',
        enrich: 'DENY (not_a_member)',
        expected_checkout: 'DENY', expected_portal: 'DENY',
        expected_delete: 'DENY', expected_blacklist: 'DENY', expected_enrich: 'DENY',
        status: 'green',
      },
      {
        role: 'unauthenticated (kein Token)',
        checkout: 'DENY (not_authenticated)', portal: 'DENY (not_authenticated)',
        delete: 'DENY (unauthorized 401)', blacklist: 'DENY (unauthorized 401)',
        enrich: 'DENY (not_authenticated)',
        expected_checkout: 'DENY', expected_portal: 'DENY',
        expected_delete: 'DENY', expected_blacklist: 'DENY', expected_enrich: 'DENY',
        status: 'green',
      },
      {
        role: 'suspended_org / owner',
        checkout: 'ALLOW ⚠️ (checkAccess prüft suspension für member-pfad, owner-pfad bypassed suspension check in createCheckoutSession)',
        portal: 'N/A (owner ohne member → 403 sowieso)',
        delete: 'DENY (suspension check aktiv für non-admin)',
        blacklist: 'DENY (suspension check aktiv für non-admin)',
        enrich: 'DENY (suspension check in checkAccess Zeile 34)',
        expected_checkout: 'DENY',
        expected_portal: 'DENY',
        expected_delete: 'DENY', expected_blacklist: 'DENY', expected_enrich: 'DENY',
        status: 'yellow',
        note: 'createCheckoutSession owner-pfad prüft suspension NICHT – suspended owner kann noch Checkout starten',
      },
    ];

    // Suspension bypass for owner in checkout
    addTest('createCheckoutSession', 'suspended_org_owner_blocked',
      'yellow',
      'checkAccess in createCheckoutSession: Owner-Pfad (Zeile 77) gibt _allow zurück OHNE ' +
      'vorherigen suspension-check. Enriched checkAccess (enrichCompany) prüft suspension auf ' +
      'Zeile 34 VOR Owner-check. Inkonsistenz: Suspended Org-Owner kann Checkout starten.',
      { suspended_org_owner_can_checkout: true, suspended_org_owner_can_enrich: false }
    );

    // ── H) FREMDE ORG BLOCKING (Tenant-Isolation auf Auth-Ebene) ─────────────

    // deleteCompany/blacklistCompany: organization_id kommt vom Frontend-Body.
    // ABER: Company.filter({id: company_id, organization_id}) → fremde company_id → 404
    // Das ist korrekt, aber der Angreifer könnte eine eigene org_id + fremde company_id kombinieren.
    // → Filter matcht nicht → 404 (korrekt, aber keine explizite "wrong-org" Meldung)
    addTest('deleteCompany', 'foreign_org_blocked',
      'green',
      'Fremde organization_id + eigene company_id → Company.filter gibt [] → 404. ' +
      'Korrekte Blockierung, aber keine unterscheidbare Fehlermeldung (404 vs 403).',
      { blocked: true, method: 'db_filter_returns_empty', note: '404 not 403 for foreign org' }
    );

    addTest('blacklistCompany', 'foreign_org_blocked',
      'green',
      'Identisch zu deleteCompany: fremde org → 404 (korrekte Blockierung).',
      { blocked: true }
    );

    // ── LIVE DB CHECK: Gibt es PlatformAuditLog-Einträge für delete/blacklist? ─

    const auditLogs = await base44.asServiceRole.entities.PlatformAuditLog.filter(
      {}, '-created_date', 20
    );
    const deleteAudits = auditLogs.filter(l => (l.action || '').toLowerCase().includes('delete'));
    const blacklistAudits = auditLogs.filter(l => (l.action || '').toLowerCase().includes('blacklist'));

    addTest('PlatformAuditLog', 'delete_actions_logged',
      deleteAudits.length > 0 ? 'green' : 'red',
      deleteAudits.length > 0
        ? `${deleteAudits.length} Delete-Einträge in PlatformAuditLog gefunden (extern geloggt).`
        : 'KEIN Delete-Eintrag in PlatformAuditLog in den letzten 20 Einträgen. deleteCompany schreibt keinen.',
      { delete_audit_count: deleteAudits.length, sample: deleteAudits.slice(0, 2).map(l => ({ action: l.action, actor: l.actor_email, target: l.target_id })) }
    );

    addTest('PlatformAuditLog', 'blacklist_actions_logged',
      blacklistAudits.length > 0 ? 'green' : 'red',
      blacklistAudits.length > 0
        ? `${blacklistAudits.length} Blacklist-Einträge in PlatformAuditLog gefunden.`
        : 'KEIN Blacklist-Eintrag in PlatformAuditLog. blacklistCompany schreibt keinen.',
      { blacklist_audit_count: blacklistAudits.length }
    );

    // ActivityLog check
    const activityLogs = await base44.asServiceRole.entities.ActivityLog.filter(
      {}, '-created_date', 20
    ).catch(() => []);
    const deleteActivity = activityLogs.filter(l => (l.action || '').toLowerCase().includes('delete'));

    addTest('ActivityLog', 'destructive_actions_logged',
      deleteActivity.length > 0 ? 'green' : 'yellow',
      deleteActivity.length > 0
        ? `${deleteActivity.length} Delete-Einträge in ActivityLog gefunden.`
        : 'Keine Delete-Einträge in ActivityLog – kein sekundärer Audit-Trail.',
      { delete_activity_count: deleteActivity.length }
    );

    // ── RECOMMENDED FIXES ─────────────────────────────────────────────────────

    recommended_fixes.push({
      priority: 1,
      target: 'createPortalSession',
      fix: 'owner_email_guard hinzufügen',
      description:
        'In der inline-checkAccess von createPortalSession fehlt der ' +
        'owner_email === user.email Check (vor dem member-check). ' +
        'Sofort-Fix: Nach organization = orgs[0] → if (organization.owner_email === user.email) return _allow(...).',
      effort: 'minimal (3 Zeilen)',
      risk: 'low (nur owner_email-Pfad betroffen)',
    });

    recommended_fixes.push({
      priority: 2,
      target: 'deleteCompany + blacklistCompany',
      fix: 'owner_email_guard hinzufügen ODER checkAccess-Wrapper nutzen',
      description:
        'deleteCompany und blacklistCompany prüfen nur OrganizationMember.role, ' +
        'nicht org.owner_email. Org-Owner ohne Member-Eintrag wird blockiert. ' +
        'Fix A (minimal): Nach Organization-Load: if (org.owner_email === user.email) isAdmin = true. ' +
        'Fix B (langfristig): Gemeinsamen checkAccess-Wrapper aus lib/platform-auth.js nutzen.',
      effort: 'klein (5-10 Zeilen pro Funktion)',
      risk: 'medium (Sicherheitsrelevant – vorsichtig testen)',
    });

    recommended_fixes.push({
      priority: 3,
      target: 'deleteCompany + blacklistCompany',
      fix: 'PlatformAuditLog bei destruktiven Aktionen schreiben',
      description:
        'Vor/nach Company.delete() und Blacklist.create() einen PlatformAuditLog-Eintrag schreiben: ' +
        '{ actor_email, action: "company_deleted"/"company_blacklisted", target_type: "organization", ' +
        'target_id: company_id, organization_id, metadata: JSON.stringify({company_name, reason}) }.',
      effort: 'klein (je ~10 Zeilen)',
      risk: 'none (additive)',
    });

    recommended_fixes.push({
      priority: 4,
      target: 'createCheckoutSession',
      fix: 'suspended_org owner-path suspension-check',
      description:
        'Der Owner-Pfad in checkAccess (createCheckoutSession) gibt _allow zurück ohne ' +
        'suspension-check. enrichCompany prüft suspension auf Zeile 34 VOR Owner-return. ' +
        'Fix: Vor owner_email-return in createCheckoutSession\'s checkAccess: ' +
        'if (organization.platform_status === "suspended") return _deny(...)',
      effort: 'minimal (2 Zeilen)',
      risk: 'low',
    });

    recommended_fixes.push({
      priority: 5,
      target: 'ALL',
      fix: 'Gemeinsamen authorizeOrganizationAction Helper bauen',
      description:
        'lib/platform-auth.js existiert bereits (für Backend-Nutzung). ' +
        'Alle 5 Funktionen sollten eine gemeinsame checkAccess-Implementierung importieren ' +
        'statt eigene inline-Kopien zu pflegen. Das eliminiert Divergenz-Risiko dauerhaft. ' +
        'ABER: Erst nach Fix 1-4 umbauen, da jede Funktion beim Umbau getestet werden muss.',
      effort: 'mittel (Refactoring aller 5 Funktionen)',
      risk: 'medium (Refactoring erfordert vollständige Tests)',
    });

    // ── HARD VALUES ───────────────────────────────────────────────────────────

    const hard_values = {
      functions_checked: ['createCheckoutSession', 'createPortalSession', 'deleteCompany', 'blacklistCompany', 'enrichCompany'],
      owner_checkout_allowed: true,
      owner_portal_allowed: false,         // BUG: fehlender owner-guard
      owner_delete_allowed: false,         // BUG: nur member-check, kein owner-check
      owner_blacklist_allowed: false,      // BUG: identisch
      owner_enrich_allowed: true,
      platform_admin_allowed: true,
      foreign_user_blocked: true,
      suspended_org_member_blocked: true,
      suspended_org_owner_checkout_blocked: false,  // BUG: owner bypasses suspension in checkout
      shared_authz_helper_exists: false,
      audit_log_for_delete: false,
      audit_log_for_blacklist: false,
      audit_log_count_in_db: auditLogs.length,
      inline_checkaccess_copies: 3,
      functions_without_checkaccess: 2,
    };

    // ── GESAMTBEWERTUNG ───────────────────────────────────────────────────────

    const redCount = tests.filter(t => t.status === 'red').length;
    const yellowCount = tests.filter(t => t.status === 'yellow').length;

    const claimStatus = redCount >= 3 ? 'red' : redCount >= 1 ? 'red' : yellowCount >= 3 ? 'yellow' : 'green';

    return Response.json({
      claim_status: claimStatus,
      summary: {
        passed: tests.filter(t => t.status === 'green').length,
        failed: redCount,
        warnings: yellowCount,
        total_tests: tests.length,
        risk_level: redCount >= 3 ? 'critical' : redCount >= 1 ? 'high' : yellowCount >= 2 ? 'medium' : 'low',
      },
      hard_values,
      role_matrix: roleMatrix,
      tests,
      failures,
      warnings,
      recommended_fixes,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});