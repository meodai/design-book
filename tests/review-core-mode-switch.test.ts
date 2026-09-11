import { describe, it, expect, vi } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color } from '../src/tokens';

describe('leaving batch mode drains the queue', () => {
  it('switching mode to auto flushes the pending changes', () => {
    const book = new DesignBook('test', { mode: 'batch' });
    const s = book.addScope('s');
    const watcher = vi.fn();
    book.watch('s.x', watcher);

    s.set('x', color('#ff0000'));
    expect(book.batchQueueSize).toBe(1);

    book.mode = 'auto';

    expect(book.batchQueueSize).toBe(0);
    expect(watcher).toHaveBeenCalledTimes(1);
    expect(book.getDependencyGraph().getAllNodes()).toContain('s.x');
  });

  it('switching batch → batch or auto → auto changes nothing', () => {
    const book = new DesignBook('test', { mode: 'batch' });
    const s = book.addScope('s');
    s.set('x', color('#ff0000'));

    book.mode = 'batch';
    expect(book.batchQueueSize).toBe(1);

    book.mode = 'auto';
    expect(book.batchQueueSize).toBe(0);

    const changed = vi.fn();
    book.on('change', changed);
    book.mode = 'auto';
    expect(changed).not.toHaveBeenCalled();
  });
});
