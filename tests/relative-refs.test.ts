import { describe, it, expect, vi } from 'vitest';
import { DesignBook } from '../src/design-book';
import {
  color, ref, rem, colorMix, lighten, sibling, nth, typography, variant,
  composeBook, layer, CircularDependencyError,
} from '../src/index';
import { getReferenceResolution } from '../src/tokens';
import type { ReferenceValue } from '../src/tokens';

function brandBook(mode: 'auto' | 'batch' = 'auto') {
  const book = new DesignBook('t', { mode });
  const brand = book.addScope('brand');
  brand.set('primary', color('#0066cc'));
  brand.set('button', ref('.primary'));
  return { book, brand };
}

describe('relative refs: ref(".token")', () => {
  it('rejects malformed relative keys', () => {
    expect(() => ref('.')).toThrow();
    expect(() => ref('..x')).toThrow();
  });

  it('reads its own scope where it is written', () => {
    const { book } = brandBook();
    expect(book.resolve('brand.button')).toBe('#0066cc');
  });

  it('re-binds to the inheriting scope', () => {
    const { book } = brandBook();
    const acme = book.addScope('acme', { extends: 'brand' });
    expect(book.resolve('acme.button')).toBe('#0066cc');
    acme.set('primary', color('#ee4400'));
    expect(book.resolve('acme.button')).toBe('#ee4400');
    expect(book.resolve('brand.button')).toBe('#0066cc');
    expect(book.isRebound('acme.button')).toBe(true);
    expect(book.isRebound('brand.button')).toBe(false);
  });

  it('keeps the token as written and hands out the bound copy', () => {
    const { book, brand } = brandBook();
    const acme = book.addScope('acme', { extends: 'brand' });
    expect((brand.getRaw('button') as ReferenceValue).key).toBe('.primary');
    expect((acme.getRaw('button') as ReferenceValue).key).toBe('.primary');
    expect((brand.get('button') as ReferenceValue).key).toBe('brand.primary');
    expect((acme.get('button') as ReferenceValue).key).toBe('acme.primary');
    expect(acme.get('button')).toBe(acme.get('button'));
  });

  it('a relative key cannot be resolved without a scope', () => {
    const { book } = brandBook();
    expect(() => book.resolve('.primary')).toThrow(/relative/);
  });

  it('notifies the re-bound shadow when the inheriting scope overrides the target', () => {
    const { book } = brandBook();
    const acme = book.addScope('acme', { extends: 'brand' });
    const watcher = vi.fn();
    book.watch('acme.button', watcher);
    acme.set('primary', color('#ee4400'));
    expect(watcher).toHaveBeenCalledWith('#ee4400', expect.anything());
  });

  it('notifies on deleting the override, falling back to the parent value', () => {
    const { book } = brandBook();
    const acme = book.addScope('acme', { extends: 'brand' });
    acme.set('primary', color('#ee4400'));
    const watcher = vi.fn();
    book.watch('acme.button', watcher);
    acme.delete('primary');
    expect(watcher).toHaveBeenCalledWith('#0066cc', expect.anything());
    expect(book.resolve('acme.button')).toBe('#0066cc');
  });

  it('notifies the shadow when the parent value changes and the child does not override', () => {
    const { book, brand } = brandBook();
    book.addScope('acme', { extends: 'brand' });
    const watcher = vi.fn();
    book.watch('acme.button', watcher);
    brand.set('primary', color('#00aa00'));
    expect(watcher).toHaveBeenCalledWith('#00aa00', expect.anything());
  });

  it('does not notify an overriding scope when only the parent value changes', () => {
    const { book, brand } = brandBook();
    const acme = book.addScope('acme', { extends: 'brand' });
    acme.set('primary', color('#ee4400'));
    const watcher = vi.fn();
    book.watch('acme.button', watcher);
    brand.set('primary', color('#00aa00'));
    expect(watcher).not.toHaveBeenCalled();
  });

  it('notifies every shadow when the source token itself is rewritten', () => {
    const { book, brand } = brandBook();
    const acme = book.addScope('acme', { extends: 'brand' });
    acme.set('primary', color('#ee4400'));
    brand.set('secondary', color('#111111'));
    acme.set('secondary', color('#222222'));
    const watcher = vi.fn();
    book.watch('acme.button', watcher);
    brand.set('button', ref('.secondary'));
    expect(watcher).toHaveBeenCalledWith('#222222', expect.anything());
  });

  it('turns back into a plain hop when the source drops its relative refs', () => {
    const { book, brand } = brandBook();
    const acme = book.addScope('acme', { extends: 'brand' });
    acme.set('primary', color('#ee4400'));
    brand.set('button', ref('brand.primary'));
    expect(book.isRebound('acme.button')).toBe(false);
    expect(book.resolve('acme.button')).toBe('#0066cc');
    // nothing reads acme.button any more, so its node is gone
    expect(book.getDependencyGraph().hasNode('acme.button')).toBe(false);
    acme.set('primary', color('#123456'));
    expect(book.resolve('acme.button')).toBe('#0066cc');
  });

  it('a child overriding the token itself stops being re-bound', () => {
    const { book } = brandBook();
    const acme = book.addScope('acme', { extends: 'brand' });
    acme.set('button', color('#abcdef'));
    expect(book.isRebound('acme.button')).toBe(false);
    expect(book.resolve('acme.button')).toBe('#abcdef');
    acme.delete('button');
    expect(book.isRebound('acme.button')).toBe(true);
    acme.set('primary', color('#ee4400'));
    expect(book.resolve('acme.button')).toBe('#ee4400');
  });

  it('works through a three-level extends chain', () => {
    const { book } = brandBook();
    const acme = book.addScope('acme', { extends: 'brand' });
    const promo = book.addScope('promo', { extends: 'acme' });
    acme.set('primary', color('#ee4400'));
    expect(book.resolve('promo.button')).toBe('#ee4400');
    const watcher = vi.fn();
    book.watch('promo.button', watcher);
    promo.set('primary', color('#00ff00'));
    expect(watcher).toHaveBeenCalledWith('#00ff00', expect.anything());
    expect(book.resolve('acme.button')).toBe('#ee4400');
  });

  it('a middle scope overriding the token re-binds the scopes below it', () => {
    const { book } = brandBook();
    const acme = book.addScope('acme', { extends: 'brand' });
    const promo = book.addScope('promo', { extends: 'acme' });
    promo.set('primary', color('#00ff00'));
    acme.set('button', color('#abcdef'));
    expect(book.isRebound('promo.button')).toBe(false);
    expect(book.resolve('promo.button')).toBe('#abcdef');
    acme.delete('button');
    expect(book.isRebound('promo.button')).toBe(true);
    expect(book.resolve('promo.button')).toBe('#00ff00');
  });

  it('readers of a re-bound shadow follow it', () => {
    const { book } = brandBook();
    const acme = book.addScope('acme', { extends: 'brand' });
    const other = book.addScope('other');
    other.set('x', ref('acme.button'));
    const watcher = vi.fn();
    book.watch('other.x', watcher);
    acme.set('primary', color('#ee4400'));
    expect(watcher).toHaveBeenCalledWith('#ee4400', expect.anything());
  });

  it('works inside function arguments', () => {
    const book = new DesignBook('t');
    const brand = book.addScope('brand');
    brand.set('primary', color('#ff0000'));
    brand.set('hover', lighten(ref('.primary'), { amount: 0.5 }));
    brand.set('mixed', colorMix(ref('.primary'), color('#0000ff'), { ratio: 0.5 }));
    const acme = book.addScope('acme', { extends: 'brand' });
    const before = book.resolve('acme.hover');
    const watcher = vi.fn();
    book.watch('acme.mixed', watcher);
    acme.set('primary', color('#00ff00'));
    expect(book.resolve('acme.hover')).not.toBe(before);
    expect(book.resolve('acme.hover')).toBe(
      (() => { const b = new DesignBook('x'); const s = b.addScope('s'); s.set('p', color('#00ff00')); s.set('h', lighten(ref('s.p'), { amount: 0.5 })); return b.resolve('s.h'); })(),
    );
    expect(watcher).toHaveBeenCalled();
  });

  it('works as a `not` exclusion and a sibling anchor', () => {
    const book = new DesignBook('t');
    const scale = book.addScope('scale');
    scale.set('a', color('#111111'));
    scale.set('b', color('#555555'));
    scale.set('c', color('#999999'));
    scale.set('next', sibling(ref('.a'), 1));
    scale.set('first', nth(scale, 0, { not: [ref('.a')] }));
    expect(book.resolve('scale.next')).toBe('#555555');
    expect(book.resolve('scale.first')).toBe('#555555');

    const alt = book.addScope('alt', { extends: 'scale' });
    alt.set('b', color('#00ff00'));
    expect(book.resolve('alt.next')).toBe('#00ff00');
    const watcher = vi.fn();
    book.watch('alt.next', watcher);
    alt.set('b', color('#0000ff'));
    expect(watcher).toHaveBeenCalledWith('#0000ff', expect.anything());
  });

  it('works for typography fields and variants', () => {
    const book = new DesignBook('t');
    const type = book.addScope('type');
    type.set('size', rem(2));
    type.set('title', typography({ fontSize: ref('.size'), lineHeight: 1.2 }));
    type.set('title-size', ref('.title.fontSize'));
    type.set('loose', variant(ref('.title'), { lineHeight: 1.6 }));
    const compact = book.addScope('compact', { extends: 'type' });
    compact.set('size', rem(1.5));

    expect(book.resolve('type.title')).toBe('font-size: 2rem; line-height: 1.2');
    expect(book.resolve('compact.title')).toBe('font-size: 1.5rem; line-height: 1.2');
    expect(book.resolve('compact.title-size')).toBe('1.5rem');
    expect(book.resolve('compact.loose')).toBe('font-size: 1.5rem; line-height: 1.6');

    const watcher = vi.fn();
    book.watch('compact.title-size', watcher);
    compact.set('size', rem(1.25));
    expect(watcher).toHaveBeenCalledWith('1.25rem', expect.anything());
  });

  it('refuses a variant of its own key, relative form too', () => {
    const book = new DesignBook('t');
    const type = book.addScope('type');
    type.set('title', typography({ fontSize: rem(2) }));
    expect(() => type.set('title', variant(ref('.title'), { lineHeight: 1 }))).toThrow(CircularDependencyError);
  });
});

