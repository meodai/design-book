import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { color, ref, string } from '../../../src/tokens';
import { mostVivid } from '../../../src/functions/color/most-vivid';
import { leastVivid } from '../../../src/functions/color/least-vivid';
import { lightest, darkest } from '../../../src/functions/color/lightest-darkest';
import { closestColor } from '../../../src/functions/color/closest-color';
import { furthestFrom } from '../../../src/functions/color/furthest-from';
import { readableOnArgIndex } from '../../../src/functions/color/readable';

// The backdrop is stored as a trailing argument; readableOnArgIndex finds it
// from the token alone, so a serializer needs no per-selector arity table.

function setup() {
  const book = new DesignBook('test');
  const pool = book.addScope('pool');
  pool.set('navy', color('#1d4eb8'));
  return { pool };
}

describe('readableOnArgIndex', () => {
  const { pool } = setup();
  const selectors = [
    ['mostVivid', (o?: any) => mostVivid(pool, o)],
    ['leastVivid', (o?: any) => leastVivid(pool, o)],
    ['lightest', (o?: any) => lightest(pool, o)],
    ['darkest', (o?: any) => darkest(pool, o)],
    ['furthestFrom', (o?: any) => furthestFrom(pool, o)],
    ['closestColor', (o?: any) => closestColor(color('#ff0000'), pool, o)],
  ] as const;

  it.each(selectors)('%s: points at the backdrop argument', (_name, make) => {
    const backdrop = ref('ui.bg');
    const token = make({ readableOn: backdrop, minContrast: 7 });
    const index = readableOnArgIndex(token);
    expect(index).toBeGreaterThan(0);
    expect(token.args[index]).toBe(backdrop);
  });

  it.each(selectors)('%s: works for any backdrop token type', (_name, make) => {
    const backdrop = string('white');
    const token = make({ readableOn: backdrop });
    expect(token.args[readableOnArgIndex(token)]).toBe(backdrop);
  });

  it.each(selectors)('%s: is -1 without a backdrop', (_name, make) => {
    expect(readableOnArgIndex(make())).toBe(-1);
    expect(readableOnArgIndex(make({ not: ['pool.navy'] }))).toBe(-1);
  });
});
