import {
  createFunctionToken,
  isReferenceValue,
  isRelativeKey,
  isMemberReference,
  isScopeKey,
  memberReference,
  normalizeNotKeys,
} from '../../tokens';
import type { FunctionTokenValue, ReferenceValue } from '../../tokens';
import type { Scope } from '../../scope';
import { FunctionError } from '../../errors';
import { poolKeys } from '../scope-members';
import { poolArg } from '../args';
import type { PoolArg } from '../args';
import { picked } from '../picks';

export interface SiblingOptions {
  /** Step in the direction of this token's color on the same scale, and
   *  stop when it is reached. With a negative step count: away from it. */
  toward?: ReferenceValue;
  /** Wrap around past either end (modulo) instead of stopping there. */
  wrap?: boolean;
  /** Keys to skip while stepping. */
  not?: ReadonlyArray<string | ReferenceValue>;
  description?: string;
  [key: string]: any;
}

/** Scope name of a fully-qualified key. Scope names cannot contain dots.
 *  A relative key (`.token`) gives `''` — the scope that reads it, filled in
 *  when the token is bound. Throws on a key that is neither: an unqualified
 *  anchor would otherwise yield a nonsense scope name (`'g10'` from `'g100'`). */
export function scopeOfKey(key: string): string {
  if (isRelativeKey(key) && !key.includes('.', 1)) return '';
  const dot = key.indexOf('.');
  if (dot <= 0 || dot === key.length - 1) {
    throw new FunctionError(`sibling: the anchor must be a fully-qualified 'scope.token' key, got "${key}"`, 'sibling');
  }
  return key.slice(0, dot);
}

/**
 * Steps `offset` members away from `anchor` within its scope, in the
 * scope's key order (inherited members included), and returns that member's
 * resolved value. Past either end it stops at the first / last member, or
 * wraps around when `wrap` is set.
 *
 * The pool follows the rules every scope-walking selector shares
 * (`../scope-members`): members that are themselves functions walking this
 * scope — another `sibling`, an `nth`, a selector — are skipped, so a
 * `sibling` can live in the scope it walks without stepping onto itself and
 * counts the same positions `nth` does.
 */
export function siblingImpl(
  scope: Scope,
  anchor: string,
  offset: number,
  wrap: boolean = false,
  not: string[] = [],
  toward?: string,
): string {
  // Membership is cheap to decide; resolving is not. Only the anchor and the
  // members actually stepped over are resolved. A member that fails to
  // resolve is not part of the pool: it is stepped over without counting.
  const keys = poolKeys(scope, not);
  const memo = new Map<number, string | null>();
  const valueAt = (i: number): string | null => {
    if (!memo.has(i)) {
      let value: string | null;
      try {
        value = scope.resolve(keys[i]);
      } catch {
        value = null;
      }
      memo.set(i, value);
    }
    return memo.get(i)!;
  };

  const at = keys.indexOf(anchor.slice(scope.name.length + 1));
  if (at === -1 || valueAt(at) === null) {
    throw new FunctionError(
      `sibling: "${anchor}" is not in the pool of scope "${scope.name}"`,
      'sibling',
    );
  }

  let dir = Math.sign(offset);
  let steps = Math.abs(offset);
  let i = at;
  // `toward`: the direction is wherever the target sits; a positive count
  // walks to it and stops there, a negative one walks away from it.
  let stopAt: number | undefined;
  if (toward !== undefined) {
    const target = keys.indexOf(toward.slice(scope.name.length + 1));
    if (target === -1) {
      throw new FunctionError(`sibling: "${toward}" is not in the pool of scope "${scope.name}"`, 'sibling');
    }
    if (target === at) return picked(scope, keys[at], valueAt(at)!);
    const towardDir = Math.sign(target - at);
    dir = offset >= 0 ? towardDir : -towardDir;
    if (offset >= 0) stopAt = target;
  }

  if (wrap) {
    // Reduce a long walk modulo the number of resolvable members; that
    // count needs every member resolved, so only pay for it when the walk
    // could go round more than once.
    if (steps >= keys.length) {
      let n = 0;
      for (let k = 0; k < keys.length; k++) if (valueAt(k) !== null) n++;
      steps %= n;
    }
    while (steps > 0) {
      i = (i + dir + keys.length) % keys.length;
      if (valueAt(i) !== null) steps--;
    }
    return picked(scope, keys[i], valueAt(i)!);
  }

  // Without wrap, stop at the last resolvable member in that direction —
  // and, walking toward a target, at the target.
  let last = at;
  while (steps > 0) {
    if (i === stopAt) break;
    i += dir;
    if (i < 0 || i >= keys.length) break;
    if (valueAt(i) !== null) {
      last = i;
      steps--;
    }
  }
  return picked(scope, keys[last], valueAt(last)!);
}

