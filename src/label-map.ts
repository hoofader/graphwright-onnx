// graphwright-onnx — the default label vocabulary.
//
// GLiNER is zero-shot: you hand it a list of labels and it scores spans
// against them. We ask for a generous synonym set, then fold each label
// into graphwright's person / place / concept. Hosts that want a tighter
// or domain-specific vocabulary pass their own LabelMap.

import type { LabelMap } from './types.js';

export const DEFAULT_LABEL_MAP: LabelMap = {
  person: 'person',
  people: 'person',
  place: 'place',
  location: 'place',
  city: 'place',
  country: 'place',
  venue: 'place',
  concept: 'concept',
  topic: 'concept',
  event: 'concept',
  activity: 'concept',
};

/** The labels handed to GLiNER (the keys of a map, deduplicated). */
export function labelsFor(map: LabelMap): string[] {
  return [...new Set(Object.keys(map))];
}
