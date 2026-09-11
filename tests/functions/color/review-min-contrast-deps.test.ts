import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { color, ref } from '../../../src/tokens';
import { minContrastWith } from '../../../src/functions/color/min-contrast';
import { colorMix } from '../../../src/functions/color/color-mix';

describe('minContrastWith dependencies', () => {
  it('does not declare same-scope `not` keys as dependencies', () => {
    const book = new DesignBook('test');
    const s = book.addScope('s');
    s.set('white', color('#ffffff'));
    s.set('black', color('#000000'));
    // `not: ['s.accent']` only narrows the pool this selector iterates; it is
    // not a value this selector reads, so it must not become a graph edge.
    s.set('text', minContrastWith(ref('s.white'), s, { not: ['s.accent'] }));

    expect(() =>
      s.set('accent', colorMix(ref('s.text'), ref('s.white')))
    ).not.toThrow();
  });

  it('still declares cross-scope `not` keys as dependencies', () => {
    const book = new DesignBook('test');
    const other = book.addScope('other');
    other.set('avoid', color('#000000'));

    const s = book.addScope('s');
    s.set('white', color('#ffffff'));

    // A cross-scope exclusion is value-based (the candidate whose hex matches
    // it is dropped), so it stays a real dependency.
    const token = minContrastWith(ref('s.white'), s, {
      not: [ref('other.avoid'), 's.accent'],
    });

    expect(token.metadata?.dependencies).toContain('other.avoid');
    expect(token.metadata?.dependencies).not.toContain('s.accent');
  });
});
