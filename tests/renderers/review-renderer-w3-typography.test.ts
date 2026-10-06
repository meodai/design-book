import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../src/design-book';
import { ref, rem, px } from '../../src/tokens';
import { Renderer } from '../../src/renderers/renderer';

function w3(book: DesignBook): any {
  return new Renderer(book, 'w3-design-tokens').renderW3DesignTokensObject();
}

describe('w3 references into typography-composed scopes', () => {
  function book() {
    const b = new DesignBook('test');
    b.addTypography('display', {
      fontFamily: 'Inter',
      fontSize: rem(3),
      fontWeight: '700',
      lineHeight: '1.1',
    });
    return b;
  }

  it('emits the resolved value instead of an alias to a token that is never emitted', () => {
    const b = book();
    b.addScope('ui').set('weight', ref('display.fontWeight'));
    const out = w3(b);

    // Only the composite exists — `display.fontWeight` is not a W3 token.
    expect(out.display).toBeUndefined();
    expect(out.typography.display.$type).toBe('typography');

    expect(out.ui.weight.$value).toBe(700);
    expect(out.ui.weight.$type).toBe('fontWeight');
  });

  it('formats a referenced font size as a dimension and family as fontFamily', () => {
    const b = book();
    const ui = b.addScope('ui');
    ui.set('size', ref('display.fontSize'));
    ui.set('family', ref('display.fontFamily'));
    ui.set('leading', ref('display.lineHeight'));
    const out = w3(b);

    expect(out.ui.size).toEqual({ $value: { value: 3, unit: 'rem' }, $type: 'dimension' });
    expect(out.ui.family).toEqual({ $value: 'Inter', $type: 'fontFamily' });
    expect(out.ui.leading).toEqual({ $value: 1.1, $type: 'number' });
  });

  it('keeps aliases to ordinary scopes as aliases', () => {
    const b = book();
    b.addScope('space').set('m', px(16));
    b.addScope('ui').set('gap', ref('space.m'));
    expect(w3(b).ui.gap.$value).toBe('{space.m}');
  });
});

describe('w3 typography group name clash', () => {
  it('throws when a plain scope named "typography" would be overwritten by the composites', () => {
    const b = new DesignBook('test');
    b.addScope('typography').set('base', px(16));
    b.addTypography('display', { fontFamily: 'Inter' });
    expect(() => w3(b)).toThrow(/typography/);
  });

  it('throws regardless of scope order', () => {
    const b = new DesignBook('test');
    b.addTypography('display', { fontFamily: 'Inter' });
    b.addScope('typography').set('base', px(16));
    expect(() => w3(b)).toThrow(/typography/);
  });

  it('allows a plain "typography" scope when nothing is composed as typography', () => {
    const b = new DesignBook('test');
    b.addScope('typography').set('base', px(16));
    expect(w3(b).typography.base.$value).toEqual({ value: 16, unit: 'px' });
  });
});
