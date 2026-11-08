/** Orthogonal connector routing: paths made of horizontal and vertical runs
 *  that go round the tables instead of across them, in two passes (the
 *  way libavoid does it).
 *
 *  Routing: each connection is the cheapest walk over a sparse grid made
 *  only of the lines that matter: the tables' edges pushed out by
 *  `margin`, the middle of each gap between two of those, every port's
 *  row and the end of its stub. A grid segment inside a (pushed-out)
 *  table is closed; a bend costs extra. Routes that meet at a port (one
 *  data source fanning out, or one token reading several) are one line
 *  near it, so a segment used only by routes sharing a port with this one
 *  is cheap; each unrelated route already on a segment makes it a little
 *  dearer, so busy channels fill evenly.
 *
 *  Nudging: routes sharing a run are then spread into lanes `laneGap`
 *  apart, round the run's line. Routes sharing a port keep one lane; the
 *  lanes are ordered so lines cross no more than they must (a line whose
 *  ends both turn one way runs on that side, longer brackets outside
 *  shorter ones); a run on a port's row stays on it; lanes stay out of
 *  the tables, closing up when a gap is narrow. */

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
   *  `margin`, and best exactly that (the default). */
  stub?: number;
  /** A bend costs as much as this much length. */
  bendCost?: number;
  /** Distance between two lanes of a shared run. */
  laneGap?: number;
}

/** Length factor on a segment used only by routes sharing a port with this one. */
const SHARED = 0.15;
/** Extra length factor on a segment for each unrelated route on it, up
 *  to `CROWD_MAX`: just enough to fill busy channels evenly; the nudging
 *  spreads the lines in one, so crowding must not send routes round the
 *  outside. */
const CROWD = 0.05;
const CROWD_MAX = 0.5;
/** Length factor on a run along a table's side (within two margins of
 *  it): lines leave on their own port's row and turn in the open, rather
 *  than drop down beside the table past its other ports. */
const HUG = 1.5;
/** How far into a table's margin a lane may be pushed, as a share of it:
 *  none, or a lane passing a table's dots looks as if it met them. */
const INTO_MARGIN = 0;

// Steps: 0 +x, 1 -x, 2 +y, 3 -y
const DX = [1, -1, 0, 0];
const DY = [0, 0, 1, -1];

