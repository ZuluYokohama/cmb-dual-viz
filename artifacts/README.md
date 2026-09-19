# Artifacts

Screenshots and ledger JSONL are **not** committed (see `.gitignore`).

| Path | Role |
|------|------|
| `artifacts/*.png` | Puppeteer gate screenshots (local / CI optional) |
| `artifacts/*.pdf` | Reference PDFs (local) |
| `artifacts/ledger/*.jsonl` | Evidence Ledger dumps from scripts |
| `artifacts/.perf-bundle/` | esbuild bundles for Node perf/ledger scripts (generated) |
| `artifacts/.gitkeep` | Keeps empty dirs in git |

Regenerate screenshots with `npm run shot:*` scripts when the app is running.
