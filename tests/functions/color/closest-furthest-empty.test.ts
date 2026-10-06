import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { color, ref, string } from '../../../src/tokens';
import { FunctionError } from '../../../src/errors';
import { closestColor, closestColorImpl } from '../../../src/functions/color/closest-color';
import { furthestFrom, furthestFromImpl } from '../../../src/functions/color/furthest-from';

// Like every other colour selector, closestColor / furthestFrom throw instead
// of handing back a transparent '#00000000' nobody asked for.
describe('closestColor / furthestFrom with nothing to pick', () => {
  it('closestColor throws on a scope without colours', () => {
    const book = new DesignBook('test');
    const empty = book.addScope('empty');
    empty.set('label', string('hello'));
    const ui = book.addScope('ui');
    ui.set('match', closestColor(color('#ff0000'), empty));
    expect(() => book.resolve('ui.match')).toThrow(/closestColor: no valid colour candidates/);
  });

  it('closestColor throws when `not` empties the pool', () => {
    const book = new DesignBook('test');
    const p = book.addScope('p');
    p.set('red', color('#ff0000'));
    expect(() => closestColorImpl('#ff0000', p, ['p.red'])).toThrow(FunctionError);
  });

  it('closestColor throws on an unparseable target', () => {
    const book = new DesignBook('test');
    const p = book.addScope('p');
    p.set('red', color('#ff0000'));
    expect(() => closestColorImpl('not-a-colour', p)).toThrow(/closestColor: cannot parse/);
  });

  it('furthestFrom throws on a scope without colours', () => {
    const book = new DesignBook('test');
    const empty = book.addScope('empty');
    const ui = book.addScope('ui');
    ui.set('far', furthestFrom(empty));
    expect(() => book.resolve('ui.far')).toThrow(/furthestFrom: no valid colour candidates/);
  });

  it('furthestFrom throws when `not` empties the pool', () => {
    const book = new DesignBook('test');
    const p = book.addScope('p');
    p.set('red', color('#ff0000'));
    expect(() => furthestFromImpl(p, ['p.red'])).toThrow(FunctionError);
  });

  it('still works through a reference target', () => {
    const book = new DesignBook('test');
    const p = book.addScope('p');
    p.set('red', color('#ff0000'));
    const ui = book.addScope('ui');
    ui.set('match', closestColor(ref('p.red'), p));
    expect(book.resolve('ui.match')).toBe('#ff0000');
  });
});
