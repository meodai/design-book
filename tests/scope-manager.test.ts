import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScopeManager } from '../src/scope-manager';
import { hex, ref } from '../src/tokens';
import { DependencyGraph } from '../src/dependency-graph';

function createMockBook() {
  const graph = new DependencyGraph();
  const book: any = {
    getDependencyGraph: () => graph,
    getTokenByKey: vi.fn(),
    resolve: vi.fn(),
    getScope: vi.fn(),
    _notifyTokenChange: vi.fn(),
  };
  return book;
}

describe('ScopeManager', () => {
  let book: any;
  let manager: ScopeManager;

  beforeEach(() => {
    book = createMockBook();
    manager = new ScopeManager(book);
    book.getScope = (name: string) => manager.getScope(name);
  });

  it('addScope creates and returns a scope', () => {
    const scope = manager.addScope('brand');
    expect(scope).toBeDefined();
    expect(manager.hasScope('brand')).toBe(true);
  });

  it('addScope throws if scope already exists', () => {
    manager.addScope('brand');
    expect(() => manager.addScope('brand')).toThrow();
  });

  it('extendScope creates scope extending another', () => {
    const parent = manager.addScope('light');
    parent.set('bg', hex('#fff'));
    const child = manager.extendScope('dark', 'light');
    expect(child.get('bg')?.rawValue).toBe('#fff');
  });

  it('copyScope deep-copies tokens without inheritance', () => {
    const source = manager.addScope('source');
    source.set('a', hex('#111'));
    const copy = manager.copyScope('source', 'copy');
    expect(copy.get('a')?.rawValue).toBe('#111');
    // Modifying source doesn't affect copy
    source.set('a', hex('#222'));
    expect(copy.get('a')?.rawValue).toBe('#111');
  });

  it('deleteScope removes scope', () => {
    manager.addScope('brand');
    manager.deleteScope('brand');
    expect(manager.hasScope('brand')).toBe(false);
  });

  it('getAllScopes returns all scopes', () => {
    manager.addScope('a');
    manager.addScope('b');
    const all = manager.getAllScopes();
    expect(all).toHaveLength(2);
  });

  it('getScopeDependencies finds external references', () => {
    manager.addScope('brand');
    const ui = manager.addScope('ui');
    ui.set('bg', ref('brand.primary'));
    const deps = manager.getScopeDependencies('ui');
    expect(deps).toContain('brand.primary');
  });
});
