import { describe, it, expect } from 'vitest';
import { formatHex } from 'culori';
import { DesignBook } from '../src/design-book';
import { color, ref } from '../src/tokens';
import { mostVivid, leastVivid } from '../src/functions/color/vividness';
import { bestContrastWith } from '../src/functions/color/best-contrast';

/** Color selectors sitting in the scope they search: each is no candidate
 *  of the others (the shared pool rule), so resolving one never resolves
 *  the rest, and the cost does not grow with how many there are. */
describe('color selectors inside the scope they search', () => {
  const build = (selectors: number) => {
    const book = new DesignBook('t');
    const ui = book.addScope('ui');
    for (let i = 0; i < 20; i++) ui.set(`c${i}`, color(`oklch(${0.3 + i * 0.03} ${0.05 + (i % 5) * 0.03} ${i * 18})`));
    for (let s = 0; s < selectors; s++) ui.set(`s${s}`, s % 2 ? leastVivid(ref('ui')) : mostVivid(ref('ui')));
    return book;
  };

  it('do not pick each other', () => {
    const book = build(4);
    const hex = (v: string) => formatHex(v);
    const values = new Set(Array.from({ length: 20 }, (_, i) => hex(book.resolve(`ui.c${i}`))));
    for (let s = 0; s < 4; s++) expect(values.has(hex(book.resolve(`ui.s${s}`)))).toBe(true);
  });

  it('stay cheap however many there are', () => {
    const book = build(12);
    const t = performance.now();
    book.resolve('ui.s0');
    expect(performance.now() - t).toBeLessThan(50);
  });

  it('a contrast pick out of its own scope still reads the colors', () => {
    const book = new DesignBook('t');
    const ui = book.addScope('ui');
    ui.set('bg', color('#ffffff'));
    ui.set('dark', color('#111111'));
    ui.set('mid', color('#888888'));
    ui.set('text', bestContrastWith(ref('ui.bg'), ref('ui')));
    expect(book.resolve('ui.text')).toBe('#111111');
  });
});
