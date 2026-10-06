import { describe, it, expect } from 'vitest';
import { color } from '../../src/tokens';
import { FunctionError } from '../../src/errors';
import { lighten } from '../../src/functions/color/lighten';
import { darken } from '../../src/functions/color/darken';
import { colorMix } from '../../src/functions/color/color-mix';
import { relativeTo } from '../../src/functions/color/relative-to';

const c = () => color('#336699');

describe('constructors reject bad options up front', () => {
  it.each([-0.1, 1.5, NaN, Infinity])('colorMix ratio %s', (ratio) => {
    expect(() => colorMix(c(), c(), { ratio })).toThrow(FunctionError);
  });

  it.each([-0.1, 1.5, NaN])('lighten amount %s', (amount) => {
    expect(() => lighten(c(), { amount })).toThrow(FunctionError);
  });

  it.each([-0.1, 1.5, NaN])('darken amount %s', (amount) => {
    expect(() => darken(c(), { amount })).toThrow(FunctionError);
  });

  it('relativeTo with an unknown color space', () => {
    expect(() => relativeTo(c(), 'cmyk', [null, null, null])).toThrow(/relativeTo: unsupported color space "cmyk"/);
  });

  it('accepts the bounds', () => {
    expect(() => colorMix(c(), c(), { ratio: 0 })).not.toThrow();
    expect(() => colorMix(c(), c(), { ratio: 1 })).not.toThrow();
    expect(() => lighten(c(), { amount: 0 })).not.toThrow();
    expect(() => darken(c(), { amount: 1 })).not.toThrow();
    expect(() => relativeTo(c(), 'hsl', [null, null, null])).not.toThrow();
  });
});
