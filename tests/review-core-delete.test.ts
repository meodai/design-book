import { describe, it, expect, vi } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, getReferenceResolution, ref } from '../src/tokens';

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

describe('deleting invalidates the reference caches of dependents', () => {
  it('deleting a single token marks its references unresolvable', () => {
    const book = new DesignBook('test');
    const a = book.addScope('a');
    const b = book.addScope('b');
    a.set('x', color('#ff0000'));
    const r = ref('a.x');
    b.set('y', r);
    expect(getReferenceResolution(r)?.isResolvable).toBe(true);

    a.delete('x');

    expect(getReferenceResolution(r)?.isResolvable).toBe(false);
  });

  it('deleting the whole scope does the same', () => {
    const book = new DesignBook('test');
    const a = book.addScope('a');
    const b = book.addScope('b');
    a.set('x', color('#ff0000'));
    const r = ref('a.x');
    b.set('y', r);
    expect(getReferenceResolution(r)?.isResolvable).toBe(true);

    book.deleteScope('a');

    expect(getReferenceResolution(r)?.isResolvable).toBe(false);
  });

  it('deleting a scope that extends another reports its inherited keys as gone', () => {
    const book = new DesignBook('test');
    const parent = book.addScope('parent');
    book.addScope('child', { extends: 'parent' });
    const other = book.addScope('other');
    parent.set('a', color('#ff0000'));
    const r = ref('child.a');
    other.set('x', r);
    expect(getReferenceResolution(r)?.isResolvable).toBe(true);

    book.deleteScope('child');

    expect(book.hasScope('child')).toBe(false);
    expect(getReferenceResolution(r)?.isResolvable).toBe(false);
  });
});

describe('reference caches are invalidated through inherited hops', () => {
  it('deleting the parent token invalidates a ref to the inherited key', () => {
    const book = new DesignBook('test');
    const parent = book.addScope('parent');
    book.addScope('child', { extends: 'parent' });
    const other = book.addScope('other');
    parent.set('a', color('#ff0000'));
    const r = ref('child.a');
    other.set('x', r);
    expect(getReferenceResolution(r)?.isResolvable).toBe(true);

    parent.delete('a');

    expect(() => book.resolve('other.x')).toThrow();
    expect(getReferenceResolution(r)?.isResolvable).toBe(false);
  });

  it('deleting the parent scope does the same', () => {
    const book = new DesignBook('test');
    const parent = book.addScope('parent');
    book.addScope('child', { extends: 'parent' });
    const other = book.addScope('other');
    parent.set('a', color('#ff0000'));
    const r = ref('child.a');
    other.set('x', r);
    expect(getReferenceResolution(r)?.isResolvable).toBe(true);

    book.deleteScope('parent');

    expect(() => book.resolve('other.x')).toThrow();
    expect(getReferenceResolution(r)?.isResolvable).toBe(false);
  });

  it('re-resolves through the hop when the parent token comes back', () => {
    const book = new DesignBook('test');
    const parent = book.addScope('parent');
    book.addScope('child', { extends: 'parent' });
    const other = book.addScope('other');
    parent.set('a', color('#ff0000'));
    const r = ref('child.a');
    other.set('x', r);
    parent.delete('a');
    expect(getReferenceResolution(r)?.isResolvable).toBe(false);

    parent.set('a', color('#00ff00'));

    expect(getReferenceResolution(r)?.isResolvable).toBe(true);
    expect(book.resolve('other.x')).toBe('#00ff00');
  });
});
