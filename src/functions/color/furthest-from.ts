import { createFunctionToken, extractVisualDependencies, normalizeNotKeys } from '../../tokens';
import type { FunctionTokenValue, ReferenceValue } from '../../tokens';
import type { Scope } from '../../scope';
import { collectScopeColors, perceptualDistance } from './scope-colors';

export function furthestFromImpl(scope: Scope, not: string[] = []): string {
  const colors = collectScopeColors(scope, not);

  if (colors.length === 0) {
    return '#00000000';
  }

  if (colors.length === 1) {
    return colors[0].hex;
  }

  let furthestHex: string = colors[0].hex;
  let highestAvgDistance = -1;

  for (let i = 0; i < colors.length; i++) {
    let totalDistance = 0;
    for (let j = 0; j < colors.length; j++) {
      if (i === j) continue;
      totalDistance += perceptualDistance(colors[i].parsed, colors[j].parsed);
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
  options?: {
    /** Keys to exclude from the candidate pool. */
    not?: ReadonlyArray<string | ReferenceValue>;
    description?: string;
    [key: string]: any;
  },
): FunctionTokenValue {
  return createFunctionToken(
    'furthestFrom',
    [scope],
    {
      description: options?.description,
      options: { not: normalizeNotKeys(options?.not) },
      metadata: {
        dependencies: [],
        visualDependencies: extractVisualDependencies([scope]),
        returnType: 'color',
      },
    },
  );
}
