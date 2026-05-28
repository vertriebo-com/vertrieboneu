/**
 * updateCompanySafe
 * =================
 * Sicheres Company-Update mit server-seitigem Tenant-Check.
 * Ersetzt direktes base44.entities.Company.update() im Frontend.
 *
 * Input: { company_id, patch }
 * - company_id: ID der zu aktualisierenden Firma
 * - patch: Objekt mit zu ändernden Feldern (kein organization_id-Überschreiben möglich)
 *
 * AuthZ:
 * - User muss Owner, aktives OrganizationMember oder PlatformAdmin sein
 * - organization_id wird aus der Company geladen, NICHT aus dem Body vertraut
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

const PLATFORM_ADMIN_ROLES = new Set(['admin', 'platform_owner', 'platform_admin']);

// Felder die nicht per Patch überschrieben werden dürfen
const PROTECTED_FIELDS = new Set(['organization_id', 'google_place_id', 'source_provider', 'research_run_id', 'created_by']);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Nicht eingeloggt' }, { status: 401 });

    const body = await req.json();
    const { company_id, patch } = body;

    if (!company_id) return Response.json({ error: 'company_id erforderlich' }, { status: 400 });
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return Response.json({ error: 'patch muss ein Objekt sein' }, { status: 400 });
    }

    // Patch-Validierung: geschützte Felder entfernen
    const safePatch = { ...patch };
    for (const field of PROTECTED_FIELDS) {
      if (field in safePatch) {
        console.warn(`[updateCompanySafe] Geschütztes Feld "${field}" aus Patch entfernt`);
        delete safePatch[field];
      }
    }

    if (Object.keys(safePatch).length === 0) {
      return Response.json({ error: 'Kein gültiges Feld zum Aktualisieren' }, { status: 400 });
    }

    // Company laden — organization_id IMMER aus DB, nie aus Body
    const companies = await base44.asServiceRole.entities.Company.filter({ id: company_id });
    const company = companies[0];
    if (!company) return Response.json({ error: 'Firma nicht gefunden' }, { status: 404 });

    const organization_id = company.organization_id;
    if (!organization_id) return Response.json({ error: 'Firma hat keine organization_id' }, { status: 400 });

    // Tenant-Check
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
          return Response.json({ error: 'Kein Zugriff auf diese Firma' }, { status: 403 });
        }
      }
    }

    // Update ausführen
    const updated = await base44.asServiceRole.entities.Company.update(company_id, safePatch);
    console.info(`[updateCompanySafe] OK: user=${user.email} company=${company_id} fields=${Object.keys(safePatch).join(',')}`);

    return Response.json({ success: true, updated });

  } catch (error) {
    console.error('[updateCompanySafe] Error:', error?.message);
    return Response.json({ error: error?.message || 'Unbekannter Fehler' }, { status: 500 });
  }
});