import { parse, formatHex, formatHex8, wcagLuminance } from 'culori';
import { DesignBook } from '../design-book';
import { detectValueType } from '../scope';
import { isPoolReference, anchorScopeOf } from '../tokens';

/** True for a key inside a group (`type.title.fontSize`): it has no row of
 *  its own and is drawn on the row of the key holding its group. */
const isMemberKey = (key: string) => key.indexOf('.') !== key.lastIndexOf('.');
/** The row a key is drawn on: the key of a top-level scope it is in. */
const rowKeyOf = (key: string) => {
  const first = key.indexOf('.');
  const second = first === -1 ? -1 : key.indexOf('.', first + 1);
  return second === -1 ? key : key.slice(0, second);
};
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
  /** The shape the graph is shown at (width / height): where the layered
   *  layout has a choice, it takes the arrangement nearest to it, the way
   *  parts are packed to fill a board. Default 1.5. */
  aspect?: number;
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
  /** Layered: the scope it extends, when that is drawn too; the table is
   *  then joined under it, its inherited rows collapsed into one. */
  parent?: string;
  /** Inherited rows left out (summed up in one row). */
  collapsed: number;
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
 *  The pool is read live from the book: it changes as members come and go. */
function paletteCandidates(book: DesignBook, token: AnyTokenValue): string[] {
  if (token.type !== 'function') return [];
  const fn = token as FunctionTokenValue;
  // Its own walk only: a selector nested in a value deriver does not count.
  const scopeNames = new Set<string>([...(fn.metadata?.iteratedScopes ?? []), ...anchorScopeOf(fn)]);
  for (const arg of fn.args) {
    if (isPoolReference(arg)) scopeNames.add(arg.key);
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

/** For a palette-linker function token, the member of its pool it
 *  picked (`book.pickOf`), or null when it picked none there. Exact: two
 *  members with the same value are told apart. */
function findResolvedSource(
  book: DesignBook,
  qualifiedKey: string,
  token: AnyTokenValue,
): string | null {
  const candidates = paletteCandidates(book, token);
  const picked = book.pickOf(qualifiedKey);
  return picked !== undefined && picked !== qualifiedKey && candidates.includes(picked) ? picked : null;
}

/** How much each scope feeds each other: `flow.get(p).get(s)` counts the
 *  rows of `p` with a line drawn to `s` (by the renderer's own rules: a
 *  selector's pick, references, function arguments unless `linksOnly`,
 *  what `keep` lets through), plus one when `s` extends `p`. Rows, not
 *  lines: the lines from one row bundle into one lane. */
function scopeFlow(
  book: DesignBook,
  linksOnly: boolean,
  keep: (from: string, to: string) => boolean,
): Map<string, Map<string, number>> {
  const flow = new Map<string, Map<string, number>>();
  const counted = new Set<string>();
  const addRow = (row: string, to: string) => {
    const key = `${row}>${to}`;
    if (counted.has(key)) return;
    counted.add(key);
    add(scopeOf(row), to);
  };
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
        if (keep(picked, key)) addRow(picked, scope.name);
        continue;
      }
      if (linksOnly && token?.type === 'function') continue;
      for (const p of graph.getIncoming(key)) {
        const deps = isMemberKey(p) && rowKeyOf(p) === key ? graph.getIncoming(p) : [p];
        for (const d of deps) {
          if (!d.includes('.')) continue;
          const dep = isMemberKey(d) ? rowKeyOf(d) : d;
          if (keep(key, dep)) addRow(dep, scope.name);
        }
      }
    }
  }
  return flow;
}

/** The label of the row summing up a joined table's inherited rows. */
function collapsedLabel(count: number, parent: string): string {
  return `+${count} from ${parent}`;
}

/** The rows a scope joined under its parent shows: what differs from
 *  the parent. Its own rows; a re-bound row (relative refs) whose value
 *  differs from the parent's; a row something outside the family reads or
 *  picks; and, repeated until nothing changes, a row a shown row of the
 *  family reads. Rows of scopes not joined (no drawn parent) are all in. */
