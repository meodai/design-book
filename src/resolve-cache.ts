import type { Resolution } from './functions/picks';

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

  /** The re-entrancy guard refused a key: nothing computed around it is kept. */
  trip(): void {
    this.trips++;
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
    const trips = this.trips;
    const resolution = compute();
    if (this.off === 0 && this.trips === trips) this.entries.set(key, resolution);
    return resolution;
  }
}
