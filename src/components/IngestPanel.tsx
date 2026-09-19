import { useCallback, useRef, useState } from 'react';
import type { IngestedDataset, IngestLogEntry } from '../ingest/types';
import {
  ingestFile,
  ingestFromUrl,
  resolveFetchUrl,
  SAMPLE_REMOTE_PATHS,
  summarizeDataset,
} from '../ingest';
import {
  genAnisotropySamples,
  genDemoClaims,
  genExampleCl,
  genSyntheticGcpLike,
} from '../math/generators';

interface Props {
  datasets: IngestedDataset[];
  log: IngestLogEntry[];
  onAdd: (ds: IngestedDataset, log: IngestLogEntry) => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onLogOnly: (log: IngestLogEntry) => void;
}

export function IngestPanel({
  datasets,
  log,
  onAdd,
  onToggle,
  onRemove,
  onLogOnly,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteName, setPasteName] = useState('pasted');
  const [urlInput, setUrlInput] = useState('');
  const [fetching, setFetching] = useState(false);

  const handleText = useCallback(
    (filename: string, text: string) => {
      const { result, log: entry } = ingestFile(filename, text);
      if (result.ok && result.dataset) {
        result.dataset.sourceKind = result.dataset.sourceKind ?? 'file';
        onAdd(result.dataset, entry);
      } else onLogOnly(entry);
    },
    [onAdd, onLogOnly]
  );

  const fetchUrl = useCallback(
    async (raw: string) => {
      const target = resolveFetchUrl(raw);
      if (!target) return;
      setFetching(true);
      try {
        const { result, log: entry } = await ingestFromUrl(target);
        if (result.ok && result.dataset) onAdd(result.dataset, entry);
        else onLogOnly(entry);
      } finally {
        setFetching(false);
      }
    },
    [onAdd, onLogOnly]
  );

  const onFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      Array.from(files).forEach((f) => {
        const reader = new FileReader();
        reader.onload = () => {
          handleText(f.name, String(reader.result ?? ''));
        };
        reader.onerror = () => {
          onLogOnly({
            id: `log-err-${Date.now()}`,
            at: Date.now(),
            status: 'rejected',
            source: f.name,
            message: 'File read failed',
          });
        };
        reader.readAsText(f);
      });
    },
    [handleText, onLogOnly]
  );

  return (
    <div className="ingest-panel">
      <h3>
        <span className="badge badge-derived">Derived / meaning-map</span>
        Ingest
      </h3>
      <p className="epistemic-note">
        Ingested streams become meaning-map nodes. Remote URL data is untrusted until
        labeled — never auto-promoted to PHYSICS-BACKED. Convergence is intuition, not
        proof of non-local effects.
      </p>
      <p className="hint">For checked intake, import a cmb.dataset/v1 JSON file produced by the staging command. JSONL needs an explicit column mapping.</p>

      <div className="url-ingest">
        <div className="sky-title">
          External URL
          <span className="hint-inline">via /api/fetch proxy · http(s) · 5&nbsp;MB cap</span>
        </div>
        <div className="url-row">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="https://…/data.json|.csv|.txt"
            disabled={fetching}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && urlInput.trim()) void fetchUrl(urlInput);
            }}
          />
          <button
            type="button"
            className="btn primary url-fetch-btn"
            disabled={fetching || !urlInput.trim()}
            onClick={() => void fetchUrl(urlInput)}
          >
            {fetching ? 'Fetching…' : 'Fetch URL…'}
          </button>
        </div>
        <div className="gen-row url-samples">
          <button
            type="button"
            className="btn ghost"
            disabled={fetching}
            title="Same-origin sample via proxy (exercises external path)"
            onClick={() => void fetchUrl(SAMPLE_REMOTE_PATHS.cl)}
          >
            Load sample remote C_ℓ
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={fetching}
            onClick={() => void fetchUrl(SAMPLE_REMOTE_PATHS.series)}
          >
            Load sample remote series
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={fetching}
            onClick={() => void fetchUrl(SAMPLE_REMOTE_PATHS.bundle)}
          >
            Load remote bundle
          </button>
          <button
            type="button"
            className="btn ghost"
            disabled={fetching}
            title="Public raw CSV via proxy; falls back to /samples on failure"
            onClick={() => {
              void (async () => {
                setFetching(true);
                const tryUrl =
                  'https://httpbin.org/json';
                try {
                  const { result, log: entry } = await ingestFromUrl(tryUrl);
                  if (result.ok && result.dataset) {
                    result.dataset.name = `external:iris (EXAMPLE)`;
                    result.dataset.epistemic = 'DERIVED/MEANING-MAP';
                    onAdd(result.dataset, entry);
                  } else {
                    onLogOnly(entry);
                    onLogOnly({
                      id: `log-fallback-${Date.now()}`,
                      at: Date.now(),
                      status: 'residue',
                      source: 'external-fallback',
                      message:
                        'External raw URL failed — loading local /samples/example-cl.json via proxy',
                    });
                    setFetching(false);
                    await fetchUrl(SAMPLE_REMOTE_PATHS.cl);
                    return;
                  }
                } finally {
                  setFetching(false);
                }
              })();
            }}
          >
            Try external raw URL
          </button>
        </div>
      </div>

      <div
        className={`dropzone ${dragOver ? 'over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onFiles(e.dataTransfer.files);
        }}
        onClick={() => fileRef.current?.click()}
      >
        <strong>Drop JSON / CSV / TXT</strong>
        <span>or click to pick files</span>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.csv,.tsv,.txt,.md,application/json,text/csv,text/plain"
          multiple
          hidden
          onChange={(e) => onFiles(e.target.files)}
        />
      </div>

      <div className="gen-row">
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            const ds = genExampleCl(64);
            onAdd(ds, {
              id: `log-${ds.id}`,
              at: Date.now(),
              status: 'accepted',
              source: 'generator',
              message: 'EXAMPLE acoustic C_ℓ generated',
              datasetId: ds.id,
            });
          }}
        >
          EXAMPLE C_ℓ
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            const ds = genSyntheticGcpLike();
            onAdd(ds, {
              id: `log-${ds.id}`,
              at: Date.now(),
              status: 'accepted',
              source: 'generator',
              message: 'Synthetic GCP-like series (METAPHOR)',
              datasetId: ds.id,
            });
          }}
        >
          GCP-like
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            const ds = genAnisotropySamples();
            onAdd(ds, {
              id: `log-${ds.id}`,
              at: Date.now(),
              status: 'accepted',
              source: 'generator',
              message: 'Synthetic anisotropy samples',
              datasetId: ds.id,
            });
          }}
        >
          Sky samples
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => {
            const ds = genDemoClaims();
            onAdd(ds, {
              id: `log-${ds.id}`,
              at: Date.now(),
              status: 'accepted',
              source: 'generator',
              message: 'Demo text claims',
              datasetId: ds.id,
            });
          }}
        >
          Text claims
        </button>
      </div>

      <button type="button" className="btn ghost" onClick={() => setPasteOpen((v) => !v)}>
        {pasteOpen ? 'Hide paste box' : 'Paste JSON / CSV / text'}
      </button>
      {pasteOpen && (
        <div className="paste-box">
          <input
            type="text"
            value={pasteName}
            onChange={(e) => setPasteName(e.target.value)}
            placeholder="name"
          />
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={5}
            placeholder='{"name":"demo","claims":["…"]} or CSV or prose'
          />
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              if (!pasteText.trim()) return;
              handleText(pasteName || 'pasted.txt', pasteText);
              setPasteText('');
            }}
          >
            Ingest paste
          </button>
        </div>
      )}

      <div className="dataset-list">
        <div className="sky-title">Datasets ({datasets.length})</div>
        {datasets.length === 0 && <p className="hint">No ingested sources yet.</p>}
        {datasets.map((ds) => (
          <div key={ds.id} className={`dataset-row ${ds.enabled ? '' : 'off'}`}>
            <label className="check">
              <input type="checkbox" checked={ds.enabled} onChange={() => onToggle(ds.id)} />
              <span className="ds-name">{ds.name}</span>
            </label>
            <span className="ds-meta">
              {ds.sourceKind === 'url' || ds.type === 'url' ? 'URL · ' : ''}
              {ds.epistemic} · {summarizeDataset(ds)}
              {ds.sourceUrl ? (
                <>
                  <br />
                  <span className="ds-url" title={ds.sourceUrl}>
                    {ds.sourceUrl}
                  </span>
                </>
              ) : null}
            </span>
            <button type="button" className="btn tiny" onClick={() => onRemove(ds.id)}>
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="ingest-log">
        <div className="sky-title">Ingestion log</div>
        <ul>
          {log.slice(0, 14).map((e) => (
            <li key={e.id} className={`log-${e.status}`}>
              <span className="log-status">{e.status}</span> {e.source}: {e.message}
            </li>
          ))}
          {log.length === 0 && <li className="hint">Empty</li>}
        </ul>
      </div>
    </div>
  );
}
