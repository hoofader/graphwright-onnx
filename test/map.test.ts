import { describe, it, expect } from 'vitest';
import { toExtractedEntities } from '../src/map.js';
import { DEFAULT_LABEL_MAP } from '../src/label-map.js';
import type { GlinerEntity } from '../src/types.js';

const span = (spanText: string, start: number, end: number, label: string, score: number): GlinerEntity => ({
  spanText,
  start,
  end,
  label,
  score,
});

describe('toExtractedEntities', () => {
  it('folds GLiNER labels into person / place / concept', () => {
    const out = toExtractedEntities(
      [
        span('Sarah', 0, 5, 'person', 0.9),
        span('Tehran', 10, 16, 'location', 0.8),
        span('birthday', 20, 28, 'event', 0.7),
      ],
      DEFAULT_LABEL_MAP,
    );
    expect(out.people.map((m) => m.surface_form)).toEqual(['Sarah']);
    expect(out.places.map((m) => m.surface_form)).toEqual(['Tehran']);
    expect(out.concepts.map((m) => m.surface_form)).toEqual(['birthday']);
  });

  it('drops a label that is not in the map', () => {
    const out = toExtractedEntities([span('$5', 0, 2, 'money', 0.9)], DEFAULT_LABEL_MAP);
    expect(out.people.length + out.places.length + out.concepts.length).toBe(0);
  });

  it('passes span + score through, nulls candidate_id, normalizes candidate_label', () => {
    const out = toExtractedEntities([span('Sarah', 3, 8, 'person', 0.42)], DEFAULT_LABEL_MAP);
    const m = out.people[0]!;
    expect(m).toMatchObject({ span_start: 3, span_end: 8, confidence: 0.42, candidate_id: null });
    expect(m.surface_form).toBe('Sarah');
    expect(m.candidate_label).toBe('sarah');
  });

  it('skips empty or zero-width spans', () => {
    const out = toExtractedEntities(
      [span('', 0, 0, 'person', 0.9), span('x', 5, 5, 'person', 0.9)],
      DEFAULT_LABEL_MAP,
    );
    expect(out.people).toEqual([]);
  });

  it('honors a custom label map', () => {
    const out = toExtractedEntities([span('Acme', 0, 4, 'org', 0.9)], { org: 'place' });
    expect(out.places.map((m) => m.surface_form)).toEqual(['Acme']);
  });

  it('matches the label case-insensitively', () => {
    const out = toExtractedEntities([span('Sarah', 0, 5, 'Person', 0.9)], DEFAULT_LABEL_MAP);
    expect(out.people).toHaveLength(1);
  });
});
