import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color } from '../src/tokens';
import { nth } from '../src/functions';

describe('a selector whose scope is deleted and re-created', () => {
  it('iterates the live scope of that name, not the deleted one', () => {
    const book = new DesignBook('test');
    const pal = book.addScope('pal');
    pal.set('a', color('#ff0000'));
    const ui = book.addScope('ui');
    ui.set('pick', nth(pal, 0));
    expect(book.resolve('ui.pick')).toBe('#ff0000');

    book.deleteScope('pal');
    expect(() => book.resolve('ui.pick')).toThrow();

    const pal2 = book.addScope('pal');
    pal2.set('a', color('#0000ff'));
    expect(book.resolve('ui.pick')).toBe('#0000ff');
  });

  it('still reads the scope object it was given while that scope is registered', () => {
    const book = new DesignBook('test');
    const pal = book.addScope('pal');
    pal.set('a', color('#00ff00'));
    book.addScope('ui').set('pick', nth(pal, 0));
    expect(book.resolve('ui.pick')).toBe('#00ff00');
  });
});
