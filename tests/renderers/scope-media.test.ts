import { describe, it, expect } from 'vitest';
import { DesignBook, rem, px, ref, ScopeError } from '../../src/index';

const css = (book: DesignBook, options?: unknown) => book.render('css-variables', options);

const breakpoints = { md: '(min-width: 48em)', lg: '(min-width: 64em)' };

describe('scope metadata', () => {
  it('defaults to an empty object and keeps what the user stores', () => {
    const book = new DesignBook('m');
    expect(book.addScope('a').metadata).toEqual({});
    const b = book.addScope('b', { metadata: { media: 'md', owner: 'layout' } });
    expect(b.metadata).toEqual({ media: 'md', owner: 'layout' });
    b.metadata.figma = 'Layout/Wide';
    expect(book.getScope('b')!.metadata.figma).toBe('Layout/Wide');
  });

  it('copies the object it is given', () => {
    const book = new DesignBook('m');
    const meta = { media: 'md' };
    const scope = book.addScope('a', { metadata: meta });
    meta.media = 'lg';
    expect(scope.metadata.media).toBe('md');
  });

  it('is not inherited through extends', () => {
    const book = new DesignBook('m');
    book.addScope('base', { metadata: { media: 'md' } });
    expect(book.addScope('child', { extends: 'base' }).metadata).toEqual({});
  });

  it('rejects metadata that is not a plain object', () => {
    const book = new DesignBook('m');
    expect(() => book.addScope('a', { metadata: [] as never })).toThrow(ScopeError);
    expect(() => book.addScope('b', { metadata: 'md' as never })).toThrow(ScopeError);
  });
});

describe('css-variables: scopes with metadata.media', () => {
  function build() {
    const book = new DesignBook('m');
    book.addScope('space').set('gap', px(8));
    book.addScope('space-lg', { metadata: { media: 'lg' } }).set('gap', px(24));
    book.addScope('space-md', { metadata: { media: 'md' } }).set('gap', px(16));
    return book;
  }

  it('wraps each media group, in the order of the breakpoints table', () => {
    expect(css(build(), { breakpoints })).toBe([
      ':root {',
      '  --space-gap: 8px;',
      '}',
      '',
      '@media (min-width: 48em) {',
      '  :root {',
      '    --space-md-gap: 16px;',
      '  }',
      '}',
      '',
      '@media (min-width: 64em) {',
      '  :root {',
      '    --space-lg-gap: 24px;',
      '  }',
      '}',
    ].join('\n'));
  });

  it('uses a raw query string as is, after the named breakpoints', () => {
    const book = build();
    book.addScope('print', { metadata: { media: 'print' } }).set('gap', px(0));
    book.addScope('tall', { metadata: { media: '(min-height: 50em)' } }).set('gap', px(32));
    const out = css(book, { breakpoints });
    expect(out.indexOf('@media (min-width: 64em)')).toBeLessThan(out.indexOf('@media print'));
    expect(out.indexOf('@media print')).toBeLessThan(out.indexOf('@media (min-height: 50em)'));
  });

  it('merges scopes that land on the same query into one block', () => {
    const book = build();
    book.addScope('type-md', { metadata: { media: '(min-width: 48em)' } }).set('body', rem(1.1));
    const out = css(book, { breakpoints });
    expect(out.match(/@media \(min-width: 48em\)/g)).toHaveLength(1);
    expect(out).toContain('    --space-md-gap: 16px;\n    --type-md-body: 1.1rem;');
  });

  it('throws on a breakpoint name the table does not have', () => {
    expect(() => css(build())).toThrow(/unknown breakpoint "lg"/);
    expect(() => css(build(), { breakpoints: { md: breakpoints.md } })).toThrow(/unknown breakpoint "lg"/);
  });

  it('throws on a media value that is not a non-empty string', () => {
    const book = new DesignBook('m');
    book.addScope('a', { metadata: { media: 3 } }).set('x', px(1));
    expect(() => css(book)).toThrow(/media/);
  });

  it('honours selector and keeps var() references across groups', () => {
    const book = build();
    book.addScope('ui-md', { metadata: { media: 'md' } }).set('gap', ref('space-md.gap'));
    expect(css(book, { breakpoints, selector: '.app' }))
      .toContain('@media (min-width: 48em) {\n  .app {\n    --space-md-gap: 16px;\n    --ui-md-gap: var(--space-md-gap);');
  });

  it('puts a typography class inside its scope media block', () => {
    const book = build();
    book.addTypography('lead-md', { fontSize: rem(1.4) });
    book.getScope('lead-md')!.metadata.media = 'md';
    const out = css(book, { breakpoints });
    expect(out).toContain('  .lead-md {\n    font-size: var(--lead-md-font-size);\n  }\n}');
  });

  it('drops a media group that changedFrom leaves empty', () => {
    const base = build();
    const next = build();
    next.getScope('space-lg')!.set('gap', px(30));
    expect(css(next, { breakpoints, changedFrom: base })).toBe([
      ':root {',
      '}',
      '',
      '@media (min-width: 64em) {',
      '  :root {',
      '    --space-lg-gap: 30px;',
      '  }',
      '}',
    ].join('\n'));
  });

  it('skips the :root block when every rendered scope has a media', () => {
    expect(css(build(), { breakpoints, scopes: ['space-md'] }))
      .toBe('@media (min-width: 48em) {\n  :root {\n    --space-md-gap: 16px;\n  }\n}');
  });

  it('leaves output without media scopes unchanged', () => {
    const book = new DesignBook('m');
    book.addScope('space').set('gap', px(8));
    expect(css(book, { breakpoints })).toBe(':root {\n  --space-gap: 8px;\n}');
  });
});
