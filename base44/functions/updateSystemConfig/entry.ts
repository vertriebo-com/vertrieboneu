import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Nur Plattform-Admins dürfen das ändern
    if (!user || !['admin', 'platform_admin', 'platform_owner'].includes(user.role)) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { google_places_api_enabled, disabled_reason } = body;

    // Systemkonfiguration laden oder erstellen
    let config;
    const configs = await base44.asServiceRole.entities.PlatformConfig.list();
    
    if (configs[0]) {
      config = await base44.asServiceRole.entities.PlatformConfig.update(configs[0].id, {
        google_places_api_enabled,
        disabled_reason: disabled_reason || null,
        last_modified_by: user.email,
        last_modified_at: new Date().toISOString(),
      });
    } else {
      config = await base44.asServiceRole.entities.PlatformConfig.create({
        google_places_api_enabled,
        disabled_reason: disabled_reason || null,
        last_modified_by: user.email,
        last_modified_at: new Date().toISOString(),
      });
    }

    // Audit-Log schreiben
    await base44.asServiceRole.entities.PlatformAuditLog.create({
      actor_email: user.email,
      actor_role: user.role,
      action: google_places_api_enabled ? 'enable_google_places_api' : 'disable_google_places_api',
      target_type: 'platform_config',
      target_id: config.id,
      organization_id: null,
      parent_agency_id: null,
      metadata: JSON.stringify({
        google_places_api_enabled,
        disabled_reason: disabled_reason || null,
      }),
      reason: disabled_reason || null,
    });

    return Response.json({
      success: true,
      config,
      message: 'Systemkonfiguration aktualisiert',
    });
  } catch (error) {
    console.error('[updateSystemConfig] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});