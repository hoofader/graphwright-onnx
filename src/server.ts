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

// Extraction inputs are short; cap the body so a stray large payload
// cannot exhaust process memory before parsing.
const MAX_BODY_BYTES = 1_000_000;

class BodyTooLargeError extends Error {}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    total += buf.length;
    if (total > MAX_BODY_BYTES) {
      // Throwing ends the for-await, which tears down the request stream;
      // the handler maps this to 413.
      throw new BodyTooLargeError();
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function json(res: ServerResponse, status: number, body: unknown): void {
  // The body-limit abort can close the socket first; never write twice.
  if (res.writableEnded || res.destroyed) return;
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
          let body: string;
          try {
            body = await readBody(req);
          } catch (err) {
            if (err instanceof BodyTooLargeError) {
              json(res, 413, { error: 'request body too large' });
              return;
            }
            throw err;
          }
          let parsed: { text?: unknown };
          try {
            parsed = JSON.parse(body) as { text?: unknown };
          } catch {
            json(res, 400, { error: 'body must be valid JSON: {"text": string}' });
            return;
          }
          if (typeof parsed.text !== 'string') {
            json(res, 400, { error: 'body must be {"text": string}' });
            return;
          }
          json(res, 200, { surfaces: flattenSurfaces(await extractor.extract(parsed.text)) });
          return;
        }
        json(res, 404, { error: 'not found' });
      } catch (err) {
        // Onnx/transformers errors can carry local file paths; keep them
        // out of the response (and the caller's logs, e.g. Postgres). Log
        // the detail server-side instead.
        // eslint-disable-next-line no-console
        console.error('graphwright-onnx /extract failed:', err);
        json(res, 500, { error: 'extraction failed' });
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
  const port = Number(process.env.GRAPHWRIGHT_ONNX_PORT ?? 8787);
  // Default to loopback: the documented use is a sidecar that Postgres
  // calls on the same host. Opt into a wider bind explicitly.
  const host = process.env.GRAPHWRIGHT_ONNX_HOST ?? '127.0.0.1';
  const rawThreshold = process.env.GRAPHWRIGHT_ONNX_THRESHOLD;
  let threshold: number | undefined;
  if (rawThreshold !== undefined) {
    threshold = Number(rawThreshold);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
      throw new Error(
        `GRAPHWRIGHT_ONNX_THRESHOLD must be a number in [0, 1], got ${JSON.stringify(rawThreshold)}`,
      );
    }
  }
  const extractor = new GlinerExtractor({
    modelId,
    ...(threshold !== undefined ? { threshold } : {}),
  });
  await extractor.initialize();
  const server = createExtractorServer(extractor);
  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  // eslint-disable-next-line no-console
  console.log(`graphwright-onnx extractor listening on ${host}:${port} (model ${modelId})`);
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
