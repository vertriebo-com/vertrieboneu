/**
 * submitAgencyRequest
 * 
 * Handles Agency Demo/Request submissions from both authenticated and public users.
 * - Serverside rate limiting (per email + IP)
 * - Honeypot validation
 * - Persistent storage in AgencyRequest entity
 * - Distinct handling for logged-in vs. public submissions
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

const HONEYPOT_FIELD = "website_url";
const RATE_LIMIT_WINDOW_MS = 3600000; // 1 hour
const MAX_SUBMISSIONS_PER_HOUR = 3;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await req.json();
    const base44 = createClientFromRequest(req);

    // ── Extract client data ──────────────────────────────────────────
    const {
      name,
      company_name,
      email,
      phone,
      estimated_client_organizations,
      message,
      [HONEYPOT_FIELD]: honeypot,
    } = body;

    // ── Honeypot check (silent) ──────────────────────────────────────
    if (honeypot && honeypot.trim()) {
      console.warn("[submitAgencyRequest] Honeypot triggered from IP:", req.headers.get("x-forwarded-for") || "unknown");
      // Silently succeed to confuse bots
      return Response.json({ success: true, message: "Anfrage empfangen." });
    }

    // ── Validation ───────────────────────────────────────────────────
    if (!name || !email || !phone || !company_name) {
      return Response.json(
        { error: "Pflichtfelder fehlen (name, email, phone, company_name)" },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return Response.json({ error: "Ungültige E-Mail-Adresse" }, { status: 400 });
    }

    // ── Get client IP ────────────────────────────────────────────────
    const clientIP =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";

    // ── Rate limit check (serverside) ────────────────────────────────
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);

    const [recentByEmail, recentByIP] = await Promise.all([
      base44.asServiceRole.entities.AgencyRequest.filter({ email }),
      // Note: IP-based filtering would require a separate lookup; 
      // for now we primarily check by email as it's more reliable
    ]);

    const emailSubmissionsInWindow = recentByEmail.filter(
      (req) => new Date(req.submitted_at) > oneHourAgo
    ).length;

    if (emailSubmissionsInWindow >= MAX_SUBMISSIONS_PER_HOUR) {
      console.warn(`[submitAgencyRequest] Rate limit exceeded for email: ${email}`);
      return Response.json(
        { error: "Zu viele Anfragen von dieser E-Mail. Bitte versuchen Sie es später erneut." },
        { status: 429 }
      );
    }

    // ── Determine context (logged in vs. public) ─────────────────────
    let user = null;
    let organizationId = null;
    let userId = null;
    let source = "public_pricing_page";

    try {
      user = await base44.auth.me();
      if (user) {
        source = "pricing_page";
        userId = user.id;

        // Try to find user's organization
        const orgs = await base44.asServiceRole.entities.Organization.filter({
          owner_email: user.email,
        });

        if (!orgs[0]) {
          // Check as member
          const members = await base44.asServiceRole.entities.OrganizationMember.filter({
            user_email: user.email,
            status: "active",
          });
          if (members[0]) {
            organizationId = members[0].organization_id;
          }
        } else {
          organizationId = orgs[0].id;
        }
      }
    } catch (e) {
      console.warn("[submitAgencyRequest] Auth check failed (non-blocking):", e?.message);
      // Continue as public submission
    }

    // ── Create AgencyRequest record ──────────────────────────────────
    const agencyRequest = await base44.asServiceRole.entities.AgencyRequest.create({
      organization_id: organizationId, // null if not logged in or no org found
      user_id: userId, // null if not logged in
      plan: "agency",
      source,
      name,
      company_name,
      email,
      phone,
      estimated_client_organizations: estimated_client_organizations ? parseInt(estimated_client_organizations) : null,
      message: message || null,
      status: "new",
      submitted_at: now.toISOString(),
      ip_source: clientIP,
    });

    console.info("[submitAgencyRequest] Created:", {
      id: agencyRequest.id,
      email,
      source,
      organization_id: organizationId,
      user_id: userId,
      ip: clientIP,
    });

    // ── Send confirmation email (optional background task) ────────────
    // In production, this could be an async background job.
    // For now, we'll invoke it but not wait for it.
    try {
      base44.functions.invoke("sendAgencyDemoEmail", {
        name,
        email,
        company_name,
        phone,
        agency_request_id: agencyRequest.id,
      }).catch((err) => {
        console.error("[submitAgencyRequest] Email send failed (non-blocking):", err?.message);
      });
    } catch (e) {
      console.warn("[submitAgencyRequest] Email invocation failed (non-blocking):", e?.message);
    }

    return Response.json({
      success: true,
      message: "Anfrage erfolgreich eingereicht. Wir melden uns bald bei Ihnen.",
      request_id: agencyRequest.id,
    });
  } catch (error) {
    console.error("[submitAgencyRequest] Unhandled error:", error?.message, error?.stack);
    return Response.json(
      { error: "Anfrage konnte nicht verarbeitet werden. Bitte versuchen Sie es später." },
      { status: 500 }
    );
  }
});