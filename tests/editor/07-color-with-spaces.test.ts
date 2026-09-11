import { beforeAll, describe, expect, it } from 'vitest';
import { DesignBook, color, colorMix } from '../../src/index';
import { parseTokenInput } from '../../editor/editor-input-parser';
import { loadEditorModule } from './load-editor';

// Item 7: color() nested inside a function arg used a regex
// (`[^'")\s]+`) that rejected any color value containing spaces, commas or
// parens — so color('rgb(0, 0, 0)') or color('hsl(200 50% 50%)') as a
// function argument failed to parse. `^color\(\s*(['"])(.*)\1\s*\)$` should
// be tried first, matching everything between a pair of matching quotes.

describe('color() with spaces/parens as a function argument', () => {
  let getTokenDisplayValue: (scope: any, tokenName: string) => string;
  let book: DesignBook;

  beforeAll(async () => {
    const mod = await loadEditorModule();
    getTokenDisplayValue = mod.getTokenDisplayValue;
    book = new DesignBook('test-07');
  });

  it('round-trips a colorMix argument written as rgb(...)', () => {
    const scope = book.addScope('brand-07');
    const original = colorMix(color('rgb(0, 0, 0)'), color('hsl(200 50% 50%)'), { ratio: 0.5 });
    scope.set('mixed', original);

    const serialized = getTokenDisplayValue(scope, 'mixed');
    expect(serialized).toContain('rgb(0, 0, 0)');

    const parsed = parseTokenInput(serialized, book, scope);
    expect(parsed).toEqual(original);
  });
});
