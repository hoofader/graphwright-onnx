// graphwright-onnx — the pure mapping from GLiNER2's classification
// output to a ranked label list. No model, no IO: the testable core,
// matching how map.ts handles the NER side.

import type { Classification } from './types.js';

/**
 * Rank a GLiNER2 label→score map from most to least likely. V8's sort is
 * stable, so labels that tie on score keep the runtime's order. Single-
 * label classification yields one entry; multi-label yields the set the
 * runtime kept above its threshold.
 */
export function toClassifications(raw: Record<string, number>): Classification[] {
  return Object.entries(raw)
    .map(([label, score]) => ({ label, score }))
    .sort((a, b) => b.score - a.score);
}
