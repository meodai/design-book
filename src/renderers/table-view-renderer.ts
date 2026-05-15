import { DesignBook } from '../design-book';

export interface TableViewRenderOptions {
  /** Class to apply to the root `<table>` element. */
  className?: string;
  /** When true, prepend a small swatch box before colour values. Defaults
   *  to true. */
  inlineColorSwatches?: boolean;
  /** When true (default), nodes inherited from a parent scope show the
   *  source key in the dependencies cell. */
  showInheritance?: boolean;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isHexColor(value: string): boolean {
  return /^#[0-9a-f]{3,8}$/i.test(value);
}

/**
 * Renders the entire token catalogue as an HTML `<table>` — one row per
 * token, with columns for the qualified key, the type, the resolved value
 * (optionally with a colour swatch), and the dependencies the token reads
 * from. Useful for design-system documentation pages or admin tools.
 *
 * Plays nice with all token kinds (value, reference, function) and with
 * inherited tokens from extended scopes.
 */
export class TableViewRenderer {
  private book: DesignBook;
  private options: Required<TableViewRenderOptions>;

  constructor(book: DesignBook, options: TableViewRenderOptions = {}) {
    this.book = book;
    this.options = {
      className: options.className ?? 'design-book-table',
      inlineColorSwatches: options.inlineColorSwatches ?? true,
      showInheritance: options.showInheritance ?? true,
    };
  }

  render(): string {
    const { className, inlineColorSwatches, showInheritance } = this.options;
    const rows: string[] = [];

    rows.push(`<table class="${escapeHtml(className)}">`);
    rows.push(
      `<thead><tr>` +
        `<th>Token</th>` +
        `<th>Type</th>` +
        `<th>Value</th>` +
        `<th>Depends on</th>` +
      `</tr></thead>`,
    );
    rows.push('<tbody>');

    for (const scope of this.book.getAllScopes()) {
      for (const key of scope.getAllKeys()) {
        const qualifiedKey = `${scope.name}.${key}`;
        const info = this.book.inspect(qualifiedKey);
        if (!info) continue;

        // Type label: prefer function name for function tokens, otherwise
        // the underlying base type ("color", "dimension", "reference", …).
        const typeLabel = info.function
          ? `function: ${info.function}`
          : info.tokenType;

        const value = info.value ?? '';
        const valueCell = inlineColorSwatches && isHexColor(value)
          ? `<span class="design-book-table__swatch" style="display:inline-block;width:1em;height:1em;background:${escapeHtml(value)};border:1px solid rgba(0,0,0,0.15);vertical-align:middle;margin-right:0.5em;"></span><code>${escapeHtml(value)}</code>`
          : value
            ? `<code>${escapeHtml(value)}</code>`
            : '<em>unresolved</em>';

        const depsBits: string[] = info.dependencies.map(
          (dep) => `<code>${escapeHtml(dep)}</code>`,
        );
        if (showInheritance && info.isInherited && info.source) {
          depsBits.push(
            `<em>inherited from <code>${escapeHtml(info.source)}</code></em>`,
          );
        }
        const depsCell = depsBits.length > 0 ? depsBits.join(', ') : '<em>&mdash;</em>';

        rows.push(
          `<tr>` +
            `<td><code>${escapeHtml(qualifiedKey)}</code></td>` +
            `<td>${escapeHtml(typeLabel)}</td>` +
            `<td>${valueCell}</td>` +
            `<td>${depsCell}</td>` +
          `</tr>`,
        );
      }
    }

    rows.push('</tbody>');
    rows.push('</table>');
    return rows.join('\n');
  }
}
