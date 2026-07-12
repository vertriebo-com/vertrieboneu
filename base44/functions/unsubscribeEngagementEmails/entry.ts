import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Setzt OrganizationSettings-Key "engagement_emails_unsubscribed" = "true"
// Wird via GET-Link aufgerufen: /api/unsubscribeEngagementEmails?org_id=xxx&email=yyy

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const url = new URL(req.url);
    const org_id = url.searchParams.get('org_id');
    const email  = url.searchParams.get('email');

    if (!org_id || !email) {
      return new Response(buildPage('Ungültiger Link', 'Der Abmelde-Link ist ungültig oder abgelaufen.', false), {
        status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // Prüfen ob bereits abgemeldet
    const existing = await base44.asServiceRole.entities.OrganizationSettings.filter({
      organization_id: org_id, key: 'engagement_emails_unsubscribed'
    });

    if (existing[0]?.value === 'true') {
      return new Response(buildPage('Bereits abgemeldet', `Die E-Mail-Adresse <strong>${email}</strong> ist bereits von automatischen Erinnerungen abgemeldet.`, true), {
        status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    // Abmeldung speichern
    if (existing[0]) {
      await base44.asServiceRole.entities.OrganizationSettings.update(existing[0].id, { value: 'true' });
    } else {
      await base44.asServiceRole.entities.OrganizationSettings.create({
        organization_id: org_id,
        key: 'engagement_emails_unsubscribed',
        value: 'true',
        description: `Abgemeldet von automatischen Engagement-E-Mails (${email}) am ${new Date().toISOString()}`
      });
    }

    console.log(`[unsubscribeEngagementEmails] org=${org_id} email=${email} unsubscribed`);

    return new Response(buildPage('Erfolgreich abgemeldet', `Du wirst von <strong>${email}</strong> keine automatischen Erinnerungs-E-Mails mehr erhalten.`, true), {
      status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });

  } catch (error) {
    console.error('[unsubscribeEngagementEmails] Error:', error.message);
    return new Response(buildPage('Fehler', 'Es ist ein Fehler aufgetreten. Bitte versuche es erneut.', false), {
      status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
});

function buildPage(title, message, success) {
  const icon = success ? '✅' : '❌';
  const color = success ? '#16a34a' : '#dc2626';
  return `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title} – Vertriebo</title>
  <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;background:#f1f5f9;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}</style>
  </head><body>
  <div style="background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.10);padding:48px 40px;max-width:460px;width:100%;text-align:center;">
    <div style="font-size:52px;margin-bottom:16px;">${icon}</div>
    <h1 style="font-size:22px;font-weight:900;color:#111827;margin-bottom:12px;">${title}</h1>
    <p style="font-size:14px;color:#6b7280;line-height:1.6;margin-bottom:28px;">${message}</p>
    ${success ? '<p style="font-size:12px;color:#9ca3af;">Du kannst diese Einstellung jederzeit in deinen Vertriebo-Einstellungen ändern.</p>' : ''}
    <a href="https://app.vertriebo.de" style="display:inline-block;margin-top:24px;background:#2563eb;color:#fff;font-weight:700;font-size:14px;text-decoration:none;padding:12px 28px;border-radius:8px;">Zurück zu Vertriebo</a>
  </div>
  </body></html>`;
}