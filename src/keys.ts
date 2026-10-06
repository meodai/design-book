import { TokenError } from './errors';

/** A token key becomes part of a CSS custom property (`--scope-key`) and a
 *  W3 token name, so it may only hold ASCII letters, digits, `-` and `_`,
 *  plus non-ASCII characters (valid in CSS identifiers). That rules out
 *  whitespace, `.` (the scope separator), `$`, `{` / `}` (W3 alias syntax)
 *  and every other ASCII punctuation character.
 *
 *  Kept in its own module so `design-book/naming` can check keys without
 *  pulling in the token engine. */
const VALID_TOKEN_KEY = /^(?:[A-Za-z0-9_-]|[^\x00-\x7F])+$/;

export function assertValidTokenKey(scopeName: string, name: string): void {
  if (typeof name === 'string' && VALID_TOKEN_KEY.test(name)) return;
  throw new TokenError(
    `Invalid token key "${name}" in scope "${scopeName}": keys may only contain ` +
    'letters, digits, "-" and "_" (no whitespace, ".", "$", "{", "}" or other punctuation)',
    `${scopeName}.${name}`,
  );
}
