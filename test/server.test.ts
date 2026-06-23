// The HTTP service is exercised with an injected inference, so the request
// contract (and the surface flattening) is checked without loading a model.

import { afterEach, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import {
  GlinerExtractor,
  createExtractorServer,
  type GlinerEntity,
  type GlinerInference,
} from '../src/index.js';

const span = (spanText: string, label: string, start = 0): GlinerEntity => ({
  spanText,
  start,
  end: start + spanText.length,
  label,
  score: 0.9,
});

// 'Sara' twice (to prove dedup), 'Tehran' as a city (folds to place).
const inference: GlinerInference = async ({ texts }) =>
  texts.map((t) => {
    const out: GlinerEntity[] = [];
    if (t.includes('Sara')) out.push(span('Sara', 'person'), span('Sara', 'person'));
    if (t.includes('Tehran')) out.push(span('Tehran', 'city'));
    return out;
  });

describe('extractor http service', () => {
  let server: Server | undefined;
  afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

  async function start(): Promise<string> {
    const extractor = new GlinerExtractor({ modelId: 'test', inference });
    await extractor.initialize();
    server = createExtractorServer(extractor);
    await new Promise<void>((r) => server!.listen(0, r));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  it('POST /extract returns the flat, deduped surfaces', async () => {
    const base = await start();
    const res = await fetch(`${base}/extract`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Sara visited Tehran' }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ surfaces: ['Sara', 'Tehran'] });
  });

  it('GET /health is ok', async () => {
    const base = await start();
    const res = await fetch(`${base}/health`);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('rejects a body that is not {text: string}', async () => {
    const base = await start();
    const res = await fetch(`${base}/extract`, { method: 'POST', body: '{}' });
    expect(res.status).toBe(400);
  });

  it('rejects a body that is not valid JSON with 400, not 500', async () => {
    const base = await start();
    const res = await fetch(`${base}/extract`, { method: 'POST', body: 'not json at all' });
    expect(res.status).toBe(400);
  });
});
