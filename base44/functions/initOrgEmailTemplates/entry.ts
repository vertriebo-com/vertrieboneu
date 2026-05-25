// ═══════════════════════════════════════════════════════════════════════════════
// initOrgEmailTemplates — Erstellt 6 personalisierte E-Mail-Vorlagen pro Organisation
//
// ── ARCHITEKTUR (mandantenfähig) ─────────────────────────────────────────────
//   Jede Vorlage trägt organization_id → strikte Isolation zwischen Mandanten.
//   Idempotent: Vorlagen werden nur erstellt, wenn sie noch nicht existieren.
//
// ── DATENBASIS PRO VORLAGE ───────────────────────────────────────────────────
//   OrganizationSettings Keys die verwendet werden:
//     company_name       → Firmenname
//     email_from_name    → Absendername
//     industry_name      → Branche
//     email_telefon      → Telefon für CTA + Signatur
//     email_reply_to     → E-Mail in Signatur
//     email_website      → Website in Signatur
//     email_adresse      → Adresse in Signatur
//     organization_email_signature → fertige HTML-Signatur (gespeichert bei Onboarding)
//     lead_plz_city      → Region (für Erstansprache)
//
// ── SKALIERUNG & ERWEITERUNG ─────────────────────────────────────────────────
//   Phase 1 (JETZT):  Brevo zentral + org-spezifischer fromName/replyTo/Logo
//   Phase 2 (LATER):  SMTP pro Org: smtp_host, smtp_user, smtp_pass in OrganizationSettings
//   Phase 3 (LATER):  Gmail OAuth  via app-user connector (integration_type: "gmail")
//   Phase 4 (LATER):  MS365 OAuth  via app-user connector (integration_type: "outlook")
//   Phase 5 (LATER):  Automatische Follow-up-Agenten via entity-automation (ContactLog create)
//   Phase 6 (LATER):  E-Mail-Antworten → Inbound Webhook → ContactLog + company_id matching
//   Phase 7 (LATER):  Queue-/Batch-Versand → UsageLog rate limiting + job queue entity
//
// ── CROSS-TENANT SICHERHEIT ──────────────────────────────────────────────────
//   EmailTemplate.filter({ organization_id }) = strikte Isolation.
//   SendEmailDialog lädt NUR Vorlagen der eigenen Org.
//   Kein globaler list()-Aufruf in der gesamten Template-Pipeline.
// ═══════════════════════════════════════════════════════════════════════════════

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { organization_id } = body;
    if (!organization_id) return Response.json({ error: 'organization_id required' }, { status: 400 });

    // Verify membership (platform_admin bypasses check)
    if (user.role !== 'admin') {
      const members = await base44.entities.OrganizationMember.filter({ organization_id, user_email: user.email });
      if (!members?.[0]) return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Load org settings
    const settingsList = await base44.entities.OrganizationSettings.filter({ organization_id });
    const s = {};
    settingsList.forEach(x => { s[x.key] = x.value; });

    const firmenname = s.company_name || s.lead_plz_city || "Ihr Unternehmen";
    const absendername = s.email_from_name || user.full_name || "Ihr Team";
    const branche = s.industry_name || "Dienstleistung";
    const telefon = s.email_telefon || "";
    const email = s.email_reply_to || user.email;
    const website = s.email_website || "";
    const adresse = s.email_adresse || "";
    const region = s.lead_plz_city || "";
    const signatur = s.organization_email_signature || buildDefaultSignature({ firmenname, absendername, telefon, email, website, adresse });

    const greetingLine = (c) =>
      `Sehr geehrte${c?.ansprechpartner ? " " + c.ansprechpartner : " Damen und Herren"},`;

    const signBlock = `<br/><br/>${signatur}`;

    const templates = [
      {
        name: "Erstansprache",
        betreff: `${firmenname} – Unverbindliche Vorstellung`,
        body: buildErstansprache({ firmenname, absendername, branche, region, signBlock }),
        typ: "Erstansprache",
        is_default: true,
      },
      {
        name: "Nachfassen",
        betreff: `Kurzfrage zu unserem letzten Kontakt`,
        body: buildNachfassen({ firmenname, absendername, signBlock }),
        typ: "Nachfassen",
        is_default: true,
      },
      {
        name: "Angebot nachfassen",
        betreff: `Ihr Angebot von ${firmenname} – Haben Sie noch Fragen?`,
        body: buildAngebotNachfassen({ firmenname, absendername, signBlock }),
        typ: "Nachfassen",
        is_default: true,
      },
      {
        name: "Terminbestätigung",
        betreff: `Ihr Termin mit ${firmenname} – Bestätigung`,
        body: buildTerminBestaetigung({ firmenname, absendername, telefon, signBlock }),
        typ: "Termin",
        is_default: true,
      },
      {
        name: "Rückruf-Erinnerung",
        betreff: `Ihr Rückruf-Termin mit ${firmenname}`,
        body: buildRueckruf({ firmenname, absendername, telefon, signBlock }),
        typ: "Rückruf",
        is_default: true,
      },
      {
        name: "Kein Interesse / später melden",
        betreff: `Kein Problem – wir melden uns später`,
        body: buildKeinInteresse({ firmenname, absendername, signBlock }),
        typ: "Sonstiges",
        is_default: true,
      },
    ];

    // Only create if not yet existing (avoid duplicates on re-run)
    const existing = await base44.entities.EmailTemplate.filter({ organization_id });
    const existingNames = new Set(existing.map(t => t.name));

    const created = [];
    for (const tpl of templates) {
      if (!existingNames.has(tpl.name)) {
        const t = await base44.entities.EmailTemplate.create({ organization_id, ...tpl });
        created.push(t.name);
      }
    }

    return Response.json({ success: true, created, skipped: templates.length - created.length });
  } catch (error) {
    console.error('initOrgEmailTemplates error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

// ─── Default Signature Builder ────────────────────────────────────────────────
function buildDefaultSignature({ firmenname, absendername, telefon, email, website, adresse }) {
  return `<table cellpadding="0" cellspacing="0" style="margin-top:24px;border-top:2px solid #e5e7eb;padding-top:16px;width:100%;">
  <tr>
    <td style="vertical-align:top;">
      <div style="font-size:14px;font-weight:900;color:#1d4ed8;">${absendername}</div>
      <div style="font-size:12px;color:#374151;font-weight:600;">${firmenname}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:6px;line-height:2.0;">
        ${adresse ? adresse + "<br/>" : ""}
        ${telefon ? `📞 <a href="tel:${telefon}" style="color:#1d4ed8;text-decoration:none;font-weight:700;">${telefon}</a><br/>` : ""}
        ✉️ <a href="mailto:${email}" style="color:#1d4ed8;text-decoration:none;">${email}</a>
        ${website ? `<br/>🌐 <a href="${website.startsWith("http") ? website : "https://" + website}" style="color:#1d4ed8;text-decoration:none;">${website}</a>` : ""}
      </div>
    </td>
  </tr>
</table>`;
}

// ─── Template Builders ────────────────────────────────────────────────────────
function buildErstansprache({ firmenname, absendername, branche, region, signBlock }) {
  return `<p style="margin:0 0 18px;font-size:15px;font-weight:700;color:#111827;">Sehr geehrte Damen und Herren,</p>

<p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.8;">
  mein Name ist <strong>${absendername}</strong> von <strong>${firmenname}</strong>. Wir sind Ihr regionaler Partner für professionelle ${branche}-Dienstleistungen${region ? " im Raum " + region : ""}.
</p>

<div style="background:linear-gradient(135deg,#eff6ff,#dbeafe);border-radius:14px;padding:20px 24px;margin:0 0 20px;">
  <div style="font-size:13px;font-weight:800;color:#1e3a8a;margin-bottom:12px;">Was wir Ihnen bieten:</div>
  <table cellpadding="0" cellspacing="0" width="100%">
    <tr><td style="padding:6px 0;font-size:13px;color:#374151;">✅ &nbsp;Professionelle, zuverlässige Durchführung</td></tr>
    <tr><td style="padding:6px 0;font-size:13px;color:#374151;">✅ &nbsp;Faire, transparente Preise</td></tr>
    <tr><td style="padding:6px 0;font-size:13px;color:#374151;">✅ &nbsp;Persönlicher Ansprechpartner</td></tr>
    <tr><td style="padding:6px 0;font-size:13px;color:#374151;">✅ &nbsp;Kurzfristige Verfügbarkeit</td></tr>
  </table>
</div>

<p style="margin:0 0 8px;font-size:14px;color:#374151;">Darf ich Ihnen ein <strong>kostenloses, unverbindliches Angebot</strong> unterbreiten? Ich würde mich über ein kurzes Gespräch freuen.</p>

${signBlock}`;
}

function buildNachfassen({ firmenname, absendername, signBlock }) {
  return `<p style="margin:0 0 18px;font-size:15px;font-weight:700;color:#111827;">Sehr geehrte Damen und Herren,</p>

<p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.8;">
  ich melde mich kurz im Nachgang zu unserem letzten Kontakt. Ich wollte fragen, ob Sie inzwischen Gelegenheit hatten, über unser Angebot nachzudenken.
</p>

<p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.8;">
  Falls Sie noch Fragen haben oder etwas anpassen möchten – ich stehe Ihnen gerne zur Verfügung. Ein kurzes Gespräch genügt oft, um alle offenen Punkte zu klären.
</p>

<div style="background:#f0fdf4;border-radius:12px;padding:16px 20px;margin:0 0 20px;">
  <p style="margin:0;font-size:13px;color:#15803d;font-weight:600;">Kein Aufwand für Sie – wir erledigen alles so einfach wie möglich.</p>
</div>

${signBlock}`;
}

function buildAngebotNachfassen({ firmenname, absendername, signBlock }) {
  return `<p style="margin:0 0 18px;font-size:15px;font-weight:700;color:#111827;">Sehr geehrte Damen und Herren,</p>

<p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.8;">
  ich melde mich bezüglich des Angebots, das ich Ihnen kürzlich von <strong>${firmenname}</strong> übermittelt habe. Haben Sie es bereits prüfen können?
</p>

<div style="background:#eff6ff;border-radius:14px;padding:18px 22px;margin:0 0 20px;">
  <div style="font-size:13px;font-weight:800;color:#1e3a8a;margin-bottom:10px;">Unser Angebot auf einen Blick:</div>
  <table cellpadding="0" cellspacing="0" width="100%">
    <tr><td style="padding:6px 0;font-size:13px;color:#374151;">💡 &nbsp;Individuelle Lösung nach Ihrem Bedarf</td></tr>
    <tr><td style="padding:6px 0;font-size:13px;color:#374151;">💶 &nbsp;Faire, transparente Preise</td></tr>
    <tr><td style="padding:6px 0;font-size:13px;color:#374151;">🤝 &nbsp;Persönlicher Service & fester Ansprechpartner</td></tr>
  </table>
</div>

<div style="background:#fefce8;border:1px solid #fde68a;border-radius:12px;padding:14px 18px;margin:0 0 20px;text-align:center;">
  <p style="margin:0;font-size:13px;color:#b45309;font-weight:700;">⏰ Unser Angebot gilt noch für <strong>14 Tage</strong></p>
</div>

<p style="margin:0;font-size:14px;color:#374151;">Haben Sie Fragen oder möchten etwas anpassen? Melden Sie sich gerne – vollkommen unverbindlich.</p>

${signBlock}`;
}

function buildTerminBestaetigung({ firmenname, absendername, telefon, signBlock }) {
  return `<p style="margin:0 0 18px;font-size:15px;font-weight:700;color:#111827;">Sehr geehrte Damen und Herren,</p>

<p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.8;">
  vielen Dank für Ihre Zeit – wir freuen uns auf unser gemeinsames Gespräch! Hiermit bestätigen wir Ihren Termin mit <strong>${firmenname}</strong>.
</p>

<div style="background:linear-gradient(135deg,#1d4ed8,#1e40af);border-radius:16px;padding:24px;margin:0 0 22px;text-align:center;">
  <div style="font-size:13px;font-weight:700;color:#93c5fd;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px;">Ihr Termin</div>
  <div style="font-size:20px;font-weight:900;color:#ffffff;">📅 Datum &amp; Uhrzeit folgen separat</div>
</div>

<p style="margin:0 0 8px;font-size:14px;color:#374151;">Sollten Sie den Termin verschieben müssen, erreichen Sie uns jederzeit:${telefon ? `<br/><strong style="color:#1d4ed8;">📞 ${telefon}</strong>` : ""}</p>

${signBlock}`;
}

function buildRueckruf({ firmenname, absendername, telefon, signBlock }) {
  return `<p style="margin:0 0 18px;font-size:15px;font-weight:700;color:#111827;">Sehr geehrte Damen und Herren,</p>

<p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.8;">
  vielen Dank für das nette Gespräch! Wie vereinbart, werden wir uns zum vereinbarten Zeitpunkt bei Ihnen melden.
</p>

<div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1px solid #86efac;border-radius:16px;padding:24px;margin:0 0 22px;text-align:center;">
  <div style="font-size:36px;margin-bottom:8px;">📞</div>
  <div style="font-size:12px;color:#16a34a;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Ihr Rückruf-Termin</div>
  <div style="font-size:16px;color:#15803d;font-weight:700;">Datum &amp; Uhrzeit wie vereinbart</div>
  <div style="margin-top:12px;font-size:12px;color:#15803d;">Wir rufen Sie pünktlich an ✅</div>
</div>

${telefon ? `<p style="margin:0;font-size:14px;color:#374151;">Bei Fragen oder zum Verschieben: <strong style="color:#1d4ed8;">📞 ${telefon}</strong></p>` : ""}

${signBlock}`;
}

function buildKeinInteresse({ firmenname, absendername, signBlock }) {
  return `<p style="margin:0 0 18px;font-size:15px;font-weight:700;color:#111827;">Sehr geehrte Damen und Herren,</p>

<p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.8;">
  vielen Dank für Ihre Rückmeldung – wir respektieren Ihre Entscheidung vollkommen.
</p>

<div style="background:#f8fafc;border-left:4px solid #1d4ed8;border-radius:0 12px 12px 0;padding:16px 20px;margin:0 0 20px;">
  <p style="margin:0;font-size:13px;color:#374151;line-height:1.8;">
    Falls sich Ihr Bedarf in der Zukunft ändert oder Sie Fragen zu unseren Leistungen haben, stehen wir jederzeit gerne zur Verfügung. <strong>${firmenname}</strong> ist immer für Sie da.
  </p>
</div>

<p style="margin:0;font-size:13px;color:#6b7280;">Wir wünschen Ihnen alles Gute und viel Erfolg in Ihrem Geschäft!</p>

${signBlock}`;
}