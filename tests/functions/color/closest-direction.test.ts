import { beforeAll, describe, it, expect, vi } from 'vitest';
import { converter } from 'culori';
import { DesignBook } from '../../../src/design-book';
import { color, ref, closest, FunctionError } from '../../../src/index';
import { parseTokenInput } from '../../../editor/editor-input-parser';
import { loadEditorModule } from '../../editor/load-editor';

const L = (hex: string) => converter('oklch')(hex)!.l;

/** Blues plus a yellow that is the next step up in lightness from mid-blue. */
function palette() {
  const book = new DesignBook('t');
  const p = book.addScope('p');
  p.set('navy', color('#13254a'));
  p.set('white', color('#ffffff'));
  p.set('blue', color('#2d60a5'));
  p.set('sky', color('#8fb3ff'));
  p.set('mid', color('#4a7bd0'));
  p.set('mustard', color('#8a7a2a'));
  const ui = book.addScope('ui');
  return { book, p, ui };
}

describe('closest with a direction', () => {
  it('picks the nearest look-alike on that side, staying in the hue family', () => {
    const { book, ui } = palette();
    ui.set('button', ref('p.blue'));
    ui.set('up', closest(ref('ui.button'), ref('p'), { direction: 'lighter' }));
    ui.set('down', closest(ref('ui.button'), ref('p'), { direction: 'darker' }));
    // mustard is closer in lightness than mid, but mid looks closer
    expect(L('#8a7a2a') - L('#2d60a5')).toBeLessThan(L('#4a7bd0') - L('#2d60a5'));
    expect(book.resolve('ui.up')).toBe('#4a7bd0');
    expect(book.resolve('ui.down')).toBe('#13254a');
  });

  it('never returns the target itself', () => {
    const { book, ui } = palette();
    ui.set('up', closest(ref('p.blue'), ref('p'), { direction: 'lighter' }));
    expect(book.resolve('ui.up')).not.toBe('#2d60a5');
  });

  it('takes a minDistance in OKLCH lightness', () => {
    const { book, ui } = palette();
    const gap = L('#4a7bd0') - L('#2d60a5');
    ui.set('up', closest(ref('p.blue'), ref('p'), { direction: 'lighter', minDistance: gap + 0.01 }));
    expect(L(book.resolve('ui.up'))).toBeGreaterThan(L('#4a7bd0'));
  });

  it('throws when nothing is on that side', () => {
    const { book, ui } = palette();
    ui.set('up', closest(ref('p.white'), ref('p'), { direction: 'lighter' }));
    expect(() => book.resolve('ui.up')).toThrow(/no member of scope "p" is lighter/);
  });
});

describe('closest upTo', () => {
  it('takes the side from another color and is one rule for light and dark', () => {
    const book = new DesignBook('t');
    const p = book.addScope('p');
    for (const [k, v] of Object.entries({ a: '#eef4ff', b: '#bcd2ff', c: '#5c8cf5', d: '#2650c2', e: '#172f75', f: '#101f4d' })) p.set(k, color(v));
    const light = book.addScope('light');
    light.set('page', ref('p.a'));
    light.set('button', ref('p.d'));
    light.set('hover', closest(ref('.button'), ref('p'), { upTo: ref('.page') }));
    const dark = book.addScope('dark', { extends: 'light' });
    dark.set('page', ref('p.f'));
    dark.set('button', ref('p.b'));
    expect(book.resolve('light.hover')).toBe('#5c8cf5');  // lighter
    expect(book.resolve('dark.hover')).toBe('#5c8cf5');   // darker, from b
    dark.set('button', ref('p.c'));
    expect(book.resolve('dark.hover')).toBe('#2650c2');
  });

  it('stops at the target lightness', () => {
    const book = new DesignBook('t');
    const p = book.addScope('p');
    p.set('page', color('#8fb3ff'));
    p.set('paler', color('#eef4ff'));
    p.set('button', color('#2650c2'));
    const ui = book.addScope('ui');
    ui.set('hover', closest(ref('p.button'), ref('p'), { upTo: ref('p.page') }));
    expect(book.resolve('ui.hover')).toBe('#8fb3ff');
  });

  it('follows the upTo color', () => {
    const { book, ui } = palette();
    ui.set('page', color('#ffffff'));
    ui.set('hover', closest(ref('p.blue'), ref('p'), { upTo: ref('ui.page') }));
    const watcher = vi.fn();
    book.watch('ui.hover', watcher);
    ui.set('page', color('#000000'));
    expect(watcher).toHaveBeenCalledWith('#13254a', expect.anything());
  });

  it('validates its options', () => {
    expect(() => closest(ref('p.blue'), ref('p'), { direction: 'up' as any })).toThrow(FunctionError);
    expect(() => closest(ref('p.blue'), ref('p'), { direction: 'lighter', upTo: ref('ui.page') })).toThrow(/not both/);
    expect(() => closest(ref('p.blue'), ref('p'), { minDistance: 0.1 })).toThrow(/needs a `direction`/);
    expect(() => closest(ref('p.blue'), ref('p'), { direction: 'lighter', minDistance: 2 })).toThrow(FunctionError);
    expect(() => closest(ref('p.blue'), ref('p'), { upTo: ref('p') })).toThrow(/needs a value/);
  });

  it('combines with readableOn', () => {
    const { book, ui } = palette();
    ui.set('bg', color('#ffffff'));
    ui.set('pick', closest(ref('p.navy'), ref('p'), { direction: 'lighter', readableOn: ref('ui.bg'), readableContrast: 4.5 }));
    expect(book.resolve('ui.pick')).toBe('#2d60a5');
  });
});

describe('closest direction in the editor', () => {
  let getTokenDisplayValue: (scope: any, tokenName: string) => string;
  beforeAll(async () => {
    getTokenDisplayValue = (await loadEditorModule()).getTokenDisplayValue;
  });

  it('round-trips direction, upTo, minDistance and readableOn', () => {
    const { book, ui } = palette();
    ui.set('page', color('#ffffff'));
    ui.set('bg', color('#ffffff'));
    for (const typed of [
      "closest(ref('p.blue'), ref('p'), { direction: \"lighter\" })",
      "closest(ref('p.blue'), ref('p'), { upTo: ref('ui.page'), minDistance: 0.02 })",
      "closest(ref('p.navy'), ref('p'), { upTo: ref('ui.page'), readableOn: ref('ui.bg'), readableContrast: 4.5 })",
    ]) {
      ui.set('probe', parseTokenInput(typed, book, ui));
      const printed = getTokenDisplayValue(ui, 'probe');
      ui.set('again', parseTokenInput(printed, book, ui));
      expect(book.resolve('ui.again')).toBe(book.resolve('ui.probe'));
      expect(ui.get('again')).toEqual(ui.get('probe'));
    }
  });
});
