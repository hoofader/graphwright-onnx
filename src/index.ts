// graphwright-onnx — public API.
//
// A no-LLM extraction backend for graphwright. Point it at a GLiNER ONNX
// model + tokenizer, call extract(text), and feed the resulting
// ExtractedEntities into graphwright's resolution cascade exactly as you
// would the LLM extractor's output.

export { GlinerExtractor } from './extractor.js';
export type { GlinerExtractorConfig } from './extractor.js';
export { GlinerClassifier } from './classifier.js';
export type { GlinerClassifierConfig } from './classifier.js';
export { toExtractedEntities } from './map.js';
export { toClassifications } from './classify-map.js';
export { DEFAULT_LABEL_MAP, labelsFor } from './label-map.js';
export { DEFAULT_CONNECTION_CONTEXTS } from './contexts.js';
export type { Classification, GlinerClassification, GlinerEntity, GlinerInference, LabelMap } from './types.js';
