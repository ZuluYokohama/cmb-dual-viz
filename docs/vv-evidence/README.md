# Executed V&V evidence

Executable code commit: `8fff042` (full SHA in report.json).
Clean dependency install, tests, lint, build, and both final staging runs completed with a clean working tree. This evidence-only commit does not change executable code.

- Original upstream baseline: 47 tests passed; lint passed.
- Final software gate: 79 tests across 10 test files passed; lint and production build passed.
- Both final staging examples: 8 synthetic series records accepted, with CPU meaning-map/correlation execution.
- CLI boundary checks: bad row rejects whole input, no output on that validation failure, existing run cannot be overwritten, byte hashes verified.
- Final source provenance, scientific inference, browser and physical-GPU validation: NOT RUN.

`report.json` identifies the software run and log hashes. The two final staging reports identify source input, generated envelope, runner, bundled implementation, and their hashes. Synthetic inputs are in public/samples and examples/staging. CLI boundary checks were performed before the executable commit; final staging examples were rerun after the clean install. Timing values describe this environment only.

SHA256SUMS.json covers the captured reports/logs; it is an integrity inventory, not a signed attestation.
