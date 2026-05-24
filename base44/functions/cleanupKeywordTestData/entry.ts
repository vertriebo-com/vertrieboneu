/**
 * cleanupKeywordTestData
 * =======================
 * Löscht alle mit TEST_ markierten Testdaten aus createKeywordTestData.
 * 
 * Löscht:
 * - OrganizationKeywordProfile mit TEST_ Prefix
 * - TEST_ Einträge aus own_services in OrganizationSettings
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Nicht eingeloggt', success: false }, { status: 401 });
    }

    const isPlatformAdmin = ["admin", "platform_owner", "platform_admin"].includes(user.role);
    if (!isPlatformAdmin) {
      return Response.json({ error: 'Nur PlatformAdmin', success: false }, { status: 403 });
    }

    const testPrefix = 'TEST_';
    const cleaned = {
      keywords_deleted: 0,
      settings_cleaned: 0,
    };

    // ── 1. TEST_ Keywords löschen ────────────────────────────────────────────
    const testProfiles = await base44.asServiceRole.entities.OrganizationKeywordProfile.filter({ 
      keyword: { $regex: `^${testPrefix}` }
    });
    
    for (const profile of testProfiles) {
      await base44.asServiceRole.entities.OrganizationKeywordProfile.delete(profile.id);
      cleaned.keywords_deleted++;
      console.info(`[cleanupKeywordTestData] Gelöscht: ${profile.keyword} (${profile.status})`);
    }

    // ── 2. TEST_ Einträge aus own_services entfernen ─────────────────────────
    const allOrgs = await base44.asServiceRole.entities.Organization.list('-created_date', 100);
    
    for (const org of allOrgs) {
      const settingsRecords = await base44.asServiceRole.entities.OrganizationSettings.filter({ 
        organization_id: org.id,
        key: 'own_services'
      });
      
      if (settingsRecords[0]) {
        const currentValue = settingsRecords[0].value || '';
        const services = currentValue.split(/,|, /).map(x => x.trim()).filter(Boolean);
        const testServices = services.filter(s => s.includes(testPrefix));
        
        if (testServices.length > 0) {
          const cleanedServices = services.filter(s => !s.includes(testPrefix));
          const newValue = cleanedServices.join(', ');
          
          await base44.asServiceRole.entities.OrganizationSettings.update(settingsRecords[0].id, {
            value: newValue || ''
          });
          
          cleaned.settings_cleaned++;
          console.info(`[cleanupKeywordTestData] Org ${org.name}: TEST-Services entfernt: ${testServices.join(', ')}`);
        }
      }
    }

    return Response.json({
      success: true,
      cleaned,
      message: `TEST-Daten bereinigt: ${cleaned.keywords_deleted} Keywords, ${cleaned.settings_cleaned} Organisationen`,
    });

  } catch (error) {
    console.error('[cleanupKeywordTestData] Error:', error?.message, error?.stack);
    return Response.json({ error: error?.message, success: false }, { status: 500 });
  }
});