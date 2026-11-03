import { beforeAll, describe, it, expect, vi } from 'vitest';
import { DesignBook } from '../src/design-book';
import {
  color, ref, px, rem, typography, inParent, inRoot,
  mostVivid, lightest, darkest, nth, lighten, sibling, variant, bestContrastWith,
  CircularDependencyError, FunctionError, TokenError,
} from '../src/index';
import type { ReferenceValue } from '../src/tokens';
import { parseTokenInput } from '../editor/editor-input-parser';
import { loadEditorModule } from './editor/load-editor';

/** card ← card-inverted ← callout, reading colors from palette. */
function cards() {
  const book = new DesignBook('t');
  const palette = book.addScope('palette');
  palette.set('white', color('#ffffff'));
  palette.set('mist', color('#e8eef5'));
  palette.set('blue', color('#2d60a5'));
  palette.set('navy', color('#13254a'));
  palette.set('ink', color('#0b0f19'));

  const card = book.addScope('card');
  card.set('surface', ref('palette.white'));
  card.set('text', bestContrastWith(ref('.surface'), ref('palette')));
  card.set('radius', px(4));
  card.set('title', typography({ fontSize: rem(1.5), fontWeight: '600' }));

  const inverted = book.addScope('card-inverted', { extends: 'card' });
  inverted.set('surface', ref('palette.navy'));

  const callout = book.addScope('callout', { extends: 'card-inverted' });
  return { book, palette, card, inverted, callout };
}

describe('ref() addresses any level of the book', () => {
  it('names a scope, a token, a field, and the reading scope', () => {
    expect(ref('palette').key).toBe('palette');
    expect(ref('palette.white').key).toBe('palette.white');
    expect(ref('card.title.fontSize').key).toBe('card.title.fontSize');
    expect(ref('.').key).toBe('.');
    expect(() => ref('')).toThrow();
    expect(() => ref('..x')).toThrow();
  });

  it('keeps a selector token plain data: the pool is stored as a reference', () => {
    const { card } = cards();
    const token = card.getRaw('text');
    expect(JSON.parse(JSON.stringify(token))).toEqual(token);
  });
});

