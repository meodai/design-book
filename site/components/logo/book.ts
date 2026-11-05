// The book the wordmark stands on, drawn round any lettering: given how far
// the letters' ink reaches, it returns the shapes and where to put the
// letters. Used by Logo.astro (the wordmark, live text) and by the favicon
// (pages/logo.svg.ts, "DB" as outlines).
//
// The book's straight edges lean by Valley Sans italic's own angle (11°,
// measured from the font), so it leans with the letters. The fold at the
// spine is drawn upright, the same curve on both pages: the top edge dips
// into a notch, the bottom edge comes to a rounded point; the cut-out page
// follows both. The cover lies under the pages, flush with their left
// edge, so it shows as a line as wide as theirs along the bottom and up the
// right side only, both ends cut on the diagonal down and to the right,
// with its own point under the spine. Every fold sits on the pages' own
// spine, so the lines keep their width round it.

const SLANT = Math.tan((11 * Math.PI) / 180);
const DEFAULT_FRAME = 3.75; // the pages' edge round the cut-out, and the cover's line
const GAP = 2.5; // between the pages and the cover
const PAD = 5.75; // between the letters' ink and the cut-out, on every side
const TOP = 1; // the pages' top edge
const NOTCH = 4; // how far the top edge dips at the spine
const NOTCH_W = 12; // half the notch's width
const POINT = 7; // how far the bottom edge points down at the spine
const POINT_W = 16; // half the point's width

/** The letters' ink, measured in the book's own leaned frame (leaned about
 *  the middle of the capitals), relative to the letters' origin: left and
 *  right of it, and above (the cap height) and below the baseline. */
export interface Ink {
  left: number;
  right: number;
  cap: number;
  below: number;
}

export interface Book {
  pages: string;
  page: string;
  cover: string;
  /** Where the letters' origin goes: x and the baseline. */
  x: number;
  baseline: number;
  viewBox: string;
  /** The gap between the pages and the cover, as mask shapes (in black). */
  gap: string;
}

const n = (v: number) => Math.round(v * 100) / 100;
const pt = ([x, y]: [number, number]) => `${n(x)} ${n(y)}`;

/** Line widths, in the book's units: the pages' edge round the cut-out,
 *  and the cover's line. Both DEFAULT_FRAME unless given. */
export interface Lines {
  frame?: number;
  cover?: number;
  /** For hairlines. By default the cut-out and the cover follow the pages'
   *  fold moved straight down (a short, blunt tip), and the gap is a
   *  stroke round the pages. 'normal' moves the cut-out's fold along its
   *  normals instead, so a hairline edge keeps its width round the tip, and
   *  draws the gap like the cover, one gap-width past the pages, so a
   *  hairline cover is never cut through at the steep sides of the tip. */
  fold?: 'shift' | 'normal';
}

