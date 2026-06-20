// graphwright-onnx — a starting vocabulary for classifying the context
// of a connection in diary-style text. GLiNER2 is zero-shot, so these are
// only a default; pass your own taxonomy to GlinerClassifier({ labels }).

export const DEFAULT_CONNECTION_CONTEXTS = [
  'family',
  'friendship',
  'romantic',
  'work',
  'school',
  'neighbor',
  'community',
  'online',
] as const;
