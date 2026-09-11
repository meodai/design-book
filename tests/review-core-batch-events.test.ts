import { describe, it, expect, vi } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, ref } from '../src/tokens';

describe('flush() emits the same events auto mode does', () => {
  it('fires tokenChanged and one aggregate change', () => {
    const book = new DesignBook('test', { mode: 'batch' });
    const s = book.addScope('s');

    const watcher = vi.fn();
    const changed = vi.fn();
    book.watch('s.x', watcher);
    book.on('change', changed);

    s.set('x', color('#ff0000'));
    expect(watcher).not.toHaveBeenCalled();

    book.flush();

    expect(watcher).toHaveBeenCalledTimes(1);
    expect(watcher.mock.calls[0][0]).toBe('#ff0000');
    expect(watcher.mock.calls[0][1].oldValue).toBeUndefined();
    expect(changed).toHaveBeenCalledTimes(1);
    expect(changed.mock.calls[0][0].detail.changedKeys).toContain('s.x');
    expect(changed.mock.calls[0][0].detail.scopes).toContain('s');
  });

  it('fans out to dependents', () => {
    const book = new DesignBook('test', { mode: 'batch' });
    const a = book.addScope('a');
    const b = book.addScope('b');
    a.set('x', color('#ff0000'));
    b.set('y', ref('a.x'));
    book.flush();

    const watcher = vi.fn();
    book.watch('b.y', watcher);

    a.set('x', color('#0000ff'));
    book.flush();

    expect(watcher).toHaveBeenCalledTimes(1);
    expect(watcher.mock.calls[0][0]).toBe('#0000ff');
  });

  it('reports each key at most once per flush', () => {
    const book = new DesignBook('test', { mode: 'batch' });
    const a = book.addScope('a');
    a.set('x', color('#ff0000'));
    a.set('y', ref('a.x'));

    const keys: string[] = [];
    book.on('tokenChanged', (e) => keys.push(e.detail.key));
    const changed = vi.fn();
    book.on('change', changed);

    book.flush();

    expect(keys.filter(k => k === 'a.y')).toHaveLength(1);
    expect(keys.filter(k => k === 'a.x')).toHaveLength(1);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('emits nothing when the queue is empty', () => {
    const book = new DesignBook('test', { mode: 'batch' });
    const changed = vi.fn();
    const token = vi.fn();
    book.on('change', changed);
    book.on('tokenChanged', token);

    book.flush();

    expect(changed).not.toHaveBeenCalled();
    expect(token).not.toHaveBeenCalled();
  });
});
