import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, getReferenceResolution, ref } from '../src/tokens';
import { colorMix } from '../src/functions/color/color-mix';

describe("a reference caches its own resolution as soon as it is set", () => {
  it('populates the cache on set, not only when the target changes', () => {
    const book = new DesignBook('test');
    const s = book.addScope('s');
    s.set('x', color('#ff0000'));

    const r = ref('s.x');
    s.set('y', r);

    const resolution = getReferenceResolution(r);
    expect(resolution).toBeDefined();
    expect(resolution!.isResolvable).toBe(true);
    expect(resolution!.resolvedType).toBe('color');
  });

  it('records an unresolvable reference as such', () => {
    const book = new DesignBook('test');
    const s = book.addScope('s');

    const r = ref('s.missing');
    s.set('y', r);

    const resolution = getReferenceResolution(r);
    expect(resolution).toBeDefined();
    expect(resolution!.isResolvable).toBe(false);
    expect(resolution!.errorMessage).toBeTruthy();
  });

  it('covers reference arguments of a function token', () => {
    const book = new DesignBook('test');
    const s = book.addScope('s');
    s.set('a', color('#ff0000'));
    s.set('b', color('#0000ff'));

    const argA = ref('s.a');
    const argB = ref('s.b');
    s.set('mixed', colorMix(argA, argB));

    expect(getReferenceResolution(argA)?.isResolvable).toBe(true);
    expect(getReferenceResolution(argB)?.isResolvable).toBe(true);
  });

  it('populates the cache in batch mode after flush', () => {
    const book = new DesignBook('test', { mode: 'batch' });
    const s = book.addScope('s');
    s.set('x', color('#ff0000'));
    book.flush();

    const r = ref('s.x');
    s.set('y', r);
    book.flush();

    expect(getReferenceResolution(r)?.isResolvable).toBe(true);
  });
});
