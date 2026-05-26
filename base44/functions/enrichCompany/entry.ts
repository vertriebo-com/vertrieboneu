/**
 * enrichCompany
 * =============
 * AuthZ via kanonischer authorizeOrganizationAction (sharedAuthz v1.0.0)
 * Billing-Status-Prüfung bleibt inline (plan-limit-spezifisch).
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

// ── authorizeOrganizationAction (kanonisch, sharedAuthz v1.0.0) ──────────────
const _PLATFORM_ADMIN_ROLES = new Set(['admin', 'platform_owner', 'platform_admin']);
const _ACTION_ROLES = {
  manage_billing: ['organization_admin'],
  manage_blacklist: ['organization_admin'],
  delete_company: ['organization_admin'],
  use_ai_scoring: ['organization_admin', 'sales_rep'],
};
function _allow(r) { return { allowed: true, status: 200, error: null, ...r }; }
function _deny(reason, message, ctx = {}) { return { allowed: false, status: reason === 'not_authenticated' ? 401 : 403, error: message, reason, user: ctx.user || null, organization: ctx.organization || null, member: ctx.member || null, access_role: ctx.access_role || null }; }
async function authorizeOrganizationAction(base44, { organizationId, action = null, requiredRoles = [], requireActiveOrg = true, allowPlatformAdmin = true } = {}) {
  let user; try { user = await base44.auth.me(); } catch { return _deny('not_authenticated', 'Nicht eingeloggt.'); }
  if (!user) return _deny('not_authenticated', 'Nicht eingeloggt.');
  if (allowPlatformAdmin && _PLATFORM_ADMIN_ROLES.has(user.role)) return _allow({ user, organization: null, member: null, access_role: 'platform_admin' });
  if (!organizationId) return _deny('missing_organization_id', 'Keine organization_id angegeben.');
  let orgs, members;
  try { [orgs, members] = await Promise.all([base44.asServiceRole.entities.Organization.filter({ id: organizationId }), base44.asServiceRole.entities.OrganizationMember.filter({ organization_id: organizationId, user_email: user.email })]); }
  catch (e) { return _deny('organization_not_found', 'Organisation nicht gefunden.'); }
  const organization = orgs[0] || null;
  if (!organization) return _deny('organization_not_found', 'Organisation nicht gefunden.');
  if (requireActiveOrg && organization.platform_status === 'suspended') return _deny('organization_suspended', `Organisation gesperrt: ${organization.suspended_reason || 'kein Grund'}.`, { user, organization });
  if (organization.owner_email === user.email) return _allow({ user, organization, member: members[0] || null, access_role: 'organization_admin' });
  const member = members[0] || null;
  if (!member) return _deny('not_a_member', 'Kein Mitglied dieser Organisation.', { user, organization });
  if (member.status !== 'active') return _deny('member_inactive', `Mitglied-Status: "${member.status}".`, { user, organization, member });
  const memberRole = member.role;
  const effectiveRequired = requiredRoles.length > 0 ? requiredRoles : (action && _ACTION_ROLES[action] ? _ACTION_ROLES[action] : null);
  if (effectiveRequired && !effectiveRequired.includes(memberRole)) return _deny('insufficient_role', `Rolle "${memberRole}" darf "${action || requiredRoles.join(',')}" nicht.`, { user, organization, member, access_role: memberRole });
  return _allow({ user, organization, member, access_role: memberRole });
}
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { companyId, organization_id } = body;

    // ── 1. checkAccess ──────────────────────────────────────────────────────
    if (!organization_id) return Response.json({ error: 'organization_id ist Pflichtparameter' }, { status: 400 });
    const access = await authorizeOrganizationAction(base44, { organizationId: organization_id, action: 'use_ai_scoring' });
    if (!access.allowed) {
      console.warn(`[enrichCompany] Access denied: ${access.reason} – ${access.error}`);
      return Response.json({ error: access.error, reason: access.reason }, { status: access.status });
    }

    // ── 2. Company laden – nur innerhalb der Organisation ───────────────────
    if (!companyId) return Response.json({ error: 'companyId ist Pflichtparameter' }, { status: 400 });
    let company = null;
    try {
      const companies = await base44.asServiceRole.entities.Company.filter({ id: companyId, organization_id });
      company = companies[0] || null;
    } catch (_) { company = null; }
    if (!company) return Response.json({ error: 'Firma nicht gefunden oder falsche Organisation' }, { status: 404 });

    // ── 3. Sales Rep nur eigene Leads ───────────────────────────────────────
    if (access.access_role === 'sales_rep' && company.assigned_to !== access.user.email) {
      return Response.json({ error: 'Sales Rep darf nur zugewiesene Leads anreichern' }, { status: 403 });
    }

    // ── 4. KI-Limit prüfen vor LLM ──────────────────────────────────────────
    // KANONISCH: Europe/Berlin-Kalendermonat
    const now = new Date();
    const periodMonth = new Intl.DateTimeFormat('de-DE', {
      timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit',
    }).format(now).split('.').reverse().join('-');
    let currentUsageLog = null;
    try {
      const usageLogs = await base44.asServiceRole.entities.UsageLog.filter({ organization_id, period_month: periodMonth });
      currentUsageLog = usageLogs[0] || null;
    } catch (_) {}

    const aiUsed = (currentUsageLog?.ai_actions_used || 0);

    // Plan-Limit aus DB (access.organization verfügbar außer bei platform_admin)
    let maxAi = 50;
    try {
      const orgForPlan = access.organization || (await base44.asServiceRole.entities.Organization.filter({ id: organization_id }))[0];
      const planId = orgForPlan?.plan_id;
      if (planId) {
        const plans = await base44.asServiceRole.entities.Plan.filter({ id: planId });
        if (plans[0]?.max_ai_scorings_per_month !== undefined) {
          maxAi = plans[0].max_ai_scorings_per_month;
        }
      }
    } catch (_) {}
    if (maxAi !== -1 && aiUsed >= maxAi) {
      console.warn(`[enrichCompany] KI-Limit erreicht: ${aiUsed}/${maxAi} für org=${organization_id}`);
      return Response.json({
        error: `KI-Aktionslimit erreicht: ${aiUsed}/${maxAi} diesen Monat. Bitte warten Sie bis zum nächsten Monat oder upgraden Sie Ihren Plan.`,
        limitReached: true
      }, { status: 403 });
    }

    // ── 5. LLM-Recherche ────────────────────────────────────────────────────
    const llmTimeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("KI-Anfrage hat zu lange gedauert (30s). Bitte erneut versuchen.")), 30000)
    );
    const result = await Promise.race([
      base44.integrations.Core.InvokeLLM({
        prompt: `Recherchiere folgende Firma im Internet und gib mir die offiziellen Kontaktdaten zurück.

Firmenname: ${company.name}
Ort: ${company.ort || 'Neuwied'} ${company.plz || ''}
Branche: ${company.branche || 'Unbekannt'}

WICHTIG: Gib nur Felder zurück, die du mit Sicherheit gefunden hast. Wenn du ein Feld nicht findest, lasse es komplett weg (leerer String). Schreibe NIEMALS das Wort "null" in ein Feld.`,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            website: { type: "string" }, telefon: { type: "string" },
            email: { type: "string" }, ansprechpartner: { type: "string" }, adresse: { type: "string" },
            evidence_url: { type: "string" },
          }
        }
      }),
      llmTimeoutPromise,
    ]);

    const isValid = (v) => v && typeof v === "string" && v.trim().length > 0 &&
      !["null", "n/a", "unbekannt", "keine", "nicht gefunden"].includes(v.trim().toLowerCase());

    const updates = {};
    if (!company.website && isValid(result.website)) updates.website = result.website.trim();
    if (!company.telefon && isValid(result.telefon)) updates.telefon = result.telefon.trim();
    if (!company.email && isValid(result.email)) updates.email = result.email.trim();
    if (!company.ansprechpartner && isValid(result.ansprechpartner)) updates.ansprechpartner = result.ansprechpartner.trim();
    if (!company.adresse && isValid(result.adresse)) updates.adresse = result.adresse.trim();

    if (Object.keys(updates).length > 0) {
      // ── PROVENANCE: KI-Enrichment-Herkunft dokumentieren ──────────────────
      // provenance_json mergen: bestehende Felder (z.B. google_places) bleiben erhalten.
      // source_type='enrichment', review_status='unreviewed' → UI kann Badge zeigen.
      // Supabase-ready: future table lead_provenance(org_id, company_id, field_name, ...)
      const existingProv = (() => {
        try { return JSON.parse(company.provenance_json || '{}'); } catch { return {}; }
      })();
      const provFields = existingProv.fields || {};
      const provNow = new Date().toISOString();
      const fieldMap = {
        website: 'website', telefon: 'phone', email: 'email',
        ansprechpartner: 'contact_person', adresse: 'address',
      };
      // Confidence-Logik: email und ansprechpartner sind schwer verifizierbar → 'low'
      // website/telefon/adresse sind im Web meist direkt auffindbar → 'medium'
      const fieldConfidence = {
        website: 'medium', telefon: 'medium', email: 'low',
        ansprechpartner: 'low', adresse: 'medium',
      };
      for (const [apiField, provKey] of Object.entries(fieldMap)) {
        if (!updates[apiField]) continue;
        const prevSource = provFields[provKey]?.source_type || null;
        const prevValue = company[apiField] || null;
        provFields[provKey] = {
          source_type: 'enrichment',
          source_function: 'enrichCompany',
          confidence: fieldConfidence[apiField] || 'low',
          review_status: 'unreviewed',
          updated_at: provNow,
          updated_by: access.user?.email || 'system',
          ...(prevSource ? { previous_source: prevSource } : {}),
          ...(prevValue ? { previous_value: prevValue } : {}),
          ...(result.evidence_url ? { evidence_url: result.evidence_url } : {}),
        };
      }
      updates.provenance_json = JSON.stringify({ fields: provFields });

      await base44.asServiceRole.entities.Company.update(companyId, updates);
    }

    // ── 6. UsageLog: ai_actions_used ─────────────────────────────────────────
    try {
      if (currentUsageLog) {
        await base44.asServiceRole.entities.UsageLog.update(currentUsageLog.id, {
          ai_actions_used: (currentUsageLog.ai_actions_used || 0) + 1,
        });
      } else {
        const periodStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString();
        const periodEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)).toISOString();
        await base44.asServiceRole.entities.UsageLog.create({
          organization_id, period_month: periodMonth, period_start: periodStart, period_end: periodEnd, ai_actions_used: 1,
        });
      }
    } catch (e) { console.warn('[enrichCompany] UsageLog failed:', e.message); }

    console.info(`[enrichCompany] org=${organization_id} user=${access.user.email} company=${company.name} updates=${Object.keys(updates).length}`);
    return Response.json({ updates, found: Object.keys(updates).length });

  } catch (error) {
    console.error('[enrichCompany] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});