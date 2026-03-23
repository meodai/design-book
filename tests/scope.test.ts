import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Scope } from '../src/scope';
import { color, ref, px } from '../src/tokens';
import { DependencyGraph } from '../src/dependency-graph';

function createMockBook() {
  const graph = new DependencyGraph();
  const scopes = new Map<string, Scope>();
  const book: any = {
    getDependencyGraph: () => graph,
    getTokenByKey: vi.fn((key: string) => {
      const [scopeName, tokenName] = key.split('.');
      return scopes.get(scopeName)?.get(tokenName);
    }),
    resolve: vi.fn((key: string) => {
      const [scopeName, tokenName] = key.split('.');
      const scope = scopes.get(scopeName);
      if (!scope) throw new Error(`Scope ${scopeName} not found`);
      return scope.resolve(tokenName);
    }),
    getScope: vi.fn((name: string) => scopes.get(name)),
    _notifyTokenChange: vi.fn(),
    _scopes: scopes,
  };
  return book;
}

describe('Scope', () => {
  let book: any;

  beforeEach(() => {
    book = createMockBook();
  });

  it('sets and gets tokens', () => {
    const scope = new Scope('brand', book);
    book._scopes.set('brand', scope);
    const c = color('#ff0000');
    scope.set('primary', c);
    expect(scope.get('primary')).toEqual(c);
  });

  it('has() checks token existence', () => {
    const scope = new Scope('brand', book);
    book._scopes.set('brand', scope);
    expect(scope.has('primary')).toBe(false);
    scope.set('primary', color('#ff0000'));
    expect(scope.has('primary')).toBe(true);
  });

  it('getAllKeys returns all local keys', () => {
    const scope = new Scope('brand', book);
    book._scopes.set('brand', scope);
    scope.set('primary', color('#ff0000'));
    scope.set('spacing', px(8));
    expect(scope.getAllKeys().sort()).toEqual(['primary', 'spacing']);
  });

  it('resolves basic TokenValue to rawValue string', () => {
    const scope = new Scope('brand', book);
    book._scopes.set('brand', scope);
    scope.set('primary', color('#ff0000'));
    expect(scope.resolve('primary')).toBe('#ff0000');
  });

  it('resolves dimension TokenValue with unit suffix', () => {
    const scope = new Scope('brand', book);
    book._scopes.set('brand', scope);
    scope.set('spacing', px(16));
    expect(scope.resolve('spacing')).toBe('16px');
  });

  it('resolves ReferenceValue via book.resolve', () => {
    const brand = new Scope('brand', book);
    book._scopes.set('brand', brand);
    brand.set('primary', color('#0066cc'));

    const semantic = new Scope('semantic', book);
    book._scopes.set('semantic', semantic);
    semantic.set('bg', ref('brand.primary'));

    book.resolve.mockImplementation((key: string) => {
      const [s, t] = key.split('.');
      return book._scopes.get(s)!.resolve(t);
    });

    expect(semantic.resolve('bg')).toBe('#0066cc');
  });

  describe('inheritance', () => {
    it('inherits tokens from parent scope', () => {
      const parent = new Scope('light', book);
      book._scopes.set('light', parent);
      parent.set('bg', color('#ffffff'));
      parent.set('primary', color('#0066cc'));

      const child = new Scope('dark', book, { extends: 'light' });
      book._scopes.set('dark', child);
      child.set('bg', color('#1a1a1a'));

      expect(child.get('bg')?.rawValue).toBe('#1a1a1a'); // overridden
      expect(child.get('primary')?.rawValue).toBe('#0066cc'); // inherited
    });

    it('getAllKeys includes inherited keys', () => {
      const parent = new Scope('light', book);
      book._scopes.set('light', parent);
      parent.set('bg', color('#fff'));
      parent.set('primary', color('#000'));

      const child = new Scope('dark', book, { extends: 'light' });
      book._scopes.set('dark', child);
      child.set('bg', color('#111'));
      child.set('surface', color('#222'));

      const keys = child.getAllKeys().sort();
      expect(keys).toEqual(['bg', 'primary', 'surface']);
    });
  });

  it('resolves FunctionTokenValue by executing implementation', () => {
    const scope = new Scope('test', book);
    book._scopes.set('test', scope);
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

  it('Bug 6: reference cache is updated when referenced token changes', () => {
    const brand = new Scope('brand', book);
    book._scopes.set('brand', brand);

    const semantic = new Scope('semantic', book);
    book._scopes.set('semantic', semantic);

    // Set up a reference before the target exists
    const myRef = ref('brand.primary');
    semantic.set('bg', myRef);

    // The reference should not be resolvable yet (no brand.primary)
    // Now set the target
    brand.set('primary', color('#0066cc'));

    // After setting the target, the graph needs edges for updateAllReferencesTo to work.
    // We need to set up the graph edges manually since _notifyTokenChange is mocked.
    const graph = book.getDependencyGraph();
    graph.addNode('brand.primary');
    graph.addNode('semantic.bg');
    graph.updateEdges('semantic.bg', ['brand.primary']);

    // Now update brand.primary again and manually trigger cache refresh for the mock setup
    book.resolve.mockImplementation((key: string) => {
      const [s, t] = key.split('.');
      return book._scopes.get(s)!.resolve(t);
    });

    brand.set('primary', color('#ff0000'));
    brand.updateReferenceCaches('brand.primary');

    // The reference's resolvedMetadata should now be updated
    const token = semantic.get('bg') as any;
    expect(token.resolvedMetadata).toBeDefined();
    expect(token.resolvedMetadata.isResolvable).toBe(true);
  });

  it('allTokens returns all token objects including inherited', () => {
    const parent = new Scope('light', book);
    book._scopes.set('light', parent);
    parent.set('bg', color('#fff'));

    const child = new Scope('dark', book, { extends: 'light' });
    book._scopes.set('dark', child);
    child.set('surface', color('#222'));

    const tokens = child.allTokens();
    expect(tokens['bg']).toBeDefined();
    expect(tokens['surface']).toBeDefined();
  });
});
