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

/**
 * `poolKeys` resolved: every candidate with its value, members that fail to
 * resolve skipped.
 */
export function resolvePool(scope: Scope, not: ReadonlyArray<string> = []): PoolMember[] {
  const members: PoolMember[] = [];
  for (const key of poolKeys(scope, not)) {
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
}
