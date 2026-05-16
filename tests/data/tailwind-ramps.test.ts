import { describe, it, expect } from 'vitest';
import { getTailwindRamps, tailwindRampsHex } from '../../src/data/tailwind-ramps';

describe('tailwind-ramps', () => {
  it('exposes the expected ramp names', () => {
    const names = Object.keys(tailwindRampsHex);
    expect(names).toContain('blue');
    expect(names).toContain('slate');
    expect(names).toContain('rose');
    expect(names.length).toBe(22);
  });

  it('every ramp has the 11 Tailwind shades', () => {
    const shades = ['50','100','200','300','400','500','600','700','800','900','950'];
    for (const [name, ramp] of Object.entries(tailwindRampsHex)) {
      expect(Object.keys(ramp).sort()).toEqual(shades.sort());
      for (const v of Object.values(ramp)) {
        expect(v).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('getTailwindRamps returns a Map of oklch entries', () => {
    const map = getTailwindRamps();
    const blue = map.get('blue');
    expect(blue).toBeDefined();
    expect(blue!['500']).toHaveProperty('mode', 'oklch');
    expect(typeof blue!['500'].l).toBe('number');
  });

  it('caches the converted map between calls', () => {
    const a = getTailwindRamps();
    const b = getTailwindRamps();
    expect(a).toBe(b);
  });

  it('matches canonical Tailwind v3.4 values for spot-checked entries', () => {
    expect(tailwindRampsHex.rose['400']).toBe('#fb7185');
    expect(tailwindRampsHex.blue['500']).toBe('#3b82f6');
    expect(tailwindRampsHex.slate['950']).toBe('#020617');
    expect(tailwindRampsHex.amber['600']).toBe('#d97706');
  });
});
