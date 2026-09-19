/**
 * Dev/preview middleware: GET /api/fetch?url=<http(s) URL>
 * Server-side fetch to bypass browser CORS for ingestion.
 * Restricts to http/https; 5MB size cap; returns text + provenance headers.
 */
import type { Plugin, PreviewServer, ViteDevServer } from 'vite';

const MAX_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;

function attachFetchProxy(server: ViteDevServer | PreviewServer) {
  server.middlewares.use(async (req, res, next) => {
    const rawUrl = req.url ?? '';
    if (!rawUrl.startsWith('/api/fetch')) {
      next();
      return;
    }

    try {
      const host = req.headers.host ?? 'localhost:5173';
      const parsed = new URL(rawUrl, `http://${host}`);
      const target = parsed.searchParams.get('url');

      if (!target) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: 'Missing url query parameter' }));
        return;
      }

      let dest: URL;
      try {
        dest = new URL(target);
      } catch {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: false, error: 'Invalid URL' }));
        return;
      }

      if (dest.protocol !== 'http:' && dest.protocol !== 'https:') {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            ok: false,
            error: `Protocol not allowed: ${dest.protocol} (http/https only)`,
          })
        );
        return;
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

      let upstream: Response;
      try {
        upstream = await fetch(dest.toString(), {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            Accept: 'application/json,text/csv,text/plain,*/*',
            'User-Agent': 'cmb-dual-viz-fetch-proxy/1.0',
          },
        });
      } finally {
        clearTimeout(timer);
      }

      if (!upstream.ok) {
        res.statusCode = 502;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            ok: false,
            error: `Upstream HTTP ${upstream.status} ${upstream.statusText}`,
            url: dest.toString(),
            host: dest.host,
          })
        );
        return;
      }

      const buf = Buffer.from(await upstream.arrayBuffer());
      if (buf.byteLength > MAX_BYTES) {
        res.statusCode = 413;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            ok: false,
            error: `Payload exceeds ${MAX_BYTES} byte cap`,
            bytes: buf.byteLength,
            host: dest.host,
          })
        );
        return;
      }

      const contentType =
        upstream.headers.get('content-type') ?? 'application/octet-stream';
      const text = buf.toString('utf8');

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(
        JSON.stringify({
          ok: true,
          url: dest.toString(),
          host: dest.host,
          contentType,
          bytes: buf.byteLength,
          fetchedAt: Date.now(),
          text,
        })
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: message }));
    }
  });
}

export function fetchProxyPlugin(): Plugin {
  return {
    name: 'cmb-fetch-proxy',
    configureServer(server) {
      attachFetchProxy(server);
    },
    configurePreviewServer(server) {
      attachFetchProxy(server);
    },
  };
}
