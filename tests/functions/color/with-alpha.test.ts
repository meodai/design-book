import { describe, it, expect, beforeAll } from 'vitest';
import { DesignBook } from '../../../src/design-book';
import { color, ref } from '../../../src/tokens';
import { relativeTo, withAlpha } from '../../../src/functions/color/relative-to';
import { closest } from '../../../src/functions/generic/closest';
import { Renderer } from '../../../src/renderers/renderer';
import { FunctionError } from '../../../src/errors';
import { parseTokenInput } from '../../../site/editor/editor-input-parser';
import { loadEditorModule } from '../../editor/load-editor';

function book() {
  const b = new DesignBook('t');
  const brand = b.addScope('brand');
  brand.set('ink', color('#1a1a1a'));
  brand.set('glass', color('#0066cc80'));
  brand.set('wide', color('color(display-p3 0 1 0)'));
  return { b, brand, ui: b.addScope('ui') };
}

describe('withAlpha', () => {
  it('keeps the color and sets the alpha', () => {
    const { b, ui } = book();
    ui.set('overlay', withAlpha(ref('brand.ink'), 0.5));
    ui.set('clear', withAlpha(ref('brand.ink'), 0));
    ui.set('solid', withAlpha(ref('brand.ink'), 1));
    expect(b.resolve('ui.overlay')).toBe('#1a1a1a80');
    expect(b.resolve('ui.clear')).toBe('#1a1a1a00');
    expect(b.resolve('ui.solid')).toBe('#1a1a1a');
  });

  it('sets the alpha, whatever it was: it does not multiply', () => {
    const { b, ui } = book();
    ui.set('more', withAlpha(ref('brand.glass'), 0.25));
    ui.set('opaque', withAlpha(ref('brand.glass'), 1));
    expect(b.resolve('ui.more')).toBe('#0066cc40');
    expect(b.resolve('ui.opaque')).toBe('#0066cc');
  });

  it('takes any color the book reads, wide-gamut ones mapped into sRGB', () => {
    const { b, ui } = book();
    ui.set('x', withAlpha(ref('brand.wide'), 0.5));
    expect(b.resolve('ui.x')).toMatch(/^#[0-9a-f]{6}80$/);
  });

  it('follows the color it is made from', () => {
    const { b, brand, ui } = book();
    ui.set('overlay', withAlpha(ref('brand.ink'), 0.5));
    brand.set('ink', color('#ffffff'));
    expect(b.resolve('ui.overlay')).toBe('#ffffff80');
  });

  it('renders to CSS as relative color syntax, which sets alpha', () => {
    const { b, ui } = book();
    ui.set('overlay', withAlpha(ref('brand.ink'), 0.5));
    expect(new Renderer(b, 'css-variables').render()).toContain('--ui-overlay: rgb(from var(--brand-ink) r g b / 0.5);');
  });

  it('is relativeTo with the alpha slot', () => {
    expect(withAlpha(ref('brand.ink'), 0.5)).toEqual(relativeTo(ref('brand.ink'), 'rgb', [null, null, null, 0.5]));
  });

  it('refuses an alpha outside 0 to 1', () => {
    expect(() => withAlpha(ref('brand.ink'), 1.5)).toThrow(FunctionError);
    expect(() => withAlpha(ref('brand.ink'), -0.1)).toThrow(/between 0 and 1/);
    expect(() => withAlpha(ref('brand.ink'), Number.NaN)).toThrow(FunctionError);
  });

  it('a translucent member is judged by how it looks on the backdrop', () => {
    const { b, ui } = book();
    const pool = b.addScope('pool');
    pool.set('faint', withAlpha(ref('brand.ink'), 0.1));
    pool.set('mid', color('#8c8c8c'));
    ui.set('like', closest(color('#e8e8e8'), ref('pool'), { readableOn: color('#ffffff'), readableContrast: 1 }));
    expect(b.resolve('ui.like')).toBe('#1a1a1a1a');
  });
});

describe('relativeTo alpha', () => {
  it('changes alpha by an operator, kept within 0 to 1', () => {
    const { b, ui } = book();
    ui.set('half', relativeTo(ref('brand.glass'), 'oklch', [null, null, null, '*0.5']));
    ui.set('up', relativeTo(ref('brand.glass'), 'oklch', [null, null, null, '+0.9']));
    expect(b.resolve('ui.half')).toBe('#0066cc40');
    expect(b.resolve('ui.up')).toBe('#0066cc');
  });

  it('renders the alpha change in CSS', () => {
    const { b, ui } = book();
    ui.set('half', relativeTo(ref('brand.glass'), 'oklch', ['+0.1', null, null, '*0.5']));
    expect(new Renderer(b, 'css-variables').render())
      .toContain('--ui-half: oklch(from var(--brand-glass) calc(l + 0.1) c h / calc(alpha * 0.5));');
  });
});

describe('withAlpha in the editor', () => {
  let getTokenDisplayValue: (scope: unknown, key: string) => string;
  beforeAll(async () => {
    ({ getTokenDisplayValue } = await loadEditorModule());
  });

  it('parses and prints back as written', () => {
    const { b, ui } = book();
    const token = parseTokenInput("withAlpha(ref('brand.ink'), 0.5)", b, ui);
    expect(token).toEqual(withAlpha(ref('brand.ink'), 0.5));
    ui.set('overlay', token);
    expect(getTokenDisplayValue(ui, 'overlay')).toBe("withAlpha(ref('brand.ink'), 0.5)");
  });
});
