# Hazards (lite) — CMB Dual-Thread Engine

**Revision:** 2 (S0 freeze)  
**Class:** D-analogue. Not a full FTA — focused misuse & interface hazards.

## H1 — \(z_{\mathrm{toy}}\) misuse

| | |
|--|--|
| Hazard | User treats correlate shuffle \(z_{\mathrm{toy}}\) or coherence z as discovery / OPEN evidence |
| Severity | Epistemic (analyst error); not vehicle harm |
| Mitigation | UI copy + badges; REQ-E1; null-control tests; ledger tags RESEARCH/DERIVED |
| Residual | Cannot prevent motivated misreading — docs + banner remain |

## H2 — URL SSRF / unbounded fetch

| | |
|--|--|
| Hazard | Proxy fetches non-http(s), internal hosts abuse, or oversized bodies |
| Severity | Host compromise / DoS of dev server |
| Mitigation | Proxy: http(s) only; 5 MB cap; reject with ingest log; REQ-E5 |
| Residual | Auth headers deferred; private-IP blocking is best-effort in research proxy |

## H3 — GPU wrongness

| | |
|--|--|
| Hazard | GPU path diverges from CPU reference without detection |
| Status at G1 | **Enabled with ε-gate + CPU fallback**; SH ε=0.75 (f32 vs f64), corr ε=5e-4 |
| Mitigation when G1 | CPU reference + ε-gate; feature detect + fallback; REQ-E4 |
| Residual | Nondeterminism on some GPUs — ordered reductions + ε |

## H4 — EXAMPLE \(C_\ell\) presented as Planck

| | |
|--|--|
| Hazard | UI/docs imply measured CMB power spectrum |
| Mitigation | Badges, footer, REQ-E2, generators labeled EXAMPLE |

## H5 — Class under/over-statement

| | |
|--|--|
| Hazard | Claiming NASA compliance, or using outputs for ops without reclassification |
| Mitigation | `CLASSIFICATION.md` escalation trigger; forbid compliance claims in UI |
