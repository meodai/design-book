import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Scope } from '../src/scope';
import { color, px, ref } from '../src/tokens';
import { DependencyGraph } from '../src/dependency-graph';
import { ResolveCache } from '../src/resolve-cache';

function createMockBook() {
  const graph = new DependencyGraph();
  const scopes = new Map<string, Scope>();
  const book: any = {
    getDependencyGraph: () => graph,
    _cache: new ResolveCache(),
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
    getFunction: vi.fn(),
    _accept: vi.fn(),
    _settle: vi.fn(),
    on: vi.fn(() => () => {}),
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

        expect((child.get('bg') as any)?.rawValue).toBe('#1a1a1a'); // overridden
        expect((child.get('primary') as any)?.rawValue).toBe('#0066cc'); // inherited
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

  it('resolves FunctionTokenValue through the function registry', () => {
    const scope = new Scope('test', book);
    book._scopes.set('test', scope);
    book.getFunction.mockReturnValue((text: string) => `${text}!`);
    scope.set('greeting', { type: 'string', rawValue: 'Hello' } as any);
    scope.set('loud', {
      type: 'function',
      name: 'exclaim',
      args: ['Hello'],
      metadata: { dependencies: [] },
    } as any);
    expect(scope.resolve('loud')).toBe('Hello!');
  });

  it('getSourceKey and isInherited expose token provenance', () => {
    const parent = new Scope('light', book);
    book._scopes.set('light', parent);
    parent.set('primary', color('#fff'));

    const child = new Scope('dark', book, { extends: 'light' });
    book._scopes.set('dark', child);

    expect(child.getSourceKey('primary')).toBe('light.primary');
    expect(child.isInherited('primary')).toBe(true);
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
