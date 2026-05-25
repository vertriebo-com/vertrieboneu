import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

// ─── Plattform-Konstanten ─────────────────────────────────────────────────────
// WICHTIG: Nur noreply@vertriebo.com verwenden.
// Kein Fallback auf Huwa, profipreise.de oder andere Drittdomains.
const PLATFORM_FALLBACK_FROM_EMAIL = "noreply@vertriebo.com";
const PLATFORM_FALLBACK_FROM_NAME  = "Vertriebo";

// ─── Brevo: Prüfen ob Fallback-Absender verifiziert ist ──────────────────────
async function checkFallbackSenderVerified() {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  if (!apiKey) throw new Error("BREVO_API_KEY nicht konfiguriert.");

  const res = await fetch("https://api.brevo.com/v3/senders", {
    headers: { "accept": "application/json", "api-key": apiKey },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Brevo Senders-API Fehler: ${JSON.stringify(err)}`);
  }
  const data = await res.json();
  const senders = data.senders || [];
  const found = senders.find(
    s => s.email === PLATFORM_FALLBACK_FROM_EMAIL && s.active === true
  );
  return !!found;
}

// ─── Brevo: E-Mail versenden ──────────────────────────────────────────────────
async function sendViaBrevo({ to, subject, htmlBody, fromName, fromEmail, replyTo }) {
  const apiKey = Deno.env.get("BREVO_API_KEY");
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "accept": "application/json",
      "api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { name: fromName, email: fromEmail },
      to: [{ email: to }],
      subject: subject,
      htmlContent: htmlBody,
      replyTo: { email: replyTo || fromEmail, name: fromName },
    }),
  });
  const responseData = await response.json();
  if (!response.ok) {
    throw new Error(`Brevo Versand-Fehler: ${JSON.stringify(responseData)}`);
  }
  return responseData;
}

// ─── UsageLog: emails_sent inkrementieren ────────────────────────────────────
async function incrementEmailsSent(base44, organization_id) {
  const now = new Date();
  const periodMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const existing = await base44.asServiceRole.entities.UsageLog.filter({ organization_id, period_month: periodMonth });
  if (existing.length > 0) {
    const log = existing[0];
    await base44.asServiceRole.entities.UsageLog.update(log.id, {
      emails_sent: (log.emails_sent || 0) + 1,
    });
  } else {
    const periodStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString();
    const periodEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)).toISOString();
    await base44.asServiceRole.entities.UsageLog.create({
      organization_id,
      period_month: periodMonth,
      period_start: periodStart,
      period_end: periodEnd,
      emails_sent: 1,
    });
  }
}

// ─── Hauptfunktion ────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { to, subject, body, organization_id, is_test = false } = await req.json();

    if (!to || !subject || !body) {
      return Response.json({ error: "Fehlende Parameter: to, subject, body" }, { status: 400 });
    }
    if (!organization_id) {
      return Response.json({ error: "organization_id ist Pflichtparameter" }, { status: 400 });
    }

    // ── Schritt 1: Fallback-Absender auf Verfügbarkeit prüfen ────────────────
    let fallbackVerified = false;
    try {
      fallbackVerified = await checkFallbackSenderVerified();
    } catch (checkErr) {
      console.error(`[sendBrevoEmail] Absender-Check fehlgeschlagen: ${checkErr.message}`);
      return Response.json({
        error: `Absender-Check fehlgeschlagen: ${checkErr.message}`,
        hint: "Bitte Betreiber kontaktieren.",
      }, { status: 503 });
    }

    if (!fallbackVerified) {
      console.error(`[sendBrevoEmail] Fallback-Absender ${PLATFORM_FALLBACK_FROM_EMAIL} ist in Brevo nicht verifiziert.`);
      return Response.json({
        error: `Fallback-Absender ${PLATFORM_FALLBACK_FROM_EMAIL} ist in Brevo noch nicht verifiziert.`,
        hint: "System-Absender ist noch nicht eingerichtet. Bitte Betreiber kontaktieren.",
        sending_mode: "vertriebo_fallback",
        fallback_email: PLATFORM_FALLBACK_FROM_EMAIL,
      }, { status: 503 });
    }

    // ── Schritt 2: Mandantenspezifische Absenderdaten laden ──────────────────
    const orgSettings = await base44.asServiceRole.entities.OrganizationSettings.filter({ organization_id });
    const settingsMap = {};
    orgSettings.forEach(s => { settingsMap[s.key] = s.value; });

    const companyName = settingsMap["company_name"] || settingsMap["email_from_name"] || PLATFORM_FALLBACK_FROM_NAME;
    const replyToEmail = settingsMap["email_reply_to"] || settingsMap["email_sender_email"] || null;

    // ── Schritt 3: Versandlogik Phase 1 – Fallback-Modus ────────────────────
    // fromEmail = noreply@vertriebo.com (Plattform-Absender, verifiziert)
    // fromName  = "<Firmenname> über Vertriebo"
    // replyTo   = Kundenadresse (damit Antworten beim Kunden ankommen)
    const fromEmail = PLATFORM_FALLBACK_FROM_EMAIL;
    const fromName  = `${companyName} über Vertriebo`;
    const replyTo   = replyToEmail || user.email;
    const sendingMode = "vertriebo_fallback";

    // ── Schritt 4: E-Mail versenden ──────────────────────────────────────────
    const result = await sendViaBrevo({ to, subject, htmlBody: body, fromName, fromEmail, replyTo });
    console.log(`[sendBrevoEmail] Gesendet org=${organization_id} to=${to} from=${fromEmail} replyTo=${replyTo} sendingMode=${sendingMode} is_test=${is_test} messageId=${result.messageId}`);

    // ── Schritt 5: UsageLog – nur bei echten Mails (nicht Test) inkrementieren
    if (!is_test) {
      try {
        await incrementEmailsSent(base44, organization_id);
      } catch (usageErr) {
        // UsageLog-Fehler nie den E-Mail-Versand blockieren
        console.warn("[sendBrevoEmail] UsageLog update fehlgeschlagen:", usageErr.message);
      }
    } else {
      console.log(`[sendBrevoEmail] Test-Mail – UsageLog NICHT inkrementiert.`);
    }

    return Response.json({
      success: true,
      to,
      fromEmail,
      fromName,
      replyTo,
      sendingMode,
      messageId: result.messageId,
    });

  } catch (error) {
    console.error("[sendBrevoEmail] Fehler:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});