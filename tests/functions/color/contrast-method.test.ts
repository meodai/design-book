import { describe, it, expect } from 'vitest';
import { parse } from 'culori';
import type { Color } from 'culori';
import { DesignBook } from '../../../src/design-book';
import { color, ref, px, string } from '../../../src/tokens';
import { typography } from '../../../src/functions';
import { mostVivid } from '../../../src/functions/color/vividness';
import { bestContrastWith } from '../../../src/functions/color/best-contrast';
import { minContrastWith } from '../../../src/functions/color/min-contrast';
import { apcaContrast, apcaMinimumLc, wcagMinimumRatio } from '../../../src/functions/color/contrast';
import { FunctionError } from '../../../src/errors';

// A book measures color contrast one way, set once: `contrast: 'wcag'`
// (default, ratios) or `'apca'` (Lc). Thresholds are a number in that
// scale, or a text style the method turns into its minimum.

const c = (s: string) => parse(s) as Color;

function setup(contrast?: 'wcag' | 'apca') {
  const book = new DesignBook('test', contrast ? { contrast } : undefined);
  const pool = book.addScope('pool');
  pool.set('yellow', color('#ffff00'));
  pool.set('navy', color('#1d4eb8'));
  pool.set('gray', color('#767676'));
  pool.set('mid', color('#888888'));
  pool.set('pale', color('#eeeeee'));
  const ui = book.addScope('ui');
  ui.set('bg', color('#ffffff'));
  const type = book.addScope('type');
  type.set('body', typography({ fontSize: px(16), fontWeight: 400 }));
  type.set('display', typography({ fontSize: px(40), fontWeight: 400 }));
  return { book, ui, type };
}

describe('APCA math (0.0.98G)', () => {
  it('matches the published reference values', () => {
    expect(apcaContrast(c('#000'), c('#fff'))).toBeCloseTo(106.04, 1);
    expect(apcaContrast(c('#fff'), c('#000'))).toBeCloseTo(-107.88, 1);
    expect(apcaContrast(c('#888'), c('#fff'))).toBeCloseTo(63.06, 1);
    expect(apcaContrast(c('#fff'), c('#888'))).toBeCloseTo(-68.54, 1);
  });

  it('is zero for the same color', () => {
    expect(apcaContrast(c('#336699'), c('#336699'))).toBe(0);
  });

  it('turns a size and weight into a minimum', () => {
    expect(apcaMinimumLc(16, 400)).toBe(90);
    expect(apcaMinimumLc(18, 400)).toBe(75);
    expect(apcaMinimumLc(16, 700)).toBe(60);
    expect(apcaMinimumLc(40, 400)).toBe(45);
    expect(wcagMinimumRatio(16, 400)).toBe(4.5);
    expect(wcagMinimumRatio(24, 400)).toBe(3);
    expect(wcagMinimumRatio(19, 700)).toBe(3);
  });
});

