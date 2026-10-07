import { describe, it, expect } from 'vitest';
import {
  DesignBook, color, ref, rem, px, string, colorMix, darken, bestContrastWith,
  createFunctionToken, diffBooks, layer, composeBook, layerOf, keysFromLayer,
  LayerError, CircularDependencyError,
} from '../src/index';
import type { Layer } from '../src/index';

const base = layer('base', (book) => {
  book.addScope('brand').set('highlight', color('#2d60a5'));
  book.addScope('text').set('highlight', ref('brand.highlight'));
});

describe('composeBook: late binding', () => {
  it('an override of a root reaches the tokens that reference it', () => {
    const themed = composeBook('forest', [
      base,
      layer('forest', { brand: { highlight: color('#3f8f5a') } }),
    ]);
    expect(themed.resolve('text.highlight')).toBe('#3f8f5a');
  });

  it('leaves a book composed without the theme untouched', () => {
    const plain = composeBook('base', [base]);
    composeBook('themed', [base, layer('themed', { brand: { highlight: color('#3f8f5a') } })]);
    expect(plain.resolve('text.highlight')).toBe('#2d60a5');
  });

  it('nearest (last) layer wins along a three-level stack', () => {
    const pub = layer('product', {
      brand: { highlight: color('#ff0000'), accent: color('#00ff00') },
      space: { gap: px(8) },
    });
    const forest = layer('forest', { brand: { highlight: color('#3f8f5a') } });
    const book = composeBook('themed', [
      layer('base', (b) => {
        b.addScope('brand').set('highlight', color('#2d60a5'));
        b.getScope('brand')!.set('accent', color('#0000ff'));
        b.addScope('space').set('gap', px(4));
        b.addScope('text').set('highlight', ref('brand.highlight'));
      }),
      pub,
      forest,
    ]);
    expect(book.resolve('text.highlight')).toBe('#3f8f5a');
    expect(book.resolve('brand.accent')).toBe('#00ff00');
    expect(book.resolve('space.gap')).toBe('8px');
    expect(layerOf(book, 'brand.highlight')).toBe('forest');
    expect(layerOf(book, 'brand.accent')).toBe('product');
    expect(layerOf(book, 'text.highlight')).toBe('base');
    expect(keysFromLayer(book, 'product')).toEqual(['brand.accent', 'space.gap']);
    expect(keysFromLayer(book, 'forest')).toEqual(['brand.highlight']);
  });

  it('a root override flows through several hops of refs and function tokens', () => {
    const chain = layer('chain', (b) => {
      b.addScope('brand').set('primary', color('#2d60a5'));
      const ui = b.addScope('ui');
      ui.set('accent', ref('brand.primary'));
      ui.set('mixed', colorMix(ref('ui.accent'), color('#ffffff'), { ratio: 0.5 }));
      ui.set('deep', darken(ref('ui.mixed'), { amount: 0.2 }));
      ui.set('border', ref('ui.deep'));
    });
    const plain = composeBook('plain', [chain]);
    const themed = composeBook('themed', [chain, layer('green', { brand: { primary: color('#3f8f5a') } })]);
    expect(themed.resolve('ui.border')).not.toBe(plain.resolve('ui.border'));

    const manual = composeBook('manual', [chain]);
    manual.getScope('brand')!.set('primary', color('#3f8f5a'));
    expect(themed.resolve('ui.border')).toBe(manual.resolve('ui.border'));
  });

  it('scope extends inside a layer sees a later override of the extended scope', () => {
    const book = composeBook('x', [
      layer('base', (b) => {
        b.addScope('text').set('highlight', color('#2d60a5'));
        b.addScope('alt-text', { extends: 'text' });
      }),
      layer('theme', { text: { highlight: color('#3f8f5a') } }),
    ]);
    expect(book.resolve('alt-text.highlight')).toBe('#3f8f5a');
  });

  it('a selector picks from the pool as the layers left it', () => {
    const pool = layer('pool', (b) => {
      const ink = b.addScope('ink');
      ink.set('dark', color('#333333'));
      ink.set('light', color('#eeeeee'));
      b.addScope('surface').set('bg', color('#ffffff'));
      b.addScope('ui').set('text', bestContrastWith(ref('surface.bg'), ink));
    });
    expect(composeBook('a', [pool]).resolve('ui.text')).toBe('#333333');
    const book = composeBook('b', [pool, layer('t', { ink: { black: color('#000000') } })]);
    expect(book.resolve('ui.text')).toBe('#000000');
    const overridden = composeBook('c', [pool, layer('t', { ink: { dark: color('#cccccc') } })]);
    expect(overridden.resolve('ui.text')).toBe('#cccccc');
  });
});

