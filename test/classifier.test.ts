import { describe, it, expect } from 'vitest';
import { GlinerClassifier } from '../src/classifier.js';
import { DEFAULT_CONNECTION_CONTEXTS } from '../src/contexts.js';
import type { GlinerClassification } from '../src/types.js';

describe('GlinerClassifier with injected classification', () => {
  it('ranks the injected scores', async () => {
    const clf = new GlinerClassifier({
      modelId: 'unused',
      labels: ['family', 'work', 'romantic'],
      classification: async () => ({ family: 0.8, work: 0.1, romantic: 0.4 }),
    });
    await clf.initialize();
    expect((await clf.classify('lunch with my sister')).map((c) => c.label)).toEqual([
      'family',
      'romantic',
      'work',
    ]);
  });

  it('passes labels, multiLabel, and threshold through to the extension point', async () => {
    let seen: Parameters<GlinerClassification>[0] | null = null;
    const clf = new GlinerClassifier({
      modelId: 'unused',
      labels: ['a', 'b'],
      multiLabel: true,
      threshold: 0.33,
      classification: async (input) => {
        seen = input;
        return {};
      },
    });
    await clf.initialize();
    await clf.classify('hello');
    expect(seen!.labels).toEqual(['a', 'b']);
    expect(seen!.multiLabel).toBe(true);
    expect(seen!.threshold).toBe(0.33);
  });

  it('omits the threshold in single-label mode so the best guess is not filtered', async () => {
    let seen: Parameters<GlinerClassification>[0] | null = null;
    const clf = new GlinerClassifier({
      modelId: 'unused',
      labels: ['family', 'work'],
      threshold: 0.9, // a high floor that would suppress a low best score
      classification: async (input) => {
        seen = input;
        return { family: 0.2, work: 0.05 };
      },
    });
    await clf.initialize();
    const out = await clf.classify('lunch with my sister');
    expect(seen!.threshold).toBeUndefined();
    // The best label is returned even though it sits below the floor.
    expect(out[0]).toEqual({ label: 'family', score: 0.2 });
  });

  it('deduplicates labels and defaults to single-label', async () => {
    let seen: Parameters<GlinerClassification>[0] | null = null;
    const clf = new GlinerClassifier({
      modelId: 'unused',
      labels: ['work', 'work', 'family'],
      classification: async (input) => {
        seen = input;
        return {};
      },
    });
    await clf.initialize();
    await clf.classify('hi');
    expect(seen!.labels).toEqual(['work', 'family']);
    expect(seen!.multiLabel).toBe(false);
  });

  it('short-circuits empty text without calling the extension point', async () => {
    let called = false;
    const clf = new GlinerClassifier({
      modelId: 'unused',
      labels: DEFAULT_CONNECTION_CONTEXTS,
      classification: async () => {
        called = true;
        return {};
      },
    });
    await clf.initialize();
    expect(await clf.classify('   ')).toEqual([]);
    expect(called).toBe(false);
  });

  it('throws if classify runs before initialize', async () => {
    const clf = new GlinerClassifier({
      modelId: 'unused',
      labels: ['x'],
      classification: async () => ({}),
    });
    await expect(clf.classify('hi')).rejects.toThrow(/initialize/);
  });

  it('rejects an empty label set at construction', () => {
    expect(() => new GlinerClassifier({ modelId: 'unused', labels: [] })).toThrow(/at least one/);
  });
});