describe('relative refs: cycles', () => {
  it('rejects a cycle within one scope', () => {
    const book = new DesignBook('t');
    const s = book.addScope('s');
    s.set('a', ref('.b'));
    expect(() => s.set('b', ref('.a'))).toThrow(CircularDependencyError);
    expect(s.hasOwn('b')).toBe(false);
  });

  it('rejects a write that closes a cycle only in an inheriting scope', () => {
    const { book, brand } = brandBook();
    brand.set('button', color('#000000'));
    const acme = book.addScope('acme', { extends: 'brand' });
    acme.set('primary', ref('acme.button'));
    expect(() => brand.set('button', ref('.primary'))).toThrow(CircularDependencyError);
    // the write was rolled back everywhere
    expect(book.resolve('brand.button')).toBe('#000000');
    expect(book.resolve('acme.button')).toBe('#000000');
    expect(book.isRebound('acme.button')).toBe(false);
    // and the book still works
    brand.set('button', color('#ffffff'));
    expect(book.resolve('acme.primary')).toBe('#ffffff');
  });

  it('rejects a delete that would close a cycle', () => {
    const { book } = brandBook();
    const acme = book.addScope('acme', { extends: 'brand' });
    acme.set('button', color('#000000'));
    acme.set('primary', ref('acme.button'));
    expect(() => acme.delete('button')).toThrow(CircularDependencyError);
    expect(acme.hasOwn('button')).toBe(true);
    expect(book.resolve('acme.primary')).toBe('#000000');
    acme.set('button', color('#ffffff'));
    expect(book.resolve('acme.primary')).toBe('#ffffff');
  });

  it('rejects an addScope whose inherited tokens close a cycle', () => {
    const book = new DesignBook('t');
    const base = book.addScope('base');
    const other = book.addScope('other');
    other.set('x', ref('kid.b'));          // forward ref, before kid exists
    base.set('a', ref('kid.b'));
    base.set('b', ref('.a'));              // kid.b → kid.a → base.a → kid.b
    expect(() => book.addScope('kid', { extends: 'base' })).toThrow(CircularDependencyError);
    expect(book.hasScope('kid')).toBe(false);
    expect(book.getDependencyGraph().hasNode('kid.a')).toBe(false);
    // the forward ref survives and still connects when kid appears for real
    base.set('a', color('#123456'));
    book.addScope('kid', { extends: 'base' });
    expect(book.resolve('other.x')).toBe('#123456');
  });

  it('batch mode collects the cycle and rolls the write back', () => {
    const { book, brand } = brandBook();
    brand.set('button', color('#000000'));
    const acme = book.addScope('acme', { extends: 'brand' });
    acme.set('primary', ref('acme.button'));
    book.mode = 'batch';
    brand.set('button', ref('.primary'));
    const { errors } = book.flush();
    expect(errors.some((e) => e instanceof CircularDependencyError)).toBe(true);
    expect(book.resolve('brand.button')).toBe('#000000');
  });
});

