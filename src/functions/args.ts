import { isReferenceValue, isScopeKey, ref } from '../tokens';
import type { FunctionArg, ReferenceValue } from '../tokens';
import type { Scope } from '../scope';
import { FunctionError } from '../errors';

/** What a selector accepts as its pool: `ref('palette')` or the scope itself. */
export type PoolArg = ReferenceValue | Scope;

/**
 * A selector's pool argument, as the token stores it: a reference to a scope.
 * Accepts `ref('palette')`, `ref('.')` (also inside `inherited`)
 * or the scope object itself — `mostVivid(palette)` — which becomes
 * `ref('palette')` here, so the token holds data, not a live scope. A token
 * reference or anything else is refused with a message that says what to
 * write instead.
 */
export function poolArg(fn: string, arg: unknown): ReferenceValue {
  if (isReferenceValue(arg)) {
    if (isScopeKey(arg.key)) return arg;
    throw new FunctionError(`${fn} needs a scope to search, got the token '${arg.key}'; pass ref('scope')`, fn);
  }
  const name = (arg as { name?: unknown } | null)?.name;
  if (typeof (arg as { getAllKeys?: unknown } | null)?.getAllKeys === 'function' && typeof name === 'string') {
    return ref(name);
  }
  throw new FunctionError(`${fn} needs a scope to search: pass ref('scope') or the scope`, fn);
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
