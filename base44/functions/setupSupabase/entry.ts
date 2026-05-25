/**
 * setupSupabase
 * =============
 * Phase 0: Erstellt die Supabase-Tabellen für Vertriebo Hybrid-Architektur.
 * Führt die SQL-Migration aus und testet die Verbindung.
 * 
 * NUR FÜR PLATFORM ADMINS — einmalig ausführen.
 * 
 * POST { action: "test" | "migrate" | "status" }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_KEY");

// SQL für lead_usage_events Tabelle
const MIGRATION_SQL = `
-- lead_usage_events: Atomare Usage-Zählung pro Research-Lead
-- Jeder erfolgreich erstellte Research-Lead schreibt genau einen Eintrag.
-- Manuell angelegte Leads / CSV-Importe schreiben KEINEN Eintrag.
CREATE TABLE IF NOT EXISTS lead_usage_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text        NOT NULL,
  period_month    text        NOT NULL,
  company_id      text        NOT NULL,
  research_run_id text,
  event_type      text        NOT NULL DEFAULT 'research_lead_created',
  source          text        NOT NULL DEFAULT 'research',
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Verhindert doppelte Events für dieselbe Company (Dedup-Schutz)
CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_events_company_dedup
  ON lead_usage_events (organization_id, company_id, event_type);

-- Schnelle Monats-Counts (Haupt-Query)
CREATE INDEX IF NOT EXISTS idx_usage_events_org_period
  ON lead_usage_events (organization_id, period_month);

-- shadow_mode_log: Vergleichs-Log für Shadow-Mode Validierung
CREATE TABLE IF NOT EXISTS shadow_mode_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id text        NOT NULL,
  period_month    text        NOT NULL,
  supabase_count  int         NOT NULL DEFAULT 0,
  base44_count    int         NOT NULL DEFAULT 0,
  diff            int         GENERATED ALWAYS AS (supabase_count - base44_count) STORED,
  checked_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shadow_log_org_period
  ON shadow_mode_log (organization_id, period_month);
`;

async function supabaseRpc(endpoint, method = 'GET', body = null, extraHeaders = {}) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error('SUPABASE_URL oder SUPABASE_SERVICE_KEY nicht gesetzt');
  }
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'apikey': SUPABASE_SERVICE_KEY,
    ...extraHeaders,
  };
  const res = await fetch(`${SUPABASE_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !["admin", "platform_owner", "platform_admin"].includes(user.role)) {
      return Response.json({ error: 'Forbidden: Platform Admin required' }, { status: 403 });
    }

    let body = {};
    try { body = await req.json(); } catch {}
    const action = body?.action || 'test';

    // ── ACTION: test ─────────────────────────────────────────────────────────
    if (action === 'test') {
      if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        return Response.json({
          success: false,
          error: 'Secrets fehlen',
          details: { SUPABASE_URL: !!SUPABASE_URL, SUPABASE_SERVICE_KEY: !!SUPABASE_SERVICE_KEY }
        }, { status: 500 });
      }

      // Einfacher Health-Check: Supabase REST API erreichbar?
      const healthRes = await supabaseRpc('/rest/v1/', 'GET');
      return Response.json({
        success: healthRes.ok,
        action: 'test',
        supabase_url: SUPABASE_URL?.replace(/https?:\/\//, '').split('.')[0] + '.supabase.co (masked)',
        http_status: healthRes.status,
        message: healthRes.ok
          ? 'Verbindung zu Supabase erfolgreich ✅'
          : `Verbindung fehlgeschlagen: HTTP ${healthRes.status}`,
        raw: healthRes.data,
      });
    }

    // ── ACTION: migrate ───────────────────────────────────────────────────────
    if (action === 'migrate') {
      // Supabase SQL via /rest/v1/rpc/exec_sql (wenn vorhanden) oder /pg/query
      // Supabase erlaubt SQL direkt via /pg/query mit Service Key
      const sqlRes = await fetch(`${SUPABASE_URL}/pg/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
          'apikey': SUPABASE_SERVICE_KEY,
        },
        body: JSON.stringify({ query: MIGRATION_SQL }),
      });
      const sqlText = await sqlRes.text();
      let sqlData = null;
      try { sqlData = JSON.parse(sqlText); } catch { sqlData = sqlText; }

      if (sqlRes.ok) {
        console.info('[setupSupabase] Migration erfolgreich ausgeführt');
        return Response.json({
          success: true,
          action: 'migrate',
          message: 'Tabellen erstellt: lead_usage_events, shadow_mode_log ✅',
          details: sqlData,
        });
      } else {
        console.error('[setupSupabase] Migration fehlgeschlagen:', sqlText);
        return Response.json({
          success: false,
          action: 'migrate',
          message: 'Migration fehlgeschlagen — ggf. SQL manuell im Supabase SQL Editor ausführen',
          error: sqlData,
          sql_hint: 'Führe das SQL manuell im Supabase Dashboard > SQL Editor aus',
        }, { status: 500 });
      }
    }

    // ── ACTION: status ────────────────────────────────────────────────────────
    if (action === 'status') {
      // Prüfen ob Tabellen existieren
      const [eventsRes, shadowRes] = await Promise.all([
        supabaseRpc('/rest/v1/lead_usage_events?limit=1', 'GET', null, { 'Prefer': 'count=exact', 'Range': '0-0' }),
        supabaseRpc('/rest/v1/shadow_mode_log?limit=1', 'GET', null, { 'Prefer': 'count=exact', 'Range': '0-0' }),
      ]);

      const getCount = (res) => {
        if (!res.ok) return null;
        // Content-Range: items 0-0/TOTAL
        return 'exists';
      };

      return Response.json({
        success: true,
        action: 'status',
        tables: {
          lead_usage_events: eventsRes.ok ? '✅ exists' : `❌ not found (HTTP ${eventsRes.status})`,
          shadow_mode_log: shadowRes.ok ? '✅ exists' : `❌ not found (HTTP ${shadowRes.status})`,
        },
        message: eventsRes.ok && shadowRes.ok
          ? 'Phase 0 abgeschlossen — Tabellen vorhanden ✅'
          : 'Tabellen fehlen noch — action: "migrate" ausführen',
      });
    }

    return Response.json({ error: `Unbekannte action: ${action}. Erlaubt: test, migrate, status` }, { status: 400 });

  } catch (error) {
    console.error('[setupSupabase] Error:', error?.message);
    return Response.json({ error: error?.message }, { status: 500 });
  }
});