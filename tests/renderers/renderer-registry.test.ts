import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../src/design-book';
import { color, px } from '../../src/tokens';
import { TokenError } from '../../src/errors';

describe('renderer registry', () => {
  it('pre-registers all built-in renderers', () => {
    const book = new DesignBook('demo');
    const names = book.getRendererNames();
    expect(names).toContain('css-variables');
    expect(names).toContain('json');
    expect(names).toContain('w3-design-tokens');
    expect(names).toContain('svg');
  });

  it('dispatches book.render(name) to the built-in css renderer', () => {
    const book = new DesignBook('demo');
    const brand = book.addScope('brand');
    brand.set('primary', color('#0066cc'));

    const out = book.render('css-variables');
    expect(out).toContain('--brand-primary');
    expect(out).toContain('#0066cc');
  });

  it('dispatches book.render("json") to the JSON renderer', () => {
    const book = new DesignBook('demo');
    const brand = book.addScope('brand');
    brand.set('primary', color('#0066cc'));

    const parsed = JSON.parse(book.render('json'));
    expect(parsed['brand.primary']).toBe('#0066cc');
  });

  it('passes options through to the SVG renderer', () => {
    const book = new DesignBook('demo');
    const brand = book.addScope('brand');
    brand.set('primary', color('#0066cc'));

    const withConn = book.render('svg', { showConnections: true });
    const withoutConn = book.render('svg', { showConnections: false });
    expect(withConn).toContain('<svg');
    expect(withoutConn).toContain('<svg');
    // The two outputs should differ — one renders a connections group, the other doesn't.
    expect(withConn).not.toBe(withoutConn);
  });

  it('lets a user register a custom renderer and invoke it by name', () => {
    const book = new DesignBook('demo');
    const brand = book.addScope('brand');
    brand.set('primary', color('#0066cc'));
    brand.set('space', px(8));

    book.registerRenderer('plain', (b) => {
      const lines: string[] = [];
      for (const scope of b.getAllScopes()) {
        for (const key of scope.getAllKeys()) {
          lines.push(`${scope.name}.${key} = ${b.resolve(`${scope.name}.${key}`)}`);
        }
      }
      return lines.join('\n');
    });

    const out = book.render('plain');
    expect(out).toBe('brand.primary = #0066cc\nbrand.space = 8px');
  });

  it('passes options to a custom renderer', () => {
    const book = new DesignBook('demo');
    book.registerRenderer('echo', (_b, options) => JSON.stringify(options ?? null));
    expect(book.render('echo')).toBe('null');
    expect(book.render('echo', { greeting: 'hi' })).toBe('{"greeting":"hi"}');
  });

  it('throws TokenError when rendering an unregistered name', () => {
    const book = new DesignBook('demo');
    expect(() => book.render('does-not-exist')).toThrow(TokenError);
    expect(() => book.render('does-not-exist')).toThrow(/not registered/);
  });

  it('replaces a renderer when the same name is registered twice', () => {
    const book = new DesignBook('demo');
    book.registerRenderer('x', () => 'first');
    book.registerRenderer('x', () => 'second');
    expect(book.render('x')).toBe('second');
  });

  it('exposes a registered renderer via getRenderer()', () => {
    const book = new DesignBook('demo');
    const fn = (_b: DesignBook) => 'hello';
    book.registerRenderer('mine', fn);
    expect(book.getRenderer('mine')).toBe(fn);
    expect(book.getRenderer('nope')).toBeUndefined();
  });
});
