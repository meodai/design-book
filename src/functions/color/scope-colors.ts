import { parse, formatHex, differenceEuclidean } from 'culori';
import type { Color } from 'culori';
import { getTokenProcessors } from '../../tokens';
import type { TokenValue } from '../../tokens';
import type { Scope } from '../../scope';

/** A candidate colour drawn from a scope's token pool. */
export interface ScopeColor {
  /** Unqualified token key within the iterated scope. */
  key: string;
  /** The candidate's sRGB hex form — what selectors return. */
  hex: string;
  /** `hex` parsed back, so every selector measures the value it returns. */
  parsed: Color;
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
        const formatted = formatHex(processors[0].instance);
        if (formatted) colorHex = formatted;
      }
      if (!colorHex) {
        const parsed = parse(String(tv.rawValue));
        if (parsed) colorHex = formatHex(parsed) ?? null;
      }
    } else {
      try {
        const parsed = parse(scope.resolve(key));
        if (parsed) colorHex = formatHex(parsed) ?? null;
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
