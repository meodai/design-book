import { parse, formatHex, formatHex8, wcagLuminance } from 'culori';
import { DesignBook } from '../design-book';
import { detectValueType } from '../scope';
import { isFieldKey, isScopeReference, tokenKeyOf } from '../tokens';
import { OrthogonalRouter, roundedPath, midpoint, bridges, junctions } from './orthogonal-router';
import type { Point } from './orthogonal-router';
import type { AnyTokenValue, FunctionTokenValue } from '../tokens';

export interface SVGRenderOptions {
  showConnections?: boolean;
  gap?: number;
  padding?: number;
  fontSize?: number;
  dotSize?: number;
  strokeWidth?: number;
  /** When true, the graph shows only "palette-linking" function edges —
   *  function tokens that iterate a scope (e.g. bestContrastWith,
   *  mostVivid, closest). Value-deriving function tokens like darken,
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
  /** How connections are drawn: `'orthogonal'` (default) routes them in
   *  horizontal and vertical runs with rounded corners round the tables;
   *  `'curved'` draws a single Bezier from dot to dot, across whatever
   *  lies between. */
  routing?: 'orthogonal' | 'curved';
  /** With orthogonal routing: where two lines of one color cross, the
   *  horizontal one bridges the vertical one (flattened while a token is
   *  hovered in an interactive graph). Default true. */
  bridges?: boolean;
  /** Which connections to draw: called with the keys a connection's
   *  `data-from` / `data-to` carry (`scope.token`, or `__header__scope`
   *  for `extends`); return false to leave it out. Applied before the
   *  routing, so the lines left out hold no lanes and get no bridges, as
   *  removing them from the finished SVG would. */
  filterConnections?: (from: string, to: string) => boolean;
  /** Where the tables go. `'layered'` (default): in columns by data flow,
   *  the way schematics are drawn: scopes that read nothing on the left,
   *  each scope right of the scopes it reads, the tables in a column
   *  ordered to cross as little as they can; a row reads on its left
   *  edge and is read on its right one. `'circle'`: round a ring, every
   *  dot facing the middle. */
  layout?: 'layered' | 'circle';
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
  /** Layered layout: the row's left edge, where it reads. */
  inX: number;
}

function getResolvedColor(book: DesignBook, scopeName: string, tokenName: string): string {
  try {
    // Any CSS color Culori understands (`red`, `oklch(…)`, `color(…)`),
    // normalised to hex so it is a valid SVG fill. Translucent colors keep
    // their alpha as 8-digit hex.
    const parsed = parse(book.resolve(`${scopeName}.${tokenName}`));
    const hex = parsed && ((parsed.alpha ?? 1) < 1 ? formatHex8(parsed) : formatHex(parsed));
    if (hex) return hex;
  } catch {
    // fallback
  }
  return '#888888';
}

/** What a token's dot shows: decided by its resolved value, the way the
 *  book types values (`detectValueType`), so a selector or any function
 *  that declares no return type still gets its color. Unresolvable →
 *  'unknown'. */
function getTokenBaseType(book: DesignBook, key: string): string {
  try {
    return detectValueType(book.resolve(key));
  } catch {
    return 'unknown';
  }
}

function normalizeColor(value: string): string | null {
  const parsed = parse(value);
  return parsed ? (formatHex(parsed) ?? null) : null;
}

/** Returns the theme variable (`--on-surface` or `--surface`) whose value
 *  contrasts better with the given fill — used to outline the colored
 *  edge stroke so the animated dashes stay readable against the curve's
 *  own color. */
function pickActiveOutline(fillValue: string): string {
  const parsed = parse(fillValue);
  if (!parsed) return 'var(--on-surface)';
  const L = wcagLuminance(parsed);
  return L > 0.45 ? 'var(--on-surface)' : 'var(--surface)';
}

