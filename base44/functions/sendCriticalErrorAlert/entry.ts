import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const payload = await req.json();

    const {
      function_name,
      error_message,
      stack,
      organization_id,
      user_email,
      timestamp,
    } = payload;

    if (!function_name || !error_message) {
      return Response.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Rate-Limit prüfen: max 1 Alert pro Stunde pro function_name
    const rateLimitRecords = await base44.asServiceRole.entities.ErrorAlertRateLimit.filter({
      function_name,
    });
    const lastRecord = rateLimitRecords[0];
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    if (lastRecord && lastRecord.last_sent_at > oneHourAgo) {
      console.log(`[sendCriticalErrorAlert] Rate-limit für ${function_name} aktiv. Alert geblockiert.`);
      return Response.json({ status: 'rate_limited' });
    }

    // PlatformConfig laden für Admin-E-Mail
    const configs = await base44.asServiceRole.entities.PlatformConfig.list();
    const config = configs[0];
    const adminEmail = config?.admin_email || 'admin@vertriebo.com';

    // E-Mail zusammenstellen
    const emailBody = `
<h2>🚨 Kritischer Fehler in ${function_name}</h2>
<p><strong>Zeitstempel:</strong> ${timestamp}</p>
<p><strong>Fehler:</strong> ${error_message}</p>
${organization_id ? `<p><strong>Organisation ID:</strong> ${organization_id}</p>` : ''}
${user_email ? `<p><strong>Benutzer:</strong> ${user_email}</p>` : ''}
${stack ? `<pre><code>${stack}</code></pre>` : ''}
<p>Bitte überprüfe die Logs im Platform Admin Center.</p>
    `;

    // E-Mail senden
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: adminEmail,
      subject: `🚨 [${function_name}] Kritischer Fehler`,
      from_name: 'Vertriebo Alert',
      body: emailBody,
    });

    // Rate-Limit aktualisieren oder erstellen
    if (lastRecord) {
      await base44.asServiceRole.entities.ErrorAlertRateLimit.update(lastRecord.id, {
        last_sent_at: new Date().toISOString(),
      });
    } else {
      await base44.asServiceRole.entities.ErrorAlertRateLimit.create({
        function_name,
        last_sent_at: new Date().toISOString(),
      });
    }

    console.log(`[sendCriticalErrorAlert] Alert gesendet für ${function_name}`);
    return Response.json({ status: 'sent' });
  } catch (error) {
    console.error('[sendCriticalErrorAlert] Error:', error.message);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
});