describe('the book\'s contrast method', () => {
  it('defaults to WCAG and refuses an unknown method', () => {
    expect(new DesignBook('a').contrast).toBe('wcag');
    expect(() => new DesignBook('a', { contrast: 'nope' as never })).toThrow(/'wcag' or 'apca'/);
  });

  it('reads one number in the book\'s scale', () => {
    // #888 on white: 3.54:1, Lc 63. A 3:1 floor and an Lc 60 floor both keep it.
    const wcag = setup('wcag');
    wcag.ui.set('x', minContrastWith(ref('ui.bg'), ref('pool'), { minContrast: 3 }));
    expect(wcag.book.resolve('ui.x')).toBe('#888888');

    const apca = setup('apca');
    apca.ui.set('x', minContrastWith(ref('ui.bg'), ref('pool'), { minContrast: 60 }));
    expect(apca.book.resolve('ui.x')).toBe('#888888');
  });

  it('uses the method\'s own default: 4.5:1 or Lc 60', () => {
    const wcag = setup('wcag');
    wcag.ui.set('x', mostVivid(ref('pool'), { readableOn: ref('ui.bg') }));
    const apca = setup('apca');
    apca.ui.set('x', mostVivid(ref('pool'), { readableOn: ref('ui.bg') }));
    expect(wcag.book.resolve('ui.x')).toBe('#1d4eb8');
    // #888 (Lc 63) reads under APCA's default but not WCAG's 4.5.
    apca.ui.set('y', minContrastWith(ref('ui.bg'), ref('pool')));
    wcag.ui.set('y', minContrastWith(ref('ui.bg'), ref('pool')));
    expect(apca.book.resolve('ui.y')).toBe('#888888');
    expect(wcag.book.resolve('ui.y')).toBe('#767676');
  });

  it('turns a text style into the minimum for its size and weight', () => {
    // body 16px/400: 4.5:1 in WCAG, Lc 90 in APCA; display 40px: 3:1 / Lc 45.
    const apca = setup('apca');
    apca.ui.set('body', minContrastWith(ref('ui.bg'), ref('pool'), { minContrast: ref('type.body') }));
    apca.ui.set('display', minContrastWith(ref('ui.bg'), ref('pool'), { minContrast: ref('type.display') }));
    expect(apca.book.resolve('ui.body')).toBe('#1d4eb8');
    expect(apca.book.resolve('ui.display')).toBe('#888888');

    const wcag = setup('wcag');
    wcag.ui.set('body', minContrastWith(ref('ui.bg'), ref('pool'), { minContrast: ref('type.body') }));
    wcag.ui.set('display', minContrastWith(ref('ui.bg'), ref('pool'), { minContrast: ref('type.display') }));
    expect(wcag.book.resolve('ui.body')).toBe('#767676');
    expect(wcag.book.resolve('ui.display')).toBe('#888888');
  });

  it('takes { fontSize, fontWeight } written in place', () => {
    const { book, ui } = setup('apca');
    ui.set('x', mostVivid(ref('pool'), { readableOn: ref('ui.bg'), readableContrast: { fontSize: '16px', fontWeight: 700 } }));
    expect(book.resolve('ui.x')).toBe('#1d4eb8');
  });

  it('follows a text style when it changes', () => {
    const { book, ui, type } = setup('apca');
    ui.set('x', minContrastWith(ref('ui.bg'), ref('pool'), { minContrast: ref('type.body') }));
    expect(book.resolve('ui.x')).toBe('#1d4eb8');
    type.set('body', typography({ fontSize: px(40), fontWeight: 400 }));
    expect(book.resolve('ui.x')).toBe('#888888');
  });

  it('refuses a number meant for the other method', () => {
    const apca = setup('apca');
    apca.ui.set('x', mostVivid(ref('pool'), { readableOn: ref('ui.bg'), readableContrast: 4.5 }));
    expect(() => apca.book.resolve('ui.x')).toThrow(/not a WCAG ratio/);
    const wcag = setup('wcag');
    wcag.ui.set('x', mostVivid(ref('pool'), { readableOn: ref('ui.bg'), readableContrast: 60 }));
    expect(() => wcag.book.resolve('ui.x')).toThrow(/above 21/);
  });

  it('says the threshold in the method\'s terms when nothing reaches it', () => {
    const { book, ui } = setup('apca');
    ui.set('x', mostVivid(ref('pool'), { readableOn: color('#888888'), readableContrast: 100 }));
    expect(() => book.resolve('ui.x')).toThrow(/Lc 100/);
  });

  it('scores bestContrastWith with the target as the background', () => {
    const { book, ui } = setup('apca');
    ui.set('dark', color('#000000'));
    ui.set('x', bestContrastWith(ref('ui.dark'), ref('pool')));
    expect(book.resolve('ui.x')).toBe('#ffff00');
  });

  it('reads the target as text with targetIs', () => {
    // White text: as text on #888 it scores Lc 68.5; read the other way
    // (#888 as text on white) only Lc 63. With an Lc 65 floor the role decides.
    const { book, ui } = setup('apca');
    ui.set('white', color('#ffffff'));
    ui.set('surfaceFor', minContrastWith(ref('ui.white'), ref('pool'), { minContrast: 65, targetIs: 'text' }));
    ui.set('inkOn', minContrastWith(ref('ui.white'), ref('pool'), { minContrast: 65 }));
    expect(book.resolve('ui.surfaceFor')).toBe('#888888');
    expect(book.resolve('ui.inkOn')).toBe('#767676');
  });

  it('gives the same pick either way under WCAG', () => {
    const { book, ui } = setup('wcag');
    ui.set('a', minContrastWith(ref('ui.bg'), ref('pool'), { minContrast: 3, targetIs: 'text' }));
    ui.set('b', minContrastWith(ref('ui.bg'), ref('pool'), { minContrast: 3 }));
    expect(book.resolve('ui.a')).toBe(book.resolve('ui.b'));
  });

  it('refuses a wrong targetIs, and one on a size target', () => {
    expect(() => bestContrastWith(color('#fff'), ref('pool'), { targetIs: 'ink' as never })).toThrow(/'background' or 'text'/);
    const { book, ui } = setup('apca');
    ui.set('x', bestContrastWith(px(16), ref('type'), { targetIs: 'text' }));
    expect(() => book.resolve('ui.x')).toThrow(/targetIs/);
  });

  it('keeps sizes and text styles a plain ratio', () => {
    const { book, ui } = setup('apca');
    ui.set('lead', minContrastWith(ref('type.body'), ref('type'), { minContrast: 1.25, direction: 'larger' }));
    expect(book.pickOf('ui.lead')).toBe('type.display');
  });

  it('refuses a malformed threshold at construction', () => {
    expect(() => mostVivid(ref('pool'), { readableOn: color('#fff'), readableContrast: 0 })).toThrow(FunctionError);
    expect(() => mostVivid(ref('pool'), { readableOn: color('#fff'), readableContrast: { fontSize: '1em' } })).toThrow(/px, rem or pt/);
    expect(() => minContrastWith(color('#fff'), ref('pool'), { minContrast: 'big' as never })).toThrow(/text style/);
    expect(() => minContrastWith(color('#fff'), ref('pool'), { minContrast: string('x') as never })).not.toThrow();
  });
});
