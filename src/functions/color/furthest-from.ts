import { poolArg, valueArg } from '../args';
import type { PoolArg } from '../args';
import { createFunctionToken, extractVisualDependencies, normalizeNotKeys } from '../../tokens';
import type { FunctionTokenValue, ReferenceValue } from '../../tokens';
import type { Scope } from '../../scope';
import { FunctionError } from '../../errors';
import { parse } from 'culori';
import { collectScopeColors, visibleDistance } from './scope-colors';
import { filterReadable, readableOnParts } from './readable';
import type { ReadableOnOptions } from './readable';
import { measuredGroups, measuredMembers, onlyMeasuredGroup } from '../kinds';
import type { Kind } from '../kinds';

export function furthestFromImpl(
  scope: Scope,
  not: string[] = [],
  readableOn: string | null = null,
  readableContrast?: number,
  type?: Kind,
): string {
  // Colors unless asked otherwise or the pool has none: then the one group
  // of sizes or text styles it holds, by value. Kinds are never mixed.
  if (type !== 'color' && (type !== undefined || collectScopeColors(scope, not).length === 0)) {
    if (readableOn !== null) {
      throw new FunctionError('furthestFrom: `readableOn` applies to colors', 'furthestFrom');
    }
    if (type === undefined && measuredGroups(scope, not).size === 0) {
      throw new FunctionError(`furthestFrom: scope "${scope.name}" has no colors, sizes or text styles to compare`, 'furthestFrom');
    }
    const group = onlyMeasuredGroup('furthestFrom', scope, not, type);
    const members = measuredMembers(scope, group.kind, group.unit, not);
    let furthest = members[0].value;
    let highest = -1;
    for (const a of members) {
      const avg = members.reduce((sum, b) => sum + Math.abs(a.num - b.num), 0) / Math.max(1, members.length - 1);
      if (avg > highest) {
        highest = avg;
        furthest = a.value;
      }
    }
    return furthest;
  }
  // Distance is measured among the readable candidates only — the filter
  // narrows the pool before ranking, the same as `not`.
  const colors = filterReadable('furthestFrom', collectScopeColors(scope, not), readableOn, readableContrast);

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
  pool: PoolArg,
  options?: ReadableOnOptions & {
    /** Which kind to compare when the pool holds several: 'color' (the
     *  default when it holds colors), 'size' or 'text'. */
    type?: Kind;
    /** Keys to exclude from the candidate pool. */
    not?: ReadonlyArray<string | ReferenceValue>;
    description?: string;
    [key: string]: any;
  },
): FunctionTokenValue {
  const scope = poolArg('furthestFrom', pool);
  const type = options?.type;
  if (type !== undefined && type !== 'color' && type !== 'size' && type !== 'text') {
    throw new FunctionError(`furthestFrom: \`type\` is 'color', 'size' or 'text', got ${String(type)}`, 'furthestFrom');
  }
  const readable = readableOnParts('furthestFrom', options);
  return createFunctionToken(
    'furthestFrom',
    [scope, ...readable.args],
    {
      description: options?.description,
      options: { not: normalizeNotKeys(options?.not), ...(type ? { type } : {}), ...readable.options },
      metadata: {
        dependencies: readable.dependencies,
        visualDependencies: extractVisualDependencies([scope, ...readable.args]),
        returnType: type === 'color' ? 'color' : undefined,
      },
    },
  );
}
