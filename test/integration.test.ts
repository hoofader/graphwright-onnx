// Real GLiNER inference through the default backend (@lmoe/gliner-onnx).
// Gated so CI (which doesn't install the optional backend or download a
// model) skips it. To run:
//   pnpm add -D @lmoe/gliner-onnx
//   pnpm rebuild onnxruntime-node   # pnpm 11 skips its native build by default
//   GRAPHWRIGHT_ONNX_RUN=1 ./node_modules/.bin/vitest run test/integration.test.ts
// First run downloads the model + tokenizer from the Hugging Face hub, so
// give it a few minutes; the GLiNER2 classifier model is the larger one.
// (Run vitest directly: `pnpm exec` re-checks the install and trips on the
// un-approved native build above.)

import { describe, it, expect } from 'vitest';
import { GlinerClassifier, GlinerExtractor } from '../src/index.js';

const RUN = process.env.GRAPHWRIGHT_ONNX_RUN === '1';
const MODEL_ID = process.env.GRAPHWRIGHT_ONNX_MODEL ?? 'onnx-community/gliner_small-v2.1';
const GLINER2_MODEL = process.env.GRAPHWRIGHT_ONNX_GLINER2_MODEL ?? 'lmo3/gliner2-multi-v1-onnx';

describe.skipIf(!RUN)('GlinerExtractor — real inference', () => {
  it('extracts a person and a place from English text', async () => {
    const ex = new GlinerExtractor({ modelId: MODEL_ID, threshold: 0.4 });
    await ex.initialize();
    const out = await ex.extract('I had coffee with Sarah in Berlin yesterday.');
    expect(out.people.some((m) => /sarah/i.test(m.surface_form))).toBe(true);
    expect(out.places.some((m) => /berlin/i.test(m.surface_form))).toBe(true);
  }, 300_000);
});

describe.skipIf(!RUN)('GlinerClassifier — real inference (GLiNER2)', () => {
  it('classifies a line into its top label', async () => {
    const clf = new GlinerClassifier({
      modelId: GLINER2_MODEL,
      labels: ['shopping', 'work', 'entertainment'],
    });
    await clf.initialize();
    const ranked = await clf.classify('Buy milk from the store');
    expect(ranked[0]?.label).toBe('shopping');
  }, 300_000);

  it('returns several labels above threshold when multiLabel is set', async () => {
    const clf = new GlinerClassifier({
      modelId: GLINER2_MODEL,
      labels: ['shopping', 'work', 'entertainment'],
      multiLabel: true,
      threshold: 0.3,
    });
    await clf.initialize();
    const ranked = await clf.classify('Buy milk and finish the report');
    expect(ranked.map((c) => c.label)).toEqual(expect.arrayContaining(['shopping', 'work']));
  }, 300_000);
});
