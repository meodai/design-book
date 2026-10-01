import {
  createFunctionToken,
  isReferenceValue,
  iteratedScopesOf,
  normalizeNotKeys,
} from '../../tokens';
import type {
  FunctionTokenValue,
  ReferenceValue,
} from '../../tokens';
import type { Scope } from '../../scope';
import { FunctionError } from '../../errors';

export interface SiblingOptions {
  /** Wrap around past either end (modulo) instead of stopping there. */
  wrap?: boolean;
  /** Keys to skip while stepping. */
  not?: ReadonlyArray<string | ReferenceValue>;
  description?: string;
  [key: string]: any;
}

/** Scope name of a fully-qualified key. Scope names cannot contain dots. */
export function scopeOfKey(key: string): string {
  return key.slice(0, key.indexOf('.'));
}

/**
 * Steps `offset` members away from `anchor` within its scope, in the
 * scope's key order (inherited members included), and returns that member's
 * resolved value. Past either end it stops at the first / last member, or
 * wraps around when `wrap` is set.
 *
 * Members that are themselves functions walking this scope — another `sibling`,
 * an `nth`, a selector — are skipped, the same way `nth` skips them, so a
 * `sibling` can live in the scope it walks without stepping onto itself.
 */
export function siblingImpl(
  scope: Scope,
  anchor: string,
  offset: number,
  wrap: boolean = false,
  not: string[] = [],
): string {
  const excluded = new Set(not);
  const keys: string[] = [];
  const values: string[] = [];

  for (const key of scope.getAllKeys()) {
    if (excluded.has(`${scope.name}.${key}`)) continue;
    const sourceKey = scope.getSourceKey(key);
    if (sourceKey && excluded.has(sourceKey)) continue;

    const tok = scope.get(key);
    if (tok && tok.type === 'function' && iteratedScopesOf(tok as FunctionTokenValue).includes(scope.name)) continue;

    let resolved: string;
    try {
      resolved = scope.resolve(key);
    } catch {
      continue;
    }
    keys.push(key);
    values.push(resolved);
  }

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
      iteratedScopes: [scopeOfKey(anchor.key)],
      returnType: undefined,
    },
  });
}
