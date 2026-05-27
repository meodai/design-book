import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { color, px, ref } from '../../../src/tokens';
import { nth } from '../../../src/functions/generic/nth';
import { FunctionError } from '../../../src/errors';

describe('nth', () => {
  function makeColorScope() {
    const book = new DesignBook('test');
    const ramp = book.addScope('ramp');
    ramp.set('c0', color('#000000'));
    ramp.set('c1', color('#333333'));
    ramp.set('c2', color('#666666'));
    ramp.set('c3', color('#999999'));
    ramp.set('c4', color('#cccccc'));
    return { book, ramp };
  }

  // --- Integer mode ---

  it('picks the first item with index 0', () => {
    const { book, ramp } = makeColorScope();
    const ui = book.addScope('ui');
    ui.set('first', nth(ramp, 0));
    expect(book.resolve('ui.first')).toBe('#000000');
  });

  it('picks the last item with the last index', () => {
    const { book, ramp } = makeColorScope();
    const ui = book.addScope('ui');
    ui.set('last', nth(ramp, 4));
    expect(book.resolve('ui.last')).toBe('#cccccc');
  });

  it('picks a middle item', () => {
    const { book, ramp } = makeColorScope();
    const ui = book.addScope('ui');
    ui.set('mid', nth(ramp, 2));
    expect(book.resolve('ui.mid')).toBe('#666666');
  });

  // --- Negative integer mode (like Array.at) ---

  it('picks the last item with index -1', () => {
    const { book, ramp } = makeColorScope();
    const ui = book.addScope('ui');
    ui.set('last', nth(ramp, -1));
    expect(book.resolve('ui.last')).toBe('#cccccc');
  });

  it('picks the second-to-last item with index -2', () => {
    const { book, ramp } = makeColorScope();
    const ui = book.addScope('ui');
    ui.set('penultimate', nth(ramp, -2));
    expect(book.resolve('ui.penultimate')).toBe('#999999');
  });

  it('picks the first item with negative index equal to length', () => {
    const { book, ramp } = makeColorScope();
    const ui = book.addScope('ui');
    ui.set('first', nth(ramp, -5));
    expect(book.resolve('ui.first')).toBe('#000000');
  });

  // --- Float mode (relative position) ---

  it('picks the first item with index 0.0', () => {
    const { book, ramp } = makeColorScope();
    const ui = book.addScope('ui');
    ui.set('first', nth(ramp, 0.0));
    // 0.0 is both integer 0 and float 0.0 — should resolve to first
    expect(book.resolve('ui.first')).toBe('#000000');
  });

  it('picks the last item with index 1.0', () => {
    const { book, ramp } = makeColorScope();
    const ui = book.addScope('ui');
    ui.set('last', nth(ramp, 1.0));
    // 1.0 is integer — treated as index 1
    expect(book.resolve('ui.last')).toBe('#333333');
  });

  it('picks the middle item with index 0.5', () => {
    const { book, ramp } = makeColorScope();
    const ui = book.addScope('ui');
    ui.set('mid', nth(ramp, 0.5));
    expect(book.resolve('ui.mid')).toBe('#666666');
  });

  it('picks near the end with index 0.75', () => {
    const { book, ramp } = makeColorScope();
    const ui = book.addScope('ui');
    ui.set('q3', nth(ramp, 0.75));
    // 0.75 * 4 = 3 → index 3
    expect(book.resolve('ui.q3')).toBe('#999999');
  });

  it('picks near the start with index 0.25', () => {
    const { book, ramp } = makeColorScope();
    const ui = book.addScope('ui');
    ui.set('q1', nth(ramp, 0.25));
    // 0.25 * 4 = 1 → index 1
    expect(book.resolve('ui.q1')).toBe('#333333');
  });

  it('clamps float above 1.0 to the last item', () => {
    const { book, ramp } = makeColorScope();
    const ui = book.addScope('ui');
    ui.set('clamped', nth(ramp, 0.99));
    expect(book.resolve('ui.clamped')).toBe('#cccccc');
  });

  it('clamps negative float to the first item', () => {
    const { book, ramp } = makeColorScope();
    const ui = book.addScope('ui');
    ui.set('clamped', nth(ramp, -0.5));
    // -0.5 is not an integer, treated as float → clamped to 0
    expect(book.resolve('ui.clamped')).toBe('#000000');
  });

  // --- Error cases ---

  it('throws when integer index is out of bounds (positive)', () => {
    const { book, ramp } = makeColorScope();
    const ui = book.addScope('ui');
    ui.set('oob', nth(ramp, 10));
    expect(() => book.resolve('ui.oob')).toThrow(FunctionError);
    expect(() => book.resolve('ui.oob')).toThrow(/out of bounds/);
  });

  it('throws when negative integer index is out of bounds', () => {
    const { book, ramp } = makeColorScope();
    const ui = book.addScope('ui');
    ui.set('oob', nth(ramp, -6));
    expect(() => book.resolve('ui.oob')).toThrow(FunctionError);
    expect(() => book.resolve('ui.oob')).toThrow(/out of bounds/);
  });

  it('throws when scope has no candidates', () => {
    const book = new DesignBook('test');
    const empty = book.addScope('empty');
    const ui = book.addScope('ui');
    ui.set('bad', nth(empty, 0));
    expect(() => book.resolve('ui.bad')).toThrow(FunctionError);
    expect(() => book.resolve('ui.bad')).toThrow(/no candidates/);
  });

  // --- not option ---

  it('honors the not exclusion list', () => {
    const { book, ramp } = makeColorScope();
    const ui = book.addScope('ui');
    // Exclude c0, so index 0 should now be c1
    ui.set('first', nth(ramp, 0, { not: ['ramp.c0'] }));
    expect(book.resolve('ui.first')).toBe('#333333');
  });

  it('works with ref() in not option', () => {
    const { book, ramp } = makeColorScope();
    const ui = book.addScope('ui');
    ui.set('first', nth(ramp, 0, { not: [ref('ramp.c0')] }));
    expect(book.resolve('ui.first')).toBe('#333333');
  });

  // --- Works with non-color tokens ---

  it('works with dimensional tokens', () => {
    const book = new DesignBook('test');
    const scale = book.addScope('scale');
    scale.set('xs', px(4));
    scale.set('s', px(8));
    scale.set('m', px(16));
    scale.set('l', px(32));

    const ui = book.addScope('ui');
    ui.set('small', nth(scale, 0));
    ui.set('large', nth(scale, -1));

    expect(book.resolve('ui.small')).toBe('4px');
    expect(book.resolve('ui.large')).toBe('32px');
  });

  // --- Reactivity ---

  it('reacts to scope changes', () => {
    const book = new DesignBook('test');
    const ramp = book.addScope('ramp');
    ramp.set('a', color('#111111'));
    ramp.set('b', color('#222222'));
    ramp.set('c', color('#333333'));

    const ui = book.addScope('ui');
    ui.set('pick', nth(ramp, -1));

    expect(book.resolve('ui.pick')).toBe('#333333');

    ramp.set('c', color('#ffffff'));
    expect(book.resolve('ui.pick')).toBe('#ffffff');
  });
});