function differingRows(book: DesignBook, shown: Set<string>): Set<string> {
  const graph = book.getDependencyGraph();
  const scopes = book.getAllScopes();
  const joined = (name: string) => {
    const parent = book.getScope(name)?.extendsScope;
    return !!parent && shown.has(parent);
  };
  const family = (name: string): string => {
    const parent = book.getScope(name)?.extendsScope;
    return parent && shown.has(parent) ? family(parent) : name;
  };
  const scopeOf = (key: string) => key.slice(0, key.indexOf('.'));
  const resolved = (key: string) => {
    try { return book.resolve(key); } catch { return undefined; }
  };

  // Who reads each row: graph dependents, and selectors' picks.
  const readers = new Map<string, string[]>();
  const addReader = (key: string, reader: string) => {
    const list = readers.get(key);
    if (list) list.push(reader);
    else readers.set(key, [reader]);
  };
  for (const scope of scopes) {
    for (const name of scope.getAllKeys()) {
      const key = `${scope.name}.${name}`;
      for (const r of graph.getOutgoing(key)) if (r.includes('.')) addReader(key, isMemberKey(r) ? rowKeyOf(r) : r);
      const token = book.getTokenByKey(key);
      if (token && isPaletteLinker(book, token)) {
        const picked = findResolvedSource(book, key, token);
        if (picked) addReader(picked, key);
      }
    }
  }

  const keep = new Set<string>();
  const pending: string[] = [];
  for (const scope of scopes) {
    const parent = scope.extendsScope;
    for (const name of scope.getAllKeys()) {
      const key = `${scope.name}.${name}`;
      const differs = !joined(scope.name)
        || !book.isInherited(key)
        || (book.isRebound(key) && resolved(key) !== resolved(`${parent}.${name}`))
        || (readers.get(key) ?? []).some(r => family(scopeOf(r)) !== family(scope.name));
      if (differs) { keep.add(key); pending.push(key); }
    }
  }
  // A shown row's reads within its family stay too.
  const reads = new Map<string, string[]>();
  for (const [key, list] of readers) for (const r of list) {
    const l = reads.get(r);
    if (l) l.push(key);
    else reads.set(r, [key]);
  }
  while (pending.length) {
    const key = pending.pop()!;
    for (const read of reads.get(key) ?? []) {
      if (keep.has(read)) continue;
      keep.add(read);
      pending.push(read);
    }
  }
  return keep;
}

/** A block of the layered layout: a family of joined tables (a scope and
 *  the scopes extending it, stacked), or a placeholder holding a gap in a
 *  column for the lines passing through it. */
interface LayoutNode {
  tables: number[];
  width: number;
  height: number;
  layer: number;
  y: number;
}

/** Places the tables in columns by data flow (a layered, Sugiyama-style
 *  layout). A scope extending a drawn scope is joined under it and the
 *  family placed as one block. A block sits one column right of the
 *  furthest block it reads (cycles broken); a line skipping columns gets a
 *  placeholder in each, so a gap is kept for it between the tables there.
 *  Columns are ordered by the mean place of each block's neighbours, then
 *  every block is moved level with the blocks it connects to, as near as
 *  the column's order and gaps allow. Columns are as far apart as the
 *  lines crossing between them need. */
