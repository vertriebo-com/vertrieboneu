/**
 * provenance.js
 * =============
 * Hilfsfunktionen für Company.provenance_json.
 *
 * Übergangsfeld für Lead-Datenprovenance (Phase 1).
 * Langfristig nach Supabase in eigene Tabelle lead_provenance migrierbar:
 *   future table: lead_provenance(organization_id, company_id, field_name,
 *     source_type, source_function, confidence, review_status, created_at, created_by)
 *
 * SOURCE_TYPES:
 *   google_places  – direkt aus Google Places API (zuverlässig, verifiziert)
 *   enrichment     – KI-Recherche via enrichCompany (ungeprüft)
 *   manual         – manuell vom Nutzer eingetragen
 *   import         – CSV- oder API-Import
 *   unknown        – Herkunft unbekannt (Altdaten)
 */

export const SOURCE_TYPES = {
  GOOGLE_PLACES: 'google_places',
  ENRICHMENT: 'enrichment',
  MANUAL: 'manual',
  IMPORT: 'import',
  UNKNOWN: 'unknown',
};

export const CONFIDENCE = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
};

export const REVIEW_STATUS = {
  UNREVIEWED: 'unreviewed',
  CONFIRMED: 'confirmed',
  REJECTED: 'rejected',
  OVERWRITTEN: 'overwritten',
};

/**
 * Labels für UI-Anzeige
 */
export const SOURCE_LABELS = {
  google_places: 'Google Places',
  enrichment: 'KI-Recherche',
  manual: 'Manuell',
  import: 'Import',
  unknown: 'Unbekannt',
};

export const SOURCE_COLORS = {
  google_places: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  enrichment:    { bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
  manual:        { bg: 'bg-slate-100',  text: 'text-slate-600',   border: 'border-slate-200' },
  import:        { bg: 'bg-blue-50',    text: 'text-blue-600',    border: 'border-blue-200' },
  unknown:       { bg: 'bg-slate-100',  text: 'text-slate-400',   border: 'border-slate-200' },
};

/**
 * provenance_json parsen (safe)
 */
export function parseProvenance(company) {
  if (!company?.provenance_json) return { fields: {} };
  try {
    const parsed = typeof company.provenance_json === 'string'
      ? JSON.parse(company.provenance_json)
      : company.provenance_json;
    return parsed?.fields ? parsed : { fields: {} };
  } catch {
    return { fields: {} };
  }
}

/**
 * Provenance für ein einzelnes Feld auslesen
 * @param {object} company - Company-Objekt
 * @param {string} fieldKey - 'phone' | 'email' | 'website' | 'contact_person' | 'address'
 * @returns {{ source_type, source_function, confidence, review_status, updated_at, updated_by } | null}
 */
export function getFieldProvenance(company, fieldKey) {
  const prov = parseProvenance(company);
  return prov.fields?.[fieldKey] || null;
}

/**
 * Prüft ob ein Feld als "ungeprüft aus KI/Enrichment" gilt
 */
export function isUnreviewedEnrichment(company, fieldKey) {
  const p = getFieldProvenance(company, fieldKey);
  if (!p) return false;
  return p.source_type === SOURCE_TYPES.ENRICHMENT && p.review_status !== REVIEW_STATUS.CONFIRMED;
}

/**
 * Baut das initiale provenance_json für processResearchRun (Google Places).
 * Nur Felder die tatsächlich befüllt wurden.
 */
export function buildResearchProvenance({ hasPhone, hasWebsite, hasAddress, userEmail }) {
  const now = new Date().toISOString();
  const base = {
    source_type: SOURCE_TYPES.GOOGLE_PLACES,
    source_function: 'processResearchRun',
    confidence: CONFIDENCE.HIGH,
    review_status: REVIEW_STATUS.CONFIRMED,
    updated_at: now,
    updated_by: userEmail || 'system',
  };
  const fields = {};
  if (hasPhone)   fields.phone           = { ...base };
  if (hasWebsite) fields.website         = { ...base };
  if (hasAddress) fields.address         = { ...base };
  // name/branche/ort/plz immer von Google Places
  fields.name    = { ...base };
  fields.address = { ...base, confidence: CONFIDENCE.HIGH };
  return JSON.stringify({ fields });
}

/**
 * Baut das provenance_json-Update für enrichCompany.
 * Merged mit bestehendem provenance_json — alte Werte bleiben erhalten.
 * @param {string|null} existingProvenanceJson - vorhandenes provenance_json
 * @param {object} updatedFields - { website: true, phone: true, ... }
 * @param {string} userEmail
 */
export function buildEnrichmentProvenance(existingProvenanceJson, updatedFields, userEmail) {
  const existing = (() => {
    try { return JSON.parse(existingProvenanceJson || '{}'); } catch { return {}; }
  })();
  const fields = existing.fields || {};
  const now = new Date().toISOString();

  const fieldMap = {
    website:      'website',
    telefon:      'phone',
    email:        'email',
    ansprechpartner: 'contact_person',
    adresse:      'address',
  };

  // email + ansprechpartner sind schwer verifizierbar → 'low'
  const FIELD_CONFIDENCE = {
    website: CONFIDENCE.MEDIUM,
    telefon: CONFIDENCE.MEDIUM,
    email: CONFIDENCE.LOW,
    ansprechpartner: CONFIDENCE.LOW,
    adresse: CONFIDENCE.MEDIUM,
  };

  for (const [apiField, provenanceKey] of Object.entries(fieldMap)) {
    if (!updatedFields[apiField]) continue;
    // Vorherige Provenance aufbewahren
    const previousSource = fields[provenanceKey]?.source_type || null;
    const previousValue = updatedFields[`_prev_${apiField}`] || null;
    const evidenceUrl = updatedFields['_evidence_url'] || null;
    fields[provenanceKey] = {
      source_type: SOURCE_TYPES.ENRICHMENT,
      source_function: 'enrichCompany',
      confidence: FIELD_CONFIDENCE[apiField] || CONFIDENCE.LOW,
      review_status: REVIEW_STATUS.UNREVIEWED,
      updated_at: now,
      updated_by: userEmail || 'system',
      ...(previousSource ? { previous_source: previousSource } : {}),
      ...(previousValue ? { previous_value: previousValue } : {}),
      ...(evidenceUrl ? { evidence_url: evidenceUrl } : {}),
    };
  }

  return JSON.stringify({ fields });
}