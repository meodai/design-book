import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import type { ChangeDetail, TokenChangedDetail } from '../src/design-book';
import { color, createFunctionToken, ref } from '../src/tokens';
import { ramp } from '../src/functions/color/ramp';

const HOUSE = {
  clay: { 100: '#f3e3d8', 500: '#b0603a', 900: '#3a1d10' },
  moss: { 100: '#e3ecd6', 500: '#5e7d3a', 900: '#1f2a12' },
};

function record(book: DesignBook) {
  const tokens: TokenChangedDetail[] = [];
  const changes: ChangeDetail[] = [];
  book.on('tokenChanged', (e) => tokens.push(e.detail));
  book.on('change', (e) => changes.push(e.detail));
  return { tokens, changes };
}

describe('tokenChanged: one shape on every path', () => {
  it('a written key carries its tokens and its value; a dependent its unchanged token', () => {
    const book = new DesignBook('t');
    const a = book.addScope('a');
    const red = color('#ff0000');
    a.set('x', red);
    a.set('y', ref('a.x'));
    const { tokens } = record(book);
    const blue = color('#0000ff');
    a.set('x', blue);
    expect(tokens).toEqual([
      { key: 'a.x', cause: 'written', newValue: blue, oldValue: red, value: '#0000ff' },
      { key: 'a.y', cause: 'dependent', newValue: a.getRaw('y'), oldValue: a.getRaw('y'), value: '#0000ff' },
    ]);
  });

  it('watch hands over the value the event carries', () => {
    const book = new DesignBook('t');
    const a = book.addScope('a');
    a.set('x', color('#ff0000'));
    const seen: Array<string | undefined> = [];
    book.watch('a.x', (value) => seen.push(value));
    a.set('x', ref('a.missing'));
    a.set('x', color('#00ff00'));
    expect(seen).toEqual([undefined, '#00ff00']);
  });

  it('re-registering a ramp set announces its readers as dependents', () => {
    const book = new DesignBook('t');
    const brand = book.addScope('brand');
    brand.set('seed', color('#b0603a'));
    brand.set('100', ramp(ref('brand.seed'), { shade: '100', from: 'house' }));
    brand.set('label', ref('brand.100'));
    book.registerRamps('house', HOUSE);
    const { tokens, changes } = record(book);
    book.registerRamps('house', { ...HOUSE, clay: { ...HOUSE.clay, 100: '#ffeedd' } });
    expect(tokens.map((t) => [t.key, t.cause, t.value])).toEqual([
      ['brand.100', 'dependent', '#ffeedd'],
      ['brand.label', 'dependent', '#ffeedd'],
    ]);
    expect(changes).toHaveLength(1);
  });
});

describe('deleteScope', () => {
  it('announces the removed keys as one change, each with the token it held', () => {
    const book = new DesignBook('t');
    const a = book.addScope('a');
    const red = color('#ff0000');
    a.set('x', red);
    a.set('y', color('#00ff00'));
    book.addScope('ui').set('bg', ref('a.x'));
    const { tokens, changes } = record(book);
    book.deleteScope('a');
    expect(changes).toHaveLength(1);
    expect(changes[0].changedKeys.sort()).toEqual(['a.x', 'a.y', 'ui.bg']);
    const x = tokens.find((t) => t.key === 'a.x')!;
    expect(x).toMatchObject({ cause: 'written', newValue: undefined, oldValue: red, value: undefined });
    expect(tokens.find((t) => t.key === 'ui.bg')).toMatchObject({ cause: 'dependent', value: undefined });
  });

  it('a scope extending a deleted one no longer sees its pool changes', () => {
    const book = new DesignBook('t');
    book.addScope('base').set('x', color('#ff0000'));
    book.addScope('child', { extends: 'base' });
    book.deleteScope('child');
    // Re-created without extends: base's keys are not its keys.
    book.addScope('child').set('y', color('#00ff00'));
    const { changes } = record(book);
    book.getScope('base')!.set('x', color('#0000ff'));
    expect(changes[0].changedKeys).toEqual(['base.x']);
  });
});

describe('FunctionTraits.scopesRead', () => {
  it('notifies a token when a scope its function reads changes', () => {
    const book = new DesignBook('t');
    // A custom function reading the first key of a scope named in options.
    book.registerFunction('firstOf', (options?: { scope: string }) => {
      const scope = book.getScope(options!.scope)!;
      return scope.resolve(scope.getAllKeys()[0]);
    }, { scopesRead: (token) => [token.options!.scope as string] });
    const pal = book.addScope('pal');
    pal.set('a', color('#ff0000'));
    book.addScope('ui').set('pick', createFunctionToken('firstOf', [], { options: { scope: 'pal' } }));
    expect(book.resolve('ui.pick')).toBe('#ff0000');
    const { tokens } = record(book);
    pal.set('a', color('#00ff00'));
    expect(tokens.map((t) => [t.key, t.value])).toEqual([['pal.a', '#00ff00'], ['ui.pick', '#00ff00']]);
  });
});
