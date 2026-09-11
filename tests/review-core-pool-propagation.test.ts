import { describe, it, expect, vi } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, ref } from '../src/tokens';
import { bestContrastWith } from '../src/functions/color/best-contrast';
import { nth } from '../src/functions/generic/nth';

describe('scope-iterating functions propagate changes to their candidate pool', () => {
  it('a key added to the iterated scope notifies the selector', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    const ui = book.addScope('ui');
    palette.set('light', color('#ffffff'));
    ui.set('text', bestContrastWith(color('#ffffff'), palette));

    expect(book.resolve('ui.text')).toBe('#ffffff');

    const watcher = vi.fn();
    book.watch('ui.text', watcher);

    palette.set('dark', color('#000000'));

    expect(watcher).toHaveBeenCalled();
    expect(book.resolve('ui.text')).toBe('#000000');
    // Pool membership lives in the selector index, not in the graph: it is
    // not a value dependency, so it must not become an edge.
    expect(book.getDependencyGraph().getDependentsOf('palette.dark')).not.toContain('ui.text');
  });

  it('changing an existing pool member notifies the function token', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    const ui = book.addScope('ui');
    palette.set('light', color('#ffffff'));
    palette.set('dark', color('#111111'));
    ui.set('text', bestContrastWith(color('#ffffff'), palette));

    const watcher = vi.fn();
    book.watch('ui.text', watcher);
    palette.set('dark', color('#000000'));

    expect(watcher).toHaveBeenCalled();
    expect(book.resolve('ui.text')).toBe('#000000');
  });

  it('works for generic selectors such as nth', () => {
    const book = new DesignBook('test');
    const sizes = book.addScope('sizes');
    const ui = book.addScope('ui');
    sizes.set('a', color('#111111'));
    ui.set('second', nth(sizes, 1));

    const watcher = vi.fn();
    book.watch('ui.second', watcher);

    sizes.set('b', color('#222222'));

    expect(watcher).toHaveBeenCalled();
    expect(book.resolve('ui.second')).toBe('#222222');
  });

  it('propagates pool growth in batch mode too', () => {
    const book = new DesignBook('test', { mode: 'batch' });
    const palette = book.addScope('palette');
    const ui = book.addScope('ui');
    palette.set('light', color('#ffffff'));
    ui.set('text', bestContrastWith(color('#ffffff'), palette));
    book.flush();

    const watcher = vi.fn();
    book.watch('ui.text', watcher);

    palette.set('dark', color('#000000'));
    book.flush();

    expect(watcher).toHaveBeenCalled();
    expect(book.resolve('ui.text')).toBe('#000000');
  });

  it('does not register a self-edge when the token lives in the scope it iterates', () => {
    const book = new DesignBook('test');
    const s = book.addScope('s');
    s.set('bg', color('#ffffff'));
    s.set('a', color('#222222'));

    expect(() => s.set('text', bestContrastWith(ref('s.bg'), s))).not.toThrow();

    const prereqs = book.getDependencyGraph().getPrerequisitesFor('s.text');
    expect(prereqs).not.toContain('s.text');
    expect(prereqs).toContain('s.bg');
    // s.a is a pool member, not a value dependency — indexed, not an edge.
    expect(prereqs).not.toContain('s.a');
    expect(book.resolve('s.text')).toBe('#222222');

    // …and the selector still hears about a pool member changing.
    const watcher = vi.fn();
    book.watch('s.text', watcher);
    s.set('a', color('#111111'));
    expect(watcher).toHaveBeenCalled();
    expect(book.resolve('s.text')).toBe('#111111');
  });
});