export function book(ink: Ink, lines: Lines = {}): Book {
  const FRAME = lines.frame ?? DEFAULT_FRAME;
  const COVER = lines.cover ?? DEFAULT_FRAME;
  const baseline = TOP + FRAME + PAD + ink.cap;
  const bottom = baseline + ink.below + PAD + FRAME;
  const mid = baseline - ink.cap / 2;
  const W = FRAME + PAD + (ink.right - ink.left) + PAD + FRAME;
  const lean = (x: number, y: number): [number, number] => [x + SLANT * (mid - y), y];
  const spineTop = lean(W / 2, TOP)[0];
  const spineBottom = lean(W / 2, bottom)[0];

  // The folds, upright, as Bézier segments relative to the spine at the
  // pages' edge: the notch on top (left to right), the point at the
  // bottom (right to left).
  type Seg = [number, number][];
  const notch: Seg[] = [
    [[-NOTCH_W, 0], [-NOTCH_W / 2, 0], [-NOTCH_W / 6, NOTCH / 3], [0, NOTCH]],
    [[0, NOTCH], [NOTCH_W / 6, NOTCH / 3], [NOTCH_W / 2, 0], [NOTCH_W, 0]],
  ];
  const point: Seg[] = [
    [[POINT_W, 0], [POINT_W * 0.56, 0], [POINT_W * 0.19, POINT * 0.29], [0, POINT]],
    [[0, POINT], [-POINT_W * 0.19, POINT * 0.29], [-POINT_W * 0.56, 0], [-POINT_W, 0]],
  ];

  let lowest = 0; // the lowest point drawn, for the viewBox

  /** One Bézier segment moved `off` along its normal (positive: down where
   *  the fold runs flat), sampled; and its normals at both ends. */
  function offsetSeg([p0, p1, p2, p3]: Seg, off: number, dir: 1 | -1, o: [number, number]) {
    const pts: [number, number][] = [];
    const normals: [number, number][] = [];
    for (let i = 0; i <= 32; i++) {
      const t = i / 32;
      const u = 1 - t;
      const x = u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0];
      const y = u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1];
      const dx = 3 * u * u * (p1[0] - p0[0]) + 6 * u * t * (p2[0] - p1[0]) + 3 * t * t * (p3[0] - p2[0]);
      const dy = 3 * u * u * (p1[1] - p0[1]) + 6 * u * t * (p2[1] - p1[1]) + 3 * t * t * (p3[1] - p2[1]);
      const len = Math.hypot(dx, dy) || 1;
      // the normal that points down where the fold runs flat
      const nrm: [number, number] = dir === 1 ? [-dy / len, dx / len] : [dy / len, -dx / len];
      pts.push([o[0] + x + nrm[0] * off, o[1] + y + nrm[1] * off]);
      normals.push(nrm);
    }
    return { pts, start: normals[0], end: normals[normals.length - 1], tip: [o[0] + p3[0], o[1] + p3[1]] as [number, number] };
  }

  /** Where two polylines first cross: [index in a, index in b, point]. */
  function crossing(a: [number, number][], b: [number, number][]) {
    for (let i = 0; i < a.length - 1; i++) {
      for (let j = 0; j < b.length - 1; j++) {
        const [p, q] = [a[i], a[i + 1]];
        const [r, t] = [b[j], b[j + 1]];
        const d = (q[0] - p[0]) * (t[1] - r[1]) - (q[1] - p[1]) * (t[0] - r[0]);
        if (!d) continue;
        const u = ((r[0] - p[0]) * (t[1] - r[1]) - (r[1] - p[1]) * (t[0] - r[0])) / d;
        const v = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d;
        if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
          return [i, j, [p[0] + u * (q[0] - p[0]), p[1] + u * (q[1] - p[1])] as [number, number]] as const;
        }
      }
    }
    return null;
  }

  /** A fold (two segments meeting in a tip) moved `off` along its normal,
   *  so a line drawn between two of them keeps its width all the way
   *  round. Outwards, the two halves are joined by a miter at the tip, so
   *  it stays a point; inwards, they cross before the tip and are joined
   *  where they cross. `dir` is the way it runs in x (1: rightwards). */
  function offsetFold([s1, s2]: Seg[], off: number, dir: 1 | -1, o: [number, number], mode: 'shift' | 'normal') {
    if (mode === 'shift') {
      // the fold moved straight down, as Béziers
      const at = ([x, y]: [number, number]) => pt([o[0] + x, o[1] + y + off]);
      lowest = Math.max(lowest, o[1] + Math.max(...s1.map((p) => p[1])) + off);
      return [s1, s2].map(([p0, p1, p2, p3], i) =>
        `${i ? '' : `L${at(p0)} `}C${at(p1)} ${at(p2)} ${at(p3)}`);
    }
    const a = offsetSeg(s1, off, dir, o);
    const b = offsetSeg(s2, off, dir, o);
    let pts: [number, number][];
    if (off > 0) {
      const [mx, my] = [a.end[0] + b.start[0], a.end[1] + b.start[1]];
      const ml = Math.hypot(mx, my) || 1;
      const reach = off / ((mx / ml) * b.start[0] + (my / ml) * b.start[1]);
      pts = [...a.pts, [a.tip[0] + (mx / ml) * reach, a.tip[1] + (my / ml) * reach], ...b.pts];
    } else {
      const c = off < 0 ? crossing(a.pts, b.pts) : null;
      pts = c ? [...a.pts.slice(0, c[0] + 1), c[2], ...b.pts.slice(c[1] + 1)] : [...a.pts, ...b.pts];
    }
    for (const q of pts) lowest = Math.max(lowest, q[1]);
    return pts.map((q) => `L${pt(q)}`);
  }

  /** Pages, cover or cut-out: left x0, right x1; `cut` cuts the top-right
   *  and bottom-left corners off on the diagonal down and to the right.
   *  Its folds are the pages' own, moved straight down or along their
   *  normals (`mode`). */
  function shape(x0: number, x1: number, top: number, btm: number, cut = 0, mode: 'shift' | 'normal' = 'shift') {
    return [
      `M${pt(lean(x0, top))}`,
      ...offsetFold(notch, top - TOP, 1, [spineTop, TOP], mode),
      ...(cut ? [`L${pt(lean(x1 - cut, top))}`, `L${pt(lean(x1, top + cut))}`] : [`L${pt(lean(x1, top))}`]),
      `L${pt(lean(x1, btm))}`,
      ...offsetFold(point, btm - bottom, -1, [spineBottom, bottom], mode),
      ...(cut ? [`L${pt(lean(x0 + cut, btm))}`, `L${pt(lean(x0, btm - cut))}`] : [`L${pt(lean(x0, btm))}`]),
      'Z',
    ].join(' ');
  }

  const out = GAP + COVER;
  const x0 = lean(0, bottom + out)[0] - 1;
  const x1 = lean(W + out, TOP)[0] + 1;
  const pages = shape(0, W, TOP, bottom);
  const page = shape(FRAME, W - FRAME, TOP + FRAME, bottom - FRAME, 0, lines.fold ?? 'shift');
  const cover = shape(0, W + out, TOP, bottom + out, out);
  const y1 = lowest + 1;
  return {
    pages,
    page,
    cover,
    x: n(FRAME + PAD - ink.left),
    baseline: n(baseline),
    viewBox: `${n(x0)} 0 ${n(x1 - x0)} ${n(y1)}`,
    gap:
      lines.fold === 'normal'
        ? // built like the cover, one gap past the pages: the cover's line
          // is the band between the two, the same height all along
          `<path d="${shape(0, W + GAP, TOP, bottom + GAP, GAP)}" fill="#000"/>`
        : `<path d="${pages}" fill="#000" stroke="#000" stroke-width="${GAP * 2}"/>`,
  };
}

/** The mask that cuts the book out of a fill: the cover, the gap round the
 *  pages, the pages, the cut-out page. */
export function maskShapes(b: Book): string {
  return [
    `<path d="${b.cover}" fill="#fff"/>`,
    b.gap,
    `<path d="${b.pages}" fill="#fff"/>`,
    `<path d="${b.page}" fill="#000"/>`,
  ].join('');
}