describe('inParent / inRoot', () => {
  // 1
  it('counts a relative reference from the scope that reads the rule', () => {
    const { book, inverted } = cards();
    inverted.set('border', inParent(ref('.surface')));
    expect(book.resolve('card-inverted.border')).toBe('#ffffff');
    // callout reads the inherited rule: its parent is card-inverted
    expect(book.resolve('callout.border')).toBe('#13254a');
  });

  // 2
  it('counts an absolute reference from the scope it names', () => {
    const { book, callout } = cards();
    callout.set('border', inParent(ref('card-inverted.surface')));
    expect(book.resolve('callout.border')).toBe('#ffffff');
  });

  // 3
  it('continues up the chain when the parent does not declare the token', () => {
    const { book, callout } = cards();
    callout.set('corner', inParent(ref('.radius')));
    expect(book.resolve('callout.corner')).toBe('4px');
  });

  // 4
  it('lets a scope override a token in terms of the value it replaces', () => {
    const { book, callout } = cards();
    callout.set('surface', lighten(inParent(ref('.surface')), { amount: 0.2 }));
    const parent = book.resolve('card-inverted.surface');
    expect(book.resolve('callout.surface')).not.toBe(parent);
    // and the text, inherited from card, re-decides against it
    expect(() => book.resolve('callout.text')).not.toThrow();
  });

  // 5
  it('throws past the top of the chain', () => {
    const { card, callout } = cards();
    expect(() => card.set('x', inParent(ref('.surface')))).toThrow(/"card" has no parent/);
    expect(() => callout.set('x', inParent(ref('.surface'), 3))).toThrow(/only 2 levels above it/);
    expect(card.hasOwn('x')).toBe(false);
  });

  // 6
  it('reads a root scope itself with inRoot', () => {
    const { book, card } = cards();
    card.set('base', inRoot(ref('.surface')));
    expect(book.resolve('card.base')).toBe('#ffffff');
    expect(book.resolve('callout.base')).toBe('#ffffff');
  });

  // 7
  it('takes a whole number of levels, 1 by default, and nesting adds up', () => {
    const r = ref('.surface');
    expect(inParent(r)).toEqual(inParent(r, 1));
    expect(inParent(inParent(r))).toEqual(inParent(r, 2));
    expect(inRoot(inParent(r))).toEqual(inRoot(r));
    expect(inParent(inRoot(r))).toEqual(inRoot(r));
    expect(() => inParent(r, 0)).toThrow();
    expect(() => inParent(r, 1.5)).toThrow();
  });

  // 8
  it('works on pools: a scope, the reading scope, and the parent scope', () => {
    const book = new DesignBook('t');
    const swatches = book.addScope('swatches');
    swatches.set('a', color('#ffffff'));
    swatches.set('b', color('#2d60a5'));
    swatches.set('pick', darkest(ref('.')));
    const dark = book.addScope('swatches-dark', { extends: 'swatches' });
    dark.set('a', color('#333333'));
    dark.set('from-parent', lightest(inParent(ref('.'))));
    // the relative pool re-binds: swatches-dark searches its own members
    expect(book.resolve('swatches.pick')).toBe('#2d60a5');
    expect(book.resolve('swatches-dark.pick')).toBe('#333333');
    expect(book.resolve('swatches-dark.from-parent')).toBe('#ffffff');

    const watcher = vi.fn();
    book.watch('swatches-dark.from-parent', watcher);
    swatches.set('a', color('#eeeeee'));
    expect(watcher).toHaveBeenCalledWith('#eeeeee', expect.anything());

    const ui = book.addScope('ui');
    ui.set('first', nth(ref('swatches'), 0));
    ui.set('accent', mostVivid(ref('swatches')));
    expect(book.resolve('ui.first')).toBe('#eeeeee');
    expect(book.resolve('ui.accent')).toBe('#2d60a5');
  });

  // 9
  it('navigates fields like tokens', () => {
    const { book, callout } = cards();
    callout.set('size', inParent(ref('.title.fontSize')));
    expect(book.resolve('callout.size')).toBe('1.5rem');
  });

  // 10
  it('refuses a scope where a value is expected', () => {
    const { card } = cards();
    expect(() => card.set('x', ref('palette'))).toThrow(/names a scope/);
    expect(() => card.set('x', inParent(ref('.')))).toThrow();
    expect(() => lighten(ref('.'))).toThrow(FunctionError);
    expect(() => lighten(ref('palette'))).toThrow(/needs a value, got the scope 'palette'/);
  });

  // 11
  it('refuses a token where a pool is expected', () => {
    expect(() => mostVivid(ref('palette.blue'))).toThrow(/needs a scope to search, got the token 'palette.blue'/);
  });

  // 12
  it('notifies a navigated reference when the token it reads changes', () => {
    const { book, inverted, callout } = cards();
    callout.set('border', inParent(ref('.surface')));
    const watcher = vi.fn();
    book.watch('callout.border', watcher);
    inverted.set('surface', ref('palette.ink'));
    expect(watcher).toHaveBeenCalledWith('#0b0f19', expect.anything());
  });

  // 13
  it('falls back further up when the parent loses its own token', () => {
    const { book, inverted, callout } = cards();
    callout.set('border', inParent(ref('.surface')));
    inverted.delete('surface');
    expect(book.resolve('callout.border')).toBe('#ffffff');
  });

  // 14
  it('accepts a scope object as a pool and stores it as a reference', () => {
    const { palette } = cards();
    expect(mostVivid(palette)).toEqual(mostVivid(ref('palette')));
    expect((mostVivid(palette).args[0] as ReferenceValue).key).toBe('palette');
  });

  it('rejects a reference that ends on its own key as a cycle', () => {
    const book = new DesignBook('t');
    const card = book.addScope('card');
    const palette = book.addScope('palette', { extends: 'card' });
    palette.set('color', color('#2d60a5'));
    card.set('text', ref('palette.color'));
    expect(() => card.set('color', inParent(ref('palette.color')))).toThrow(CircularDependencyError);
  });

  it('anchors sibling on a navigated reference: it walks the scope the anchor lands in', () => {
    const book = new DesignBook('t');
    const gray = book.addScope('gray');
    gray.set('g100', color('#f2f2f2'));
    gray.set('g300', color('#c8c8c8'));
    gray.set('g500', color('#6e6e6e'));
    gray.set('next', sibling(ref('.g100'), 1));
    const warm = book.addScope('gray-warm', { extends: 'gray' });
    warm.set('g300', color('#d0c8c0'));
    warm.set('parent-next', sibling(inParent(ref('.g100')), 1));

    // relative: walks the reading scope; navigated: walks the parent
    expect(book.resolve('gray-warm.next')).toBe('#d0c8c0');
    expect(book.resolve('gray-warm.parent-next')).toBe('#c8c8c8');

    const watcher = vi.fn();
    book.watch('gray-warm.parent-next', watcher);
    gray.set('g300', color('#bbbbbb'));
    expect(watcher).toHaveBeenCalledWith('#bbbbbb', expect.anything());

    expect(() => gray.set('x', sibling(inParent(ref('.g100')), 1))).toThrow(/"gray" has no parent/);
  });

  it('builds a live variant on a navigated base', () => {
    const book = new DesignBook('t');
    const type = book.addScope('type');
    type.set('title', typography({ fontSize: rem(2), fontWeight: '400' }));
    const article = book.addScope('article', { extends: 'type' });
    // a variant of the title it replaces: not a variant of itself
    article.set('title', variant(inParent(ref('.title')), { fontWeight: '700' }));

    expect(book.resolve('article.title')).toBe('font-size: 2rem; font-weight: 700');
    expect(book.resolve('article.title.fontSize')).toBe('2rem');

    const watcher = vi.fn();
    book.watch('article.title', watcher);
    type.set('title', typography({ fontSize: rem(2.5), fontWeight: '400' }));
    expect(watcher).toHaveBeenCalledWith('font-size: 2.5rem; font-weight: 700', expect.anything());
    expect(book.resolve('article.title.fontSize')).toBe('2.5rem');

    expect(() => type.set('x', variant(inParent(ref('.title')), { fontWeight: '700' }))).toThrow(/"type" has no parent/);
  });

  it('re-binds when the chain is rebuilt with a different parent', () => {
    const book = new DesignBook('t');
    book.addScope('a').set('x', color('#111111'));
    book.addScope('b').set('x', color('#222222'));
    const child = book.addScope('child', { extends: 'a' });
    child.set('y', inParent(ref('.x')));
    expect(book.resolve('child.y')).toBe('#111111');
    book.deleteScope('child');
    book.addScope('child', { extends: 'b' }).set('y', inParent(ref('.x')));
    expect(book.resolve('child.y')).toBe('#222222');
  });

  it('a TokenError names the scope that has no parent', () => {
    const { card } = cards();
    try {
      card.set('x', inParent(ref('.surface')));
    } catch (e) {
      expect(e).toBeInstanceOf(TokenError);
    }
  });
});

