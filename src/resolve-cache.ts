import type { Resolution } from './functions/picks';
import { TokenError } from './errors';
import { rootScopeOf } from './keys';

/**
 * How often one read may be turned away by the re-entrancy guard before it
 * is given up. Selectors in two scopes that read each other's scope are each
 * worked out again inside every other one — the work multiplies with every
 * such selector — so a handful per scope is quick and a few more would not
 * end in reasonable time. Reading a key that gets there throws instead.
 */
export const REENTRY_BUDGET = 2_000;

/**
 * The book's memo of resolved values, keyed by qualified key.
 *
 * Cleared on every change that can move a value: a token written, deleted
 * or rolled back, a scope's order, scopes added or removed, a function,
 * ramp set or orderer registered. Between changes every key is computed
 * once, however many pools, events and renderers read it.
 *
 * Two kinds of result are not kept, because they depend on the resolution
 * they were computed in rather than on the book alone:
 * - a result computed while the re-entrancy guard turned something away
 *   (`trip`): a pool computed inside another resolution may have skipped a
 *   member only because that member was mid-resolution;
 * - anything computed while a scope sorts its keys (`without`), when pools
 *   see the keys in insertion order.
 * Errors are not kept either.
 *
 * `memo` keeps anything else built from resolved values (a scope's pool of
 * candidates) under the same rules, per owner, until the next `clear`.
 */
export class ResolveCache {
  private entries = new Map<string, Resolution>();
  private derived = new WeakMap<object, Map<string, unknown>>();
  private off = 0;
  private trips = 0;
  /** Reads in progress, one inside another. */
  private depth = 0;
  /** Times the guard turned a key away during the outermost read, and the
   *  scopes those keys are in. */
  private turnedAway = 0;
  private turnedAwayIn = new Set<string>();
  /** The outermost read went over `REENTRY_BUDGET`: everything inside it
   *  stops, and it throws. */
  private spent = false;
  private _generation = 0;

  /** Bumped by every `clear`: anything derived from resolved values and
   *  stamped with the generation it was computed in is current while the
   *  stamp matches. */
  get generation(): number {
    return this._generation;
  }

  /** Forget every value. */
  clear(): void {
    this.entries.clear();
    this.givenUpKeys.clear();
    this.derived = new WeakMap();
    this._generation++;
  }

  /** Runs `build` and says whether its result depends on the book alone
   *  (`settled`) — not built with the cache off, nor while the re-entrancy
   *  guard turned a key away, nor across a change. Only a settled result
   *  may be kept and shared. */
  settle<T>(build: () => T): { value: T; settled: boolean } {
    const trips = this.trips;
    const generation = this._generation;
    const value = build();
    return { value, settled: this.off === 0 && this.trips === trips && this._generation === generation };
  }

  /** Something built from resolved values, kept for `owner` under `name`
   *  until the next change — unless it was built with the cache off or
   *  while the re-entrancy guard turned a key away, when it may be missing
   *  a member that was only mid-resolution. */
  memo<T>(owner: object, name: string, build: () => T): T {
    if (this.off === 0) {
      const hit = this.derived.get(owner);
      if (hit?.has(name)) return hit.get(name) as T;
    }
    const { value, settled } = this.settle(build);
    if (settled) {
      let kept = this.derived.get(owner);
      if (!kept) this.derived.set(owner, kept = new Map());
      kept.set(name, value);
    }
    return value;
  }

  /** The re-entrancy guard refused `key`: nothing computed around it is
   *  kept. Over the budget, the read it happened in is given up. */
  trip(key: string): void {
    this.trips++;
    if (this.depth === 0) return;
    if (this.turnedAwayIn.size < 8) this.turnedAwayIn.add(rootScopeOf(key));
    if (++this.turnedAway > REENTRY_BUDGET) this.spent = true;
  }

  /** Runs `fn` with the cache neither read nor written. */
  without<T>(fn: () => T): T {
    this.off++;
    try {
      return fn();
    } finally {
      this.off--;
    }
  }

  /** The resolution of `key` (its value, and the member it is when it is
   *  one): from the cache, or computed and kept. */
  resolve(key: string, compute: () => Resolution): Resolution {
    if (this.off === 0) {
      const hit = this.entries.get(key);
      if (hit) return hit;
    }
    // Given up: every read still inside the outermost one ends at once.
    if (this.spent) {
      // Turned away like a key mid-resolution: whatever is being worked out
      // around this is missing it, and must not be kept.
      this.trips++;
      throw new TokenError(`${key}: not read, the read around it was given up`, key);
    }
    const trips = this.trips;
    const outermost = this.depth === 0;
    // Given up before, in this state of the book: the same answer, at once.
    if (outermost && this.givenUpKeys.has(key)) throw this.givenUpKeys.get(key)!;
    if (outermost) {
      this.turnedAway = 0;
      this.turnedAwayIn.clear();
    }
    this.depth++;
    let resolution: Resolution;
    try {
      resolution = compute();
    } catch (e) {
      // Given up: say so, whatever error the unwinding ended on.
      if (outermost && this.spent) throw this.givenUp(key);
      throw e;
    } finally {
      this.depth--;
    }
    if (outermost && this.spent) throw this.givenUp(key);
    if (this.off === 0 && this.trips === trips) this.entries.set(key, resolution);
    return resolution;
  }

  /** The error for a read given up over the budget: which scopes read each
   *  other, and how to stop them. */
  private givenUp(key: string): TokenError {
    this.spent = false;
    const names = [...this.turnedAwayIn].sort();
    const scopes = names.map((name) => `"${name}"`).join(', ');
    const error = new TokenError(
      `${key}: selectors in ${scopes} read each other's scopes, and each is worked out again inside every other one — `
      + 'too many of them to finish. Leave the members that select back out of each selector\'s pool with `not` '
      + '(for example `not: [ref(\'scope.member\')]`), or move them to a scope the others do not search.',
      key,
      { scopes: names },
    );
    this.givenUpKeys.set(key, error);
    return error;
  }

  /** Keys whose read was given up, until the book next changes. */
  private givenUpKeys = new Map<string, TokenError>();
}
