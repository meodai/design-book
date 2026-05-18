import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { color, px, string as stringToken } from '../../../src/tokens';
import { random } from '../../../src/functions/generic/random';
import { FunctionError } from '../../../src/errors';

describe('random', () => {
  it('picks a value matching the requested type', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('red', color('#ff0000'));
    palette.set('green', color('#00ff00'));
    palette.set('blue', color('#0000ff'));

    const ui = book.addScope('ui');
    ui.set('accent', random(palette, { type: 'color', seed: 'fixed' }));

    const resolved = book.resolve('ui.accent');
    expect(['#ff0000', '#00ff00', '#0000ff']).toContain(resolved);
  });

  it('is reproducible with the same explicit seed', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('a', color('#111111'));
    palette.set('b', color('#222222'));
    palette.set('c', color('#333333'));
    palette.set('d', color('#444444'));

    const ui = book.addScope('ui');
    ui.set('a1', random(palette, { type: 'color', seed: 'spring' }));
    ui.set('a2', random(palette, { type: 'color', seed: 'spring' }));

    expect(book.resolve('ui.a1')).toBe(book.resolve('ui.a2'));
  });

  it('captures a seed at construction so re-resolves are stable', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('a', color('#111111'));
    palette.set('b', color('#222222'));
    palette.set('c', color('#333333'));

    const ui = book.addScope('ui');
    ui.set('accent', random(palette, { type: 'color' }));

    const first = book.resolve('ui.accent');
    const second = book.resolve('ui.accent');
    expect(first).toBe(second);
  });

  it('filters by type — colors only, ignoring dimensions and strings', () => {
    const book = new DesignBook('test');
    const mixed = book.addScope('mixed');
    mixed.set('a', color('#abcdef'));
    mixed.set('b', px(8));
    mixed.set('c', stringToken('Helvetica'));
    mixed.set('d', px(16));

    const ui = book.addScope('ui');
    ui.set('only-color', random(mixed, { type: 'color', seed: 1 }));
    ui.set('only-dim', random(mixed, { type: 'dimension', seed: 1 }));

    expect(book.resolve('ui.only-color')).toBe('#abcdef');
    const dim = book.resolve('ui.only-dim');
    expect(['8px', '16px']).toContain(dim);
  });

  it('throws when no candidates match the requested type', () => {
    const book = new DesignBook('test');
    const dims = book.addScope('dims');
    dims.set('a', px(8));
    dims.set('b', px(16));

    const ui = book.addScope('ui');
    ui.set('bad', random(dims, { type: 'color', seed: 1 }));

    expect(() => book.resolve('ui.bad')).toThrow(FunctionError);
    expect(() => book.resolve('ui.bad')).toThrow(/no "color" candidates/);
  });

  it('honors the not exclusion list', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('a', color('#aaaaaa'));
    palette.set('b', color('#bbbbbb'));

    const ui = book.addScope('ui');
    // Exclude 'a' — only 'b' should ever be picked, regardless of seed.
    ui.set('accent', random(palette, { type: 'color', seed: 'whatever', not: ['palette.a'] }));
    expect(book.resolve('ui.accent')).toBe('#bbbbbb');
  });

  it('different seeds yield different picks in a large scope', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    for (let i = 0; i < 16; i++) {
      palette.set(`c${i}`, color(`hsl(${i * 22}, 80%, 50%)`));
    }
    const ui = book.addScope('ui');

    const picks = new Set<string>();
    for (let i = 0; i < 10; i++) {
      const tokenName = `t${i}`;
      ui.set(tokenName, random(palette, { type: 'color', seed: `seed-${i}` }));
      picks.add(book.resolve(`ui.${tokenName}`));
    }
    // With 16 candidates and 10 distinct seeds we expect at least a couple of
    // different outcomes — guards against the seed being ignored.
    expect(picks.size).toBeGreaterThan(1);
  });

  it('exposes the requested type as the function returnType', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('a', color('#abcdef'));

    const ui = book.addScope('ui');
    ui.set('accent', random(palette, { type: 'color' }));

    const inspection = book.inspect('ui.accent');
    expect(inspection.returnType).toBe('color');
  });
});
