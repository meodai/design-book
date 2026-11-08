/** Orthogonal connector routing: paths made of horizontal and vertical runs
 *  that go round the tables instead of across them.
 *
 *  The routes run on a grid made of the lines that matter (the tables'
 *  edges pushed out by `margin`, every port's row and the end of its stub)
 *  with each gap between two of them filled with evenly spaced lanes, no
 *  closer than `laneGap`.
 *  A grid segment that lies inside a (pushed-out) table is closed. Each
 *  connection is the cheapest walk over that grid, where a bend costs
 *  extra, so routes keep few corners. Routes that meet at a port (one
 *  data source fanning out, or one token reading several) are one line
 *  near it: a segment used only by routes sharing a port with this one is
 *  cheap, so they run together and split only where they have to. Any
 *  other used segment is very dear, so unrelated lines take their own
 *  lanes and only cross. */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where a connection meets a table: the point on its edge, and the
 *  horizontal direction it leaves in (`1` right, `-1` left). */
export interface Port extends Point {
  dir: 1 | -1;
  /** Identifies the port: routes that share one may share their runs.
   *  Defaults to its position. */
  id?: string;
}

export interface RouterOptions {
  /** Clearance kept round every table. */
  margin?: number;
  /** Straight run out of a port before the first bend. At least
   *  `margin`, and best exactly that (the default): a lane between the
   *  clearance and a longer stub's end is only reached by turning back. */
  stub?: number;
  /** A bend costs as much as this much length. */
  bendCost?: number;
  /** Distance between two parallel lanes. */
  laneGap?: number;
}

/** Length factor on a segment used only by routes sharing a port with this one. */
const SHARED = 0.15;
/** Length factor on a segment an unrelated route uses: only taken when there
 *  is no other way (a token reading two sources leaves by one stub). */
const TAKEN = 40;
/** Length factor on a segment running beside an unrelated route, closer
 *  than two lanes: lines keep their distance where there is room. */
const NEAR = 4;
/** Weight on the search guide's distance (1 = only ever the cheapest
 *  route; more = faster, a little less tidy). */
const GREED = 1.2;

// Steps: 0 +x, 1 -x, 2 +y, 3 -y
const DX = [1, -1, 0, 0];
const DY = [0, 0, 1, -1];

class MinHeap {
  private keys = new Float64Array(1024);
  private vals = new Int32Array(1024);
  size = 0;
  /** The key of the entry `pop` last returned. */
  lastKey = 0;

  clear(): void {
    this.size = 0;
  }

  push(key: number, val: number): void {
    if (this.size === this.keys.length) {
      const keys = new Float64Array(this.size * 2), vals = new Int32Array(this.size * 2);
      keys.set(this.keys);
      vals.set(this.vals);
      this.keys = keys;
      this.vals = vals;
    }
    const keys = this.keys, vals = this.vals;
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 2;
      if (keys[p] <= key) break;
      keys[i] = keys[p];
      vals[i] = vals[p];
      i = p;
    }
    keys[i] = key;
    vals[i] = val;
  }

  /** Removes the entry with the smallest key and returns its value (its
   *  key is left in `lastKey`). */
  pop(): number {
    const keys = this.keys, vals = this.vals;
    const topVal = vals[0];
    this.lastKey = keys[0];
    const n = --this.size;
    const lastKey = keys[n], lastVal = vals[n];
    let i = 0;
    for (;;) {
      // Four children per entry: half the levels of a binary heap, and
      // the children side by side in memory.
      const first = 4 * i + 1;
      if (first >= n) break;
      let c = first, ck = keys[first];
      const end = first + 4 < n ? first + 4 : n;
      for (let j = first + 1; j < end; j++) {
        if (keys[j] < ck) {
          ck = keys[j];
          c = j;
        }
      }
      if (ck >= lastKey) break;
      keys[i] = ck;
      vals[i] = vals[c];
      i = c;
    }
    keys[i] = lastKey;
    vals[i] = lastVal;
    return topVal;
  }
}

function allRelated(users: number[], related: Uint8Array): boolean {
  for (const r of users) if (!related[r]) return false;
  return true;
}

