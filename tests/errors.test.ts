import { describe, it, expect } from 'vitest';
import { TokenError, ScopeError, CircularDependencyError, FunctionError } from '../src/errors';

describe('TokenError', () => {
  it('stores message and optional tokenKey', () => {
    const err = new TokenError('bad token', 'brand.primary');
    expect(err.message).toBe('bad token');
    expect(err.tokenKey).toBe('brand.primary');
    expect(err.name).toBe('TokenError');
    expect(err).toBeInstanceOf(Error);
  });

  it('stores optional context', () => {
    const err = new TokenError('fail', 'x', { scope: 'brand' });
    expect(err.context).toEqual({ scope: 'brand' });
  });
});

describe('ScopeError', () => {
  it('stores message and optional scopeName', () => {
    const err = new ScopeError('not found', 'brand');
    expect(err.message).toBe('not found');
    expect(err.scopeName).toBe('brand');
    expect(err.name).toBe('ScopeError');
  });
});

describe('CircularDependencyError', () => {
  it('auto-generates message from path', () => {
    const err = new CircularDependencyError(['a', 'b', 'c', 'a']);
    expect(err.message).toBe('Circular dependency detected: a → b → c → a');
    expect(err.path).toEqual(['a', 'b', 'c', 'a']);
    expect(err.name).toBe('CircularDependencyError');
  });
});

describe('FunctionError', () => {
  it('stores message, functionName, and options', () => {
    const err = new FunctionError('bad mix', 'colorMix', { ratio: 1.5 });
    expect(err.message).toBe('bad mix');
    expect(err.functionName).toBe('colorMix');
    expect(err.options).toEqual({ ratio: 1.5 });
    expect(err.name).toBe('FunctionError');
  });
});
