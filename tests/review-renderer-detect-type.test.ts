import { describe, it, expect } from 'vitest';
import { detectValueType } from '../src/scope';
import { DesignBook } from '../src/design-book';
import { px, ref, string } from '../src/tokens';
import { nth } from '../src/functions';
import { Renderer } from '../src/renderers/renderer';

// One shared rule for "what type is this resolved value", used by both
// Scope (ordering of refs / untyped functions) and the W3 renderer.
describe('detectValueType', () => {
  it.each([
    ['#0066cc', 'color'],
    ['red', 'color'],
    ['oklch(0.6 0.1 250)', 'color'],
    ['16px', 'dimension'],
    ['-0.02em', 'dimension'],
    ['.5rem', 'dimension'],
    ['50%', 'dimension'],
    ['200ms', 'dimension'],
    // A unitless number is a dimension with an empty unit, the same as
    // `dimension(1.5, '')`; W3 output turns it into a `number`.
    ['1.5', 'dimension'],
    ['10', 'dimension'],
    // Only a single number-with-unit is a dimension.
    ['16px solid', 'string'],
    ['1px 2px', 'string'],
    ['Inter', 'string'],
    ['', 'string'],
  ])('%j -> %s', (value, type) => {
    expect(detectValueType(value)).toBe(type);
  });
});

describe('Scope and the W3 renderer agree on detected types', () => {
  it('types a reference to a border shorthand as a string when ordering by type', () => {
    const book = new DesignBook('t');
    const src = book.addScope('src');
    src.set('border', string('16px solid'));
    src.set('gap', px(4));
    const ui = book.addScope('ui');
    ui.set('a', ref('src.border'));
    ui.set('b', ref('src.gap'));
    ui.setOrder([{ by: 'type', priority: ['dimension', 'string'] }]);
    // `16px solid` used to be detected as a dimension by Scope and grouped
    // with `4px`; it is a string and sorts after the dimension group.
    expect(ui.getAllKeys()).toEqual(['b', 'a']);
  });

  it('types an untyped function resolving to a unitless number as W3 number', () => {
    const book = new DesignBook('t');
    const src = book.addScope('src');
    src.set('ratio', string('1.5'));
    book.addScope('ui').set('pick', nth(src, 0));
    const out = new Renderer(book, 'w3-design-tokens').renderW3DesignTokensObject() as any;
    expect(out.ui.pick).toEqual({ $value: 1.5, $type: 'number' });
  });
});
