# graphwright-onnx

A no-LLM entity-extraction backend for [graphwright](https://github.com/hoofader/graphwright). It runs a [GLiNER](https://github.com/urchade/GLiNER) (zero-shot NER) model locally through ONNX and returns graphwright's `ExtractedEntities`, so it drops in wherever the LLM extractor would go: the deterministic fallback when there is no model provider, or when the data must not leave the machine.

It is a separate package on purpose. graphwright's core has zero runtime dependencies; the model runtime (`gliner`, ONNX, a tokenizer) lives here so the core stays light.

## Install

```bash
pnpm add graphwright-onnx graphwright onnxruntime-node
```

`graphwright` and `onnxruntime-node` are peer dependencies. `onnxruntime-node` is only needed to run a real model — code that injects its own inference (tests, a shared model) can skip it.

## Model

GLiNER is zero-shot: you hand it labels and it scores spans against them. You supply the ONNX model file and a tokenizer:

- Pre-converted models: [onnx-community on Hugging Face](https://huggingface.co/onnx-community?search_models=gliner) (e.g. `onnx-community/gliner_small-v2.1`).
- Or convert one with GLiNER's [`convert_to_onnx.py`](https://github.com/urchade/GLiNER/blob/main/convert_to_onnx.py).

Nothing is bundled — the model is the host's to fetch and keep.

## Use

```ts
import { GlinerExtractor } from 'graphwright-onnx';
import { resolveCandidates } from 'graphwright';

const extractor = new GlinerExtractor({
  tokenizerPath: 'onnx-community/gliner_small-v2.1',
  modelPath: './models/gliner.onnx',
  executionProvider: 'cpu',
  threshold: 0.5,
});
await extractor.initialize();

const extracted = await extractor.extract('I had coffee with Sarah in Berlin.');
// → { people: [{ surface_form: 'Sarah', span_start, span_end, confidence, candidate_id: null, ... }],
//     places: [{ surface_form: 'Berlin', ... }], concepts: [] }

// Hand the mentions to graphwright's resolution cascade exactly as you
// would the LLM extractor's output.
```

The output is `ExtractedEntities` with `candidate_id` always `null`: this is extraction (finding entities in text), not resolution (matching them to your catalog). graphwright's `resolveCandidates` does that next.

### Labels

GLiNER's labels fold into graphwright's three kinds (`person` / `place` / `concept`) via a `LabelMap`. The default asks for a generous synonym set (`person`, `location`, `city`, `event`, `activity`, …). Pass your own for a tighter or domain-specific vocabulary:

```ts
new GlinerExtractor({
  tokenizerPath,
  modelPath,
  labelMap: { person: 'person', company: 'place', product: 'concept' },
});
```

A label absent from the map is dropped.

## Notes

- Span offsets are character positions, equal to JS UTF-16 code units across the Basic Multilingual Plane (Latin and Persian align). Astral-plane input would need re-indexing.
- Inference can be injected (`{ inference }`) to test the mapping without a model, or to share one loaded model across extractors.

## License

Apache-2.0