/** The first index whose value is at least `value`. */
function lowerBound(list: number[], value: number): number {
  let lo = 0, hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function uniqueSorted(values: number[]): number[] {
  const sorted = values.map(v => Math.round(v * 100) / 100).sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of sorted) if (out.length === 0 || v - out[out.length - 1] > 0.01) out.push(v);
  return out;
}

function indexOf(list: number[], value: number): number {
  const v = Math.round(value * 100) / 100;
  let lo = 0, hi = list.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (Math.abs(list[mid] - v) <= 0.01) return mid;
    if (list[mid] < v) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}

export class OrthogonalRouter {
  private xs: number[];
  private ys: number[];
  /** Closed segment from node (xi, yi) to (xi + 1, yi). */
  private hBlocked: Uint8Array;
  /** Closed segment from node (xi, yi) to (xi, yi + 1). */
  private vBlocked: Uint8Array;
  /** Routes on each segment so far (indices into `ends`), horizontal
   *  segments by their left node, vertical ones by their top node. */
  private usedH: (number[] | undefined)[] = [];
  private usedV: (number[] | undefined)[] = [];
  /** Routes running less than two lanes beside each segment. */
  private nearH: (number[] | undefined)[] = [];
  private nearV: (number[] | undefined)[] = [];
  /** Each routed connection's port ids. */
  private ends: [string, string][] = [];
  /** The routes at each port id. */
  private routesAt = new Map<string, number[]>();
  /** Search state, reused between routes (`seen` marks the entries
   *  written in the current search). */
  private cost?: Float64Array;
  private prev?: Int32Array;
  private seen?: Uint32Array;
  private generation = 0;
  private heap = new MinHeap();
  /** Coarse raster for the search guide: cells of `cellSize`, a cell
   *  closed when it lies wholly inside a table (plus margin); the fine
   *  grid's lines map to cells through `cellOfX` / `cellOfY`. */
  private cellSize = 20;
  private gx = 0;
  private gy = 0;
  private cellClosed = new Uint8Array(0);
  private cellOfX = new Int32Array(0);
  private cellOfY = new Int32Array(0);
  /** Steps from the current target's cell to each cell (-1: unreached). */
  private field: Int32Array = new Int32Array(0);
  /** Fields already filled, by target cell: lines sharing a target share
   *  one. */
  private fields = new Map<number, Int32Array>();
  private queue = new Int32Array(0);
  private stub: number;
  private bendCost: number;
  private laneGap: number;

