import { describe, it, expect } from 'vitest';
import { color, px, ms } from '../../src/tokens';
import type { FunctionTokenValue } from '../../src/tokens';
import { lighten } from '../../src/functions/color/lighten';
import { darken } from '../../src/functions/color/darken';
import { shade } from '../../src/functions/color/shade';
import { colorMix } from '../../src/functions/color/color-mix';
import { relativeTo } from '../../src/functions/color/relative-to';
import { spacingScale } from '../../src/functions/non-color/spacing-scale';
import { typographyScale } from '../../src/functions/non-color/typography-scale';
import { timing } from '../../src/functions/non-color/timing';

const description = 'why this token exists';

const cases: Array<[string, () => FunctionTokenValue]> = [
  ['lighten', () => lighten(color('#336699'), { description })],
  ['darken', () => darken(color('#336699'), { description })],
  ['shade', () => shade(color('#336699'), { description })],
  ['colorMix', () => colorMix(color('#336699'), color('#ffffff'), { description })],
  ['relativeTo', () => relativeTo(color('#336699'), 'oklch', [null, null, null], { description })],
  ['spacingScale', () => spacingScale(px(4), { description })],
  ['typographyScale', () => typographyScale(px(16), { description })],
  ['timing', () => timing(ms(200), 'ease-out', { description })],
];

describe('function constructors keep options.description', () => {
  it.each(cases)('%s', (_name, make) => {
    expect(make().description).toBe(description);
  });
});
