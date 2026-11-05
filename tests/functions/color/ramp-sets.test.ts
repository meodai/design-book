import { describe, it, expect } from 'vitest';
import { radixRamps } from 'dittotones/ramps/radix';
import { DesignBook } from '../../../src/design-book';
import { color, ref } from '../../../src/tokens';
import { ramp, rampSet } from '../../../src/functions/color/ramp';

const HOUSE = {
  clay: { 100: '#f3e3d8', 500: '#b0603a', 900: '#3a1d10' },
  moss: { 100: '#e3ecd6', 500: '#5e7d3a', 900: '#1f2a12' },
};

describe('ramp sets: masters to copy', () => {
  it('copies Tailwind v3 by default and lists the sets', () => {
    const book = new DesignBook('t');
    book.addScope('brand').set('seed', color('#3b82f6'));
    book.getScope('brand')!.set('500', ramp(ref('brand.seed'), { shade: '500' }));
    expect(book.resolve('brand.500')).toBe('#3b82f6'); // tailwind blue-500 is its own 500
    expect(book.rampSetNames).toEqual(['tailwind-v3']);
  });

  it('takes a framework set from dittotones, registered after the fact, by name', () => {
    const book = new DesignBook('t');
    const brand = book.addScope('brand');
    brand.set('seed', color('#3b82f6'));
    brand.set('nine', ramp(ref('brand.seed'), { shade: '9', from: 'radix' }));
    expect(() => book.resolve('brand.nine')).toThrow(/no ramp set "radix"; registered: tailwind-v3/);
    book.registerRamps('radix', radixRamps);
    expect(book.resolve('brand.nine')).toMatch(/^#[0-9a-f]{6}$/);
    brand.set('bad', ramp(ref('brand.seed'), { shade: '500', from: 'radix' }));
    expect(() => book.resolve('brand.bad')).toThrow(/unknown shade "500"/);
  });

  it('takes your own masters in any CSS colors, and can make them the default', () => {
    const book = new DesignBook('t');
    book.registerRamps('house', HOUSE, { default: true });
    expect(book.rampSetNames).toEqual(['house', 'tailwind-v3']);
    const brand = book.addScope('brand');
    brand.set('seed', color('#b0603a'));
    brand.set('100', ramp(ref('brand.seed'), { shade: '100' }));
    expect(book.resolve('brand.100')).toBe('#f3e3d8'); // the seed is clay.500: its 100 is clay.100
    expect(() => brand.set('x', ramp(ref('brand.seed'), { shade: '100', from: '' }))).toThrow(/from/);
  });

  it('needs at least two ramps, all of the same length and shades', () => {
    expect(() => rampSet({ a: { 1: '#fff', 2: '#000' } })).toThrow(/at least two ramps, got 1/);
    expect(() => rampSet({ a: { 1: '#fff', 2: '#000' }, b: { 1: '#fff', 2: '#888', 3: '#000' } })).toThrow(/3 shades, the others 2; every ramp needs the same length/);
    expect(() => rampSet({ a: { 1: '#fff', 2: '#000' }, b: { 1: '#fff', 3: '#000' } })).toThrow(/same/);
    expect(() => rampSet({ a: { 1: 'nope', 2: '#000' }, b: { 1: '#fff', 2: '#000' } })).toThrow(/cannot read a.1/);
    expect(() => new DesignBook('t').registerRamps('one', ['clay'])).toThrow(/at least two scopes/);
  });

  it("takes the book's own scopes as masters, live", () => {
    const book = new DesignBook('t');
    const clay = book.addScope('clay');
    for (const [k, v] of Object.entries(HOUSE.clay)) clay.set(k, color(v));
    const moss = book.addScope('moss');
    for (const [k, v] of Object.entries(HOUSE.moss)) moss.set(k, color(v));
    book.registerRamps('house', [clay, ref('moss')]);

    const brand = book.addScope('brand');
    brand.set('seed', color('#b0603a'));
    brand.set('100', ramp(ref('brand.seed'), { shade: '100', from: 'house' }));
    expect(book.resolve('brand.100')).toBe('#f3e3d8');

    // a master changes: the copy follows, and listeners hear it
    const heard: string[] = [];
    book.on('change', (e) => heard.push(...e.detail.changedKeys));
    clay.set('100', color('#ffe0cc'));
    expect(heard).toContain('brand.100');
    expect(book.resolve('brand.100')).not.toBe('#f3e3d8');
  });

  it('refuses a master that copies its own set', () => {
    const book = new DesignBook('t');
    const clay = book.addScope('clay');
    clay.set('100', color('#f3e3d8'));
    clay.set('900', ramp(color('#b0603a'), { shade: '100', from: 'house' }));
    const moss = book.addScope('moss');
    moss.set('100', color('#e3ecd6'));
    moss.set('900', color('#1f2a12'));
    book.registerRamps('house', ['clay', 'moss']);
    expect(() => book.resolve('clay.900')).toThrow(/reads itself|Circular dependency/);
  });

  it('announces the ramps that read a set when it is replaced', () => {
    const book = new DesignBook('t');
    book.registerRamps('house', HOUSE);
    const brand = book.addScope('brand');
    brand.set('seed', color('#b0603a'));
    brand.set('100', ramp(ref('brand.seed'), { shade: '100', from: 'house' }));
    const heard: string[] = [];
    book.on('change', (e) => heard.push(...e.detail.changedKeys));
    book.registerRamps('house', { ...HOUSE, clay: { 100: '#ffffff', 500: '#b0603a', 900: '#000000' } });
    expect(heard).toEqual(['brand.100']);
    expect(book.resolve('brand.100')).toBe('#ffffff');
  });
});

import { beforeAll } from 'vitest';
import { parseTokenInput } from '../../../site/editor/editor-input-parser';
import { loadEditorModule } from '../../editor/load-editor';

describe('ramp sets in the editor', () => {
  let getTokenDisplayValue: (scope: any, key: string) => string;
  beforeAll(async () => { ({ getTokenDisplayValue } = await loadEditorModule()); });

  it('round-trips from', () => {
    const book = new DesignBook('t');
    const brand = book.addScope('brand');
    brand.set('seed', color('#b0603a'));
    const original = ramp(ref('brand.seed'), { shade: '100', from: 'house' });
    brand.set('100', original);
    const printed = getTokenDisplayValue(brand, '100');
    expect(printed).toContain('from');
    expect(parseTokenInput(printed, book, brand)).toEqual(original);
  });
});
