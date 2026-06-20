# graphwright-onnx

A no-LLM entity-extraction backend for [graphwright](https://github.com/hoofader/graphwright). It runs a [GLiNER](https://github.com/urchade/GLiNER) (zero-shot NER) model locally through ONNX and returns graphwright's `ExtractedEntities`, so it drops in wherever the LLM extractor would go: the deterministic fallback when there is no model provider, or when the data must not leave the machine.

It is a separate package on purpose. graphwright's core has zero runtime dependencies; the model runtime (`gliner`, ONNX, a tokenizer) lives here so the core stays light.

## Install

```bash
pnpm add graphwright-onnx graphwright @lmoe/gliner-onnx
```

`graphwright` is a peer dependency. `@lmoe/gliner-onnx` is the default GLiNER backend (it runs in Node via onnxruntime-node); install it to use the built-in extractor, or inject your own inference and skip it. It pulls a transformers.js runtime, so it is not a dependency of this package — the default install stays light.

## Model

GLiNER is zero-shot: you hand it labels and it scores spans against them. Point at a GLiNER (v1 / v2.1) ONNX model on the Hugging Face hub by id; the backend downloads the model + tokenizer on first use and caches them:

- [onnx-community GLiNER models](https://huggingface.co/onnx-community?search_models=gliner), e.g. `onnx-community/gliner_small-v2.1`.

Nothing is bundled — the model is fetched on demand.

## Use

```ts
import { GlinerExtractor } from 'graphwright-onnx';
import { resolveCandidates } from 'graphwright';

const extractor = new GlinerExtractor({
  modelId: 'onnx-community/gliner_small-v2.1',
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
  modelId: 'onnx-community/gliner_small-v2.1',
  labelMap: { person: 'person', company: 'place', product: 'concept' },
});
```

A label absent from the map is dropped.

## Classification

GLiNER2 adds zero-shot text classification alongside NER. `GlinerClassifier` scores a text against a set of candidate labels, which is how you label the relationship or connection-context a diary line is about (`family` / `work` / `romantic` / …). Attach the result to the edges graphwright proposes; the classifier proposes, the host disposes.

It needs a GLiNER2 model (the GLiNER1 models above do not classify):

```ts
import { GlinerClassifier, DEFAULT_CONNECTION_CONTEXTS } from 'graphwright-onnx';

const clf = new GlinerClassifier({
  modelId: 'lmo3/gliner2-multi-v1-onnx',
  labels: DEFAULT_CONNECTION_CONTEXTS, // or your own taxonomy
});
await clf.initialize();

await clf.classify('I had coffee with my sister');
// → [{ label: 'family', score: 0.91 }]  (ranked most likely first)
```

Single-label (the default) returns the best guess; pass `{ multiLabel: true, threshold: 0.3 }` to get every label the model keeps above the floor. Empty text returns `[]` without loading the model. The labels are yours: `DEFAULT_CONNECTION_CONTEXTS` is only a starting point. Like the extractor, the classification step is injectable (`{ classification }`) to test without a model or to reuse one loaded GLiNER2 runtime for both NER and classification.

## Notes

- Span offsets are character positions, equal to JS UTF-16 code units across the Basic Multilingual Plane (Latin and Persian align). Astral-plane input would need re-indexing.
- Inference can be injected (`{ inference }`) to test the mapping without a model, or to share one loaded model across extractors.

## License

Apache-2.0
