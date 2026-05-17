import { parse, formatHex, converter, wcagContrast } from 'culori';
import {
  createFunctionToken,
  extractDependencies,
  extractVisualDependencies,
  getTokenProcessors,
  normalizeNotKeys,
} from '../../tokens';
import type {
  FunctionArg,
  FunctionTokenValue,
  ReferenceValue,
  TokenValue,
} from '../../tokens';
import type { Scope } from '../../scope';
import { FunctionError } from '../../errors';

const toOklch = converter('oklch');

/**
 * Returns the colour from a scope with the lowest OKLCH chroma — the
 * perceptually "most muted" candidate. Mirror of `mostVivid`: same axis,
 * inverted sort. Useful for deriving subtle surfaces or low-emphasis text
 * from a curated palette without inventing a new colour.
 *
 * Optional readability gate: pass `against` (a target colour) and a
 * `minContrast` ratio and the function will prefer candidates that clear the
 * threshold. If nothing does, it falls back to the highest-contrast
 * candidate, the same way `mostVivid` / `minContrastWith` do.
 */
export function leastVividImpl(
  scope: Scope,
  against: string | null,
  minContrast: number,
  not: string[] = [],
): string {
  const targetColor = against ? parse(against) : null;
  const excluded = new Set(not);

  const candidates: Array<{ hex: string; chroma: number; contrast: number }> = [];

  for (const key of scope.getAllKeys()) {
    if (excluded.has(`${scope.name}.${key}`)) continue;
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
        const resolved = scope.resolve(key);
        const parsed = parse(resolved);
        if (parsed) colorHex = formatHex(parsed) ?? null;
      } catch {
        continue;
      }
    }

    if (!colorHex) continue;

    const parsed = parse(colorHex);
    if (!parsed) continue;
    const lch = toOklch(parsed);
    if (!lch || typeof lch.c !== 'number') continue;

    const contrast = targetColor ? wcagContrast(targetColor, parsed) : Infinity;
    candidates.push({ hex: colorHex, chroma: lch.c, contrast });
  }

  if (candidates.length === 0) {
    throw new FunctionError(
      'leastVivid: no valid colour candidates found in scope',
      'leastVivid',
    );
  }

  if (targetColor && minContrast > 0) {
    const eligible = candidates.filter((c) => c.contrast >= minContrast);
    if (eligible.length > 0) {
      eligible.sort((a, b) => a.chroma - b.chroma);
      return eligible[0].hex;
    }
    candidates.sort((a, b) => b.contrast - a.contrast);
    return candidates[0].hex;
  }

  candidates.sort((a, b) => a.chroma - b.chroma);
  return candidates[0].hex;
}

export interface LeastVividOptions {
  /** Optional target colour the result must contrast with. */
  against?: TokenValue | ReferenceValue | FunctionTokenValue;
  /** Minimum WCAG contrast ratio against `against`. Defaults to 0 (off). */
  minContrast?: number;
  /** Keys to exclude from the candidate pool. Pass `ref('scope.token')`
   *  or a literal `'scope.token'` string. */
  not?: ReadonlyArray<string | ReferenceValue>;
  description?: string;
  [key: string]: unknown;
}

export function leastVivid(scope: Scope, options?: LeastVividOptions): FunctionTokenValue {
  const args: FunctionArg[] = options?.against ? [scope, options.against] : [scope];
  const dependencies = options?.against ? extractDependencies([options.against]) : [];

  return createFunctionToken('leastVivid', args, {
    description: options?.description,
    options: {
      minContrast: options?.minContrast ?? 0,
      not: normalizeNotKeys(options?.not),
    },
    metadata: {
      dependencies,
      visualDependencies: extractVisualDependencies([scope]),
      returnType: 'color',
    },
  });
}
