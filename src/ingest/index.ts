import { parseJsonDocument } from './parseJson';
import { parseCsvDocument } from './parseCsv';
import { parseTextDocument } from './parseText';
import type { IngestedDataset, IngestLogEntry } from './types';
import type { ParseResult } from './parseJson';
import { MAX_STAGING_BYTES } from './staging';

export * from './types';
export { parseJsonDocument, parseCsvDocument, parseTextDocument };

let _idSeq = 0;
export function nextIngestId(prefix = 'ds'): string {
  _idSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${_idSeq}`;
}

export function ingestFile(
  filename: string,
  text: string
): { result: ParseResult; log: IngestLogEntry } {
  const id = nextIngestId();
  const lower = filename.toLowerCase();
  let result: ParseResult;

  if (new TextEncoder().encode(text).byteLength > MAX_STAGING_BYTES) {
    result = { ok: false, errors: ['Input exceeds 5 MiB intake limit'], residue: [] };
  } else if (lower.endsWith('.jsonl') || lower.endsWith('.parquet') || lower.endsWith('.fits')) {
    result = { ok: false, errors: ['Use the explicit staging adapter before importing JSONL, Parquet, or FITS'], residue: [] };
  } else if (lower.endsWith('.json') || text.trimStart().startsWith('{') || text.trimStart().startsWith('[')) {
    // Prefer JSON if extension or content looks like JSON
    if (lower.endsWith('.csv')) {
      result = parseCsvDocument(text, filename, id);
    } else if (lower.endsWith('.txt') || lower.endsWith('.md')) {
      result = parseTextDocument(text, filename, id);
    } else {
      result = parseJsonDocument(text, filename, id);
      // Structured input must not turn into prose when validation fails.
    }
  } else if (lower.endsWith('.csv') || lower.endsWith('.tsv')) {
    result = parseCsvDocument(text, filename, id);
  } else if (lower.endsWith('.txt') || lower.endsWith('.md')) {
    result = parseTextDocument(text, filename, id);
  } else {
    // sniff
    const first = text.trimStart().slice(0, 1);
    if (first === '{' || first === '[') result = parseJsonDocument(text, filename, id);
    else if (text.includes(',') && text.split('\n').length > 1) {
      result = parseCsvDocument(text, filename, id);
    } else result = parseTextDocument(text, filename, id);
  }

  const log: IngestLogEntry = {
    id: `log-${id}`,
    at: Date.now(),
    status: result.ok ? (result.errors.length || result.residue.length ? 'residue' : 'accepted') : 'rejected',
    source: filename,
    message: result.ok
      ? `Accepted "${result.dataset?.name}"` +
        (result.errors.length ? ` with ${result.errors.length} row/field warnings` : '') +
        (result.residue.length ? `; residue: ${result.residue.join('; ')}` : '')
      : `Rejected: ${result.errors.join('; ')}`,
    datasetId: result.dataset?.id,
  };
  return { result, log };
}

export function summarizeDataset(ds: IngestedDataset): string {
  const parts: string[] = [];
  if (ds.skySamples?.length) parts.push(`${ds.skySamples.length} sky`);
  if (ds.series?.length) parts.push(`${ds.series.length} series`);
  if (ds.claims?.length) parts.push(`${ds.claims.length} claims`);
  if (ds.cl?.length) parts.push(`C_ℓ[${ds.cl.length}]`);
  if (ds.alm?.length) parts.push(`${ds.alm.length} a_ℓm`);
  return parts.join(', ') || 'empty';
}

/** Response shape from /api/fetch proxy */
export interface FetchProxyOk {
  ok: true;
  url: string;
  host: string;
  contentType: string;
  bytes: number;
  fetchedAt: number;
  text: string;
}

export interface FetchProxyErr {
  ok: false;
  error: string;
  url?: string;
  host?: string;
  bytes?: number;
}

export type FetchProxyResult = FetchProxyOk | FetchProxyErr;

/**
 * CORS-safe URL fetch via Vite /api/fetch proxy, then same parse pipeline.
 * Remote physics labels are source assertions only —
 * never auto-promote to PHYSICS-BACKED.
 */
export async function ingestFromUrl(
  url: string
): Promise<{ result: ParseResult; log: IngestLogEntry }> {
  const trimmed = url.trim();
  let logBase = trimmed;
  try {
    logBase = new URL(trimmed).href;
  } catch {
    /* keep raw */
  }

  let proxy: FetchProxyResult;
  try {
    const res = await fetch(`/api/fetch?url=${encodeURIComponent(trimmed)}`);
    proxy = (await res.json()) as FetchProxyResult;
    if (!res.ok && proxy && typeof proxy === 'object' && 'ok' in proxy && !proxy.ok) {
      // structured error from proxy
    } else if (!res.ok) {
      proxy = { ok: false, error: `Proxy HTTP ${res.status}`, url: trimmed };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const log: IngestLogEntry = {
      id: `log-url-${Date.now()}`,
      at: Date.now(),
      status: 'rejected',
      source: logBase,
      message: `URL fetch failed: ${message}`,
    };
    return { result: { ok: false, errors: [message], residue: [] }, log };
  }

  if (!proxy.ok) {
    const host = proxy.host ? ` (host ${proxy.host})` : '';
    const log: IngestLogEntry = {
      id: `log-url-${Date.now()}`,
      at: Date.now(),
      status: 'rejected',
      source: proxy.url ?? logBase,
      message: `URL rejected${host}: ${proxy.error}`,
    };
    return { result: { ok: false, errors: [proxy.error], residue: [] }, log };
  }

  // Filename hint from path + content-type sniff
  let pathName = 'remote.json';
  try {
    const u = new URL(proxy.url);
    const last = u.pathname.split('/').filter(Boolean).pop();
    if (last) pathName = last;
  } catch {
    /* keep default */
  }
  const ct = (proxy.contentType || '').toLowerCase();
  if (!/\.(json|csv|tsv|txt|md)$/i.test(pathName)) {
    if (ct.includes('json')) pathName = `${pathName || 'remote'}.json`;
    else if (ct.includes('csv')) pathName = `${pathName || 'remote'}.csv`;
    else if (ct.includes('text/plain')) pathName = `${pathName || 'remote'}.txt`;
  }

  const { result, log } = ingestFile(pathName, proxy.text);
  if (result.ok && result.dataset) {
    result.dataset.type = 'url';
    result.dataset.sourceUrl = proxy.url;
    result.dataset.sourceKind = 'url';
    result.dataset.contentType = proxy.contentType;
    result.dataset.meta = {
      ...(result.dataset.meta ?? {}),
      fetchedAt: proxy.fetchedAt,
      bytes: proxy.bytes,
      host: proxy.host,
      via: 'vite-/api/fetch',
    };
    // Epistemic: never auto-promote remote to PHYSICS-BACKED
    if (result.dataset.epistemic === 'PHYSICS-BACKED') {
      result.dataset.epistemic = 'PHYSICS-BACKED (EXAMPLE)';
      result.residue = [
        ...(result.residue ?? []),
        'Remote PHYSICS-BACKED demoted to PHYSICS-BACKED (EXAMPLE) — untrusted until labeled',
      ];
    }
  }

  log.source = `url:${proxy.host}`;
  log.message =
    (result.ok
      ? `External fetch OK (${proxy.bytes} B, ${proxy.contentType}) → ${log.message}`
      : `External fetch OK but parse failed: ${log.message}`) +
    ` · ${proxy.url}`;
  if (result.ok && result.residue?.length) log.status = 'residue';

  return { result, log };
}

/** Built-in sample paths under /public/samples (same-origin, still via proxy when used as full URL) */
export const SAMPLE_REMOTE_PATHS = {
  cl: '/samples/example-cl.json',
  series: '/samples/example-series.csv',
  bundle: '/samples/example-remote-bundle.json',
} as const;

/**
 * Resolve a same-origin sample path to absolute URL for the proxy,
 * or pass through an absolute http(s) URL.
 */
export function resolveFetchUrl(pathOrUrl: string): string {
  const t = pathOrUrl.trim();
  if (/^https?:\/\//i.test(t)) return t;
  if (typeof window !== 'undefined') {
    return new URL(t, window.location.origin).href;
  }
  return t;
}
