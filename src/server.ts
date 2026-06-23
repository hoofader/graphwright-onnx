// graphwright-onnx — a small HTTP service exposing the extractor.
//
// Wraps GlinerExtractor as a model service so a non-Node host can call it
// over HTTP. In particular it fills pg_graphwright's extractor extension point (a SQL
// function `f(text) -> text[]`): the host wires a SQL function that POSTs
// here and returns `surfaces`.
//
//   POST /extract  { "text": "..." }  ->  { "surfaces": ["...", ...] }
//   GET  /health                      ->  { "ok": true }
//
// One model is loaded once for the process; extraction is stateless, so the
// pg_graphwright maintenance worker (which drives extraction off the write
// path) can call it freely.

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import type { ExtractedEntities } from 'graphwright';
import { GlinerExtractor } from './extractor.js';

/** The flat, deduplicated surface list the extractor extension point expects. */
export function flattenSurfaces(entities: ExtractedEntities): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const group of [entities.people, entities.places, entities.concepts]) {
    for (const m of group) {
      if (m.surface_form && !seen.has(m.surface_form)) {
        seen.add(m.surface_form);
        out.push(m.surface_form);
      }
    }
  }
  return out;
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** An HTTP server over an already-initialized extractor. */
export function createExtractorServer(extractor: GlinerExtractor): Server {
  return createServer((req, res) => {
    void (async () => {
      try {
        if (req.method === 'GET' && req.url === '/health') {
          json(res, 200, { ok: true });
          return;
        }
        if (req.method === 'POST' && req.url === '/extract') {
          const text = (JSON.parse(await readBody(req)) as { text?: unknown }).text;
          if (typeof text !== 'string') {
            json(res, 400, { error: 'body must be {"text": string}' });
            return;
          }
          json(res, 200, { surfaces: flattenSurfaces(await extractor.extract(text)) });
          return;
        }
        json(res, 404, { error: 'not found' });
      } catch (err) {
        json(res, 500, { error: err instanceof Error ? err.message : 'error' });
      }
    })();
  });
}

/** Build the extractor from the environment and start listening. */
export async function startFromEnv(): Promise<Server> {
  const modelId = process.env.GRAPHWRIGHT_ONNX_MODEL_ID;
  if (!modelId) {
    throw new Error('set GRAPHWRIGHT_ONNX_MODEL_ID to a GLiNER ONNX model id');
  }
  const threshold = process.env.GRAPHWRIGHT_ONNX_THRESHOLD;
  const port = Number(process.env.GRAPHWRIGHT_ONNX_PORT ?? 8787);
  const extractor = new GlinerExtractor({
    modelId,
    ...(threshold !== undefined ? { threshold: Number(threshold) } : {}),
  });
  await extractor.initialize();
  const server = createExtractorServer(extractor);
  await new Promise<void>((resolve) => server.listen(port, resolve));
  // eslint-disable-next-line no-console
  console.log(`graphwright-onnx extractor listening on :${port} (model ${modelId})`);
  return server;
}

// Run as a server when executed directly (node dist/server.js).
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  startFromEnv().catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
