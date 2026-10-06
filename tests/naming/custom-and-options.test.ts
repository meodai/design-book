import { describe, it, expect } from 'vitest';
import { scaleNames, nameBetween, namingScheme, schemes } from '../../src/naming';
import { assertValidTokenKey } from '../../src/scope';
import { TokenError } from '../../src/errors';
import * as designBook from '../../src/index';

describe('namingScheme', () => {
  it('makes a start-anchored scheme from a list', () => {
    const steps = namingScheme(['one', 'two', 'three']);
    expect(scaleNames(2, steps)).toEqual(['one', 'two']);
    expect(nameBetween('one', 'two', steps)).toBe('one_5');
    expect(() => scaleNames(4, steps)).toThrow(/3/);
  });

  it('makes a base-anchored scheme when given a base', () => {
    const ink = namingScheme(['hint', 'faint', 'mid', 'bold', 'heavy'], { base: 'mid' });
    expect(scaleNames(3, ink)).toEqual(['hint', 'mid', 'heavy']);
    expect(scaleNames(2, ink, { base: 0 })).toEqual(['mid', 'heavy']);
  });

  it('validates its list', () => {
    expect(() => namingScheme([])).toThrow(TokenError);
    expect(() => namingScheme(['a', 'a'])).toThrow(/duplicate/);
    expect(() => namingScheme(['a', 'b c'])).toThrow(/b c/);
    expect(() => namingScheme(['a', 'b'], { base: 'z' })).toThrow(/z/);
  });
});

describe('scaleNames options and errors', () => {
  it('adds a prefix and suffix to every name', () => {
    expect(scaleNames(3, 'tshirt', { prefix: 'space-' })).toEqual(['space-s', 'space-m', 'space-l']);
    expect(scaleNames(2, 'ordinal', { suffix: 'x' })).toEqual(['1x', '2x']);
  });

  it('rejects a prefix that makes an invalid key', () => {
    expect(() => scaleNames(2, 'tshirt', { prefix: 'space.' })).toThrow(TokenError);
  });

  it('rejects options that do not apply to the scheme', () => {
    expect(() => scaleNames(3, 'tshirt', { step: 2 })).toThrow(/step/);
    expect(() => scaleNames(3, 'greek', { case: 'upper' })).toThrow(/case/);
    expect(() => scaleNames(3, 'hundreds', { step: 1 })).toThrow(/step/);
    expect(() => scaleNames(3, 'tshirt', { from: 0 })).toThrow(/from/);
  });

  it('rejects an unknown scheme and a bad count', () => {
    expect(() => scaleNames(3, 'nope' as any)).toThrow(/nope/);
    expect(() => scaleNames(-1, 'tshirt')).toThrow(/count/);
    expect(() => scaleNames(2.5, 'tshirt')).toThrow(/count/);
  });

  it('only ever produces valid token keys', () => {
    for (const name of Object.keys(schemes)) {
      for (const n of [1, 2, 3, 5, 8]) {
        let names: string[] = [];
        try { names = scaleNames(n, name as any); } catch { continue; }
        for (const key of names) expect(() => assertValidTokenKey('s', key)).not.toThrow();
      }
    }
  });

  it('lists every built-in scheme', () => {
    expect(Object.keys(schemes).sort()).toEqual(
      ['creatures', 'dynamics', 'greek', 'hundreds', 'intensity', 'ordinal', 'paper', 'roman', 'signed', 'tones', 'tshirt', 'unit', 'weights'],
    );
    expect(Object.isFrozen(schemes)).toBe(true);
  });

  it('is exported from the package root', () => {
    expect(typeof designBook.scaleNames).toBe('function');
    expect(typeof designBook.nameBetween).toBe('function');
    expect(typeof designBook.namingScheme).toBe('function');
    expect(designBook.schemes).toBe(schemes);
  });
});

describe('naming a real scope', () => {
  it('fills a scope that nth and sibling walk in order', () => {
    const { DesignBook, color, ref, nth, sibling } = designBook;
    const book = new DesignBook('n');
    const stops = ['#f5f5f5', '#dddddd', '#bbbbbb', '#999999', '#666666', '#333333', '#111111'];
    const gray = book.addScope('gray');
    const names = scaleNames(stops.length, 'hundreds');
    names.forEach((name, i) => gray.set(name, color(stops[i])));
    const ui = book.addScope('ui');
    ui.set('first', nth(gray, 0));
    ui.set('last', nth(gray, -1));
    ui.set('next', sibling(ref(`gray.${names[2]}`), 1));
    expect(book.resolve('ui.first')).toBe('#f5f5f5');
    expect(book.resolve('ui.last')).toBe('#111111');
    expect(book.resolve('ui.next')).toBe('#999999');
  });
});

describe('nameValues', () => {
  it('pairs every value with its name, smallest first', () => {
    expect(designBook.nameValues(['#eee', '#888', '#111'], 'tshirt')).toEqual(
      [['s', '#eee'], ['m', '#888'], ['l', '#111']],
    );
    expect(designBook.nameValues([4, 8, 16, 32], 'ordinal', { base: [1, '0'] })).toEqual(
      [['-1', 4], ['0', 8], ['1', 16], ['2', 32]],
    );
  });

  it('fills a scope in one loop', () => {
    const { DesignBook, color } = designBook;
    const book = new DesignBook('v');
    const brand = book.addScope('brand');
    const shades = ['#fff7d6', '#ffe98a', '#ffdd00', '#b49c00', '#645600'];
    for (const [name, hex] of designBook.nameValues(shades, 'hundreds', { base: [2, '500'] })) {
      brand.set(name, color(hex));
    }
    expect(book.resolve('brand.500')).toBe('#ffdd00');
  });
});
