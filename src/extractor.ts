// graphwright-onnx — the GLiNER extractor.
//
// A drop-in for graphwright's LLM extractor that runs a GLiNER (zero-shot
// NER) ONNX model locally instead of calling a provider. Same output
// type (ExtractedEntities), so a host can use it as the no-LLM fallback:
// extract → mentions (pending) → graphwright's resolveCandidates →
// proposals. The model + tokenizer come from the host (a local .onnx
// file plus a Hugging Face tokenizer id); nothing is bundled.

import type { ExtractedEntities } from 'graphwright';
import type { GlinerInference, LabelMap } from './types.js';
import { DEFAULT_LABEL_MAP, labelsFor } from './label-map.js';
import { toExtractedEntities } from './map.js';

export type ExecutionProvider = 'cpu' | 'wasm' | 'webgpu' | 'webgl';

export interface GlinerExtractorConfig {
  /** Hugging Face tokenizer id, e.g. 'onnx-community/gliner_small-v2.1'. */
  tokenizerPath: string;
  /** The .onnx model: a filesystem path, or the bytes. */
  modelPath: string | Uint8Array | ArrayBufferLike;
  /** onnxruntime execution provider. Default 'cpu' (Node). */
  executionProvider?: ExecutionProvider;
  /** Label → kind folding. Default DEFAULT_LABEL_MAP. */
  labelMap?: LabelMap;
  /** Score floor handed to GLiNER. Default 0.5. */
  threshold?: number;
  /**
   * Inject an inference function instead of building a real GLiNER. The
   * library uses this for tests; a host could use it to share one loaded
   * model across extractors. When set, the `gliner` package is never
   * imported and the model fields are ignored.
   */
  inference?: GlinerInference;
}

const DEFAULT_THRESHOLD = 0.5;

export class GlinerExtractor {
  private readonly labelMap: LabelMap;
  private readonly labels: string[];
  private readonly threshold: number;
  private infer: GlinerInference | null = null;

  constructor(private readonly config: GlinerExtractorConfig) {
    this.labelMap = config.labelMap ?? DEFAULT_LABEL_MAP;
    this.labels = labelsFor(this.labelMap);
    this.threshold = config.threshold ?? DEFAULT_THRESHOLD;
  }

  /** Load the model (or accept the injected inference). Call once. */
  async initialize(): Promise<void> {
    if (this.config.inference) {
      this.infer = this.config.inference;
      return;
    }
    // Dynamic import so the heavy gliner/onnx stack only loads when a real
    // model is used — injected-inference callers never touch it.
    const { Gliner } = await import('gliner');
    const model = new Gliner({
      tokenizerPath: this.config.tokenizerPath,
      onnxSettings: {
        modelPath: this.config.modelPath,
        executionProvider: this.config.executionProvider ?? 'cpu',
      },
      modelType: 'gliner',
    });
    await model.initialize();
    this.infer = (input) => model.inference(input);
  }

  /** Extract entities from one text into graphwright's shape. */
  async extract(text: string): Promise<ExtractedEntities> {
    if (!this.infer) {
      throw new Error('GlinerExtractor.extract called before initialize()');
    }
    if (!text.trim()) return { people: [], places: [], concepts: [] };
    const perText = await this.infer({
      texts: [text],
      entities: this.labels,
      threshold: this.threshold,
    });
    return toExtractedEntities(perText[0] ?? [], this.labelMap);
  }
}
