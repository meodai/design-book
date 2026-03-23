import { describe, it, expect, vi } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, getReferenceResolution, ref } from '../src/tokens';

describe('DesignBook', () => {
  // Note: `ref` is imported above and used in batch-failed and re-entrancy tests
  it('constructor sets name and defaults', () => {
    const book = new DesignBook('test');
    expect(book.name).toBe('test');
    expect(book.mode).toBe('auto');
  });

  it('constructor accepts options', () => {
    const book = new DesignBook('test', { mode: 'batch', description: 'desc' });
    expect(book.mode).toBe('batch');
    expect(book.description).toBe('desc');
  });

  describe('scope management', () => {
    it('addScope and getScope', () => {
      const book = new DesignBook('test');
      const scope = book.addScope('brand');
      expect(book.getScope('brand')).toBe(scope);
      expect(book.hasScope('brand')).toBe(true);
    });

    it('deleteScope removes scope', () => {
      const book = new DesignBook('test');
      book.addScope('brand');
      book.deleteScope('brand');
      expect(book.hasScope('brand')).toBe(false);
    });
  });

  describe('token operations', () => {
    it('resolve parses scope.token and returns value', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('primary', color('#0066cc'));
      expect(book.resolve('brand.primary')).toBe('#0066cc');
    });

    it('has checks existence', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('primary', color('#0066cc'));
      expect(book.has('brand.primary')).toBe(true);
      expect(book.has('brand.missing')).toBe(false);
    });

    it('resolves references across scopes', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('primary', color('#0066cc'));
      const ui = book.addScope('ui');
      ui.set('bg', ref('brand.primary'));
      expect(book.resolve('ui.bg')).toBe('#0066cc');
    });

    it('getTokenByKey returns raw token', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('primary', color('#0066cc'));
      const token = book.getTokenByKey('brand.primary');
      expect(token?.type).toBe('color');
    });
  });

  describe('events', () => {
    it('fires tokenChanged on set in auto mode', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      const handler = vi.fn();
      book.on('tokenChanged', handler);
      brand.set('primary', color('#0066cc'));
      expect(handler).toHaveBeenCalled();
    });

    it('watch fires for specific key', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('primary', color('#000000'));
      const handler = vi.fn();
      const dispose = book.watch('brand.primary', handler);
      brand.set('primary', color('#ffffff'));
      expect(handler).toHaveBeenCalledWith('#ffffff', expect.anything());
      expect(typeof dispose).toBe('function');
    });

    it('fires scopeAdded on addScope', () => {
      const book = new DesignBook('test');
      const handler = vi.fn();
      const dispose = book.on('scopeAdded', handler);
      book.addScope('brand');
      expect(handler).toHaveBeenCalled();
      expect(typeof dispose).toBe('function');
    });
  });

  describe('auto mode propagation', () => {
    it('updates dependents when prerequisite changes', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      const ui = book.addScope('ui');
      brand.set('primary', color('#0066cc'));
      ui.set('bg', ref('brand.primary'));
      expect(book.resolve('ui.bg')).toBe('#0066cc');

      brand.set('primary', color('#ff0000'));
      expect(book.resolve('ui.bg')).toBe('#ff0000');
    });
  });

  describe('batch mode', () => {
    it('queues changes and processes on flush', () => {
      const book = new DesignBook('test', { mode: 'batch' });
      const brand = book.addScope('brand');
      brand.set('primary', color('#0066cc'));
      expect(book.batchQueueSize).toBeGreaterThan(0);

      const result = book.flush();
      expect(result.processed.length).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    });

    it('fires batch-complete on successful flush', () => {
      const book = new DesignBook('test', { mode: 'batch' });
      const handler = vi.fn();
      book.on('batch-complete', handler);
      const brand = book.addScope('brand');
      brand.set('primary', color('#0066cc'));
      book.flush();
      expect(handler).toHaveBeenCalled();
    });

    it('mode is switchable at runtime', () => {
      const book = new DesignBook('test');
      expect(book.mode).toBe('auto');
      book.mode = 'batch';
      expect(book.mode).toBe('batch');
      book.mode = 'auto';
      expect(book.mode).toBe('auto');
    });
  });

  describe('function registry', () => {
    it('registerFunction stores and resolves custom functions', () => {
      const book = new DesignBook('test');
      book.registerFunction('exclaim', (text: string) => `${text}!`);
      const scope = book.addScope('custom');
      scope.set('greeting', { type: 'string', rawValue: 'Hello' } as any);
      scope.set('loud', {
        type: 'function',
        name: 'exclaim',
        rawValue: 'exclaim',
        args: ['Hello'],
        metadata: { dependencies: [], visualDependencies: [] },
      } as any);
      expect(scope.resolve('loud')).toBe('Hello!');
    });

    it('built-in functions resolve through the registry', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      const ui = book.addScope('ui');

      brand.set('primary', color('#000000'));
      brand.set('secondary', color('#ffffff'));
      ui.set('mixed', {
        type: 'function',
        name: 'colorMix',
        rawValue: 'colorMix',
        args: [ref('brand.primary'), ref('brand.secondary')],
        options: { ratio: 0 },
        metadata: { dependencies: ['brand.primary', 'brand.secondary'], visualDependencies: [] },
      } as any);

      expect(book.resolve('ui.mixed')).toBe('#000000');
    });
  });

  describe('getDependencyGraph', () => {
    it('returns the dependency graph', () => {
      const book = new DesignBook('test');
      const graph = book.getDependencyGraph();
      expect(graph).toBeDefined();
      expect(typeof graph.getDependentsOf).toBe('function');
    });
  });

  describe('additional events', () => {
    it('fires scopeRemoved on deleteScope', () => {
      const book = new DesignBook('test');
      book.addScope('brand');
      const handler = vi.fn();
      book.on('scopeRemoved', handler);
      book.deleteScope('brand');
      expect(handler).toHaveBeenCalled();
    });

    it('fires change event with changedKeys and scopes', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      const handler = vi.fn();
      const dispose = book.on('change', handler);
      brand.set('primary', color('#0066cc'));
      expect(handler).toHaveBeenCalled();
      const detail = handler.mock.calls[0][0].detail;
      expect(detail.changedKeys).toContain('brand.primary');
      expect(detail.scopes).toContain('brand');
      expect(typeof dispose).toBe('function');
    });

    it('fires batch-failed when flush encounters errors', () => {
      const book = new DesignBook('test', { mode: 'batch' });
      const handler = vi.fn();
      book.on('batch-failed', handler);
      const scope = book.addScope('test');
      scope.set('broken', ref('nonexistent.token'));
      const result = book.flush();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('bug fixes', () => {
    it('Bug 1: deleting a token removes stale dependency-graph edges and node', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      const ui = book.addScope('ui');
      brand.set('primary', color('#0066cc'));
      ui.set('bg', ref('brand.primary'));

      const graph = book.getDependencyGraph();
      // Verify edge exists before deletion
      expect(graph.getPrerequisitesFor('ui.bg')).toContain('brand.primary');

      // Delete the reference token
      ui.delete('bg');

      // The node should be removed from the graph
      expect(graph.getAllNodes()).not.toContain('ui.bg');
      // No edges should remain for the deleted key
      expect(graph.getDependentsOf('brand.primary')).not.toContain('ui.bg');
    });

    it('Bug 2: batch mode reports circular dependency errors and processes non-circular keys', () => {
      const book = new DesignBook('test', { mode: 'batch' });
      const scope = book.addScope('test');
      // Set up a circular dependency
      scope.set('a', ref('test.b'));
      scope.set('b', ref('test.a'));
      // Also set a valid token
      scope.set('valid', color('#ff0000'));

      const result = book.flush();
      // Circular dependency should appear in errors
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.message.toLowerCase().includes('circular'))).toBe(true);
      // The valid token should still be processed
      expect(result.processed).toContain('test.valid');
    });

    it('Bug 3: watch() does not throw when watched token is deleted', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('primary', color('#0066cc'));

      const handler = vi.fn();
      book.watch('brand.primary', handler);

      // Delete the token — should not throw
      expect(() => brand.delete('primary')).not.toThrow();

      // Callback should have been called with undefined
      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0]).toBeUndefined();
    });

    it('Bug 4: propagated tokenChanged events include dependent new resolved value', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      const ui = book.addScope('ui');
      brand.set('primary', color('#0066cc'));
      ui.set('bg', ref('brand.primary'));

      const events: any[] = [];
      book.on('tokenChanged', (event: any) => {
        events.push(event.detail);
      });

      brand.set('primary', color('#ff0000'));

      // Find the event for the dependent (ui.bg)
      const uiBgEvent = events.find(e => e.key === 'ui.bg');
      expect(uiBgEvent).toBeDefined();
      expect(uiBgEvent.newValue).toBe('#ff0000');
    });

    it('processes token deletion in batch mode and clears it from the queue', () => {
      const book = new DesignBook('test', { mode: 'batch' });
      const brand = book.addScope('brand');

      brand.set('primary', color('#0066cc'));
      expect(book.flush().errors).toHaveLength(0);

      brand.delete('primary');
      expect(book.batchQueueSize).toBe(1);

      const result = book.flush();

      expect(result.errors).toHaveLength(0);
      expect(result.processed).toContain('brand.primary');
      expect(book.batchQueueSize).toBe(0);
      expect(book.has('brand.primary')).toBe(false);
    });

    it('keeps inherited dependencies when deleting a local override', () => {
      const book = new DesignBook('test');
      const light = book.addScope('light');
      const dark = book.addScope('dark', { extends: 'light' });
      const ui = book.addScope('ui');

      light.set('primary', color('#0066cc'));
      dark.set('primary', color('#ff0000'));
      ui.set('bg', ref('dark.primary'));

      expect(book.resolve('ui.bg')).toBe('#ff0000');

      dark.delete('primary');

      expect(book.resolve('dark.primary')).toBe('#0066cc');
      expect(book.resolve('ui.bg')).toBe('#0066cc');
      expect(book.getDependencyGraph().getPrerequisitesFor('dark.primary')).toContain('light.primary');

      light.set('primary', color('#00aa00'));

      expect(book.resolve('dark.primary')).toBe('#00aa00');
      expect(book.resolve('ui.bg')).toBe('#00aa00');
    });

    it('updates reference cache when a referenced token is deleted', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      const semantic = book.addScope('semantic');

      brand.set('primary', color('#0066cc'));
      semantic.set('bg', ref('brand.primary'));
      brand.set('primary', color('#0055cc'));

      const token = book.getTokenByKey('semantic.bg') as any;
      expect(getReferenceResolution(token)?.isResolvable).toBe(true);

      brand.delete('primary');

      expect(getReferenceResolution(token)?.isResolvable).toBe(false);
    });
  });

  describe('source introspection', () => {
    it('exposes source keys for inherited tokens', () => {
      const book = new DesignBook('test');
      const light = book.addScope('light');
      const dark = book.addScope('dark', { extends: 'light' });

      light.set('primary', color('#0066cc'));

      expect(book.getSourceKey('dark.primary')).toBe('light.primary');
      expect(book.isInherited('dark.primary')).toBe(true);
    });
  });

  describe('re-entrancy', () => {
    it('queues changes triggered by event handlers in auto mode', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      const ui = book.addScope('ui');

      brand.set('primary', color('#0066cc'));
      ui.set('bg', ref('brand.primary'));

      book.on('tokenChanged', (event: any) => {
        if (event.detail.key === 'brand.primary') {
          brand.set('derived', color('#111111'));
        }
      });

      brand.set('primary', color('#ff0000'));
      expect(book.resolve('brand.derived')).toBe('#111111');
      expect(book.resolve('ui.bg')).toBe('#ff0000');
    });
  });
});
