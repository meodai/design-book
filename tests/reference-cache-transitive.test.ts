import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, createFunctionToken, getReferenceResolution, ref } from '../src/tokens';

describe('reference caches are refreshed past the first hop', () => {
  it('a reference two hops away hears that its chain broke', () => {
    const book = new DesignBook('test');
    const a = book.addScope('a');
    a.set('x', color('#ff0000'));
    a.set('y', ref('a.x'));
    const far = ref('a.y');
    a.set('z', far);
    expect(getReferenceResolution(far)?.isResolvable).toBe(true);

    a.delete('x');
    expect(getReferenceResolution(far)?.isResolvable).toBe(false);

    a.set('x', color('#00ff00'));
    expect(getReferenceResolution(far)?.isResolvable).toBe(true);
  });

  it('a reference nested inside a function argument is refreshed', () => {
    const book = new DesignBook('test');
    book.registerFunction('ident', (v: unknown) => String(v));
    const a = book.addScope('a');
    a.set('x', color('#ff0000'));
    const nested = ref('a.x');
    a.set('f', createFunctionToken('ident', [createFunctionToken('ident', [nested])]));
    expect(getReferenceResolution(nested)?.isResolvable).toBe(true);

    a.delete('x');
    expect(getReferenceResolution(nested)?.isResolvable).toBe(false);
  });

  it('a reference argument behind another reference is refreshed', () => {
    const book = new DesignBook('test');
    book.registerFunction('ident', (v: unknown) => String(v));
    const a = book.addScope('a');
    a.set('x', color('#ff0000'));
    a.set('y', ref('a.x'));
    const arg = ref('a.y');
    a.set('f', createFunctionToken('ident', [arg]));

    a.delete('x');
    expect(getReferenceResolution(arg)?.isResolvable).toBe(false);
  });
});
