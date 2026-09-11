import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { color } from '../../../src/tokens';
import { bestContrastWith } from '../../../src/functions/color/best-contrast';
import { minContrastWith } from '../../../src/functions/color/min-contrast';
import { mostVivid } from '../../../src/functions/color/most-vivid';
import { leastVivid } from '../../../src/functions/color/least-vivid';

describe('selectors and translucent candidates', () => {
  it('bestContrastWith judges a translucent candidate as composited, not opaque', () => {
    const book = new DesignBook('test');
    const pool = book.addScope('pool');
    // 5% black over white is barely visible, but its opaque hex is #000000 —
    // a contrast ratio of 21 against white if alpha is dropped.
    pool.set('hairline', color('rgba(0, 0, 0, 0.05)'));
    pool.set('grey', color('#767676'));

    const ui = book.addScope('ui');
    ui.set('text', bestContrastWith(color('#ffffff'), pool));

    expect(book.resolve('ui.text')).toBe('#767676');
  });

  it('bestContrastWith returns the candidate\'s own alpha when it wins', () => {
    const book = new DesignBook('test');
    const pool = book.addScope('pool');
    pool.set('smoke', color('rgba(0, 0, 0, 0.5)'));
    pool.set('white', color('#ffffff'));

    const ui = book.addScope('ui');
    ui.set('text', bestContrastWith(color('#ffffff'), pool));

    expect(book.resolve('ui.text')).toBe('#00000080');
  });

  it('minContrastWith judges a translucent candidate as composited', () => {
    const book = new DesignBook('test');
    const pool = book.addScope('pool');
    // Over white the hairline sits at ~1.13:1 and #eeeeee at ~1.23:1, so the
    // hairline is the lowest candidate clearing 1.05. Read as opaque black it
    // would score 21:1 and #eeeeee would win instead.
    pool.set('hairline', color('rgba(0, 0, 0, 0.05)'));
    pool.set('faint', color('#eeeeee'));

    const ui = book.addScope('ui');
    ui.set('text', minContrastWith(color('#ffffff'), pool, { ratio: 1.05 }));

    expect(book.resolve('ui.text')).toBe('#0000000d');
  });

  it('mostVivid applies its contrast gate to the composited colour', () => {
    const book = new DesignBook('test');
    const pool = book.addScope('pool');
    // Opaque, this blue clears 4.5:1 against white; at 20% alpha it does not.
    pool.set('ghost', color('rgba(0, 0, 255, 0.2)'));
    pool.set('green', color('#006600'));

    const ui = book.addScope('ui');
    ui.set('accent', mostVivid(pool, { against: color('#ffffff'), minContrast: 4.5 }));

    expect(book.resolve('ui.accent')).toBe('#006600');
  });

  it('leastVivid keeps alpha in the value it returns when there is no target', () => {
    const book = new DesignBook('test');
    const pool = book.addScope('pool');
    pool.set('hairline', color('rgba(0, 0, 0, 0.05)'));
    pool.set('brand', color('#0066cc'));

    const ui = book.addScope('ui');
    ui.set('muted', leastVivid(pool));

    expect(book.resolve('ui.muted')).toBe('#0000000d');
  });
});
