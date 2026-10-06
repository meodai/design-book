import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, ref } from '../src/tokens';
import { CircularDependencyError } from '../src/errors';

describe('batch writes to one key merge', () => {
  function setup() {
    const book = new DesignBook('test', { mode: 'batch' });
    const a = book.addScope('a');
    const green = color('green');
    a.set('x', color('red'));
    a.set('y', green);
    book.flush();
    return { book, a, green };
  }

  it('roll a rejected merged write back to the value before the batch', () => {
    const { book, a, green } = setup();
    a.set('y', ref('a.x'));
    a.set('y', ref('a.y'));
    const { errors } = book.flush();

    expect(errors[0]).toBeInstanceOf(CircularDependencyError);
    expect(a.get('y')).toBe(green);
    // Stored token and graph agree: a plain colour has no prerequisites.
    expect(book.getDependencyGraph().getIncoming('a.y')).toEqual([]);
  });

  it('report the value before the batch as oldValue', () => {
    const { book, a, green } = setup();
    const events: Array<{ newValue: unknown; oldValue: unknown }> = [];
    book.on('tokenChanged', (e) => {
      if (e.detail.key === 'a.y') events.push(e.detail);
    });
    const blue = color('blue');
    a.set('y', color('purple'));
    a.set('y', blue);
    book.flush();

    expect(events).toEqual([{ key: 'a.y', newValue: blue, oldValue: green }]);
  });

  it('start a new oldValue once a write has been through a flush', () => {
    const { book, a } = setup();
    const unresolvable = ref('missing.k');
    a.set('y', unresolvable);
    book.flush(); // accepted by the graph, fails to resolve, stays queued

    const events: Array<{ oldValue: unknown }> = [];
    book.on('tokenChanged', (e) => {
      if (e.detail.key === 'a.y') events.push(e.detail);
    });
    a.set('y', color('blue'));
    book.flush();
    expect(events[0].oldValue).toBe(unresolvable);
  });
});
