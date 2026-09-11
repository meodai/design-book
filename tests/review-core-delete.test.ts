import { describe, it, expect, vi } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, ref } from '../src/tokens';

describe('deleting a token keeps its dependents connected', () => {
  it('re-setting a deleted token still reaches its dependents', () => {
    const book = new DesignBook('test');
    const a = book.addScope('a');
    const b = book.addScope('b');
    a.set('x', color('#ff0000'));
    b.set('y', ref('a.x'));

    a.delete('x');

    // the dependent still declares a.x as its prerequisite
    expect(book.getDependencyGraph().getIncoming('b.y')).toContain('a.x');

    const watcher = vi.fn();
    book.watch('b.y', watcher);

    a.set('x', color('#0000ff'));

    expect(watcher).toHaveBeenCalled();
    expect(book.resolve('b.y')).toBe('#0000ff');
  });

  it('notifies dependents when the token they depend on is deleted', () => {
    const book = new DesignBook('test');
    const a = book.addScope('a');
    const b = book.addScope('b');
    a.set('x', color('#ff0000'));
    b.set('y', ref('a.x'));

    const changed: string[] = [];
    book.on('tokenChanged', (e) => changed.push(e.detail.key));

    a.delete('x');

    expect(changed).toContain('a.x');
    expect(changed).toContain('b.y');
  });

  it('deleting the whole scope keeps its dependents connected and notifies them', () => {
    const book = new DesignBook('test');
    const a = book.addScope('a');
    const b = book.addScope('b');
    a.set('x', color('#ff0000'));
    b.set('y', ref('a.x'));

    const changed: string[] = [];
    book.on('tokenChanged', (e) => changed.push(e.detail.key));

    book.deleteScope('a');

    expect(changed).toContain('a.x');
    expect(changed).toContain('b.y');
    expect(book.getDependencyGraph().getIncoming('b.y')).toContain('a.x');

    const a2 = book.addScope('a');
    a2.set('x', color('#00ff00'));
    expect(book.resolve('b.y')).toBe('#00ff00');
  });

  it('still drops the node of a deleted token that nobody depends on', () => {
    const book = new DesignBook('test');
    const brand = book.addScope('brand');
    const ui = book.addScope('ui');
    brand.set('primary', color('#0066cc'));
    ui.set('bg', ref('brand.primary'));

    ui.delete('bg');

    expect(book.getDependencyGraph().getAllNodes()).not.toContain('ui.bg');
    expect(book.getDependencyGraph().getDependentsOf('brand.primary')).not.toContain('ui.bg');
  });
});
