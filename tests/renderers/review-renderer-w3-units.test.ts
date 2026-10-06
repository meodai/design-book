import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../src/design-book';
import { dimension, px, rem, ms, ref } from '../../src/tokens';
import { Renderer } from '../../src/renderers/renderer';

function w3(book: DesignBook): any {
  return new Renderer(book, 'w3-design-tokens').renderW3DesignTokensObject();
}

// The W3 `dimension` type only allows `px` and `rem`. Other CSS units have
// no W3 type, so — like a plain string — they get no `$type` and keep
// their CSS text as `$value`.
describe('w3 dimension units', () => {
  it('keeps px and rem as structured dimensions', () => {
    const book = new DesignBook('t');
    const s = book.addScope('s');
    s.set('a', px(4));
    s.set('b', rem(1.5));
    const out = w3(book);
    expect(out.s.a).toEqual({ $value: { value: 4, unit: 'px' }, $type: 'dimension' });
    expect(out.s.b).toEqual({ $value: { value: 1.5, unit: 'rem' }, $type: 'dimension' });
  });

  it.each([
    ['0.5em', dimension(0.5, 'em')],
    ['50%', dimension(50, '%')],
    ['100vw', dimension(100, 'vw')],
  ])('emits %s without a dimension $type', (css, token) => {
    const book = new DesignBook('t');
    book.addScope('s').set('x', token);
    const out = w3(book);
    expect(out.s.x).toEqual({ $value: css });
  });

  it('applies the same rule to references and still types durations', () => {
    const book = new DesignBook('t');
    const s = book.addScope('s');
    s.set('em', dimension(2, 'em'));
    s.set('fast', ms(100));
    const ui = book.addScope('ui');
    ui.set('pad', ref('s.em'));
    const out = w3(book);
    expect(out.ui.pad).toEqual({ $value: '{s.em}' });
    expect(out.s.fast.$type).toBe('duration');
  });

  it('keeps em letter-spacing inside a typography composite as a string', () => {
    const book = new DesignBook('t');
    book.addTypography('body', { fontSize: rem(1), letterSpacing: '-0.02em' });
    const out = w3(book);
    expect(out.typography.body.$value).toEqual({
      fontSize: { value: 1, unit: 'rem' },
      letterSpacing: '-0.02em',
    });
  });
});
