import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { color, ref } from '../../../src/tokens';
import { mostVivid } from '../../../src/functions/color/most-vivid';
import { lighten } from '../../../src/functions/color/lighten';
import { collectScopeColors } from '../../../src/functions/color/scope-colors';

describe('collectScopeColors and wide-gamut members', () => {
  function makeBook() {
    const book = new DesignBook('test');
    const s = book.addScope('s');
    // Far outside sRGB: clipping channel-wise gives #00cd00, gamut-mapping
    // in OKLCH (what every transform does) gives #00c300.
    s.set('p', color('oklch(0.7 0.35 145)'));
    return { book, s };
  }

  it('gamut-maps a wide-gamut color token instead of clipping it', () => {
    const { s } = makeBook();
    expect(collectScopeColors(s).map((c) => c.hex)).toEqual(['#00c300']);
  });

  it('gamut-maps a wide-gamut member reached through a reference', () => {
    const { book, s } = makeBook();
    const t = book.addScope('t');
    t.set('alias', ref('s.p'));
    expect(collectScopeColors(t).map((c) => c.hex)).toEqual(['#00c300']);
    expect(s.getAllKeys()).toEqual(['p']);
  });

  it('a selector agrees with a no-op transform on the same member', () => {
    const { book } = makeBook();
    const ui = book.addScope('ui');
    ui.set('vivid', mostVivid(book.getScope('s')!));
    ui.set('same', lighten(ref('s.p'), { amount: 0 }));
    expect(book.resolve('ui.vivid')).toBe(book.resolve('ui.same'));
    expect(book.resolve('ui.vivid')).toBe('#00c300');
  });

  it('keeps alpha on a translucent wide-gamut member', () => {
    const book = new DesignBook('test');
    const s = book.addScope('s');
    s.set('p', color('oklch(0.7 0.35 145 / 0.5)'));
    expect(collectScopeColors(s).map((c) => c.hex)).toEqual(['#00c30080']);
  });
});