  constructor(obstacles: Rect[], ports: Port[], options: RouterOptions = {}) {
    const margin = options.margin ?? 10;
    this.stub = Math.max(margin, options.stub ?? margin);
    this.bendCost = options.bendCost ?? 24;

    const boxes = obstacles.map(o => ({
      x0: o.x - margin,
      y0: o.y - margin,
      x1: o.x + o.width + margin,
      y1: o.y + o.height + margin,
    }));

    const edgeXs = uniqueSorted(boxes.flatMap(b => [b.x0, b.x1]));
    const edgeYs = uniqueSorted(boxes.flatMap(b => [b.y0, b.y1]));
    const laneGap = (this.laneGap = options.laneGap ?? 6);
    const out = margin * 2;
    const frame = boxes.length
      ? {
        x0: Math.min(...boxes.map(b => b.x0)) - out,
        x1: Math.max(...boxes.map(b => b.x1)) + out,
        y0: Math.min(...boxes.map(b => b.y0)) - out,
        y1: Math.max(...boxes.map(b => b.y1)) + out,
      }
      : { x0: 0, x1: 0, y0: 0, y1: 0 };
    // Fill every gap between two lines that matter with evenly spaced
    // lanes, at least laneGap apart: a regular raster laid over them
    // would add a line beside nearly every port row.
    const withLanes = (lines: number[]) => {
      const out: number[] = [];
      for (let i = 0; i < lines.length; i++) {
        out.push(lines[i]);
        const next = lines[i + 1];
        if (next === undefined) break;
        const n = Math.floor((next - lines[i]) / laneGap);
        for (let k = 1; k < n; k++) out.push(lines[i] + ((next - lines[i]) * k) / n);
      }
      return out;
    };

    this.xs = withLanes(uniqueSorted([
      ...edgeXs, frame.x0, frame.x1,
      ...ports.map(p => p.x + p.dir * this.stub),
    ]));
    this.ys = withLanes(uniqueSorted([
      ...edgeYs, frame.y0, frame.y1,
      ...ports.map(p => p.y),
    ]));

    const nx = this.xs.length, ny = this.ys.length;
    // Preallocated: written at scattered indices, a growing array would
    // fall back to slow dictionary storage.
    this.usedH = new Array(nx * ny).fill(undefined);
    this.usedV = new Array(nx * ny).fill(undefined);
    this.nearH = new Array(nx * ny).fill(undefined);
    this.nearV = new Array(nx * ny).fill(undefined);
    this.hBlocked = new Uint8Array(nx * ny);
    this.vBlocked = new Uint8Array(nx * ny);
    // Close the segments inside each table (plus margin): a horizontal one
    // on a row strictly inside it, both ends within its sides; a vertical
    // one likewise. The box edges are grid lines, so each is an index range.
    const xs = this.xs, ys = this.ys;
    for (const box of boxes) {
      const xa = lowerBound(xs, box.x0 - 0.01), xb = lowerBound(xs, box.x1 + 0.01) - 1;
      const ya = lowerBound(ys, box.y0 - 0.01), yb = lowerBound(ys, box.y1 + 0.01) - 1;
      for (let xi = xa; xi <= xb; xi++) {
        const inX = xs[xi] > box.x0 + 0.01 && xs[xi] < box.x1 - 0.01;
        for (let yi = ya; yi <= yb; yi++) {
          const id = xi * ny + yi;
          if (xi < xb && ys[yi] > box.y0 + 0.01 && ys[yi] < box.y1 - 0.01) this.hBlocked[id] = 1;
          if (yi < yb && inX) this.vBlocked[id] = 1;
        }
      }
    }

    // The coarse raster behind the search guide.
    const cell = (this.cellSize = Math.max(laneGap * 6, 24));
    const gx = (this.gx = Math.max(1, Math.ceil((frame.x1 - frame.x0) / cell) + 1));
    const gy = (this.gy = Math.max(1, Math.ceil((frame.y1 - frame.y0) / cell) + 1));
    this.cellClosed = new Uint8Array(gx * gy);
    for (const box of boxes) {
      // Only cells wholly inside: a gap between two tables stays open.
      const cx0 = Math.ceil((box.x0 - frame.x0) / cell), cx1 = Math.floor((box.x1 - frame.x0) / cell) - 1;
      const cy0 = Math.ceil((box.y0 - frame.y0) / cell), cy1 = Math.floor((box.y1 - frame.y0) / cell) - 1;
      for (let cx = Math.max(0, cx0); cx <= Math.min(gx - 1, cx1); cx++) {
        for (let cy = Math.max(0, cy0); cy <= Math.min(gy - 1, cy1); cy++) this.cellClosed[cx * gy + cy] = 1;
      }
    }
    const clampCell = (v: number, n: number) => Math.min(n - 1, Math.max(0, Math.floor(v / cell)));
    this.cellOfX = Int32Array.from(xs, x => clampCell(x - frame.x0, gx));
    this.cellOfY = Int32Array.from(ys, y => clampCell(y - frame.y0, gy));
    this.fields.clear();
    this.queue = new Int32Array(gx * gy);
  }

  /** Guide for the search: the Manhattan distance to the target, plus a
   *  bend when it is not in line, a little overweighted so the search
   *  heads for the target rather than widening round crowded lanes. */
  private estimate(xi: number, yi: number, tx: number, ty: number): number {
    const dx = Math.abs(this.xs[xi] - this.xs[tx]), dy = Math.abs(this.ys[yi] - this.ys[ty]);
    // Round the tables: the coarse steps to the target, less two cells
    // for where in its cell the node sits; never below the straight way.
    const steps = this.field[this.cellOfX[xi] * this.gy + this.cellOfY[yi]];
    const around = steps < 0 ? 0 : (steps - 2) * this.cellSize;
    return Math.max(dx + dy, around) * GREED + (dx > 0.01 && dy > 0.01 ? this.bendCost : 0);
  }

