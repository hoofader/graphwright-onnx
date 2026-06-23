// graphwright-onnx — shared types.

import type { ExtractionKind } from 'graphwright';

/** One GLiNER span. Mirrors the `gliner` package's result objects. */
export interface GlinerEntity {
  /** The extracted entity surface text. */
  spanText: string;
  /** Start character offset into the input text (inclusive). */
  start: number;
  /** End character offset (exclusive). */
  end: number;
  /** The label GLiNER assigned (one of the requested entity labels). */
  label: string;
  /** Confidence in [0, 1]. */
  score: number;
}

/**
 * The inference extension point: text(s) + requested labels → one entity list per
 * text. The real backend is the `gliner` package; tests inject a fake so
 * the mapping is exercised without loading a model.
 */
export type GlinerInference = (input: {
  texts: string[];
  entities: string[];
  threshold?: number;
}) => Promise<GlinerEntity[][]>;

/**
 * Folds a GLiNER label (compared lowercased) into one of graphwright's
 * three kinds. A label absent from the map is dropped — that is how you
 * scope which of GLiNER's zero-shot guesses survive.
 */
export type LabelMap = Record<string, ExtractionKind>;

/** One classification: a candidate label and its probability in [0, 1]. */
export interface Classification {
  label: string;
  score: number;
}

/**
 * The classification extension point (GLiNER2 only): text + candidate labels → a
 * label→score map. With `multiLabel` the runtime returns every label
 * above `threshold`; otherwise the single best. Tests inject a fake; a
 * host can inject a shared GLiNER2 runtime so one loaded model serves
 * both extraction and classification.
 */
export type GlinerClassification = (input: {
  text: string;
  labels: string[];
  multiLabel?: boolean;
  threshold?: number;
}) => Promise<Record<string, number>>;