describe('relative refs: batch mode', () => {
  it('re-binds on flush and notifies the shadows', () => {
    const { book, brand } = brandBook('batch');
    const acme = book.addScope('acme', { extends: 'brand' });
    acme.set('primary', color('#ee4400'));
    book.flush();
    expect(book.resolve('acme.button')).toBe('#ee4400');

    const watcher = vi.fn();
    book.watch('acme.button', watcher);
    brand.set('secondary', color('#111111'));
    acme.set('secondary', color('#222222'));
    brand.set('button', ref('.secondary'));
    book.flush();
    expect(watcher).toHaveBeenCalledWith('#222222', expect.anything());
  });
});

describe('relative refs: scopes', () => {
  it('deleting the parent scope drops the bound shadows', () => {
    const { book } = brandBook();
    book.addScope('acme', { extends: 'brand' });
    expect(book.getDependencyGraph().hasNode('acme.button')).toBe(true);
    book.deleteScope('brand');
    expect(book.getDependencyGraph().hasNode('acme.button')).toBe(false);
    expect(book.has('acme.button')).toBe(false);
  });

  it('copyScope keeps relative refs relative', () => {
    const { book } = brandBook();
    const copy = book.copyScope('brand', 'copy');
    expect((copy.getRaw('button') as ReferenceValue).key).toBe('.primary');
    copy.set('primary', color('#ee4400'));
    expect(book.resolve('copy.button')).toBe('#ee4400');
    expect(book.resolve('brand.button')).toBe('#0066cc');
  });

  it('getScopeDependencies treats a relative ref as same-scope', () => {
    const { book } = brandBook();
    expect(book.getScopeDependencies('brand')).toEqual([]);
  });

  it('caches reference resolution per scope', () => {
    const { book } = brandBook();
    const acme = book.addScope('acme', { extends: 'brand' });
    book.getScope('acme')!.updateOwnReferenceCaches('button');
    const bound = acme.get('button') as ReferenceValue;
    expect(getReferenceResolution(bound)?.isResolvable).toBe(true);
  });
});

