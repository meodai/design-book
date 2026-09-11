import { parse, formatHex, converter, toGamut, inGamut } from 'culori';
import { createFunctionToken, extractDependencies } from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';
import { FunctionError } from '../../errors';

/** Channel order per colour space. Culori's object key order is not a
 *  reliable channel order — `hsl` comes out `s, l, h`, and achromatic
 *  colours omit `h` entirely — so the order is pinned here and shared with
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
 *  relative-colour syntax uses 0..100 and 0..255 respectively. Everything
 *  else (OKLab/OKLCH/Lab/LCH channels, hue degrees) already matches. */
export const RELATIVE_TO_CSS_SCALES: Record<string, readonly [number, number, number]> = {
  oklch: [1, 1, 1],
  oklab: [1, 1, 1],
  lch: [1, 1, 1],
  lab: [1, 1, 1],
  hsl: [1, 100, 100],
  rgb: [255, 255, 255],
};

const toRgbGamut = toGamut('rgb', 'oklch');
const isInSrgb = inGamut('rgb');

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
  colorSpace: string,
  modifications: (null | number | string)[]
): string {
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
  // Culori leaves `h` undefined for achromatic colours; CSS relative-colour
  // syntax resolves the same case to 0, so match that.
  for (const channel of channels) {
    if (modified[channel] === undefined) modified[channel] = 0;
  }

  for (let i = 0; i < modifications.length && i < channels.length; i++) {
    const mod = modifications[i];
    const channel = channels[i];
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

  // Out-of-sRGB results are gamut-mapped in OKLCH rather than clipped
  // channel-wise. The in-gamut check comes first because toGamut round-trips
  // through OKLCH, which can shift an already-displayable colour by 1/255.
  const result = isInSrgb(modified)
    ? formatHex(modified)
    : formatHex(toRgbGamut(modified));
  if (!result) {
    throw new FunctionError(
      `relativeTo: failed to format modified color`,
      'relativeTo'
    );
  }

  return result;
}

export function relativeTo(
  baseColor: TokenValue | ReferenceValue | FunctionTokenValue,
  colorSpace: string,
  modifications: (null | number | string)[],
  options?: { description?: string }
): FunctionTokenValue {
  return createFunctionToken(
    'relativeTo',
    [baseColor],
    {
      options: { colorSpace, modifications },
      metadata: {
        dependencies: extractDependencies([baseColor]),
        visualDependencies: [],
        returnType: 'color',
      },
    },
  );
}
