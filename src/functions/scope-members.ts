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

/** One candidate of a scope's pool: its key, and its value once a selector
 *  has read it (`null`: it does not resolve). */
interface Slot {
  key: string;
  read: boolean;
  member: PoolMember | null;
}

/** A scope's pool as the selectors over it share it, for one state of the
 *  book: the candidate keys, each resolved the first time a selector reads
 *  it, and the whole list once every one has been read. */
interface SharedPool {
  slots: Slot[];
  /** Every candidate that resolves — set once all of them were read and
   *  their values depend on the book alone. */
  all?: ReadonlyArray<PoolMember>;
}

function sharedPool(scope: Scope): SharedPool {
  // Only the keys: nothing is resolved here, so a member a selector leaves
  // out with `not` is never read on its behalf.
  return scope.memo('pool', (): SharedPool => ({ slots: poolKeys(scope).map((key) => ({ key, read: false, member: null })) }));
}

function readMember(scope: Scope, key: string): PoolMember | null {
  try {
    const { value, group } = scope.resolution(key);
    if (group === undefined) return { key, value };
    const held = scope.scopeAt(group);
    return held ? { key, value, group: held } : null;
  } catch {
    // Unresolvable members are not candidates.
    return null;
  }
}

/** A slot's member: read once and kept, unless the value depended on what
 *  was mid-resolution around it (then it is read again each time). */
function memberAt(scope: Scope, slot: Slot): PoolMember | null {
  if (slot.read) return slot.member;
  const { value, settled } = scope.settle(() => readMember(scope, slot.key));
  if (settled) {
    slot.read = true;
    slot.member = value;
  }
  return value;
}

/** The whole pool when every candidate has been read and is settled: the
 *  one list all selectors over the scope can share. `undefined` until then. */
export function settledPool(scope: Scope): ReadonlyArray<PoolMember> | undefined {
  return sharedPool(scope).all;
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
 * resolve skipped. A member `not` names is not read at all. Shared between
 * selectors: read the list, do not change it.
 */
export function resolvePool(scope: Scope, not: ReadonlyArray<string> = []): ReadonlyArray<PoolMember> {
  const pool = sharedPool(scope);
  if (pool.all) return without(scope, pool.all, not);
  const excluded = new Set(not);
  const members: PoolMember[] = [];
  let whole = true;
  for (const slot of pool.slots) {
    if (excluded.size > 0 && isExcluded(scope, slot.key, excluded)) {
      whole &&= slot.read;
      continue;
    }
    const member = memberAt(scope, slot);
    whole &&= slot.read;
    if (member) members.push(member);
  }
  // Everything read and settled: from now on the list itself is shared.
  if (whole) {
    pool.all = excluded.size === 0 ? members : pool.slots.flatMap((slot) => (slot.member ? [slot.member] : []));
  }
  return members;
}