describe('shrinking the candidate pool propagates too', () => {
  it('removing a key from the iterated scope notifies the function token', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    const ui = book.addScope('ui');
    palette.set('light', color('#ffffff'));
    palette.set('dark', color('#000000'));
    ui.set('text', bestContrastWith(color('#ffffff'), palette));
    expect(book.resolve('ui.text')).toBe('#000000');

    const watcher = vi.fn();
    book.watch('ui.text', watcher);

    palette.delete('dark');

    expect(watcher).toHaveBeenCalled();
    expect(watcher.mock.calls[0][0]).toBe('#ffffff');
    expect(book.getDependencyGraph().getPrerequisitesFor('ui.text')).not.toContain('palette.dark');
  });

  it('removing a pool key notifies in batch mode too', () => {
    const book = new DesignBook('test', { mode: 'batch' });
    const palette = book.addScope('palette');
    const ui = book.addScope('ui');
    palette.set('light', color('#ffffff'));
    palette.set('dark', color('#000000'));
    ui.set('text', bestContrastWith(color('#ffffff'), palette));
    book.flush();

    const watcher = vi.fn();
    book.watch('ui.text', watcher);

    palette.delete('dark');
    book.flush();

    expect(watcher).toHaveBeenCalled();
    expect(book.resolve('ui.text')).toBe('#ffffff');
  });

  it('deleting the whole iterated scope notifies the function token', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    const ui = book.addScope('ui');
    palette.set('light', color('#ffffff'));
    palette.set('dark', color('#000000'));
    ui.set('text', bestContrastWith(color('#ffffff'), palette));

    const changed: string[] = [];
    book.on('tokenChanged', (e) => changed.push(e.detail.key));

    book.deleteScope('palette');

    expect(changed).toContain('ui.text');
    expect(book.getDependencyGraph().getPrerequisitesFor('ui.text')).toEqual([]);
  });
});

describe('inherited pool members propagate through the extends chain', () => {
  const build = (mode: 'auto' | 'batch') => {
    const book = new DesignBook('test', { mode });
    const palette = book.addScope('palette');
    const dark = book.addScope('dark', { extends: 'palette' });
    const ui = book.addScope('ui');
    palette.set('white', color('#ffffff'));
    // The selector iterates `dark`, whose key list includes palette's keys.
    ui.set('text', bestContrastWith(color('#ffffff'), dark));
    if (mode === 'batch') book.flush();
    return { book, palette, dark, ui };
  };

  it('a key added to the parent scope notifies a selector iterating the child (auto)', () => {
    const { book, palette } = build('auto');
    expect(book.resolve('ui.text')).toBe('#ffffff');

    const watcher = vi.fn();
    book.watch('ui.text', watcher);
    palette.set('black', color('#000000'));

    expect(watcher).toHaveBeenCalled();
    expect(book.resolve('ui.text')).toBe('#000000');
  });

  it('changing a parent key notifies a selector iterating the child (auto)', () => {
    const { book, palette } = build('auto');
    palette.set('other', color('#666666'));

    const watcher = vi.fn();
    book.watch('ui.text', watcher);
    palette.set('other', color('#000000'));

    expect(watcher).toHaveBeenCalled();
    expect(book.resolve('ui.text')).toBe('#000000');
  });

  it('deleting a parent key notifies a selector iterating the child (auto)', () => {
    const { book, palette } = build('auto');
    palette.set('black', color('#000000'));
    expect(book.resolve('ui.text')).toBe('#000000');

    const watcher = vi.fn();
    book.watch('ui.text', watcher);
    palette.delete('black');

    expect(watcher).toHaveBeenCalled();
    expect(book.resolve('ui.text')).toBe('#ffffff');
  });

  it('a key added to the parent scope notifies in batch mode too', () => {
    const { book, palette } = build('batch');
    const watcher = vi.fn();
    book.watch('ui.text', watcher);

    palette.set('black', color('#000000'));
    book.flush();

    expect(watcher).toHaveBeenCalled();
    expect(book.resolve('ui.text')).toBe('#000000');
  });

  it('changing and deleting a parent key notifies in batch mode too', () => {
    const { book, palette } = build('batch');
    palette.set('black', color('#000000'));
    book.flush();

    const changed = vi.fn();
    book.watch('ui.text', changed);
    palette.set('black', color('#111111'));
    book.flush();
    expect(changed).toHaveBeenCalled();
    expect(book.resolve('ui.text')).toBe('#111111');

    const removed = vi.fn();
    book.watch('ui.text', removed);
    palette.delete('black');
    book.flush();
    expect(removed).toHaveBeenCalled();
    expect(book.resolve('ui.text')).toBe('#ffffff');
  });
});
