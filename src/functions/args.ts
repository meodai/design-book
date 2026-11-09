import { isReferenceValue, isScopeKey, ref } from '../tokens';
import type { FunctionArg, ReferenceValue } from '../tokens';
import { Scope } from '../scope';
import { FunctionError } from '../errors';

/** What a selector accepts as its pool: `ref('palette')` or the scope itself. */
export type PoolArg = ReferenceValue | Scope;

/**
 * A selector's pool argument, as the token stores it: a reference to a scope.
 * Accepts `ref('palette')`, `ref('.')` (also inside `inherited`)
 * or a `Scope` of a book — `mostVivid(palette)` — which becomes
 * `ref('palette')` here, so the token holds data, not a live scope. The pool
 * is the scope's membership, read by name when the token resolves; an object
 * that merely looks like a scope (a filtered view, a wrapper) is refused
 * rather than silently replaced by the scope it is named after.
 */
export function poolArg(fn: string, arg: unknown): ReferenceValue {
  if (isReferenceValue(arg)) {
    if (isScopeKey(arg.key)) return arg;
    throw new FunctionError(`${fn} needs a scope to search, got the token '${arg.key}'; pass ref('scope')`, fn);
  }
  if (arg instanceof Scope) return ref(arg.name);
  throw new FunctionError(`${fn} needs a scope to search: pass ref('scope') or a scope of the book`, fn);
}

/** Checks an argument that must be a value, not a pool: a scope reference
 *  there is refused, since a scope has no color or size of its own. */
export function valueArg<T extends FunctionArg | undefined>(fn: string, arg: T): T {
  if (isReferenceValue(arg) && isScopeKey(arg.key)) {
    const name = arg.key === '.' ? 'the reading scope' : `the scope '${arg.key}'`;
    throw new FunctionError(`${fn} needs a value, got ${name}; a token is 'scope.token'`, fn);
  }
  return arg;
}

/** Checks a number option at construction: finite, and `positive` (> 0),
 *  `atLeast` a bound, or an `integer` when asked. */
export function assertNumber(
  fn: string,
  label: string,
  value: unknown,
  rule: { positive?: boolean; atLeast?: number; integer?: boolean } = {},
): void {
  const ok = typeof value === 'number' && Number.isFinite(value)
    && (!rule.positive || value > 0)
    && (rule.atLeast === undefined || value >= rule.atLeast)
    && (!rule.integer || Number.isInteger(value));
  if (!ok) {
    const what = rule.integer ? 'a whole number' : rule.positive ? 'a positive number'
      : rule.atLeast !== undefined ? `a number of ${rule.atLeast} or more` : 'a finite number';
    throw new FunctionError(`${fn}: \`${label}\` must be ${what}, got ${String(value)}`, fn);
  }
}

/** Option names shared by several functions. */
export const READABLE_OPTIONS = ['readableOn', 'readableContrast'] as const;

/**
 * Checks a constructor's options object: every key must be one the function
 * reads. A misspelled or outdated option would otherwise be ignored without
 * a word, and the token would quietly run on the default. `description`
 * (stored on the token) is always allowed.
 */
export function assertOptions(fn: string, options: unknown, allowed: readonly string[]): void {
  if (options === undefined || options === null) return;
  if (typeof options !== 'object' || Array.isArray(options)) {
    throw new FunctionError(`${fn}: options must be an object, got ${Array.isArray(options) ? 'an array' : typeof options}`, fn);
  }
  for (const key of Object.keys(options)) {
    if (key === 'description' || allowed.includes(key)) continue;
    const expected = [...allowed, 'description'].join(', ');
    throw new FunctionError(`${fn}: unknown option \`${key}\` (expected ${expected})`, fn);
  }
}
