import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Scope } from '../src/scope';
import { hex, ref, px } from '../src/tokens';
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
    const color = hex('#ff0000');
    scope.set('primary', color);
    expect(scope.get('primary')).toEqual(color);
  });

  it('has() checks token existence', () => {
    const scope = new Scope('brand', book);
    book._scopes.set('brand', scope);
    expect(scope.has('primary')).toBe(false);
    scope.set('primary', hex('#ff0000'));
    expect(scope.has('primary')).toBe(true);
  });

  it('getAllKeys returns all local keys', () => {
    const scope = new Scope('brand', book);
    book._scopes.set('brand', scope);
    scope.set('primary', hex('#ff0000'));
    scope.set('spacing', px(8));
    expect(scope.getAllKeys().sort()).toEqual(['primary', 'spacing']);
  });

  it('resolves basic TokenValue to rawValue string', () => {
    const scope = new Scope('brand', book);
    book._scopes.set('brand', scope);
    scope.set('primary', hex('#ff0000'));
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
    brand.set('primary', hex('#0066cc'));

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
      parent.set('bg', hex('#ffffff'));
      parent.set('primary', hex('#0066cc'));

      const child = new Scope('dark', book, { extends: 'light' });
      book._scopes.set('dark', child);
      child.set('bg', hex('#1a1a1a'));

      expect(child.get('bg')?.rawValue).toBe('#1a1a1a'); // overridden
      expect(child.get('primary')?.rawValue).toBe('#0066cc'); // inherited
    });

    it('getAllKeys includes inherited keys', () => {
      const parent = new Scope('light', book);
      book._scopes.set('light', parent);
      parent.set('bg', hex('#fff'));
      parent.set('primary', hex('#000'));

      const child = new Scope('dark', book, { extends: 'light' });
      book._scopes.set('dark', child);
      child.set('bg', hex('#111'));
      child.set('surface', hex('#222'));

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

  it('allTokens returns all token objects including inherited', () => {
    const parent = new Scope('light', book);
    book._scopes.set('light', parent);
    parent.set('bg', hex('#fff'));

    const child = new Scope('dark', book, { extends: 'light' });
    book._scopes.set('dark', child);
    child.set('surface', hex('#222'));

    const tokens = child.allTokens();
    expect(tokens['bg']).toBeDefined();
    expect(tokens['surface']).toBeDefined();
  });
});