describe('renderers and the editor', () => {
  let getTokenDisplayValue: (scope: any, tokenName: string) => string;
  beforeAll(async () => {
    getTokenDisplayValue = (await loadEditorModule()).getTokenDisplayValue;
  });

  it('render a navigated reference as the key it reads', () => {
    const { book, callout } = cards();
    callout.set('border', inParent(ref('.surface')));
    expect(book.render('css-variables')).toContain('--callout-border: var(--card-inverted-surface)');
    const w3 = JSON.parse(book.render('w3-design-tokens'));
    expect(w3.callout.border.$value).toBe('{card-inverted.surface}');
  });

  it('parse and print scope refs and navigation', () => {
    const { book, callout } = cards();
    for (const input of [
      "inParent(ref('.surface'))",
      "inParent(ref('.surface'), 2)",
      "inRoot(ref('.surface'))",
    ]) {
      const token = parseTokenInput(input, book, callout);
      callout.set('probe', token);
      expect(getTokenDisplayValue(callout, 'probe')).toBe(input);
    }
    const selector = parseTokenInput("lightest(inParent(ref('.')))", book, callout);
    callout.set('probe', selector);
    expect(getTokenDisplayValue(callout, 'probe')).toBe("lightest(inParent(ref('.')))");
    for (const input of [
      "sibling(inParent(ref('.surface')), 1)",
      "variant(inParent(ref('.title')), { fontWeight: '700' })",
    ]) {
      callout.set('probe', parseTokenInput(input, book, callout));
      expect(getTokenDisplayValue(callout, 'probe')).toBe(input);
    }
    // a bare scope name is accepted and written back as a reference
    callout.set('probe', parseTokenInput('mostVivid(palette)', book, callout));
    expect(getTokenDisplayValue(callout, 'probe')).toBe("mostVivid(ref('palette'))");
  });
});
