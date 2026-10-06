import {
  createFunctionToken,
  isReferenceValue,
  normalizeNotKeys,
} from '../../tokens';
import type {
  FunctionTokenValue,
  ReferenceValue,
} from '../../tokens';
import type { Scope } from '../../scope';
import { FunctionError } from '../../errors';
import { poolKeys } from '../scope-members';

export interface SiblingOptions {
  /** Wrap around past either end (modulo) instead of stopping there. */
  wrap?: boolean;
  /** Keys to skip while stepping. */
  not?: ReadonlyArray<string | ReferenceValue>;
  description?: string;
  [key: string]: any;
}

/** Scope name of a fully-qualified key. Scope names cannot contain dots.
 *  Throws on a key that is not `scope.token`: an unqualified anchor would
 *  otherwise yield a nonsense scope name (`'g10'` from `'g100'`). */
export function scopeOfKey(key: string): string {
  const dot = key.indexOf('.');
  if (dot <= 0 || dot === key.length - 1) {
    throw new FunctionError(`sibling: the anchor must be a fully-qualified 'scope.token' key, got "${key}"`, 'sibling');
  }
  return key.slice(0, dot);
}

/**
 * Steps `offset` members away from `anchor` within its scope, in the
 * scope's key order (inherited members included), and returns that member's
 * resolved value. Past either end it stops at the first / last member, or
 * wraps around when `wrap` is set.
 *
 * The pool follows the rules every scope-walking selector shares
 * (`../scope-members`): members that are themselves functions walking this
 * scope — another `sibling`, an `nth`, a selector — are skipped, so a
 * `sibling` can live in the scope it walks without stepping onto itself and
 * counts the same positions `nth` does.
 */
export function siblingImpl(
  scope: Scope,
  anchor: string,
  offset: number,
  wrap: boolean = false,
  not: string[] = [],
): string {
  // Membership is cheap to decide; resolving is not. Only the anchor and the
  // members actually stepped over are resolved. A member that fails to
  // resolve is not part of the pool: it is stepped over without counting.
  const keys = poolKeys(scope, not);
  const memo = new Map<number, string | null>();
  const valueAt = (i: number): string | null => {
    if (!memo.has(i)) {
      let value: string | null;
      try {
        value = scope.resolve(keys[i]);
      } catch {
        value = null;
      }
      memo.set(i, value);
    }
    return memo.get(i)!;
  };

  const at = keys.indexOf(anchor.slice(scope.name.length + 1));
  if (at === -1 || valueAt(at) === null) {
    throw new FunctionError(
      `sibling: "${anchor}" is not in the pool of scope "${scope.name}"`,
      'sibling',
    );
  }

  const dir = Math.sign(offset);
  let steps = Math.abs(offset);
  let i = at;

  if (wrap) {
    // Reduce a long walk modulo the number of resolvable members; that
    // count needs every member resolved, so only pay for it when the walk
    // could go round more than once.
    if (steps >= keys.length) {
      let n = 0;
      for (let k = 0; k < keys.length; k++) if (valueAt(k) !== null) n++;
      steps %= n;
    }
    while (steps > 0) {
      i = (i + dir + keys.length) % keys.length;
      if (valueAt(i) !== null) steps--;
    }
    return valueAt(i)!;
  }

  // Without wrap, stop at the last resolvable member in that direction.
  let last = at;
  while (steps > 0) {
    i += dir;
    if (i < 0 || i >= keys.length) break;
    if (valueAt(i) !== null) {
      last = i;
      steps--;
    }
  }
  return valueAt(last)!;
}

/**
 * The member `offset` steps away from `anchor` in its scope: `+1` is the next
 * one, `-1` the previous. Stops at the ends unless `{ wrap: true }`.
 *
 * The anchor's *key* is what matters (its position), not its value, so it is
 * stored in the options rather than as an argument the resolver would turn
 * into a value. The scope it walks is declared in `metadata.iteratedScopes`.
 */
export function sibling(
  anchor: ReferenceValue,
  offset: number,
  options?: SiblingOptions,
): FunctionTokenValue {
  if (!isReferenceValue(anchor)) {
    throw new FunctionError('sibling: the anchor must be a ref(...) to a token', 'sibling');
  }
  if (!Number.isInteger(offset)) {
    throw new FunctionError(`sibling: offset must be an integer, got ${offset}`, 'sibling');
  }

  const scopeName = scopeOfKey(anchor.key);

  return createFunctionToken('sibling', [], {
    description: options?.description,
    options: {
      from: anchor.key,
      offset,
      wrap: options?.wrap ?? false,
      not: normalizeNotKeys(options?.not),
    },
    metadata: {
      dependencies: [anchor.key],
      visualDependencies: [anchor.key],
      iteratedScopes: [scopeName],
      returnType: undefined,
    },
  });
}
