import {
  createFunctionToken,
  isReferenceValue,
  isRelativeKey,
  isScopeKey,
  normalizeNotKeys,
} from '../../tokens';
import type { FunctionTokenValue, ReferenceValue } from '../../tokens';
import type { Scope } from '../../scope';
import { FunctionError } from '../../errors';
import { poolKeys } from '../scope-members';
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
 * Steps along the scale the anchor's color lives on (see `locateMember` in `../members`):
 * `sibling(ref('gray.g100'), 1)` is the next member of `gray`, and
 * `sibling(ref('.surface'), 11)` — with `.surface` a `ref('brand-scale.100')` —
 * steps along `brand-scale`. The step count defaults to 1.
 *
 * `toward` takes the direction from where another token's color sits on the
 * same scale, so one rule fits a light and a dark scope:
 * `sibling(ref('.major-action--default'), 4, { toward: ref('.surface') })` is
 * four steps toward the page, lighter on a light page, darker on a dark one.
 * It stops at the target; a negative count walks away from it. Both anchor
 * and target may be `inParent` / `inRoot` references.
 *
 * The anchor's *key* is what matters (its position), not its value, so it is
 * stored in the options rather than as an argument the resolver would turn
 * into a value. The scope it walks is declared in `metadata.iteratedScopes`.
 */
export function sibling(
  anchor: ReferenceValue,
  offset?: number | SiblingOptions,
  options?: SiblingOptions,
): FunctionTokenValue {
  if (!isReferenceValue(anchor)) {
    throw new FunctionError('sibling: the anchor must be a ref(...) to a token', 'sibling');
  }
  if (typeof offset === 'object' && offset !== null) {
    options = offset;
    offset = undefined;
  }
  const steps = offset ?? 1;
  if (!Number.isInteger(steps)) {
    throw new FunctionError(`sibling: the step count must be an integer, got ${String(steps)}`, 'sibling');
  }
  const toward = options?.toward;
  if (toward !== undefined) {
    if (!isReferenceValue(toward) || isScopeKey(toward.key)) {
      throw new FunctionError('sibling: `toward` must be a ref(...) to a token', 'sibling');
    }
    if (options?.wrap) {
      throw new FunctionError('sibling: `toward` and `wrap` do not go together: toward stops at its target', 'sibling');
    }
  }

  const scopeName = scopeOfKey(anchor.key);
  // A navigated anchor or target (`inParent(ref('.g100'))`) names its key
  // only once a scope reads the token: keep the reference, and let binding
  // add the key as a dependency. A key is stored as is.
  const asStored = (r: ReferenceValue) => (r.up !== undefined ? { type: 'reference' as const, key: r.key, up: r.up } : r.key);
  const keys = [anchor, ...(toward ? [toward] : [])].filter((r) => r.up === undefined).map((r) => r.key);

  return createFunctionToken('sibling', [], {
    description: options?.description,
    options: {
      from: asStored(anchor),
      offset: steps,
      wrap: options?.wrap ?? false,
      not: normalizeNotKeys(options?.not),
      ...(toward ? { toward: asStored(toward) } : {}),
    },
    metadata: {
      dependencies: keys,
      visualDependencies: keys,
      iteratedScopes: anchor.up !== undefined ? [] : [scopeName],
      returnType: undefined,
    },
  });
}