/** Function tokens fall into two families: palette-linkers (iterate a
 *  scope — bestContrastWith, mostVivid, closest, sibling, …) and value
 *  derivers (apply a formula to inputs — darken, colorMix, spacingScale).
 *  A token is a palette-linker only when it iterates a scope *itself*: a
 *  top-level scope argument, or a scope it declares in
 *  `metadata.iteratedScopes` (`sibling`, whose args are empty). A selector
 *  nested inside a value deriver (`colorMix(x, mostVivid(brand))`) does not
 *  make the outer token one — its output is a mix, not a pool member.
 *  The pool is read live from the book rather than from
 *  `metadata.visualDependencies` — that snapshot is taken when the token is
 *  built and is empty for a selector written before its scope had members. */
function paletteCandidates(book: DesignBook, token: AnyTokenValue): string[] {
  if (token.type !== 'function') return [];
  const fn = token as FunctionTokenValue;
  const scopeNames = new Set<string>(fn.metadata?.iteratedScopes ?? []);
  for (const arg of fn.args) {
    if (isScopeReference(arg)) scopeNames.add(arg.key);
  }
  const candidates: string[] = [];
  for (const name of scopeNames) {
    const scope = book.getScope(name);
    if (!scope) continue;
    for (const key of scope.getAllKeys()) candidates.push(`${name}.${key}`);
  }
  return candidates;
}

function isPaletteLinker(book: DesignBook, token: AnyTokenValue): boolean {
  return paletteCandidates(book, token).length > 0;
}

/** For a palette-linker function token, find the candidate in its
 *  live candidate pool whose resolved value matches the function's output —
 *  the token that was actually picked. Returns null if no match. Handles
 *  both color outputs (matched via normalized hex) and non-color outputs
 *  like dimensions (matched via raw resolved string). */
