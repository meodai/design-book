import { parse, converter } from 'culori';
import {
  createFunctionToken,
  extractDependencies,
  extractVisualDependencies,
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
import { collectScopeColors, contrastAgainst } from './scope-colors';

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
 * candidate, the same way `minContrastWith` does. A gate that cannot be
 * applied — `minContrast` without `against`, or an `against` colour that does
 * not parse — throws rather than being ignored.
 */
export function mostVividImpl(
  scope: Scope,
  against: string | null,
  minContrast: number,
  not: string[] = [],
): string {
  // A gate that cannot be applied is a configuration error, not a silent
  // no-op — otherwise an unreadable colour quietly wins the pool.
  if (!against && minContrast > 0) {
    throw new FunctionError(
      `mostVivid: minContrast needs an \`against\` colour to measure against`,
      'mostVivid',
    );
  }

  const targetColor = against ? parse(against) : null;
  if (against && !targetColor) {
    throw new FunctionError(
      `mostVivid: cannot parse \`against\` colour "${against}"`,
      'mostVivid',
    );
  }

  const candidates: Array<{ hex: string; chroma: number; contrast: number }> = [];

  for (const candidate of collectScopeColors(scope, not)) {
    const lch = toOklch(candidate.parsed);
    if (!lch || typeof lch.c !== 'number') continue;

    const contrast = targetColor ? contrastAgainst(targetColor, candidate.parsed) : Infinity;
    candidates.push({ hex: candidate.hex, chroma: lch.c, contrast });
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
