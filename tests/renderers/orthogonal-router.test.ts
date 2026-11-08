import { describe, it, expect } from 'vitest';
import { OrthogonalRouter, roundedPath, bridges, junctions } from '../../src/renderers/orthogonal-router';

describe('OrthogonalRouter', () => {
  const block = { x: 100, y: 0, width: 100, height: 200 };
  const from = { x: 50, y: 100, dir: 1 as const };
  const to = { x: 250, y: 100, dir: -1 as const };

  it('routes round a table instead of across it, in straight runs', () => {
    const router = new OrthogonalRouter([block], [from, to]);
    const points = router.route(from, to)!;
    expect(points[0]).toEqual({ x: 50, y: 100 });
    expect(points.at(-1)).toEqual({ x: 250, y: 100 });
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      expect(a.x === b.x || a.y === b.y).toBe(true);
      // no run passes through the table
      if (a.y === b.y && a.y > 0 && a.y < 200) {
        expect(Math.max(a.x, b.x) <= 100 || Math.min(a.x, b.x) >= 200).toBe(true);
      }
    }
  });

  it('draws rounded corners', () => {
    const d = roundedPath([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }], 6);
    expect(d).toBe('M 0 0 L 14 0 Q 20 0 20 6 L 20 20');
  });

  it('bridges a crossing, and draws the line underneath first', () => {
    const horizontal = [{ x: 0, y: 50 }, { x: 100, y: 50 }];
    const vertical = [{ x: 50, y: 0 }, { x: 50, y: 100 }];
    const { hops, order } = bridges([horizontal, vertical], () => true, 5);
    expect(hops[0][0]).toEqual([50]);
    expect(hops[1]).toEqual([]);
    expect(order).toEqual([1, 0]);
    expect(roundedPath(horizontal, 2, hops[0], 4)).toBe('M 0 50 L 46 50 A 4 4 0 0 1 54 50 L 100 50');
  });

  it('leaves a meeting at a corner alone', () => {
    const a = [{ x: 0, y: 50 }, { x: 100, y: 50 }];
    const b = [{ x: 50, y: 50 }, { x: 50, y: 100 }];
    expect(bridges([a, b], () => true, 5).hops[0]).toEqual([]);
  });

  it('marks where related lines split, not where they leave their own dot', () => {
    // Both leave the dot at (0, 0) together, one turns down at x = 50.
    const a = [{ x: 0, y: 0 }, { x: 100, y: 0 }];
    const b = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 80 }];
    expect(junctions([a, b], () => true)).toEqual([[], [{ x: 50, y: 0 }]]);
    expect(junctions([a, b], () => false)).toEqual([[], []]);
    expect(junctions([a, b], () => true, 60)).toEqual([[], []]);
  });

  it('spreads unrelated lines sharing a run into their own lanes', () => {
    const left = { x: 0, y: 0, width: 40, height: 200 };
    const right = { x: 200, y: 0, width: 40, height: 200 };
    const pairs = [0, 1, 2].map(i => [
      { x: 40, y: 20 + i * 30, dir: 1 as const, id: `a${i}` },
      { x: 200, y: 180 - i * 30, dir: -1 as const, id: `b${i}` },
    ] as [any, any]);
    const router = new OrthogonalRouter([left, right], pairs.flat(), { laneGap: 6 });
    const routes = router.routeAll(pairs);
    const verticalXs = routes.map(r => r!.find((p, k) => k > 0 && Math.abs(r![k - 1].x - p.x) < 0.01)!.x);
    const sorted = [...verticalXs].sort((x, y) => x - y);
    expect(sorted[1] - sorted[0]).toBeGreaterThanOrEqual(5.99);
    expect(sorted[2] - sorted[1]).toBeGreaterThanOrEqual(5.99);
  });
});
