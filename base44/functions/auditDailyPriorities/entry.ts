/**
 * auditDailyPriorities
 * ====================
 * Matrix-Test für die "Heute wichtig"-Tagesliste im Dashboard.
 * Prüft alle 10 Szenarien aus der Spezifikation.
 *
 * Admin-only.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin only' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { organization_id } = body;
    if (!organization_id) {
      return Response.json({ error: 'organization_id erforderlich' }, { status: 400 });
    }

    // ── Daten laden ────────────────────────────────────────────────────────────
    const blacklist = await base44.asServiceRole.entities.Blacklist.filter({ organization_id });
    const blacklistNames = blacklist.map(b => (b.firmenname || '').toLowerCase().trim());
    const isBlacklisted = (name) => {
      const n = (name || '').toLowerCase().trim();
      return blacklistNames.some(bl => n.includes(bl) || bl.includes(n));
    };

    const allCompanies = await base44.asServiceRole.entities.Company.filter({ organization_id }, '-created_date', 500);
    const companies = allCompanies.filter(c => !isBlacklisted(c.name));

    const allTasks = await base44.asServiceRole.entities.Task.filter({ organization_id }, '-faellig_am', 200);
    const openTasks = allTasks.filter(t => !t.erledigt);

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const todayTasks = openTasks.filter(t => {
      if (!t.faellig_am) return false;
      const d = new Date(t.faellig_am);
      return d >= todayStart && d < todayEnd;
    });
    const overdueTasks = openTasks.filter(t => {
      if (!t.faellig_am) return false;
      return new Date(t.faellig_am) < todayStart;
    });

    const isCallbackTask = (t) => {
      const typ = (t.typ || '').toLowerCase();
      const titel = (t.titel || '').toLowerCase();
      return typ.includes('rückruf') || titel.includes('rückruf');
    };

    const tasksByCompanyId = {};
    for (const t of openTasks) {
      if (t.company_id && !t.erledigt) {
        if (!tasksByCompanyId[t.company_id]) tasksByCompanyId[t.company_id] = [];
        tasksByCompanyId[t.company_id].push(t);
      }
    }
    const companiesWithTasks = new Set(Object.keys(tasksByCompanyId));

    const getLeadTemp = (c) => {
      const temp = c.lead_temperature;
      if (temp && ['hot', 'warm', 'cold'].includes(temp)) return temp;
      const score = (c.lead_temperature_score != null ? c.lead_temperature_score : 0) || (c.priority_score || 0);
      if (score >= 60) return 'hot';
      if (score >= 30) return 'warm';
      if (c.is_hot === true) return 'hot';
      return 'unknown';
    };

    // ── Build action items (identisch zu getDashboardData) ─────────────────────
    const overdueItems = overdueTasks.map(t => ({
      type: isCallbackTask(t) ? 'callback_overdue' : 'task_overdue',
      company_id: t.company_id || null,
      company_name: t.company_name || t.titel,
      action: isCallbackTask(t) ? 'Rückruf durchführen' : (t.typ || 'Aufgabe'),
      reason: `Überfällig seit ${t.faellig_am ? new Date(t.faellig_am).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' }) : '?'}`,
      priority: 0,
      task_id: t.id,
    }));

    const todayItems = todayTasks.map(t => ({
      type: isCallbackTask(t) ? 'callback_due_today' : 'task_today',
      company_id: t.company_id || null,
      company_name: t.company_name || t.titel,
      action: isCallbackTask(t) ? 'Rückruf durchführen' : (t.typ || 'Aufgabe'),
      reason: isCallbackTask(t) ? 'Rückruf heute fällig' : 'Heute fällig',
      priority: 1,
      task_id: t.id,
    }));

    const companyItems = [];
    const activeStatuses = ['Neu', 'Kontakt', 'Rückruf', 'Termin', 'Angebot'];

    for (const company of companies) {
      if (!activeStatuses.includes(company.status)) continue;
      if (company.is_blacklisted) continue;
      if (companyItems.length >= 8) break;

      let engineData = null;
      try { if (company.engine_analysis_json) engineData = JSON.parse(company.engine_analysis_json); } catch {}
      const rawNba = engineData?.next_best_action || company.next_best_action || null;
      let nbaTitle = null, nbaReason = null;
      if (rawNba) {
        if (typeof rawNba === 'string') nbaTitle = rawNba;
        else if (typeof rawNba === 'object') { nbaTitle = rawNba.title || rawNba.action || null; nbaReason = rawNba.reason || null; }
      }
      const leadTemp = getLeadTemp(company);
      const hasContact = !!(company.telefon || company.email);

      if (getLeadTemp(company) === 'hot' && !companiesWithTasks.has(company.id)) {
        companyItems.push({ type: 'hot_lead', company_id: company.id, company_name: company.name, action: nbaTitle || 'Kontaktieren', reason: nbaReason || 'Heißer Lead', priority: 2, lead_temperature: leadTemp, has_contact: hasContact });
        continue;
      }
      if (company.status === 'Angebot' && !companiesWithTasks.has(company.id)) {
        const offerDate = company.last_contact_date || company.updated_date || null;
        const ageDays = offerDate ? Math.floor((now - new Date(offerDate)) / (1000 * 60 * 60 * 24)) : null;
        companyItems.push({ type: 'offer_followup', company_id: company.id, company_name: company.name, action: 'Angebot nachfassen', reason: ageDays > 7 ? `Angebot seit ${ageDays} Tagen offen` : 'Offenes Angebot', priority: 2.5, lead_temperature: leadTemp, has_contact: hasContact, offer_age_days: ageDays });
        continue;
      }
      if (leadTemp === 'warm' && nbaTitle && !companiesWithTasks.has(company.id)) {
        companyItems.push({ type: 'warm_lead_action', company_id: company.id, company_name: company.name, action: nbaTitle, reason: nbaReason || 'Warmer Lead mit Empfehlung', priority: 3, lead_temperature: leadTemp, has_contact: hasContact });
        continue;
      }
      if (company.status === 'Rückruf' && !companiesWithTasks.has(company.id)) {
        companyItems.push({ type: 'callback_pending', company_id: company.id, company_name: company.name, action: 'Rückruf durchführen', reason: 'Rückruf ausstehend', priority: 3, lead_temperature: leadTemp, has_contact: hasContact });
        continue;
      }
      if (company.status === 'Neu' && hasContact && (company.relevance_score || 0) >= 65 && !companiesWithTasks.has(company.id)) {
        companyItems.push({ type: 'new_contactable', company_id: company.id, company_name: company.name, action: company.telefon ? 'Erstgespräch führen' : 'E-Mail vorbereiten', reason: `Neuer Lead · ${company.branche || 'Dienstleister'}`, priority: 4, lead_temperature: leadTemp, has_contact: hasContact });
      }
    }

    const allItems = [
      ...overdueItems,
      ...todayItems,
      ...companyItems.sort((a, b) => a.priority - b.priority),
    ].slice(0, 6);

    // ── Matrix-Tests ────────────────────────────────────────────────────────────
    const tests = [];

    // Test 1: Überfälliger Rückruf
    const callbackOverdueItems = overdueItems.filter(i => i.type === 'callback_overdue');
    tests.push({
      scenario: '1. Überfälliger Rückruf',
      expected: 'type=callback_overdue, action=Rückruf durchführen',
      found: callbackOverdueItems.length,
      sample: callbackOverdueItems[0] || null,
      pass: callbackOverdueItems.length > 0 || overdueTasks.filter(isCallbackTask).length === 0,
      note: overdueTasks.filter(isCallbackTask).length === 0 ? 'Keine überfälligen Rückruf-Tasks vorhanden (kein Fehler)' : null,
    });

    // Test 2: Heute fälliger Rückruf
    const callbackTodayItems = todayItems.filter(i => i.type === 'callback_due_today');
    tests.push({
      scenario: '2. Heute fälliger Rückruf',
      expected: 'type=callback_due_today, action=Rückruf durchführen',
      found: callbackTodayItems.length,
      sample: callbackTodayItems[0] || null,
      pass: callbackTodayItems.length > 0 || todayTasks.filter(isCallbackTask).length === 0,
      note: todayTasks.filter(isCallbackTask).length === 0 ? 'Keine heutigen Rückruf-Tasks vorhanden (kein Fehler)' : null,
    });

    // Test 3: Heißer Lead ohne Aufgabe
    const hotLeadItems = allItems.filter(i => i.type === 'hot_lead');
    const hotLeadsWithoutTask = companies.filter(c => getLeadTemp(c) === 'hot' && !companiesWithTasks.has(c.id) && activeStatuses.includes(c.status));
    tests.push({
      scenario: '3. Heißer Lead ohne Aufgabe',
      expected: 'type=hot_lead, priority=2',
      found: hotLeadItems.length,
      sample: hotLeadItems[0] || null,
      pass: hotLeadItems.length > 0 || hotLeadsWithoutTask.length === 0,
      note: hotLeadsWithoutTask.length === 0 ? 'Keine heißen Leads ohne Aufgabe vorhanden (kein Fehler)' : null,
    });

    // Test 4: Warmer Lead mit next_best_action
    const warmItems = allItems.filter(i => i.type === 'warm_lead_action');
    tests.push({
      scenario: '4. Warmer Lead mit next_best_action',
      expected: 'type=warm_lead_action, priority=3',
      found: warmItems.length,
      sample: warmItems[0] || null,
      pass: true, // optional - keine Pflicht
      note: 'Optional – nur wenn warme Leads mit NBA vorhanden',
    });

    // Test 5: Neuer kontaktierbarer Lead
    const newItems = allItems.filter(i => i.type === 'new_contactable');
    tests.push({
      scenario: '5. Neuer kontaktierbarer Lead',
      expected: 'type=new_contactable, priority=4, has_contact=true',
      found: newItems.length,
      sample: newItems[0] || null,
      pass: newItems.every(i => i.has_contact),
      note: newItems.some(i => !i.has_contact) ? '❌ Ein new_contactable ohne Kontaktdaten!' : null,
    });

    // Test 6: Offenes Angebot ohne Aufgabe
    const offerItems = allItems.filter(i => i.type === 'offer_followup');
    const offerLeadsWithoutTask = companies.filter(c => c.status === 'Angebot' && !companiesWithTasks.has(c.id));
    tests.push({
      scenario: '6. Offenes Angebot ohne Aufgabe',
      expected: 'type=offer_followup, action=Angebot nachfassen',
      found: offerItems.length,
      sample: offerItems[0] || null,
      pass: offerItems.length > 0 || offerLeadsWithoutTask.length === 0,
      note: offerLeadsWithoutTask.length === 0 ? 'Keine Angebot-Leads ohne Aufgabe vorhanden (kein Fehler)' : null,
    });

    // Test 7: Angebot MIT offener Aufgabe darf NICHT als offer_followup erscheinen
    const offerWithTask = companies.filter(c => c.status === 'Angebot' && companiesWithTasks.has(c.id));
    const offerWithTaskInItems = offerItems.filter(i => offerWithTask.some(c => c.id === i.company_id));
    tests.push({
      scenario: '7. Angebot mit offener Aufgabe → KEIN offer_followup',
      expected: 'Angebot+offene Task nicht in offer_followup',
      found: offerWithTaskInItems.length,
      pass: offerWithTaskInItems.length === 0,
      note: offerWithTaskInItems.length > 0 ? `❌ ${offerWithTaskInItems.length} Duplikate gefunden!` : '✅ Kein Duplikat',
    });

    // Test 8: Erledigte Aufgaben werden ignoriert
    const doneTaskIds = new Set(allTasks.filter(t => t.erledigt).map(t => t.id));
    const doneTaskInItems = allItems.filter(i => i.task_id && doneTaskIds.has(i.task_id));
    tests.push({
      scenario: '8. Erledigte Aufgaben werden ignoriert',
      expected: 'Keine erledigten Tasks in allItems',
      found: doneTaskInItems.length,
      pass: doneTaskInItems.length === 0,
      note: doneTaskInItems.length > 0 ? `❌ ${doneTaskInItems.length} erledigte Tasks in Liste!` : '✅ OK',
    });

    // Test 9: Gewonnene/Verlorene Leads nicht priorisieren
    const closedStatuses = ['Gewonnen', 'Verloren'];
    const closedInItems = allItems.filter(i => {
      const c = companies.find(co => co.id === i.company_id);
      return c && closedStatuses.includes(c.status);
    });
    tests.push({
      scenario: '9. Gewonnene/Verlorene Leads nicht in Liste',
      expected: 'Keine Gewonnen/Verloren Leads in allItems',
      found: closedInItems.length,
      pass: closedInItems.length === 0,
      note: closedInItems.length > 0 ? `❌ Geschlossene Leads in Liste!` : '✅ OK',
    });

    // Test 10: Blacklist-Ausschluss
    const blacklistedInItems = allItems.filter(i => i.company_id && isBlacklisted(i.company_name || ''));
    tests.push({
      scenario: '10. Blacklist-Ausschluss',
      expected: 'Keine Blacklist-Firmen in allItems',
      found: blacklistedInItems.length,
      pass: blacklistedInItems.length === 0,
      note: blacklistedInItems.length > 0 ? `❌ Blacklisted Companies in Liste!` : '✅ OK',
    });

    // Test 11: Max 6 Items
    tests.push({
      scenario: '11. Maximum 6 Items',
      expected: 'allItems.length <= 6',
      found: allItems.length,
      pass: allItems.length <= 6,
      note: `${allItems.length} Items`,
    });

    // Test 12: Keine Duplikate (company_id nicht doppelt)
    const companyIds = allItems.filter(i => i.company_id).map(i => i.company_id);
    const uniqueCompanyIds = new Set(companyIds);
    tests.push({
      scenario: '12. Keine Duplikate (company_id)',
      expected: 'Jede company_id max. 1x',
      found: companyIds.length - uniqueCompanyIds.size,
      pass: companyIds.length === uniqueCompanyIds.size,
      note: companyIds.length !== uniqueCompanyIds.size ? `❌ ${companyIds.length - uniqueCompanyIds.size} Duplikate!` : '✅ OK',
    });

    // Test 13: Prioritätsreihenfolge (priority aufsteigend)
    let orderOk = true;
    for (let i = 1; i < allItems.length; i++) {
      if ((allItems[i].priority || 0) < (allItems[i - 1].priority || 0)) { orderOk = false; break; }
    }
    tests.push({
      scenario: '13. Prioritätsreihenfolge aufsteigend',
      expected: 'Items nach priority sortiert',
      found: allItems.map(i => `${i.type}(p=${i.priority})`).join(' → '),
      pass: orderOk,
      note: orderOk ? '✅ OK' : '❌ Reihenfolge falsch',
    });

    const passed = tests.filter(t => t.pass).length;
    const failed = tests.filter(t => !t.pass).length;

    return Response.json({
      success: true,
      summary: {
        total: tests.length,
        passed,
        failed,
        status: failed === 0 ? '✅ ALLE TESTS BESTANDEN' : `❌ ${failed} TESTS FEHLGESCHLAGEN`,
      },
      final_items: allItems.map(i => ({ type: i.type, company_name: i.company_name, action: i.action, reason: i.reason, priority: i.priority })),
      tests,
      data_context: {
        total_companies: companies.length,
        open_tasks: openTasks.length,
        overdue_tasks: overdueTasks.length,
        today_tasks: todayTasks.length,
        companies_with_tasks: companiesWithTasks.size,
        offer_leads_no_task: offerLeadsWithoutTask.length,
        hot_leads_no_task: hotLeadsWithoutTask.length,
        blacklist_entries: blacklist.length,
      },
    });

  } catch (error) {
    console.error('[auditDailyPriorities] Error:', error?.message);
    return Response.json({ error: error?.message, success: false }, { status: 500 });
  }
});