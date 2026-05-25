import { createClientFromRequest } from 'npm:@base44/sdk@0.8.30';

/**
 * MIGRATION FUNCTION – Phase 1
 * Weist alle bestehenden Datensätze der Legacy-Organisation zu.
 * Kann in Etappen aufgerufen werden (offset + limit).
 * NUR von admin aufrufbar.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    // entity to migrate, offset, limit per run
    const entityName = body.entity || 'Company';
    const batchSize = body.batchSize || 20;
    const offset = body.offset || 0;
    const ORG_ID = body.org_id || '69fb1aa4a7c4e1aa66807541';

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    // Fetch a slice of records
    const all = await base44.asServiceRole.entities[entityName].list('-created_date', batchSize + offset);
    const slice = all.slice(offset, offset + batchSize);

    const toMigrate = slice.filter(i => !i.organization_id);
    let migrated = 0;
    let skipped = 0;

    for (let i = 0; i < toMigrate.length; i++) {
      await base44.asServiceRole.entities[entityName].update(toMigrate[i].id, { organization_id: ORG_ID });
      migrated++;
      if (i > 0 && i % 3 === 0) await sleep(800);
    }

    skipped = slice.length - toMigrate.length;

    return Response.json({
      success: true,
      entity: entityName,
      offset,
      batch_size: batchSize,
      in_batch: slice.length,
      migrated,
      skipped,
      done: slice.length < batchSize, // true = no more records
    });

  } catch (error) {
    console.error('Migration error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});