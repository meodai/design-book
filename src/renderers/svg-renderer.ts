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

interface TableInfo {
  scopeName: string;
  keys: string[];
  width: number;
  height: number;
  diagonal: number;
  x: number;
  y: number;
  angle: number;
  onLeft: boolean;
}

interface DotInfo {
  qualifiedKey: string;
  scopeName: string;
  tokenName: string;
  x: number;
  y: number;
  color: string;
  isHeader: boolean;
}

function getResolvedColor(book: DesignBook, scopeName: string, tokenName: string): string {
  try {
    const resolved = book.resolve(`${scopeName}.${tokenName}`);
    if (resolved && (resolved.startsWith('#') || resolved.startsWith('rgb') || resolved.startsWith('hsl'))) {
      return resolved;
    }
  } catch {
    // fallback
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

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
      dotSize: options?.dotSize ?? 5,
      strokeWidth: options?.strokeWidth ?? 1.5,
    };
  }

  render(): string {
    const { gap, padding, fontSize, dotSize, strokeWidth } = this.options;
    const scopes = this.book.getAllScopes();

    if (scopes.length === 0) {
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"></svg>';
    }

    const rowHeight = fontSize * 2;
    const widthPerLetter = fontSize * 0.62;
    const tablePadding = 12;
    const tableGap = gap * 2;

    // 1. Calculate table dimensions for each scope
    const tables: TableInfo[] = [];

    for (const scope of scopes) {
      const keys = scope.getAllKeys();
      const allLabels = [scope.name, ...keys];
      const maxLabelLen = Math.max(...allLabels.map(l => l.length));
      const width = maxLabelLen * widthPerLetter + tablePadding * 2 + dotSize * 4;
      const height = (1 + keys.length) * rowHeight;

      const diagonal = Math.sqrt(width * width + height * height);

      tables.push({
        scopeName: scope.name,
        keys,
        width,
        height,
        diagonal,
        x: 0,
        y: 0,
        angle: 0,
        onLeft: false,
      });
    }

    // 2. Circular layout
    const totalCircumference = tables.reduce((sum, t) => sum + t.diagonal, 0) + tableGap * tables.length;
    const radius = Math.max(totalCircumference / (Math.PI * 2), 100);
    const centerX = radius + padding + Math.max(...tables.map(t => t.width));
    const centerY = radius + padding + Math.max(...tables.map(t => t.height));

    let cumulative = 0;
    for (const table of tables) {
      cumulative += table.diagonal / 2;
      const fraction = cumulative / totalCircumference;
      const angle = fraction * Math.PI * 2 - Math.PI / 2; // start from top
      table.angle = angle;
      table.x = centerX + radius * Math.cos(angle) - table.width / 2;
      table.y = centerY + radius * Math.sin(angle) - table.height / 2;
      table.onLeft = Math.cos(angle) < 0;
      cumulative += table.diagonal / 2 + tableGap;
    }

    // Compute SVG bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const table of tables) {
      minX = Math.min(minX, table.x - padding);
      minY = Math.min(minY, table.y - padding);
      maxX = Math.max(maxX, table.x + table.width + padding);
      maxY = Math.max(maxY, table.y + table.height + padding);
    }

    const svgWidth = Math.ceil(maxX - minX);
    const svgHeight = Math.ceil(maxY - minY);
    const offsetX = -minX;
    const offsetY = -minY;

    // Build dot map for connections
    const dots: Map<string, DotInfo> = new Map();

    for (const table of tables) {
      const scope = this.book.getScope(table.scopeName)!;
      const dotX = table.onLeft
        ? table.x + offsetX + table.width
        : table.x + offsetX;

      // Scope header dot
      dots.set(`__header__${table.scopeName}`, {
        qualifiedKey: `__header__${table.scopeName}`,
        scopeName: table.scopeName,
        tokenName: '',
        x: dotX,
        y: table.y + offsetY + rowHeight / 2,
        color: '#000000',
        isHeader: true,
      });

      // Token dots
      for (let i = 0; i < table.keys.length; i++) {
        const tokenName = table.keys[i];
        const token = scope.get(tokenName);
        if (!token) continue;

        const isColor = isColorToken(this.book, token);
        const color = isColor
          ? getResolvedColor(this.book, table.scopeName, tokenName)
          : '#888888';

        const qualifiedKey = `${table.scopeName}.${tokenName}`;
        dots.set(qualifiedKey, {
          qualifiedKey,
          scopeName: table.scopeName,
          tokenName,
          x: dotX,
          y: table.y + offsetY + (i + 1) * rowHeight + rowHeight / 2,
          color,
          isHeader: false,
        });
      }
    }

    // Start building SVG
    const lines: string[] = [];
    lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">`);

    // Embedded styles
    lines.push('<style>');
    lines.push('.palette-table { fill: white; stroke: black; stroke-width: 1; }');
    lines.push('.palette-table__row { fill: none; stroke: black; stroke-width: 1; }');
    lines.push('.palette-table__row--header { fill: black; }');
    lines.push('text { font-family: monospace; }');
    lines.push('.palette-table__label { fill: black; }');
    lines.push('.palette-table__label--header { font-weight: bold; fill: white; }');
    lines.push('.connections-bg { opacity: 0.8; }');
    lines.push('.connections { opacity: 0.9; }');
    lines.push('.dots circle:hover { stroke-width: 2; }');
    lines.push('</style>');

    // Render connections
    if (this.options.showConnections) {
      const graph = this.book.getDependencyGraph();
      const allNodes = graph.getAllNodes();

      // Background pass (black, thicker)
      lines.push('<g class="connections-bg">');
      for (const fromKey of allNodes) {
        const outgoing = graph.getOutgoing(fromKey);
        for (const toKey of outgoing) {
          const fromDot = dots.get(fromKey);
          const toDot = dots.get(toKey);
          if (!fromDot || !toDot) continue;

          const fromToken = this.book.getTokenByKey(fromKey);
          const isDashed = fromToken?.type === 'function';

          const yDiff = Math.abs(toDot.y - fromDot.y);
          const amp = 40 + yDiff * 0.3;
          const dirFrom = fromDot.x < centerX + offsetX ? -1 : 1;
          const dirTo = toDot.x < centerX + offsetX ? -1 : 1;

          const cp1x = fromDot.x + amp * dirFrom;
          const cp1y = fromDot.y;
          const cp2x = toDot.x + amp * dirTo;
          const cp2y = toDot.y;

          const dashAttr = isDashed ? ' stroke-dasharray="5,5"' : '';
          lines.push(`  <path d="M ${fromDot.x} ${fromDot.y} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${toDot.x} ${toDot.y}" fill="none" stroke="#000000" stroke-width="${strokeWidth + 2}"${dashAttr}/>`);
        }
      }
      lines.push('</g>');

      // Color pass
      lines.push('<g class="connections">');
      for (const fromKey of allNodes) {
        const outgoing = graph.getOutgoing(fromKey);
        for (const toKey of outgoing) {
          const fromDot = dots.get(fromKey);
          const toDot = dots.get(toKey);
          if (!fromDot || !toDot) continue;

          const fromToken = this.book.getTokenByKey(fromKey);
          const isDashed = fromToken?.type === 'function';

          const yDiff = Math.abs(toDot.y - fromDot.y);
          const amp = 40 + yDiff * 0.3;
          const dirFrom = fromDot.x < centerX + offsetX ? -1 : 1;
          const dirTo = toDot.x < centerX + offsetX ? -1 : 1;

          const cp1x = fromDot.x + amp * dirFrom;
          const cp1y = fromDot.y;
          const cp2x = toDot.x + amp * dirTo;
          const cp2y = toDot.y;

          const color = fromDot.color;
          const dashAttr = isDashed ? ' stroke-dasharray="5,5"' : '';
          lines.push(`  <path d="M ${fromDot.x} ${fromDot.y} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${toDot.x} ${toDot.y}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"${dashAttr}/>`);
        }
      }
      lines.push('</g>');
    }

    // Render tables
    for (const table of tables) {
      const tx = table.x + offsetX;
      const ty = table.y + offsetY;

      lines.push(`<g class="palette-table-group">`);

      // Table background
      lines.push(`  <rect class="palette-table" x="${tx}" y="${ty}" width="${table.width}" height="${table.height}" rx="2"/>`);

      // Header row
      lines.push(`  <rect class="palette-table__row palette-table__row--header" x="${tx}" y="${ty}" width="${table.width}" height="${rowHeight}" rx="2"/>`);
      const headerTextX = tx + tablePadding;
      const headerTextY = ty + rowHeight / 2 + fontSize / 3;
      lines.push(`  <text class="palette-table__label palette-table__label--header" x="${headerTextX}" y="${headerTextY}" font-size="${fontSize}">${escapeXml(table.scopeName)}</text>`);

      // Data rows
      for (let i = 0; i < table.keys.length; i++) {
        const tokenName = table.keys[i];
        const ry = ty + (i + 1) * rowHeight;
        lines.push(`  <rect class="palette-table__row" x="${tx}" y="${ry}" width="${table.width}" height="${rowHeight}"/>`);
        const textX = tx + tablePadding;
        const textY = ry + rowHeight / 2 + fontSize / 3;
        lines.push(`  <text class="palette-table__label" x="${textX}" y="${textY}" font-size="${fontSize}">${escapeXml(tokenName)}</text>`);
      }

      lines.push('</g>');
    }

    // Render dots
    lines.push('<g class="dots">');
    for (const [, dot] of dots) {
      if (dot.isHeader) {
        // Rotated square for scope headers
        const size = dotSize;
        lines.push(`  <rect x="${dot.x - size}" y="${dot.y - size}" width="${size * 2}" height="${size * 2}" fill="#000000" stroke="#333333" stroke-width="${strokeWidth / 2}" transform="rotate(45 ${dot.x} ${dot.y})"/>`);
      } else {
        // Circle for tokens
        lines.push(`  <circle cx="${dot.x}" cy="${dot.y}" r="${dotSize}" fill="${dot.color}" stroke="#333333" stroke-width="${strokeWidth / 2}"/>`);
      }
    }
    lines.push('</g>');

    lines.push('</svg>');

    return lines.join('\n');
  }
}
