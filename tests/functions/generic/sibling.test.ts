import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { color, createFunctionToken, px, ref } from '../../../src/tokens';
import { sibling, scopeOfKey } from '../../../src/functions/generic/sibling';
import { lighten } from '../../../src/functions/color/lighten';
import { FunctionError } from '../../../src/errors';
import { Renderer } from '../../../src/renderers/renderer';
import { nth } from '../../../src/functions/generic/nth';

function setup() {
  const book = new DesignBook('test');
  const ramp = book.addScope('ramp');
  ramp.set('s100', color('#eeeeee'));
  ramp.set('s200', color('#cccccc'));
  ramp.set('s300', color('#999999'));
  ramp.set('s400', color('#666666'));
  ramp.set('s500', color('#333333'));
  const ui = book.addScope('ui');
  return { book, ramp, ui };
}

describe('sibling', () => {
  it('steps up and down from the anchor in scope order', () => {
    const { book, ui } = setup();
    ui.set('up',   sibling(ref('ramp.s300'), 1));
    ui.set('down', sibling(ref('ramp.s300'), -1));
    ui.set('two',  sibling(ref('ramp.s300'), 2));
    ui.set('same', sibling(ref('ramp.s300'), 0));

    expect(book.resolve('ui.up')).toBe('#666666');
    expect(book.resolve('ui.down')).toBe('#cccccc');
    expect(book.resolve('ui.two')).toBe('#333333');
    expect(book.resolve('ui.same')).toBe('#999999');
  });

  it('stops at the first and last member by default', () => {
    const { book, ui } = setup();
    ui.set('past-top',    sibling(ref('ramp.s400'), 10));
    ui.set('past-bottom', sibling(ref('ramp.s200'), -10));

    expect(book.resolve('ui.past-top')).toBe('#333333');
    expect(book.resolve('ui.past-bottom')).toBe('#eeeeee');
  });

  it('wraps around with { wrap: true }', () => {
    const { book, ui } = setup();
    ui.set('over',  sibling(ref('ramp.s500'), 1, { wrap: true }));
    ui.set('under', sibling(ref('ramp.s100'), -1, { wrap: true }));
    ui.set('far',   sibling(ref('ramp.s300'), -7, { wrap: true })); // index 2 - 7 = -5 → 0

    expect(book.resolve('ui.over')).toBe('#eeeeee');
    expect(book.resolve('ui.under')).toBe('#333333');
    expect(book.resolve('ui.far')).toBe('#eeeeee');
  });

  it('follows changes to the neighbour and to the scope membership', () => {
    const { book, ramp, ui } = setup();
    ui.set('up', sibling(ref('ramp.s300'), 1));

    ramp.set('s400', color('#555555'));
    expect(book.resolve('ui.up')).toBe('#555555');

    ramp.delete('s400');
    expect(book.resolve('ui.up')).toBe('#333333');
  });

  it('notifies on a neighbour change', () => {
    const { book, ramp, ui } = setup();
    ui.set('up', sibling(ref('ramp.s300'), 1));
    const changed: string[] = [];
    book.on('tokenChanged', (e) => changed.push(e.detail.key));
    ramp.set('s400', color('#555555'));
    expect(changed).toContain('ui.up');
  });

  it('skips keys listed in `not`', () => {
    const { book, ui } = setup();
    ui.set('up', sibling(ref('ramp.s300'), 1, { not: [ref('ramp.s400')] }));
    expect(book.resolve('ui.up')).toBe('#333333');
  });

  it('can live in the scope it walks without counting itself', () => {
    const { book, ramp } = setup();
    ramp.set('hover', sibling(ref('ramp.s400'), 1));
    ramp.set('top',   sibling(ref('ramp.s500'), 5));

    expect(book.resolve('ramp.hover')).toBe('#333333');
    expect(book.resolve('ramp.top')).toBe('#333333'); // not hover, not itself
  });

  it('works on any token type, not only colours', () => {
    const book = new DesignBook('test');
    const space = book.addScope('space');
    space.set('s', px(4));
    space.set('m', px(8));
    space.set('l', px(16));
    const ui = book.addScope('ui');
    ui.set('gap', sibling(ref('space.m'), 1));
    expect(book.resolve('ui.gap')).toBe('16px');
  });

  it('walks inherited members of an extending scope', () => {
    const { book, ui } = setup();
    const dark = book.addScope('dark', { extends: 'ramp' });
    dark.set('s400', color('#123456'));
    ui.set('up', sibling(ref('dark.s300'), 1));
    expect(book.resolve('ui.up')).toBe('#123456');
  });

  it('nests inside other functions', () => {
    const { book, ramp, ui } = setup();
    ui.set('soft', lighten(sibling(ref('ramp.s300'), 1), { amount: 0 }));
    expect(book.resolve('ui.soft')).toBe('#666666');
    ramp.set('s400', color('#555555'));
    expect(book.resolve('ui.soft')).toBe('#555555');
  });

  it('rejects a non-integer offset and a non-ref anchor', () => {
    expect(() => sibling(ref('ramp.s300'), 0.5)).toThrow(FunctionError);
    expect(() => sibling(ref('ramp.s300'), Number.NaN)).toThrow(/integer/);
    expect(() => sibling(color('#fff') as any, 1)).toThrow(/ref/);
  });

  it('throws when the anchor is not in the pool', () => {
    const { book, ui } = setup();
    expect(() => {
      ui.set('x', sibling(ref('ramp.s300'), 1, { not: ['ramp.s300'] }));
      book.resolve('ui.x');
    }).toThrow(/ramp\.s300/);
    expect(() => {
      ui.set('y', sibling(ref('ramp.nope'), 1));
      book.resolve('ui.y');
    }).toThrow();
  });

  it('re-picks when a member of the parent scope changes', () => {
    const { book, ramp, ui } = setup();
    book.addScope('dark', { extends: 'ramp' });
    ui.set('up', sibling(ref('dark.s300'), 1));
    expect(book.resolve('ui.up')).toBe('#666666');

    ramp.set('s400', color('#555555'));
    expect(book.resolve('ui.up')).toBe('#555555');

    ramp.delete('s400');
    expect(book.resolve('ui.up')).toBe('#333333');
  });

  it('re-picks in batch mode once flushed', () => {
    const { book, ramp, ui } = setup();
    ui.set('up', sibling(ref('ramp.s300'), 1));
    const changed: string[] = [];
    book.on('tokenChanged', (e) => changed.push(e.detail.key));

    book.mode = 'batch';
    ramp.set('s400', color('#555555'));
    expect(changed).not.toContain('ui.up');

    book.flush();
    expect(changed).toContain('ui.up');
    expect(book.resolve('ui.up')).toBe('#555555');
  });

  it('throws on a saved token without a usable anchor key', () => {
    const { book, ui } = setup();
    const cases = [
      createFunctionToken('sibling', [], { options: { offset: 1 } }),
      createFunctionToken('sibling', [], { options: { from: 'nodot', offset: 1 } }),
      createFunctionToken('sibling', [], { options: { from: 'ramp.s300', offset: 1.5 } }),
      createFunctionToken('sibling', [], { options: { from: 'ghost.s300', offset: 1 } }),
    ];
    const messages = cases.map((tok, i) => {
      try {
        ui.set(`bad${i}`, tok);
        book.resolve(`ui.bad${i}`);
        return 'no error';
      } catch (err) {
        return (err as Error).message;
      }
    });
    expect(messages[0]).toMatch(/`from` key is required/);
    expect(messages[1]).toMatch(/`from` key is required/);
    expect(messages[2]).toMatch(/offset must be an integer/);
    expect(messages[3]).toMatch(/unknown scope "ghost"/);
  });

  it('tracks the anchor when nested inside another function', () => {
    const { book, ramp, ui } = setup();
    ui.set('x', lighten(sibling(ref('ramp.s300'), 1), 0.1));
    const before = book.resolve('ui.x');

    ramp.set('s400', color('#000000'));
    expect(book.resolve('ui.x')).not.toBe(before);

    // A loop through the nested anchor is a cycle, same as at top level.
    expect(() => ramp.set('s300', lighten(ref('ui.x'), 0.1))).toThrow(/Circular dependency/);
  });
});

