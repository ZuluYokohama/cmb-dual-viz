# Dressing Checklist — RESEARCH instrument

**Status:** Motif / operational checklist only.  
**Not implemented:** Dressing Field Method (DFM) algebra, Lean formalization, or automatic promotion to PHYSICS-BACKED / OPEN.

## Motif (relational gauge)

This panel borrows the **Cardano–Bombelli** intuition (intermediate “fictions” that cancel under controls) and the **Ravera–François Dressing Field Method** vocabulary (relational reduction of gauge / coordinate scaffolding) as a **research UX metaphor**.

- Intermediate scaffolding may stay explicit on the meaning map.
- Humans tag nodes through dressing states; every change is ledgered.
- **`invariant_claim` ≠ OPEN** — still RESEARCH; a separate evaluator owns any claim.
- Dressing never mutates epistemic labels and never auto-promotes to PHYSICS-BACKED.

PDF / literature motif: relational gauge / DFM (Ravera–François). See also the Smith chart strategic integration PDF under `artifacts/` for RF-topology analogy context — neither PDF is executed as code here.

## States (per meaning-map node)

| State | Meaning |
|-------|---------|
| `bare` | Auxiliary / coordinate-like / undressed (default for new ingest) |
| `dressed_candidate` | Relational reduction proposed (e.g. after correlate hit or Smith match-pull); still candidate |
| `invariant_claim` | Human asserts dressed/invariant content via explicit UI action; still RESEARCH |
| `scaffolding` | **Display-only** for EXAMPLE \(C_\ell\) / Thread A multipole bins / known auxiliaries |

## UI

- Panel **Dressing checklist [RESEARCH]** lists active meaning-map nodes with state, epistemic tag, provenance.
- Actions: set state (`bare` ↔ `dressed_candidate` ↔ `invariant_claim`); bulk **Mark correlate hits as dressed_candidate**.
- Bombelli one-liner in-panel: intermediate fictions OK if they cancel under controls; `invariant_claim` ≠ OPEN.
- Node inspector shows dressing state.
- Core / Instrument layers are unchanged.

## Ledger

Append-only entries (in-memory ring; JSONL via scripts):

```json
{ "kind": "dressing", "nodeId": "…", "from": "bare", "to": "dressed_candidate", "at": 0, "note": "…" }
```

Helpers: `ledgerAppendDressing` in `src/compute/ledger.ts`; pure transitions in `src/math/dressing.ts`.

## Code map

| Path | Role |
|------|------|
| `src/math/dressing.ts` | States, scaffolding detect, bulk mark, ledger payload |
| `src/components/DressingChecklist.tsx` | Sidebar panel |
| `src/components/NodeInspector.tsx` | Shows dressing |
| `src/App.tsx` | State + wiring (no epistemic auto-promote) |

## Verify

```bash
npm test && npm run lint && npm run build
```
