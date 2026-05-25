# AuthZ Tech-Debt: authorizeOrganizationAction

**Status**: Accepted (2026-05-25)  
**Risk**: Low  
**Phase**: AuthZ Refactoring Round 3 abgeschlossen

## Befund

`authorizeOrganizationAction` ist logisch kanonisch in `functions/sharedAuthz` definiert,
aber technisch als **identische Inline-Kopie** in 5 Funktionen vorhanden:

| Funktion | Kopie-Status |
|---|---|
| `createPortalSession` | identische Kopie (sharedAuthz v1.0.0) |
| `createCheckoutSession` | identische Kopie (sharedAuthz v1.0.0) |
| `deleteCompany` | identische Kopie (sharedAuthz v1.0.0) |
| `blacklistCompany` | identische Kopie (sharedAuthz v1.0.0) |
| `enrichCompany` | identische Kopie (sharedAuthz v1.0.0) |

## Ursache

Base44 unterstützt **keine lokalen Imports** zwischen Backend-Funktionen.
Jede Funktion ist eine eigenständige Deno-Deploy-Unit.
Ein echter `import { authorizeOrganizationAction } from './sharedAuthz'` ist
plattformtechnisch nicht möglich.

## Akzeptiertes Risiko

Jede **künftige AuthZ-Regeländerung** muss synchron in **allen 5 Kopien** erfolgen.

Divergenz-Risiko: **mittel** — wenn eine Funktion vergessen wird, entsteht eine
Sicherheitslücke die schwer zu erkennen ist (kein Compile-Zeit-Fehler).

## Mitigation

1. **Change-Procedure**: Jede AuthZ-Änderung startet in `sharedAuthz` und wird
   dann manuell in alle 5 Funktionen übertragen.
2. **Audit**: `auditAuthzConsistency` prüft ob `shared_authz_helper_exists=true`
   und ob alle 5 Funktionen die kanonische Implementierung nutzen.
3. **Versionierung**: Kommentar `(sharedAuthz v1.0.0)` in jeder Kopie — bei
   Änderung Version erhöhen um Drift sofort erkennbar zu machen.

## Akzeptiert durch

Entscheidung: 2026-05-25  
Kontext: AuthZ-Hardening Block abgeschlossen, claim_status YELLOW (0 failures, 2 warnings)

## Wenn Base44 lokale Imports unterstützt

Dann: `sharedAuthz`-Funktion als shared module registrieren und alle 5 Funktionen
auf echten Import umstellen. Bis dahin: Inline-Kopie mit Versionierungskommentar.