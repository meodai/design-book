import { describe, it, expect, vi } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, ref } from '../src/tokens';
import { bestContrastWith } from '../src/functions/color/best-contrast';
import { nth } from '../src/functions/generic/nth';

describe('scope-iterating functions propagate changes to their candidate pool', () => {
  it('a key added to the iterated scope becomes a graph dependency and notifies', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    const ui = book.addScope('ui');
    palette.set('light', color('#ffffff'));
    ui.set('text', bestContrastWith(color('#ffffff'), palette));

    expect(book.resolve('ui.text')).toBe('#ffffff');

    const watcher = vi.fn();
    book.watch('ui.text', watcher);

    palette.set('dark', color('#000000'));

    expect(book.getDependencyGraph().getDependentsOf('palette.dark')).toContain('ui.text');
    expect(watcher).toHaveBeenCalled();
    expect(book.resolve('ui.text')).toBe('#000000');
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

    sizes.set('b', color('#222222'));

    expect(book.getDependencyGraph().getDependentsOf('sizes.b')).toContain('ui.second');
  });

  it('propagates pool growth in batch mode too', () => {
    const book = new DesignBook('test', { mode: 'batch' });
    const palette = book.addScope('palette');
    const ui = book.addScope('ui');
    palette.set('light', color('#ffffff'));
    ui.set('text', bestContrastWith(color('#ffffff'), palette));
    book.flush();

    palette.set('dark', color('#000000'));
    book.flush();

    expect(book.getDependencyGraph().getDependentsOf('palette.dark')).toContain('ui.text');
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
    expect(prereqs).toContain('s.a');
    expect(book.resolve('s.text')).toBe('#222222');
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