/**
 * Steps along a scale, from an anchor: `sibling(ref('gray.g100'), 1)` is the
 * next member of `gray`. The step count defaults to 1; a negative count
 * steps back.
 *
 * **Which scale** is never guessed:
 *
 * - by default, the anchor's own scope — the one its key is written in
 *   (`sibling(ref('space.s'), 1)` walks `space`, even when `space.s` is a
 *   reference into another scale);
 * - with a scope argument, that scope: `sibling(ref('.interaction'),
 *   ref('blue'), -2)` follows `.interaction`'s references until they land in
 *   `blue` (refused if they never do) and steps from there;
 * - with `source(…)`, wherever the references lead:
 *   `sibling(source(ref('.interaction'), 'root'), -2)` walks the scale the
 *   value is written in, whichever that is — a rule that holds across themes
 *   whose interaction colors come from different ramps.
 *
 * `inherited(ref('.x'))` reads the anchor one scope up the `extends` chain.
 *
 * `toward` takes the direction from where another member sits on the same
 * scale (its references followed into it, like a `not` entry), so one rule
 * fits a light and a dark page: `sibling(ref('.interaction'), ref('blue'), 4,
 * { toward: ref('.surface') })` is four steps toward the page. It stops at the
 * target; a negative count walks away from it.
 *
 * The anchor's *key* is what matters (its position), not its value, so it is
 * stored in the options rather than as an argument the resolver would turn
 * into a value. The scope it walks is declared in `metadata.iteratedScopes`
 * (or, given as a scope argument, is the function's argument).
 */
export function sibling(
  anchor: ReferenceValue,
  pool?: PoolArg | number | SiblingOptions,
  offset?: number | SiblingOptions,
  options?: SiblingOptions,
): FunctionTokenValue {
  if (!isReferenceValue(anchor) || anchor.key === '.') {
    throw new FunctionError('sibling: the anchor must be a ref(...) to a token', 'sibling');
  }
  // sibling(anchor, pool?, steps?, options?): the pool and the count are
  // each optional, in that order.
  const rest: unknown[] = [pool, offset, options].filter((r) => r !== undefined);
  let scale: ReferenceValue | undefined;
  if (rest.length > 0 && typeof rest[0] !== 'number' && !isPlainOptions(rest[0])) {
    scale = poolArg('sibling', rest.shift());
  }
  const steps = typeof rest[0] === 'number' ? (rest.shift() as number) : 1;
  if (rest.length > 1 || (rest.length === 1 && !isPlainOptions(rest[0]))) {
    throw new FunctionError('sibling: expects (anchor, scope?, steps?, options?)', 'sibling');
  }
  const opts = (rest[0] ?? {}) as SiblingOptions;
  if (!Number.isInteger(steps)) {
    throw new FunctionError(`sibling: the step count must be an integer, got ${String(steps)}`, 'sibling');
  }
  const toward = opts.toward;
  if (toward !== undefined) {
    if (!isReferenceValue(toward) || isScopeKey(toward.key)) {
      throw new FunctionError('sibling: `toward` must be a ref(...) to a token', 'sibling');
    }
    if (opts.wrap) {
      throw new FunctionError('sibling: `toward` and `wrap` do not go together: toward stops at its target', 'sibling');
    }
  }

  const scopeName = scopeOfKey(anchor.key);
  // A navigated anchor or target (`inherited(ref('.g100'))`) names its key
  // only once a scope reads the token, a `source` one only once it is
  // followed: keep the reference (binding adds an inherited key as a
  // dependency). A plain key is stored as is.
  const asStored = (r: ReferenceValue) => (r.up !== undefined || isMemberReference(r)
    ? { ...memberReference(r), ...(r.up !== undefined ? { up: r.up } : {}) }
    : r.key);
  // `refersTo` reads only the scale (the selector index covers it), not its key's value.
  const keys = [anchor, ...(toward ? [toward] : [])]
    .filter((r) => r.up === undefined && !(r.referredBy && r.via === undefined))
    .map((r) => r.key);
  if (anchor.referredBy && !scale) {
    throw new FunctionError(
      `sibling: refersTo(ref('${anchor.key}')) needs the scale named: sibling(refersTo(ref('${anchor.key}')), ref('scale'), n)`,
      'sibling',
    );
  }
  // The scope walked: the scope argument; else the anchor's own scope, known
  // now unless the anchor still has to be navigated or followed.
  const walks = scale ? [] : anchor.up !== undefined || anchor.via !== undefined ? [] : [scopeName];

  return createFunctionToken('sibling', scale ? [scale] : [], {
    description: opts.description,
    options: {
      from: asStored(anchor),
      offset: steps,
      wrap: opts.wrap ?? false,
      not: normalizeNotKeys(opts.not),
      ...(toward ? { toward: asStored(toward) } : {}),
    },
    metadata: {
      dependencies: keys,
      iteratedScopes: walks,
      returnType: undefined,
    },
  });
}

/** An options object, as opposed to a scope or a scope reference. */
function isPlainOptions(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !isReferenceValue(value)
    && typeof (value as { getAllKeys?: unknown }).getAllKeys !== 'function';
}
