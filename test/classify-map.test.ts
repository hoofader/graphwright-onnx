import { describe, it, expect } from 'vitest';
import { toClassifications } from '../src/classify-map.js';

describe('toClassifications', () => {
  it('ranks labels by score, high to low', () => {
    expect(toClassifications({ work: 0.2, family: 0.9, romantic: 0.5 })).toEqual([
      { label: 'family', score: 0.9 },
      { label: 'romantic', score: 0.5 },
      { label: 'work', score: 0.2 },
    ]);
  });

  it('keeps the runtime order on ties', () => {
    expect(toClassifications({ a: 0.5, b: 0.5, c: 0.5 }).map((c) => c.label)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('handles a single-label result', () => {
    expect(toClassifications({ shopping: 0.95 })).toEqual([{ label: 'shopping', score: 0.95 }]);
  });

  it('an empty map yields no classifications', () => {
    expect(toClassifications({})).toEqual([]);
  });
});
