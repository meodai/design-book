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
 */
export class ResolveCache {
  private entries = new Map<string, Resolution>();
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
    this._generation++;
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