describe('sibling in the renderers', () => {
  function book3() {
    const book = new DesignBook('test');
    const ramp = book.addScope('ramp');
    ramp.set('a', color('#eeeeee'));
    ramp.set('b', color('#999999'));
    const space = book.addScope('space');
    space.set('m', px(8));
    space.set('l', px(16));
    const ui = book.addScope('ui');
    ui.set('up', sibling(ref('ramp.a'), 1));
    ui.set('gap', sibling(ref('space.m'), 1));
    ui.set('pick', nth(ramp, 1)); // same untyped-function path as sibling
    return book;
  }

  it('JSON gets the resolved value', () => {
    const json = new Renderer(book3(), 'json').renderJsonObject();
    expect(json['ui.up']).toBe('#999999');
    expect(json['ui.gap']).toBe('16px');
  });

  it('CSS gets the resolved value', () => {
    const css = new Renderer(book3(), 'css-variables').render();
    expect(css).toContain('--ui-up: #999999;');
    expect(css).toContain('--ui-gap: 16px;');
  });

  it('W3 types the result by what it resolves to', () => {
    const w3 = new Renderer(book3(), 'w3-design-tokens').renderW3DesignTokensObject() as any;

    expect(w3.ui.up.$type).toBe('color');
    expect(w3.ui.up.$value).toEqual(w3.ramp.b.$value);
    expect(w3.ui.gap.$type).toBe('dimension');
    expect(w3.ui.gap.$value).toEqual({ value: 16, unit: 'px' });
    expect(w3.ui.pick.$type).toBe('color');
  });
});

describe('sibling anchor validation', () => {
  it('rejects an unqualified anchor at construction', () => {
    expect(() => sibling(ref('g100'), 1)).toThrow(FunctionError);
    expect(() => sibling(ref('g100'), 1)).toThrow(/fully-qualified/);
  });

  it('rejects an anchor with an empty scope or token part', () => {
    expect(() => sibling(ref('.g100'), 1)).toThrow(FunctionError);
    expect(() => sibling(ref('gray.'), 1)).toThrow(FunctionError);
  });

  it('scopeOfKey throws on a key without a scope', () => {
    expect(() => scopeOfKey('g100')).toThrow(FunctionError);
    expect(scopeOfKey('gray.g100')).toBe('gray');
  });
});
