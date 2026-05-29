# KANN-NACH-LIVE TODOs — PlatformAdmin

> Stand: 2026-05-29 — PlatformAdmin System-Test abgeschlossen, alle kritischen Pfade grün.
> **Nicht live-blockierend. Keine neuen Features vor Beta-Test.**

---

## Offene TODOs

| # | TODO | Ziel | Priorität | Aufwand |
|---|---|---|---|---|
| 1 | `member_deactivated` → eigener PlatformAuditLog-Eintrag | `OrgDetailDrawer` UsersTab + `platformAdmin` neue Action | Niedrig | ~20 Zeilen |
| 2 | `enrichCompany` → zusätzlich PlatformAuditLog schreiben | `functions/enrichCompany` nach Company-Update | Niedrig | ~10 Zeilen |
| 3 | ActivityLog Delete/Archive-Trail prüfen | `deleteCompany` + `blacklistCompany` fachlich prüfen | Niedrig | Analyse + optional ~15 Zeilen |
| 4 | ARIA-Warnung `DialogContent` beheben | `OrgDetailDrawer` → `<DialogDescription className="sr-only">` | Niedrig | 1–2 Zeilen |

---

## Details

### TODO 1 — member_deactivated AuditLog

**Aktuell:** `handleDeactivate` in UsersTab schreibt `createSupportNote` als indirekten Log-Ersatz.

**Soll:**
- Neue `platformAdmin`-Action `deactivateMember`
- Direkter `PlatformAuditLog`-Eintrag: `action='member_deactivated'`, `target_id=member.id`, `reason`
- `OrganizationMember.update(id, { status: 'inactive' })` bleibt im Backend

**Dateien:**
- `components/platform-admin/OrgDetailDrawer` — UsersTab `handleDeactivate`
- `functions/platformAdmin` — neue Action `deactivateMember`

---

### TODO 2 — enrichCompany AuditLog

**Aktuell:** `enrichCompany` schreibt `console.info` + `UsageLog` (ai_actions_used), kein `PlatformAuditLog`.

**Soll:** Nach erfolgreichem `Company.update()`:
```js
await base44.asServiceRole.entities.PlatformAuditLog.create({
  actor_email: user.email,
  actor_role: user.role,
  action: 'company_enriched',
  target_type: 'company',
  target_id: companyId,
  organization_id: organizationId,
  metadata: JSON.stringify({ fields_updated: Object.keys(updateData) }),
});
```

**Datei:** `functions/enrichCompany`

---

### TODO 3 — ActivityLog Delete/Archive-Trail

**Aktuell:** `deleteCompany` und `blacklistCompany` schreiben `PlatformAuditLog`. Kein sekundärer `ActivityLog`-Eintrag.

**Fachliche Frage:** Soll der org-seitige `ActivityLog` (für Org-Admins sichtbar, nicht nur Platform-Admins) ebenfalls einen Eintrag erhalten?

**Entscheidung ausstehend** — technisch trivial, fachlich zu prüfen.

**Dateien:** `functions/deleteCompany`, `functions/blacklistCompany`

---

### TODO 4 — ARIA DialogContent-Warnung

**Aktuell:** Radix UI wirft in der Konsole:
```
Warning: Missing `Description` or `aria-describedby={undefined}` for {DialogContent}.
```
Kein Crash, reine Konsol-Warnung. Betrifft `OrgDetailDrawer`.

**Fix:** In `DialogContent` innerhalb `OrgDetailDrawer`:
```jsx
<DialogDescription className="sr-only">
  Organisation verwalten — Übersicht, Billing, Nutzer, Research und Gefahrenzone.
</DialogDescription>
```

**Datei:** `components/platform-admin/OrgDetailDrawer`

---

## Status-Tracking

| TODO | Status | Erledigt am |
|---|---|---|
| 1 — member_deactivated AuditLog | ⏳ Offen | — |
| 2 — enrichCompany AuditLog | ⏳ Offen | — |
| 3 — ActivityLog Delete-Trail | ⏳ Offen (fachlich prüfen) | — |
| 4 — ARIA DialogContent | ⏳ Offen | — |