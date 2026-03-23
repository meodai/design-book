import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { ms } from '../../../src/tokens';
import { timing } from '../../../src/functions/non-color/timing';

describe('timing', () => {
  it('creates timing string', () => {
    const book = new DesignBook('test');
    const ui = book.addScope('ui');
    ui.set('hover', timing(ms(200), 'ease-out'));

    expect(book.resolve('ui.hover')).toBe('200ms ease-out');
  });

  it('includes delay when specified', () => {
    const book = new DesignBook('test');
    const ui = book.addScope('ui');
    ui.set('expand', timing(ms(300), 'ease-in-out', { delay: 100 }));

    expect(book.resolve('ui.expand')).toBe('300ms ease-in-out 100ms');
  });
});
