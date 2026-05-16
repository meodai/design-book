import { describe, it, expect, vi } from 'vitest';
import { DittoTones } from 'dittotones';
import { RampEngine } from '../../../src/functions/color/ramp';
import { getTailwindRamps } from '../../../src/data/tailwind-ramps';
import { DesignBook } from '../../../src/design-book';
import { color, ref } from '../../../src/tokens';
import { ramp } from '../../../src/functions/color/ramp';
import { parse } from 'culori';

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

describe('ramp()', () => {
  it('resolves a hex string for the requested shade', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('color');
    palette.set('brand', color('#3b82f6'));
    palette.set('brand500', ramp(ref('color.brand'), { shade: '500' }));

    const resolved = book.resolve('color.brand500');
    expect(resolved).toMatch(/^#[0-9a-f]{6}$/i);
    expect(parse(resolved)).toBeDefined();
  });

  it('different shades for the same seed give different hex values', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('color');
    palette.set('brand', color('#3b82f6'));
    palette.set('s100', ramp(ref('color.brand'), { shade: '100' }));
    palette.set('s900', ramp(ref('color.brand'), { shade: '900' }));

    const a = book.resolve('color.s100');
    const b = book.resolve('color.s900');
    expect(a).not.toBe(b);
  });

  it('changing the seed propagates to ramp tokens', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('color');
    palette.set('brand', color('#3b82f6'));
    palette.set('s500', ramp(ref('color.brand'), { shade: '500' }));

    const before = book.resolve('color.s500');
    palette.set('brand', color('#ef4444'));
    const after = book.resolve('color.s500');
    expect(after).not.toBe(before);
  });

  it('throws FunctionError on unknown shade', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('color');
    palette.set('brand', color('#3b82f6'));
    palette.set('bad', ramp(ref('color.brand'), { shade: '12345' }));

    expect(() => book.resolve('color.bad')).toThrow(/unknown shade/);
  });

  it('resolves a full Tailwind-style scale with one dittotones.generate call', async () => {
    const { DittoTones } = await import('dittotones');
    const spy = vi.spyOn(DittoTones.prototype, 'generate');

    const book = new DesignBook('test');
    const palette = book.addScope('color');
    palette.set('brand', color('#3b82f6'));
    const seed = ref('color.brand');
    for (const shade of ['50','100','200','300','400','500','600','700','800','900','950']) {
      palette.set(`b${shade}`, ramp(seed, { shade }));
    }
    for (const shade of ['50','100','200','300','400','500','600','700','800','900','950']) {
      book.resolve(`color.b${shade}`);
    }
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
