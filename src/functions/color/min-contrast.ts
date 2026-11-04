import { poolArg, valueArg } from '../args';
import type { PoolArg } from '../args';
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
import { assertDirection, assertDirectionFits, measureOf, measuredContrast, onLightnessSide } from '../kinds';
import type { Direction } from '../kinds';
import { collectScopeColors, contrastAgainst } from './scope-colors';

export interface MinContrastOptions {
  /** The contrast to reach: a WCAG ratio for colors (default 4.5), the ratio
   *  between two sizes or font sizes for sizes and text styles (1.25 is a
   *  major third). The same name as on the color selectors' `readableOn`. */
  minContrast?: number;
  /** Only candidates on that side of the target: 'lighter' / 'darker' for
   *  colors, 'larger' / 'smaller' for sizes and text styles. */
  direction?: Direction;
  /** Keys to exclude from the candidate pool. */
  not?: ReadonlyArray<string | ReferenceValue>;
  description?: string;
  [key: string]: any;
}

export function minContrastWithImpl(
  targetValue: string,
  scope: Scope,
  minContrast: number,
  not: string[] = [],
  direction?: Direction,
): string {
  const measure = measureOf(targetValue);
  if (measure) return measuredContrast('minContrastWith', targetValue, measure, scope, not, direction, { pick: 'min', minContrast });
  assertDirectionFits('minContrastWith', direction, 'color');
  const targetColor = parse(targetValue);
  if (!targetColor) {
    throw new FunctionError(
      `minContrastWith: cannot parse target color "${targetValue}"`,
      'minContrastWith'
    );
  }

  const candidates: Array<{ hex: string; contrast: number }> = [];

  for (const candidate of collectScopeColors(scope, not)) {
    if (!onLightnessSide(direction, targetColor, candidate.parsed)) continue;
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

  const meetingThreshold = candidates.filter(c => c.contrast >= minContrast);

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
  pool: PoolArg,
  options?: MinContrastOptions
): FunctionTokenValue {
  const scope = poolArg('minContrastWith', pool);
  valueArg('minContrastWith', targetValue);
  const { minContrast = 4.5, not, description, direction, ...rest } = options ?? {};
  assertDirection('minContrastWith', direction);
  const notKeys = normalizeNotKeys(not);

  return createFunctionToken(
    'minContrastWith',
    [targetValue, scope],
    {
      description,
      ...rest,
      options: { minContrast, not: notKeys, ...(direction ? { direction } : {}) },
      metadata: {
        dependencies: extractDependencies([targetValue]),
        visualDependencies: extractVisualDependencies([targetValue, scope]),
        // A color, a size or a text style, as the target is.
        returnType: undefined,
      },
    },
  );
}
