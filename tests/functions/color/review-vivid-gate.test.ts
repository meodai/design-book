import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { color } from '../../../src/tokens';
import { mostVivid, mostVividImpl } from '../../../src/functions/color/most-vivid';
import { leastVivid, leastVividImpl } from '../../../src/functions/color/least-vivid';
import { FunctionError } from '../../../src/errors';

function pool() {
  const book = new DesignBook('test');
  const scope = book.addScope('pool');
  scope.set('brand', color('#0066cc'));
  scope.set('grey', color('#767676'));
  return { book, scope };
}

describe('mostVivid / leastVivid contrast gate', () => {
  it('mostVivid throws when `against` cannot be parsed', () => {
    const { scope } = pool();
    expect(() => mostVividImpl(scope, 'not-a-colour', 4.5)).toThrow(FunctionError);
  });

  it('leastVivid throws when `against` cannot be parsed', () => {
    const { scope } = pool();
    expect(() => leastVividImpl(scope, 'not-a-colour', 4.5)).toThrow(FunctionError);
  });

  it('mostVivid throws when minContrast is set without a target', () => {
    const { book, scope } = pool();
    const ui = book.addScope('ui');
    ui.set('accent', mostVivid(scope, { minContrast: 4.5 }));

    expect(() => book.resolve('ui.accent')).toThrow(/minContrast/);
  });

  it('leastVivid throws when minContrast is set without a target', () => {
    const { book, scope } = pool();
    const ui = book.addScope('ui');
    ui.set('muted', leastVivid(scope, { minContrast: 4.5 }));

    expect(() => book.resolve('ui.muted')).toThrow(/minContrast/);
  });

  it('still works with no gate at all', () => {
    const { book, scope } = pool();
    const ui = book.addScope('ui');
    ui.set('accent', mostVivid(scope));

    expect(book.resolve('ui.accent')).toBe('#0066cc');
  });
});
