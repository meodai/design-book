import { iteratedScopesOf } from '../tokens';
import type { FunctionTokenValue } from '../tokens';
import type { Scope } from '../scope';

/**
 * Shared candidate-pool rules for the selectors that iterate a scope
 * (`nth`, `random`, `nextLarger`, `nextSmaller`, `sibling`), so they all
 * agree on which members exist and in which positions.
 */

/**
 * True when `key` is excluded. `excluded` holds qualified member keys of
 * `scope` (`kid.b`): the registry has already turned every `not` entry into
 * the members it names (`excludedMembers` in `./members`), so this is a set
 * lookup and nothing else interprets `not`.
 */
export function isExcluded(scope: Scope, key: string, excluded: ReadonlySet<string>): boolean {
  return excluded.has(`${scope.name}.${key}`);
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

/** A candidate with its resolved value — or, for a member whose value is
 *  a group (a text style held in the pool), that group, measured by one of
 *  its members (`by`). */
export interface PoolMember {
  key: string;
  value: string;
  group?: Scope;
}

/** Every candidate of `scope` with its value, nothing left out by `not`:
 *  the same for every selector over the scope, so it is built once per
 *  state of the book (`Scope.memo`) and shared. */
function wholePool(scope: Scope): ReadonlyArray<PoolMember> {
  return scope.memo('pool', () => {
    const members: PoolMember[] = [];
    for (const key of poolKeys(scope)) {
      try {
        const { value, group } = scope.resolution(key);
        if (group === undefined) members.push({ key, value });
        else {
          const held = scope.scopeAt(group);
          if (held) members.push({ key, value, group: held });
        }
      } catch {
        // Unresolvable members are not candidates.
      }
    }
    return members;
  });
}

/** `members` without the ones `not` names (qualified keys of `scope`). The
 *  same list when nothing is left out: do not change it. */
export function without<M extends { key: string }>(scope: Scope, members: ReadonlyArray<M>, not: ReadonlyArray<string>): ReadonlyArray<M> {
  if (not.length === 0) return members;
  const excluded = new Set(not);
  return members.filter((m) => !isExcluded(scope, m.key, excluded));
}

/**
 * `poolKeys` resolved: every candidate with its value, members that fail to
 * resolve skipped. Shared between selectors: read it, do not change it.
 */
export function resolvePool(scope: Scope, not: ReadonlyArray<string> = []): ReadonlyArray<PoolMember> {
  return without(scope, wholePool(scope), not);
}
