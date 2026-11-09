import { poolArg, valueArg, assertOptions } from '../args';
import type { PoolArg } from '../args';
import {
  createFunctionToken,
  toMembers,
} from '../../tokens';
import type {
  FunctionTokenValue,
  ReferenceValue,
} from '../../tokens';
import type { Scope } from '../../scope';
import { FunctionError } from '../../errors';
import { poolKeys, resolvePool } from '../scope-members';
import { pick } from '../picks';
import type { Pick } from '../picks';

export interface NthOptions {
  /** Keys to exclude from the candidate pool. */
  not?: ReadonlyArray<string | ReferenceValue>;
  description?: string;
  [key: string]: any;
}

export function nthImpl(scope: Scope, options: { index: number; not: string[] }): Pick {
  const { index, not } = options;
  // A non-negative whole index needs the members only up to it.
  if (Number.isInteger(index) && index >= 0) {
    let position = -1;
    for (const key of poolKeys(scope, not)) {
      let value: string;
      try {
        value = scope.resolve(key);
      } catch {
        continue; // unresolvable members are not candidates
      }
      if (++position === index) return pick(scope, key);
    }
    if (position === -1) throw new FunctionError(`nth: no candidates found in scope "${scope.name}"`, 'nth');
    throw new FunctionError(
      `nth: index ${index} is out of bounds for scope "${scope.name}" with ${position + 1} candidate(s)`,
      'nth',
    );
  }

  // Counting from the end, or a relative position: the whole pool.
  const candidates = resolvePool(scope, not);
  if (candidates.length === 0) {
    throw new FunctionError(`nth: no candidates found in scope "${scope.name}"`, 'nth');
  }
  // Negative wraps like Array.at(); a non-integer is a relative position:
  // 0.5 is the middle, 0.999 rounds to the last member, outside (0, 1) is
  // clamped. Integers never take that path — `1.0 === 1` is index 1, not
  // "last"; use -1 for that.
  const i = Number.isInteger(index)
    ? candidates.length + index
    : Math.round(Math.max(0, Math.min(1, index)) * (candidates.length - 1));
  if (i < 0 || i >= candidates.length) {
    throw new FunctionError(
      `nth: index ${index} is out of bounds for scope "${scope.name}" with ${candidates.length} candidate(s)`,
      'nth',
    );
  }
  return pick(scope, candidates[i].key);
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
  pool: PoolArg,
  index: number,
  options?: NthOptions,
): FunctionTokenValue {
  assertOptions('nth', options, ['not']);
  const scope = poolArg('nth', pool);
  if (typeof index !== 'number' || !Number.isFinite(index)) {
    throw new FunctionError(`nth: index must be a finite number, got ${String(index)}`, 'nth');
  }
  return createFunctionToken(
    'nth',
    [scope],
    {
      description: options?.description,
      options: { index, not: toMembers(options?.not) },
      metadata: {
        dependencies: [],
        returnType: undefined,
      },
    },
  );
}
