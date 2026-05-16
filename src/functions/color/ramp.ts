import { DittoTones } from 'dittotones';
import type { GenerateResult, Ramp } from 'dittotones';

export interface RampEngineOptions {
  ramps: Map<string, Ramp>;
  preserveHueOffsets?: boolean;
  gamutMap?: boolean;
  /** LRU cache cap. Defaults to 32. */
  cacheSize?: number;
}

export class RampEngine {
  private dt: DittoTones;
  private cache = new Map<string, GenerateResult>();
  private cacheSize: number;

  constructor(opts: RampEngineOptions) {
    this.dt = new DittoTones({
      ramps: opts.ramps,
      preserveHueOffsets: opts.preserveHueOffsets ?? true,
      gamutMap: opts.gamutMap ?? true,
    });
    this.cacheSize = opts.cacheSize ?? 32;
  }

  generate(seed: string): GenerateResult {
    const hit = this.cache.get(seed);
    if (hit) {
      // refresh LRU position
      this.cache.delete(seed);
      this.cache.set(seed, hit);
      return hit;
    }
    const result = this.dt.generate(seed);
    if (this.cache.size >= this.cacheSize) {
      const oldest = this.cache.keys().next().value as string;
      this.cache.delete(oldest);
    }
    this.cache.set(seed, result);
    return result;
  }
}
