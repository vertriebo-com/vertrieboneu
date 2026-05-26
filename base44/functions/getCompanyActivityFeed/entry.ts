/**
 * getCompanyActivityFeed
 * ======================
 * Unified chronologischer Activity Feed für eine Company.
 * Merged: ContactLog + Task + Document → normalisierte Events.
 *
 * Input: { org_id, company_id, page=1, page_size=50, include_tasks=true, include_documents=true, include_system=true }
 * Output: { events, total, page, page_size, has_more, diagnostics }
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

const _PLATFORM_ADMIN_ROLES = new Set(['admin', 'platform_owner', 'platform_admin']);

// event_type ableiten aus ContactLog-Feldern
function resolveContactLogEventType(log) {
  const ergebnis = log.ergebnis || '';
  const notiz = log.notiz || '';
  const typ = log.typ || '';

  if (ergebnis === 'Lifecycle-Stage-Wechsel') return 'lifecycle_changed';
  if (ergebnis === 'Daten ergänzt' || ergebnis === 'Keine neuen Daten') return 'enrichment_done';
  if (ergebnis === 'Kontakt erstellt') return 'contact_created';
  if (ergebnis === 'Kontakt aktualisiert') return 'contact_updated';
  if (notiz.startsWith('Opportunity erstellt:')) return 'opportunity_created';
  if (notiz.includes('→ Gewonnen')) return 'opportunity_won';
  if (notiz.includes('→ Verloren')) return 'opportunity_lost';
  if (notiz.includes('Stage geändert')) return 'opportunity_stage_changed';
  if (notiz.includes('Dokument hochgeladen')) return 'document_uploaded';

  if (typ === 'Anruf') return 'phone_call';
  if (typ === 'E-Mail') return 'email';
  if (typ === 'Besuch') return 'visit';
  if (typ === 'Termin') return 'appointment';
  if (typ === 'Angebot') return 'offer';
  return 'note';
}

function resolveContactLogSource(log) {
  const eventType = resolveContactLogEventType(log);
  if (eventType === 'lifecycle_changed') return 'lifecycle';
  if (eventType === 'enrichment_done') return 'enrichment';
  if (eventType === 'contact_created' || eventType === 'contact_updated') return 'contact';
  if (['opportunity_created', 'opportunity_won', 'opportunity_lost', 'opportunity_stage_changed'].includes(eventType)) return 'opportunity';
  if (eventType === 'document_uploaded') return 'document';
  return 'contact_log';
}

function resolveContactLogTitle(log, eventType) {
  const titles = {
    lifecycle_changed: 'Lifecycle-Stage geändert',
    enrichment_done: log.ergebnis === 'Daten ergänzt' ? 'Kontaktdaten angereichert' : 'KI-Enrichment (keine neuen Daten)',
    contact_created: 'Ansprechpartner erstellt',
    contact_updated: 'Ansprechpartner aktualisiert',
    opportunity_created: 'Verkaufschance erstellt',
    opportunity_won: 'Verkaufschance gewonnen 🎉',
    opportunity_lost: 'Verkaufschance verloren',
    opportunity_stage_changed: 'Opportunity Stage geändert',
    document_uploaded: 'Dokument hochgeladen',
    phone_call: log.ergebnis === 'Erreicht' ? 'Anruf – Erreicht' : log.ergebnis === 'Nicht erreicht' ? 'Anruf – Nicht erreicht' : 'Anruf',
    email: 'E-Mail',
    visit: 'Besuch',
    appointment: 'Termin',
    offer: 'Angebot',
    note: 'Notiz',
  };
  return titles[eventType] || log.typ || 'Aktivität';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // ── Auth ─────────────────────────────────────────────────────────────────
    let user;
    try { user = await base44.auth.me(); } catch { user = null; }
    if (!user) return Response.json({ error: 'Nicht eingeloggt.' }, { status: 401 });

    const isPlatformAdmin = _PLATFORM_ADMIN_ROLES.has(user.role);

    const body = await req.json();
    const {
      org_id,
      company_id,
      page = 1,
      page_size: rawPageSize = 50,
      include_tasks = true,
      include_documents = true,
      include_system = true,
    } = body;

    if (!org_id) return Response.json({ error: 'org_id ist Pflichtparameter.' }, { status: 400 });
    if (!company_id) return Response.json({ error: 'company_id ist Pflichtparameter.' }, { status: 400 });

    const page_size = Math.min(Math.max(1, rawPageSize), 100);

    // ── Org guard ─────────────────────────────────────────────────────────────
    if (!isPlatformAdmin) {
      const [orgs, members] = await Promise.all([
        base44.asServiceRole.entities.Organization.filter({ id: org_id }),
        base44.asServiceRole.entities.OrganizationMember.filter({ organization_id: org_id, user_email: user.email }),
      ]);
      const org = orgs[0];
      if (!org) return Response.json({ error: 'Organisation nicht gefunden.' }, { status: 404 });
      if (org.platform_status === 'suspended') return Response.json({ error: 'Organisation gesperrt.' }, { status: 403 });
      const isOwner = org.owner_email === user.email;
      const member = members[0];
      const isMember = member?.status === 'active';
      if (!isOwner && !isMember) return Response.json({ error: 'Kein Zugriff auf diese Organisation.' }, { status: 403 });
    }

    // ── Company guard ─────────────────────────────────────────────────────────
    const companies = await base44.asServiceRole.entities.Company.filter({ id: company_id, organization_id: org_id });
    if (!companies[0]) return Response.json({ error: 'Firma nicht gefunden oder falsche Organisation.' }, { status: 404 });

    // ── Daten parallel laden ─────────────────────────────────────────────────
    const fetches = [
      base44.asServiceRole.entities.ContactLog.filter({ company_id, organization_id: org_id }, '-created_date', 500),
    ];
    if (include_tasks) {
      fetches.push(base44.asServiceRole.entities.Task.filter({ company_id, organization_id: org_id }, '-created_date', 200));
    }
    if (include_documents) {
      fetches.push(base44.asServiceRole.entities.Document.filter({ company_id, organization_id: org_id }, '-created_date', 100));
    }

    const [contactLogs, taskResults, documentResults] = await Promise.all(fetches);
    const tasks = taskResults || [];
    const documents = documentResults || [];

    // ── ContactLog → Events normalisieren ────────────────────────────────────
    const contactLogEvents = contactLogs
      .filter(log => include_system || log.is_manual !== false)
      .map(log => {
        const eventType = resolveContactLogEventType(log);
        const source = resolveContactLogSource(log);
        return {
          id: log.id,
          organization_id: log.organization_id,
          company_id: log.company_id,
          source,
          event_type: eventType,
          title: resolveContactLogTitle(log, eventType),
          description: log.notiz || null,
          actor_email: log.user_email || log.created_by || null,
          created_date: log.created_date,
          is_system: log.is_manual === false,
          metadata: {
            ergebnis: log.ergebnis || null,
            naechster_schritt: log.naechster_schritt || null,
            typ: log.typ || null,
          },
        };
      });

    // ── Task → Events normalisieren ──────────────────────────────────────────
    const taskEvents = [];
    if (include_tasks) {
      for (const task of tasks) {
        // "Aufgabe erstellt"
        taskEvents.push({
          id: `task_created_${task.id}`,
          organization_id: task.organization_id,
          company_id: task.company_id,
          source: 'task',
          event_type: 'task_created',
          title: `Aufgabe erstellt: ${task.titel}`,
          description: task.beschreibung || null,
          actor_email: task.assigned_to || task.created_by || null,
          created_date: task.created_date,
          is_system: false,
          metadata: {
            task_id: task.id,
            task_typ: task.typ,
            prioritaet: task.prioritaet,
            faellig_am: task.faellig_am || null,
            erledigt: task.erledigt,
          },
        });
        // "Aufgabe erledigt" (falls erledigt=true → updated_date als Proxy)
        if (task.erledigt) {
          taskEvents.push({
            id: `task_done_${task.id}`,
            organization_id: task.organization_id,
            company_id: task.company_id,
            source: 'task',
            event_type: 'task_completed',
            title: `Aufgabe erledigt: ${task.titel}`,
            description: null,
            actor_email: task.assigned_to || task.created_by || null,
            created_date: task.updated_date || task.created_date,
            is_system: false,
            metadata: { task_id: task.id, task_typ: task.typ },
          });
        }
      }
    }

    // ── Document → Events normalisieren ─────────────────────────────────────
    const documentEvents = include_documents
      ? documents.map(doc => ({
          id: `doc_${doc.id}`,
          organization_id: doc.organization_id,
          company_id: doc.company_id,
          source: 'document',
          event_type: 'document_uploaded',
          title: `Dokument hochgeladen: ${doc.titel}`,
          description: doc.beschreibung || null,
          actor_email: doc.created_by || null,
          created_date: doc.created_date,
          is_system: false,
          metadata: {
            document_id: doc.id,
            dateiname: doc.dateiname || null,
            kategorie: doc.kategorie || null,
            document_type: doc.document_type || null,
          },
        }))
      : [];

    // ── Merge + Sortierung ───────────────────────────────────────────────────
    const allEvents = [...contactLogEvents, ...taskEvents, ...documentEvents]
      .sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

    // ── Pagination ───────────────────────────────────────────────────────────
    const total = allEvents.length;
    const offset = (page - 1) * page_size;
    const events = allEvents.slice(offset, offset + page_size);
    const has_more = offset + page_size < total;

    const countBySource = {};
    for (const e of allEvents) {
      countBySource[e.source] = (countBySource[e.source] || 0) + 1;
    }

    return Response.json({
      events,
      total,
      page,
      page_size,
      has_more,
      diagnostics: {
        sources_merged: ['contact_log', 'task', 'document'],
        events_by_source: countBySource,
        contact_logs_total: contactLogs.length,
        tasks_total: tasks.length,
        documents_total: documents.length,
        system_events_included: include_system,
      },
    });

  } catch (error) {
    console.error('[getCompanyActivityFeed] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});