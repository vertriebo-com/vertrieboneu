/**
 * testSupabaseRpcs
 * ================
 * Testet alle 6 Supabase-RPCs aus Migrationen 01–07 einzeln.
 * Dokumentiert Input, erwartetes Ergebnis, tatsächliches Ergebnis.
 *
 * NUR FÜR PLATFORM ADMINS.
 * POST {} — führt alle Tests durch
 * POST { rpc: "get_monthly_usage" } — testet nur einen RPC
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_KEY");

// Supabase RPC-Helper
async function callRpc(funcName, params = {}) {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${funcName}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'apikey': SUPABASE_SERVICE_KEY,
    },
    body: JSON.stringify(params),
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

// Supabase REST-Helper für direkte Tabellen-Queries
async function supabaseRest(path, method = 'GET', body = null, extraHeaders = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'apikey': SUPABASE_SERVICE_KEY,
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data, headers: Object.fromEntries(res.headers.entries()) };
}

// ── Test-Konstanten (synthetisch, kein Produktions-Impact) ──────────────────
const TEST_ORG_ID   = 'rpc_test_org_01';
const TEST_PERIOD   = '2026-05';
const TEST_COMPANY  = 'rpc_test_company_001';
const TEST_RUN_ID   = 'rpc_test_run_001';
const TEST_WORKER   = 'rpc_test_worker_001';

// ── Tabellen-Existenz-Prüfung ───────────────────────────────────────────────
async function checkTablesExist() {
  const tables = [
    'lead_usage_events',
    'shadow_mode_log',
    'quota_reservations',
    'research_run_locks',
    'research_run_audit',
  ];
  const results = {};
  await Promise.all(tables.map(async (t) => {
    const r = await supabaseRest(`/${t}?limit=0`, 'GET', null, { 'Prefer': 'count=exact', 'Range': '0-0' });
    results[t] = r.ok
      ? `✅ exists (HTTP ${r.status})`
      : `❌ missing (HTTP ${r.status}: ${JSON.stringify(r.data)?.slice(0, 100)})`;
  }));
  return results;
}

// ── Direkter INSERT-Test um genauen Fehler sichtbar zu machen ───────────────
async function directInsertDiagnose() {
  // Direkt via REST POST einfügen — Fehler werden nicht durch EXCEPTION verschluckt
  const res = await supabaseRest('/lead_usage_events', 'POST', {
    organization_id: TEST_ORG_ID,
    period_month: TEST_PERIOD,
    company_id: 'diag_company_001',
    research_run_id: TEST_RUN_ID,
    event_type: 'research_lead_created',
    source: 'research',
  }, { 'Prefer': 'return=minimal' });

  // Cleanup
  await supabaseRest(`/lead_usage_events?organization_id=eq.${TEST_ORG_ID}&company_id=eq.diag_company_001`, 'DELETE', null, { 'Prefer': 'return=minimal' });

  return {
    step: 'direct_insert_diagnose',
    status: res.status,
    ok: res.ok,
    data: res.data,
    note: res.ok ? '✅ Direkt-INSERT funktioniert — ON CONFLICT-Key stimmt überein' : `❌ Insert fehlgeschlagen: ${JSON.stringify(res.data)}`,
  };
}

// ── RPC 1: record_lead_usage_event ──────────────────────────────────────────
async function testRecordLeadUsageEvent() {
  const test = {
    rpc: 'record_lead_usage_event',
    input: {
      p_organization_id: TEST_ORG_ID,
      p_period_month: TEST_PERIOD,
      p_company_id: TEST_COMPANY,
      p_research_run_id: TEST_RUN_ID,
      p_source: 'research',
    },
    expected: 'true (boolean)',
    actual: null,
    status: null,
    error: null,
    passed: false,
  };

  const res = await callRpc('record_lead_usage_event', test.input);
  test.actual = res.data;
  test.status = res.status;

  if (res.ok && res.data === true) {
    test.passed = true;
  } else {
    test.error = `HTTP ${res.status}: ${JSON.stringify(res.data)}`;
  }

  // Idempotenz-Test: 2. Aufruf muss ebenfalls true liefern (ON CONFLICT DO NOTHING)
  const res2 = await callRpc('record_lead_usage_event', test.input);
  test.idempotent = res2.ok && res2.data === true
    ? '✅ idempotent (2. Aufruf = true, kein Fehler)'
    : `⚠️ 2. Aufruf: HTTP ${res2.status}: ${JSON.stringify(res2.data)}`;

  return test;
}

// ── RPC 2: get_monthly_usage ─────────────────────────────────────────────────
async function testGetMonthlyUsage() {
  const test = {
    rpc: 'get_monthly_usage',
    input: {
      p_organization_id: TEST_ORG_ID,
      p_period_month: TEST_PERIOD,
    },
    expected: '≥ 1 (bigint, weil record_lead_usage_event vorher lief)',
    actual: null,
    status: null,
    error: null,
    passed: false,
  };

  const res = await callRpc('get_monthly_usage', test.input);
  test.actual = res.data;
  test.status = res.status;

  // Supabase liefert bigint als String oder Number
  const count = typeof res.data === 'string' ? parseInt(res.data, 10) : res.data;
  if (res.ok && typeof count === 'number' && count >= 1) {
    test.passed = true;
  } else {
    test.error = `HTTP ${res.status}: ${JSON.stringify(res.data)}`;
  }

  return test;
}

// ── RPC 3: reserve_quota_slot ────────────────────────────────────────────────
async function testReserveQuotaSlot() {
  const test = {
    rpc: 'reserve_quota_slot',
    input: {
      p_organization_id: TEST_ORG_ID,
      p_period_month: TEST_PERIOD,
      p_max_slots: 100,
      p_research_run_id: TEST_RUN_ID,
    },
    expected: 'integer slot_number (≥ 1) oder null wenn erschöpft',
    actual: null,
    status: null,
    error: null,
    passed: false,
  };

  const res = await callRpc('reserve_quota_slot', test.input);
  test.actual = res.data;
  test.status = res.status;

  // Erwartet: eine Zahl ≥ 1 ODER null (Limit erreicht)
  if (res.ok && (res.data === null || (typeof res.data === 'number' && res.data >= 1))) {
    test.passed = true;
    test.slot_reserved = res.data;
  } else {
    test.error = `HTTP ${res.status}: ${JSON.stringify(res.data)}`;
  }

  return test;
}

// ── RPC 4: acquire_org_run_lock ──────────────────────────────────────────────
async function testAcquireOrgRunLock() {
  const test = {
    rpc: 'acquire_org_run_lock',
    input: {
      p_organization_id: TEST_ORG_ID,
      p_research_run_id: TEST_RUN_ID,
      p_worker_key: TEST_WORKER,
      p_lock_duration_ms: 10000,
    },
    expected: 'true (boolean) — Lock erfolgreich erworben',
    actual: null,
    status: null,
    error: null,
    passed: false,
  };

  const res = await callRpc('acquire_org_run_lock', test.input);
  test.actual = res.data;
  test.status = res.status;

  if (res.ok && res.data === true) {
    test.passed = true;
  } else {
    test.error = `HTTP ${res.status}: ${JSON.stringify(res.data)}`;
  }

  // Zweiter acquire-Versuch mit anderem Worker muss false liefern (Lock gehalten)
  const res2 = await callRpc('acquire_org_run_lock', {
    p_organization_id: TEST_ORG_ID,
    p_research_run_id: TEST_RUN_ID,
    p_worker_key: 'rpc_test_worker_002',
    p_lock_duration_ms: 10000,
  });
  test.concurrent_block = res2.data === false
    ? '✅ Konkurrenz-Worker korrekt blockiert (false)'
    : `⚠️ Erwartete false, bekam: ${JSON.stringify(res2.data)} (HTTP ${res2.status})`;

  return test;
}

// ── RPC 5: release_org_run_lock ──────────────────────────────────────────────
async function testReleaseOrgRunLock() {
  const test = {
    rpc: 'release_org_run_lock',
    input: {
      p_organization_id: TEST_ORG_ID,
      p_worker_key: TEST_WORKER,
    },
    expected: 'true (boolean) — Lock freigegeben',
    actual: null,
    status: null,
    error: null,
    passed: false,
  };

  const res = await callRpc('release_org_run_lock', test.input);
  test.actual = res.data;
  test.status = res.status;

  if (res.ok && res.data === true) {
    test.passed = true;
  } else {
    test.error = `HTTP ${res.status}: ${JSON.stringify(res.data)}`;
  }

  // Nach Release: neuer acquire muss true liefern
  const res2 = await callRpc('acquire_org_run_lock', {
    p_organization_id: TEST_ORG_ID,
    p_research_run_id: TEST_RUN_ID,
    p_worker_key: 'rpc_test_worker_003',
    p_lock_duration_ms: 5000,
  });
  test.re_acquire_after_release = res2.data === true
    ? '✅ Re-acquire nach Release erfolgreich (true)'
    : `⚠️ Re-acquire nach Release: ${JSON.stringify(res2.data)} (HTTP ${res2.status})`;

  // Cleanup: sofort wieder freigeben
  await callRpc('release_org_run_lock', {
    p_organization_id: TEST_ORG_ID,
    p_worker_key: 'rpc_test_worker_003',
  });

  return test;
}

// ── RPC 6: audit_research_event (aus Migration 06) ──────────────────────────
async function testAuditResearchEvent() {
  const test = {
    rpc: 'audit_research_event',
    input: {
      p_research_run_id: TEST_RUN_ID,
      p_organization_id: TEST_ORG_ID,
      p_event_type: 'rpc_test',
      p_worker_key: TEST_WORKER,
      p_event_data: { test: true, note: 'RPC Test von testSupabaseRpcs' },
    },
    expected: 'true (boolean) — Audit-Event geschrieben',
    actual: null,
    status: null,
    error: null,
    passed: false,
  };

  const res = await callRpc('audit_research_event', test.input);
  test.actual = res.data;
  test.status = res.status;

  if (res.ok && res.data === true) {
    test.passed = true;
  } else {
    test.error = `HTTP ${res.status}: ${JSON.stringify(res.data)}`;
  }

  return test;
}

// ── Cleanup: Test-Daten entfernen ─────────────────────────────────────────────
async function cleanupTestData() {
  const results = {};

  // lead_usage_events
  const r1 = await supabaseRest(
    `/lead_usage_events?organization_id=eq.${TEST_ORG_ID}`,
    'DELETE', null,
    { 'Prefer': 'return=minimal' }
  );
  results.lead_usage_events = r1.ok ? '✅ cleaned' : `⚠️ HTTP ${r1.status}`;

  // quota_reservations
  const r2 = await supabaseRest(
    `/quota_reservations?organization_id=eq.${TEST_ORG_ID}`,
    'DELETE', null,
    { 'Prefer': 'return=minimal' }
  );
  results.quota_reservations = r2.ok ? '✅ cleaned' : `⚠️ HTTP ${r2.status}`;

  // research_run_locks
  const r3 = await supabaseRest(
    `/research_run_locks?organization_id=eq.${TEST_ORG_ID}`,
    'DELETE', null,
    { 'Prefer': 'return=minimal' }
  );
  results.research_run_locks = r3.ok ? '✅ cleaned' : `⚠️ HTTP ${r3.status}`;

  // research_run_audit
  const r4 = await supabaseRest(
    `/research_run_audit?organization_id=eq.${TEST_ORG_ID}`,
    'DELETE', null,
    { 'Prefer': 'return=minimal' }
  );
  results.research_run_audit = r4.ok ? '✅ cleaned' : `⚠️ HTTP ${r4.status}`;

  return results;
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !["admin", "platform_owner", "platform_admin"].includes(user.role)) {
      return Response.json({ error: 'Forbidden: Platform Admin required' }, { status: 403 });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return Response.json({ error: 'SUPABASE_URL oder SUPABASE_SERVICE_KEY fehlen' }, { status: 500 });
    }

    let body = {};
    try { body = await req.json(); } catch {}
    const targetRpc = body?.rpc || null; // Optional: nur einen RPC testen

    console.info('[testSupabaseRpcs] Starte RPC-Tests...');

    // ── Schritt 1: Tabellen prüfen ────────────────────────────────────────────
    const tables = await checkTablesExist();
    const allTablesOk = Object.values(tables).every(v => v.startsWith('✅'));

    // Auch wenn Tabellen fehlen: RPCs für vorhandene Tabellen testen
    // (kein harter Abbruch — Testergebnisse pro RPC zeigen was fehlt)

    // ── Schritt 1b: Direkt-INSERT Diagnose ───────────────────────────────────
    const directInsert = await directInsertDiagnose();

    // ── Schritt 2: RPCs sequenziell testen ───────────────────────────────────
    // Reihenfolge wichtig: record_event → get_count, acquire → release
    const results = [];

    if (!targetRpc || targetRpc === 'record_lead_usage_event') {
      results.push(await testRecordLeadUsageEvent());
    }
    if (!targetRpc || targetRpc === 'get_monthly_usage') {
      results.push(await testGetMonthlyUsage());
    }
    if (!targetRpc || targetRpc === 'reserve_quota_slot') {
      results.push(await testReserveQuotaSlot());
    }
    if (!targetRpc || targetRpc === 'acquire_org_run_lock') {
      results.push(await testAcquireOrgRunLock());
    }
    if (!targetRpc || targetRpc === 'release_org_run_lock') {
      results.push(await testReleaseOrgRunLock());
    }
    if (!targetRpc || targetRpc === 'audit_research_event') {
      results.push(await testAuditResearchEvent());
    }

    // ── Schritt 3: Test-Daten bereinigen ─────────────────────────────────────
    const cleanup = await cleanupTestData();

    // ── Summary ───────────────────────────────────────────────────────────────
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const allPassed = failed === 0;

    console.info(`[testSupabaseRpcs] Ergebnis: ${passed}/${results.length} bestanden`);

    return Response.json({
      success: allPassed,
      direct_insert_diagnose: directInsert,
      summary: allPassed
        ? `✅ Alle ${passed} RPCs erfolgreich getestet`
        : `❌ ${failed} von ${results.length} RPCs fehlgeschlagen`,
      passed,
      failed,
      tables,
      rpc_results: results,
      cleanup,
      note: 'Test-Daten (org: rpc_test_org_01) wurden nach dem Test bereinigt.',
    });

  } catch (error) {
    console.error('[testSupabaseRpcs] Unhandled error:', error?.message);
    return Response.json({ error: error?.message }, { status: 500 });
  }
});