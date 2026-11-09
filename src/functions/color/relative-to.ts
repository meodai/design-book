import { valueArg, assertOptions } from '../args';
import { parse, converter } from 'culori';
import { createFunctionToken } from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';
import { FunctionError } from '../../errors';
import { formatColor, gamutMapSrgb } from './color-math';

/** Channel order per color space. Culori's object key order is not a
 *  reliable channel order — `hsl` comes out `s, l, h`, and achromatic
 *  colors omit `h` entirely — so the order is pinned here and shared with
 *  the CSS renderer, which emits the same channels in the same slots. */
export const RELATIVE_TO_CHANNELS: Record<string, readonly [string, string, string]> = {
  oklch: ['l', 'c', 'h'],
  oklab: ['l', 'a', 'b'],
  lch: ['l', 'c', 'h'],
  lab: ['l', 'a', 'b'],
  hsl: ['h', 's', 'l'],
  rgb: ['r', 'g', 'b'],
};

/** Factor between the JS channel range (Culori's) and the CSS one, per
 *  channel. Culori keeps `hsl` s/l and `rgb` r/g/b in 0..1, while CSS
 *  relative-color syntax uses 0..100 and 0..255 respectively. Everything
 *  else (OKLab/OKLCH/Lab/LCH channels, hue degrees) already matches. */
export const RELATIVE_TO_CSS_SCALES: Record<string, readonly [number, number, number]> = {
  oklch: [1, 1, 1],
  oklab: [1, 1, 1],
  lch: [1, 1, 1],
  lab: [1, 1, 1],
  hsl: [1, 100, 100],
  rgb: [255, 255, 255],
};


export function relativeToChannels(colorSpace: string): readonly [string, string, string] {
  const channels = RELATIVE_TO_CHANNELS[colorSpace];
  if (!channels) {
    throw new FunctionError(
      `relativeTo: unsupported color space "${colorSpace}" ` +
      `(expected one of ${Object.keys(RELATIVE_TO_CHANNELS).join(', ')})`,
      'relativeTo'
    );
  }
  return channels;
}

export function relativeToImpl(
  colorValue: string,
  options: { colorSpace?: string; modifications?: Modification[] },
): string {
  const colorSpace = options.colorSpace ?? 'oklch';
  const modifications = options.modifications ?? [null, null, null];
  const channels = relativeToChannels(colorSpace);

  const parsed = parse(colorValue);
  if (!parsed) {
    throw new FunctionError(
      `relativeTo: cannot parse color "${colorValue}"`,
      'relativeTo'
    );
  }

  const toSpace = converter(colorSpace as any);
  const converted = toSpace(parsed);
  if (!converted) {
    throw new FunctionError(
      `relativeTo: cannot convert color to "${colorSpace}"`,
      'relativeTo'
    );
  }

  const modified = { ...converted } as any;
  // Culori leaves `h` undefined for achromatic colors, and `alpha` for
  // opaque ones; CSS relative-color syntax resolves them to 0 and 1.
  for (const channel of channels) {
    if (modified[channel] === undefined) modified[channel] = 0;
  }
  if (modified.alpha === undefined) modified.alpha = 1;

  // The three channels of the space, then alpha.
  const slots = [...channels, 'alpha'];
  for (let i = 0; i < modifications.length && i < slots.length; i++) {
    const mod = modifications[i];
    const channel = slots[i];
    if (mod === null || mod === undefined) continue;

    const currentValue = modified[channel] ?? 0;

    if (typeof mod === 'number') {
      modified[channel] = mod;
    } else if (typeof mod === 'string') {
      const operator = mod[0];
      const value = parseFloat(mod.slice(1));

      if (operator === '+') {
        modified[channel] = currentValue + value;
      } else if (operator === '-') {
        modified[channel] = currentValue - value;
      } else if (operator === '*') {
        modified[channel] = currentValue * value;
      } else if (operator === '/') {
        modified[channel] = currentValue / value;
      } else {
        // Treat as absolute numeric string
        modified[channel] = parseFloat(mod);
      }
    }
  }

  // Alpha is a fraction, as in CSS: changes past either end stop there.
  modified.alpha = Math.min(1, Math.max(0, modified.alpha));
  if (modified.alpha === 1) delete modified.alpha;

  // Out-of-sRGB results are gamut-mapped in OKLCH rather than clipped
  // channel-wise; a displayable one is left exactly as it is (see
  // gamutMapSrgb — the round trip costs 1/255 for the sRGB-based spaces).
  // Alpha is kept unless changed, as in CSS relative-color syntax, so a
  // translucent input comes back as 8-digit hex.
  const result = formatColor(gamutMapSrgb(modified));
  if (!result) {
    throw new FunctionError(
      `relativeTo: failed to format modified color`,
      'relativeTo'
    );
  }

  return result;
}

