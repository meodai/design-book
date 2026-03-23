import { describe, it, expect, vi } from 'vitest';
import { ReferenceResolver } from '../src/reference-resolver';
import type { ReferenceValue } from '../src/tokens';

function createMockBook(tokens: Record<string, any> = {}, resolvedValues: Record<string, string> = {}) {
  return {
    resolve: vi.fn((key: string) => {
      if (resolvedValues[key] !== undefined) return resolvedValues[key];
      throw new Error(`Cannot resolve ${key}`);
    }),
    getTokenByKey: vi.fn((key: string) => tokens[key] ?? undefined),
    getDependencyGraph: vi.fn(() => ({
      getDependentsOf: vi.fn(() => []),
    })),
  };
}

describe('ReferenceResolver', () => {
  it('updateReferenceMetadata marks resolvable ref', () => {
    const book = createMockBook(
      { 'brand.primary': { type: 'color', rawValue: '#fff' } },
      { 'brand.primary': '#fff' },
    );
    const resolver = new ReferenceResolver(book as any);
    const r: ReferenceValue = { type: 'reference', key: 'brand.primary' };

    resolver.updateReferenceMetadata(r);

    expect(r.resolvedType).toBe('color');
    expect(r.resolvedMetadata?.isResolvable).toBe(true);
    expect(r.resolvedMetadata?.errorMessage).toBeUndefined();
  });

  it('updateReferenceMetadata marks unresolvable ref', () => {
    const book = createMockBook();
    const resolver = new ReferenceResolver(book as any);
    const r: ReferenceValue = { type: 'reference', key: 'missing.token' };

    resolver.updateReferenceMetadata(r);

    expect(r.resolvedType).toBeUndefined();
    expect(r.resolvedMetadata?.isResolvable).toBe(false);
    expect(r.resolvedMetadata?.errorMessage).toBeDefined();
  });

  it('getCachedType returns cached type without resolution', () => {
    const resolver = new ReferenceResolver({} as any);
    const r: ReferenceValue = { type: 'reference', key: 'x', resolvedType: 'color' };
    expect(resolver.getCachedType(r)).toBe('color');
  });

  it('isResolvable returns cached resolvability', () => {
    const resolver = new ReferenceResolver({} as any);
    const r: ReferenceValue = {
      type: 'reference', key: 'x',
      resolvedMetadata: { isResolvable: true },
    };
    expect(resolver.isResolvable(r)).toBe(true);
  });
});
