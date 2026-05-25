import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';
import Stripe from 'npm:stripe@14.21.0';

// One-time utility: renames Stripe products to "Vertriebo <PlanName>"
// Admin only.

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

const PRODUCT_RENAMES = [
  { id: 'prod_UT5f8AuvWP7NN9', name: 'Vertriebo Starter' },
  { id: 'prod_UT5fKDNYkHuwcM', name: 'Vertriebo Professional' },
  { id: 'prod_UT5fWq2gCCaFgB', name: 'Vertriebo Gold' },
  { id: 'prod_UT5faHZrXDuWpc', name: 'Vertriebo Agency' },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const results = [];
    for (const p of PRODUCT_RENAMES) {
      const updated = await stripe.products.update(p.id, { name: p.name });
      results.push({ id: p.id, name: updated.name, ok: true });
      console.info(`[renameStripeProducts] Renamed ${p.id} → ${updated.name}`);
    }

    return Response.json({ success: true, results });
  } catch (error) {
    console.error('[renameStripeProducts] Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});