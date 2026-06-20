// Real GLiNER inference. Gated on a model path so CI (which has no model)
// skips it. To run:
//   GRAPHWRIGHT_ONNX_MODEL=/path/to/gliner.onnx \
//   GRAPHWRIGHT_ONNX_TOKENIZER=onnx-community/gliner_small-v2.1 \
//   pnpm test integration
// onnxruntime-node must be installed (the optional peer dep).

import { describe, it, expect } from 'vitest';
import { GlinerExtractor } from '../src/index.js';

const MODEL = process.env.GRAPHWRIGHT_ONNX_MODEL;
const TOKENIZER = process.env.GRAPHWRIGHT_ONNX_TOKENIZER ?? 'onnx-community/gliner_small-v2.1';

describe.skipIf(!MODEL)('GlinerExtractor — real inference', () => {
  it('extracts a person and a place from English text', async () => {
    const ex = new GlinerExtractor({
      tokenizerPath: TOKENIZER,
      modelPath: MODEL!,
      executionProvider: 'cpu',
      threshold: 0.4,
    });
    await ex.initialize();
    const out = await ex.extract('I had coffee with Sarah in Berlin yesterday.');
    expect(out.people.some((m) => /sarah/i.test(m.surface_form))).toBe(true);
    expect(out.places.some((m) => /berlin/i.test(m.surface_form))).toBe(true);
  }, 120_000);
});
