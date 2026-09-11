import { parse, interpolate, interpolateWithPremultipliedAlpha, toGamut } from 'culori';
import { formatColor } from './scope-colors';
import { createFunctionToken, extractDependencies } from '../../tokens';
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

const toRgbGamut = toGamut('rgb', 'oklch');

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

  const mode = toCuloriColorSpace(colorSpace);
  // CSS `color-mix()` interpolates with premultiplied alpha, so a fully
  // transparent colour contributes nothing but its alpha. Hue is the
  // exception — it is angular, and the spec interpolates it unweighted.
  const mixed: Record<string, any> =
    interpolateWithPremultipliedAlpha([parsed1, parsed2], mode as any)(ratio);
  if ('h' in mixed) {
    const unweighted: Record<string, any> =
      interpolate([parsed1, parsed2], mode as any)(ratio);
    if (typeof unweighted.h === 'number') mixed.h = unweighted.h;
  }

  // Formatting straight to hex clips out-of-sRGB channels and skews the
  // hue (`#f99500` where the browser shows `#dda200`); map into gamut
  // first, the way lighten/darken/shade do.
  const result = formatColor(toRgbGamut(mixed as any));

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
  return createFunctionToken(
    'colorMix',
    [color1, color2],
    {
      options: { ratio, colorSpace },
      metadata: {
        dependencies: extractDependencies([color1, color2]),
        visualDependencies: [],
        returnType: 'color',
      },
    },
  );
}
