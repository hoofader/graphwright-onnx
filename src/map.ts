// graphwright-onnx — the pure mapping from GLiNER spans to graphwright's
// extraction shape. No model, no IO: this is the testable core.

import { normalizeName, type ExtractedEntities, type ExtractedMention } from 'graphwright';
import type { GlinerEntity, LabelMap } from './types.js';

/**
 * Fold one text's GLiNER spans into graphwright's ExtractedEntities.
 * candidate_id is always null: this is extraction (finding entities in
 * text), not resolution (matching them to a catalog) — graphwright's
 * resolveCandidates does that next. Offsets pass through as character
 * positions, which equal JS UTF-16 code units across the BMP (so Latin
 * and Persian align; astral-plane input would need re-indexing).
 */
export function toExtractedEntities(spans: GlinerEntity[], labelMap: LabelMap): ExtractedEntities {
  const out: ExtractedEntities = { people: [], places: [], concepts: [] };
  for (const e of spans) {
    const kind = labelMap[e.label.toLowerCase()];
    if (!kind) continue;
    if (e.end <= e.start || !e.spanText) continue;
    const mention: ExtractedMention = {
      kind,
      surface_form: e.spanText,
      span_start: e.start,
      span_end: e.end,
      candidate_label: normalizeName(e.spanText),
      candidate_id: null,
      confidence: e.score,
    };
    if (kind === 'person') out.people.push(mention);
    else if (kind === 'place') out.places.push(mention);
    else out.concepts.push(mention);
  }
  return out;
}
