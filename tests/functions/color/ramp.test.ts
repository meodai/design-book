import { describe, it, expect, vi } from 'vitest';
import { DittoTones } from 'dittotones';
import { RampEngine } from '../../../src/functions/color/ramp';
import { getTailwindRamps } from '../../../src/data/tailwind-ramps';

describe('RampEngine', () => {
  it('returns a generate result for a seed', () => {
    const engine = new RampEngine({ ramps: getTailwindRamps() });
    const result = engine.generate('#3b82f6');
    expect(result.scale).toBeDefined();
    expect(result.scale['500']).toBeDefined();
  });

  it('caches results per seed (one dittotones.generate call per unique seed)', () => {
    const spy = vi.spyOn(DittoTones.prototype, 'generate');
    const engine = new RampEngine({ ramps: getTailwindRamps() });

    engine.generate('#3b82f6');
    engine.generate('#3b82f6');
    engine.generate('#3b82f6');

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('evicts oldest entries when cache exceeds maxSize', () => {
    const engine = new RampEngine({ ramps: getTailwindRamps(), cacheSize: 2 });
    const spy = vi.spyOn(DittoTones.prototype, 'generate');

    engine.generate('#ff0000');  // call 1
    engine.generate('#00ff00');  // call 2
    engine.generate('#0000ff');  // call 3 → evicts #ff0000
    engine.generate('#ff0000');  // call 4 (regenerate)

    expect(spy).toHaveBeenCalledTimes(4);
    spy.mockRestore();
  });
});
