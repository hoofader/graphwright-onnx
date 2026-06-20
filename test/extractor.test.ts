import { describe, it, expect } from 'vitest';
import { GlinerExtractor } from '../src/extractor.js';
import type { GlinerEntity, GlinerInference } from '../src/types.js';

const fakeInference =
  (byText: Record<string, GlinerEntity[]>): GlinerInference =>
  async ({ texts }) =>
    texts.map((t) => byText[t] ?? []);

describe('GlinerExtractor with injected inference', () => {
  it('maps inference output into ExtractedEntities', async () => {
    const ex = new GlinerExtractor({
      modelId: 'unused',
      inference: fakeInference({
        'I saw Sarah in Tehran': [
          { spanText: 'Sarah', start: 6, end: 11, label: 'person', score: 0.9 },
          { spanText: 'Tehran', start: 15, end: 21, label: 'city', score: 0.8 },
        ],
      }),
    });
    await ex.initialize();
    const out = await ex.extract('I saw Sarah in Tehran');
    expect(out.people.map((m) => m.surface_form)).toEqual(['Sarah']);
    expect(out.places.map((m) => m.surface_form)).toEqual(['Tehran']);
    expect(out.concepts).toEqual([]);
  });

  it('throws if extract runs before initialize', async () => {
    const ex = new GlinerExtractor({
      modelId: 'unused',
      inference: fakeInference({}),
    });
    await expect(ex.extract('hi')).rejects.toThrow(/initialize/);
  });

  it('short-circuits empty text without calling inference', async () => {
    let called = false;
    const ex = new GlinerExtractor({
      modelId: 'unused',
      inference: async () => {
        called = true;
        return [[]];
      },
    });
    await ex.initialize();
    expect(await ex.extract('   ')).toEqual({ people: [], places: [], concepts: [] });
    expect(called).toBe(false);
  });

  it('passes the configured threshold and label set to inference', async () => {
    let seen: { texts: string[]; entities: string[]; threshold?: number } | null = null;
    const ex = new GlinerExtractor({
      modelId: 'unused',
      threshold: 0.33,
      inference: async (input) => {
        seen = input;
        return [[]];
      },
    });
    await ex.initialize();
    await ex.extract('hello');
    expect(seen!.threshold).toBe(0.33);
    expect(seen!.entities).toContain('person');
    expect(seen!.entities).toContain('location');
  });
});
