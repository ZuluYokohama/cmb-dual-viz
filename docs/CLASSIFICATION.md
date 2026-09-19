# Classification — CMB Dual-Thread Engine

**Revision:** 2 (S0 freeze)  
**Instrument:** `/workspace/cmb-dual-viz`  
**Mode:** RESEARCH — exploratory desktop instrument. Not flight software. Not an OPEN claim surface.

## Analogue class

| Field | Value |
|-------|--------|
| NPR 7150.2 analogue | **Class D-analogue** |
| Rationale | Science/research desktop instrument; loss → wasted analyst time, not vehicle/crew harm |
| Not | Class A/B/C flight, GNC, or safety-critical software |

Rationale for D vs E/F: the instrument ingests external URLs, runs correlate search that can *look* like evidence, and exposes match-pull UI. That warrants more assurance than a pure demo, but not flight rigor.

## Escalation trigger → Class C-analogue

If outputs are used to **authorize** operational OPEN, funding, or safety decisions:

1. Reclassify toward **Class C-analogue**.
2. Add independent evaluation.
3. Freeze kernels (CPU reference + any GPU path).
4. Formalize test PE / acceptance criteria.
5. Update this document and `REQUIREMENTS.md` before further feature work.

Until then, stay D-analogue.

## Compliance claims — FORBIDDEN

- Shall **not** claim “NASA compliant,” “NPR 7150.2 compliant,” “8739.8 compliant,” or equivalent in product UI, README marketing, or release notes.
- A real class assessment against NPR + NASA-STD-8739.8 requires a **named human** signature. This repo holds an **honest analogue** only.
- Standards hub (context only): https://www.nasa.gov/intelligent-systems-division/software-management-office/nasa-software-engineering-procedural-requirements-standards-and-related-resources/

## Related artifacts

- `docs/REQUIREMENTS.md` — shall / shall-not
- `docs/ARCHITECTURE.md` — structure & interfaces
- `docs/HAZARDS.md` — misuse & SSRF
- `docs/TEST_PLAN.md` — assurance tests
- `docs/GPU_TENSOR_PARALLEL_PLAN.md` — Rev 2 phase plan
