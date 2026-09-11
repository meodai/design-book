import { describe, it, expect } from 'vitest';
import { parse, formatHex, interpolate, toGamut } from 'culori';
import { lightenImpl } from '../../../src/functions/color/lighten';
import { darkenImpl } from '../../../src/functions/color/darken';
import { shadeImpl } from '../../../src/functions/color/shade';

const toRgbGamut = toGamut('rgb', 'oklch');

/** What `color-mix(in oklch, <color> (1-amount)*100%, <towards>)` computes. */
function cssColorMix(colorValue: string, towards: 'white' | 'black', amount: number): string {
  return formatHex(toRgbGamut(interpolate([parse(colorValue)!, towards], 'oklch')(amount)));
}

describe('lighten / darken match the CSS renderer', () => {
  it('lighten mixes towards white in OKLCH', () => {
    expect(lightenImpl('#0066cc', 0.1)).toBe(cssColorMix('#0066cc', 'white', 0.1));
  });

  it('darken mixes towards black in OKLCH', () => {
    expect(darkenImpl('#0066cc', 0.1)).toBe(cssColorMix('#0066cc', 'black', 0.1));
  });

  it('gamut-maps a saturated result instead of clipping channels', () => {
    // Mixing pure green towards white leaves OKLCH chroma outside sRGB.
    // Formatting the raw mix clips the channels; gamut mapping reduces
    // chroma instead and lands on a different colour.
    const raw = interpolate([parse('#00ff00')!, 'white'], 'oklch')(0.05);
    const clipped = formatHex(raw);
    const mapped = formatHex(toRgbGamut(raw));

    expect(mapped).not.toBe(clipped); // guards the premise of this test
    expect(lightenImpl('#00ff00', 0.05)).toBe(mapped);
  });

  it('gamut-maps a saturated darken result too', () => {
    const raw = interpolate([parse('#00ffff')!, 'black'], 'oklch')(0.2);
    const clipped = formatHex(raw);
    const mapped = formatHex(toRgbGamut(raw));

    expect(mapped).not.toBe(clipped);
    expect(darkenImpl('#00ffff', 0.2)).toBe(mapped);
  });
});

describe('lighten / darken / shade keep alpha', () => {
  it('lighten reports the alpha CSS color-mix would produce', () => {
    // 90% of a half-transparent blue mixed with opaque white: the browser
    // ends up at alpha 0.55, and so must we.
    expect(lightenImpl('#0066cc80', 0.1)).toBe('#4283d88d');
  });

  it('darken reports the alpha CSS color-mix would produce', () => {
    expect(darkenImpl('#0066cc80', 0.1)).toBe('#004c9c8d');
  });

  it('shade carries the input alpha through untouched', () => {
    expect(shadeImpl('#0066cc80', 0.1)).toBe('#0047aa80');
  });

  it('leaves an opaque colour six digits long', () => {
    expect(lightenImpl('#0066cc', 0.1)).toMatch(/^#[0-9a-f]{6}$/);
    expect(darkenImpl('#0066cc', 0.1)).toMatch(/^#[0-9a-f]{6}$/);
    expect(shadeImpl('#0066cc', 0.1)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('mixes a translucent colour with premultiplied alpha', () => {
    // A fully transparent colour must not drag the hue anywhere: lightening
    // it is pure white at the mixed alpha.
    expect(lightenImpl('#ff000000', 0.5)).toBe('#ffffff80');
  });
});