function layOutInLayers(
  tables: TableInfo[],
  flow: Map<string, Map<string, number>>,
  { tableGap, laneGap, margin, minGap, aspect }:
    { tableGap: number; laneGap: number; margin: number; minGap: number; aspect: number },
): void {
  // Families: each table joined under its parent, the root heading it.
  const byName = new Map(tables.map((t, i) => [t.scopeName, i]));
  const root = (i: number): number => {
    const parent = tables[i].parent;
    return parent !== undefined && byName.has(parent) ? root(byName.get(parent)!) : i;
  };
  const nodes: LayoutNode[] = [];
  const nodeOf = new Map<number, number>();
  const visitFamily = (i: number, members: number[]) => {
    members.push(i);
    tables.forEach((t, j) => { if (t.parent === tables[i].scopeName) visitFamily(j, members); });
  };
  tables.forEach((_, i) => {
    if (root(i) !== i) return;
    const members: number[] = [];
    visitFamily(i, members);
    const width = Math.max(...members.map(m => tables[m].width));
    for (const m of members) {
      tables[m].width = width; // joined: one width
      nodeOf.set(m, nodes.length);
    }
    nodes.push({ tables: members, width, height: members.reduce((h, m) => h + tables[m].height, 0), layer: 0, y: 0 });
  });

  // Edges between blocks, weighted by the lines they carry.
  const weights = new Map<string, number>();
  for (const [from, row] of flow) {
    for (const [to, w] of row) {
      const a = nodeOf.get(byName.get(from) ?? -1), b = nodeOf.get(byName.get(to) ?? -1);
      if (a === undefined || b === undefined || a === b) continue;
      weights.set(`${a}>${b}`, (weights.get(`${a}>${b}`) ?? 0) + w);
    }
  }
  const edges = [...weights].map(([k, w]) => {
    const [a, b] = k.split('>').map(Number);
    return { from: a, to: b, w };
  });

  // Break cycles, heaviest edges first: an edge that would close a cycle
  // is turned round, so the lines running against the flow are the fewest.
  const forward: { from: number; to: number; w: number }[] = [];
  const accepted = nodes.map(() => [] as number[]);
  const reaches = (from: number, to: number) => {
    const seen = new Set([from]);
    const stack = [from];
    while (stack.length) {
      const n = stack.pop()!;
      if (n === to) return true;
      for (const m of accepted[n]) if (!seen.has(m)) { seen.add(m); stack.push(m); }
    }
    return false;
  };
  for (const e of [...edges].sort((a, b) => b.w - a.w)) {
    const [from, to] = reaches(e.to, e.from) ? [e.to, e.from] : [e.from, e.to];
    accepted[from].push(to);
    forward.push({ from, to, w: e.w });
  }

  // Layers: the longest path from a block that reads nothing.
  const indegree = nodes.map(() => 0);
  const next = nodes.map(() => [] as number[]);
  for (const e of forward) { next[e.from].push(e.to); indegree[e.to]++; }
  const queue = nodes.map((_, i) => i).filter(i => indegree[i] === 0);
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    for (const j of next[i]) {
      nodes[j].layer = Math.max(nodes[j].layer, nodes[i].layer + 1);
      if (--indegree[j] === 0) queue.push(j);
    }
  }

  // Blocks with no line to any other stand outside the flow: in a row
  // above it, or beside it, instead of stacked into the first column.
  const linked = nodes.map((_, i) => forward.some(e => e.from === i || e.to === i));
  const flowing = linked.some(Boolean);
  const apart = nodes.map((_, i) => flowing && !linked[i]);

  // Wrap: while the flow is much taller than the shape it is shown at,
  // split its tallest column in two, side by side, balancing their
  // heights; the blocks with the most lines to the right stay in the
  // inner half, next to their readers, the others move out.
  {
    const real = nodes.map((n, i) => i).filter(i => !apart[i]);
    const layersNow = () => {
      const cols: number[][] = [];
      for (const i of real) (cols[nodes[i].layer] ??= []).push(i);
      for (let c = 0; c < cols.length; c++) cols[c] ??= [];
      return cols;
    };
    const stackedH = (col: number[]) => col.reduce((h, i) => h + nodes[i].height, 0) + tableGap * Math.max(0, col.length - 1);
    const outWeight = (i: number) => forward.reduce((w, e) => w + (e.from === i ? e.w : 0), 0);
    for (let guard = 0; guard < 8; guard++) {
      const cols = layersNow();
      const w = cols.reduce((sum, col) => sum + Math.max(0, ...col.map(i => nodes[i].width)) + minGap, 0);
      const h = Math.max(1, ...cols.map(stackedH));
      if (w / h >= aspect / 1.4) break;
      let tallest = -1;
      cols.forEach((col, c) => { if (col.length > 1 && (tallest < 0 || stackedH(col) > stackedH(cols[tallest]))) tallest = c; });
      if (tallest < 0) break;
      const inner: number[] = [];
      let innerH = 0;
      const half = stackedH(cols[tallest]) / 2;
      for (const i of [...cols[tallest]].sort((a, b) => outWeight(b) - outWeight(a))) {
        if (inner.length === 0 || innerH + nodes[i].height <= half) { inner.push(i); innerH += nodes[i].height + tableGap; }
      }
      if (inner.length === cols[tallest].length) break;
      // Everything from this column on moves one to the right; the outer
      // half stays.
      for (const i of real) if (nodes[i].layer > tallest || inner.includes(i)) nodes[i].layer += 1;
    }
  }

  // Placeholders: a line skipping columns keeps a gap in each.
  const links: { a: number; b: number; w: number }[] = [];
  for (const e of forward) {
    let prev = e.from;
    for (let l = nodes[e.from].layer + 1; l < nodes[e.to].layer; l++) {
      nodes.push({ tables: [], width: 0, height: e.w * laneGap + laneGap, layer: l, y: 0 });
      links.push({ a: prev, b: nodes.length - 1, w: e.w });
      prev = nodes.length - 1;
    }
    links.push({ a: prev, b: e.to, w: e.w });
  }
  const neighbours = nodes.map(() => [] as { n: number; w: number }[]);
  for (const { a, b, w } of links) {
    neighbours[a].push({ n: b, w });
    neighbours[b].push({ n: a, w });
  }


  const columns: number[][] = [];
  nodes.forEach((n, i) => { if (!apart[i]) (columns[n.layer] ??= []).push(i); });
  for (let c = 0; c < columns.length; c++) columns[c] ??= [];

  // Order each column by the mean place of its blocks' neighbours,
  // sweeping right then left.
  const place = nodes.map(() => 0);
  const setPlaces = () => columns.forEach(col => col.forEach((i, k) => (place[i] = (k + 0.5) / col.length)));
  setPlaces();
  for (let pass = 0; pass < 8; pass++) {
    const rightward = pass % 2 === 0;
    const order = columns.map((_, c) => (rightward ? c : columns.length - 1 - c));
    for (const c of order) {
      const side = rightward ? c - 1 : c + 1;
      const mean = (i: number) => {
        let sum = 0, total = 0;
        for (const { n, w } of neighbours[i]) if (nodes[n].layer === side) { sum += w * place[n]; total += w; }
        return total > 0 ? sum / total : place[i];
      };
      const means = new Map(columns[c].map(i => [i, mean(i)]));
      columns[c].sort((a, b) => means.get(a)! - means.get(b)!);
      setPlaces();
    }
  }

  // Heights: stacked first, then each block moved level with its
  // neighbours (their centres, weighted by the lines), keeping the
  // column's order and gaps (pool-adjacent violators, as the nudging).
  const gapAfter = (i: number) => (nodes[i].tables.length ? tableGap : laneGap);
  for (const col of columns) {
    let y = 0;
    for (const i of col) { nodes[i].y = y; y += nodes[i].height + gapAfter(i); }
  }
  const settle = (col: number[], side: (n: number) => boolean) => {
    const want = col.map(i => {
      let sum = 0, total = 0;
      for (const { n, w } of neighbours[i]) {
        if (!side(nodes[n].layer)) continue;
        sum += w * (nodes[n].y + nodes[n].height / 2);
        total += w;
      }
      return total > 0 ? sum / total - nodes[i].height / 2 : nodes[i].y;
    });
    // y_k = start_k - offset_k, offsets the stacked heights before k.
    const offsets: number[] = [];
    let o = 0;
    for (const i of col) { offsets.push(o); o += nodes[i].height + gapAfter(i); }
    const blocks: { sum: number; weight: number; count: number }[] = [];
    col.forEach((i, k) => {
      const weight = nodes[i].tables.length ? 1 : 0.2;
      blocks.push({ sum: (want[k] - offsets[k]) * weight, weight, count: 1 });
      while (blocks.length > 1) {
        const b = blocks[blocks.length - 1], a = blocks[blocks.length - 2];
        if (a.sum / a.weight <= b.sum / b.weight) break;
        a.sum += b.sum; a.weight += b.weight; a.count += b.count;
        blocks.pop();
      }
    });
    let k = 0;
    for (const b of blocks) {
      const base = b.sum / b.weight;
      for (let m = 0; m < b.count; m++, k++) nodes[col[k]].y = base + offsets[k];
    }
    // Inside the frame: no column reaches past the tallest stacked one;
    // each block moves only as far as the blocks below it still fit.
    const total = offsets.length ? offsets[offsets.length - 1] + nodes[col[col.length - 1]].height : 0;
    col.forEach((i, k) => {
      nodes[i].y = Math.min(frame - (total - offsets[k]), Math.max(offsets[k], nodes[i].y));
    });
  };
  const frame = Math.max(0, ...columns.map(col =>
    col.reduce((h, i) => h + nodes[i].height + gapAfter(i), 0) - (col.length ? gapAfter(col[col.length - 1]) : 0)));
  for (let pass = 0; pass < 4; pass++) {
    for (let c = 1; c < columns.length; c++) settle(columns[c], l => l < c);
    for (let c = columns.length - 2; c >= 0; c--) settle(columns[c], l => l > c);
  }

  // Columns as far apart as the lines crossing between them need: a
  // margin each side and a lane per line, never closer than `minGap`.
  const crossing = columns.map(() => 0);
  for (const { a, b, w } of links) {
    const lo = Math.min(nodes[a].layer, nodes[b].layer), hi = Math.max(nodes[a].layer, nodes[b].layer);
    for (let g = lo; g < hi; g++) crossing[g] += w;
  }
  // Lanes at different heights share a track: about three in four rows
  // need one, and no gap needs more than 16.
  const gapAfter2 = (c: number) => Math.max(minGap, margin * 2 + Math.min(16, Math.ceil(crossing[c] * 0.75)) * laneGap * 1.2);

  // The flow's size, then where the blocks standing apart go: in a row
  // above it or in columns beside it, whichever is nearer the shape.
  const flowTop = Math.min(...nodes.filter((_, i) => !apart[i]).map(n => n.y));
  const flowWidth = columns.reduce((w, col, c) =>
    w + Math.max(0, ...col.map(i => nodes[i].width)) + (c < columns.length - 1 ? gapAfter2(c) : 0), 0);
  const flowHeight = Math.max(0, ...nodes.filter((_, i) => !apart[i]).map(n => n.y + n.height)) - flowTop;
  const aside = nodes.filter((_, i) => apart[i]);
  const rowW = aside.reduce((w, n) => w + n.width, 0) + minGap * Math.max(0, aside.length - 1);
  const rowH = Math.max(0, ...aside.map(n => n.height));
  const off = (w: number, h: number) => Math.abs(Math.log(w / Math.max(h, 1) / aspect));
  const onTop = aside.length > 0
    && off(Math.max(flowWidth, rowW), flowHeight + rowH + tableGap) <= off(flowWidth + minGap + rowW, Math.max(flowHeight, rowH));
  let asideX = onTop ? 0 : flowWidth + (flowWidth ? minGap : 0);
  for (const n of aside) {
    let y = 0;
    for (const m of n.tables) {
      const t = tables[m];
      t.x = asideX;
      t.y = y;
      t.onLeft = true;
      y += t.height;
    }
    asideX += n.width + minGap;
  }
  const below = onTop && rowH ? rowH + tableGap : 0;

  let x = 0;
  const top = flowTop;
  columns.forEach((col, c) => {
    const width = Math.max(0, ...col.map(i => nodes[i].width));
    for (const i of col) {
      let y = nodes[i].y - top + below;
      for (const m of nodes[i].tables) {
        const t = tables[m];
        t.x = x;
        t.y = y;
        t.onLeft = true; // its dots on the right edge, where it is read
        y += t.height; // joined: no gap
      }
    }
    x += width + gapAfter2(c);
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
      aspect: options?.aspect ?? 1.5,
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
    const layered = this.options.layout === 'layered';
    const shown = new Set(scopes.map(s => s.name));
    // Layered: a scope extending a drawn scope shows only what differs.
    const keep = layered ? differingRows(this.book, shown) : null;

    for (const scope of scopes) {
      const parent = layered && scope.extendsScope && shown.has(scope.extendsScope) ? scope.extendsScope : undefined;
      const all = scope.getAllKeys();
      const keys = parent ? all.filter(k => keep!.has(`${scope.name}.${k}`)) : all;
      const collapsed = all.length - keys.length;
      const allLabels = [scope.name, ...keys, ...(collapsed ? [collapsedLabel(collapsed, parent!)] : [])];
      const maxLabelLen = Math.max(...allLabels.map(l => l.length));
      const width = maxLabelLen * widthPerLetter + tablePadding * 2 + dotSize * 4;
      const height = (1 + keys.length + (collapsed ? 1 : 0)) * rowHeight;

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
        parent,
        collapsed,
      });
    }

    // A joined family (a scope and the scopes joined under it) counts as
    // one table for which side its lines use.
    const parentOf = new Map(tables.map(t => [t.scopeName, t.parent]));
    const familyOf = (name: string): string => {
      const parent = parentOf.get(name);
      return parent ? familyOf(parent) : name;
    };

    // 2. Layout
    if (layered) {
      layOutInLayers(tables, scopeFlow(this.book, this.options.linksOnly, this.options.filterConnections), {
        tableGap, laneGap: Math.max(5, strokeWidth * 3), margin: dotSize * 2, minGap: Math.max(rowHeight * 2, 40),
        aspect: this.options.aspect,
      });
    }
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
      // Joined under its parent: the join shows it, no line.
      if (!parentName || table.parent) continue;
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
        if (!parentName || table.parent) continue;
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
          const deps = isMemberKey(p) && rowKeyOf(p) === key ? graph.getIncoming(p) : [p];
          for (const d of deps) prerequisites.add(isMemberKey(d) ? rowKeyOf(d) : d);
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
        const own = familyOf(c.from.scopeName) === familyOf(c.to.scopeName);
        return [portOf(c.from, c.consumerAtStart && !own), portOf(c.to, !c.consumerAtStart && !own)] as const;
      });
      if (layered) {
        for (const c of connections) {
          if (familyOf(c.from.scopeName) !== familyOf(c.to.scopeName)) readers.add((c.consumerAtStart ? c.from : c.to).qualifiedKey);
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
      // The inherited rows left out, in one row.
      if (table.collapsed) {
        const ry = ty + (table.keys.length + 1) * rowHeight;
        lines.push(`  <rect class="palette-table__row palette-table__row--collapsed" x="${tx}" y="${ry}" width="${table.width}" height="${rowHeight}"/>`);
        lines.push(`  <text class="palette-table__label palette-table__label--inherited" x="${tx + tablePadding}" y="${ry + rowHeight / 2 + fontSize / 3}" font-size="${fontSize}">${escapeXml(collapsedLabel(table.collapsed, table.parent!))}</text>`);
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
