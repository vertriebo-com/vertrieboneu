import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { name, email, company_name, role, message, consent_accepted, website_hidden, source_page } = body;

    // Honeypot spam check
    if (website_hidden && website_hidden.trim() !== "") {
      return Response.json({ success: true }); // silently ignore bots
    }

    // Validate required fields
    if (!name || !email || !consent_accepted) {
      return Response.json({ success: false, error: "Pflichtfelder fehlen." }, { status: 400 });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return Response.json({ success: false, error: "Ungültige E-Mail-Adresse." }, { status: 400 });
    }

    // Dedupe by email
    const existing = await base44.asServiceRole.entities.InvestorInquiry.filter({ email: email.toLowerCase().trim() });
    if (existing && existing.length > 0) {
      return Response.json({ success: true, dedupe: true }); // silently accept, don't reveal
    }

    // Save inquiry
    await base44.asServiceRole.entities.InvestorInquiry.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      company_name: company_name?.trim() || "",
      role: role || "Investor",
      message: message?.trim() || "",
      consent_accepted: true,
      status: "new",
      source_page: source_page || "/investors",
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error("[submitInvestorInquiry] Error:", error.message);
    return Response.json({ success: false, error: "Interner Fehler. Bitte erneut versuchen." }, { status: 500 });
  }
});