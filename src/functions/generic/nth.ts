import {
  createFunctionToken,
  extractVisualDependencies,
  normalizeNotKeys,
} from '../../tokens';
import type {
  FunctionTokenValue,
  ReferenceValue,
} from '../../tokens';
import type { Scope } from '../../scope';
import { FunctionError } from '../../errors';

export interface NthOptions {
  /** Keys to exclude from the candidate pool. */
  not?: ReadonlyArray<string | ReferenceValue>;
  description?: string;
  [key: string]: any;
}

function iteratesScope(fn: FunctionTokenValue, scope: Scope): boolean {
  for (const arg of fn.args) {
    if (arg === scope) return true;
  }
  return false;
}

export function nthImpl(
  scope: Scope,
  index: number,
  not: string[] = [],
): string {
  const excluded = new Set(not);
  const candidates: string[] = [];

  for (const key of scope.getAllKeys()) {
    if (excluded.has(`${scope.name}.${key}`)) continue;

    const tok = scope.get(key);
    if (tok && tok.type === 'function' && iteratesScope(tok as FunctionTokenValue, scope)) continue;

    let resolved: string;
    try {
      resolved = scope.resolve(key);
    } catch {
      continue;
    }
    candidates.push(resolved);
  }

  if (candidates.length === 0) {
    throw new FunctionError(
      `nth: no candidates found in scope "${scope.name}"`,
      'nth',
    );
  }

  let i: number;

  if (Number.isInteger(index)) {
    // Integer mode: direct index, negative wraps like Array.at()
    if (index < 0) {
      i = candidates.length + index;
    } else {
      i = index;
    }
  } else {
    // Relative mode, for non-integers only: 0.5 is the middle, 0.999 rounds
    // to the last member. Integers never get here — `1.0 === 1` is index 1,
    // not "last"; use -1 for that. Values outside (0, 1) are clamped.
    const clamped = Math.max(0, Math.min(1, index));
    i = Math.round(clamped * (candidates.length - 1));
  }

  if (i < 0 || i >= candidates.length) {
    throw new FunctionError(
      `nth: index ${index} is out of bounds for scope "${scope.name}" with ${candidates.length} candidate(s)`,
      'nth',
    );
  }

  return candidates[i];
}

/**
 * Picks a member of `scope` by position.
 *
 * - An integer `index` (including `0.0` and `1.0`, which JS cannot tell
 *   apart from `0` and `1`) is a direct index; negative ones count from the
 *   end like `Array.at()`, so `-1` is the last member.
 * - A non-integer `index` is a relative position, `0.5` being the middle
 *   member; it is clamped to [0, 1] and rounded to the nearest member.
 */
export function nth(
  scope: Scope,
  index: number,
  options?: NthOptions,
): FunctionTokenValue {
  return createFunctionToken(
    'nth',
    [scope],
    {
      description: options?.description,
      options: { index, not: normalizeNotKeys(options?.not) },
      metadata: {
        dependencies: [],
        visualDependencies: extractVisualDependencies([scope]),
        returnType: undefined,
      },
    },
  );
}
