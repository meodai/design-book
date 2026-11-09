import { describe, it, expect, beforeAll } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { color, ref } from '../../../src/tokens';
import { mostVivid, leastVivid } from '../../../src/functions/color/vividness';
import { parseTokenInput } from '../../../site/editor/editor-input-parser';
import { loadEditorModule } from '../../editor/load-editor';

function setup() {
  const book = new DesignBook('test');
  const pool = book.addScope('pool');
  pool.set('red', color('oklch(0.62 0.21 30)'));    // loud, mid lightness
  pool.set('pale', color('oklch(0.93 0.06 100)'));  // as loud as it gets that light
  pool.set('sage', color('oklch(0.6 0.04 140)'));   // muted, mid lightness
  pool.set('ink', color('oklch(0.2 0.01 260)'));    // nearly grey, dark
  return { book, ui: book.addScope('ui') };
}

describe('mostVivid / leastVivid with a lightness band', () => {
  it('compares only the members inside the band', () => {
    const { book, ui } = setup();
    ui.set('loud', mostVivid(ref('pool')));
    ui.set('loudLight', mostVivid(ref('pool'), { lightness: [0.85, 1] }));
    ui.set('quiet', leastVivid(ref('pool')));
    ui.set('quietMid', leastVivid(ref('pool'), { lightness: [0.4, 0.8] }));
    const pickOf = (key: string) => book.pickOf(key);
    expect(pickOf('ui.loud')).toBe('pool.red');
    expect(pickOf('ui.loudLight')).toBe('pool.pale');
    expect(pickOf('ui.quiet')).toBe('pool.ink');
    expect(pickOf('ui.quietMid')).toBe('pool.sage');
  });

  it('throws when nothing lies in the band, and refuses a bad band', () => {
    const { book, ui } = setup();
    ui.set('none', mostVivid(ref('pool'), { lightness: [0.3, 0.4] }));
    expect(() => book.resolve('ui.none')).toThrow(/no color of scope "pool" has a lightness between 0.3 and 0.4/);
    expect(() => mostVivid(ref('pool'), { lightness: [0.8, 0.2] as any })).toThrow(/lightness/);
    expect(() => leastVivid(ref('pool'), { lightness: [0, 2] as any })).toThrow(/lightness/);
  });

  describe('in the editor', () => {
    let getTokenDisplayValue: (scope: any, key: string) => string;
    beforeAll(async () => {
      ({ getTokenDisplayValue } = await loadEditorModule());
    });

    it('round-trips the band', () => {
      const { book, ui } = setup();
      const original = mostVivid(ref('pool'), { lightness: [0.4, 0.8] });
      ui.set('accent', original);
      const printed = getTokenDisplayValue(ui, 'accent');
      expect(printed).toContain('lightness: [0.4,0.8]');
      expect(parseTokenInput(printed, book, ui)).toEqual(original);
    });
  });
});
