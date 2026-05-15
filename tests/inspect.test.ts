import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { color, ref, px } from '../src/tokens';
import { darken } from '../src/functions/color/darken';
import { bestContrastWith } from '../src/functions/color/best-contrast';

describe('book.inspect', () => {
  it('returns null for unknown keys', () => {
    const book = new DesignBook('test');
    expect(book.inspect('missing.token')).toBeNull();
    expect(book.inspect('not-qualified')).toBeNull();
  });

  it('describes a value token (color)', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('brand', color('#0066cc'));

    const info = book.inspect('palette.brand');
    expect(info).not.toBeNull();
    expect(info!.key).toBe('palette.brand');
    expect(info!.value).toBe('#0066cc');
    expect(info!.tokenType).toBe('color');
    expect(info!.rawValue).toBe('#0066cc');
    expect(info!.dependencies).toEqual([]);
    expect(info!.isInherited).toBe(false);
    // No function / ref-only fields on a value token.
    expect(info!.function).toBeUndefined();
    expect(info!.refKey).toBeUndefined();
  });

  it('describes a value token (dimension) with unit', () => {
    const book = new DesignBook('test');
    const space = book.addScope('space');
    space.set('base', px(16));

    const info = book.inspect('space.base');
    expect(info!.value).toBe('16px');
    expect(info!.tokenType).toBe('dimension');
    expect(info!.rawValue).toBe(16);
    expect(info!.unit).toBe('px');
  });

  it('describes a reference token', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('brand', color('#0066cc'));

    const color2 = book.addScope('color');
    color2.set('accent', ref('palette.brand'));

    const info = book.inspect('color.accent');
    expect(info!.value).toBe('#0066cc');
    expect(info!.tokenType).toBe('reference');
    expect(info!.refKey).toBe('palette.brand');
    expect(info!.dependencies).toContain('palette.brand');
  });

  it('describes a function token (with args/options/returnType)', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('brand', color('#0066cc'));

    const ui = book.addScope('ui');
    ui.set('hover', darken(ref('palette.brand'), { amount: 0.15 }));

    const info = book.inspect('ui.hover');
    expect(info!.tokenType).toBe('function');
    expect(info!.function).toBe('darken');
    expect(info!.returnType).toBe('color');
    expect(info!.options).toEqual({ amount: 0.15 });
    expect(info!.args).toHaveLength(1);
    expect(info!.dependencies).toContain('palette.brand');
    // The resolved value should be a darkened brand colour.
    expect(info!.value).toMatch(/^#[0-9a-f]{6}$/);
    expect(info!.value).not.toBe('#0066cc');
  });

  it('lists graph dependents', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('brand', color('#0066cc'));

    const ui = book.addScope('ui');
    ui.set('hover', darken(ref('palette.brand'), { amount: 0.15 }));
    ui.set('focus', ref('palette.brand'));

    const info = book.inspect('palette.brand');
    expect(info!.dependents.sort()).toEqual(['ui.focus', 'ui.hover']);
  });

  it('marks inherited tokens and records the source key', () => {
    const book = new DesignBook('test');
    const light = book.addScope('light');
    light.set('bg', color('#ffffff'));

    const dark = book.addScope('dark', { extends: 'light' });
    // bg is inherited (not redefined locally)

    const info = book.inspect('dark.bg');
    expect(info!.value).toBe('#ffffff');
    expect(info!.isInherited).toBe(true);
    expect(info!.source).toBe('light.bg');
  });

  it('surfaces a token description', () => {
    const book = new DesignBook('test');
    const palette = book.addScope('palette');
    palette.set('brand', color('#0066cc', { description: 'Primary brand colour' }));

    expect(book.inspect('palette.brand')!.description).toBe('Primary brand colour');
  });

  it('returns undefined value when a token cannot resolve', () => {
    const book = new DesignBook('test');
    const ui = book.addScope('ui');
    // Reference to a token that doesn't exist.
    ui.set('text', ref('missing.scope'));

    const info = book.inspect('ui.text');
    expect(info!.value).toBeUndefined();
    expect(info!.refKey).toBe('missing.scope');
  });
});
