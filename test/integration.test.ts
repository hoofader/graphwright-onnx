// Real GLiNER inference through the default backend (@lmoe/gliner-onnx).
// Gated so CI (which doesn't install the optional backend or download a
// model) skips it. To run:
//   pnpm add -D @lmoe/gliner-onnx
//   GRAPHWRIGHT_ONNX_RUN=1 pnpm exec vitest run test/integration.test.ts
// First run downloads the model + tokenizer from the Hugging Face hub.

import { describe, it, expect } from 'vitest';
import { GlinerExtractor } from '../src/index.js';

const RUN = process.env.GRAPHWRIGHT_ONNX_RUN === '1';
const MODEL_ID = process.env.GRAPHWRIGHT_ONNX_MODEL ?? 'onnx-community/gliner_small-v2.1';

describe.skipIf(!RUN)('GlinerExtractor — real inference', () => {
  it('extracts a person and a place from English text', async () => {
    const ex = new GlinerExtractor({ modelId: MODEL_ID, threshold: 0.4 });
    await ex.initialize();
    const out = await ex.extract('I had coffee with Sarah in Berlin yesterday.');
    expect(out.people.some((m) => /sarah/i.test(m.surface_form))).toBe(true);
    expect(out.places.some((m) => /berlin/i.test(m.surface_form))).toBe(true);
  }, 300_000);
});