/** A channel change: `null` keeps it, a number sets it, `'+0.1'` / `'-20'` /
 *  `'*1.5'` / `'/2'` changes it, a numeric string sets it. The fourth slot is
 *  alpha, a fraction from 0 to 1. */
export type Modification = null | number | string;
const MODIFICATION = /^[+\-*/]?\s*-?(?:\d+\.?\d*|\.\d+)$/;

export function relativeTo(
  baseColor: TokenValue | ReferenceValue | FunctionTokenValue,
  colorSpace: string,
  modifications: Modification[],
  options?: { description?: string }
): FunctionTokenValue {
  assertOptions('relativeTo', options, []);
  valueArg('relativeTo', baseColor);
  relativeToChannels(colorSpace);
  if (!Array.isArray(modifications) || modifications.length > 4) {
    throw new FunctionError(`relativeTo: modifications are up to three channel changes and alpha, got ${JSON.stringify(modifications)}`, 'relativeTo');
  }
  for (const mod of modifications) {
    const ok = mod === null || (typeof mod === 'number' && Number.isFinite(mod))
      || (typeof mod === 'string' && MODIFICATION.test(mod.trim()));
    if (!ok) {
      throw new FunctionError(
        `relativeTo: a modification is null, a number, or an operator (+, -, *, /) and a number like '+0.1', got ${JSON.stringify(mod)}`,
        'relativeTo',
      );
    }
  }
  return createFunctionToken('relativeTo', [baseColor], {
    description: options?.description,
    options: { colorSpace, modifications },
    metadata: { dependencies: [], returnType: 'color' },
  });
}

/**
 * `color` with its opacity set to `alpha` (0 to 1), whatever it was: the
 * hex keeps the color and takes the alpha, `#1a1a1a` at 0.5 is `#1a1a1a80`.
 * It is `relativeTo(color, 'rgb', [null, null, null, alpha])`, so the color
 * is untouched, and it renders to CSS as `rgb(from var(--color) r g b /
 * 0.5)` — set, not multiplied: a color already half transparent comes out
 * at `alpha` too.
 */
export function withAlpha(
  color: TokenValue | ReferenceValue | FunctionTokenValue,
  alpha: number,
  options?: { description?: string },
): FunctionTokenValue {
  assertOptions('withAlpha', options, []);
  if (typeof alpha !== 'number' || !Number.isFinite(alpha) || alpha < 0 || alpha > 1) {
    throw new FunctionError(`withAlpha: \`alpha\` must be a number between 0 and 1, got ${String(alpha)}`, 'withAlpha');
  }
  return relativeTo(color, 'rgb', [null, null, null, alpha], options);
}

/** The alpha a `relativeTo` token is a `withAlpha` of, or `undefined` when
 *  it changes anything else — so the editor can print it as written. */
export function withAlphaOf(token: FunctionTokenValue): number | undefined {
  if (token.name !== 'relativeTo') return undefined;
  const { colorSpace, modifications } = (token.options ?? {}) as { colorSpace?: string; modifications?: Modification[] };
  if (colorSpace !== 'rgb' || !Array.isArray(modifications) || modifications.length !== 4) return undefined;
  const [r, g, b, a] = modifications;
  return r === null && g === null && b === null && typeof a === 'number' ? a : undefined;
}
