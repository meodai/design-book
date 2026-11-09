import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../src/design-book';
import { color, createFunctionToken, pool, px, ref } from '../../src/tokens';
import { FunctionError } from '../../src/errors';
import {
  bestContrastWith, closest, colorMix, lighten, minContrastWith, mostVivid, nextLighter, nth, random, sibling, typographyScale,
} from '../../src/functions';

describe('constructors refuse options they do not read', () => {
  it('names the option and the ones it takes', () => {
    expect(() => minContrastWith(color('#fff'), ref('p'), { ratio: 7 } as never))
      .toThrow('minContrastWith: unknown option `ratio` (expected minContrast, direction, not, by, readableOn, readableContrast, description)');
  });

  it('catches misspellings, which used to fall back to the default without a word', () => {
    expect(() => mostVivid(ref('p'), { readableon: ref('ui.bg') } as never)).toThrow(/unknown option `readableon`/);
    expect(() => lighten(ref('p.a'), { amout: 0.3 } as never)).toThrow(/unknown option `amout`/);
    expect(() => typographyScale(px(16), { steps: 2 } as never)).toThrow(/unknown option `steps`/);
    expect(() => sibling(ref('p.a'), 1, { towards: ref('p.b') } as never)).toThrow(/unknown option `towards`/);
  });

  it('a positional value where the options object goes is refused too', () => {
    expect(() => lighten(ref('p.a'), 0.1 as never)).toThrow('lighten: options must be an object, got number');
  });

  it('the aliases take closest’s options but their own direction', () => {
    expect(() => nextLighter(color('#888'), ref('p'), { direction: 'darker' } as never)).toThrow(/nextLighter: unknown option `direction`/);
    expect(() => nextLighter(color('#888'), ref('p'), { minDistance: 0.1, not: ['p.a'] })).not.toThrow();
  });

  it('accepts every documented option, and description everywhere', () => {
    expect(() => closest(color('#888'), ref('p'), { direction: 'lighter', minDistance: 0.1, not: [], readableOn: color('#fff'), readableContrast: 3, description: 'x' })).not.toThrow();
    expect(() => bestContrastWith(color('#888'), ref('p'), { direction: 'darker', not: [], description: 'x' })).not.toThrow();
    expect(() => colorMix(color('#000'), color('#fff'), { ratio: 0.3, colorSpace: 'oklab', description: 'x' })).not.toThrow();
    expect(() => nth(ref('p'), 0, { not: [], description: 'x' })).not.toThrow();
    expect(() => random(ref('p'), { type: 'color', seed: 1, not: [], description: 'x' })).not.toThrow();
  });

  it('a stored token is not checked again: old data still loads', () => {
    const book = new DesignBook('t');
    book.addScope('p').set('a', color('#ff0000'));
    book.addScope('ui').set('x', createFunctionToken('mostVivid', [pool('p')], { options: { not: [], retired: true } }));
    expect(book.resolve('ui.x')).toBe('#ff0000');
  });
});

describe('a pool is a scope of the book or a reference to one', () => {
  it('takes either', () => {
    const book = new DesignBook('t');
    const p = book.addScope('p');
    expect(mostVivid(p)).toEqual(mostVivid(ref('p')));
  });

  it('refuses an object that only looks like a scope, instead of dropping its filter', () => {
    const book = new DesignBook('t');
    const p = book.addScope('p');
    p.set('a', color('#ff0000'));
    p.set('b', color('#0000ff'));
    const view = { name: 'p', getAllKeys: () => ['a'], resolve: (k: string) => p.resolve(k) };
    expect(() => mostVivid(view as never)).toThrow(FunctionError);
    expect(() => mostVivid(view as never)).toThrow(/pass ref\('scope'\) or a scope of the book/);
  });
});

describe('inspect reports the member a selector picked', () => {
  function book() {
    const b = new DesignBook('t');
    const p = b.addScope('p');
    // Two members with the same value: only the pick tells them apart.
    p.set('first', color('#808080'));
    p.set('twin', color('#808080'));
    p.set('ink', color('#000000'));
    return { b, p, ui: b.addScope('ui') };
  }

  it('by key, even when another member has the same value', () => {
    const { b, ui } = book();
    ui.set('x', nth(ref('p'), 1));
    expect(b.inspect('ui.x')).toMatchObject({ value: '#808080', picked: 'p.twin' });
  });

  it('through a reference to the selector', () => {
    const { b, ui } = book();
    ui.set('x', nth(ref('p'), 1));
    ui.set('y', ref('ui.x'));
    expect(b.inspect('ui.y')?.picked).toBe('p.twin');
  });

  it('not when the value is computed from the pick, nor for a plain value', () => {
    const { b, ui } = book();
    ui.set('x', lighten(nth(ref('p'), 1), { amount: 0.2 }));
    ui.set('plain', color('#123456'));
    expect(b.inspect('ui.x')?.picked).toBeUndefined();
    expect(b.inspect('ui.plain')?.picked).toBeUndefined();
  });

  it('follows the pick when the pool changes', () => {
    const { b, p, ui } = book();
    ui.set('x', bestContrastWith(color('#ffffff'), ref('p')));
    expect(b.inspect('ui.x')?.picked).toBe('p.ink');
    p.set('ink', color('#eeeeee'));
    expect(b.inspect('ui.x')?.picked).toBe('p.first');
  });
});
