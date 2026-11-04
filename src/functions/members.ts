import { FunctionError } from '../errors';
import { scopeOf } from '../keys';
import type { Scope } from '../scope';
import { isFieldKey, isFunctionTokenValue, isReferenceValue, isScopeKey, isScopeReference } from '../tokens';
import type { AnyTokenValue, FunctionTokenValue } from '../tokens';
import { poolKeys } from './scope-members';

/**
 * How a key names a member of a scope. `not` entries, a `sibling` anchor and
 * its `toward` target all go through here, so a key means the same thing in
 * each (README: "How a key names a member").
 */

/** What `locateMember` needs from a book. */
export interface MemberBook {
  getScope(name: string): Scope | undefined;
  getTokenByKey(key: string): AnyTokenValue | undefined;
  resolve(key: string): string;
}

/**
 * Where the color (or size) of `key` lives: the member of a scope that
 * `sibling` steps through. Follows the references inside the key's own scope
 * and then one hop out — `context.surface = ref('brand-scale.100')` lives at
 * `brand-scale.100`. A selector lives where its pick does: the member of its
 * pool with its value (for a `sibling`, of the scope it walks). A plain value
 * lives where it is. `undefined` when the value is computed and is no
 * member of any scope.
 */
export function locateMember(book: MemberBook, key: string, seen: Set<string> = new Set()): { scope: string; key: string } | undefined {
  const start = scopeOf(key);
  let current = key;
  while (!seen.has(current)) {
    seen.add(current);
    if (scopeOf(current) !== start) return { scope: scopeOf(current), key: current };
    const token = book.getTokenByKey(current);
    if (!token) return undefined;
    if (isReferenceValue(token)) {
      if (isScopeKey(token.key) || isFieldKey(token.key)) return undefined;
      current = token.key;
      continue;
    }
    if (isFunctionTokenValue(token)) return pickedMember(book, current, token, seen);
    return { scope: start, key: current };
  }
  return undefined;
}

/** The member a selector picked: the one in its pool with its value. */
function pickedMember(
  book: MemberBook,
  key: string,
  token: FunctionTokenValue,
  seen: Set<string>,
): { scope: string; key: string } | undefined {
  const pools: string[] = [];
  if (token.name === 'sibling' && typeof token.options?.from === 'string') {
    const walked = locateMember(book, token.options.from, seen);
    if (walked) pools.push(walked.scope);
  } else {
    for (const arg of token.args) if (isScopeReference(arg)) pools.push(arg.key);
  }
  if (pools.length === 0) return undefined;
  let value: string;
  try {
    value = book.resolve(key).toLowerCase();
  } catch {
    return undefined;
  }
  for (const name of pools) {
    const scope = book.getScope(name);
    if (!scope) continue;
    // The pick can only be a member the selector did not exclude.
    let not: string[];
    try {
      not = excludedMembers(book, token.name, scope, (token.options?.not ?? []) as unknown[]);
    } catch {
      return undefined;
    }
    for (const member of poolKeys(scope, not)) {
      try {
        if (scope.resolve(member).toLowerCase() === value) return { scope: name, key: `${name}.${member}` };
      } catch { /* not a candidate */ }
    }
  }
  return undefined;
}

/**
 * The keys `not` takes are about *which member* to leave out, wherever the
 * key is written. A `not` entry names a member of the pool when:
 *
 * - it is a key of the pool itself (`palette.error`) — as before, also when
 *   that key does not exist (yet);
 * - it is the key an inherited member comes from (`base.b` for `kid.b`);
 * - it leads to a member: a reference chain that ends in the pool
 *   (`ui.accent = ref('palette.blue')`), or a selector whose pick is a member
 *   (`ui.text = bestContrastWith(…, ref('palette'))`);
 * - a member leads to it: the member is a reference to that key
 *   (`brand-scale.2000 = ref('brand-base.ink')` is excluded by
 *   `not: [ref('brand-base.ink')]`).
 *
 * The lookup is the one `sibling` uses to find the scale an anchor lives on
 * (`locateMember`), followed until it stops. An entry that names no member
 * this way would exclude nothing, so it throws instead of being ignored.
 */
export function excludedMembers(book: MemberBook, fn: string, scope: Scope, not: ReadonlyArray<unknown>): string[] {
  if (not.length === 0) return [];
  const excluded = new Set<string>();
  const members = scope.getAllKeys();
  const memberChains = new Map<string, string[]>();
  const chainOfMember = (member: string) => {
    if (!memberChains.has(member)) memberChains.set(member, chainOf(book, `${scope.name}.${member}`));
    return memberChains.get(member)!;
  };

  for (const entry of not) {
    // A navigated reference that could not be bound is refused when the
    // token is set; anything else that is not a key is not ours to judge.
    if (typeof entry !== 'string') continue;
    if (scopeOf(entry) === scope.name) {
      excluded.add(entry);
      continue;
    }

    let found = false;
    const chain = chainOf(book, entry);
    for (const member of members) {
      const key = `${scope.name}.${member}`;
      if (scope.getSourceKey(member) === entry || chain.includes(key) || chainOfMember(member).includes(entry)) {
        excluded.add(key);
        found = true;
      }
    }
    if (!found) {
      throw new FunctionError(
        `${fn}: \`not\` entry "${entry}" is not a member of "${scope.name}" and does not lead to one, so it would exclude nothing`,
        fn,
      );
    }
  }
  return [...excluded];
}

/** The keys `key` leads to, one scope hop at a time: `key` itself, then each
 *  member `locateMember` lands on, until it stops. */
function chainOf(book: MemberBook, key: string): string[] {
  const chain = [key];
  let current = key;
  for (;;) {
    let next: { key: string } | undefined;
    try {
      next = locateMember(book, current);
    } catch {
      next = undefined;
    }
    if (!next || chain.includes(next.key)) return chain;
    chain.push(next.key);
    current = next.key;
  }
}
