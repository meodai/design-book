import {
  createFunctionToken,
  extractDependencies,
  extractVisualDependencies,
  normalizeNotKeys,
} from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';
import type { Scope } from '../../scope';
import { resolvePool } from '../scope-members';

interface Parsed {
  num: number;
  unit: string;
}

function parseDimension(value: string, label: string): Parsed {
  const match = value.match(/^(-?[\d.]+)(.*)$/);
  if (!match) {
    throw new Error(`${label}: cannot parse dimensional value "${value}"`);
  }
  const num = parseFloat(match[1]);
  if (!Number.isFinite(num)) {
    throw new Error(`${label}: not a finite number in "${value}"`);
  }
  return { num, unit: match[2].trim() };
}

export function nextSmallerImpl(
  targetValue: string,
  scope: Scope,
  minDistance = 0,
  not: string[] = [],
): string {
  const target = parseDimension(targetValue, 'nextSmaller');

  let best: Parsed | null = null;
  let bestRaw: string | null = null;

  // Members walking this scope (another selector, a sibling) are not
  // candidates — resolving them would recurse back through us.
  for (const { value: resolved } of resolvePool(scope, not)) {
    let candidate: Parsed;
    try {
      candidate = parseDimension(resolved, 'nextSmaller');
    } catch {
      continue;
    }

    // Skip members whose unit doesn't match the target instead of failing
    // the whole scope — a stray `rem(1)` or `string('2xl')` shouldn't break
    // nextSmaller for an otherwise-consistent px scope.
    if (candidate.unit !== target.unit) continue;

    if (candidate.num >= target.num - minDistance) continue;
    if (!best || candidate.num > best.num) {
      best = candidate;
      bestRaw = resolved;
    }
  }

  if (!bestRaw) {
    throw new Error(
      `nextSmaller: no member of scope "${scope.name}" is smaller than ${target.num}${target.unit}`
        + (minDistance ? ` by at least ${minDistance}${target.unit}` : ''),
    );
  }
  return bestRaw;
}

export function nextSmaller(
  target: TokenValue | ReferenceValue | FunctionTokenValue,
  scope: Scope,
  options?: {
    /** Minimum gap (in the scope's unit) the candidate must clear below the target. */
    minDistance?: number;
    /** Keys to exclude from the candidate pool. */
    not?: ReadonlyArray<string | ReferenceValue>;
    description?: string;
    [key: string]: any;
  },
): FunctionTokenValue {
  return createFunctionToken(
    'nextSmaller',
    [target, scope],
    {
      description: options?.description,
      options: {
        minDistance: options?.minDistance ?? 0,
        not: normalizeNotKeys(options?.not),
      },
      metadata: {
        dependencies: extractDependencies([target]),
        visualDependencies: extractVisualDependencies([target, scope]),
        returnType: 'dimension',
      },
    },
  );
}
