import { valueArg, assertOptions } from '../args';
import { converter } from 'culori';
import { createFunctionToken } from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';
import { FunctionError } from '../../errors';
import { formatColor, gamutMapSrgb } from './color-math';
import { assertFraction } from './color-mix';
import { parseColor } from '../pool';

const toOklch = converter('oklch');

/**
 * Tonal step that adapts to the input's lightness. If the input is light
 * (OKLCH L > 0.5) the result is darkened by `amount`; if it's dark, it's
 * lightened by `amount`. Useful when you want a subtle variation that's
 * always visible against the input — `darken(color.surface)` fails on a
 * dark surface, but `shade(color.surface)` keeps working.
 *
 * The shifted color is gamut-mapped back into sRGB before formatting, the
 * way every transform does it (`gamutMapSrgb`: only when out of gamut, so an
 * in-gamut result is not shifted by a round trip): `formatHex` alone clips
 * out-of-gamut channels, which skews the hue. The
 * input's alpha rides along untouched — a translucent input comes back as
 * 8-digit hex.
 */
export function shadeImpl(colorValue: string, options?: { amount?: number }): string {
  const amount = options?.amount ?? 0.1;
  const parsed = parseColor(colorValue);
  if (!parsed) {
    throw new FunctionError(`shade: cannot parse color "${colorValue}"`, 'shade');
  }

  const lch = toOklch(parsed);
  if (!lch || typeof lch.l !== 'number') {
    throw new FunctionError(
      `shade: cannot convert color to OKLCH "${colorValue}"`,
      'shade',
    );
  }

  const newL = lch.l > 0.5
    ? Math.max(0, lch.l - amount)
    : Math.min(1, lch.l + amount);

  const result = formatColor(gamutMapSrgb({ ...lch, l: newL }));
  if (!result) {
    throw new FunctionError('shade: failed to format shaded color', 'shade');
  }
  return result;
}

export function shade(
  color: TokenValue | ReferenceValue | FunctionTokenValue,
  options?: { amount?: number; description?: string },
): FunctionTokenValue {
  assertOptions('shade', options, ['amount']);
  valueArg('shade', color);
  const amount = options?.amount ?? 0.1;
  assertFraction('shade', 'amount', amount);
  return createFunctionToken('shade', [color], {
    description: options?.description,
    options: { amount },
    metadata: { dependencies: [], returnType: 'color' },
  });
}
