import { describe, it, expect } from 'vitest';
import { DesignBook } from '../src/design-book';
import { Renderer } from '../src/renderers/renderer';
import { color, rem, ref, string } from '../src/tokens';
import { TokenError } from '../src/errors';

describe('typography composites', () => {
  describe('compose marker on Scope', () => {
    it('exposes the compose marker passed via addScope', () => {
      const book = new DesignBook('test');
      const scope = book.addScope('heading-lg', { compose: 'typography' });
      expect(scope.compose).toBe('typography');
    });

    it('returns undefined when no marker is set', () => {
      const book = new DesignBook('test');
      const scope = book.addScope('plain');
      expect(scope.compose).toBeUndefined();
    });

    it('inherits compose from the extends target', () => {
      const book = new DesignBook('test');
      book.addScope('heading-lg', { compose: 'typography' });
      const variant = book.addScope('hero-title', { extends: 'heading-lg' });
      expect(variant.compose).toBe('typography');
    });

    it('lets a child override compose explicitly', () => {
      const book = new DesignBook('test');
      book.addScope('heading-lg', { compose: 'typography' });
      const variant = book.addScope('weird', { extends: 'heading-lg', compose: 'something-else' });
      expect(variant.compose).toBe('something-else');
    });
  });

  describe('addTypography helper', () => {
    it('creates a typography-composed scope with the given properties', () => {
      const book = new DesignBook('test');
      const heading = book.addTypography('heading-lg', {
        fontFamily: 'Inter, sans-serif',
        fontSize: rem(2),
        fontWeight: '700',
        lineHeight: '1.15',
      });

      expect(heading.compose).toBe('typography');
      expect(book.resolve('heading-lg.fontFamily')).toBe('Inter, sans-serif');
      expect(book.resolve('heading-lg.fontSize')).toBe('2rem');
      expect(book.resolve('heading-lg.fontWeight')).toBe('700');
      expect(book.resolve('heading-lg.lineHeight')).toBe('1.15');
    });

    it('auto-wraps plain strings with string()', () => {
      const book = new DesignBook('test');
      const heading = book.addTypography('h', { fontFamily: 'Inter' });
      const token = heading.get('fontFamily');
      expect(token?.type).toBe('string');
    });

    it('passes references through unchanged', () => {
      const book = new DesignBook('test');
      const fonts = book.addScope('fonts');
      fonts.set('sans', string('Inter, system-ui'));

      const heading = book.addTypography('h', {
        fontFamily: ref('fonts.sans'),
        fontSize: rem(2),
      });

      expect(book.resolve('h.fontFamily')).toBe('Inter, system-ui');
      const token = heading.get('fontFamily');
      expect(token?.type).toBe('reference');
    });

    it('supports extends through the helper', () => {
      const book = new DesignBook('test');
      book.addTypography('heading-lg', {
        fontFamily: 'Inter',
        fontSize: rem(2),
        fontWeight: '700',
      });
      const variant = book.addTypography(
        'hero-title',
        { fontWeight: '800' },
        { extends: 'heading-lg' },
      );
      expect(variant.compose).toBe('typography');
      expect(book.resolve('hero-title.fontFamily')).toBe('Inter');
      expect(book.resolve('hero-title.fontSize')).toBe('2rem');
      expect(book.resolve('hero-title.fontWeight')).toBe('800');
    });

    it('rejects unsupported value types', () => {
      const book = new DesignBook('test');
      expect(() =>
        book.addTypography('h', { fontSize: 42 as any }),
      ).toThrow(TokenError);
    });

    it('accepts arbitrary keys (conventional, not validated)', () => {
      const book = new DesignBook('test');
      const heading = book.addTypography('h', {
        fontFamily: 'Inter',
        textTransform: 'uppercase',
        fontFeatureSettings: '"ss01" on',
      });
      expect(book.resolve('h.textTransform')).toBe('uppercase');
      expect(book.resolve('h.fontFeatureSettings')).toBe('"ss01" on');
      expect(heading.getAllKeys()).toContain('textTransform');
    });
  });

  describe('CSS renderer with typography', () => {
    it('emits a class block for each composed typography scope', () => {
      const book = new DesignBook('test');
      book.addTypography('heading-lg', {
        fontFamily: 'Inter',
        fontSize: rem(2),
        fontWeight: '700',
        lineHeight: '1.15',
        letterSpacing: '-0.02em',
      });

      const out = book.render('css-variables');
      expect(out).toContain('--heading-lg-font-family: Inter');
      expect(out).toContain('--heading-lg-font-size: 2rem');
      expect(out).toContain('.heading-lg {');
      expect(out).toContain('font-family: var(--heading-lg-font-family);');
      expect(out).toContain('font-size: var(--heading-lg-font-size);');
      expect(out).toContain('letter-spacing: var(--heading-lg-letter-spacing);');
    });

    it('emits arbitrary camelCase keys as kebab-cased CSS properties', () => {
      const book = new DesignBook('test');
      book.addTypography('h', {
        fontFamily: 'Inter',
        textTransform: 'uppercase',
      });
      const out = book.render('css-variables');
      expect(out).toContain('text-transform: var(--h-text-transform);');
    });

    it('respects the classPrefix render option', () => {
      const book = new DesignBook('test');
      book.addTypography('heading-lg', { fontFamily: 'Inter', fontSize: rem(2) });
      const out = book.render('css-variables', { classPrefix: 't-' });
      expect(out).toContain('.t-heading-lg {');
      expect(out).not.toContain('\n.heading-lg {');
    });

    it('does not emit class blocks for non-composed scopes', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('primary', color('#0066cc'));
      const out = book.render('css-variables');
      expect(out).not.toMatch(/^\.brand \{/m);
    });

    it('skips composed scopes that have no keys', () => {
      const book = new DesignBook('test');
      book.addScope('empty', { compose: 'typography' });
      const out = book.render('css-variables');
      expect(out).not.toContain('.empty {');
    });
  });

  describe('W3 Design Tokens renderer with typography', () => {
    it('emits composed typography scopes under a shared "typography" group', () => {
      const book = new DesignBook('test');
      book.addTypography('heading-lg', {
        fontFamily: 'Inter',
        fontSize: rem(2),
        fontWeight: '700',
      });

      const renderer = new Renderer(book, 'w3-design-tokens');
      const obj = renderer.renderW3DesignTokensObject() as any;
      expect(obj.typography).toBeDefined();
      expect(obj.typography['heading-lg']).toBeDefined();
      expect(obj.typography['heading-lg'].$type).toBe('typography');
      expect(obj.typography['heading-lg'].$value).toEqual({
        fontFamily: 'Inter',
        fontSize: '2rem',
        fontWeight: '700',
      });
    });

    it('merges multiple typography scopes into one typography group', () => {
      const book = new DesignBook('test');
      book.addTypography('heading-lg', { fontFamily: 'Inter' });
      book.addTypography('body', { fontFamily: 'Georgia' });

      const renderer = new Renderer(book, 'w3-design-tokens');
      const obj = renderer.renderW3DesignTokensObject() as any;
      expect(Object.keys(obj.typography)).toEqual(['heading-lg', 'body']);
    });

    it('does not emit a flat scope entry for typography-composed scopes', () => {
      const book = new DesignBook('test');
      book.addTypography('heading-lg', { fontFamily: 'Inter' });

      const renderer = new Renderer(book, 'w3-design-tokens');
      const obj = renderer.renderW3DesignTokensObject() as any;
      expect(obj['heading-lg']).toBeUndefined();
    });

    it('keeps regular scopes alongside the typography group', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('primary', color('#0066cc'));
      book.addTypography('heading-lg', { fontFamily: 'Inter' });

      const renderer = new Renderer(book, 'w3-design-tokens');
      const obj = renderer.renderW3DesignTokensObject() as any;
      expect(obj.brand.primary.$type).toBe('color');
      expect(obj.typography['heading-lg'].$type).toBe('typography');
    });

    it('carries scope description through to $description', () => {
      const book = new DesignBook('test');
      book.addTypography(
        'heading-lg',
        { fontFamily: 'Inter' },
        { description: 'Large display heading' },
      );

      const renderer = new Renderer(book, 'w3-design-tokens');
      const obj = renderer.renderW3DesignTokensObject() as any;
      expect(obj.typography['heading-lg'].$description).toBe('Large display heading');
    });
  });
});
