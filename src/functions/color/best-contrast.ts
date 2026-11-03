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

export function bestContrastWithImpl(targetValue: string, scope: Scope, not: string[] = [], direction?: Direction): string {
  const measure = measureOf(targetValue);
  if (measure) return measuredContrast('bestContrastWith', targetValue, measure, scope, not, direction, { pick: 'best' });
  assertDirectionFits('bestContrastWith', direction, 'color');
  const targetColor = parse(targetValue);
  if (!targetColor) {
    throw new FunctionError(
      `bestContrastWith: cannot parse target color "${targetValue}"`,
      'bestContrastWith'
    );
  }

  let bestHex: string | null = null;
  let bestRatio = -1;

  for (const candidate of collectScopeColors(scope, not)) {
    if (!onLightnessSide(direction, targetColor, candidate.parsed)) continue;
    const ratio = contrastAgainst(targetColor, candidate.parsed);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestHex = candidate.hex;
    }
  }

  if (!bestHex) {
    throw new FunctionError(
      'bestContrastWith: no valid color candidates found in scope',
      'bestContrastWith'
    );
  }

  return bestHex;
}

export function bestContrastWith(
  targetValue: TokenValue | ReferenceValue | FunctionTokenValue,
  pool: PoolArg,
  options?: {
    /** Only candidates on that side of the target: 'lighter' / 'darker' for
     *  colors, 'larger' / 'smaller' for sizes and text styles. */
    direction?: Direction;
    /** Keys to exclude from the candidate pool. */
    not?: ReadonlyArray<string | ReferenceValue>;
    description?: string;
    [key: string]: any;
  },
): FunctionTokenValue {
  const scope = poolArg('bestContrastWith', pool);
  valueArg('bestContrastWith', targetValue);
  assertDirection('bestContrastWith', options?.direction);
  return createFunctionToken(
    'bestContrastWith',
    [targetValue, scope],
    {
      description: options?.description,
      options: { not: normalizeNotKeys(options?.not), ...(options?.direction ? { direction: options.direction } : {}) },
      metadata: {
        dependencies: extractDependencies([targetValue]),
        visualDependencies: extractVisualDependencies([targetValue, scope]),
        // A color, a size or a text style, as the target is.
        returnType: undefined,
      },
    },
  );
}