  /** Points `field` at the coarse steps from the target's cell, going
   *  round closed cells (filled once per target cell). */
  private flood(tx: number, ty: number): void {
    const { gx, gy, queue, cellClosed } = this;
    const goal = this.cellOfX[tx] * gy + this.cellOfY[ty];
    const known = this.fields.get(goal);
    if (known) {
      this.field = known;
      return;
    }
    const field = (this.field = new Int32Array(gx * gy).fill(-1));
    this.fields.set(goal, field);
    let head = 0, tail = 0;
    field[goal] = 0;
    queue[tail++] = goal;
    while (head < tail) {
      const c = queue[head++];
      const cx = (c / gy) | 0, cy = c - cx * gy, next = field[c] + 1;
      if (cx > 0 && field[c - gy] < 0 && !cellClosed[c - gy]) { field[c - gy] = next; queue[tail++] = c - gy; }
      if (cx < gx - 1 && field[c + gy] < 0 && !cellClosed[c + gy]) { field[c + gy] = next; queue[tail++] = c + gy; }
      if (cy > 0 && field[c - 1] < 0 && !cellClosed[c - 1]) { field[c - 1] = next; queue[tail++] = c - 1; }
      if (cy < gy - 1 && field[c + 1] < 0 && !cellClosed[c + 1]) { field[c + 1] = next; queue[tail++] = c + 1; }
    }
  }

  /** The route's corner points, from `from` to `to`, or null when no
   *  route exists (a port's stub ends inside another table).
   *
   *  A* over (node, heading) states, guided by the Manhattan distance to
   *  the target. The guide can overestimate where a shared run is cheaper
   *  than its length, so the route found is a good one, not always the
   *  cheapest; in exchange the search stays near the straight path instead
   *  of flooding the whole grid. */
  route(from: Port, to: Port): Point[] | null {
    const { xs, ys, stub, bendCost } = this;
    const nx = xs.length, ny = ys.length;
    const sx = indexOf(xs, from.x + from.dir * stub), sy = indexOf(ys, from.y);
    const tx = indexOf(xs, to.x + to.dir * stub), ty = indexOf(ys, to.y);
    if (sx < 0 || sy < 0 || tx < 0 || ty < 0) return null;

    const fromId = from.id ?? `${from.x},${from.y}`;
    const toId = to.id ?? `${to.x},${to.y}`;
    // Which earlier routes share a port with this one.
    const related = new Uint8Array(this.ends.length);
    for (const r of this.routesAt.get(fromId) ?? []) related[r] = 1;
    for (const r of this.routesAt.get(toId) ?? []) related[r] = 1;

    // A state is a node and the axis the route moves along there
    // (0 horizontal, 1 vertical); the heading itself is not needed: going
    // back the way it came only adds length, and a stub's end can't be
    // reached from its table's side, which lies in the closed margin. So
    // a route leaves its start, and enters its goal, moving horizontally.
    const start = (sx * ny + sy) * 2;
    const goal = tx * ny + ty;

    const size = nx * ny * 2;
    if (!this.cost || this.cost.length !== size) {
      this.cost = new Float64Array(size);
      this.prev = new Int32Array(size);
      this.seen = new Uint32Array(size);
      this.generation = 0;
    }
    const cost = this.cost, prev = this.prev!, seen = this.seen!;
    const gen = ++this.generation;
    this.flood(tx, ty);
    const heap = this.heap;
    heap.clear();
    cost[start] = 0;
    prev[start] = -1;
    seen[start] = gen;
    heap.push(this.estimate(sx, sy, tx, ty), start);

    let best = -1, bestCost = Infinity;
    while (heap.size > 0) {
      const state = heap.pop();
      const f = heap.lastKey;
      if (f >= bestCost) break;
      const c = cost[state];
      const node = state >> 1, axis = state & 1;
      const xi = (node / ny) | 0, yi = node - xi * ny;
      if (f > c + this.estimate(xi, yi, tx, ty) + 1e-9) continue; // stale
      if (node === goal) {
        const total = c + (axis === 0 ? 0 : bendCost);
        if (total < bestCost) {
          bestCost = total;
          best = state;
        }
        continue;
      }
      for (let d = 0; d < 4; d++) {
        const nxi = xi + DX[d], nyi = yi + DY[d];
        if (nxi < 0 || nxi >= nx || nyi < 0 || nyi >= ny) continue;
        const horizontal = d < 2;
        const segId = horizontal ? Math.min(xi, nxi) * ny + yi : xi * ny + Math.min(yi, nyi);
        if (horizontal ? this.hBlocked[segId] : this.vBlocked[segId]) continue;
        const len = Math.abs(xs[nxi] - xs[xi]) + Math.abs(ys[nyi] - ys[yi]);
        const users = (horizontal ? this.usedH : this.usedV)[segId];
        let share = 1;
        if (users) share = allRelated(users, related) ? SHARED : TAKEN;
        else {
          const near = (horizontal ? this.nearH : this.nearV)[segId];
          if (near && !allRelated(near, related)) share = NEAR;
        }
        const nextAxis = horizontal ? 0 : 1;
        const next = (nxi * ny + nyi) * 2 + nextAxis;
        const nc = c + len * share + (nextAxis === axis ? 0 : bendCost);
        if (seen[next] !== gen || nc < cost[next]) {
          seen[next] = gen;
          cost[next] = nc;
          prev[next] = state;
          heap.push(nc + this.estimate(nxi, nyi, tx, ty), next);
        }
      }
    }
    if (best < 0) return null;

    const nodes: number[] = [];
    for (let st = best; st >= 0; st = prev[st]) nodes.push(st >> 1);
    nodes.reverse();
    const routeIndex = this.ends.length;
    this.ends.push([fromId, toId]);
    for (const id of [fromId, toId]) {
      const list = this.routesAt.get(id);
      if (list) list.push(routeIndex);
      else this.routesAt.set(id, [routeIndex]);
    }
    for (let i = 1; i < nodes.length; i++) {
      const a = nodes[i - 1], b = nodes[i];
      const ax = (a / ny) | 0, ay = a % ny, bx = (b / ny) | 0, by = b % ny;
      const store = ay === by ? this.usedH : this.usedV;
      const id = ay === by ? Math.min(ax, bx) * ny + ay : ax * ny + Math.min(ay, by);
      (store[id] ??= []).push(routeIndex);
      // Mark the lanes beside it, up to two lanes away.
      const horizontal = ay === by;
      const across = horizontal ? ys : xs;
      const at = horizontal ? ay : ax;
      const along = horizontal ? Math.min(ax, bx) : Math.min(ay, by);
      const near = horizontal ? this.nearH : this.nearV;
      for (let step = -1; step <= 1; step += 2) {
        for (let k = at + step; k >= 0 && k < across.length && Math.abs(across[k] - across[at]) < this.laneGap * 2; k += step) {
          const list = (near[horizontal ? along * ny + k : k * ny + along] ??= []);
          if (list[list.length - 1] !== routeIndex) list.push(routeIndex);
        }
      }
    }

    const points: Point[] = [
      { x: from.x, y: from.y },
      ...nodes.map(n => ({ x: xs[Math.floor(n / ny)], y: ys[n % ny] })),
      { x: to.x, y: to.y },
    ];
    return simplify(points);
  }
}

