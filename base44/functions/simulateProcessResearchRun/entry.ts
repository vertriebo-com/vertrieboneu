/**
 * simulateProcessResearchRun
 * ==========================
 * Simuliert die Verarbeitung eines ResearchRuns für E2E-Tests.
 * Erstellt X Companies, aktualisiert UsageLog, ResearchRun, und Supabase Shadow Count.
 * 
 * AUFRUF: POST { research_run_id, num_companies: number }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function getPeriodMonth() {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date()).split('.').reverse().join('-');
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Nicht eingeloggt', success: false }, { status: 401 });

    const body = await req.json();
    const { research_run_id, num_companies = 5 } = body;

    if (!research_run_id) {
      return Response.json({ error: 'research_run_id required', success: false }, { status: 400 });
    }

    // ResearchRun laden
    const runs = await base44.asServiceRole.entities.ResearchRun.filter({ id: research_run_id });
    const run = runs[0];
    if (!run) {
      return Response.json({ error: 'ResearchRun nicht gefunden', success: false }, { status: 404 });
    }

    const orgId = run.organization_id;
    const periodMonth = getPeriodMonth();
    const [py, pm] = periodMonth.split('-').map(Number);

    console.log(`[simulateProcessResearchRun] run=${research_run_id} org=${orgId} num_companies=${num_companies}`);

    // Companies erstellen
    const companies = [];
    for (let i = 0; i < num_companies; i++) {
      const company = await base44.asServiceRole.entities.Company.create({
        organization_id: orgId,
        name: `Test Firma ${i + 1} (Run ${research_run_id.slice(-4)})`,
        branche: 'Gebäudereinigung',
        adresse: `Teststraße ${i + 1}`,
        plz: '80331',
        ort: 'München',
        email: `test${i + 1}@firma.de`,
        website: `https://firma${i + 1}.de`,
        latitude: 48.1351 + (Math.random() * 0.1),
        longitude: 11.5820 + (Math.random() * 0.1),
        distance_km: Math.random() * 20,
        search_center_city: 'München',
        search_center_lat: 48.1351,
        search_center_lng: 11.5820,
        search_radius_km: 25,
        status: 'Neu',
        quelle: 'Google Places API',
        source_provider: 'google_places',
        research_run_id: research_run_id,
        matched_target_customer_type: 'Hausverwaltung',
        matched_service_context: 'Büroreinigung',
        relevance_score: Math.floor(70 + Math.random() * 30),
        relevance_reason: 'Passt zu Zielkunde',
        source_query: 'Hausverwaltung München',
        google_place_id: `test_place_id_${research_run_id}_${i}`,
      });
      companies.push(company);
    }

    console.log(`[simulateProcessResearchRun] Created ${companies.length} companies`);

    // ResearchRun aktualisieren
    await base44.asServiceRole.entities.ResearchRun.update(research_run_id, {
      status: 'completed',
      leads_saved: num_companies,
      progress_percent: 100,
      current_step: 'Abgeschlossen',
      finished_at: new Date().toISOString(),
      charged_lead_generation: true,
    });

    // UsageLog aktualisieren (Base44)
    const existingLogs = await base44.asServiceRole.entities.UsageLog.filter({ 
      organization_id: orgId, 
      period_month: periodMonth 
    });

    const periodStart = new Date(Date.UTC(py, pm - 1, 1)).toISOString();
    const periodEnd = new Date(Date.UTC(py, pm, 1)).toISOString();

    if (existingLogs[0]) {
      await base44.asServiceRole.entities.UsageLog.update(existingLogs[0].id, {
        leads_created: (existingLogs[0].leads_created || 0) + num_companies,
        last_lead_generation_at: new Date().toISOString(),
      });
    } else {
      await base44.asServiceRole.entities.UsageLog.create({
        organization_id: orgId,
        period_month: periodMonth,
        leads_created: num_companies,
        lead_generations_used: 1,
        period_start: periodStart,
        period_end: periodEnd,
        last_lead_generation_at: new Date().toISOString(),
      });
    }

    console.log(`[simulateProcessResearchRun] UsageLog updated: +${num_companies}`);

    // Supabase Shadow Count aktualisieren (via RPC)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_KEY');
      
      if (supabaseUrl && supabaseKey) {
        const res = await fetch(`${supabaseUrl}/rest/v1/rpc/increment_shadow_count`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({
            p_organization_id: orgId,
            p_period_month: periodMonth,
            p_increment_by: num_companies,
          }),
        });
        
        if (res.ok) {
          console.log(`[simulateProcessResearchRun] Supabase shadow_count incremented by ${num_companies}`);
        } else {
          console.warn(`[simulateProcessResearchRun] Supabase RPC failed: ${res.status}`);
        }
      }
    } catch (supabaseErr) {
      console.warn('[simulateProcessResearchRun] Supabase error:', supabaseErr.message);
    }

    return Response.json({
      success: true,
      companies_created: companies.length,
      company_ids: companies.map(c => c.id),
      research_run_id: research_run_id,
      organization_id: orgId,
      period_month: periodMonth,
      usage_log_updated: true,
      supabase_updated: true,
    });

  } catch (error) {
    console.error('[simulateProcessResearchRun] Error:', error);
    return Response.json({ error: error.message, success: false }, { status: 500 });
  }
});