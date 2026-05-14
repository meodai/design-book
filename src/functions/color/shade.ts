import { parse, formatHex, converter } from 'culori';
import { createFunctionToken, extractDependencies } from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';
import { FunctionError } from '../../errors';

const toOklch = converter('oklch');

/**
 * Tonal step that adapts to the input's lightness. If the input is light
 * (OKLCH L > 0.5) the result is darkened by `amount`; if it's dark, it's
 * lightened by `amount`. Useful when you want a subtle variation that's
 * always visible against the input — `darken(color.surface)` fails on a
 * dark surface, but `shade(color.surface)` keeps working.
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

  const result = formatHex({ ...lch, l: newL });
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