/** Drops repeated points and points in the middle of a straight run. */
function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2];
      const b = last!;
      const straight = (Math.abs(a.x - b.x) < 0.01 && Math.abs(b.x - p.x) < 0.01)
        || (Math.abs(a.y - b.y) < 0.01 && Math.abs(b.y - p.y) < 0.01);
      if (straight) out.pop();
    }
    out.push(p);
  }
  return out;
}

/** An SVG path through the points with every corner rounded. `hops[i]`
 *  lists the x positions where segment i (points[i] → points[i + 1], a
 *  horizontal one) bridges another line, drawn as a half circle of
 *  `hopRadius` above it. */
export function roundedPath(points: Point[], radius: number, hops: number[][] = [], hopRadius = 4): string {
  const f = (n: number) => Number(n.toFixed(2));
  let d = `M ${f(points[0].x)} ${f(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], p = points[i + 1];
    const s = Math.sign(p.x - a.x);
    // Crossings closer than a bridge's width (lines bundled side by side)
    // share one bridge that spans them all.
    const xs = (hops[i] ?? []).slice().sort((u, v) => s * (u - v));
    for (let j = 0; j < xs.length;) {
      let k = j;
      while (k + 1 < xs.length && s * (xs[k + 1] - xs[k]) <= hopRadius * 2.5) k++;
      const half = Math.abs(xs[k] - xs[j]) / 2 + hopRadius;
      const mid = (xs[j] + xs[k]) / 2;
      d += ` L ${f(mid - s * half)} ${f(a.y)} A ${f(half)} ${hopRadius} 0 0 ${s > 0 ? 1 : 0} ${f(mid + s * half)} ${f(a.y)}`;
      j = k + 1;
    }
    const b = points[i + 2];
    if (!b) break;
    const la = Math.hypot(p.x - a.x, p.y - a.y), lb = Math.hypot(b.x - p.x, b.y - p.y);
    const r = Math.min(radius, la / 2, lb / 2);
    const p1 = { x: p.x + ((a.x - p.x) / la) * r, y: p.y + ((a.y - p.y) / la) * r };
    const p2 = { x: p.x + ((b.x - p.x) / lb) * r, y: p.y + ((b.y - p.y) / lb) * r };
    d += ` L ${f(p1.x)} ${f(p1.y)} Q ${f(p.x)} ${f(p.y)} ${f(p2.x)} ${f(p2.y)}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${f(last.x)} ${f(last.y)}`;
}

/** Bridges where two routes cross: a horizontal run hops over a vertical
 *  one when `bridged(i, j)` says the crossing of routes i and j needs one
 *  (say, lines of the same color). A crossing closer than `clearance` to
 *  either run's end is a corner or a meeting, not a crossing, and is left
 *  alone. Returns each route's hops (as `roundedPath` takes them) and a
 *  drawing order that paints every bridged-over line before the line
 *  that bridges it. */
export function bridges(
  routes: (Point[] | null)[],
  bridged: (i: number, j: number) => boolean,
  clearance: number,
): { hops: number[][][]; order: number[] } {
  const hops: number[][][] = routes.map(() => []);
  const below: Set<number>[] = routes.map(() => new Set());
  // Ends sit on the dots, a hair off the grid: compare with a tolerance.
  const segments = (pts: Point[], horizontal: boolean) =>
    pts.slice(1).map((b, k) => ({ k, a: pts[k], b }))
      .filter(({ a, b }) => horizontal ? Math.abs(a.y - b.y) < 0.05 && Math.abs(a.x - b.x) >= 0.05 : Math.abs(a.x - b.x) < 0.05 && Math.abs(a.y - b.y) >= 0.05);

  routes.forEach((ri, i) => {
    if (!ri) return;
    for (const h of segments(ri, true)) {
      const x0 = Math.min(h.a.x, h.b.x), x1 = Math.max(h.a.x, h.b.x), y = h.a.y;
      routes.forEach((rj, j) => {
        if (!rj || j === i || !bridged(i, j)) return;
        for (const v of segments(rj, false)) {
          const x = v.a.x, y0 = Math.min(v.a.y, v.b.y), y1 = Math.max(v.a.y, v.b.y);
          if (x - x0 < clearance || x1 - x < clearance) continue;
          if (y - y0 < clearance || y1 - y < clearance) continue;
          const list = (hops[i][h.k] ??= []);
          // A run shared by several lines is crossed once.
          if (!list.some(o => Math.abs(o - x) < 0.05)) list.push(x);
          below[i].add(j);
        }
      });
    }
  });

  // Kahn's order over "j under i"; a cycle falls back to index order.
  const order: number[] = [];
  const placed = new Set<number>();
  while (order.length < routes.length) {
    const next = routes.findIndex((_, i) => !placed.has(i) && [...below[i]].every(j => placed.has(j)));
    const pick = next >= 0 ? next : routes.findIndex((_, i) => !placed.has(i));
    placed.add(pick);
    order.push(pick);
  }
  return { hops, order };
}

/** The point halfway along the polyline. */
export function midpoint(points: Point[]): Point {
  const lens = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  let half = lens.reduce((s, l) => s + l, 0) / 2;
  for (let i = 0; i < lens.length; i++) {
    if (half <= lens[i] && lens[i] > 0) {
      const t = half / lens[i];
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * t,
        y: points[i].y + (points[i + 1].y - points[i].y) * t,
      };
    }
    half -= lens[i];
  }
  return points[points.length - 1];
}
