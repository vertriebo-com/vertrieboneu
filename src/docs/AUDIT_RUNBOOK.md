# Vertriebo Audit Runbook
**Version:** 1.0 — 2026-05-25  
**Zweck:** Verbindliche Checkliste für alle Audit-Funktionen vor jedem Release.

---

## Bedeutung der Statusstufen

| Status | Farbe | Bedeutung |
|--------|-------|-----------|
| `green` | ✅ | Alle Checks bestanden. Kein Handlungsbedarf. |
| `yellow` | 🟡 | Warnungen vorhanden. Kein sofortiger Bug, aber Tech-Debt oder strukturelle Lücke. Kann als Tech-Debt akzeptiert werden — muss dokumentiert sein. |
| `red` | 🔴 | Mindestens ein kritischer Check fehlgeschlagen. **Release-blocking.** Muss behoben werden. |

---

## Release-Blocking Audits

Diese Audits **müssen grün oder gelb** sein, bevor ein Release deployt wird.  
Ein **roter Status blockiert den Release**.

| Priorität | Funktion | Bereich | Release-blocking | Akzeptierte Yellows |
|-----------|----------|---------|-----------------|---------------------|
| 1 | `auditGlobalTenantIsolation` | Security | **Ja — Red blockiert** | Keine |
| 2 | `auditAuthzConsistency` | Security | **Ja — Red blockiert** | enrichCompany ohne AuditLog (Tech-Debt) |
| 3 | `auditUsageQuotaConsistency` | Billing | **Ja — Red blockiert** | Delta < 5 Leads pro Org (Sync-Toleranz) |
| 4 | `auditPlanModelIntegrity` | Billing | **Ja — Red blockiert** | Org-Mismatches wenn `repair_confidence=auto_repairable` |
| 5 | `auditTaxonomySourceOfTruth` | Taxonomy | **Ja — Red blockiert** | Keine |
| 6 | `auditKeywordIntentSeparation` | Keyword | **Ja — Red blockiert** | `keyword_type_field_missing_in_data` wenn 0 Profile vorhanden |
| 7 | `auditLeadQualityEngine` | Lead Engine | **Ja — Red blockiert** | Chain-Filter Warning (bekannte Limitation) |

---

## Empfohlene Audits (nicht Release-blocking)

Diese Audits sollten regelmäßig laufen. Yellows werden als Tech-Debt dokumentiert.

| Funktion | Bereich | Empfohlene Frequenz | Akzeptierte Yellows |
|----------|---------|--------------------|--------------------|
| `auditLeadQualityScoring` | Lead Engine | wöchentlich | Score-Verteilung Warnings |
| `auditLeadOrgConsistency` | Data | wöchentlich | Leads ohne research_run_id |
| `auditResearchRunQuality` | Research | nach jedem Major-Release | Stale Runs |
| `auditPlanLimits` | Billing | monatlich | Orgs nahe am Limit |
| `auditPlanMissingOrgs` | Billing | wöchentlich | Test-Orgs ohne Plan |
| `auditKeywordProfile` | Keyword | wöchentlich | Fehlende keyword_type |
| `auditKeywordLearning` | Keyword | wöchentlich | Wenige Outcomes |
| `auditKeywordSettingsIntegration` | Keyword | nach Settings-Änderungen | — |
| `auditLearningLoop` | Keyword | wöchentlich | < 5 Outcomes |
| `auditLearningVisibility` | Keyword | nach UI-Änderungen | — |
| `auditLocationIndex` | Research | nach LocationIndex-Import | — |
| `auditLeadDetailResearchContext` | Research | nach processResearchRun-Änderungen | — |
| `auditContactHistory` | Data | wöchentlich | — |
| `auditEmailFollowups` | Email | wöchentlich | — |
| `auditDailyPriorities` | UX | wöchentlich | — |
| `auditTrialBannerUsage` | Billing | nach UI-Änderungen | — |
| `auditUsageQuotaUiConsistency` | Billing | nach UI-Änderungen | — |
| `auditToolingCoverage` | Tooling | monatlich | SDK-Drift, ESLint-Gaps |

---

## Release-Checkliste (manuell, bis CI verfügbar)