class MinHeap {
  private keys = new Float64Array(256);
  private vals = new Int32Array(256);
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
   *  key is left in `lastKey`). A 4-ary heap: half the levels of a binary
   *  one, the children side by side. */
  pop(): number {
    const keys = this.keys, vals = this.vals;
    const topVal = vals[0];
    this.lastKey = keys[0];
    const n = --this.size;
    const lastKey = keys[n], lastVal = vals[n];
    let i = 0;
    for (;;) {
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
  const i = lowerBound(list, Math.round(value * 100) / 100 - 0.01);
  return i < list.length && Math.abs(list[i] - value) <= 0.02 ? i : -1;
}

interface Box { x0: number; y0: number; x1: number; y1: number }

/** One straight run of a route, for nudging. */
interface Run {
  route: number;
  /** Index of the run's first point in the route. */
  k: number;
  vertical: boolean;
  /** Its line: x of a vertical run, y of a horizontal one. */
  pos: number;
  lo: number;
  hi: number;
  /** Where the route turns at each end, across the run: -1 toward lower
   *  coordinates, 1 toward higher, 0 at a port. */
  turnLo: number;
  turnHi: number;
  /** On a port's row: stays where it is. */
  fixed: boolean;
}

/** Runs sharing a lane. */
interface Lane {
  runs: Run[];
  vertical: boolean;
  /** The grid line its runs lie on, and where the nudging puts it. */
  pos: number;
  at?: number;
  lo: number;
  hi: number;
  turnLo: number;
  turnHi: number;
  fixed: boolean;
}

export class OrthogonalRouter {
  private xs: number[];
  private ys: number[];
  private boxes: Box[];
  private margin: number;
  private stub: number;
  private bendCost: number;
  private laneGap: number;
  /** Closed segment from node (xi, yi) to (xi + 1, yi). */
  private hBlocked: Uint8Array;
  /** Closed segment from node (xi, yi) to (xi, yi + 1). */
  private vBlocked: Uint8Array;
  /** Segments running along a table's side. */
  private hHug: Uint8Array;
  private vHug: Uint8Array;
  /** Routes on each segment so far (indices into `ends`). */
  private usedH: (number[] | undefined)[];
  private usedV: (number[] | undefined)[];
  /** Each routed connection's port ids. */
  private ends: [string, string][] = [];
  /** The routes at each port id. */
  private routesAt = new Map<string, number[]>();
  /** Search state, reused between routes (`seen` marks the entries
   *  written in the current search). */
  private cost: Float64Array;
  private prev: Int32Array;
  private seen: Uint32Array;
  private generation = 0;
  private heap = new MinHeap();

  constructor(obstacles: Rect[], ports: Port[], options: RouterOptions = {}) {
    const margin = (this.margin = options.margin ?? 10);
    this.stub = Math.max(margin, options.stub ?? margin);
    this.bendCost = options.bendCost ?? 24;
    this.laneGap = options.laneGap ?? 6;

    const boxes = (this.boxes = obstacles.map(o => ({
      x0: o.x - margin,
      y0: o.y - margin,
      x1: o.x + o.width + margin,
      y1: o.y + o.height + margin,
    })));
    const out = margin * 2;
    const frame = boxes.length
      ? {
        x0: Math.min(...boxes.map(b => b.x0)) - out,
        x1: Math.max(...boxes.map(b => b.x1)) + out,
        y0: Math.min(...boxes.map(b => b.y0)) - out,
        y1: Math.max(...boxes.map(b => b.y1)) + out,
      }
      : { x0: 0, x1: 0, y0: 0, y1: 0 };

    // The lines that matter, and the middle of each gap between them:
    // the channels the nudging spreads lanes round.
    const withMiddles = (lines: number[]) => {
      const out: number[] = [];
      for (let i = 0; i < lines.length; i++) {
        out.push(lines[i]);
        if (i + 1 < lines.length) out.push((lines[i] + lines[i + 1]) / 2);
      }
      return out;
    };
    const edgeXs = uniqueSorted([...boxes.flatMap(b => [b.x0, b.x1]), frame.x0, frame.x1]);
    const edgeYs = uniqueSorted([...boxes.flatMap(b => [b.y0, b.y1]), frame.y0, frame.y1]);
    const xs = (this.xs = uniqueSorted([...withMiddles(edgeXs), ...ports.map(p => p.x + p.dir * this.stub)]));
    const ys = (this.ys = uniqueSorted([...withMiddles(edgeYs), ...ports.map(p => p.y)]));

    const nx = xs.length, ny = ys.length;
    this.hBlocked = new Uint8Array(nx * ny);
    this.vBlocked = new Uint8Array(nx * ny);
    this.hHug = new Uint8Array(nx * ny);
    this.vHug = new Uint8Array(nx * ny);
    // Runs along a table's side: within two margins of it, beside it.
    const near = margin * 2;
    for (const box of boxes) {
      const xa = lowerBound(xs, box.x0 - near - 0.01), xb = lowerBound(xs, box.x1 + near + 0.01) - 1;
      const ya = lowerBound(ys, box.y0 - near - 0.01), yb = lowerBound(ys, box.y1 + near + 0.01) - 1;
      for (let xi = xa; xi <= xb; xi++) {
        const besideX = xs[xi] <= box.x0 + 0.01 || xs[xi] >= box.x1 - 0.01;
        for (let yi = ya; yi <= yb; yi++) {
          const id = xi * ny + yi;
          const besideY = ys[yi] <= box.y0 + 0.01 || ys[yi] >= box.y1 - 0.01;
          if (besideX && yi < yb && ys[yi] >= box.y0 - 0.01 && ys[yi + 1] <= box.y1 + 0.01) this.vHug[id] = 1;
          if (besideY && xi < xb && xs[xi] >= box.x0 - 0.01 && xs[xi + 1] <= box.x1 + 0.01) this.hHug[id] = 1;
        }
      }
    }
    this.usedH = new Array(nx * ny).fill(undefined);
    this.usedV = new Array(nx * ny).fill(undefined);
    this.cost = new Float64Array(nx * ny * 2);
    this.prev = new Int32Array(nx * ny * 2);
    this.seen = new Uint32Array(nx * ny * 2);
    // Close the segments inside each table (plus margin): the box edges
    // are grid lines, so each is an index range.
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
  }

  /** Routes every connection, then spreads the runs they share into
   *  lanes. Null for a connection with no route. */
  routeAll(pairs: [Port, Port][]): (Point[] | null)[] {
    const routes = pairs.map(([from, to]) => this.route(from, to));
    this.nudge(routes, pairs.map(([from, to]) => [from.id ?? `${from.x},${from.y}`, to.id ?? `${to.x},${to.y}`]));
    return routes.map(r => (r ? simplify(r) : null));
  }

  /** The route's corner points on the sparse grid, from `from` to `to`,
   *  or null when no route exists (a port's stub ends inside another
   *  table). Not yet spread into lanes: see `routeAll`. */
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

    // A state is a node and the axis the route moves along there (0
    // horizontal, 1 vertical): going back the way it came only adds
    // length, and a stub's end can't be reached from its table's side.
    // So a route leaves its start, and enters its goal, horizontally.
    const start = (sx * ny + sy) * 2;
    const goal = tx * ny + ty;
    const goalX = xs[tx], goalY = ys[ty];
    const estimate = (xi: number, yi: number) => {
      const dx = Math.abs(xs[xi] - goalX), dy = Math.abs(ys[yi] - goalY);
      return dx + dy + (dx > 0.01 && dy > 0.01 ? bendCost : 0);
    };

    const { cost, prev, seen, heap } = this;
    const gen = ++this.generation;
    heap.clear();
    cost[start] = 0;
    prev[start] = -1;
    seen[start] = gen;
    heap.push(estimate(sx, sy), start);

    let best = -1, bestCost = Infinity;
    while (heap.size > 0) {
      const state = heap.pop();
      const f = heap.lastKey;
      if (f >= bestCost) break;
      const c = cost[state];
      const node = state >> 1, axis = state & 1;
      const xi = (node / ny) | 0, yi = node - xi * ny;
      if (f > c + estimate(xi, yi) + 1e-9) continue; // stale
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
        if (users) {
          let unrelated = 0;
          for (const r of users) if (!related[r]) unrelated++;
          share = unrelated === 0 ? SHARED : 1 + Math.min(CROWD_MAX, CROWD * unrelated);
        }
        if (horizontal ? this.hHug[segId] : this.vHug[segId]) share *= HUG;
        const nextAxis = horizontal ? 0 : 1;
        const next = (nxi * ny + nyi) * 2 + nextAxis;
        const nc = c + len * share + (nextAxis === axis ? 0 : bendCost);
        if (seen[next] !== gen || nc < cost[next]) {
          seen[next] = gen;
          cost[next] = nc;
          prev[next] = state;
          heap.push(nc + estimate(nxi, nyi), next);
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
    }

    return simplify([
      { x: from.x, y: from.y },
      ...nodes.map(n => ({ x: xs[(n / ny) | 0], y: ys[n % ny] })),
      { x: to.x, y: to.y },
    ]);
  }

  /** Spreads the runs routes share into lanes, moving the routes' points
   *  in place. `ids` are each route's port ids. */
  private nudge(routes: (Point[] | null)[], ids: [string, string][]): void {
    const related = (a: number, b: number) =>
      a === b || ids[a][0] === ids[b][0] || ids[a][0] === ids[b][1] || ids[a][1] === ids[b][0] || ids[a][1] === ids[b][1];

    // Every run, with where its route turns at each end.
    const channels = new Map<string, Run[]>();
    routes.forEach((pts, route) => {
      if (!pts) return;
      const last = pts.length - 2;
      for (let k = 0; k <= last; k++) {
        const a = pts[k], b = pts[k + 1];
        const vertical = Math.abs(a.x - b.x) < 0.01;
        if (vertical && Math.abs(a.y - b.y) < 0.01) continue;
        const pos = vertical ? a.x : a.y;
        const along = (p: Point) => (vertical ? p.y : p.x);
        const across = (p: Point) => (vertical ? p.x : p.y);
        // The turn at a's end goes to pts[k - 1], at b's to pts[k + 2].
        const turnA = k > 0 ? Math.sign(across(pts[k - 1]) - pos) : 0;
        const turnB = k + 2 < pts.length ? Math.sign(across(pts[k + 2]) - pos) : 0;
        const aLow = along(a) <= along(b);
        const run: Run = {
          route, k, vertical, pos,
          lo: Math.min(along(a), along(b)),
          hi: Math.max(along(a), along(b)),
          turnLo: aLow ? turnA : turnB,
          turnHi: aLow ? turnB : turnA,
          fixed: !vertical && (k === 0 || k === last),
        };
        const key = `${vertical ? 'v' : 'h'}${pos.toFixed(2)}`;
        const list = channels.get(key);
        if (list) list.push(run);
        else channels.set(key, [run]);
      }
    });

    // Lanes: in each line, a run joins a lane it overlaps whose runs all
    // share a port with it.
    const lanes: Lane[] = [];
    for (const runs of channels.values()) {
      runs.sort((a, b) => a.lo - b.lo);
      const here: Lane[] = [];
      for (const run of runs) {
        const lane = here.find(l =>
          run.lo < l.hi - 0.01 && run.hi > l.lo + 0.01 && l.runs.every(o => related(o.route, run.route)));
        if (lane) {
          lane.runs.push(run);
          if (run.lo < lane.lo) { lane.lo = run.lo; lane.turnLo = run.turnLo; }
          if (run.hi > lane.hi) { lane.hi = run.hi; lane.turnHi = run.turnHi; }
          lane.fixed ||= run.fixed;
        } else {
          here.push({
            runs: [run], vertical: run.vertical, pos: run.pos, lo: run.lo, hi: run.hi,
            turnLo: run.turnLo, turnHi: run.turnHi, fixed: run.fixed,
          });
        }
      }
      lanes.push(...here);
    }

    // Lanes of one axis that overlap and lie within a few lane gaps of
    // each other are spread together: lines a few pixels apart would
    // otherwise spread into each other.
    const reach = this.laneGap * 3;
    for (const vertical of [true, false]) {
      const axis = lanes.filter(l => l.vertical === vertical).sort((a, b) => a.pos - b.pos);
      const parent = axis.map((_, i) => i);
      const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
      for (let i = 0; i < axis.length; i++) {
        for (let j = i + 1; j < axis.length && axis[j].pos - axis[i].pos < reach; j++) {
          if (axis[i].lo < axis[j].hi - 0.01 && axis[j].lo < axis[i].hi - 0.01) parent[find(j)] = find(i);
        }
      }
      const groups = new Map<number, Lane[]>();
      axis.forEach((lane, i) => {
        const root = find(i);
        const list = groups.get(root);
        if (list) list.push(lane);
        else groups.set(root, [lane]);
      });
      for (const group of groups.values()) if (group.length > 1) this.spread(group);
    }

    // Move every run's two points onto its lane.
    for (const lane of lanes) {
      if (lane.at === undefined) continue;
      for (const run of lane.runs) {
        if (run.fixed) continue;
        const pts = routes[run.route]!;
        for (const p of [pts[run.k], pts[run.k + 1]]) {
          if (run.vertical) p.x = lane.at;
          else p.y = lane.at;
        }
      }
    }
  }

  /** Places a group of lanes `laneGap` apart, in order, each as near its
   *  line as the spacing allows, inside the free space beside it. */
  private spread(lanes: Lane[]): void {
    // Order: by line; lanes on one line by how they turn. A lane whose
    // ends both turn to the lower side runs there (its turns then cross no
    // other lane), both to the higher side the other way, the rest
    // between; brackets nest, the longer outside.
    const rank = (l: Lane) => {
      const t = l.turnLo + l.turnHi;
      return t < 0 ? 0 : t > 0 ? 2 : 1;
    };
    const span = (l: Lane) => l.hi - l.lo;
    lanes.sort((a, b) => {
      if (Math.abs(a.pos - b.pos) > 0.01) return a.pos - b.pos;
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (ra === 0) return span(a) - span(b);
      if (ra === 2) return span(b) - span(a);
      // Crossing over: coming from the lower side at the low end and
      // leaving to the higher side, the lane that starts later sits lower.
      if (a.turnLo !== b.turnLo) return a.turnLo - b.turnLo;
      return a.turnLo < 0 ? b.lo - a.lo : a.lo - b.lo;
    });

    // Nearest placement keeping the order and the gap: with y = x - i·gap
    // the gap becomes "y never decreases", fitted by pooling adjacent
    // violators (a lane on a port's row weighs so much it stays put).
    const gap = this.laneGap;
    const blocks: { sum: number; weight: number; count: number }[] = [];
    lanes.forEach((lane, i) => {
      const weight = lane.fixed ? 1e6 : 1;
      blocks.push({ sum: (lane.pos - i * gap) * weight, weight, count: 1 });
      while (blocks.length > 1) {
        const b = blocks[blocks.length - 1], a = blocks[blocks.length - 2];
        if (a.sum / a.weight <= b.sum / b.weight) break;
        a.sum += b.sum;
        a.weight += b.weight;
        a.count += b.count;
        blocks.pop();
      }
    });
    let i = 0;
    for (const block of blocks) {
      const y = block.sum / block.weight;
      for (let k = 0; k < block.count; k++, i++) lanes[i].at = y + i * gap;
    }

    // Keep each lane in the free space beside its line, closing up the
    // gap where it must.
    const allowance = this.margin * INTO_MARGIN;
    const limits = lanes.map(lane => {
      let min = -Infinity, max = Infinity;
      for (const b of this.boxes) {
        const [a0, a1, c0, c1] = lane.vertical ? [b.y0, b.y1, b.x0, b.x1] : [b.x0, b.x1, b.y0, b.y1];
        if (a1 <= lane.lo + 0.01 || a0 >= lane.hi - 0.01) continue;
        if (c1 <= lane.pos + 0.01) min = Math.max(min, c1 - allowance);
        else if (c0 >= lane.pos - 0.01) max = Math.min(max, c0 + allowance);
      }
      return [min, max];
    });
    const clamp = (k: number) => {
      lanes[k].at = Math.min(limits[k][1], Math.max(limits[k][0], lanes[k].at!));
    };
    for (let k = 0; k < lanes.length; k++) {
      if (k > 0) lanes[k].at = Math.max(lanes[k].at!, lanes[k - 1].at! + gap);
      clamp(k);
    }
    for (let k = lanes.length - 2; k >= 0; k--) {
      lanes[k].at = Math.min(lanes[k].at!, lanes[k + 1].at! - gap);
      clamp(k);
    }
    for (const lane of lanes) if (lane.fixed) lane.at = lane.pos;
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

/** Where related routes join or split: a corner of one route where a
 *  related route (`related(i, j)`) runs along exactly one of the corner's
 *  two runs, the other going its own way. Returns each route's junctions
 *  (each spot once, on the first route found turning there); a junction
 *  closer than `clear` to the route's own ends is left out (the port's dot
 *  already marks it). */
export function junctions(routes: (Point[] | null)[], related: (i: number, j: number) => boolean, clear = 0): Point[][] {
  const out: Point[][] = routes.map(() => []);
  const seen = new Set<string>();
  const covers = (pts: Point[], q: Point) => {
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k];
      if (Math.abs(a.x - b.x) < 0.05 && Math.abs(q.x - a.x) < 0.05
        && q.y >= Math.min(a.y, b.y) - 0.05 && q.y <= Math.max(a.y, b.y) + 0.05) return true;
      if (Math.abs(a.y - b.y) < 0.05 && Math.abs(q.y - a.y) < 0.05
        && q.x >= Math.min(a.x, b.x) - 0.05 && q.x <= Math.max(a.x, b.x) + 0.05) return true;
    }
    return false;
  };
  routes.forEach((pts, i) => {
    if (!pts) return;
    for (let k = 1; k < pts.length - 1; k++) {
      const p = pts[k], before = pts[k - 1], after = pts[k + 1];
      const first = pts[0], last = pts[pts.length - 1];
      if (Math.abs(p.x - first.x) + Math.abs(p.y - first.y) < clear) continue;
      if (Math.abs(p.x - last.x) + Math.abs(p.y - last.y) < clear) continue;
      const step = (from: Point, to: Point) => {
        const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
        return { x: p.x + ((to.x - from.x) / len) * 1, y: p.y + ((to.y - from.y) / len) * 1 };
      };
      // A point just before and just after the corner, on this route.
      const inQ = step(p, before), outQ = step(p, after);
      const key = `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      if (seen.has(key)) continue;
      for (let j = 0; j < routes.length; j++) {
        const other = routes[j];
        if (j === i || !other || !related(i, j) || !covers(other, p)) continue;
        if (covers(other, inQ) !== covers(other, outQ)) {
          seen.add(key);
          out[i].push(p);
          break;
        }
      }
    }
  });
  return out;
}