describe('data layers', () => {
  it('creates a missing scope', () => {
    const book = composeBook('x', [base, layer('t', { motion: { fast: px(1) } })]);
    expect(book.hasScope('motion')).toBe(true);
    expect(book.resolve('motion.fast')).toBe('1px');
  });

  it('rejects values that are not tokens', () => {
    const bad = layer('bad', { brand: { highlight: '#ffffff' as never } });
    expect(() => composeBook('x', [base, bad])).toThrow(LayerError);
    try {
      composeBook('x', [base, bad]);
    } catch (e) {
      expect((e as LayerError).layerName).toBe('bad');
      expect((e as LayerError).tokenKey).toBe('brand.highlight');
    }
  });

  it('clones tokens so books never share token objects', () => {
    const data = layer('t', { brand: { link: ref('brand.highlight') } });
    const a = composeBook('a', [base, data]);
    const b = composeBook('b', [base, data]);
    expect(a.getTokenByKey('brand.link')).not.toBe(b.getTokenByKey('brand.link'));
    expect(a.getTokenByKey('brand.link')).toEqual(b.getTokenByKey('brand.link'));
  });

  it('overrides one property of a typography scope and keeps compose', () => {
    const book = composeBook('x', [
      layer('base', (b) => {
        b.addTypography('heading', { fontFamily: 'Inter', fontSize: rem(2), fontWeight: '700' });
      }),
      layer('dense', { heading: { fontSize: rem(1.5) } }),
    ]);
    expect(book.getScope('heading')!.compose).toBe('typography');
    expect(book.resolve('heading.fontSize')).toBe('1.5rem');
    expect(book.resolve('heading.fontFamily')).toBe('Inter');
  });

  it('can be applied to a hand-built book', () => {
    const book = new DesignBook('hand');
    book.addScope('brand').set('highlight', color('#2d60a5'));
    layer('t', { brand: { highlight: color('#3f8f5a') } }).apply(book);
    expect(book.resolve('brand.highlight')).toBe('#3f8f5a');
  });
});

describe('function layers', () => {
  it('registered functions are usable by later layers', () => {
    const book = composeBook('x', [
      layer('fns', (b) => b.registerFunction('double', (v: string) => `${parseFloat(v) * 2}px`)),
      layer('space', (b) => b.addScope('space').set('base', px(4))),
      layer('derived', { space: { large: createFunctionToken('double', [ref('space.base')]) } }),
    ]);
    expect(book.resolve('space.large')).toBe('8px');
  });

  it('records a delete in provenance', () => {
    const book = composeBook('x', [
      base,
      layer('drop', (b) => { b.getScope('brand')!.set('extra', string('x')); }),
      layer('undo', (b) => { b.getScope('brand')!.delete('extra'); }),
    ]);
    expect(book.has('brand.extra')).toBe(false);
    expect(layerOf(book, 'brand.extra')).toBe('undo');
    expect(keysFromLayer(book, 'drop')).toEqual([]);
  });
});

describe('errors', () => {
  it('rejects an empty stack', () => {
    expect(() => composeBook('x', [])).toThrow(LayerError);
  });

  it('rejects duplicate layer names', () => {
    expect(() => composeBook('x', [base, base])).toThrow(/base/);
  });

  it('wraps an error thrown by a function layer', () => {
    const boom = new Error('boom');
    try {
      composeBook('x', [base, layer('broken', () => { throw boom; })]);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(LayerError);
      expect((e as LayerError).layerName).toBe('broken');
      expect((e as LayerError).cause).toBe(boom);
    }
  });

  it('rejects a layer that closes a cycle and names it', () => {
    const loop = layer('loop', { brand: { highlight: ref('text.highlight') } });
    try {
      composeBook('x', [base, loop]);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(LayerError);
      expect((e as LayerError).layerName).toBe('loop');
      expect((e as LayerError).tokenKey).toBe('brand.highlight');
      expect((e as LayerError).cause).toBeInstanceOf(CircularDependencyError);
    }
  });

  it('allows a forward ref that a later layer fills in', () => {
    const book = composeBook('x', [
      layer('a', { ui: { link: ref('brand.link') } }),
      layer('b', { brand: { link: color('#123456') } }),
    ]);
    expect(book.resolve('ui.link')).toBe('#123456');
  });

  it('rejects a layer without a name', () => {
    expect(() => layer('', {})).toThrow(LayerError);
  });
});

describe('the composed book', () => {
  it('is in auto mode by default and live', () => {
    const book = composeBook('x', [base]);
    expect(book.mode).toBe('auto');
    const seen: Array<string | undefined> = [];
    book.watch('text.highlight', (v) => seen.push(v));
    book.getScope('brand')!.set('highlight', color('#000000'));
    expect(seen).toEqual(['#000000']);
  });

  it('honours options', () => {
    const book = composeBook('x', [base], { mode: 'batch', description: 'themed' });
    expect(book.mode).toBe('batch');
    expect(book.description).toBe('themed');
    expect(book.name).toBe('x');
  });

  it('renders the full effective set and, with changedFrom, only the differences', () => {
    const theme: Layer = layer('themed', { brand: { highlight: color('#3f8f5a') } });
    const plain = composeBook('base', [base]);
    const themed = composeBook('themed', [base, theme]);

    const json = JSON.parse(themed.render('json'));
    expect(json['brand.highlight']).toBe('#3f8f5a');
    expect(json['text.highlight']).toBe('#3f8f5a');

    const w3 = JSON.parse(themed.render('w3-design-tokens'));
    expect(w3.brand.highlight.$type).toBe('color');

    const css = themed.render('css-variables');
    expect(css).toContain('--brand-highlight: #3f8f5a;');
    expect(css).toContain('--text-highlight: var(--brand-highlight);');

    const overrides = themed.render('css-variables', { selector: '.themed', changedFrom: plain });
    expect(overrides).toContain('--brand-highlight: #3f8f5a;');
    expect(overrides).not.toContain('--text-highlight');
  });

  it('diffBooks reports what moved between two compositions', () => {
    const before = composeBook('x', [base, layer('t', { brand: { highlight: color('#3f8f5a') } })]);
    const after = composeBook('x', [base, layer('t', { brand: { highlight: color('#ff0000') } })]);
    const { changed } = diffBooks(before, after);
    expect(changed.map((c) => c.key).sort()).toEqual(['brand.highlight', 'text.highlight']);
  });
});
