import { describe, it, expect, vi } from 'vitest';
import { DesignBook } from '../src/design-book';
import { hex, ref, px } from '../src/tokens';

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
      brand.set('primary', hex('#0066cc'));
      expect(book.resolve('brand.primary')).toBe('#0066cc');
    });

    it('has checks existence', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('primary', hex('#0066cc'));
      expect(book.has('brand.primary')).toBe(true);
      expect(book.has('brand.missing')).toBe(false);
    });

    it('resolves references across scopes', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('primary', hex('#0066cc'));
      const ui = book.addScope('ui');
      ui.set('bg', ref('brand.primary'));
      expect(book.resolve('ui.bg')).toBe('#0066cc');
    });

    it('getTokenByKey returns raw token', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('primary', hex('#0066cc'));
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
      brand.set('primary', hex('#0066cc'));
      expect(handler).toHaveBeenCalled();
    });

    it('watch fires for specific key', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('primary', hex('#000000'));
      const handler = vi.fn();
      book.watch('brand.primary', handler);
      brand.set('primary', hex('#ffffff'));
      expect(handler).toHaveBeenCalledWith('#ffffff', expect.anything());
    });

    it('fires scopeAdded on addScope', () => {
      const book = new DesignBook('test');
      const handler = vi.fn();
      book.on('scopeAdded', handler);
      book.addScope('brand');
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('auto mode propagation', () => {
    it('updates dependents when prerequisite changes', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      const ui = book.addScope('ui');
      brand.set('primary', hex('#0066cc'));
      ui.set('bg', ref('brand.primary'));
      expect(book.resolve('ui.bg')).toBe('#0066cc');

      brand.set('primary', hex('#ff0000'));
      expect(book.resolve('ui.bg')).toBe('#ff0000');
    });
  });

  describe('batch mode', () => {
    it('queues changes and processes on flush', () => {
      const book = new DesignBook('test', { mode: 'batch' });
      const brand = book.addScope('brand');
      brand.set('primary', hex('#0066cc'));
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
      brand.set('primary', hex('#0066cc'));
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
        rawValue: 'exclaim',
        implementation: (text: string) => `${text}!`,
        args: ['Hello'],
        metadata: { dependencies: [], visualDependencies: [] },
      } as any);
      expect(scope.resolve('loud')).toBe('Hello!');
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
      book.on('change', handler);
      brand.set('primary', hex('#0066cc'));
      expect(handler).toHaveBeenCalled();
      const detail = handler.mock.calls[0][0].detail;
      expect(detail.changedKeys).toContain('brand.primary');
      expect(detail.scopes).toContain('brand');
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

  describe('re-entrancy', () => {
    it('queues changes triggered by event handlers in auto mode', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      const ui = book.addScope('ui');

      brand.set('primary', hex('#0066cc'));
      ui.set('bg', ref('brand.primary'));

      book.on('tokenChanged', (event: any) => {
        if (event.detail.key === 'brand.primary') {
          brand.set('derived', hex('#111111'));
        }
      });

      brand.set('primary', hex('#ff0000'));
      expect(book.resolve('brand.derived')).toBe('#111111');
      expect(book.resolve('ui.bg')).toBe('#ff0000');
    });
  });
});
