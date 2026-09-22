import { useState } from 'react';
import { ledgerAppend } from '../compute/ledger';
import { MAX_LLM_TRACE_BYTES, parseLlmTraceJsonl, type LlmTrace } from '../ingest/llmTrace';

export function LlmTracePanel() {
  const [traces, setTraces] = useState<LlmTrace[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <section className="llm-trace-panel">
    <h2>LLM observations</h2>
    <p className="hint">Import an observer run to inspect uncertainty and representation changes. These measurements do not establish correctness.</p>
    <label>Import trace JSONL <input aria-label="Import LLM trace" type="file" accept=".jsonl" disabled={busy} onChange={async e => {
      const file = e.target.files?.[0];
      if (!file) return;
      setBusy(true); setError('');
      try {
        if (file.size > MAX_LLM_TRACE_BYTES) throw new Error('Trace exceeds 20 MiB');
        const text = await file.text();
        const parsed = parseLlmTraceJsonl(text);
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        const sha256 = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
        ledgerAppend({kind: 'ingest', epistemic: 'RESEARCH/DERIVED', detail: {
          schema: 'cmb.llm-trace/v1', file: file.name, sha256, records: parsed.length,
          sourceAssertionsVerified: false, modelHashes: [...new Set(parsed.map(t => t.model_sha256))],
        }});
        setTraces(parsed);
      } catch (err) { setError(err instanceof Error ? err.message : 'Import failed'); }
      finally { setBusy(false); e.target.value = ''; }
    }} /></label>
    {error && <p role="alert">{error}</p>}
    {traces.length > 0 && <>
      <p>{traces.length} records loaded. Provenance fields are supplied by the run; import checks structure, not source authenticity.</p>
      <div style={{overflowX: 'auto', maxHeight: 320}}><table>
        <thead><tr><th>Sample</th><th>Mode</th><th>Tokens</th><th>Mean entropy (nats)</th><th>Request time (ms)</th></tr></thead>
        <tbody>{traces.map(t => {
          const o = t.observation;
          return <tr key={JSON.stringify([t.run_id, o.id])}><td>{o.id}</td><td>{o.observe ? 'Observed' : 'Ordinary'}</td>
            <td>{o.token_ids.length}</td><td>{o.observations.length ? (o.observations.reduce((s, r) => s + r.entropy_nats, 0) / o.observations.length).toFixed(3) : '—'}</td>
            <td>{o.wall_ms.toFixed(1)}</td></tr>;
        })}</tbody>
      </table></div>
    </>}
  </section>;
}
