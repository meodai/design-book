import { parse, converter, toGamut } from 'culori';
import { createFunctionToken, extractDependencies } from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';
import { FunctionError } from '../../errors';
import { formatColor } from './scope-colors';

const toOklch = converter('oklch');
const toRgbGamut = toGamut('rgb', 'oklch');

/**
 * Tonal step that adapts to the input's lightness. If the input is light
 * (OKLCH L > 0.5) the result is darkened by `amount`; if it's dark, it's
 * lightened by `amount`. Useful when you want a subtle variation that's
 * always visible against the input — `darken(color.surface)` fails on a
 * dark surface, but `shade(color.surface)` keeps working.
 *
 * The shifted colour is gamut-mapped back into sRGB before formatting:
 * `formatHex` alone clips out-of-gamut channels, which skews the hue. The
 * input's alpha rides along untouched — a translucent input comes back as
 * 8-digit hex.
 */
export function shadeImpl(colorValue: string, amount: number): string {
  const parsed = parse(colorValue);
  if (!parsed) {
    throw new FunctionError(`shade: cannot parse colour "${colorValue}"`, 'shade');
  }

  const lch = toOklch(parsed);
  if (!lch || typeof lch.l !== 'number') {
    throw new FunctionError(
      `shade: cannot convert colour to OKLCH "${colorValue}"`,
      'shade',
    );
  }

  const newL = lch.l > 0.5
    ? Math.max(0, lch.l - amount)
    : Math.min(1, lch.l + amount);

  const result = formatColor(toRgbGamut({ ...lch, l: newL }));
  if (!result) {
    throw new FunctionError('shade: failed to format shaded colour', 'shade');
  }
  return result;
}

export function shade(
  color: TokenValue | ReferenceValue | FunctionTokenValue,
  options?: { amount?: number; description?: string },
): FunctionTokenValue {
  const amount = options?.amount ?? 0.1;
  return createFunctionToken(
    'shade',
    [color],
    {
      options: { amount },
      metadata: {
        dependencies: extractDependencies([color]),
        visualDependencies: [],
        returnType: 'color',
      },
    },
  );
}
