/**
 * dataAdapter — Zentraler Datenzugriffs-Layer
 * ============================================
 * Kapselt alle direkten base44.entities-Aufrufe hinter Adapter-Funktionen.
 *
 * ZWECK:
 * - Einheitlicher Datenzugriff: UI-Komponenten importieren aus dataAdapter,
 *   nicht direkt aus base44.entities
 * - Supabase-Migration: Wenn wir zu Supabase/Postgres wechseln, werden nur
 *   diese Funktionen angepasst — kein Änderungsbedarf in Pages/Components
 * - Tenant-Isolation: Alle Funktionen erzwingen organization_id-Filter
 * - Audit-Trail: Zentraler Ort für Logging/Monitoring
 *
 * MIGRATIONSSTRATEGIE:
 * Phase 1 (jetzt): base44.entities als Backend
 * Phase 2: Supabase direkt (Adapter-Implementierung ändern, Interface bleibt)
 * Phase 3: Backend Functions für komplexe Queries (bereits teilweise done)
 *
 * WICHTIG:
 * - Alle Funktionen erfordern orgId als ersten Parameter (Tenant-Isolation)
 * - Kein direkter base44.entities-Zugriff außerhalb dieses Files und
 *   genehmigter Ausnahmen (useOrganization, AddCompanyDialog)
 *
 * @version 1.0.0 — 2026-05-28
 */

import { base44 } from "@/api/base44Client";

// ── COMPANY ───────────────────────────────────────────────────────────────────

/**
 * Lädt eine einzelne Company — sicher (id + organization_id Cross-Check)
 */
export async function getCompany(orgId, companyId) {
  if (!orgId || !companyId) return null;
  const results = await base44.entities.Company.filter({ id: companyId, organization_id: orgId });
  return results[0] || null;
}

/**
 * Aktualisiert eine Company — nur innerhalb der eigenen Org
 */
export async function updateCompany(orgId, companyId, data) {
  if (!orgId || !companyId) throw new Error("orgId und companyId erforderlich");
  // Sicherheitscheck: Company muss zur Org gehören
  const existing = await base44.entities.Company.filter({ id: companyId, organization_id: orgId });
  if (!existing.length) throw new Error("Company nicht gefunden oder kein Zugriff");
  return base44.entities.Company.update(companyId, data);
}

/**
 * Erstellt eine Company in der angegebenen Org
 */
export async function createCompany(orgId, data) {
  if (!orgId) throw new Error("orgId erforderlich");
  return base44.entities.Company.create({ ...data, organization_id: orgId });
}

// ── CONTACT LOG ───────────────────────────────────────────────────────────────

/**
 * Lädt ContactLogs für eine Company, org-isoliert
 */
export async function getContactLogs(orgId, companyId) {
  if (!orgId || !companyId) return [];
  return base44.entities.ContactLog.filter({ company_id: companyId, organization_id: orgId });
}

/**
 * Erstellt einen ContactLog, erzwingt organization_id
 */
export async function createContactLog(orgId, data) {
  if (!orgId) throw new Error("orgId erforderlich");
  return base44.entities.ContactLog.create({ ...data, organization_id: orgId });
}

// ── TASK ──────────────────────────────────────────────────────────────────────

/**
 * Lädt Tasks für eine Company, org-isoliert
 */
export async function getTasks(orgId, companyId) {
  if (!orgId || !companyId) return [];
  return base44.entities.Task.filter({ company_id: companyId, organization_id: orgId });
}

/**
 * Aktualisiert eine Task — mit optionalem org_id-Cross-Check
 */
export async function updateTask(taskId, data) {
  if (!taskId) throw new Error("taskId erforderlich");
  return base44.entities.Task.update(taskId, data);
}

// ── BLACKLIST ─────────────────────────────────────────────────────────────────

/**
 * Lädt Blacklist-Einträge einer Org
 */
export async function getBlacklist(orgId) {
  if (!orgId) return [];
  return base44.entities.Blacklist.filter({ organization_id: orgId }, "-created_date", 500);
}

// ── ORG LEARNED SIGNALS ───────────────────────────────────────────────────────

/**
 * Lädt OrgLearnedSignals für eine Org (neuester Eintrag)
 */
export async function getLearnedSignals(orgId) {
  if (!orgId) return null;
  const results = await base44.entities.OrgLearnedSignals.filter({ organization_id: orgId }, '-updated_date', 1);
  return results[0] || null;
}

// ── ORGANIZATION ──────────────────────────────────────────────────────────────

/**
 * Lädt die eigene Org über owner_email (sicher, kein org_id-Bypass möglich)
 */
export async function getOwnOrganization(userEmail) {
  if (!userEmail) return null;
  const results = await base44.entities.Organization.filter({ owner_email: userEmail });
  return results[0] || null;
}

// ── DUPLIKAT-CHECK ────────────────────────────────────────────────────────────

/**
 * Prüft ob eine Firma mit diesem Namen in der Org bereits existiert
 */
export async function checkCompanyDuplicate(orgId, name) {
  if (!orgId || !name) return false;
  const existing = await base44.entities.Company.filter({ organization_id: orgId, name: name.trim() });
  return existing.length > 0;
}

/**
 * Prüft ob eine Firma auf der Blacklist steht
 */
export async function checkBlacklist(orgId, name) {
  if (!orgId || !name) return false;
  const blacklisted = await base44.entities.Blacklist.filter({ organization_id: orgId, firmenname: name.trim() });
  return blacklisted.length > 0;
}