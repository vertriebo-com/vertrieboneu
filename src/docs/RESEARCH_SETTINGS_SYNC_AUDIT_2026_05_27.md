# auditResearchSettingsSync – Live-Test-Befund

**Datum:** 2026-05-27  
**Auslöser:** Live-Test-Blocker: „Research nutzt alten Branchen-Kontext"  
**Org:** Huwa gebäudedienst (`6a134b2a40c5bb01d911cc20`)  
**Audit-Function:** `auditResearchSettingsSync`  

---

## Ergebnis: ✅ KEIN Context-Sync-Bug bestätigt

```
claim_status:          green
risk_level:            low
bug_confirmed:         false
stale_context_detected: false
stale_source:          null
issues:                []
warnings:              []
```

---

## Audit-Evidence (alle Checks grün)

### 1. Settings-Quellen
| Quelle | Wert | Status |
|---|---|---|
| `settings.industry_id` | `gebaeudereinigung` | ✅ korrekt |
| `settings.industry_name` | `Gebäudereinigung` | ✅ konsistent |
| `org.industry` | `Gebäudereinigung` | ✅ konsistent |
| Auflösung via Prio 1 | `settings.industry_id` | ✅ kein Fallback nötig |

### 2. Taxonomie-Profil
| Feld | Wert | Status |
|---|---|---|
| Profil geladen für | `gebaeudereinigung` | ✅ |
| Zielkunden-Typen | 17 Stück | ✅ |
| Sample | Hausverwaltungen, Arztpraxen, Bürogebäude, Pflegeheime ... | ✅ korrekt |

### 3. Letzter ResearchRun
| Feld | Wert | Status |
|---|---|---|
| Run-ID | `6a134c74d26a7b36ee34d2dd` | – |
| `run.industry_id` | `gebaeudereinigung` | ✅ |
| `search_plan_json.industryId` | `gebaeudereinigung` | ✅ |
| `search_plan_json.industrySource` | `settings.industry_id` | ✅ Priorität 1 genutzt |
| `targetCustomerTypes[0..4]` | Hausverwaltungen, Immobilienverwaltungen, Bürogebäude, Arztpraxen, Zahnarztpraxen | ✅ Gebäudereinigung-Kunden |

### 4. Zielkunden-Match
| Metrik | Wert | Status |
|---|---|---|
| Zielkunden im Plan | 17 | – |
| Erwartete lt. Taxonomy | 17 | – |
| Übereinstimmung | **100%** | ✅ |

### 5. Company-Source-Queries (Companies aus letztem Run)
| Feld | Wert | Status |
|---|---|---|
| Companies aus Run | 24 | – |
| source_query-Proben | `Hausverwaltung Neuwied`, `Arztpraxis Neuwied`, `Pflegeheim` etc. | ✅ |
| Suspicious (Spedition/Logistik) | **0** | ✅ keine verdächtigen Queries |
| Suspicious Branchen | **0** | ✅ |

### 6. KeywordProfile
- Keine KeywordProfile vorhanden für diese Org
- Kein stale industry_id in Profilen

---

## Warum dachte der Nutzer, es kommen Logistik-Firmen?

**Diagnose: Wahrscheinlich ein Verständnisproblem, kein Software-Bug.**

Die Engine sucht **KUNDEN der Gebäudereinigung** – nicht Gebäudereinigungsfirmen selbst.

Zielkunden-Typ „Arztpraxen" bedeutet:  
→ Google Places wird durchsucht nach Arztpraxen, die Reinigungsdienstleistungen benötigen könnten.  
→ Das Ergebnis "Praxis Dr. Müller" ist **korrekt** – Arztpraxen sind Auftraggeber für Gebäudereinigung.

**Was als „falsche Branche" aussehen kann:**
1. Ein Lead wie „Autohaus Schmidt" → wirkt wie falscher Kontext, IST aber Zielkunde (Autohäuser lassen reinigen)
2. Ein Lead mit `branche = "Logistik"` im Namen → möglicherweise eine Firma die intern Lagerflächen reinigen lässt
3. Google Places liefert manchmal broad-matches → scoring hat es als passend eingestuft

