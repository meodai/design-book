import { parse, formatHex, converter } from 'culori';
import { createFunctionToken, extractDependencies } from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';
import { FunctionError } from '../../errors';

const toHsl = converter('hsl');

export function darkenImpl(colorValue: string, amount: number): string {
  const parsed = parse(colorValue);
  if (!parsed) {
    throw new FunctionError(
      `darken: cannot parse color "${colorValue}"`,
      'darken'
    );
  }

  const hslColor = toHsl(parsed);
  if (!hslColor) {
    throw new FunctionError(
      `darken: cannot convert color to HSL "${colorValue}"`,
      'darken'
    );
  }

  // Decrease lightness, clamp to 0
  const newL = Math.max(0, (hslColor.l ?? 0) - amount);
  const darkened = { ...hslColor, l: newL };

  const result = formatHex(darkened);
  if (!result) {
    throw new FunctionError(
      `darken: failed to format darkened color`,
      'darken'
    );
  }

  return result;
}

export function darken(
  color: TokenValue | ReferenceValue,
  options?: { amount?: number; description?: string }
): FunctionTokenValue {
  const amount = options?.amount ?? 0.1;
  return createFunctionToken(
    'darken',
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
