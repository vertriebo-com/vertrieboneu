/**
 * repairQuotaCommit
 * ==================
 * Repariert QuotaReservation-Slots bei denen Company.create erfolgreich war,
 * aber commitQuotaSlot fehlschlug (z.B. durch Timeout/Network-Error).
 * 
 * Szenario:
 * - QuotaReservation.status = 'reserved'
 * - Company existiert mit research_run_id = Run ID
 * - Aber: slot wurde nicht committet
 * 
 * Usage:
 * - Automatisch via Scheduled Function (täglich)
 * - Oder manuell via Platform Admin UI
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    // Admin-only
    if (!user || !["admin", "platform_owner", "platform_admin"].includes(user.role)) {
      return Response.json({ error: 'Forbidden: Admin only' }, { status: 403 });
    }

    const body = await req.json();
    const { organization_id, period_month, run_id } = body || {};

    // ── Reserved Slots finden ────────────────────────────────────────────────
    const query: any = { status: 'reserved' };
    if (organization_id) query.organization_id = organization_id;
    if (period_month) query.period_month = period_month;

    const reservedSlots = await base44.asServiceRole.entities.QuotaReservation.filter(query);
    
    const repaired: any[] = [];
    const needsReview: any[] = [];

    for (const slot of reservedSlots) {
      try {
        // Prüfen ob Company existiert
        const companies = await base44.asServiceRole.entities.Company.filter({
          research_run_id: slot.research_run_id,
        });

        // Company finden das zu diesem Slot passt (gleicher Run, ähnliche created_date)
        const matchingCompany = companies.find(c => {
          if (!c.created_date || !slot.reserved_at) return false;
          const slotTime = new Date(slot.reserved_at).getTime();
          const companyTime = new Date(c.created_date).getTime();
          // Company wurde innerhalb von 5 Minuten nach Reservation erstellt
          return Math.abs(companyTime - slotTime) < 5 * 60 * 1000;
        });

        if (matchingCompany) {
          // Commit nachholen
          await base44.asServiceRole.entities.QuotaReservation.update(slot.id, {
            status: 'committed',
            company_id: matchingCompany.id,
            committed_at: new Date().toISOString(),
          });

          repaired.push({
            slot_id: slot.id,
            slot_number: slot.slot_number,
            company_id: matchingCompany.id,
            company_name: matchingCompany.name,
            organization_id: slot.organization_id,
            period_month: slot.period_month,
          });

          // UsageLog synchronisieren falls nötig
          const now = new Date().toISOString();
          const usageRecords = await base44.asServiceRole.entities.UsageLog.filter({
            organization_id: slot.organization_id,
            period_month: slot.period_month,
          });

          if (usageRecords[0]) {
            // Check ob leads_created schon korrekt ist
            const expectedCount = companies.filter(c => 
              c.created_date && 
              c.created_date >= slot.period_month && 
              c.created_date < new Date(new Date(slot.period_month + '-01').setMonth(new Date(slot.period_month + '-01').getMonth() + 1)).toISOString()
            ).length;

            if ((usageRecords[0].leads_created || 0) < expectedCount) {
              await base44.asServiceRole.entities.UsageLog.update(usageRecords[0].id, {
                leads_created: expectedCount,
                last_lead_generation_at: now,
              });
            }
          }
        } else {
          // Keine Company gefunden → Slot ist wirklich offen (noch nicht erstellt)
          // Prüfen ob Reservation alt ist (> 1 Stunde)
          const slotAge = Date.now() - new Date(slot.reserved_at).getTime();
          if (slotAge > 60 * 60 * 1000) { // > 1 Stunde
            // Alte Reservation ohne Company → freigeben
            await base44.asServiceRole.entities.QuotaReservation.update(slot.id, {
              status: 'released',
              released_at: new Date().toISOString(),
            });
            needsReview.push({
              slot_id: slot.id,
              slot_number: slot.slot_number,
              reason: 'Old reservation without company (>1h)',
              action: 'released',
            });
          }
        }
      } catch (err) {
        console.error(`[repairQuotaCommit] Error processing slot ${slot.id}:`, err.message);
        needsReview.push({
          slot_id: slot.id,
          slot_number: slot.slot_number,
          reason: `Error: ${err.message}`,
          action: 'needs_manual_review',
        });
      }
    }

    return Response.json({
      success: true,
      repaired,
      needsReview,
      summary: {
        total_reserved_slots: reservedSlots.length,
        repaired_count: repaired.length,
        needs_review_count: needsReview.length,
      },
    });

  } catch (error) {
    console.error('[repairQuotaCommit] Error:', error?.message);
    return Response.json({ error: error?.message || 'Unbekannter Fehler', success: false }, { status: 500 });
  }
});