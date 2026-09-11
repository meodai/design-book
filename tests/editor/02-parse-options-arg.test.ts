import { describe, expect, it } from 'vitest';
import { color, colorMix, lighten } from '../../src/index';
import { parseTokenInput } from '../../editor/editor-input-parser';

// Item 2: parseOptionsArg silently dropped options it could not parse
// (single-quoted string values, leading-dot numbers), quietly falling back
// to the function's defaults instead of surfacing the bad input. These are
// hand-written forms — the serializer always emits valid double-quoted
// JSON via JSON.stringify, so a user typing single quotes or `.5` is the
// realistic failure case here, not a round trip.

describe('parseOptionsArg normalizes quotes/numbers and throws on failure', () => {
  it('accepts single-quoted string option values', () => {
    const parsed = parseTokenInput(
      "colorMix(color('#ffffff'), color('#000000'), { colorSpace: 'hsl', ratio: 0.3 })",
    );
    const expected = colorMix(color('#ffffff'), color('#000000'), { colorSpace: 'hsl', ratio: 0.3 });
    expect(parsed).toEqual(expected);
  });

  it('accepts leading-dot numbers', () => {
    const parsed = parseTokenInput("lighten(color('#ffffff'), { amount: .2 })");
    const expected = lighten(color('#ffffff'), { amount: 0.2 });
    expect(parsed).toEqual(expected);
  });

  it('throws a clear error instead of silently using defaults', () => {
    expect(() => parseTokenInput("lighten(color('#ffffff'), { amount: banana! })")).toThrow(Error);
  });
});
