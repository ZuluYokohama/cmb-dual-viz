# Hazards — CMB Dual-Thread Engine

**Revision:** 2 (S0)

## H1 — Epistemic misuse of \(z_{\mathrm{toy}}\)

| Field | Detail |
|-------|--------|
| Hazard | User treats correlate / Smith outputs as OPEN scientific proof |
| Severity | High (research integrity) |
| Mitigation | UI disclaimers; REQ-E1; demote epistemic; ledger tags; no auto PHYSICS-BACKED |
| Verify | Correlate panel copy; unit demote test |

## H2 — SSRF / URL ingest

| Field | Detail |
|-------|--------|
| Hazard | Proxy used to hit internal hosts or huge payloads |
| Severity | Medium |
| Mitigation | http(s) only; size cap 5 MB; timeout; no file://; return provenance host |
| Verify | Manual negative tests; code review of `vite-plugins/fetchProxy.ts` |

## H3 — GPU numerical wrongness

| Field | Detail |
|-------|--------|
| Hazard | Silent GPU divergence vs CPU |
| Severity | High if GPU enabled without gate |
| Mitigation | REQ-E4 / REQ-A5: ε-gate; CPU fallback; peer-review checklist |
| Verify | G1 ε tests; blocked-GPU fallback |

## H4 — Compliance / marketing overclaim

| Field | Detail |
|-------|--------|
| Hazard | “NASA compliant” or Class A language in UI/README |
| Severity | Medium (integrity / legal optics) |
| Mitigation | CLASSIFICATION forbidden list; README caution |
| Verify | Grep gate in CI optional; human review |

## H5 — Synthetic data mislabeled as measured

| Field | Detail |
|-------|--------|
| Hazard | EXAMPLE \(C_\ell\) / AR series presented as Planck/GCP |
| Severity | High |
| Mitigation | Epistemic badges; REQ-E2; ingest provenance |
| Verify | UI inspection; ingest tests |
