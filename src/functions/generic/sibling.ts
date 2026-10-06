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
import { resolvePool } from '../scope-members';

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
  const pool = resolvePool(scope, not);
  const keys = pool.map((m) => m.key);
  const values = pool.map((m) => m.value);

  const at = keys.indexOf(anchor.slice(scope.name.length + 1));
  if (at === -1) {
    throw new FunctionError(
      `sibling: "${anchor}" is not in the pool of scope "${scope.name}"`,
      'sibling',
    );
  }

  const n = keys.length;
  const i = wrap
    ? (((at + offset) % n) + n) % n
    : Math.min(n - 1, Math.max(0, at + offset));
  return values[i];
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
