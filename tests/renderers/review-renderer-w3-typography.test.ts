import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../src/design-book';
import { ref, rem, px, string } from '../../src/tokens';
import { typography } from '../../src/functions';
import { Renderer } from '../../src/renderers/renderer';

function w3(book: DesignBook): any {
  return new Renderer(book, 'w3-design-tokens').renderW3DesignTokensObject();
}

describe('w3 references into typography fields', () => {
  function book() {
    const b = new DesignBook('test');
    b.addScope('type').set('display', typography({
      fontFamily: string('Inter'),
      fontSize: rem(3),
      fontWeight: '700',
      lineHeight: 1.1,
    }));
    return b;
  }

  it('emits the resolved field instead of an alias W3 cannot express', () => {
    const b = book();
    b.addScope('ui').set('weight', ref('type.display.fontWeight'));
    const out = w3(b);
    expect(out.type.display.$type).toBe('typography');
    expect(out.ui.weight).toEqual({ $value: 700, $type: 'fontWeight' });
  });

  it('formats a referenced font size as a dimension and family as fontFamily', () => {
    const b = book();
    const ui = b.addScope('ui');
    ui.set('size', ref('type.display.fontSize'));
    ui.set('family', ref('type.display.fontFamily'));
    ui.set('leading', ref('type.display.lineHeight'));
    const out = w3(b);

    expect(out.ui.size).toEqual({ $value: { value: 3, unit: 'rem' }, $type: 'dimension' });
    expect(out.ui.family).toEqual({ $value: 'Inter', $type: 'fontFamily' });
    expect(out.ui.leading).toEqual({ $value: 1.1, $type: 'number' });
  });

  it('keeps aliases to ordinary tokens as aliases', () => {
    const b = book();
    b.addScope('space').set('m', px(16));
    b.addScope('ui').set('gap', ref('space.m'));
    expect(w3(b).ui.gap.$value).toBe('{space.m}');
  });

  it('allows a plain scope named "typography"', () => {
    const b = book();
    b.addScope('typography').set('base', px(16));
    expect(w3(b).typography.base.$value).toEqual({ value: 16, unit: 'px' });
  });
});
