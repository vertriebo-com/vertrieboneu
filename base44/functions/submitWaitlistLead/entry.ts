import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }

  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    // Honeypot: wenn website_hidden befüllt → stiller Erfolg (Spam)
    if (body.website_hidden && body.website_hidden.trim() !== '') {
      return Response.json({ success: true, message: 'Danke! Wir melden uns bei Ihnen.' });
    }

    const { name, email, company_name, phone, industry, company_size, message, source_page, utm_source, utm_campaign, consent_accepted } = body;

    // Validierung
    if (!email || typeof email !== 'string') {
      return Response.json({ success: false, error: 'E-Mail ist erforderlich.' }, { status: 400 });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return Response.json({ success: false, error: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.' }, { status: 400 });
    }
    if (!consent_accepted) {
      return Response.json({ success: false, error: 'Bitte akzeptieren Sie die Einwilligung.' }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Dedupe: prüfen ob Email bereits existiert
    const existing = await base44.asServiceRole.entities.WaitlistLead.filter({ email: normalizedEmail });
    if (existing && existing.length > 0) {
      // Bereits vorhanden → einfach success zurückgeben, kein Duplikat erstellen
      console.log(`[submitWaitlistLead] Duplicate email skipped: ${normalizedEmail}`);
      return Response.json({ success: true, message: 'Danke! Wir melden uns, sobald Vertriebo für neue Kunden geöffnet wird.' });
    }

    // Neuen Lead speichern
    await base44.asServiceRole.entities.WaitlistLead.create({
      name: name?.trim() || '',
      email: normalizedEmail,
      company_name: company_name?.trim() || '',
      phone: phone?.trim() || '',
      industry: industry?.trim() || '',
      company_size: company_size?.trim() || '',
      message: message?.trim() || '',
      source_page: source_page || '/landing',
      utm_source: utm_source || '',
      utm_campaign: utm_campaign || '',
      consent_accepted: true,
      status: 'new',
    });

    console.log(`[submitWaitlistLead] New waitlist lead saved: ${normalizedEmail}`);
    return Response.json({ success: true, message: 'Danke! Wir melden uns, sobald Vertriebo für neue Kunden geöffnet wird.' });

  } catch (error) {
    console.error('[submitWaitlistLead] Error:', error.message);
    return Response.json({ success: false, error: 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.' }, { status: 500 });
  }
});