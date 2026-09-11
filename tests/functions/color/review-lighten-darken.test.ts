import { describe, it, expect } from 'vitest';
import { parse, formatHex, interpolate, toGamut } from 'culori';
import { lightenImpl } from '../../../src/functions/color/lighten';
import { darkenImpl } from '../../../src/functions/color/darken';

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
