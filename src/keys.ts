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

/** The scope a key belongs to: everything before its last dot — `gray`
 *  for `gray.g100`, `type.title` for `type.title.fontSize` (the key
 *  `fontSize` of the group `type.title`). A key without a dot names a
 *  top-level scope and comes back unchanged. */
export function scopeOf(key: string): string {
  const dot = key.lastIndexOf('.');
  return dot === -1 ? key : key.slice(0, dot);
}

/** A key taken apart: the path of the scope it belongs to and its name in
 *  it (`type.title` and `fontSize` for `type.title.fontSize`), or a
 *  relative path (`.`, `.title`, `.title.fontSize`: `scope` is `''`, the
 *  scope that reads it). A path of one segment names a top-level scope
 *  (`token` unset). */
export interface ParsedKey {
  scope: string;
  token?: string;
  relative: boolean;
}

/** Takes a key apart, or returns `null` when it is not a path (an empty
 *  segment). The one parser for keys. */
export function parseKey(key: string): ParsedKey | null {
  if (typeof key !== 'string' || key === '') return null;
  const relative = key.startsWith('.');
  if (relative && key === '.') return { scope: '', relative };
  const parts = (relative ? key.slice(1) : key).split('.');
  if (parts.some((p) => p === '')) return null;
  if (relative) {
    return { scope: parts.length > 1 ? `.${parts.slice(0, -1).join('.')}` : '', token: parts[parts.length - 1], relative };
  }
  if (parts.length === 1) return { scope: parts[0], relative };
  return { scope: parts.slice(0, -1).join('.'), token: parts[parts.length - 1], relative };
}

/** `scope.name` split at the last dot: `['type.title', 'fontSize']` for
 *  `type.title.fontSize`; `null` without a dot. */
export function splitKey(key: string): [scope: string, name: string] | null {
  const dot = key.lastIndexOf('.');
  return dot <= 0 ? null : [key.slice(0, dot), key.slice(dot + 1)];
}

/** The top-level scope a key starts in: `type` for `type.title.fontSize`. */
export function rootScopeOf(key: string): string {
  const dot = key.indexOf('.');
  return dot === -1 ? key : key.slice(0, dot);
}
