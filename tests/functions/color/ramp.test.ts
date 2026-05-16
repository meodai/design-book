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

  it('throws FunctionError when the seed cannot be parsed as a color', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('color');
    // Use a string token whose rawValue isn't a parseable color
    palette.set('brand', { type: 'string', rawValue: 'not-a-color' } as any);
    palette.set('bad', ramp(ref('color.brand'), { shade: '500' }));
    expect(() => book.resolve('color.bad')).toThrow(/cannot generate scale/);
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

import { rampStops } from '../../../src/functions/color/ramp';

describe('rampStops()', () => {
  it('expands to the 11 default Tailwind shades with the given prefix', () => {
    const stops = rampStops(ref('color.brand'), { prefix: 'brand' });
    expect(Object.keys(stops).sort()).toEqual(
      ['brand100','brand200','brand300','brand400','brand50','brand500','brand600','brand700','brand800','brand900','brand950'].sort()
    );
  });

  it('each value is a ramp() function token with the right shade in options', () => {
    const stops = rampStops(ref('color.brand'), { prefix: 'b' });
    expect(stops.b500.name).toBe('ramp');
    expect(stops.b500.options).toEqual({ shade: '500' });
  });

  it('honours a custom shades array', () => {
    const stops = rampStops(ref('color.brand'), {
      prefix: 'b',
      shades: ['100', '500', '900'],
    });
    expect(Object.keys(stops).sort()).toEqual(['b100', 'b500', 'b900']);
  });

  it('integrates with DesignBook — full scale resolves with one generate call', async () => {
    const { DittoTones } = await import('dittotones');
    const spy = vi.spyOn(DittoTones.prototype, 'generate');

    const book = new DesignBook('test');
    const palette = book.addScope('color');
    palette.set('brand', color('#3b82f6'));
    const stops = rampStops(ref('color.brand'), { prefix: 'brand' });
    for (const [key, value] of Object.entries(stops)) {
      palette.set(key, value);
    }
    for (const key of Object.keys(stops)) {
      const v = book.resolve(`color.${key}`);
      expect(v).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
