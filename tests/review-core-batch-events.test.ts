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

describe('flush() emits for keys that got a graph update but failed to resolve', () => {
  it('matches auto mode for an unresolvable reference', () => {
    const auto = new DesignBook('auto');
    const autoScope = auto.addScope('s');
    const autoKeys: string[] = [];
    auto.on('tokenChanged', (e) => autoKeys.push(e.detail.key));
    autoScope.set('y', ref('s.missing'));
    expect(autoKeys).toContain('s.y');

    const book = new DesignBook('test', { mode: 'batch' });
    const s = book.addScope('s');
    const keys: string[] = [];
    book.on('tokenChanged', (e) => keys.push(e.detail.key));

    s.set('y', ref('s.missing'));
    const result = book.flush();

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.processed).not.toContain('s.y');
    expect(keys).toContain('s.y');
  });

  it('still says nothing about a key the graph rejected outright', () => {
    const book = new DesignBook('test', { mode: 'batch' });
    const s = book.addScope('s');
    const keys: string[] = [];
    book.on('tokenChanged', (e) => keys.push(e.detail.key));

    s.set('n', ref('s.n'));
    book.flush();

    expect(keys).not.toContain('s.n');
  });
})

describe('a permanently unresolvable key is reported once, not every flush', () => {
  it('stays silent on later no-op flushes', () => {
    const book = new DesignBook('test', { mode: 'batch' });
    const s = book.addScope('s');
    s.set('y', ref('s.missing'));

    const keys: string[] = [];
    const changed = vi.fn();
    book.on('tokenChanged', (e) => keys.push(e.detail.key));
    book.on('change', changed);

    book.flush();
    expect(keys).toEqual(['s.y']);
    expect(changed).toHaveBeenCalledTimes(1);

    book.flush();
    book.flush();

    expect(keys).toEqual(['s.y']);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('reports it again when the token is written again', () => {
    const book = new DesignBook('test', { mode: 'batch' });
    const s = book.addScope('s');
    s.set('y', ref('s.missing'));
    book.flush();

    const keys: string[] = [];
    book.on('tokenChanged', (e) => keys.push(e.detail.key));

    s.set('y', ref('s.stillMissing'));
    book.flush();

    expect(keys).toContain('s.y');
  });

  it('reports it when it finally resolves', () => {
    const book = new DesignBook('test', { mode: 'batch' });
    const s = book.addScope('s');
    s.set('y', ref('s.missing'));
    book.flush();

    const keys: string[] = [];
    book.on('tokenChanged', (e) => keys.push(e.detail.key));

    s.set('missing', color('#ff0000'));
    book.flush();

    expect(keys).toContain('s.y');
    expect(book.resolve('s.y')).toBe('#ff0000');
  });
});
