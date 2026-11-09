import { TokenError } from './errors';

/** A token key becomes part of a CSS custom property (`--scope-key`) and a
 *  W3 token name, so it may only hold ASCII letters, digits, `-` and `_`,
 *  plus non-ASCII characters (valid in CSS identifiers). That rules out
 *  whitespace, `.` (the scope separator), `$`, `{` / `}` (W3 alias syntax)
 *  and every other ASCII punctuation character.
 *
 *  Kept in its own module so `design-book/naming` can check keys without
 *  pulling in the token engine. */
export const VALID_TOKEN_KEY = /^(?:[A-Za-z0-9_-]|[^\x00-\x7F])+$/;

export function assertValidTokenKey(scopeName: string, name: string): void {
  if (typeof name === 'string' && VALID_TOKEN_KEY.test(name)) return;
  throw new TokenError(
    `Invalid token key "${name}" in scope "${scopeName}": keys may only contain ` +
    'letters, digits, "-" and "_" (no whitespace, ".", "$", "{", "}" or other punctuation)',
    `${scopeName}.${name}`,
  );
}

/** The scope part of a key: `gray` for `gray.g100` (and for `gray.title.fontSize`),
 *  the key itself when it has no dot. Scope names cannot contain dots. */
export function scopeOf(key: string): string {
  const dot = key.indexOf('.');
  return dot === -1 ? key : key.slice(0, dot);
}

/** A key taken apart: `scope`, `scope.token`, `scope.token.field`, or the
 *  relative forms `.`, `.token`, `.token.field` (scope `''`). */
export interface ParsedKey {
  scope: string;
  token?: string;
  field?: string;
  relative: boolean;
}

/** Takes a key apart, or returns `null` when it is not one of the shapes
 *  above (an empty segment, more than three segments). The one parser for
 *  keys; everything else (`scopeOf`, `splitKey`) is a shortcut of it. */
export function parseKey(key: string): ParsedKey | null {
  if (typeof key !== 'string' || key === '') return null;
  const relative = key.startsWith('.');
  if (relative && key === '.') return { scope: '', relative };
  const parts = (relative ? key.slice(1) : key).split('.');
  if (parts.length > (relative ? 2 : 3) || parts.some((p) => p === '')) return null;
  const [first, second, third] = parts;
  return relative
    ? { scope: '', token: first, field: second, relative }
    : { scope: first, token: second, field: third, relative };
}

/** `scope.rest` split at the first dot: `['type', 'title.fontSize']` for
 *  `type.title.fontSize`; `null` without a dot. Cheap: no allocation past
 *  the two strings. */
export function splitKey(key: string): [scope: string, rest: string] | null {
  const dot = key.indexOf('.');
  return dot <= 0 ? null : [key.slice(0, dot), key.slice(dot + 1)];
}
