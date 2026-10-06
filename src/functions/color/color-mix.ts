import { parse, interpolate, interpolateWithPremultipliedAlpha } from 'culori';
import { formatColor, gamutMapSrgb } from './scope-colors';
import { createFunctionToken, extractDependencies } from '../../tokens';
import type { Color } from 'culori';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';
import { FunctionError } from '../../errors';

/** Culori mode name for each CSS `<color-space>` keyword that is spelled
 *  differently. Shared with the CSS renderer, which uses the inverse. */
export const CSS_TO_CULORI_COLOR_SPACE: Record<string, string> = {
  srgb: 'rgb',
  'srgb-linear': 'lrgb',
  'display-p3': 'p3',
  'xyz-d65': 'xyz65',
  'xyz-d50': 'xyz50',
};

export const CULORI_TO_CSS_COLOR_SPACE: Record<string, string> = Object.fromEntries(
  Object.entries(CSS_TO_CULORI_COLOR_SPACE).map(([css, culori]) => [culori, css])
);

/** Accept either spelling on the way in. */
export function toCuloriColorSpace(colorSpace: string): string {
  return CSS_TO_CULORI_COLOR_SPACE[colorSpace] ?? colorSpace;
}

/** Emit the CSS spelling on the way out. */
export function toCssColorSpace(colorSpace: string): string {
  return CULORI_TO_CSS_COLOR_SPACE[colorSpace] ?? colorSpace;
}

/** The color CSS `color-mix(in <mode>, c1, c2)` computes at `ratio`:
 *  premultiplied-alpha interpolation — so a transparent color contributes
 *  nothing but its alpha — with the hue left unweighted because it is
 *  angular, then mapped into sRGB if (and only if) it landed outside it.
 *  Shared with lighten/darken so they stay the JS twin of the
 *  `color-mix()` the CSS renderer emits. */
export function cssColorMix(
  color1: Color | string,
  color2: Color | string,
  ratio: number,
  mode: string,
): Color {
  const mixed: Record<string, any> =
    interpolateWithPremultipliedAlpha([color1, color2] as any, mode as any)(ratio);
  if ('h' in mixed) {
    const unweighted: Record<string, any> =
      interpolate([color1, color2] as any, mode as any)(ratio);
    if (typeof unweighted.h === 'number') mixed.h = unweighted.h;
  }
  return gamutMapSrgb(mixed as Color);
}

/** Constructor-side check for a 0..1 fraction (a mix ratio, a lighten /
 *  darken amount), so a bad value fails where it is written rather than
 *  producing a nonsense color at resolve time. */
export function assertFraction(fn: string, label: string, value: unknown): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new FunctionError(`${fn}: \`${label}\` must be a number between 0 and 1, got ${String(value)}`, fn);
  }
}

export function colorMixImpl(
  color1Value: string,
  color2Value: string,
  ratio: number,
  colorSpace: string
): string {
  const parsed1 = parse(color1Value);
  if (!parsed1) {
    throw new FunctionError(
      `colorMix: cannot parse color1 "${color1Value}"`,
      'colorMix'
    );
  }

  const parsed2 = parse(color2Value);
  if (!parsed2) {
    throw new FunctionError(
      `colorMix: cannot parse color2 "${color2Value}"`,
      'colorMix'
    );
  }

  // Formatting straight to hex clips out-of-sRGB channels and skews the
  // hue (`#f99500` where the browser shows `#dda200`), and drops alpha;
  // cssColorMix gamut-maps, and formatColor emits 8-digit hex when the
  // result is translucent.
  const result = formatColor(
    cssColorMix(parsed1, parsed2, ratio, toCuloriColorSpace(colorSpace)),
  );

  if (!result) {
    throw new FunctionError(
      `colorMix: failed to format mixed color`,
      'colorMix'
    );
  }

  return result;
}

export function colorMix(
  color1: TokenValue | ReferenceValue | FunctionTokenValue,
  color2: TokenValue | ReferenceValue | FunctionTokenValue,
  options?: { ratio?: number; colorSpace?: string; description?: string }
): FunctionTokenValue {
  const ratio = options?.ratio ?? 0.5;
  const colorSpace = options?.colorSpace ?? 'lab';
  assertFraction('colorMix', 'ratio', ratio);
  return createFunctionToken(
    'colorMix',
    [color1, color2],
    {
      description: options?.description,
      options: { ratio, colorSpace },
      metadata: {
        dependencies: extractDependencies([color1, color2]),
        visualDependencies: [],
        returnType: 'color',
      },
    },
  );
}
