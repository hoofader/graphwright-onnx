// graphwright-onnx — the GLiNER extractor.
//
// A drop-in for graphwright's LLM extractor that runs a zero-shot GLiNER
// model locally instead of calling a provider. Same output type
// (ExtractedEntities), so a host can use it as the no-LLM fallback:
// extract → mentions (pending) → graphwright's resolveCandidates →
// proposals. The default backend is `@lmoe/gliner-onnx` (Node-native,
// onnxruntime-node under the hood); fromPretrained downloads the model +
// tokenizer from the Hugging Face hub. Nothing is bundled.

import type { ExtractedEntities } from 'graphwright';
import type { GlinerInference, LabelMap } from './types.js';
import { DEFAULT_LABEL_MAP, labelsFor } from './label-map.js';
import { toExtractedEntities } from './map.js';

export interface GlinerExtractorConfig {
  /**
   * Hugging Face model id for a GLiNER (v1 / v2.1) ONNX model, e.g.
   * 'onnx-community/gliner_small-v2.1'. The backend downloads the model
   * and tokenizer on first use.
   */
  modelId: string;
  /** Label → kind folding. Default DEFAULT_LABEL_MAP. */
  labelMap?: LabelMap;
  /** Score floor handed to GLiNER. Default 0.5. */
  threshold?: number;
  /**
   * Inject an inference function instead of building the default backend.
   * The library uses this for tests; a host can use it to plug a
   * different GLiNER runtime or share one loaded model. When set, the
   * `@lmoe/gliner-onnx` package is never imported.
   */
  inference?: GlinerInference;
}

const DEFAULT_THRESHOLD = 0.5;

// Minimal shape of `@lmoe/gliner-onnx` we depend on, declared locally so
// the optional peer is not needed at typecheck.
interface LmoeRuntime {
  extractEntitiesBatch(
    texts: string[],
    labels: readonly string[],
    options?: { threshold?: number },
  ): Promise<{ text: string; label: string; start: number; end: number; score: number }[][]>;
}
interface LmoeModule {
  GLiNER1ONNXRuntime: { fromPretrained(modelId: string): Promise<LmoeRuntime> };
}

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
    if (this.infer) return; // idempotent: a second call must not reload the model.
    if (this.config.inference) {
      this.infer = this.config.inference;
      return;
    }
    // Dynamic import via a non-literal specifier: the heavy backend
    // (transformers.js + onnxruntime) only loads when a real model is
    // used, and as an optional peer it need not resolve at typecheck.
    const backend = '@lmoe/gliner-onnx';
    let mod: LmoeModule;
    try {
      mod = (await import(backend)) as unknown as LmoeModule;
    } catch {
      // The optional peer is missing; a raw ERR_MODULE_NOT_FOUND from deep
      // in the import is not actionable, so say what to do.
      throw new Error(
        `Install ${backend} to use the default GLiNER backend (pnpm add ${backend}), ` +
          'or pass { inference } to plug your own runtime.',
      );
    }
    const runtime = await mod.GLiNER1ONNXRuntime.fromPretrained(this.config.modelId);
    this.infer = async ({ texts, entities, threshold }) => {
      const batch = await runtime.extractEntitiesBatch(
        texts,
        entities,
        threshold !== undefined ? { threshold } : undefined,
      );
      return batch.map((ents) =>
        ents.map((e) => ({
          spanText: e.text,
          start: e.start,
          end: e.end,
          label: e.label,
          score: e.score,
        })),
      );
    };
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
