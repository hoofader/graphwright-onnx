# graphwright-onnx

[![CI](https://github.com/hoofader/graphwright-onnx/actions/workflows/ci.yml/badge.svg)](https://github.com/hoofader/graphwright-onnx/actions/workflows/ci.yml)

Entity extraction that runs entirely on your machine. No API key, no cloud call, nothing leaves the box.

graphwright-onnx is a no-LLM extraction backend for [graphwright](https://github.com/hoofader/graphwright). It runs a [GLiNER](https://github.com/urchade/GLiNER) (zero-shot NER) model locally through ONNX and returns graphwright's `ExtractedEntities`, so it drops in wherever the LLM extractor would go: the deterministic fallback when there is no model provider, or when the data must not leave the machine. It also classifies relationship context (`family` / `work` / `romantic`) with GLiNER2.

New to graphwright? Start with [graphwright](https://github.com/hoofader/graphwright); this package adds a local model backend for it.

It is a separate package on purpose. graphwright's core has zero runtime dependencies; the model runtime (`@lmoe/gliner-onnx`, ONNX, a tokenizer) lives here so the core stays light.

## Install

Not on npm yet. Install this package and its peers from the git source:

```bash
pnpm add github:hoofader/graphwright-onnx github:hoofader/graphwright @lmoe/gliner-onnx
# pnpm 11 skips native builds by default, so compile onnxruntime-node once:
pnpm rebuild onnxruntime-node
```

`graphwright` is a peer dependency. `@lmoe/gliner-onnx` is the default GLiNER backend (it runs in Node via onnxruntime-node); install it to use the built-in extractor, or inject your own inference and skip it. It is an optional peer, so a missing install fails with a message that tells you what to add, not a raw module-not-found. To run the extractor as an HTTP sidecar that `pg_graphwright` calls, see [Serve](#serve-http).

## Model

GLiNER is zero-shot: you hand it labels and it scores spans against them. Point at a GLiNER (v1 / v2.1) ONNX model on the Hugging Face hub by id; the backend downloads the model + tokenizer on first use and caches them:

- [onnx-community GLiNER models](https://huggingface.co/onnx-community?search_models=gliner), e.g. `onnx-community/gliner_small-v2.1`.

The first call to `initialize()` downloads a few hundred megabytes (model + tokenizer) and caches them locally; expect a minute or two on the first run, then the cache. GLiNER2 classification models are larger. Nothing is bundled.

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

GLiNER's labels fold into graphwright's three kinds (`person` / `place` / `concept`) via a `LabelMap`. The default asks for a generous synonym set (`person`, `location`, `city`, `event`, `activity`, ...). Pass your own for a tighter or domain-specific vocabulary:

```ts
new GlinerExtractor({
  modelId: 'onnx-community/gliner_small-v2.1',
  labelMap: { person: 'person', company: 'place', product: 'concept' },
});
```

A label absent from the map is dropped.

## Serve (HTTP)

A small HTTP service exposes the extractor, so a non-Node host can call it. It is how `pg_graphwright` fills its extractor extension point (a SQL function `f(text) -> text[]`): run the service, then wire a SQL function that POSTs to it.

```bash
GRAPHWRIGHT_ONNX_MODEL_ID=onnx-community/gliner_small-v2.1 \
GRAPHWRIGHT_ONNX_PORT=8787 \
  pnpm build && pnpm serve
```

```bash
curl -s localhost:8787/extract -H 'content-type: application/json' \
  -d '{"text":"Sara visited Tehran"}'
# {"surfaces":["Sara","Tehran"]}
```

One model is loaded for the process; `/extract` is stateless. The server binds `127.0.0.1` by default (the sidecar case); set `GRAPHWRIGHT_ONNX_HOST=0.0.0.0` to expose it more widely. `GRAPHWRIGHT_ONNX_THRESHOLD` overrides the score floor (a value in `[0, 1]`). The request body is capped at 1 MB. To embed the server in your own process (sharing a loaded model, adding auth), import `createExtractorServer(extractor)`.

## Classification

GLiNER2 adds zero-shot text classification alongside NER. `GlinerClassifier` scores a text against a set of candidate labels, which is how you label the relationship or connection-context a diary line is about (`family` / `work` / `romantic` / ...). Attach the result to the edges graphwright proposes; the classifier proposes, the host disposes.

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

Single-label (the default) returns the best guess regardless of its score; pass `{ multiLabel: true, threshold: 0.3 }` to get every label the model keeps above the floor. Empty text returns `[]` without loading the model. The labels are yours: `DEFAULT_CONNECTION_CONTEXTS` is only a starting point. Like the extractor, the classification step is injectable (`{ classification }`) to test without a model or to reuse one loaded GLiNER2 runtime for both NER and classification.

## Notes

- Span offsets are character positions, equal to JS UTF-16 code units across the Basic Multilingual Plane (Latin and Persian align). Astral-plane input would need re-indexing.
- Inference can be injected (`{ inference }`) to test the mapping without a model, or to share one loaded model across extractors.

## License

MIT
