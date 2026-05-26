/**
 * updateLifecycleStage
 * ====================
 * Ändert Company.lifecycle_stage + schreibt ContactLog-Eintrag (Stage-Change-Log).
 * AuthZ via kanonischem authorizeOrganizationAction (sharedAuthz v1.0.0).
 *
 * Payload:
 *   company_id: string
 *   organization_id: string
 *   new_stage: 'lead' | 'qualified' | 'customer' | 'lost' | 'archived'
 *   reason?: string  (optional, für ContactLog-Notiz)
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

const VALID_STAGES = ['lead', 'qualified', 'customer', 'lost', 'archived'];

// ── authorizeOrganizationAction (kanonisch, sharedAuthz v1.0.0) ──────────────
const _PLATFORM_ADMIN_ROLES = new Set(['admin', 'platform_owner', 'platform_admin']);
const _ACTION_ROLES = {
  manage_billing: ['organization_admin'],
  manage_blacklist: ['organization_admin'],
  delete_company: ['organization_admin'],
  use_ai_scoring: ['organization_admin', 'sales_rep'],
  update_lifecycle_stage: ['organization_admin', 'sales_rep'],
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
  catch { return _deny('organization_not_found', 'Organisation nicht gefunden.'); }
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

const STAGE_LABELS = {
  lead: 'Lead',
  qualified: 'Qualifiziert',
  customer: 'Kunde',
  lost: 'Verloren',
  archived: 'Archiviert',
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { company_id, organization_id, new_stage, reason } = body;

    // ── Validierung ──────────────────────────────────────────────────────────
    if (!company_id || !organization_id || !new_stage) {
      return Response.json({ error: 'company_id, organization_id und new_stage sind Pflicht.' }, { status: 400 });
    }
    if (!VALID_STAGES.includes(new_stage)) {
      return Response.json({ error: `Ungültiger Stage: "${new_stage}". Erlaubt: ${VALID_STAGES.join(', ')}.` }, { status: 400 });
    }

    // ── AuthZ ────────────────────────────────────────────────────────────────
    const access = await authorizeOrganizationAction(base44, {
      organizationId: organization_id,
      action: 'update_lifecycle_stage',
    });
    if (!access.allowed) {
      console.warn(`[updateLifecycleStage] Access denied: ${access.reason}`);
      return Response.json({ error: access.error, reason: access.reason }, { status: access.status });
    }

    // ── Company laden ────────────────────────────────────────────────────────
    const companies = await base44.asServiceRole.entities.Company.filter({ id: company_id, organization_id });
    const company = companies[0] || null;
    if (!company) {
      return Response.json({ error: 'Firma nicht gefunden oder falsche Organisation.' }, { status: 404 });
    }

    const old_stage = company.lifecycle_stage || 'lead';

    // Kein Change → early return
    if (old_stage === new_stage) {
      return Response.json({ success: true, changed: false, message: 'Stage bereits gesetzt.', old_stage, new_stage });
    }

    const now = new Date().toISOString();
    const actor = access.user.email;

    // ── Company updaten ──────────────────────────────────────────────────────
    await base44.asServiceRole.entities.Company.update(company_id, {
      lifecycle_stage: new_stage,
      lifecycle_stage_changed_at: now,
      lifecycle_stage_changed_by: actor,
    });

    // ── Stage-Change-Log als ContactLog schreiben ────────────────────────────
    const oldLabel = STAGE_LABELS[old_stage] || old_stage;
    const newLabel = STAGE_LABELS[new_stage] || new_stage;
    const logNotiz = reason
      ? `Lifecycle-Stage geändert: ${oldLabel} → ${newLabel}. Grund: ${reason}`
      : `Lifecycle-Stage geändert: ${oldLabel} → ${newLabel}`;

    await base44.asServiceRole.entities.ContactLog.create({
      organization_id,
      company_id,
      typ: 'Sonstiges',
      ergebnis: 'Lifecycle-Stage-Wechsel',
      notiz: logNotiz,
      user_email: actor,
      // Strukturierte Metadaten für spätere Auswertung
      naechster_schritt: `Stage: ${newLabel}`,
    });

    console.info(`[updateLifecycleStage] org=${organization_id} company=${company.name} ${old_stage} → ${new_stage} by ${actor}`);

    return Response.json({
      success: true,
      changed: true,
      old_stage,
      new_stage,
      changed_at: now,
      changed_by: actor,
      log_written: true,
    });

  } catch (error) {
    console.error('[updateLifecycleStage] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});