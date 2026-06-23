// graphwright-onnx — the GLiNER2 text classifier.
//
// GLiNER2 adds zero-shot classification on top of NER: given a text and a
// set of candidate labels, it scores the text against them. The use here
// is labelling the relationship or connection-context a diary line is
// about (family / work / romantic / …), which a host can attach to the
// edges graphwright proposes. The classifier proposes; the host disposes,
// the same contract GlinerExtractor follows for entities.
//
// The default backend is `@lmoe/gliner-onnx`'s GLiNER2ONNXRuntime, loaded
// the same way the extractor loads GLiNER1: a dynamic import via a non-
// literal specifier, so the heavy runtime stays optional. Point modelId
// at a GLiNER2 classification model, e.g. 'lmo3/gliner2-multi-v1-onnx'.

import type { Classification, GlinerClassification } from './types.js';
import { toClassifications } from './classify-map.js';

export interface GlinerClassifierConfig {
  /**
   * Hugging Face model id for a GLiNER2 ONNX model that supports
   * classification, e.g. 'lmo3/gliner2-multi-v1-onnx'. GLiNER1 models do
   * not classify.
   */
  modelId: string;
  /** Candidate labels (the relationship / connection-context taxonomy). */
  labels: readonly string[];
  /**
   * Return every label above `threshold` instead of the single best.
   * Default false.
   */
  multiLabel?: boolean;
  /** Score floor for multi-label output. Default 0.5. Ignored otherwise. */
  threshold?: number;
  /**
   * Inject a classification function instead of building the default
   * backend. Tests use this; a host can reuse one loaded GLiNER2 runtime
   * for both extraction and classification. When set, `@lmoe/gliner-onnx`
   * is never imported.
   */
  classification?: GlinerClassification;
}

const DEFAULT_THRESHOLD = 0.5;

// Minimal shape of GLiNER2ONNXRuntime we use, declared locally so the
// optional peer is not needed at typecheck.
interface Lmoe2Runtime {
  classify(
    text: string,
    labels: readonly string[],
    options?: { threshold?: number; multiLabel?: boolean },
  ): Promise<Record<string, number>>;
}
interface Lmoe2Module {
  GLiNER2ONNXRuntime: { fromPretrained(modelId: string): Promise<Lmoe2Runtime> };
}

export class GlinerClassifier {
  private readonly labels: string[];
  private readonly multiLabel: boolean;
  private readonly threshold: number;
  private classifyFn: GlinerClassification | null = null;

  constructor(private readonly config: GlinerClassifierConfig) {
    this.labels = [...new Set(config.labels)];
    if (this.labels.length === 0) throw new Error('GlinerClassifier needs at least one label');
    this.multiLabel = config.multiLabel ?? false;
    this.threshold = config.threshold ?? DEFAULT_THRESHOLD;
  }

  /** Load the model (or accept the injected classification). Call once. */
  async initialize(): Promise<void> {
    if (this.classifyFn) return; // idempotent: a second call must not reload the model.
    if (this.config.classification) {
      this.classifyFn = this.config.classification;
      return;
    }
    const backend = '@lmoe/gliner-onnx';
    let mod: Lmoe2Module;
    try {
      mod = (await import(backend)) as unknown as Lmoe2Module;
    } catch {
      throw new Error(
        `Install ${backend} to use the default GLiNER2 backend (pnpm add ${backend}), ` +
          'or pass { classification } to plug your own runtime.',
      );
    }
    const runtime = await mod.GLiNER2ONNXRuntime.fromPretrained(this.config.modelId);
    this.classifyFn = ({ text, labels, multiLabel, threshold }) => {
      const options: { threshold?: number; multiLabel?: boolean } = {};
      if (threshold !== undefined) options.threshold = threshold;
      if (multiLabel !== undefined) options.multiLabel = multiLabel;
      return runtime.classify(text, labels, options);
    };
  }

  /**
   * Classify one text, ranked most likely first. Single-label returns the
   * best guess regardless of its score (threshold it yourself if you need
   * a floor); multi-label returns the labels the runtime kept. Empty text
   * returns [] without touching the model.
   */
  async classify(text: string): Promise<Classification[]> {
    if (!this.classifyFn) {
      throw new Error('GlinerClassifier.classify called before initialize()');
    }
    if (!text.trim()) return [];
    const input: Parameters<GlinerClassification>[0] = {
      text,
      labels: this.labels,
      multiLabel: this.multiLabel,
    };
    // Single-label must return the best guess regardless of score. Passing
    // the floor in that mode can make the runtime return nothing when the
    // top score sits below it, which contradicts the documented contract.
    if (this.multiLabel) input.threshold = this.threshold;
    const raw = await this.classifyFn(input);
    return toClassifications(raw);
  }
}