**Was NICHT passiert ist:**
- ❌ Kein alter `industry_id` Wert wurde in den ResearchRun übernommen
- ❌ Kein Spedition/Logistik-Query wurde im search_plan_json gefunden
- ❌ Kein Stale-Cache aus sessionStorage/localStorage (ResearchDialog nutzt `orgId` als Prop, kein eigenes Caching)

---

## Echte Risiken (nicht Bug, aber Tech-Debt)

### Risk 1: queryClient-Invalidierung nach Settings-Save (MEDIUM)
**Problem:** `useOrganization` hat kein explizites `refetch` nach dem Speichern der Einstellungen.  
**Konsequenz:** Wenn Nutzer Branche ändert und sofort Recherche startet (ohne Page-Reload), sieht er möglicherweise alten org-Namen in der UI – aber `startResearchRun` liest frisch aus DB, also kein funktionaler Bug.  
**Fix:** Nach Settings-Save: `queryClient.invalidateQueries(['organization'])` aufrufen.

### Risk 2: settings.industry_name ≠ settings.industry_id (LOW)
**Problem:** Beide Keys existieren, könnten bei manuellen Edits auseinanderlaufen.  
**Konsequenz:** `startResearchRun` priorisiert `industry_id` (Prio 1) → kein Funktionsfehler, aber verwirrend beim Debugging.  
**Fix:** Beim Speichern der Branche immer beide Keys gleichzeitig schreiben.

### Risk 3: Kein UI-Feedback im ResearchDialog über genutzte Branche (LOW)
**Problem:** Nutzer sieht im Dialog nicht welche Branche/Zielkunden die Recherche verwendet.  
**Konsequenz:** Unklarheit ob die richtige Konfiguration genutzt wird.  
**Fix:** Im ResearchDialog anzeigen: "Suche für: Gebäudereinigung | Zielkunden: Hausverwaltungen, Arztpraxen..."

---

## Empfehlung für Nutzer-Kommunikation

**Erklärung für den Nutzer:**

> Vertriebo sucht nicht nach anderen Gebäudereinigungsfirmen – sondern nach **Unternehmen, die Ihre Dienste brauchen könnten**: Arztpraxen, Hausverwaltungen, Hotels, Bürogebäude. Das sind Ihre potenziellen Auftraggeber.  
>
> Wenn ein Arztpraxis-Lead erscheint: Das ist korrekt. Arztpraxen sind einer der wertvollsten Zielkunden für Gebäudereinigung.  
>
> Falls wirklich eine Speditionsfirma erscheint: Bitte den konkreten Firmennamen melden, damit die Scoring-Engine verbessert werden kann.

---

## Präventiv-Fixes (empfohlen, kein Blocker)

| Fix | Priorität | Wo |
|---|---|---|
| `queryClient.invalidateQueries` nach industry-save | MEDIUM | `components/settings/CompanySettings` |
| Branche + Zielkunden im ResearchDialog anzeigen | LOW | `components/leads/ResearchDialog` |
| settings.industry_name und industry_id sync halten | LOW | Settings-Save-Logik |
| Konkretes Feedback-Formular für "falscher Lead" | LOW | LeadDetail |

---

## Fazit

> **Kein Context-Sync-Bug.** Die Research-Engine nutzt korrekt `settings.industry_id = "gebaeudereinigung"` und sucht nach den richtigen Zielkunden.  
> Der Nutzer-Bericht ist wahrscheinlich ein Verständnisproblem: Zielkunden wie Arztpraxen und Autohäuser sind KUNDEN der Gebäudereinigung – keine Konkurrenten.  
> Wenn echte Logistik-Firmen aufgetaucht sind: Konkrete Firmennamen liefern für Scoring-Analyse.

---

*Audit erstellt am 2026-05-27 via `auditResearchSettingsSync`.*