import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { closestImpl } from '../../../src/functions/generic/closest';
import { furthestFromImpl } from '../../../src/functions/generic/furthest-from';
import { color } from '../../../src/tokens';

function pool(entries: Record<string, string>) {
  const book = new DesignBook('test');
  const s = book.addScope('s');
  for (const [k, v] of Object.entries(entries)) s.set(k, color(v));
  return s;
}

describe('closest and translucent candidates', () => {
  it('does not read a 5% black hairline as opaque black', () => {
    const s = pool({ hair: '#0000000d', grey: '#333333' });
    expect(s.resolveKey(closestImpl('#000000', s, { not: [] }).picked)).toBe('#333333');
  });

  it('matches a translucent target to the same translucent candidate', () => {
    const s = pool({ grey: '#333333', hair: '#0000000d' });
    expect(s.resolveKey(closestImpl('#0000000d', s, { not: [] }).picked)).toBe('#0000000d');
  });

  it('judges candidates as they look on the readableOn backdrop', () => {
    // On white, 50% black reads as #808080 — far closer to a mid grey than
    // the opaque near-black is.
    const s = pool({ ink: '#1a1a1a', half: '#00000080' });
    expect(s.resolveKey(closestImpl('#7f7f7f', s, { not: [], readableOn: '#ffffff', readableContrast: 1 }).picked)).toBe('#00000080');
  });

  it('leaves opaque pools unchanged', () => {
    const s = pool({ red: '#ff0000', blue: '#0000ff' });
    expect(s.resolveKey(closestImpl('#ee1111', s, { not: [] }).picked)).toBe('#ff0000');
  });
});

describe('furthestFrom and translucent candidates', () => {
  it('judges a translucent candidate composited over the readableOn backdrop', () => {
    // Opaque, the hairline is pure black and the furthest from white; on
    // white it reads as #f2f2f2, and the blue is then the furthest.
    const s = pool({
      hair: '#0000000d',
      pink: '#ffdddd',
      blue: '#0000ff',
    });
    expect(s.resolveKey(furthestFromImpl('#ffffff', s, { not: [] }).picked)).toBe('#0000000d');
    expect(s.resolveKey(furthestFromImpl('#ffffff', s, { not: [], readableOn: '#ffffff', readableContrast: 1 }).picked)).toBe('#0000ff');
  });
});
