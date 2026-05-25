/**
 * promoteExternalSourceToCompany – OpenRegister Phase D
 *
 * Promoted einen geprüften ExternalCompanySource-Eintrag zu einem echten Company/Lead.
 *
 * Flow:
 *   ExternalCompanySource (ready_for_review / force_promote)
 *   → Zugangsprüfung (kein Sales Rep)
 *   → Status-Gate (nur ready_for_review standard, needs_review nur mit force_promote)
 *   → Dedupe gegen Company (Name+Ort, google_place_id, Website, Telefon)
 *   → Blacklist-Check
 *   → Monatslimit-Check (max()-Formel, HTTP 402 bei Überschreitung)
 *   → Company erstellen
 *   → ExternalCompanySource auf promoted_to_company setzen
 *   → UsageLog.leads_created +1
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

// ── SUPABASE SHADOW MODE ──────────────────────────────────────────────────────
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_KEY");

async function writeSupabaseUsageEvent(orgId, periodMonth, companyId) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/lead_usage_events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'apikey': SUPABASE_SERVICE_KEY,
        'Prefer': 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify({
        organization_id: orgId,
        period_month: periodMonth,
        company_id: companyId,
        event_type: 'research_lead_created',
        source: 'openregister',
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn(`[promoteExt][shadow] Supabase write failed: HTTP ${res.status} — ${text.slice(0, 150)}`);
    }
  } catch (e) {
    console.warn(`[promoteExt][shadow] Supabase write error (non-blocking): ${e?.message}`);
  }
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

function normStr(s) {
  return String(s || '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '').trim();
}

function extractDomain(url) {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith('http') ? url : 'https://' + url);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

// KANONISCH: Europe/Berlin-Kalendermonat – identisch zu processResearchRun/getDashboardData
function getPeriodMonth() {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date()).split('.').reverse().join('-');
}

// ── ACCESS CHECK ─────────────────────────────────────────────────────────────

async function checkAccess(base44, user, organizationId) {
  if (!user) return { allowed: false, reason: 'not_authenticated' };

  const isPlatformAdmin = ['admin', 'platform_owner', 'platform_admin'].includes(user.role);
  if (isPlatformAdmin) return { allowed: true, role: 'platform_admin' };

  const orgs = await base44.asServiceRole.entities.Organization.filter({ id: organizationId });
  const org = orgs[0];
  if (!org) return { allowed: false, reason: 'organization_not_found' };

  if (org.owner_email === user.email) return { allowed: true, role: 'organization_admin', org };

  const members = await base44.asServiceRole.entities.OrganizationMember.filter({
    organization_id: organizationId,
    user_email: user.email,
    status: 'active',
  });
  const member = members[0];
  if (!member) return { allowed: false, reason: 'not_a_member' };

  // Sales Rep darf NICHT promoten
  if (member.role === 'sales_rep') return { allowed: false, reason: 'sales_rep_cannot_promote' };
  if (member.role === 'organization_admin') return { allowed: true, role: 'organization_admin', org };

  return { allowed: false, reason: 'insufficient_role' };
}

// ── USAGE LOG ────────────────────────────────────────────────────────────────

async function incrementUsageLog(base44, organizationId) {
  const periodMonth = getPeriodMonth();
  const existing = await base44.asServiceRole.entities.UsageLog.filter({
    organization_id: organizationId,
    period_month: periodMonth,
  });

  if (existing[0]) {
    await base44.asServiceRole.entities.UsageLog.update(existing[0].id, {
      leads_created: (existing[0].leads_created || 0) + 1,
    });
    return {
      monthly_used_after: (existing[0].leads_created || 0) + 1,
      monthly_limit: existing[0].monthly_limit || null,
    };
  } else {
    // period_start/end aus periodMonth ableiten – identisch zu processResearchRun.upsertUsageLog()
    // Verhindert Inkonsistenz am Monatswechsel (period_month = Berlin, period_start/end = UTC-Grenzen desselben Monats)
    const [y, m] = periodMonth.split('-').map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1)).toISOString();         // 1. des Monats, 00:00 UTC
    const end   = new Date(Date.UTC(y, m, 0, 23, 59, 59)).toISOString(); // Letzter Tag, 23:59:59 UTC
    await base44.asServiceRole.entities.UsageLog.create({
      organization_id: organizationId,
      period_month: periodMonth,
      period_start: start,
      period_end: end,
      leads_created: 1,
    });
    return { monthly_used_after: 1 };
  }
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized', success: false }, { status: 401 });

    const body = await req.json();
    const {
      organization_id,
      external_source_id,
      force_promote = false,
      assign_to = null,
      initial_status = 'Neu',
    } = body;

    if (!organization_id || !external_source_id) {
      return Response.json({ error: 'organization_id und external_source_id sind erforderlich', success: false }, { status: 400 });
    }

    // ── Zugang prüfen ─────────────────────────────────────────────────────────
    const access = await checkAccess(base44, user, organization_id);
    if (!access.allowed) {
      return Response.json({ success: false, error: 'forbidden', reason: access.reason }, { status: 403 });
    }

    // ── ExternalCompanySource laden ───────────────────────────────────────────
    const sources = await base44.asServiceRole.entities.ExternalCompanySource.filter({
      id: external_source_id,
      organization_id,
    });
    const ext = sources[0];
    if (!ext) {
      return Response.json({ success: false, error: 'external_source_not_found' }, { status: 404 });
    }

    // ── Status-Gate ───────────────────────────────────────────────────────────
    const NEVER_PROMOTE = ['failed', 'duplicate', 'promoted_to_company', 'rejected'];
    const REQUIRES_FORCE = ['needs_review', 'imported', 'unknown_geo'];

    if (ext.match_status === 'outside_radius') {
      return Response.json({
        success: false,
        error: 'outside_radius_requires_manual_override_not_supported_yet',
        match_status: ext.match_status,
      }, { status: 422 });
    }

    if (NEVER_PROMOTE.includes(ext.match_status)) {
      return Response.json({
        success: false,
        error: 'match_status_not_promotable',
        match_status: ext.match_status,
      }, { status: 422 });
    }

    if (ext.match_status !== 'ready_for_review' && !force_promote) {
      return Response.json({
        success: false,
        error: 'requires_force_promote',
        match_status: ext.match_status,
        hint: 'Setze force_promote=true für Organization Admin oder Platform Admin.',
      }, { status: 422 });
    }

    if (force_promote && REQUIRES_FORCE.includes(ext.match_status) && access.role === 'sales_rep') {
      return Response.json({ success: false, error: 'forbidden', reason: 'sales_rep_cannot_force_promote' }, { status: 403 });
    }

    // ── Bereits promoted? ─────────────────────────────────────────────────────
    if (ext.promoted_company_id) {
      return Response.json({
        success: false,
        error: 'already_promoted',
        existing_company_id: ext.promoted_company_id,
      }, { status: 409 });
    }

    // ── Google Match aus raw_data lesen ───────────────────────────────────────
    let googleMatch = null;
    try {
      const raw = JSON.parse(ext.raw_data || '{}');
      googleMatch = raw._google_match || null;
    } catch {
      // raw_data nicht parsebar → kein Google Match
    }

    const phone = googleMatch?.phone || '';
    const website = googleMatch?.website || '';
    const googlePlaceId = googleMatch?.place_id || ext.google_place_id || '';
    const googleAddress = googleMatch?.address || ext.address || '';
    const websiteDomain = extractDomain(website);

    // ── Blacklist prüfen ──────────────────────────────────────────────────────
    const blacklistEntries = await base44.asServiceRole.entities.Blacklist.filter({ organization_id });
    const nameNorm = normStr(ext.company_name);

    for (const bl of blacklistEntries) {
      if (normStr(bl.firmenname) === nameNorm) {
        return Response.json({ success: false, error: 'blacklisted_company', blacklist_id: bl.id }, { status: 422 });
      }
      if (phone && bl.telefon && normStr(bl.telefon) === normStr(phone)) {
        return Response.json({ success: false, error: 'blacklisted_company', blacklist_id: bl.id }, { status: 422 });
      }
      if (websiteDomain && bl.email && extractDomain(bl.email) === websiteDomain) {
        return Response.json({ success: false, error: 'blacklisted_company', blacklist_id: bl.id }, { status: 422 });
      }
    }

    // ── Dedupe gegen Companies ────────────────────────────────────────────────
    const existingCompanies = await base44.asServiceRole.entities.Company.filter({ organization_id });

    for (const company of existingCompanies) {
      // Name + Ort
      const sameNameCity = normStr(company.name) === nameNorm &&
        normStr(company.ort || '') === normStr(ext.city || '');
      if (sameNameCity) {
        await base44.asServiceRole.entities.ExternalCompanySource.update(ext.id, {
          match_status: 'duplicate',
          duplicate_company_id: company.id,
        });
        return Response.json({
          success: false,
          error: 'company_duplicate',
          existing_company_id: company.id,
          reason: 'name_and_city_match',
        }, { status: 409 });
      }

      // Google Place ID
      if (googlePlaceId && company.website && company.website === website && website) {
        await base44.asServiceRole.entities.ExternalCompanySource.update(ext.id, {
          match_status: 'duplicate',
          duplicate_company_id: company.id,
        });
        return Response.json({
          success: false,
          error: 'company_duplicate',
          existing_company_id: company.id,
          reason: 'website_match',
        }, { status: 409 });
      }

      // Telefon
      if (phone && company.telefon && normStr(company.telefon) === normStr(phone)) {
        await base44.asServiceRole.entities.ExternalCompanySource.update(ext.id, {
          match_status: 'duplicate',
          duplicate_company_id: company.id,
        });
        return Response.json({
          success: false,
          error: 'company_duplicate',
          existing_company_id: company.id,
          reason: 'phone_match',
        }, { status: 409 });
      }
    }

    // ── Monatslimit prüfen (max()-Formel — identisch zu startResearchRun/getDashboardData) ──
    // SSOT-Regel §E: monthly_used = Math.max(committedSlots, usageLogValue, companiesThisMonth)
    let monthlyLimit = -1;
    const org = access.org || (await base44.asServiceRole.entities.Organization.filter({ id: organization_id }))[0];

    if (org?.plan_id) {
      const plans = await base44.asServiceRole.entities.Plan.filter({ id: org.plan_id });
      if (plans[0]) monthlyLimit = plans[0].max_leads_per_month ?? -1;
    }

    const periodMonth = getPeriodMonth();

    if (monthlyLimit !== -1) {
      // Alle drei Quellen parallel laden
      const now = new Date();
      const periodParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit',
      }).formatToParts(now);
      const py = parseInt(periodParts.find(p => p.type === 'year')?.value);
      const pm = parseInt(periodParts.find(p => p.type === 'month')?.value);
      const periodStart = new Date(Date.UTC(py, pm - 1, 1));
      const periodEnd   = new Date(Date.UTC(py, pm, 1));

      const [quotaSlots, usageLogs, allCompanies] = await Promise.all([
        base44.asServiceRole.entities.QuotaReservation.filter({ organization_id, period_month: periodMonth }),
        base44.asServiceRole.entities.UsageLog.filter({ organization_id, period_month: periodMonth }),
        base44.asServiceRole.entities.Company.filter({ organization_id }, '-created_date', 2000),
      ]);

      const committedSlots = quotaSlots.filter(s => s.status === 'committed').length;
      const usageLogValue  = usageLogs[0]?.leads_created || 0;

      const NON_QUOTA = new Set(['manual_setup', 'csv_import', 'manual', 'import']);
      const companiesThisMonth = allCompanies.filter(c => {
        if (!c.research_run_id) return false;
        if (NON_QUOTA.has(c.research_run_id)) return false;
        if (c.quelle === 'Manuell' || c.quelle === 'CSV Import') return false;
        if (c.source_provider === 'manual' || c.source_provider === 'csv_import') return false;
        const created = new Date(c.created_date);
        return created >= periodStart && created < periodEnd;
      }).length;

      const currentUsed = Math.max(committedSlots, usageLogValue, companiesThisMonth);

      if (currentUsed >= monthlyLimit) {
        const [y2, m2] = periodMonth.split('-').map(Number);
        const resetDate = new Date(Date.UTC(y2, m2, 1)).toLocaleDateString('de-DE', {
          day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin',
        });
        return Response.json({
          success: false,
          error: 'monthly_lead_quota_reached',
          reason: 'monthly_lead_quota_reached',
          message: `Monatliches Lead-Kontingent erreicht: ${currentUsed} von ${monthlyLimit} Leads genutzt. Reset am ${resetDate}.`,
          monthly_usage: {
            monthly_limit: monthlyLimit,
            monthly_used: currentUsed,
            remaining: 0,
            reset_date: resetDate,
            source: 'max(committedSlots, usageLogValue, companiesThisMonth)',
          },
        }, { status: 402 });
      }
    }

    // ── Company erstellen ─────────────────────────────────────────────────────
    const companyData = {
      organization_id,
      name: ext.company_name,
      branche: ext.legal_form || 'Firma',
      ort: ext.city || '',
      plz: ext.postal_code || '',
      adresse: googleAddress,
      telefon: phone,
      email: '',
      website,
      latitude: ext.lat || null,
      longitude: ext.lng || null,
      distance_km: ext.distance_km || null,
      search_center_city: ext.search_center_city || '',
      search_center_lat: ext.search_center_lat || null,
      search_center_lng: ext.search_center_lng || null,
      search_radius_km: ext.radius_km || null,
      quelle: 'API',
      status: initial_status || 'Neu',
      is_hot: false,
      is_blacklisted: false,
      priority_score: 0,
      relevance_score: Math.round((ext.enrichment_confidence || 0) * 0.6 + (ext.source_confidence || 0) * 0.4),
      relevance_reason: `Aus OpenRegister importiert und mit Google Places abgeglichen. Confidence: ${ext.enrichment_confidence || 0}%`,
      source_query: `openregister:${ext.source_id || ext.company_name}`,
      ...(assign_to ? { assigned_to: assign_to } : {}),
    };

    const company = await base44.asServiceRole.entities.Company.create(companyData);

    console.log(`[promoteExt] Company erstellt: id=${company.id} name="${ext.company_name}" org=${organization_id}`);

    // ── ExternalCompanySource aktualisieren ───────────────────────────────────
    await base44.asServiceRole.entities.ExternalCompanySource.update(ext.id, {
      match_status: 'promoted_to_company',
      enrichment_status: 'enriched',
      promoted_company_id: company.id,
      promoted_at: new Date().toISOString(),
      promoted_by: user.email,
    });

    // ── UsageLog +1 ───────────────────────────────────────────────────────────
    const usageResult = await incrementUsageLog(base44, organization_id);

    // ── SHADOW MODE: Supabase lead_usage_event (non-blocking, Phase 1) ────────
    writeSupabaseUsageEvent(organization_id, getPeriodMonth(), company.id);
    const remainingAfter = monthlyLimit === -1
      ? -1
      : Math.max(0, monthlyLimit - usageResult.monthly_used_after);

    console.log(`[promoteExt] DONE: company=${company.id} ext=${ext.id} used=${usageResult.monthly_used_after}/${monthlyLimit}`);

    return Response.json({
      success: true,
      company_id: company.id,
      external_source_id: ext.id,
      status: 'promoted',
      company_name: ext.company_name,
      force_promoted: force_promote,
      next_step: 'open_company_or_analyze_engine',
      usage: {
        leads_created_added: 1,
        monthly_used_after: usageResult.monthly_used_after,
        monthly_limit: monthlyLimit,
        remaining_after: remainingAfter,
      },
    });

  } catch (error) {
    console.error('[promoteExternalSourceToCompany] Error:', error?.message, error?.stack);
    return Response.json({ success: false, error: 'internal_error', message: error?.message }, { status: 500 });
  }
});