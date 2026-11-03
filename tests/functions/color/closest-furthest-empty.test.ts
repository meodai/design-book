import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { color, ref, string } from '../../../src/tokens';
import { FunctionError } from '../../../src/errors';
import { closest, closestImpl } from '../../../src/functions/generic/closest';
import { furthestFrom, furthestFromImpl } from '../../../src/functions/color/furthest-from';

// Like every other color selector, closest / furthestFrom throw instead
// of handing back a transparent '#00000000' nobody asked for.
describe('closest / furthestFrom with nothing to pick', () => {
  it('closest throws on a scope without colors', () => {
    const book = new DesignBook('test');
    const empty = book.addScope('empty');
    empty.set('label', string('hello'));
    const ui = book.addScope('ui');
    ui.set('match', closest(color('#ff0000'), ref('empty')));
    expect(() => book.resolve('ui.match')).toThrow(/closest: no valid color candidates/);
  });

  it('closest throws when `not` empties the pool', () => {
    const book = new DesignBook('test');
    const p = book.addScope('p');
    p.set('red', color('#ff0000'));
    expect(() => closestImpl('#ff0000', p, ['p.red'])).toThrow(FunctionError);
  });

  it('closest throws on an unparseable target', () => {
    const book = new DesignBook('test');
    const p = book.addScope('p');
    p.set('red', color('#ff0000'));
    expect(() => closestImpl('not-a-color', p)).toThrow(/closest: cannot parse/);
  });

  it('furthestFrom throws on a scope with nothing to compare', () => {
    const book = new DesignBook('test');
    const empty = book.addScope('empty');
    const ui = book.addScope('ui');
    ui.set('far', furthestFrom(ref('empty')));
    expect(() => book.resolve('ui.far')).toThrow(/furthestFrom: scope "empty" has no colors, sizes or text styles/);
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
    ui.set('match', closest(ref('p.red'), ref('p')));
    expect(book.resolve('ui.match')).toBe('#ff0000');
  });
});
