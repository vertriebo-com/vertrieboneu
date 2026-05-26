/**
 * updateOpportunityStage
 * ======================
 * Stage-Wechsel einer Opportunity mit AuthZ, ContactLog und optionalem Company.lifecycle_stage-Sync.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

const PLATFORM_ADMIN_ROLES = new Set(['admin', 'platform_owner', 'platform_admin']);
const VALID_STAGES = ['new', 'contacted', 'qualified', 'offer_planned', 'offer_sent', 'negotiation', 'won', 'lost'];

function stageToStatus(stage) {
  if (stage === 'won') return 'won';
  if (stage === 'lost') return 'lost';
  return 'open';
}

async function authorizeOrgAction(base44, org_id, user) {
  if (PLATFORM_ADMIN_ROLES.has(user.role)) return { allowed: true };
  const [orgs, members] = await Promise.all([
    base44.asServiceRole.entities.Organization.filter({ id: org_id }),
    base44.asServiceRole.entities.OrganizationMember.filter({ organization_id: org_id, user_email: user.email }),
  ]);
  const org = orgs[0];
  if (!org) return { allowed: false, error: 'Organisation nicht gefunden.', status: 404 };
  if (org.platform_status === 'suspended') return { allowed: false, error: 'Organisation gesperrt.', status: 403 };
  if (org.owner_email === user.email) return { allowed: true };
  const member = members[0];
  if (!member || member.status !== 'active') return { allowed: false, error: 'Kein aktives Mitglied.', status: 403 };
  return { allowed: true };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { org_id, opportunity_id, stage, won_lost_reason } = body;

    if (!org_id) return Response.json({ error: 'org_id fehlt.' }, { status: 400 });
    if (!opportunity_id) return Response.json({ error: 'opportunity_id fehlt.' }, { status: 400 });
    if (!stage || !VALID_STAGES.includes(stage)) {
      return Response.json({ error: `Ungültige Stage. Erlaubt: ${VALID_STAGES.join(', ')}` }, { status: 400 });
    }

    // AuthZ
    const authz = await authorizeOrgAction(base44, org_id, user);
    if (!authz.allowed) return Response.json({ error: authz.error }, { status: authz.status || 403 });

    // Opportunity laden + org-match
    const opps = await base44.asServiceRole.entities.Opportunity.filter({ id: opportunity_id, organization_id: org_id });
    if (!opps[0]) return Response.json({ error: 'Opportunity nicht gefunden oder kein Zugriff.' }, { status: 404 });
    const opp = opps[0];

    const old_stage = opp.stage;
    if (old_stage === stage) return Response.json({ success: true, opportunity: opp, changed: false, message: 'Stage unverändert.' });

    const new_status = stageToStatus(stage);
    const now = new Date().toISOString();
    const isClosing = stage === 'won' || stage === 'lost';

    const updatePayload = {
      stage,
      status: new_status,
      stage_changed_at: now,
      stage_changed_by: user.email,
      ...(won_lost_reason ? { won_lost_reason } : {}),
      ...(isClosing ? { closed_at: now } : {}),
      ...(stage === 'won' ? { won_at: now } : {}),
      ...(stage === 'lost' ? { lost_at: now } : {}),
    };

    const updated = await base44.asServiceRole.entities.Opportunity.update(opportunity_id, updatePayload);

    // Company.lifecycle_stage synchronisieren bei won/lost
    let lifecycle_synced = null;
    if (isClosing) {
      const targetLifecycle = stage === 'won' ? 'customer' : 'lost';
      const companies = await base44.asServiceRole.entities.Company.filter({ id: opp.company_id, organization_id: org_id });
      const company = companies[0];
      if (company && !['customer', 'archived'].includes(company.lifecycle_stage)) {
        await base44.asServiceRole.entities.Company.update(opp.company_id, {
          lifecycle_stage: targetLifecycle,
          lifecycle_stage_changed_at: now,
          lifecycle_stage_changed_by: user.email,
        });
        lifecycle_synced = targetLifecycle;
      }
    }

    // ContactLog schreiben
    const stageLabels = {
      new: 'Neu', contacted: 'Kontaktiert', qualified: 'Qualifiziert',
      offer_planned: 'Angebot geplant', offer_sent: 'Angebot gesendet',
      negotiation: 'Verhandlung', won: 'Gewonnen ✓', lost: 'Verloren ✗',
    };
    const reasonNote = won_lost_reason ? ` – Grund: ${won_lost_reason}` : '';
    await base44.asServiceRole.entities.ContactLog.create({
      organization_id: org_id,
      company_id: opp.company_id,
      typ: 'Sonstiges',
      ergebnis: stage === 'won' ? 'Abgeschlossen' : stage === 'lost' ? 'Kein Interesse' : 'Abgeschlossen',
      notiz: `Opportunity "${opp.title}": Stage geändert ${stageLabels[old_stage] || old_stage} → ${stageLabels[stage] || stage}${reasonNote}`,
      naechster_schritt: stage === 'won' ? 'Auftrag abwickeln' : stage === 'lost' ? 'Opportunity archiviert' : 'Opportunity weiterverfolgen',
      user_email: user.email,
    });

    console.log(`[updateOpportunityStage] ${opportunity_id}: ${old_stage} → ${stage} by ${user.email}`);

    return Response.json({
      success: true,
      opportunity: updated,
      changed: true,
      old_stage,
      new_stage: stage,
      new_status,
      lifecycle_synced,
    });
  } catch (e) {
    console.error('[updateOpportunityStage] Error:', e.message);
    return Response.json({ error: e.message }, { status: 500 });
  }
});