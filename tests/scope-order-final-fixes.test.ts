// tests/scope-order-final-fixes.test.ts
// TDD tests for issues I1-A, I1-B, and I2.
import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { px, ref } from '../src/tokens';

describe('scope-order final fixes', () => {
  // ---------------------------------------------------------------------------
  // I1-A: child inherits parent value order but never calls setOrder().
  //       child has its own cross-scope ref. Changing the referenced token
  //       must invalidate the child's ordered cache.
  // ---------------------------------------------------------------------------
  it('I1-A: child with inherited order and own cross-scope ref reorders on change', () => {
    const book = new DesignBook('test');

    // Third scope whose token the child references
    const src = book.addScope('src');
    src.set('x', px(8));

    // Parent carries the order
    const parent = book.addScope('parent');
    parent.set('big', px(100));
    parent.setOrder([{ by: 'value' }]);

    // Child inherits parent's order but NEVER calls setOrder()
    const child = book.addScope('child', { extends: 'parent' });
    child.set('mirror', ref('src.x')); // resolves to 8px → should be first

    // Initial order: mirror(8) < big(100)
    expect(child.getAllKeys()).toEqual(['mirror', 'big']);

    // Now make mirror(200) > big(100) — cache must be invalidated
    src.set('x', px(200));

    expect(child.getAllKeys()).toEqual(['big', 'mirror']);
  });

  // ---------------------------------------------------------------------------
  // I1-B: child inherits parent value order; a parent *member* is a cross-scope
  //       ref. Changing that referenced token triggers a change event for the
  //       parent key. The child (a descendant) must also drop its stale cache.
  // ---------------------------------------------------------------------------
  it('I1-B: child reorders when a parent member cross-scope ref changes (descendant invalidation)', () => {
    const book = new DesignBook('test');

    // Third scope
    const src = book.addScope('src');
    src.set('x', px(8));

    // Parent has a cross-scope ref member and carries the order
    const parent = book.addScope('parent');
    parent.set('big', px(100));
    parent.set('mirror', ref('src.x')); // resolves to 8px initially
    parent.setOrder([{ by: 'value' }]);

    // Child just inherits everything
    const child = book.addScope('child', { extends: 'parent' });

    // Initial state: mirror(8) < big(100)
    expect(child.getAllKeys()).toEqual(['mirror', 'big']);

    // Change src.x so mirror(200) > big(100)
    src.set('x', px(200));

    // child's cache must be invalidated via parent's subscription → descendant invalidation
    expect(child.getAllKeys()).toEqual(['big', 'mirror']);
  });

  // ---------------------------------------------------------------------------
  // I2: deleteScope must unsubscribe the deleted scope's change listener so the
  //     book's listener Set doesn't retain a stale closure forever.
  // ---------------------------------------------------------------------------
  it('I2: deleteScope unsubscribes the scope change listener', () => {
    const book = new DesignBook('test');

    const ordered = book.addScope('ordered');
    ordered.set('a', px(4));
    ordered.set('b', px(16));
    ordered.setOrder([{ by: 'value' }]);

    // Warm the cache and trigger lazy subscription (if any)
    ordered.getAllKeys();

    // Record listener count before deletion
    const listenersBefore = (book as any).listeners.get('change')?.size ?? 0;
    expect(listenersBefore).toBeGreaterThan(0); // the subscription must exist

    book.deleteScope('ordered');

    // The subscription must have been removed
    const listenersAfter = (book as any).listeners.get('change')?.size ?? 0;
    expect(listenersAfter).toBe(listenersBefore - 1);

    // Subsequent changes in unrelated scopes must not throw
    const other = book.addScope('other');
    other.set('x', px(8));
    expect(() => other.set('x', px(16))).not.toThrow();
  });
});
