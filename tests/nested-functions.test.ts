import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, ref } from '../src/tokens';
import { darken } from '../src/functions/color/darken';
import { lighten } from '../src/functions/color/lighten';
import { shade } from '../src/functions/color/shade';
import { colorMix } from '../src/functions/color/color-mix';
import { spacingScale } from '../src/functions/non-color/spacing-scale';

describe('nested function tokens', () => {
  it('resolves a function token nested as an arg of another function token', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('base', color('#0066cc'));

    const ui = book.addScope('ui');
    // Compare to building the same colour via an intermediate token.
    ui.set('inlined', darken(lighten(ref('palette.base'), { amount: 0.10 }), { amount: 0.20 }));

    ui.set('lighter', lighten(ref('palette.base'), { amount: 0.10 }));
    ui.set('viaIntermediate', darken(ref('ui.lighter'), { amount: 0.20 }));

    expect(book.resolve('ui.inlined')).toBe(book.resolve('ui.viaIntermediate'));
  });

  it('matches the article pattern: colorMix(shade(...), ...)', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('surface',     color('#fafafa'));
    palette.set('interaction', color('#1d4eb8'));

    const colorScope = book.addScope('color');
    // The article previously needed an intermediate `color.surfaceDim` token;
    // with nesting it can be inline.
    colorScope.set('ramp100', colorMix(
      shade(ref('palette.surface'), { amount: 0.10 }),
      ref('palette.interaction'),
      { ratio: 0.05 },
    ));

    // Manual reference path using an intermediate token.
    colorScope.set('surfaceDim', shade(ref('palette.surface'), { amount: 0.10 }));
    colorScope.set('ramp100Ref',  colorMix(
      ref('color.surfaceDim'),
      ref('palette.interaction'),
      { ratio: 0.05 },
    ));

    expect(book.resolve('color.ramp100')).toBe(book.resolve('color.ramp100Ref'));
  });

  it('propagates changes through nested function-token deps', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('base', color('#fafafa'));

    const colorScope = book.addScope('color');
    colorScope.set('out', darken(shade(ref('palette.base'), { amount: 0.10 }), { amount: 0.05 }));

    const first = book.resolve('color.out');

    // Change the underlying source — the nested function chain must re-fire.
    palette.set('base', color('#1a1a1a'));
    const second = book.resolve('color.out');

    expect(second).not.toBe(first);
  });

  it('graph getDependentsOf includes function tokens whose nested args reference the changed key', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('base', color('#fafafa'));

    const colorScope = book.addScope('color');
    colorScope.set('out', darken(shade(ref('palette.base'), { amount: 0.10 }), { amount: 0.05 }));

    const dependents = book.getDependencyGraph().getDependentsOf('palette.base');
    expect(dependents).toContain('color.out');
  });

  it('works for dimension chains too', () => {
    const book = new DesignBook('test');
    const space = book.addScope('space');
    // base (8) → scale 2x (16) → scale 1.5x (24)
    space.set('base',       { type: 'dimension', rawValue: 8, metadata: { unit: 'px' } } as any);
    space.set('compoundXL', spacingScale(
      spacingScale(ref('space.base'), { multiplier: 2 }),
      { multiplier: 1.5 },
    ));

    expect(book.resolve('space.compoundXL')).toBe('24px');
  });
});
