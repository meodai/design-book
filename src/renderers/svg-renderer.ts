import { parse, formatHex } from 'culori';
import { DesignBook } from '../design-book';
import type { AnyTokenValue, TokenValue, ReferenceValue, FunctionTokenValue } from '../tokens';

export interface SVGRenderOptions {
  showConnections?: boolean;
  gap?: number;
  padding?: number;
  fontSize?: number;
  dotSize?: number;
  strokeWidth?: number;
  /** When true, the graph shows only "palette-linking" function edges —
   *  function tokens that iterate a scope (e.g. bestContrastWith,
   *  mostVivid, closestColor). Value-deriving function tokens like darken,
   *  colorMix and spacingScale have their edges hidden. Each shown link
   *  is collapsed to a single dashed edge that points at the candidate
   *  whose resolved value matches the function's output — i.e. the token
   *  that was actually picked. */
  linksOnly?: boolean;
  /** When true, the rendered SVG is interactive: hovering a token row
   *  dims unrelated connections and labels the related ones with the
   *  function name (or "ref"/"extends") that produced the edge. Driven
   *  entirely by inline CSS via `:has()` — no JavaScript needed. */
  interactive?: boolean;
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
  isDimension: boolean;
  isLeft: boolean; // true if table is on left half — dot faces inward (right edge)
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

function normalizeColor(value: string): string | null {
  const parsed = parse(value);
  return parsed ? (formatHex(parsed) ?? null) : null;
}

/** Function tokens fall into two families: palette-linkers (iterate a
 *  scope — bestContrastWith, mostVivid, closestColor, …) and value
 *  derivers (apply a formula to inputs — darken, colorMix, spacingScale).
 *  Palette-linkers always have a non-empty visualDependencies array. */
function isPaletteLinker(token: AnyTokenValue): boolean {
  if (token.type !== 'function') return false;
  const fn = token as FunctionTokenValue;
  return (fn.metadata?.visualDependencies?.length ?? 0) > 0;
}

/** For a palette-linker function token, find the candidate in its
 *  visualDependencies whose resolved value matches the function's output —
 *  the token that was actually picked. Returns null if no match. Handles
 *  both color outputs (matched via normalized hex) and non-color outputs
 *  like dimensions (matched via raw resolved string). */
function findResolvedSource(
  book: DesignBook,
  qualifiedKey: string,
  token: AnyTokenValue,
): string | null {
  if (!isPaletteLinker(token)) return null;
  const fn = token as FunctionTokenValue;
  const visualDeps = fn.metadata?.visualDependencies ?? [];

  let resolved: string;
  try {
    resolved = book.resolve(qualifiedKey);
  } catch {
    return null;
  }
  const resolvedHex = normalizeColor(resolved);

  for (const depKey of visualDeps) {
    let candResolved: string;
    try {
      candResolved = book.resolve(depKey);
    } catch {
      continue;
    }

    if (resolvedHex) {
      const candHex = normalizeColor(candResolved);
      if (candHex && candHex === resolvedHex) return depKey;
    } else if (candResolved === resolved) {
      return depKey;
    }
  }
  return null;
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Token keys go into CSS attribute selectors like
 *  `[data-token-key="..."]`. The only characters that can break that out
 *  of the quoted string in practice are double quotes and backslashes. */
function escapeCssAttr(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
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
      linksOnly: options?.linksOnly ?? true,
      interactive: options?.interactive ?? false,
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
        isDimension: false,
        isLeft: table.onLeft,
      });

