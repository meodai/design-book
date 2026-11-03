import { beforeAll, describe, it, expect, vi } from 'vitest';
import { converter } from 'culori';
import { DesignBook } from '../../../src/design-book';
import { color, ref, nextLighter, nextDarker, FunctionError } from '../../../src/index';
import { parseTokenInput } from '../../../editor/editor-input-parser';
import { loadEditorModule } from '../../editor/load-editor';

const L = (hex: string) => converter('oklch')(hex)!.l;

/** A palette deliberately out of lightness order: nextLighter ranks by value. */
function palette() {
  const book = new DesignBook('t');
  const p = book.addScope('p');
  p.set('navy', color('#13254a'));
  p.set('white', color('#ffffff'));
  p.set('blue', color('#2d60a5'));
  p.set('sky', color('#8fb3ff'));
  p.set('mid', color('#4a7bd0'));
  const ui = book.addScope('ui');
  return { book, p, ui };
}

describe('nextLighter / nextDarker', () => {
  it('pick the closest member on that side of the target, whatever the scope order', () => {
    const { book, ui } = palette();
    ui.set('button', ref('p.blue'));
    ui.set('up', nextLighter(ref('ui.button'), ref('p')));
    ui.set('down', nextDarker(ref('ui.button'), ref('p')));
    expect(book.resolve('ui.up')).toBe('#4a7bd0');
    expect(book.resolve('ui.down')).toBe('#13254a');
  });

  it('take a minDistance in OKLCH lightness', () => {
    const { book, ui } = palette();
    const gap = L('#4a7bd0') - L('#2d60a5');
    ui.set('up', nextLighter(ref('p.blue'), ref('p'), { minDistance: gap + 0.01 }));
    expect(book.resolve('ui.up')).toBe('#8fb3ff');
  });

  it('work with a target that is not in the pool', () => {
    const { book, ui } = palette();
    ui.set('up', nextLighter(color('#3a6bb8'), ref('p')));
    expect(book.resolve('ui.up')).toBe('#4a7bd0');
  });

  it('honor not and readableOn', () => {
    const { book, ui } = palette();
    ui.set('up', nextLighter(ref('p.blue'), ref('p'), { not: [ref('p.mid')] }));
    expect(book.resolve('ui.up')).toBe('#8fb3ff');
    ui.set('page', color('#ffffff'));
    ui.set('readable', nextLighter(ref('p.navy'), ref('p'), { readableOn: ref('ui.page'), minContrast: 4.5 }));
    expect(book.resolve('ui.readable')).toBe('#2d60a5');
  });

  it('throw when nothing is lighter / darker', () => {
    const { book, ui } = palette();
    ui.set('up', nextLighter(ref('p.white'), ref('p')));
    ui.set('down', nextDarker(ref('p.navy'), ref('p')));
    expect(() => book.resolve('ui.up')).toThrow(/no member of scope "p" is lighter/);
    expect(() => book.resolve('ui.down')).toThrow(/no member of scope "p" is darker/);
  });

  it('validate minDistance and refuse a token as the pool', () => {
    expect(() => nextLighter(ref('p.blue'), ref('p'), { minDistance: 5 })).toThrow(FunctionError);
    expect(() => nextLighter(ref('p.blue'), ref('p'), { minDistance: -0.1 })).toThrow(FunctionError);
    expect(() => nextDarker(ref('p.blue'), ref('p.navy'))).toThrow(/needs a scope/);
  });

  it('follow the target and the pool', () => {
    const { book, p, ui } = palette();
    ui.set('button', ref('p.blue'));
    ui.set('up', nextLighter(ref('ui.button'), ref('p')));
    const watcher = vi.fn();
    book.watch('ui.up', watcher);
    p.set('between', color('#3a6bb8'));
    expect(watcher).toHaveBeenLastCalledWith('#3a6bb8', expect.anything());
    ui.set('button', ref('p.sky'));
    expect(watcher).toHaveBeenLastCalledWith('#ffffff', expect.anything());
  });
});

describe('nextLighter / nextDarker in the editor', () => {
  let getTokenDisplayValue: (scope: any, tokenName: string) => string;
  beforeAll(async () => {
    getTokenDisplayValue = (await loadEditorModule()).getTokenDisplayValue;
  });

  it('round-trip with options', () => {
    const { book, ui } = palette();
    for (const typed of [
      "nextLighter(ref('p.blue'), ref('p'))",
      "nextDarker(ref('p.sky'), ref('p'), { minDistance: 0.05 })",
    ]) {
      ui.set('probe', parseTokenInput(typed, book, ui));
      const printed = getTokenDisplayValue(ui, 'probe');
      ui.set('again', parseTokenInput(printed, book, ui));
      expect(book.resolve('ui.again')).toBe(book.resolve('ui.probe'));
      expect(printed).toContain(typed.slice(0, typed.indexOf("'p'") + 4));
    }
  });
});
