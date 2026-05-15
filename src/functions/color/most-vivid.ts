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
 * Returns the colour from a scope with the highest OKLCH chroma — the
 * perceptually "most vivid" candidate. OKLCH chroma is the right axis here
 * because HSL saturation conflates lightness and saturation, so a pale blue
 * and a vivid mid-blue can score the same.
 *
 * Optional readability gate: pass `against` (a target colour) and a
 * `minContrast` ratio and the function will only consider candidates that
 * clear the threshold. If nothing does, it falls back to the highest-contrast
 * candidate, the same way `minContrastWith` does.
 */
export function mostVividImpl(
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
      // Reference or function token — resolve through the scope so the
      // candidate pool includes computed colours (colorMix, lighten, darken,
      // etc.), not just hand-written ones.
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
      'mostVivid: no valid colour candidates found in scope',
      'mostVivid',
    );
  }

  // If a readability gate is set, prefer candidates that clear it. If none
  // do, fall back to the highest-contrast candidate (matches minContrastWith).
  if (targetColor && minContrast > 0) {
    const eligible = candidates.filter((c) => c.contrast >= minContrast);
    if (eligible.length > 0) {
      eligible.sort((a, b) => b.chroma - a.chroma);
      return eligible[0].hex;
    }
    candidates.sort((a, b) => b.contrast - a.contrast);
    return candidates[0].hex;
  }

  candidates.sort((a, b) => b.chroma - a.chroma);
  return candidates[0].hex;
}

export interface MostVividOptions {
  /** Optional target colour the result must contrast with. */
  against?: TokenValue | ReferenceValue | FunctionTokenValue;
  /** Minimum WCAG contrast ratio against `against`. Defaults to 0 (off). */
  minContrast?: number;
  /** Keys to exclude from the candidate pool. Pass `ref('scope.token')`
   *  or a literal `'scope.token'` string. Useful for keeping role-loaded
   *  tokens like `values.error` out of accent-colour picking. */
  not?: ReadonlyArray<string | ReferenceValue>;
  description?: string;
  [key: string]: unknown;
}

export function mostVivid(scope: Scope, options?: MostVividOptions): FunctionTokenValue {
  const args: FunctionArg[] = options?.against ? [scope, options.against] : [scope];
  const dependencies = options?.against ? extractDependencies([options.against]) : [];

  return createFunctionToken('mostVivid', args, {
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
