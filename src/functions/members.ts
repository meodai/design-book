import { FunctionError } from '../errors';
import { scopeOf } from '../keys';
import type { Scope } from '../scope';
import { isFieldKey, isFunctionTokenValue, isReferenceValue, isScopeKey, isSourceReference } from '../tokens';
import { capturePick } from './picks';
import type { AnyTokenValue } from '../tokens';

/**
 * How a key names a member of a scope. A `sibling` anchor, its `toward`
 * target and every `not` entry go through here, so a key means the same
 * thing in each (README: "How a key names a member"). Nothing is guessed:
 * a reference is followed only as far as the author asked — into a scope
 * they named, or along `source(…)` — and a selector counts only for the
 * member it reports having picked, when that member is in the scope named.
 */

/** What these lookups need from a book. */
export interface MemberBook {
  getScope(name: string): Scope | undefined;
  getTokenByKey(key: string): AnyTokenValue | undefined;
  resolve(key: string): string;
}

/** The reference a token holds, when it is one to another token. */
function referredKey(book: MemberBook, key: string): string | undefined {
  const token = book.getTokenByKey(key);
  if (!isReferenceValue(token) || isScopeKey(token.key) || isFieldKey(token.key)) return undefined;
  return token.key;
}

/**
 * `source(ref, hops)` followed: the token `key` refers to, `hops` references
 * on, or — with `'root'` — the token where the value is written (the first
 * that is not a reference). Following more references than there are throws.
 */
export function followSource(book: MemberBook, fn: string, key: string, hops: number | 'root'): string {
  let current = key;
  const seen = new Set([current]);
  for (let hop = 0; hops === 'root' || hop < hops; hop++) {
    const next = referredKey(book, current);
    if (next === undefined) {
      if (hops === 'root') return current;
      throw new FunctionError(
        `${fn}: source(ref('${key}'), ${hops}) follows ${hops} references, but "${current}" is not one (after ${hop})`,
        fn,
      );
    }
    if (seen.has(next)) throw new FunctionError(`${fn}: the references from "${key}" go round in a circle`, fn);
    seen.add(next);
    current = next;
  }
  return current;
}

/** A member-naming value as stored: a key, or a `source` reference. */
export function memberStart(book: MemberBook, fn: string, entry: unknown): string | undefined {
  if (typeof entry === 'string') return entry;
  if (isSourceReference(entry)) return followSource(book, fn, entry.key, entry.via);
  return undefined;
}

/**
 * The member of `scopeName` that `key` names: `key` itself when it is in
 * that scope, else the first key its references lead to that is. Where the
 * references end on a selector, the member it picked — when that member is
 * in the scope (every built-in selector reports its pick: `./picks`).
 * `undefined` when they never reach the scope.
 */
export function landIn(book: MemberBook, key: string, scopeName: string): string | undefined {
  let current = key;
  const seen = new Set<string>();
  while (!seen.has(current)) {
    if (scopeOf(current) === scopeName) return current;
    seen.add(current);
    const next = referredKey(book, current);
    if (next === undefined) return pickIn(book, current, scopeName);
    current = next;
  }
  return undefined;
}

/** The member a selector at `key` picked, if it is in `scopeName`. */
function pickIn(book: MemberBook, key: string, scopeName: string): string | undefined {
  if (!isFunctionTokenValue(book.getTokenByKey(key))) return undefined;
  let reported: string | undefined;
  try {
    reported = capturePick(() => book.resolve(key));
  } catch {
    return undefined;
  }
  return reported !== undefined && scopeOf(reported) === scopeName ? reported : undefined;
}

/**
 * The members of `scope` that `not` entries name. An entry names a member
 * when:
 *
 * - it is a key of the pool itself (`palette.error`) — also when that key
 *   does not exist (yet);
 * - it is the key an inherited member comes from (`base.b` for `kid.b`,
 *   with `kid extends base`);
 * - its references lead into the pool (`ui.accent = ref('palette.blue')`
 *   names `palette.blue`): followed one by one, the first key in the pool;
 * - it is (or its references end on) a selector that picked a member of
 *   the pool (`ui.text = bestContrastWith(…, ref('palette'))` names the
 *   member it picked);
 * - it is a `source(…)` reference, followed first, then read as above.
 *
 * A member that refers to the entry is not matched. An entry that names no
 * member would exclude nothing, so it is refused.
 */
export function excludedMembers(book: MemberBook, fn: string, scope: Scope, not: ReadonlyArray<unknown>): string[] {
  if (not.length === 0) return [];
  const excluded = new Set<string>();
  const members = scope.getAllKeys();

  for (const raw of not) {
    // A navigation that could not be followed is refused when the token is
    // set; anything else that is not a key is not ours to judge.
    const entry = memberStart(book, fn, raw);
    if (entry === undefined) continue;
    if (scopeOf(entry) === scope.name) {
      excluded.add(entry);
      continue;
    }
    let found = false;
    for (const member of members) {
      if (scope.getSourceKey(member) === entry) {
        excluded.add(`${scope.name}.${member}`);
        found = true;
      }
    }
    if (found) continue;
    const landed = landIn(book, entry, scope.name);
    if (landed !== undefined) {
      excluded.add(landed);
      continue;
    }
    throw new FunctionError(
      `${fn}: \`not\` entry "${entry}" is not a member of "${scope.name}" and its references do not lead into it, so it would exclude nothing`,
      fn,
    );
  }
  return [...excluded];
}
