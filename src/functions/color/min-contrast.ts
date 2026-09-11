import { parse } from 'culori';
import {
  createFunctionToken,
  extractDependencies,
  extractVisualDependencies,
  normalizeNotKeys,
} from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';
import type { Scope } from '../../scope';
import { FunctionError } from '../../errors';
import { collectScopeColors, contrastAgainst, formatColor } from './scope-colors';

export interface MinContrastOptions {
  ratio?: number;
  /** Keys to exclude from the candidate pool. */
  not?: ReadonlyArray<string | ReferenceValue>;
  description?: string;
  [key: string]: any;
}

export function minContrastWithImpl(
  targetValue: string,
  scope: Scope,
  ratio: number,
  not: string[] = [],
): string {
  const targetColor = parse(targetValue);
  if (!targetColor) {
    throw new FunctionError(
      `minContrastWith: cannot parse target color "${targetValue}"`,
      'minContrastWith'
    );
  }

  // `not` may also reference tokens outside the iterated scope (e.g. another
  // scope's selector). Pre-resolve those to hex so candidates whose value
  // matches one are excluded — lets `not: [ref('ui.accent')]` keep this
  // selector from landing on whatever accent currently picks.
  const excludedHexes = new Set<string>();
  const localPrefix = `${scope.name}.`;
  for (const k of not) {
    if (k.startsWith(localPrefix)) continue;
    try {
      const parsed = parse(scope.resolveKey(k));
      const hex = parsed ? formatColor(parsed) : null;
      if (hex) excludedHexes.add(hex);
    } catch { /* unresolvable — skip */ }
  }

  const candidates: Array<{ hex: string; contrast: number }> = [];

  for (const candidate of collectScopeColors(scope, not)) {
    if (excludedHexes.has(candidate.hex)) continue;
    candidates.push({
      hex: candidate.hex,
      contrast: contrastAgainst(targetColor, candidate.parsed),
    });
  }

  if (candidates.length === 0) {
    throw new FunctionError(
      'minContrastWith: no valid color candidates found in scope',
      'minContrastWith'
    );
  }

  const meetingThreshold = candidates.filter(c => c.contrast >= ratio);

  if (meetingThreshold.length > 0) {
    // Return the one with lowest contrast among those meeting the threshold
    meetingThreshold.sort((a, b) => a.contrast - b.contrast);
    return meetingThreshold[0].hex;
  }

  // Fallback: return highest contrast
  candidates.sort((a, b) => b.contrast - a.contrast);
  return candidates[0].hex;
}

export function minContrastWith(
  targetValue: TokenValue | ReferenceValue | FunctionTokenValue,
  scope: Scope,
  options?: MinContrastOptions
): FunctionTokenValue {
  const { ratio = 4.5, not, description, ...rest } = options ?? {};
  const notKeys = normalizeNotKeys(not);

  return createFunctionToken(
    'minContrastWith',
    [targetValue, scope],
    {
      description,
      ...rest,
      options: { ratio, not: notKeys },
      metadata: {
        // `not` keys are real dependencies — when the token they reference
        // changes, this selector must re-evaluate (its candidate pool may
        // gain or lose a value-based exclusion).
        dependencies: [...extractDependencies([targetValue]), ...notKeys],
        visualDependencies: extractVisualDependencies([targetValue, scope]),
        returnType: 'color',
      },
    },
  );
}