function findResolvedSource(
  book: DesignBook,
  qualifiedKey: string,
  token: AnyTokenValue,
): string | null {
  const visualDeps = paletteCandidates(book, token);
  if (visualDeps.length === 0) return null;

  let resolved: string;
  try {
    resolved = book.resolve(qualifiedKey);
  } catch {
    return null;
  }
  const resolvedHex = normalizeColor(resolved);

  for (const depKey of visualDeps) {
    // A selector can sit in the scope it iterates; it trivially matches
    // its own output, which would draw a self-loop.
    if (depKey === qualifiedKey) continue;
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

/** How much each scope feeds each other: `flow.get(p).get(s)` counts the
 *  tokens of `s` reading a token of `p` (references, function arguments,
 *  a selector's pick) plus one when `s` extends `p`. */
function scopeFlow(book: DesignBook): Map<string, Map<string, number>> {
  const flow = new Map<string, Map<string, number>>();
  const add = (from: string, to: string) => {
    if (from === to) return;
    let row = flow.get(from);
    if (!row) flow.set(from, (row = new Map()));
    row.set(to, (row.get(to) ?? 0) + 1);
  };
  const graph = book.getDependencyGraph();
  const scopeOf = (key: string) => key.slice(0, key.indexOf('.'));
  for (const scope of book.getAllScopes()) {
    if (scope.extendsScope) add(scope.extendsScope, scope.name);
    for (const name of scope.getAllKeys()) {
      const key = `${scope.name}.${name}`;
      if (book.isInherited(key) && !book.isRebound(key)) continue;
      const token = book.getTokenByKey(key);
      const picked = token && isPaletteLinker(book, token) ? findResolvedSource(book, key, token) : null;
      if (picked) {
        add(scopeOf(picked), scope.name);
        continue;
      }
      for (const p of graph.getIncoming(key)) {
        const deps = isFieldKey(p) && tokenKeyOf(p) === key ? graph.getIncoming(p) : [p];
        for (const d of deps) if (d.includes('.')) add(scopeOf(isFieldKey(d) ? tokenKeyOf(d) : d), scope.name);
      }
    }
  }
  return flow;
}

/** Places the tables in columns by data flow (a layered, Sugiyama-style
 *  layout): a scope one column right of the furthest scope it reads
 *  (cycles broken), the tables in a column ordered by the mean place of
 *  the tables they connect to, columns as far apart as the lines between
 *  them need, each column centred on the tallest. */
function layOutInLayers(
  tables: TableInfo[],
  flow: Map<string, Map<string, number>>,
  { tableGap, laneGap }: { tableGap: number; laneGap: number },
): void {
  const names = tables.map(t => t.scopeName);
  const index = new Map(names.map((n, i) => [n, i]));
  const weight = (a: string, b: string) => flow.get(a)?.get(b) ?? 0;

  // Break cycles: drop the edges a depth-first walk finds going back.
  const out = names.map(() => [] as number[]);
  const state = names.map(() => 0); // 0 new, 1 on the path, 2 done
  const visit = (i: number) => {
    state[i] = 1;
    for (const [to] of flow.get(names[i]) ?? []) {
      const j = index.get(to);
      if (j === undefined) continue;
      if (state[j] === 1) continue; // back edge
      out[i].push(j);
      if (state[j] === 0) visit(j);
    }
    state[i] = 2;
  };
  names.forEach((_, i) => { if (state[i] === 0) visit(i); });

  // Layers: the longest path from a scope that reads nothing.
  const layer = names.map(() => 0);
  const indegree = names.map(() => 0);
  out.forEach(list => list.forEach(j => indegree[j]++));
  const queue = names.map((_, i) => i).filter(i => indegree[i] === 0);
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    for (const j of out[i]) {
      layer[j] = Math.max(layer[j], layer[i] + 1);
      if (--indegree[j] === 0) queue.push(j);
    }
  }
  const columns: number[][] = [];
  names.forEach((_, i) => (columns[layer[i]] ??= []).push(i));
  for (let c = 0; c < columns.length; c++) columns[c] ??= [];

  // Order each column by the mean place of its tables' neighbours,
  // sweeping right then left a few times.
  const place = names.map(() => 0);
  const setPlaces = () => columns.forEach(col => col.forEach((i, k) => (place[i] = (k + 0.5) / col.length)));
  setPlaces();
  const linked = (i: number, j: number) => weight(names[i], names[j]) + weight(names[j], names[i]);
  for (let pass = 0; pass < 6; pass++) {
    const order = pass % 2 === 0 ? columns.map((_, c) => c) : columns.map((_, c) => columns.length - 1 - c);
    for (const c of order) {
      const towards = pass % 2 === 0 ? (l: number) => l < c : (l: number) => l > c;
      const mean = (i: number) => {
        let sum = 0, total = 0;
        names.forEach((_, j) => {
          const w = linked(i, j);
          if (w > 0 && towards(layer[j])) { sum += w * place[j]; total += w; }
        });
        return total > 0 ? sum / total : place[i];
      };
      const means = new Map(columns[c].map(i => [i, mean(i)]));
      columns[c].sort((a, b) => means.get(a)! - means.get(b)!);
      setPlaces();
    }
  }

  // Columns as far apart as the lines crossing between them need.
  const crossing = columns.map(() => 0);
  names.forEach((a, i) => names.forEach((b, j) => {
    const w = weight(a, b);
    if (!w) return;
    const lo = Math.min(layer[i], layer[j]), hi = Math.max(layer[i], layer[j]);
    for (let c = lo; c < Math.max(hi, lo + 1); c++) crossing[c] += w;
  }));
  let x = 0;
  const heights = columns.map(col =>
    col.reduce((sum, i) => sum + tables[i].height, 0) + tableGap * Math.max(0, col.length - 1));
  const tallest = Math.max(...heights);
  columns.forEach((col, c) => {
    const width = Math.max(0, ...col.map(i => tables[i].width));
    let y = (tallest - heights[c]) / 2;
    for (const i of col) {
      const t = tables[i];
      t.x = x;
      t.y = y;
      t.onLeft = true; // its dots on the right edge, where it is read
      y += t.height + tableGap;
    }
    x += width + Math.min(tableGap * 8, tableGap * 1.5 + crossing[c] * laneGap * 1.5);
  });
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
      routing: options?.routing ?? 'orthogonal',
      bridges: options?.bridges ?? true,
      filterConnections: options?.filterConnections ?? (() => true),
      layout: options?.layout ?? 'layered',
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

    // 2. Layout
    const layered = this.options.layout === 'layered';
    if (layered) layOutInLayers(tables, scopeFlow(this.book), { tableGap, laneGap: Math.max(5, strokeWidth * 3) });
    else {
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
        inX: table.x + offsetX,
      });

      // Token dots
      for (let i = 0; i < table.keys.length; i++) {
        const tokenName = table.keys[i];
        const token = scope.get(tokenName);
        if (!token) continue;

        const baseType = getTokenBaseType(this.book, `${table.scopeName}.${tokenName}`);
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
          inX: table.x + offsetX,
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
        // Swap the outline only on the highlighted connections so the
        // animated dashes contrast with the color of each curve.
        lines.push(`svg.interactive:has([data-token-key="${sel}"]:hover) .connection[data-from="${sel}"] .conn-bg, svg.interactive:has([data-token-key="${sel}"]:hover) .connection[data-to="${sel}"] .conn-bg { stroke: var(--active-outline); }`);
      }
      // Animated marching dashes show data-flow direction. The animation
      // only runs while a token is being hovered, so the chart is calm
      // when the user isn't probing. data-flow="end" means data flows
      // along the path's M→C direction; "start" means against it.
      // While a token is hovered the other lines fade out: show the
      // bridged lines flat.
      lines.push('svg.interactive .conn-flat { display: none; }');
      lines.push('svg.interactive:has([data-token-key]:hover) .conn-flat { display: inline; }');
      lines.push('svg.interactive:has([data-token-key]:hover) .conn-hop { display: none; }');
      lines.push('@keyframes db-flow-fwd { to { stroke-dashoffset: -20; } }');
      lines.push('@keyframes db-flow-rev { to { stroke-dashoffset:  20; } }');
      lines.push('svg.interactive:has([data-token-key]:hover) .connection[data-flow="end"] .conn-fg { stroke-dasharray: 6 4; animation: db-flow-fwd 0.8s linear infinite; }');
      lines.push('svg.interactive:has([data-token-key]:hover) .connection[data-flow="start"] .conn-fg { stroke-dasharray: 6 4; animation: db-flow-rev 0.8s linear infinite; }');
      // Respect prefers-reduced-motion — fall back to a static dashed
      // marker so direction is still visible without movement.
      lines.push('@media (prefers-reduced-motion: reduce) {');
      lines.push('  svg.interactive:has([data-token-key]:hover) .connection .conn-fg { animation: none; }');
      lines.push('}');
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

    // Layered: rows with a line in on their left edge get a dot there too.
    const readers = new Set<string>();

    if (this.options.showConnections) {
      const graph = this.book.getDependencyGraph();
      const processedConnections = new Set<string>();

      // `consumerAtStart` says the arrowhead should point at the path's
      // start endpoint — i.e. data flows against the path's M→C direction.
      // True for "depends on" paths (owner → dep) and inheritance
      // (child → parent), false for palette-linkers (candidate → fn).
      type Conn = {
        from: DotInfo;
        to: DotInfo;
        isDashed: boolean;
        label: string;
        consumerAtStart: boolean;
      };
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
        // Path goes child → parent; data flows parent → child, so the
        // arrow lands at the child (path start).
        connections.push({ from: fromDot, to: toDot, isDashed: false, label: 'extends', consumerAtStart: true });
      }

      for (const [key, fromDot] of dots) {
        if (fromDot.isHeader) continue;

        // Inherited tokens get their lineage shown via the header-to-header
        // edge above — skip them here to avoid duplicating the relationship.
        // A re-bound one (relative refs) reads its own scope: draw its edges.
        if (this.book.isInherited(key) && !this.book.isRebound(key)) continue;

        const token = this.book.getTokenByKey(key);
        const isFunction = token?.type === 'function';

        // Palette-linker function tokens (bestContrastWith, mostVivid, …)
        // collapse to a single solid edge from the chosen candidate back to
        // the function token — the rest of the palette is implied.
        // When no candidate matches (or it has no dot) the token falls
        // through to its ordinary graph edges below.
        if (isFunction && token && isPaletteLinker(this.book, token)) {
          const resolvedSource = findResolvedSource(this.book, key, token);
          const resolvedDot = resolvedSource ? dots.get(resolvedSource) : undefined;
          if (resolvedDot) {
            const connId = `${resolvedSource}->${key}`;
            if (!processedConnections.has(connId)) {
              processedConnections.add(connId);
              const fnName = (token as FunctionTokenValue).name;
              // Path goes candidate → function token; data flows the
              // same way, so the arrow lands at the function (path end).
              connections.push({ from: resolvedDot, to: fromDot, isDashed: false, label: fnName, consumerAtStart: false });
            }
            continue;
          }
        }

        // linksOnly hides value-deriving function edges entirely.
        if (this.options.linksOnly && isFunction) continue;

        const label = isFunction && token
          ? (token as FunctionTokenValue).name
          : (token?.type === 'reference' ? 'ref' : '');

        // Field nodes (`type.title.fontSize`) have no row: a typography's own
        // fields are looked through to what they read, any other field is
        // drawn as an edge to the token it belongs to.
        const prerequisites = new Set<string>();
        for (const p of graph.getIncoming(key)) {
          const deps = isFieldKey(p) && tokenKeyOf(p) === key ? graph.getIncoming(p) : [p];
          for (const d of deps) prerequisites.add(isFieldKey(d) ? tokenKeyOf(d) : d);
        }
        for (const depKey of prerequisites) {
          const toDot = dots.get(depKey);
          if (!toDot) continue;

          const connId = `${key}->${depKey}`;
          if (processedConnections.has(connId)) continue;
          processedConnections.add(connId);

          // Path goes owner → dep; data flows dep → owner, so the
          // arrow lands at the owner (path start).
          connections.push({ from: fromDot, to: toDot, isDashed: isFunction, label, consumerAtStart: true });
        }
      }

      const keep = this.options.filterConnections;
      for (let i = connections.length - 1; i >= 0; i--) {
        if (!keep(connections[i].from.qualifiedKey, connections[i].to.qualifiedKey)) connections.splice(i, 1);
      }

      // Each connection becomes a <g class="connection"> grouping its
      // background outline and colored path. Labels render in a separate
      // pass after tables/dots so they always sit on top.
      // Orthogonal routing: every table is an obstacle, every dot a port
      // that leaves its table horizontally, away from it.
      // Layered: a connection leaves the row it reads on its right edge and
      // enters the row reading it on its left one.
      const portOf = (dot: DotInfo, reads = false) => layered && reads
        ? { x: dot.inX, y: dot.y, dir: -1 as const, id: `${dot.qualifiedKey}:in` }
        : { x: dot.x, y: dot.y, dir: dot.isLeft ? 1 as const : -1 as const, id: `${dot.qualifiedKey}:out` };
      // A row reading a row of its own table: both ends on the right edge,
      // a short bracket instead of a frame round the table.
      const ports = connections.map(c => {
        const own = c.from.scopeName === c.to.scopeName;
        return [portOf(c.from, c.consumerAtStart && !own), portOf(c.to, !c.consumerAtStart && !own)] as const;
      });
      if (layered) {
        for (const c of connections) {
          if (c.from.scopeName !== c.to.scopeName) readers.add((c.consumerAtStart ? c.from : c.to).qualifiedKey);
        }
      }
      const router = this.options.routing === 'orthogonal'
        ? new OrthogonalRouter(
          tables.map(t => ({ x: t.x + offsetX, y: t.y + offsetY, width: t.width, height: t.height })),
          ports.flatMap(p => [...p]),
          { margin: dotSize * 2, bendCost: rowHeight, laneGap: Math.max(5, strokeWidth * 3) },
        )
        : null;

      // Lines meeting at a dot share their run near it. Routed in the
      // connections' order (each route sees the ones before it).
      const routes: (Point[] | null)[] = router
        ? router.routeAll(ports.map(([a, b]) => [a, b]))
        : connections.map(() => null);
      // Two lines of one color crossing are hard to tell apart: the
      // horizontal one bridges the vertical one.
      const cornerRadius = 2; // the tables' corner (rx)
      const hopRadius = strokeWidth + 2.5;
      const { hops, order } = bridges(
        routes,
        (i, j) => this.options.bridges && connections[i].from.color === connections[j].from.color,
        cornerRadius + hopRadius + 1,
      );

      // Where lines sharing a dot join or split: a small dot.
      const joins = junctions(routes, (i, j) => {
        const [a0, a1] = ports[i], [b0, b1] = ports[j];
        return a0.id === b0.id || a0.id === b1.id || a1.id === b0.id || a1.id === b1.id;
      }, dotSize * 3);

      lines.push('<g class="connections-group">');
      for (const index of order) {
        const { from, to, isDashed, label, consumerAtStart } = connections[index];
        const route = routes[index];
        const [start, end] = ports[index];

        const yDiff = Math.abs(start.y - end.y);
        const amp = 40 + yDiff * 0.3;
        // Each end bends out the way its port faces.
        const cp1x = start.x + start.dir * amp;
        const cp2x = end.x + end.dir * amp;

        const dashAttr = isDashed ? ' stroke-dasharray="5,5"' : '';
        const fromAttr = ` data-from="${escapeXml(from.qualifiedKey)}"`;
        const toAttr   = ` data-to="${escapeXml(to.qualifiedKey)}"`;
        const flowAttr = ` data-flow="${consumerAtStart ? 'start' : 'end'}"`;
        // The "active outline" is what we swap to under :hover so the
        // animated dashes contrast with the curve's own color. Computed
        // per-connection — light colors get a dark outline, dark
        // colors get a light one.
        const activeOutline = pickActiveOutline(from.color);
        const styleAttr = ` style="--active-outline: ${activeOutline}"`;
        const pathD = route
          ? roundedPath(route, cornerRadius, hops[index], hopRadius)
          : `M ${start.x} ${start.y} C ${cp1x} ${start.y}, ${cp2x} ${end.y}, ${end.x} ${end.y}`;

        lines.push(`  <g class="connection"${fromAttr}${toAttr}${flowAttr}${styleAttr}>`);
        const drawPath = (d: string, extra: string) => {
          lines.push(`    <path class="conn-bg${extra}" d="${d}" fill="none" stroke="var(--on-surface)" stroke-width="${strokeWidth + 1}"${dashAttr}/>`);
          lines.push(`    <path class="conn-fg${extra}" d="${d}" fill="none" stroke="${from.color}" stroke-width="${strokeWidth}"${dashAttr}/>`);
        };
        // A bridged line is drawn twice: with its bridges, and flat for
        // hover, when the lines it bridges have faded out.
        if (route && this.options.interactive && hops[index].some(h => h?.length)) {
          drawPath(pathD, ' conn-hop');
          drawPath(roundedPath(route, cornerRadius), ' conn-flat');
        } else {
          drawPath(pathD, '');
        }
        for (const p of joins[index]) {
          lines.push(`    <circle class="conn-junction" cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${(dotSize * 0.6).toFixed(2)}" fill="${from.color}" stroke="var(--on-surface)" stroke-width="${strokeWidth / 2}"/>`);
        }
        lines.push('  </g>');

        if (label) {
          // Cubic-bezier midpoint (t=0.5) for label placement. y collapses
          // to a simple chord-midpoint since cp1/cp2 share endpoint y's.
          const mid = route ? midpoint(route) : null;
          const labelX = mid ? mid.x : 0.125 * (start.x + end.x) + 0.375 * (cp1x + cp2x);
          const labelY = mid ? mid.y - 4 : 0.5 * (start.y + end.y);
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
    const dotsDrawn: DotInfo[] = [];
    for (const [, dot] of dots) {
      dotsDrawn.push(dot);
      if (readers.has(dot.qualifiedKey)) dotsDrawn.push({ ...dot, x: dot.inX });
    }
    for (const dot of dotsDrawn) {
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
