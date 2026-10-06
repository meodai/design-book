import { createFunctionToken, extractVisualDependencies, normalizeNotKeys } from '../../tokens';
import type { FunctionTokenValue, ReferenceValue } from '../../tokens';
import type { Scope } from '../../scope';
import { FunctionError } from '../../errors';
import { parse } from 'culori';
import { collectScopeColors, visibleDistance } from './scope-colors';
import { filterReadable, readableOnParts } from './readable';
import type { ReadableOnOptions } from './readable';

export function furthestFromImpl(
  scope: Scope,
  not: string[] = [],
  readableOn: string | null = null,
  minContrast?: number,
): string {
  // Distance is measured among the readable candidates only — the filter
  // narrows the pool before ranking, the same as `not`.
  const colors = filterReadable('furthestFrom', collectScopeColors(scope, not), readableOn, minContrast);

  if (colors.length === 0) {
    throw new FunctionError('furthestFrom: no valid color candidates found in scope', 'furthestFrom');
  }

  if (colors.length === 1) {
    return colors[0].hex;
  }

  // Translucent colors are compared as they are seen: over the readableOn
  // backdrop when there is one, otherwise over both white and black.
  const backdrop = readableOn === null ? null : parse(readableOn) ?? null;
  let furthestHex: string = colors[0].hex;
  let highestAvgDistance = -1;

  for (let i = 0; i < colors.length; i++) {
    let totalDistance = 0;
    for (let j = 0; j < colors.length; j++) {
      if (i === j) continue;
      totalDistance += visibleDistance(colors[i].parsed, colors[j].parsed, backdrop);
    }
    const avgDistance = totalDistance / (colors.length - 1);
    if (avgDistance > highestAvgDistance) {
      highestAvgDistance = avgDistance;
      furthestHex = colors[i].hex;
    }
  }

  return furthestHex;
}

export function furthestFrom(
  scope: Scope,
  options?: ReadableOnOptions & {
    /** Keys to exclude from the candidate pool. */
    not?: ReadonlyArray<string | ReferenceValue>;
    description?: string;
    [key: string]: any;
  },
): FunctionTokenValue {
  const readable = readableOnParts('furthestFrom', options);
  return createFunctionToken(
    'furthestFrom',
    [scope, ...readable.args],
    {
      description: options?.description,
      options: { not: normalizeNotKeys(options?.not), ...readable.options },
      metadata: {
        dependencies: readable.dependencies,
        visualDependencies: extractVisualDependencies([scope, ...readable.args]),
        returnType: 'color',
      },
    },
  );
}
