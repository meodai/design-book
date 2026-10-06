import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { color, createFunctionToken, ref } from '../../../src/tokens';
import type { Scope } from '../../../src/scope';
import { mostVivid } from '../../../src/functions/color/most-vivid';
import { leastVivid } from '../../../src/functions/color/least-vivid';
import { lightest, darkest } from '../../../src/functions/color/lightest-darkest';
import { closestColor } from '../../../src/functions/color/closest-color';
import { furthestFrom } from '../../../src/functions/color/furthest-from';
import { FunctionError } from '../../../src/errors';

// `readableOn` + `minContrast` filter a color selector's candidate pool
// down to the members that reach the ratio against a backdrop, the same way
// `not` filters it by key. The selector then ranks only what is left.

function setup() {
  const book = new DesignBook('test');
  const pool = book.addScope('pool');
  pool.set('yellow', color('#ffff00')); // most vivid, ~1.07:1 on white
  pool.set('navy',   color('#1d4eb8')); // ~8.1:1 on white
  pool.set('gray',   color('#767676')); // ~4.54:1 on white
  pool.set('pale',   color('#eeeeee')); // ~1.16:1 on white
  const ui = book.addScope('ui');
  ui.set('bg', color('#ffffff'));
  ui.set('ink', color('#000000'));
  return { book, pool, ui };
}

describe('readableOn', () => {
  it('drops candidates below the ratio before mostVivid ranks', () => {
    const { book, pool, ui } = setup();
    ui.set('plain',  mostVivid(pool));
    ui.set('accent', mostVivid(pool, { readableOn: ref('ui.bg'), minContrast: 4.5 }));

    expect(book.resolve('ui.plain')).toBe('#ffff00');
    expect(book.resolve('ui.accent')).toBe('#1d4eb8');
  });

  it('defaults minContrast to 4.5', () => {
    const { book, pool, ui } = setup();
    // gray (4.54:1) just clears the default; navy (7.4:1) is more vivid.
    ui.set('loose', mostVivid(pool, { readableOn: ref('ui.bg') }));
    ui.set('tight', leastVivid(pool, { readableOn: ref('ui.bg'), minContrast: 5 }));
    expect(book.resolve('ui.loose')).toBe('#1d4eb8');
    expect(book.resolve('ui.tight')).toBe('#1d4eb8'); // gray is out at 5:1
  });

  it('re-picks when the backdrop changes', () => {
    const { book, pool, ui } = setup();
    ui.set('fg', lightest(pool, { readableOn: ref('ui.bg') }));
    expect(book.resolve('ui.fg')).toBe('#767676'); // lightest that reads on white

    ui.set('bg', color('#000000'));
    expect(book.resolve('ui.fg')).toBe('#ffff00'); // on black, yellow reads and is lightest
  });

  it.each<[string, (pool: Scope) => ReturnType<typeof mostVivid>, string]>([
    ['lightest',     (p) => lightest(p, { readableOn: ref('ui.bg'), minContrast: 7 }), '#1d4eb8'],
    ['darkest',      (p) => darkest(p, { readableOn: ref('ui.ink') }), '#767676'],
    ['closestColor', (p) => closestColor(color('#ffff66'), p, { readableOn: ref('ui.bg') }), '#767676'],
    ['furthestFrom', (p) => furthestFrom(p, { readableOn: ref('ui.ink') }), '#767676'],
  ])('applies to %s', (_name, make, expected) => {
    const { book, pool, ui } = setup();
    ui.set('pick', make(pool));
    expect(book.resolve('ui.pick')).toBe(expected);
  });

  it('judges a translucent candidate composited over the backdrop', () => {
    const { book, ui } = setup();
    const p = book.addScope('ghosts');
    // Opaque, this blue clears 4.5:1 on white; at 20% alpha it does not.
    p.set('ghost', color('rgba(0, 0, 255, 0.2)'));
    p.set('green', color('#006600'));
    ui.set('accent', mostVivid(p, { readableOn: ref('ui.bg') }));
    expect(book.resolve('ui.accent')).toBe('#006600');
  });

  it('throws when nothing in the pool is readable', () => {
    const { book, pool, ui } = setup();
    expect(() => {
      ui.set('x', mostVivid(pool, { readableOn: ref('ui.bg'), minContrast: 12 }));
      book.resolve('ui.x');
    }).toThrow(/no candidate reaches 12:1/);
  });

  it('throws when the backdrop does not parse', () => {
    const { book, pool, ui } = setup();
    const tok = createFunctionToken('mostVivid', [pool, 'not-a-color'], { options: { minContrast: 4.5, not: [] } });
    expect(() => {
      ui.set('x', tok);
      book.resolve('ui.x');
    }).toThrow(/cannot parse `readableOn`/);
  });

  it('rejects minContrast without readableOn at construction', () => {
    const { pool } = setup();
    expect(() => mostVivid(pool, { minContrast: 4.5 })).toThrow(FunctionError);
    expect(() => lightest(pool, { minContrast: 4.5 })).toThrow(/needs `readableOn`/);
  });

  it('rejects a non-positive minContrast', () => {
    const { pool } = setup();
    expect(() => mostVivid(pool, { readableOn: ref('ui.bg'), minContrast: 0 })).toThrow(/minContrast/);
  });

  it('points the old `against` option at its new name', () => {
    const { pool } = setup();
    expect(() => mostVivid(pool, { against: ref('ui.bg') } as any)).toThrow(/readableOn/);
  });

  it('still resolves a token saved in the old against + minContrast shape', () => {
    const { book, pool, ui } = setup();
    const legacy = createFunctionToken('mostVivid', [pool, ref('ui.bg')], {
      options: { minContrast: 4.5, not: [] },
    });
    ui.set('accent', legacy);
    expect(book.resolve('ui.accent')).toBe('#1d4eb8');
  });

  it('ignores a stored minContrast of 0 with no backdrop (old default)', () => {
    const { book, pool, ui } = setup();
    const legacy = createFunctionToken('mostVivid', [pool], { options: { minContrast: 0, not: [] } });
    ui.set('accent', legacy);
    expect(book.resolve('ui.accent')).toBe('#ffff00');
  });
});
