/**
 * updateTaskSafe
 * ==============
 * Sicheres Task-Update mit server-seitigem Tenant-Check.
 * Ersetzt direktes base44.entities.Task.update() im Frontend.
 *
 * Input: { task_id, patch }
 * - task_id: ID der zu aktualisierenden Aufgabe
 * - patch: Objekt mit zu ändernden Feldern
 *
 * AuthZ:
 * - User muss Owner, aktives OrganizationMember oder PlatformAdmin sein
 * - organization_id wird aus der Task geladen, NICHT aus dem Body vertraut
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

const PLATFORM_ADMIN_ROLES = new Set(['admin', 'platform_owner', 'platform_admin']);

const PROTECTED_FIELDS = new Set(['organization_id', 'company_id', 'created_by']);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Nicht eingeloggt' }, { status: 401 });

    const body = await req.json();
    const { task_id, patch } = body;

    if (!task_id) return Response.json({ error: 'task_id erforderlich' }, { status: 400 });
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return Response.json({ error: 'patch muss ein Objekt sein' }, { status: 400 });
    }

    // Patch-Validierung: geschützte Felder entfernen
    const safePatch = { ...patch };
    for (const field of PROTECTED_FIELDS) {
      if (field in safePatch) {
        console.warn(`[updateTaskSafe] Geschütztes Feld "${field}" aus Patch entfernt`);
        delete safePatch[field];
      }
    }

    if (Object.keys(safePatch).length === 0) {
      return Response.json({ error: 'Kein gültiges Feld zum Aktualisieren' }, { status: 400 });
    }

    // Task laden — organization_id IMMER aus DB, nie aus Body
    const tasks = await base44.asServiceRole.entities.Task.filter({ id: task_id });
    const task = tasks[0];
    if (!task) return Response.json({ error: 'Aufgabe nicht gefunden' }, { status: 404 });

    const organization_id = task.organization_id;
    if (!organization_id) {
      // Fallback: Task ohne org_id — nur Owner/Admin darf das
      const isPlatformAdmin = PLATFORM_ADMIN_ROLES.has(user.role);
      if (!isPlatformAdmin) {
        // Prüfen ob assigned_to dem User entspricht
        if (task.assigned_to && task.assigned_to !== user.email) {
          return Response.json({ error: 'Kein Zugriff auf diese Aufgabe' }, { status: 403 });
        }
      }
    } else {
      // Tenant-Check via organization_id
      const isPlatformAdmin = PLATFORM_ADMIN_ROLES.has(user.role);
      if (!isPlatformAdmin) {
        const orgs = await base44.asServiceRole.entities.Organization.filter({ id: organization_id });
        const org = orgs[0];
        if (!org) return Response.json({ error: 'Organisation nicht gefunden' }, { status: 404 });

        const isOwner = org.owner_email === user.email;
        if (!isOwner) {
          const memberships = await base44.asServiceRole.entities.OrganizationMember.filter({
            organization_id, user_email: user.email, status: 'active'
          });
          if (memberships.length === 0) {
            return Response.json({ error: 'Kein Zugriff auf diese Aufgabe' }, { status: 403 });
          }
        }
      }
    }

    // Update ausführen
    const updated = await base44.asServiceRole.entities.Task.update(task_id, safePatch);
    console.info(`[updateTaskSafe] OK: user=${user.email} task=${task_id} fields=${Object.keys(safePatch).join(',')}`);

    return Response.json({ success: true, updated });

  } catch (error) {
    console.error('[updateTaskSafe] Error:', error?.message);
    return Response.json({ error: error?.message || 'Unbekannter Fehler' }, { status: 500 });
  }
});