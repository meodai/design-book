import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { hex } from '../../../src/tokens';
import { relativeTo } from '../../../src/functions/color/relative-to';

describe('relativeTo', () => {
  it('rotates hue by +180 in oklch', () => {
    const book = new DesignBook('test');
    const ui = book.addScope('ui');
    ui.set('complement', relativeTo(hex('#0066cc'), 'oklch', [null, null, '+180']));

    const result = book.resolve('ui.complement');
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
    expect(result).not.toBe('#0066cc');
  });

  it('sets absolute lightness value', () => {
    const book = new DesignBook('test');
    const ui = book.addScope('ui');
    ui.set('dark', relativeTo(hex('#0066cc'), 'oklch', [0.3, null, null]));

    const result = book.resolve('ui.dark');
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('multiplies chroma by 0.5 (desaturate)', () => {
    const book = new DesignBook('test');
    const ui = book.addScope('ui');
    ui.set('muted', relativeTo(hex('#0066cc'), 'oklch', [null, '*0.5', null]));

    const result = book.resolve('ui.muted');
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('null preserves original channel value', () => {
    const book = new DesignBook('test');
    const ui = book.addScope('ui');
    ui.set('same', relativeTo(hex('#0066cc'), 'oklch', [null, null, null]));

    expect(book.resolve('ui.same')).toBe('#0066cc');
  });

  it('subtracts from a channel', () => {
    const book = new DesignBook('test');
    const ui = book.addScope('ui');
    ui.set('darker', relativeTo(hex('#0066cc'), 'oklch', ['-0.2', null, null]));

    const result = book.resolve('ui.darker');
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
    expect(result).not.toBe('#0066cc');
  });

  it('divides a channel', () => {
    const book = new DesignBook('test');
    const ui = book.addScope('ui');
    ui.set('halved', relativeTo(hex('#0066cc'), 'oklch', ['/2', null, null]));

    const result = book.resolve('ui.halved');
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
  });
});