      // Token dots
      for (let i = 0; i < table.keys.length; i++) {
        const tokenName = table.keys[i];
        const token = scope.get(tokenName);
        if (!token) continue;

        const baseType = getTokenBaseType(this.book, token);
        const isColor = baseType === 'color';
        const isDimension = baseType === 'dimension';
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
          isDimension,
          isLeft: table.onLeft,
        });
      }
    }

    // Start building SVG
    const lines: string[] = [];
    const rootClass = this.options.interactive ? ' class="interactive"' : '';
    lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}"${rootClass}>`);

    // Embedded styles — inherit CSS custom properties from the editor when embedded in HTML
    lines.push('<style>');
    lines.push(`svg { --surface: var(--c-surface, #fff); --on-surface: var(--c-surface-on, #292f2f); --on-surface-alt: var(--c-surface-on-alt, #888); --font: var(--font-mono, 'Iosevka Web', 'Iosevka', 'Fira Code', ui-monospace, monospace); }`);
    lines.push('.palette-table { fill: var(--surface); stroke: var(--on-surface); stroke-width: 1; }');
    lines.push('.palette-table__row { fill: none; stroke: var(--on-surface); stroke-width: 0.5; }');
    lines.push('.palette-table__row--header { fill: var(--on-surface); }');
    lines.push('text { font-family: var(--font); font-weight: 300; }');
    lines.push('.palette-table__label { fill: var(--on-surface); pointer-events: none; }');
    lines.push('.palette-table__label--inherited { opacity: 0.4; }');
    lines.push('.palette-table__label--header { font-weight: 400; fill: var(--surface); }');
    lines.push('.conn-bg { opacity: 0.6; }');
    lines.push('.conn-fg { opacity: 0.8; }');
    lines.push('.dots circle { transition: r 0.15s ease, stroke-width 0.15s ease; pointer-events: none; }');
    lines.push('.dots rect { pointer-events: none; }');

    if (this.options.interactive) {
      // Row rects act as hover hit-areas — make them interactive and
      // pick up a soft highlight on hover. `pointer-events: all` forces
      // SVG to hit-test the rect's bounding box even when fill is none,
      // otherwise only the thin stroke would register.
      lines.push('svg.interactive .palette-table__row[data-token-key] { cursor: pointer; pointer-events: all; }');
      lines.push('svg.interactive .palette-table__row[data-token-key]:not(.palette-table__row--header):hover { fill: var(--on-surface); fill-opacity: 0.06; }');
      lines.push('svg.interactive .palette-table__row--header[data-token-key]:hover { fill-opacity: 0.85; }');
      // Connections shouldn't intercept hover — they're decorative and
      // would steal the event when they pass over a row.
      lines.push('svg.interactive .connection { pointer-events: none; transition: opacity 120ms ease; }');
      // Labels: hidden by default, paint-order halo for readability when shown.
      lines.push('svg.interactive .conn-label { fill: var(--on-surface); font-size: 10px; text-anchor: middle; paint-order: stroke fill; stroke: var(--surface); stroke-width: 3; pointer-events: none; opacity: 0; transition: opacity 120ms ease; }');
      // When any token-key is being hovered, dim every connection by default…
      lines.push('svg.interactive:has([data-token-key]:hover) .connection { opacity: 0.08; }');
      // …then restore opacity & reveal the label for connections involving it.
      const hoverableKeys = new Set<string>();
      for (const [, dot] of dots) hoverableKeys.add(dot.qualifiedKey);
      for (const k of hoverableKeys) {
        const sel = escapeCssAttr(k);
        lines.push(`svg.interactive:has([data-token-key="${sel}"]:hover) .connection[data-from="${sel}"], svg.interactive:has([data-token-key="${sel}"]:hover) .connection[data-to="${sel}"] { opacity: 1; }`);
        lines.push(`svg.interactive:has([data-token-key="${sel}"]:hover) .conn-label[data-from="${sel}"], svg.interactive:has([data-token-key="${sel}"]:hover) .conn-label[data-to="${sel}"] { opacity: 1; }`);
      }
    } else {
      lines.push('.dots circle:hover { stroke-width: 2; }');
      lines.push('.dots rect:hover { stroke-width: 2; }');
      lines.push('.conn-label { display: none; }');
    }

    lines.push('</style>');

    // Render connections
    // OG pattern: iterate each token, get its visual dependencies (what it depends on),
    // draw FROM the token TO each dependency. Color = token's color.
    // isLeft means the table is on the left half → dot is on right edge → curve goes RIGHT (+amp)
    // Track which scope headers participate in inheritance — those get a
    // visible dot at the header so the connection has an anchor.
    const inheritingScopes = new Set<string>();
    for (const table of tables) {
      const scope = this.book.getScope(table.scopeName);
      const parentName = scope?.extendsScope;
      if (!parentName) continue;
      if (!dots.has(`__header__${parentName}`)) continue;
      inheritingScopes.add(table.scopeName);
      inheritingScopes.add(parentName);
    }

    // Labels for connections render in a final pass after tables and dots
    // so they always sit on top — see emission near the end of render().
    type PendingLabel = { x: number; y: number; text: string; from: string; to: string };
    const pendingLabels: PendingLabel[] = [];

    if (this.options.showConnections) {
      const graph = this.book.getDependencyGraph();
      const processedConnections = new Set<string>();

      type Conn = { from: DotInfo; to: DotInfo; isDashed: boolean; label: string };
      const connections: Conn[] = [];

      // Scope inheritance (B extends A) collapses to a single header-to-
      // header edge — drawing one per inherited token would be visual
      // clutter when the relationship is "the whole scope comes from A".
      for (const table of tables) {
        const scope = this.book.getScope(table.scopeName);
        const parentName = scope?.extendsScope;
        if (!parentName) continue;
        const fromKey = `__header__${table.scopeName}`;
        const toKey = `__header__${parentName}`;
        const fromDot = dots.get(fromKey);
        const toDot = dots.get(toKey);
        if (!fromDot || !toDot) continue;
        const connId = `${fromKey}->${toKey}`;
        if (processedConnections.has(connId)) continue;
        processedConnections.add(connId);
        connections.push({ from: fromDot, to: toDot, isDashed: false, label: 'extends' });
      }

      for (const [key, fromDot] of dots) {
        if (fromDot.isHeader) continue;

        // Inherited tokens get their lineage shown via the header-to-header
        // edge above — skip them here to avoid duplicating the relationship.
        if (this.book.isInherited(key)) continue;

        const token = this.book.getTokenByKey(key);
        const isFunction = token?.type === 'function';

        // Palette-linker function tokens (bestContrastWith, mostVivid, …)
        // collapse to a single solid edge from the chosen candidate back to
        // the function token — the rest of the palette is implied.
        if (isFunction && token && isPaletteLinker(token)) {
          const resolvedSource = findResolvedSource(this.book, key, token);
          const resolvedDot = resolvedSource ? dots.get(resolvedSource) : undefined;
          if (resolvedDot) {
            const connId = `${resolvedSource}->${key}`;
            if (!processedConnections.has(connId)) {
              processedConnections.add(connId);
              const fnName = (token as FunctionTokenValue).name;
              connections.push({ from: resolvedDot, to: fromDot, isDashed: false, label: fnName });
            }
          }
          continue;
        }

        // linksOnly hides value-deriving function edges entirely.
        if (this.options.linksOnly && isFunction) continue;

        const label = isFunction && token
          ? (token as FunctionTokenValue).name
          : (token?.type === 'reference' ? 'ref' : '');

        const prerequisites = graph.getIncoming(key);
        for (const depKey of prerequisites) {
          const toDot = dots.get(depKey);
          if (!toDot) continue;

          const connId = `${key}->${depKey}`;
          if (processedConnections.has(connId)) continue;
          processedConnections.add(connId);

          connections.push({ from: fromDot, to: toDot, isDashed: isFunction, label });
        }
      }

      // Each connection becomes a <g class="connection"> grouping its
      // background outline and colored path. Labels render in a separate
      // pass after tables/dots so they always sit on top.
      lines.push('<g class="connections-group">');
      for (const { from, to, isDashed, label } of connections) {
        const yDiff = Math.abs(from.y - to.y);
        const amp = 40 + yDiff * 0.3;
        // isLeft = table on left half, dot on right edge → curve goes RIGHT (+amp)
        // !isLeft = table on right half, dot on left edge → curve goes LEFT (-amp)
        const cp1x = from.x + (from.isLeft ? amp : -amp);
        const cp2x = to.x + (to.isLeft ? amp : -amp);

        const dashAttr = isDashed ? ' stroke-dasharray="5,5"' : '';
        const fromAttr = ` data-from="${escapeXml(from.qualifiedKey)}"`;
        const toAttr   = ` data-to="${escapeXml(to.qualifiedKey)}"`;
        const pathD = `M ${from.x} ${from.y} C ${cp1x} ${from.y}, ${cp2x} ${to.y}, ${to.x} ${to.y}`;

        lines.push(`  <g class="connection"${fromAttr}${toAttr}>`);
        lines.push(`    <path class="conn-bg" d="${pathD}" fill="none" stroke="var(--on-surface)" stroke-width="${strokeWidth + 1}"${dashAttr}/>`);
        lines.push(`    <path class="conn-fg" d="${pathD}" fill="none" stroke="${from.color}" stroke-width="${strokeWidth}"${dashAttr}/>`);
        lines.push('  </g>');

        if (label) {
          // Cubic-bezier midpoint (t=0.5) for label placement. y collapses
          // to a simple chord-midpoint since cp1/cp2 share endpoint y's.
          const labelX = 0.125 * (from.x + to.x) + 0.375 * (cp1x + cp2x);
          const labelY = 0.5 * (from.y + to.y);
          pendingLabels.push({
            x: labelX,
            y: labelY,
            text: label,
            from: from.qualifiedKey,
            to: to.qualifiedKey,
          });
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
      const headerKey = `__header__${table.scopeName}`;
      const headerHover = this.options.interactive
        ? ` data-token-key="${escapeXml(headerKey)}"`
        : '';
      lines.push(`  <rect class="palette-table__row palette-table__row--header" x="${tx}" y="${ty}" width="${table.width}" height="${rowHeight}" rx="2"${headerHover}/>`);
      const headerTextX = tx + tablePadding;
      const headerTextY = ty + rowHeight / 2 + fontSize / 3;
      lines.push(`  <text class="palette-table__label palette-table__label--header" x="${headerTextX}" y="${headerTextY}" font-size="${fontSize}">${escapeXml(table.scopeName)}</text>`);

      // Data rows
      const scope = this.book.getScope(table.scopeName);
      for (let i = 0; i < table.keys.length; i++) {
        const tokenName = table.keys[i];
        const ry = ty + (i + 1) * rowHeight;
        const tokenKey = `${table.scopeName}.${tokenName}`;
        const hoverAttr = this.options.interactive
          ? ` data-token-key="${escapeXml(tokenKey)}"`
          : '';
        lines.push(`  <rect class="palette-table__row" x="${tx}" y="${ry}" width="${table.width}" height="${rowHeight}"${hoverAttr}/>`);
        const textX = tx + tablePadding;
        const textY = ry + rowHeight / 2 + fontSize / 3;
        const isInherited = scope?.isInherited(tokenName) ?? false;
        const labelClass = isInherited
          ? 'palette-table__label palette-table__label--inherited'
          : 'palette-table__label';
        lines.push(`  <text class="${labelClass}" x="${textX}" y="${textY}" font-size="${fontSize}">${escapeXml(tokenName)}</text>`);
      }

      lines.push('</g>');
    }

    // Render dots
    lines.push('<g class="dots">');
    for (const [, dot] of dots) {
      if (dot.isHeader) {
        // Headers only render a dot when they participate in scope
        // inheritance — that's the anchor for the header-to-header edge.
        if (!inheritingScopes.has(dot.scopeName)) continue;
        lines.push(`  <circle cx="${dot.x}" cy="${dot.y}" r="${dotSize}" fill="var(--on-surface)" stroke="var(--on-surface)" stroke-width="${strokeWidth / 2}"/>`);
        continue;
      }
      if (dot.isDimension) {
        // Rotated square (diamond) for dimension tokens
        const size = dotSize * 0.7;
        lines.push(`  <rect x="${dot.x - size}" y="${dot.y - size}" width="${size * 2}" height="${size * 2}" fill="${dot.color}" stroke="var(--on-surface)" stroke-width="${strokeWidth / 2}" transform="rotate(45 ${dot.x} ${dot.y})"/>`);
      } else {
        // Circle for tokens
        lines.push(`  <circle cx="${dot.x}" cy="${dot.y}" r="${dotSize}" fill="${dot.color}" stroke="var(--on-surface)" stroke-width="${strokeWidth / 2}"/>`);
      }
    }
    lines.push('</g>');

    // Connection labels — last in document order so they sit above
    // every table, row, and dot once revealed on hover.
    if (pendingLabels.length > 0) {
      lines.push('<g class="conn-labels">');
      const labelFontSize = Math.max(10, fontSize - 2);
      for (const { x, y, text, from, to } of pendingLabels) {
        const fromAttr = ` data-from="${escapeXml(from)}"`;
        const toAttr   = ` data-to="${escapeXml(to)}"`;
        lines.push(`  <text class="conn-label" x="${x.toFixed(2)}" y="${y.toFixed(2)}" font-size="${labelFontSize}"${fromAttr}${toAttr}>${escapeXml(text)}</text>`);
      }
      lines.push('</g>');
    }

    lines.push('</svg>');

    return lines.join('\n');
  }
}
