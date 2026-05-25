/**
 * cleanupDuplicateLeads
 * =====================
 * Admin-Function: Findet und löscht doppelte Company-Einträge für eine Organisation.
 *
 * Duplikat-Kriterien (in Priorität):
 * 1. Gleiche google_place_id (härtestes Signal)
 * 2. Gleicher normalisierter Name + gleicher Ort
 * 3. Gleicher normalisierter Name + gleiche Telefonnummer
 *
 * Strategie: Älteste Company behalten (niedrigste created_date), neuere löschen.
 * UsageLog wird nach dem Cleanup korrigiert.
 *
 * Aufruf: { organization_id, dry_run: true/false }
 * dry_run=true → nur Bericht, keine Löschungen
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

function normStr(str) {
  return String(str || "").toLowerCase()
    .replace(/ä/g,"ae").replace(/ö/g,"oe").replace(/ü/g,"ue").replace(/ß/g,"ss")
    .replace(/[^a-z0-9]/g, '').trim();
}

function getPeriodMonth() {
  const n = new Date();
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth()+1).padStart(2,'0')}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Nicht eingeloggt' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Nur Admins' }, { status: 403 });

    const body = await req.json();
    const { organization_id, dry_run = true } = body;
    if (!organization_id) return Response.json({ error: 'organization_id erforderlich' }, { status: 400 });

    console.info(`[cleanupDuplicateLeads] Start org=${organization_id} dry_run=${dry_run}`);

    // Alle Companies laden (in Batches)
    let allCompanies = [];
    let skip = 0;
    const batchSize = 500;
    while (true) {
      const batch = await base44.asServiceRole.entities.Company.filter(
        { organization_id }, 'created_date', batchSize, skip
      );
      if (!batch || batch.length === 0) break;
      allCompanies = allCompanies.concat(batch);
      if (batch.length < batchSize) break;
      skip += batchSize;
    }

    console.info(`[cleanupDuplicateLeads] Loaded ${allCompanies.length} companies`);

    const toDelete = new Set(); // IDs die gelöscht werden sollen
    const duplicateGroups = [];

    // ── Dedupe Pass 1: google_place_id ───────────────────────────────────────
    const byPlaceId = new Map();
    for (const company of allCompanies) {
      if (!company.google_place_id) continue;
      const key = company.google_place_id;
      if (!byPlaceId.has(key)) {
        byPlaceId.set(key, []);
      }
      byPlaceId.get(key).push(company);
    }
    for (const [placeId, group] of byPlaceId.entries()) {
      if (group.length <= 1) continue;
      // Älteste behalten (kleinste created_date), alle anderen löschen
      group.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
      const keep = group[0];
      const remove = group.slice(1);
      for (const c of remove) {
        if (!toDelete.has(c.id)) {
          toDelete.add(c.id);
        }
      }
      duplicateGroups.push({
        reason: 'google_place_id',
        place_id: placeId,
        keep_id: keep.id, keep_name: keep.name,
        removed: remove.map(c => ({ id: c.id, name: c.name, created_date: c.created_date })),
      });
    }

    // ── Dedupe Pass 2: normName + ort ────────────────────────────────────────
    const byNameOrt = new Map();
    for (const company of allCompanies) {
      if (toDelete.has(company.id)) continue; // bereits markiert
      const key = `${normStr(company.name)}|${normStr(company.ort || '')}`;
      if (!byNameOrt.has(key)) byNameOrt.set(key, []);
      byNameOrt.get(key).push(company);
    }
    for (const [key, group] of byNameOrt.entries()) {
      if (group.length <= 1) continue;
      group.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
      const keep = group[0];
      const remove = group.slice(1).filter(c => !toDelete.has(c.id));
      if (remove.length === 0) continue;
      for (const c of remove) toDelete.add(c.id);
      duplicateGroups.push({
        reason: 'name_ort',
        key,
        keep_id: keep.id, keep_name: keep.name,
        removed: remove.map(c => ({ id: c.id, name: c.name, created_date: c.created_date })),
      });
    }

    // ── Dedupe Pass 3: normName + telefon ────────────────────────────────────
    const byNamePhone = new Map();
    for (const company of allCompanies) {
      if (toDelete.has(company.id)) continue;
      const phone = normStr(company.telefon || '');
      if (!phone || phone.length < 6) continue; // Zu kurze/leere Telefonnummern nicht als Key
      const key = `${normStr(company.name)}|${phone}`;
      if (!byNamePhone.has(key)) byNamePhone.set(key, []);
      byNamePhone.get(key).push(company);
    }
    for (const [key, group] of byNamePhone.entries()) {
      if (group.length <= 1) continue;
      group.sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
      const keep = group[0];
      const remove = group.slice(1).filter(c => !toDelete.has(c.id));
      if (remove.length === 0) continue;
      for (const c of remove) toDelete.add(c.id);
      duplicateGroups.push({
        reason: 'name_phone',
        key,
        keep_id: keep.id, keep_name: keep.name,
        removed: remove.map(c => ({ id: c.id, name: c.name, created_date: c.created_date })),
      });
    }

    const deleteCount = toDelete.size;
    console.info(`[cleanupDuplicateLeads] Found ${deleteCount} duplicates to remove (${duplicateGroups.length} groups)`);

    if (dry_run) {
      return Response.json({
        success: true, dry_run: true,
        total_companies: allCompanies.length,
        duplicates_found: deleteCount,
        duplicate_groups: duplicateGroups.slice(0, 50), // Erste 50 zur Vorschau
        message: `Trocken-Lauf: ${deleteCount} Duplikate gefunden in ${duplicateGroups.length} Gruppen. Sende dry_run=false um zu löschen.`,
      });
    }

    // ── Echte Löschung ───────────────────────────────────────────────────────
    let deleted = 0;
    const deleteIds = [...toDelete];
    // In Chunks löschen (max 50 gleichzeitig um API-Limits zu respektieren)
    for (let i = 0; i < deleteIds.length; i += 50) {
      const chunk = deleteIds.slice(i, i + 50);
      await Promise.all(chunk.map(id =>
        base44.asServiceRole.entities.Company.delete(id).catch(e =>
          console.warn(`[cleanupDuplicateLeads] Delete failed for ${id}:`, e?.message)
        )
      ));
      deleted += chunk.length;
      console.info(`[cleanupDuplicateLeads] Deleted ${deleted}/${deleteCount}`);
    }

    // ── UsageLog korrigieren ─────────────────────────────────────────────────
    // Lies aktuellen Monat-Log und korrigiere leads_created
    const periodMonth = getPeriodMonth();
    const usageLogs = await base44.asServiceRole.entities.UsageLog.filter({ organization_id, period_month: periodMonth });
    if (usageLogs[0] && deleted > 0) {
      const corrected = Math.max(0, (usageLogs[0].leads_created || 0) - deleted);
      await base44.asServiceRole.entities.UsageLog.update(usageLogs[0].id, {
        leads_created: corrected,
      });
      console.info(`[cleanupDuplicateLeads] UsageLog corrected: ${usageLogs[0].leads_created} → ${corrected}`);
    }

    return Response.json({
      success: true, dry_run: false,
      total_companies: allCompanies.length,
      duplicates_deleted: deleted,
      duplicate_groups: duplicateGroups.length,
      message: `${deleted} Duplikate gelöscht. UsageLog korrigiert.`,
    });

  } catch (error) {
    console.error('[cleanupDuplicateLeads] Error:', error?.message, error?.stack);
    return Response.json({ error: error?.message }, { status: 500 });
  }
});