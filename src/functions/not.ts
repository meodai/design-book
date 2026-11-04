import { FunctionError } from '../errors';
import type { Scope } from '../scope';
import { locateMember } from './generic/sibling';
import type { MemberBook } from './generic/sibling';

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
    const dot = entry.indexOf('.');
    if (dot > 0 && entry.slice(0, dot) === scope.name) {
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
