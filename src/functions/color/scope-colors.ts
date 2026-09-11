import { parse, formatHex, formatHex8, wcagContrast, differenceEuclidean, converter } from 'culori';
import type { Color } from 'culori';
import { getTokenProcessors } from '../../tokens';
import type { TokenValue } from '../../tokens';
import type { Scope } from '../../scope';

/** A candidate colour drawn from a scope's token pool. */
export interface ScopeColor {
  /** Unqualified token key within the iterated scope. */
  key: string;
  /** The candidate's sRGB hex form — what selectors return. Translucent
   *  candidates keep their alpha as `#rrggbbaa`. */
  hex: string;
  /** `hex` parsed back, so every selector measures the value it returns. */
  parsed: Color;
}

const toRgb = converter('rgb');

/**
 * Hex form of a colour, keeping alpha when it has any. Selectors return this,
 * so a translucent token in the pool stays translucent in the result instead
 * of being handed back as an opaque colour it never was.
 */
export function formatColor(color: Color): string | undefined {
  return (color.alpha ?? 1) < 1 ? formatHex8(color) : formatHex(color);
}

/**
 * Source-over compositing in sRGB: what a translucent colour actually looks
 * like on a given backdrop.
 */
export function compositeOver(color: Color, backdrop: Color): Color {
  const alpha = color.alpha ?? 1;
  if (alpha >= 1) return color;

  const fg = toRgb(color);
  const bg = toRgb(backdrop);
  const bgAlpha = bg.alpha ?? 1;

  return {
    mode: 'rgb',
    r: fg.r * alpha + bg.r * (1 - alpha),
    g: fg.g * alpha + bg.g * (1 - alpha),
    b: fg.b * alpha + bg.b * (1 - alpha),
    alpha: alpha + bgAlpha * (1 - alpha),
  };
}

/**
 * WCAG contrast of a candidate against a target, compositing the candidate
 * over that target first when it is translucent — reading a 5% black hairline
 * as opaque black would score 21:1 against white instead of ~1.1:1.
 */
export function contrastAgainst(target: Color, candidate: Color): number {
  return wcagContrast(target, compositeOver(candidate, target));
}

/**
 * Perceptual distance. Euclidean RGB is not perceptually uniform: it
 * over-weights channel deltas that the eye barely notices and misses hue
 * shifts it does. OKLab is designed so that plain Euclidean distance tracks
 * perceived difference.
 */
export const perceptualDistance: (a: Color | string, b: Color | string) => number =
  differenceEuclidean('oklab');

/**
 * Collects every colour a scope can offer as a selector candidate.
 *
 * Colour tokens are read from their cached Culori processor when present and
 * re-parsed from `rawValue` otherwise; references and function tokens are
 * resolved through the scope, so the pool includes computed colours
 * (colorMix, lighten, darken, …) and not just hand-written ones. Tokens that
 * are not colours, or that fail to resolve, are skipped.
 *
 * @param scope Scope to iterate.
 * @param not Fully-qualified keys to exclude from the pool. An inherited
 *   candidate is excluded by either its key in the iterated scope
 *   (`dark.black`) or the key it is inherited from (`palette.black`) — the
 *   latter is what an author naturally writes.
 */
export function collectScopeColors(scope: Scope, not: ReadonlyArray<string> = []): ScopeColor[] {
  const excluded = new Set(not);
  const colors: ScopeColor[] = [];

  for (const key of scope.getAllKeys()) {
    if (excluded.has(`${scope.name}.${key}`)) continue;
    const sourceKey = scope.getSourceKey(key);
    if (sourceKey && excluded.has(sourceKey)) continue;

    const token = scope.get(key);
    if (!token) continue;

    let colorHex: string | null = null;

    if (token.type === 'color') {
      const tv = token as TokenValue;
      const processors = getTokenProcessors(tv);
      if (processors && processors[0]) {
        const formatted = formatColor(processors[0].instance);
        if (formatted) colorHex = formatted;
      }
      if (!colorHex) {
        const parsed = parse(String(tv.rawValue));
        if (parsed) colorHex = formatColor(parsed) ?? null;
      }
    } else {
      try {
        const parsed = parse(scope.resolve(key));
        if (parsed) colorHex = formatColor(parsed) ?? null;
      } catch {
        continue;
      }
    }

    if (!colorHex) continue;

    const parsed = parse(colorHex);
    if (!parsed) continue;

    colors.push({ key, hex: colorHex, parsed });
  }

  return colors;
}
