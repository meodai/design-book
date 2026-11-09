import { valueArg } from '../args';
import { createFunctionToken } from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';
import { FunctionError } from '../../errors';
import { assertFraction, cssColorMix } from './color-mix';
import { formatColor } from './color-math';
import { parseColor } from '../pool';

/**
 * `lighten` / `darken`: mix a color towards white / black in OKLCH — the JS
 * twin of what the CSS renderer emits, `color-mix(in oklch, <color>
 * (1-amount)*100%, white)`, so a token resolves to the same color whether
 * it is computed here or by the browser — premultiplied alpha and all, so a
 * translucent input comes back translucent as 8-digit hex. The mix is
 * gamut-mapped before formatting: `formatHex` alone would clip out-of-sRGB
 * channels and shift the hue.
 */
const TOWARDS = { lighten: 'white', darken: 'black' } as const;
type Towards = keyof typeof TOWARDS;

function mixTowards(fn: Towards, colorValue: string, amount: number): string {
  const parsed = parseColor(colorValue);
  if (!parsed) throw new FunctionError(`${fn}: cannot parse color "${colorValue}"`, fn);
  const result = formatColor(cssColorMix(parsed, TOWARDS[fn], amount, 'oklch'));
  if (!result) throw new FunctionError(`${fn}: failed to format ${fn === 'lighten' ? 'lightened' : 'darkened'} color`, fn);
  return result;
}

export function lightenImpl(colorValue: string, options?: { amount?: number }): string {
  return mixTowards('lighten', colorValue, options?.amount ?? 0.1);
}

export function darkenImpl(colorValue: string, options?: { amount?: number }): string {
  return mixTowards('darken', colorValue, options?.amount ?? 0.1);
}

function build(
  fn: Towards,
  color: TokenValue | ReferenceValue | FunctionTokenValue,
  options?: { amount?: number; description?: string },
): FunctionTokenValue {
  valueArg(fn, color);
  const amount = options?.amount ?? 0.1;
  assertFraction(fn, 'amount', amount);
  return createFunctionToken(fn, [color], {
    description: options?.description,
    options: { amount },
    metadata: { dependencies: [], returnType: 'color' },
  });
}

/** Mix a color `amount` (0–1, default 0.1) of the way towards white, in OKLCH. */
export function lighten(color: TokenValue | ReferenceValue | FunctionTokenValue, options?: { amount?: number; description?: string }): FunctionTokenValue {
  return build('lighten', color, options);
}

/** Mix a color `amount` (0–1, default 0.1) of the way towards black, in OKLCH. */
export function darken(color: TokenValue | ReferenceValue | FunctionTokenValue, options?: { amount?: number; description?: string }): FunctionTokenValue {
  return build('darken', color, options);
}