Vor jedem Release diese Schritte in der angegebenen Reihenfolge ausführen:

### Schritt 1 — Security (must be green)
```
1. auditGlobalTenantIsolation  → claim_status muss GREEN sein
2. auditAuthzConsistency       → claim_status muss GREEN oder YELLOW sein
                                  Yellow OK wenn nur enrichCompany AuditLog fehlt
```

### Schritt 2 — Billing (must not be red)
```
3. auditUsageQuotaConsistency  → claim_status GREEN oder YELLOW
                                  Red nur akzeptierbar wenn alle Orgs mit Delta < 10 Leads
4. auditPlanModelIntegrity     → claim_status GREEN oder YELLOW
                                  Org-Mismatches mit repair_confidence=auto_repairable OK
```

### Schritt 3 — Core Systems (must not be red)
```
5. auditTaxonomySourceOfTruth  → claim_status muss GREEN sein
6. auditKeywordIntentSeparation → claim_status GREEN oder YELLOW
7. auditLeadQualityEngine      → claim_status GREEN oder YELLOW
                                  Chain-Filter Warning ist bekannte Limitation → OK
```

### Schritt 4 — Abnahme
```
8. Alle RED-Ergebnisse: Blocker. Release stoppen. Issue anlegen. Fixen.
9. Alle YELLOW-Ergebnisse: Dokumentieren. In Tech-Debt-Liste eintragen. Release erlaubt.
10. Ergebnis in Slack/Commit-Message dokumentieren: "Release-Audits: 7/7 OK (X Yellows)"
```

---

## Bekannte akzeptierte Tech-Debts (Stand 2026-05-25)

| Audit | Befund | Status | Priorität |
|-------|--------|--------|-----------|
| `auditAuthzConsistency` | enrichCompany hat kein PlatformAuditLog | Akzeptiert | Low |
| `auditKeywordIntentSeparation` | keyword_type_field nicht in allen Profilen gesetzt | Akzeptiert | Medium |
| `auditLeadQualityEngine` | Chain-Filter hartcodiert, branchen-agnostisch | Akzeptiert | Medium |
| `auditToolingCoverage` | jsconfig/ESLint nicht als editierbare Dateien verfügbar (Base44-managed) | Akzeptiert (Platform-Limitation) | Low |
| `auditToolingCoverage` | Keine GitHub Actions Workflows | Akzeptiert (kein Bedarf aktuell) | Low |
| `auditToolingCoverage` | moment + date-fns parallel installiert | Tech-Debt — Migration pending | Low |
| `auditUsageQuotaConsistency` | Delta zwischen Quellen bei einigen Orgs > 2 | Monitoring | Medium |

---

## Wie Audits aufgerufen werden

**Via Dashboard** (empfohlen für manuelle Release-Checks):
1. Dashboard → Code → Functions → `[Funktionsname]`
2. "Test" klicken mit leerem `{}` Payload
3. Response prüfen: `claim_status` und `summary`

**Via SDK** (für zukünftige Automatisierung):
```javascript
const result = await base44.functions.invoke('auditAuthzConsistency', {});
if (result.data.claim_status === 'red') {
  throw new Error('Release blocked: ' + result.data.summary);
}
```

---

## SDK-Versionen (Stand 2026-05-25)

| Bereich | Version | Status |
|---------|---------|--------|
| Frontend `@base44/sdk` | `^0.8.30` | ✅ Aligned |
| Backend Functions `npm:@base44/sdk` | `@0.8.30` | ✅ Aligned (Phase 1 Fix) |

**Nächste SDK-Updates:** Changelog prüfen unter https://www.npmjs.com/package/@base44/sdk bevor Version erhöht wird.

---

## Geplante Verbesserungen (nicht in diesem Block)

- [ ] `scripts/runAllAudits.js` — Audit-Runner der alle Release-Blocking Audits sequenziell aufruft
- [ ] Scheduled Automation: täglich 06:00 → alle Release-Blocking Audits → Alert wenn RED
- [ ] moment → date-fns Migration (alle `src/**` Usages)
- [ ] `window.location.href` in `useOrganization.js` → `useNavigate()` migrieren
- [ ] React Error Boundary um `<Layout />` wrappen