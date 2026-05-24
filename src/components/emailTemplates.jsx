// Dynamic email templates – built from OrganizationSettings at runtime.
// The TEMPLATES array (static fallback) is only used when no org-specific
// EmailTemplate records exist yet (e.g. legacy accounts).

// ─── Signature builder (shared) ──────────────────────────────────────────────
export function buildSignature({ firmenname, absendername, telefon, email, website, adresse } = {}) {
  const fn = firmenname || "Ihr Unternehmen";
  const an = absendername || fn;
  return `<table cellpadding="0" cellspacing="0" style="margin-top:28px;border-top:2px solid #e5e7eb;padding-top:18px;width:100%;">
  <tr>
    <td style="vertical-align:top;">
      <div style="font-size:14px;font-weight:900;color:#1d4ed8;">${an}</div>
      <div style="font-size:12px;color:#374151;font-weight:600;">${fn}</div>
      <div style="font-size:12px;color:#6b7280;margin-top:6px;line-height:2.0;">
        ${adresse ? adresse + "<br/>" : ""}
        ${telefon ? `📞 <a href="tel:${telefon.replace(/\s/g,'')}" style="color:#1d4ed8;text-decoration:none;font-weight:700;">${telefon}</a><br/>` : ""}
        ${email ? `✉️ <a href="mailto:${email}" style="color:#1d4ed8;text-decoration:none;">${email}</a>` : ""}
        ${website ? `<br/>🌐 <a href="${website.startsWith("http") ? website : "https://" + website}" style="color:#1d4ed8;text-decoration:none;">${website}</a>` : ""}
      </div>
    </td>
  </tr>
</table>`;
}

// ─── CTA Button helper ────────────────────────────────────────────────────────
export const CTA_BUTTON = (label = "Jetzt kostenlos anfragen", telefon = "") => `
<div style="text-align:center;margin:24px 0;">
  ${telefon
    ? `<a href="tel:${telefon.replace(/\s/g,'')}" style="display:inline-block;background:linear-gradient(135deg,#1d4ed8,#1e40af);color:#ffffff;font-size:15px;font-weight:800;text-decoration:none;padding:13px 32px;border-radius:50px;box-shadow:0 4px 14px rgba(29,78,216,0.35);">${label}</a>`
    : `<span style="display:inline-block;background:linear-gradient(135deg,#1d4ed8,#1e40af);color:#ffffff;font-size:15px;font-weight:800;padding:13px 32px;border-radius:50px;">${label}</span>`
  }
  <div style="margin-top:8px;font-size:11px;color:#9ca3af;">Unverbindlich · Kostenlos · Innerhalb von 24h</div>
</div>`;

// ─── Context helpers for industry-specific fallback templates ─────────────────
// c = company object, extra = { notiz, datum, uhrzeit, orgSettings? }
function getOrgServices(extra) {
  const s = extra?.orgSettings?.services || extra?.orgSettings?.dienstleistungen || '';
  return s ? s.split(',')[0].trim() : null;
}
function getLeadType(c) {
  return c?.matched_target_customer_type || c?.branche || null;
}
function getServiceContext(c) {
  return c?.matched_service_context || null;
}

// ─── Logo Header helper ───────────────────────────────────────────────────────
export function buildLogoHeader(logoUrl) {
  if (!logoUrl) return "";
  return `<div style="text-align:center;padding:20px 0 12px;">
  <img src="${logoUrl}" alt="Logo" style="max-height:56px;max-width:220px;object-fit:contain;" />
</div>`;
}

// ─── Static fallback TEMPLATES (industry-aware) ───────────────────────────────
// These are used when an org has no EmailTemplate records yet.
export const TEMPLATES = [
  {
    id: "erstansprache",
    label: "👋 Erstansprache",
    description: "Erste Kontaktaufnahme per E-Mail",
    betreff: (c) => `Kurze Vorstellung – ${c?.name || "Ihr Unternehmen"}`,
    body: (c, extra) => {
      const service = getOrgServices(extra);
      const leadType = getLeadType(c);
      const serviceCtx = getServiceContext(c);
      const serviceText = serviceCtx || service;
      const intro = serviceText && leadType
        ? `ich möchte mich kurz vorstellen – wir unterstützen <strong>${leadType}</strong> speziell beim Thema <strong>${serviceText}</strong> und fragen, ob das für Sie relevant sein könnte.`
        : serviceText
        ? `ich möchte mich kurz vorstellen und fragen, ob unser Angebot im Bereich <strong>${serviceText}</strong> für Sie passt.`
        : `ich möchte mich kurz bei Ihnen vorstellen und fragen, ob wir für Sie eine passende Dienstleistung anbieten können.`;
      return `${buildLogoHeader(extra?.orgSettings?.logoUrl)}
<p style="margin:0 0 18px;font-size:15px;font-weight:700;color:#111827;">Sehr geehrte${c?.ansprechpartner ? " " + c.ansprechpartner : " Damen und Herren"},</p>
<p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.8;">${intro}</p>
<p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.8;">
  Gerne erstellen wir Ihnen ein <strong>kostenloses, unverbindliches Angebot</strong>.
</p>
${extra?.notiz ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;margin:0 0 20px;font-size:13px;color:#374151;"><strong>📌 Hinweis:</strong> ${extra.notiz}</div>` : ""}`;
    },
  },
  {
    id: "nachfassen",
    label: "🔄 Nachfassen",
    description: "Freundlich nach letztem Kontakt nachfassen",
    betreff: (c) => `Kurze Nachfrage – ${c?.name || ""}`,
    body: (c, extra) => {
      const service = getOrgServices(extra);
      const serviceCtx = getServiceContext(c);
      const topic = serviceCtx || service;
      const topicText = topic ? ` zu unserem Angebot im Bereich <strong>${topic}</strong>` : " über unser Angebot";
      return `
<p style="margin:0 0 18px;font-size:15px;font-weight:700;color:#111827;">Sehr geehrte${c?.ansprechpartner ? " " + c.ansprechpartner : " Damen und Herren"},</p>
<p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.8;">
  ich melde mich kurz nach unserem letzten Kontakt. Hatten Sie Gelegenheit, nachzudenken${topicText}?
</p>
<p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.8;">
  Bei Fragen stehe ich Ihnen gerne zur Verfügung.
</p>
${extra?.notiz ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;margin:0 0 20px;font-size:13px;color:#374151;"><strong>📌 Notiz:</strong> ${extra.notiz}</div>` : ""}`;
    },
  },
  {
    id: "termin",
    label: "📅 Terminbestätigung",
    description: "Vereinbarten Termin bestätigen",
    hasDatum: true, hasUhrzeit: true,
    betreff: (c) => `Terminbestätigung – ${c?.name || ""}`,
    body: (c, extra) => `
<p style="margin:0 0 18px;font-size:15px;font-weight:700;color:#111827;">Sehr geehrte${c?.ansprechpartner ? " " + c.ansprechpartner : " Damen und Herren"},</p>
<p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.8;">
  hiermit bestätige ich unseren Termin:
</p>
<div style="background:linear-gradient(135deg,#1d4ed8,#1e40af);border-radius:14px;padding:22px;margin:0 0 20px;text-align:center;color:#fff;">
  <div style="font-size:20px;font-weight:900;">${extra?.datum || "Datum"} ${extra?.uhrzeit ? "um " + extra.uhrzeit + " Uhr" : ""}</div>
</div>
${extra?.notiz ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;margin:0 0 20px;font-size:13px;color:#374151;">${extra.notiz}</div>` : ""}`,
  },
  {
    id: "angebot",
    label: "📊 Angebot nachfassen",
    description: "Nach einem gesendeten Angebot nachfragen",
    hasDatum: true,
    betreff: (c) => `Ihr Angebot – Haben Sie noch Fragen?`,
    body: (c, extra) => `
<p style="margin:0 0 18px;font-size:15px;font-weight:700;color:#111827;">Sehr geehrte${c?.ansprechpartner ? " " + c.ansprechpartner : " Damen und Herren"},</p>
<p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.8;">
  ich melde mich bezüglich des Angebots${extra?.datum ? ` vom ${extra.datum}` : ""}. Haben Sie es bereits prüfen können?
</p>
<div style="background:#fefce8;border:1px solid #fde68a;border-radius:12px;padding:14px 18px;margin:0 0 20px;text-align:center;">
  <p style="margin:0;font-size:13px;color:#b45309;font-weight:700;">⏰ Unser Angebot gilt noch für <strong>14 Tage</strong></p>
</div>
${extra?.notiz ? `<div style="background:#f8fafc;border-left:4px solid #1d4ed8;border-radius:0 10px 10px 0;padding:14px 18px;margin:0 0 20px;font-size:13px;color:#374151;">${extra.notiz}</div>` : ""}`,
  },
  {
    id: "rueckruf",
    label: "📞 Rückruf bestätigen",
    description: "Rückruf-Termin schriftlich bestätigen",
    hasDatum: true, hasUhrzeit: true,
    betreff: (c) => `Ihr Rückruf-Termin – Bestätigung`,
    body: (c, extra) => `
<p style="margin:0 0 18px;font-size:15px;font-weight:700;color:#111827;">Sehr geehrte${c?.ansprechpartner ? " " + c.ansprechpartner : " Damen und Herren"},</p>
<p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.8;">
  wie vereinbart rufen wir Sie zurück:
</p>
<div style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1px solid #86efac;border-radius:14px;padding:22px;margin:0 0 20px;text-align:center;">
  <div style="font-size:36px;margin-bottom:6px;">📞</div>
  <div style="font-size:20px;font-weight:900;color:#15803d;">${extra?.datum || "Datum"} ${extra?.uhrzeit ? "um " + extra.uhrzeit + " Uhr" : ""}</div>
</div>
${extra?.notiz ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;margin:0 0 20px;font-size:13px;color:#374151;">${extra.notiz}</div>` : ""}`,
  },
  {
    id: "kein_interesse",
    label: "🤝 Kein Interesse / Später",
    description: "Respektvoll verabschieden & Tür offen lassen",
    betreff: (c) => `Kein Problem – wir melden uns später`,
    body: (c, extra) => `
<p style="margin:0 0 18px;font-size:15px;font-weight:700;color:#111827;">Sehr geehrte${c?.ansprechpartner ? " " + c.ansprechpartner : " Damen und Herren"},</p>
<p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.8;">
  vielen Dank für Ihre Rückmeldung – wir respektieren Ihre Entscheidung vollkommen.
</p>
<div style="background:#f8fafc;border-left:4px solid #1d4ed8;border-radius:0 12px 12px 0;padding:16px 20px;margin:0 0 20px;">
  <p style="margin:0;font-size:13px;color:#374151;line-height:1.8;">
    Sollte sich Ihr Bedarf in der Zukunft ändern, stehen wir Ihnen gerne zur Verfügung.
  </p>
</div>
${extra?.notiz ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;margin:0 0 20px;font-size:13px;color:#374151;">${extra.notiz}</div>` : ""}`,
  },
];

// ─── Convert DB EmailTemplate → runtime template object ───────────────────────
export function dbTemplateToRuntimeTemplate(dbTpl, signatureHtml) {
  return {
    id: dbTpl.id,
    label: `📧 ${dbTpl.name}`,
    description: dbTpl.typ || "",
    betreff: () => dbTpl.betreff || "",
    // body from DB already has the signature embedded; if not, append it
    body: (c, extra) => {
      let bodyHtml = dbTpl.body || "";
      // Replace placeholder {{ansprechpartner}} if present
      if (c?.ansprechpartner) bodyHtml = bodyHtml.replace(/\{\{ansprechpartner\}\}/g, c.ansprechpartner);
      if (c?.name) bodyHtml = bodyHtml.replace(/\{\{firmenname\}\}/g, c.name);
      if (extra?.notiz) {
        bodyHtml += `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:14px 18px;margin:16px 0 0;font-size:13px;color:#374151;"><strong>📌 Notiz:</strong> ${extra.notiz}</div>`;
      }
      return bodyHtml;
    },
    fromDb: true,
  };
}