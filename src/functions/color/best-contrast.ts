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
import { filterReadable, readableOnParts } from './readable';
import { picked } from '../picks';
import type { ReadableOnOptions } from './readable';

export function bestContrastWithImpl(
  targetValue: string,
  scope: Scope,
  not: string[] = [],
  direction?: Direction,
  readableOn: string | null = null,
  readableContrast?: number,
): string {
  const measure = measureOf(targetValue);
  if (measure && readableOn !== null) {
    throw new FunctionError('bestContrastWith: `readableOn` is for colors; the target is a size or a text style', 'bestContrastWith');
  }
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
  let bestKey = '';
  let bestRatio = -1;

  for (const candidate of filterReadable('bestContrastWith', collectScopeColors(scope, not), readableOn, readableContrast)) {
    if (!onLightnessSide(direction, targetColor, candidate.parsed)) continue;
    const ratio = contrastAgainst(targetColor, candidate.parsed);
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestHex = candidate.hex;
      bestKey = candidate.key;
    }
  }

  if (!bestHex) {
    throw new FunctionError(
      'bestContrastWith: no valid color candidates found in scope',
      'bestContrastWith'
    );
  }

  return picked(scope, bestKey, bestHex);
}

export function bestContrastWith(
  targetValue: TokenValue | ReferenceValue | FunctionTokenValue,
  pool: PoolArg,
  options?: ReadableOnOptions & {
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
  const readable = readableOnParts('bestContrastWith', options);
  return createFunctionToken(
    'bestContrastWith',
    [targetValue, scope, ...readable.args],
    {
      description: options?.description,
      options: { not: normalizeNotKeys(options?.not), ...(options?.direction ? { direction: options.direction } : {}), ...readable.options },
      metadata: {
        dependencies: [...extractDependencies([targetValue]), ...readable.dependencies],
        visualDependencies: extractVisualDependencies([targetValue, scope, ...readable.args]),
        // A color, a size or a text style, as the target is.
        returnType: undefined,
      },
    },
  );
}
