import { iteratedScopesOf } from '../tokens';
import type { FunctionTokenValue } from '../tokens';
import type { Scope } from '../scope';

/**
 * Shared candidate-pool rules for the selectors that iterate a scope
 * (`nth`, `random`, `nextLarger`, `nextSmaller`, `sibling`), so they all
 * agree on which members exist and in which positions.
 */

/**
 * True when `key` is excluded by `not`: by its qualified key in the iterated
 * scope (`kid.b`) or, for an inherited member, by the key it is inherited
 * from (`base.b`) — the latter is what an author naturally writes.
 */
export function isExcluded(scope: Scope, key: string, excluded: ReadonlySet<string>): boolean {
  if (excluded.size === 0) return false;
  if (excluded.has(`${scope.name}.${key}`)) return true;
  const sourceKey = scope.getSourceKey(key);
  return sourceKey !== undefined && excluded.has(sourceKey);
}

/**
 * True when the member is itself a function walking `scope` — a selector
 * taking it as an argument, one nested inside another function, or a
 * `sibling` anchored in it. Such members are not candidates: resolving them
 * would recurse back through the selector asking, and counting them would
 * shift every position after them.
 */
export function iteratesScope(scope: Scope, key: string): boolean {
  const tok = scope.get(key);
  return !!tok && tok.type === 'function'
    && iteratedScopesOf(tok as FunctionTokenValue).includes(scope.name);
}

/**
 * The unqualified keys of `scope` that are candidates, in scope order
 * (inherited members included). Cheap: nothing is resolved, so a caller that
 * needs only some values resolves only those. A member that fails to resolve
 * is still listed here; callers skip it when they resolve.
 */
export function poolKeys(scope: Scope, not: ReadonlyArray<string> = []): string[] {
  const excluded = new Set(not);
  return scope.getAllKeys().filter(
    (key) => !isExcluded(scope, key, excluded) && !iteratesScope(scope, key),
  );
}

/** A candidate with its resolved value. */
export interface PoolMember {
  key: string;
  value: string;
}

/**
 * `poolKeys` resolved: every candidate with its value, members that fail to
 * resolve skipped.
 */
export function resolvePool(scope: Scope, not: ReadonlyArray<string> = []): PoolMember[] {
  const members: PoolMember[] = [];
  for (const key of poolKeys(scope, not)) {
    try {
      members.push({ key, value: scope.resolve(key) });
    } catch {
      // Unresolvable members are not candidates.
    }
  }
  return members;
}
