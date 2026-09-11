import { parse } from 'culori';
import { createFunctionToken, extractDependencies } from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';
import { FunctionError } from '../../errors';
import { cssColorMix } from './color-mix';
import { formatColor } from './scope-colors';

/**
 * Mixes a colour towards white in OKLCH — the JS twin of what the CSS
 * renderer emits, `color-mix(in oklch, <color> (1-amount)*100%, white)`, so a
 * token resolves to the same colour whether it is computed here or by the
 * browser — premultiplied alpha and all, so a translucent input comes back
 * translucent as 8-digit hex. The mix is gamut-mapped before formatting:
 * `formatHex` alone would clip out-of-sRGB channels and shift the hue.
 */
export function lightenImpl(colorValue: string, amount: number): string {
  const parsed = parse(colorValue);
  if (!parsed) {
    throw new FunctionError(
      `lighten: cannot parse color "${colorValue}"`,
      'lighten'
    );
  }

  const result = formatColor(cssColorMix(parsed, 'white', amount, 'oklch'));
  if (!result) {
    throw new FunctionError(
      `lighten: failed to format lightened color`,
      'lighten'
    );
  }

  return result;
}

export function lighten(
  color: TokenValue | ReferenceValue | FunctionTokenValue,
  options?: { amount?: number; description?: string }
): FunctionTokenValue {
  const amount = options?.amount ?? 0.1;
  return createFunctionToken(
    'lighten',
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