describe('relative refs: renderers', () => {
  it('css-variables points each scope at its own variable', () => {
    const { book } = brandBook();
    const acme = book.addScope('acme', { extends: 'brand' });
    acme.set('primary', color('#ee4400'));
    const css = book.render('css-variables');
    expect(css).toContain('--brand-button: var(--brand-primary)');
    expect(css).toContain('--acme-button: var(--acme-primary)');
  });

  it('w3 writes an alias to the bound key', () => {
    const { book } = brandBook();
    book.addScope('acme', { extends: 'brand' });
    const w3 = JSON.parse(book.render('w3-design-tokens'));
    expect(w3.acme.button.$value).toBe('{acme.primary}');
    expect(w3.brand.button.$value).toBe('{brand.primary}');
  });

  it('json writes resolved values', () => {
    const { book } = brandBook();
    const acme = book.addScope('acme', { extends: 'brand' });
    acme.set('primary', color('#ee4400'));
    const json = JSON.parse(book.render('json'));
    expect(json['acme.button']).toBe('#ee4400');
  });
});

describe('relative refs: layers', () => {
  it('a layer can write relative refs and data layers clone them as written', () => {
    const base = layer('base', (b) => {
      const brand = b.addScope('brand');
      brand.set('primary', color('#0066cc'));
      brand.set('button', ref('.primary'));
      b.addScope('acme', { extends: 'brand' });
    });
    const theme = layer('theme', { acme: { primary: color('#ee4400') } });
    const book = composeBook('themed', [base, theme]);
    expect(book.resolve('acme.button')).toBe('#ee4400');
    expect(book.resolve('brand.button')).toBe('#0066cc');
  });
});
