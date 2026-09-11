import { beforeAll, describe, expect, it } from 'vitest';
import { DesignBook, dimension, px, rem, spacingScale } from '../../src/index';
import { parseTokenInput } from '../../editor/editor-input-parser';
import { loadEditorModule } from './load-editor';

// Item 5: only px/rem/ms dimensions parsed. Non-shortcut units (em, ch,
// vh, ...) round tripped to garbage: the serializer always rendered
// `${unit}(${value})` even for non-shortcut units, and the parser had no
// path for that shape at all (dimension(n, 'unit') worked only inside
// function args, and only px/rem/ms parsed as a top-level value or a
// nested arg). Non-shortcut units should serialize as the explicit
// dimension(n, 'unit') form; both that form and the generic <unit>(n)
// shorthand should parse. The numeric regexes should also allow a sign.

describe('dimension units round-trip', () => {
  let getTokenDisplayValue: (scope: any, tokenName: string) => string;
  let book: DesignBook;

  beforeAll(async () => {
    const mod = await loadEditorModule();
    getTokenDisplayValue = mod.getTokenDisplayValue;
    book = new DesignBook('test-05');
  });

  it('round-trips a top-level non-shortcut dimension via dimension(n, \'unit\')', () => {
    const scope = book.addScope('type-05');
    const original = dimension(2, 'em');
    scope.set('leading', original);

    const serialized = getTokenDisplayValue(scope, 'leading');
    expect(serialized).toBe("dimension(2, 'em')");

    const parsed = parseTokenInput(serialized, book, scope);
    expect(parsed).toEqual(original);
  });

  it('still serializes px/rem/ms with their shortcuts', () => {
    const scope = book.addScope('space-05');
    scope.set('gap', px(16));
    expect(getTokenDisplayValue(scope, 'gap')).toBe('px(16)');
  });

  it('round-trips a non-shortcut dimension nested inside a function arg', () => {
    const type = book.getScope('type-05')!;
    const original = spacingScale(dimension(4, 'ch'), { multiplier: 2 });
    type.set('scaled', original);

    const serialized = getTokenDisplayValue(type, 'scaled');
    expect(serialized).toContain("dimension(4, 'ch')");

    const parsed = parseTokenInput(serialized, book, type);
    expect(parsed).toEqual(original);
  });

  it('accepts the generic <unit>(n) shorthand for hand-written input', () => {
    const parsed = parseTokenInput('em(2)');
    expect(parsed).toEqual(dimension(2, 'em'));
  });

  it('allows a sign in dimension numeric input', () => {
    expect(parseTokenInput('rem(-1.5)')).toEqual(rem(-1.5));
    expect(parseTokenInput("dimension(-3, 'ch')")).toEqual(dimension(-3, 'ch'));
  });
});
