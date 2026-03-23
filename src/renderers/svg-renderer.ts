import { DesignBook } from '../design-book';
import type { AnyTokenValue, TokenValue, ReferenceValue, FunctionTokenValue } from '../tokens';

export interface SVGRenderOptions {
  showConnections?: boolean;
  gap?: number;
  padding?: number;
  fontSize?: number;
  dotSize?: number;
  strokeWidth?: number;
}

interface TokenNode {
  qualifiedKey: string;
  scopeName: string;
  tokenName: string;
  x: number;
  y: number;
  color: string;
  tokenType: string;
}

function getResolvedColor(book: DesignBook, scopeName: string, tokenName: string, token: AnyTokenValue): string {
  try {
    const resolved = book.resolve(`${scopeName}.${tokenName}`);
    // If it looks like a color (starts with # or is a named color), use it
    if (resolved && (resolved.startsWith('#') || resolved.startsWith('rgb') || resolved.startsWith('hsl'))) {
      return resolved;
    }
  } catch {
    // fallback below
  }
  return '#888888';
}

function getTokenBaseType(book: DesignBook, token: AnyTokenValue): string {
  if (token.type === 'reference') {
    const ref = token as ReferenceValue;
    const resolved = book.getTokenByKey(ref.key);
    if (resolved) return getTokenBaseType(book, resolved);
    return 'unknown';
  }
  if (token.type === 'function') {
    const fn = token as FunctionTokenValue;
    return fn.metadata?.returnType ?? 'unknown';
  }
  return (token as TokenValue).type;
}

function isColorToken(book: DesignBook, token: AnyTokenValue): boolean {
  return getTokenBaseType(book, token) === 'color';
}

export class SVGRenderer {
  private book: DesignBook;
  private options: Required<SVGRenderOptions>;

  constructor(book: DesignBook, options?: SVGRenderOptions) {
    this.book = book;
    this.options = {
      showConnections: options?.showConnections ?? true,
      gap: options?.gap ?? 20,
      padding: options?.padding ?? 40,
      fontSize: options?.fontSize ?? 12,
      dotSize: options?.dotSize ?? 8,
      strokeWidth: options?.strokeWidth ?? 1.5,
    };
  }

  render(): string {
    const { gap, padding, fontSize, dotSize, strokeWidth } = this.options;
    const scopes = this.book.getAllScopes();

    // Build token nodes in a vertical list layout, grouped by scope
    const nodes: Map<string, TokenNode> = new Map();
    const scopeHeaderHeight = fontSize * 2 + gap;
    const rowHeight = dotSize * 2 + gap;

    let currentY = padding;
    const columnWidth = 200;

    for (const scope of scopes) {
      // scope header
      const headerY = currentY;
      currentY += scopeHeaderHeight;

      const keys = scope.getAllKeys();
      for (let i = 0; i < keys.length; i++) {
        const tokenName = keys[i];
        const token = scope.get(tokenName);
        if (!token) continue;

        const x = padding + dotSize;
        const y = currentY + dotSize;

        const isColor = isColorToken(this.book, token);
        const color = isColor
          ? getResolvedColor(this.book, scope.name, tokenName, token)
          : '#888888';

        const qualifiedKey = `${scope.name}.${tokenName}`;
        nodes.set(qualifiedKey, {
          qualifiedKey,
          scopeName: scope.name,
          tokenName,
          x,
          y,
          color,
          tokenType: getTokenBaseType(this.book, token),
        });

        currentY += rowHeight;
      }

      currentY += gap;
    }

    const totalHeight = currentY + padding;
    const totalWidth = columnWidth + padding * 2;

    const lines: string[] = [];
    lines.push(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="${totalWidth}" height="${totalHeight}">`
    );

    // Render connections (paths) first so they appear behind circles
    if (this.options.showConnections) {
      const graph = this.book.getDependencyGraph();
      const allNodes = graph.getAllNodes();

      for (const fromKey of allNodes) {
        const outgoing = graph.getOutgoing(fromKey);
        for (const toKey of outgoing) {
          const fromNode = nodes.get(fromKey);
          const toNode = nodes.get(toKey);
          if (!fromNode || !toNode) continue;

          // Determine if the source token is a function type (dashed)
          const fromToken = this.book.getTokenByKey(fromKey);
          const isDashed = fromToken?.type === 'function';

          // Cubic bezier curve
          const cx1 = fromNode.x + (toNode.x - fromNode.x) * 0.5;
          const cy1 = fromNode.y;
          const cx2 = fromNode.x + (toNode.x - fromNode.x) * 0.5;
          const cy2 = toNode.y;

          const dashAttr = isDashed ? ` stroke-dasharray="4 2"` : '';
          lines.push(
            `  <path d="M ${fromNode.x} ${fromNode.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${toNode.x} ${toNode.y}" fill="none" stroke="#aaaaaa" stroke-width="${strokeWidth}"${dashAttr}/>`
          );
        }
      }
    }

    // Render scope headers and token circles + labels
    currentY = padding;

    for (const scope of scopes) {
      const headerY = currentY + fontSize;
      lines.push(
        `  <text x="${padding}" y="${headerY}" font-size="${fontSize + 2}" font-weight="bold" fill="#333333">${scope.name}</text>`
      );
      currentY += scopeHeaderHeight;

      const keys = scope.getAllKeys();
      for (const tokenName of keys) {
        const qualifiedKey = `${scope.name}.${tokenName}`;
        const node = nodes.get(qualifiedKey);
        if (!node) continue;

        lines.push(
          `  <circle cx="${node.x}" cy="${node.y}" r="${dotSize}" fill="${node.color}" stroke="#333333" stroke-width="${strokeWidth / 2}"/>`
        );
        lines.push(
          `  <text x="${node.x + dotSize + 6}" y="${node.y + fontSize / 3}" font-size="${fontSize}" fill="#333333">${tokenName}</text>`
        );

        currentY += rowHeight;
      }

      currentY += gap;
    }

    lines.push('</svg>');

    return lines.join('\n');
  }
}
