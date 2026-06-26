import type { ComparableEntry, TokenOrderer } from './index';

/** Parse the leading numeric magnitude from a resolved dimension string,
 *  e.g. '16px' -> 16, '1.5rem' -> 1.5, '200ms' -> 200. NaN sorts last. */
function magnitude(resolved: string): number {
  const n = parseFloat(resolved);
  return Number.isNaN(n) ? Number.POSITIVE_INFINITY : n;
}

export const dimensionOrderer: TokenOrderer = (entries: ComparableEntry[]) =>
  [...entries].sort((a, b) => magnitude(a.resolved) - magnitude(b.resolved));
