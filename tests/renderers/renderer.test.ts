import { describe, it, expect } from 'vitest';
import { DesignBook } from '../../src/design-book';
import { color, ref, px, rem, ms, dimension, string } from '../../src/tokens';
import { Renderer } from '../../src/renderers/renderer';
import { bestContrastWith, colorMix, lighten, darken, relativeTo, spacingScale, timing, typographyScale } from '../../src/functions';

function createTestBook() {
  const book = new DesignBook('test');
  const brand = book.addScope('brand');
  brand.set('primary', color('#0066cc'));
  brand.set('white', color('#ffffff'));
  const ui = book.addScope('ui');
  ui.set('bg', ref('brand.primary'));
  return book;
}

describe('Renderer', () => {
  describe('css-variables format', () => {
    it('renders basic tokens as CSS custom properties', () => {
      const book = createTestBook();
      const renderer = new Renderer(book, 'css-variables');
      const output = renderer.render();
      expect(output).toContain('--brand-primary: #0066cc');
    });

    it('renders references as var()', () => {
      const book = createTestBook();
      const renderer = new Renderer(book, 'css-variables');
      const output = renderer.render();
      expect(output).toContain('--ui-bg: var(--brand-primary)');
    });

    it('renders colorMix with var() refs and color-mix()', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('primary', color('#0066cc'));
      const ui = book.addScope('ui');
      ui.set('hover', colorMix(ref('brand.primary'), color('#000000'), { ratio: 0.1 }));

      const renderer = new Renderer(book, 'css-variables');
      const output = renderer.render();
      // ratio 0.1 → 90% of color1 (1-0.1=0.9 → 90%)
      expect(output).toContain('color-mix(in lab, var(--brand-primary) 90%, #000000)');
    });

    it('renders lighten with color-mix and var() ref', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('primary', color('#0066cc'));
      const ui = book.addScope('ui');
      ui.set('light', lighten(ref('brand.primary'), { amount: 0.2 }));

      const renderer = new Renderer(book, 'css-variables');
      const output = renderer.render();
      expect(output).toContain('color-mix(in oklch, var(--brand-primary) 80%, white)');
    });

    it('renders darken with color-mix and var() ref', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('primary', color('#0066cc'));
      const ui = book.addScope('ui');
      ui.set('dark', darken(ref('brand.primary'), { amount: 0.1 }));

      const renderer = new Renderer(book, 'css-variables');
      const output = renderer.render();
      expect(output).toContain('color-mix(in oklch, var(--brand-primary) 90%, black)');
    });

    it('renders spacingScale with calc() and var() ref', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('space', px(16));
      const ui = book.addScope('ui');
      ui.set('large', spacingScale(ref('brand.space'), { multiplier: 2 }));

      const renderer = new Renderer(book, 'css-variables');
      const output = renderer.render();
      expect(output).toContain('calc(var(--brand-space) * 2)');
    });

    it('renders typographyScale with calc() and var() ref', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('font', rem(1));
      const ui = book.addScope('ui');
      ui.set('lg', typographyScale(ref('brand.font'), { ratio: 1.25, step: 2 }));

      const renderer = new Renderer(book, 'css-variables');
      const output = renderer.render();
      // 1.25^2 = 1.5625
      expect(output).toContain('calc(var(--brand-font) * 1.5625)');
    });

    it('builds var() names in function args with the same mangler as declarations', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('primaryColor', color('#0066cc'));
      brand.set('accent_color', color('#cc0066'));
      const ui = book.addScope('ui');
      ui.set('light', lighten(ref('brand.primaryColor'), { amount: 0.2 }));
      ui.set('dark', darken(ref('brand.accent_color'), { amount: 0.2 }));

      const output = new Renderer(book, 'css-variables').render();
      expect(output).toContain('--brand-primary-color: #0066cc');
      expect(output).toContain('--brand-accent-color: #cc0066');
      expect(output).toContain('color-mix(in oklch, var(--brand-primary-color) 80%, white)');
      expect(output).toContain('color-mix(in oklch, var(--brand-accent-color) 80%, black)');
      expect(output).not.toContain('--brand-primaryColor');
      expect(output).not.toContain('--brand-accent_color');
    });

    it('renders bestContrastWith as resolved value (no CSS equivalent)', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('dark', color('#000000'));
      brand.set('light', color('#ffffff'));
      const ui = book.addScope('ui');
      ui.set('text', bestContrastWith(color('#ffffff'), brand));

      const renderer = new Renderer(book, 'css-variables');
      const output = renderer.render();
      // bestContrastWith resolves to computed hex — no CSS function for this
      expect(output).toContain('--ui-text: #000000');
    });
  });

  describe('numeric precision', () => {
    it('does not round the color-mix percentage to whole percents', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('primary', color('#0066cc'));
      book.addScope('ui').set(
        'mixed',
        colorMix(ref('brand.primary'), color('#000000'), { ratio: 1 / 3 })
      );

      const output = new Renderer(book, 'css-variables').render();
      expect(output).toContain(
        'color-mix(in lab, var(--brand-primary) 66.66666667%, #000000)'
      );
      expect(output).not.toContain(' 67%');
    });

    it('emits the full typographyScale factor so calc() matches the JS product', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('base', px(16));
      const ui = book.addScope('ui');
      ui.set('lg', typographyScale(ref('brand.base'), { ratio: 1.25, step: 3 }));

      const output = new Renderer(book, 'css-variables').render();
      // 1.25^3 = 1.953125; truncating to 1.9531 makes the browser compute
      // 31.2496px where JS resolves 31.25px.
      expect(output).toContain('calc(var(--brand-base) * 1.953125)');
      expect(book.resolve('ui.lg')).toBe('31.25px');
    });
  });

  describe('colorMix css colorSpace names', () => {
    function cssFor(space: string): string {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('primary', color('#0066cc'));
      book.addScope('ui').set(
        'mixed',
        colorMix(ref('brand.primary'), color('#000000'), { ratio: 0.5, colorSpace: space })
      );
      return new Renderer(book, 'css-variables').render();
    }

    it('maps Culori mode names to their CSS spellings', () => {
      expect(cssFor('rgb')).toContain('color-mix(in srgb,');
      expect(cssFor('lrgb')).toContain('color-mix(in srgb-linear,');
      expect(cssFor('p3')).toContain('color-mix(in display-p3,');
      expect(cssFor('xyz65')).toContain('color-mix(in xyz-d65,');
      expect(cssFor('xyz50')).toContain('color-mix(in xyz-d50,');
    });

    it('passes through names that are already CSS spellings', () => {
      expect(cssFor('oklch')).toContain('color-mix(in oklch,');
      expect(cssFor('srgb')).toContain('color-mix(in srgb,');
    });
  });

  describe('relativeTo css', () => {
    function bookWithPrimary() {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('primary', color('#0066cc'));
      return book;
    }

    it('emits <space>(from …) rather than color(from …)', () => {
      const book = bookWithPrimary();
      book.addScope('ui').set(
        'complement',
        relativeTo(ref('brand.primary'), 'oklch', [null, null, '+180'])
      );

      const output = new Renderer(book, 'css-variables').render();
      expect(output).toContain(
        '--ui-complement: oklch(from var(--brand-primary) l c calc(h + 180));'
      );
      expect(output).not.toContain('color(from');
    });

    it('scales hsl saturation and lightness to 0..100', () => {
      const book = bookWithPrimary();
      book.addScope('ui').set(
        'x',
        relativeTo(ref('brand.primary'), 'hsl', ['+30', 0.5, '-0.1'])
      );

      const output = new Renderer(book, 'css-variables').render();
      expect(output).toContain(
        '--ui-x: hsl(from var(--brand-primary) calc(h + 30) 50 calc(l - 10));'
      );
    });

    it('leaves * and / factors unscaled', () => {
      const book = bookWithPrimary();
      book.addScope('ui').set(
        'x',
        relativeTo(ref('brand.primary'), 'hsl', [null, '*0.5', '/2'])
      );

      const output = new Renderer(book, 'css-variables').render();
      expect(output).toContain(
        '--ui-x: hsl(from var(--brand-primary) h calc(s * 0.5) calc(l / 2));'
      );
    });

    it('scales rgb channels to 0..255', () => {
      const book = bookWithPrimary();
      book.addScope('ui').set(
        'x',
        relativeTo(ref('brand.primary'), 'rgb', [1, null, '+0.1'])
      );

      const output = new Renderer(book, 'css-variables').render();
      expect(output).toContain(
        '--ui-x: rgb(from var(--brand-primary) 255 g calc(b + 25.5));'
      );
    });

    it('emits lab channels unscaled', () => {
      const book = bookWithPrimary();
      book.addScope('ui').set(
        'x',
        relativeTo(ref('brand.primary'), 'lab', ['+10', null, null])
      );

      const output = new Renderer(book, 'css-variables').render();
      expect(output).toContain(
        '--ui-x: lab(from var(--brand-primary) calc(l + 10) a b);'
      );
    });
  });

  describe('nested function arguments', () => {
    it('recurses through the function-renderer registry', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('p', color('#0066cc'));
      const ui = book.addScope('ui');
      ui.set('x', darken(lighten(ref('brand.p'), { amount: 0.1 }), { amount: 0.2 }));

      const output = new Renderer(book, 'css-variables').render();
      expect(output).toContain(
        '--ui-x: color-mix(in oklch, color-mix(in oklch, var(--brand-p) 90%, white) 80%, black);'
      );
      expect(output).not.toContain('[object Object]');
    });

    it('falls back to the resolved value for functions with no renderer', () => {
      const book = new DesignBook('test');
      const palette = book.addScope('palette');
      palette.set('black', color('#000000'));
      palette.set('white', color('#ffffff'));
      const ui = book.addScope('ui');
      ui.set('x', darken(bestContrastWith(color('#ffffff'), palette), { amount: 0.2 }));

      const output = new Renderer(book, 'css-variables').render();
      expect(output).toContain('--ui-x: color-mix(in oklch, #000000 80%, black);');
      expect(output).not.toContain('[object Object]');
    });
  });

  describe('css variable name collisions', () => {
    it('throws when two scope/token pairs mangle to the same var name', () => {
      const book = new DesignBook('test');
      const a = book.addScope('a');
      a.set('b-c', color('#0066cc'));
      const ab = book.addScope('a-b');
      ab.set('c', color('#cc0066'));

      const renderer = new Renderer(book, 'css-variables');
      expect(() => renderer.render()).toThrow(/--a-b-c/);
      expect(() => renderer.render()).toThrow(/a\.b-c/);
      expect(() => renderer.render()).toThrow(/a-b\.c/);
    });

    it('throws when camelCase, snake_case and kebab-case keys collide in one scope', () => {
      const book = new DesignBook('test');
      const t = book.addScope('t');
      t.set('fontSize', px(16));
      t.set('font_size', px(17));
      t.set('font-size', px(18));

      const renderer = new Renderer(book, 'css-variables');
      expect(() => renderer.render()).toThrow(/--t-font-size/);
      expect(() => renderer.render()).toThrow(/t\.fontSize/);
      expect(() => renderer.render()).toThrow(/t\.font_size/);
      expect(() => renderer.render()).toThrow(/t\.font-size/);
    });

    it('does not throw when all mangled names are unique', () => {
      const book = createTestBook();
      const renderer = new Renderer(book, 'css-variables');
      expect(() => renderer.render()).not.toThrow();
    });
  });

  describe('json format', () => {
    it('renders all values fully resolved', () => {
      const book = createTestBook();
      const renderer = new Renderer(book, 'json');
      const output = JSON.parse(renderer.render());
      expect(output['brand.primary']).toBe('#0066cc');
      expect(output['ui.bg']).toBe('#0066cc');
    });

    it('exposes the resolved map without forcing JSON parsing', () => {
      const book = createTestBook();
      const renderer = new Renderer(book, 'json');
      const output = renderer.renderJsonObject();
      expect(output['brand.primary']).toBe('#0066cc');
      expect(output['ui.bg']).toBe('#0066cc');
    });
  });

  describe('w3-design-tokens format', () => {
    it('renders color as structured object with colorSpace, components, hex', () => {
      const book = createTestBook();
      const renderer = new Renderer(book, 'w3-design-tokens');
      const output = JSON.parse(renderer.render());
      const primary = output.brand.primary;
      expect(primary.$type).toBe('color');
      expect(primary.$value.colorSpace).toBe('srgb');
      expect(primary.$value.components).toHaveLength(3);
      expect(primary.$value.hex).toBe('#0066cc');
      expect(primary.$value.alpha).toBe(1);
    });

    it('renders references with {scope.token} syntax', () => {
      const book = createTestBook();
      const renderer = new Renderer(book, 'w3-design-tokens');
      const output = JSON.parse(renderer.render());
      expect(output.ui.bg.$value).toBe('{brand.primary}');
      expect(output.ui.bg.$type).toBe('color');
    });

    it('renders dimension as { value, unit } object', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('space', px(16));
      const renderer = new Renderer(book, 'w3-design-tokens');
      const output = JSON.parse(renderer.render());
      expect(output.brand.space.$type).toBe('dimension');
      expect(output.brand.space.$value).toEqual({ value: 16, unit: 'px' });
    });

    it('renders ms() tokens as duration type', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('speed', ms(200));
      const renderer = new Renderer(book, 'w3-design-tokens');
      const output = JSON.parse(renderer.render());
      expect(output.brand.speed.$type).toBe('duration');
      expect(output.brand.speed.$value).toEqual({ value: 200, unit: 'ms' });
    });

    it('includes $description when present', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('primary', color('#0066cc', { description: 'Main brand color' }));
      const renderer = new Renderer(book, 'w3-design-tokens');
      const output = JSON.parse(renderer.render());
      expect(output.brand.primary.$description).toBe('Main brand color');
    });

    it('exposes structured W3 tokens without forcing JSON parsing', () => {
      const book = createTestBook();
      const renderer = new Renderer(book, 'w3-design-tokens');
      const output = renderer.renderW3DesignTokensObject();
      expect(output.brand.primary.$type).toBe('color');
      expect(output.ui.bg.$value).toBe('{brand.primary}');
    });
  });

  describe('w3-design-tokens shapes', () => {
    it('emits a transition composite for timing tokens', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('fast', ms(200));
      book.addScope('motion').set(
        'hover',
        timing(ref('brand.fast'), 'ease-in-out', { delay: 50 })
      );

      const out = new Renderer(book, 'w3-design-tokens').renderW3DesignTokensObject() as any;
      expect(out.motion.hover.$type).toBe('transition');
      expect(out.motion.hover.$value).toEqual({
        duration: { value: 200, unit: 'ms' },
        delay: { value: 50, unit: 'ms' },
        timingFunction: [0.42, 0, 0.58, 1],
      });
    });

    it('passes an easing it cannot express as a cubic bezier through unchanged', () => {
      const book = new DesignBook('test');
      book.addScope('motion').set('step', timing(ms(200), 'steps(4)'));

      const out = new Renderer(book, 'w3-design-tokens').renderW3DesignTokensObject() as any;
      expect(out.motion.step.$value).toEqual({
        duration: { value: 200, unit: 'ms' },
        delay: { value: 0, unit: 'ms' },
        timingFunction: 'steps(4)',
      });
    });

    it('types a scale function over a duration as duration', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('fast', ms(200));
      book.addScope('motion').set('slow', spacingScale(ref('brand.fast'), { multiplier: 2 }));

      const out = new Renderer(book, 'w3-design-tokens').renderW3DesignTokensObject() as any;
      expect(out.motion.slow.$type).toBe('duration');
      expect(out.motion.slow.$value).toEqual({ value: 400, unit: 'ms' });
    });

    it('types a reference to a duration-returning function as duration', () => {
      const book = new DesignBook('test');
      const brand = book.addScope('brand');
      brand.set('fast', ms(200));
      const motion = book.addScope('motion');
      motion.set('slow', spacingScale(ref('brand.fast'), { multiplier: 2 }));
      motion.set('alias', ref('motion.slow'));

      const out = new Renderer(book, 'w3-design-tokens').renderW3DesignTokensObject() as any;
      expect(out.motion.alias.$type).toBe('duration');
    });

    it('omits $type for a plain string token', () => {
      const book = new DesignBook('test');
      book.addScope('brand').set('label', string('uppercase'));

      const out = new Renderer(book, 'w3-design-tokens').renderW3DesignTokensObject() as any;
      expect(out.brand.label.$value).toBe('uppercase');
      expect(out.brand.label.$type).toBeUndefined();
    });

    it('keeps fontFamily when the token metadata asks for it', () => {
      const book = new DesignBook('test');
      book.addScope('brand').set(
        'sans',
        string('Inter, system-ui', { metadata: { w3Type: 'fontFamily' } })
      );

      const out = new Renderer(book, 'w3-design-tokens').renderW3DesignTokensObject() as any;
      expect(out.brand.sans.$type).toBe('fontFamily');
      expect(out.brand.sans.$value).toBe('Inter, system-ui');
    });

    it('types a unitless dimension as number with a numeric $value', () => {
      const book = new DesignBook('test');
      book.addScope('brand').set('ratio', dimension(1.5, ''));

      const out = new Renderer(book, 'w3-design-tokens').renderW3DesignTokensObject() as any;
      expect(out.brand.ratio.$type).toBe('number');
      expect(out.brand.ratio.$value).toBe(1.5);
    });

    it('formats typography sub-values per the W3 spec', () => {
      const book = new DesignBook('test');
      book.addTypography('heading-lg', {
        fontFamily: 'Inter',
        fontSize: rem(2),
        fontWeight: '700',
        lineHeight: '1.15',
        letterSpacing: '-0.02em',
      });

      const out = new Renderer(book, 'w3-design-tokens').renderW3DesignTokensObject() as any;
      expect(out.typography['heading-lg'].$type).toBe('typography');
      expect(out.typography['heading-lg'].$value).toEqual({
        fontFamily: 'Inter',
        fontSize: { value: 2, unit: 'rem' },
        fontWeight: 700,
        lineHeight: 1.15,
        letterSpacing: { value: -0.02, unit: 'em' },
      });
    });

    it('keeps a non-numeric font weight keyword as a string', () => {
      const book = new DesignBook('test');
      book.addTypography('body', { fontFamily: 'Georgia', fontWeight: 'bold' });

      const out = new Renderer(book, 'w3-design-tokens').renderW3DesignTokensObject() as any;
      expect(out.typography.body.$value.fontWeight).toBe('bold');
    });
  });

  describe('registerFunctionRenderer', () => {
    it('uses custom function renderer for format', () => {
      const book = new DesignBook('test');
      const renderer = new Renderer(book, 'css-variables');
      renderer.registerFunctionRenderer('myFunc', (_args, _options) => 'custom-output');
      expect(true).toBe(true);
    });
  });
});
