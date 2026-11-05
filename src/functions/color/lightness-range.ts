import { converter } from 'culori';
import { FunctionError } from '../../errors';
import type { ScopeColor } from './scope-colors';

const toOklch = converter('oklch');

/** An OKLCH lightness band, `[min, max]` between 0 and 1. */
export type LightnessRange = readonly [number, number];

/** Checks a `lightness` option at construction; returns it as a plain pair. */
export function lightnessOption(fn: string, range: unknown): [number, number] | undefined {
  if (range === undefined) return undefined;
  if (
    !Array.isArray(range) || range.length !== 2
    || !range.every((n) => typeof n === 'number' && n >= 0 && n <= 1)
    || range[0] > range[1]
  ) {
    throw new FunctionError(`${fn}: \`lightness\` is [min, max] in OKLCH lightness, 0 to 1, min first; got ${JSON.stringify(range)}`, fn);
  }
  return [range[0], range[1]];
}

/** Keeps the members whose OKLCH lightness lies in the band; throws when none do. */
export function filterLightness<T extends Pick<ScopeColor, 'parsed'>>(
  fn: string,
  pool: T[],
  range: LightnessRange | undefined,
  scopeName: string,
): T[] {
  if (!range) return pool;
  const [min, max] = range;
  const kept = pool.filter((c) => {
    const l = toOklch(c.parsed)?.l;
    return typeof l === 'number' && l >= min - 1e-9 && l <= max + 1e-9;
  });
  if (kept.length === 0) {
    throw new FunctionError(`${fn}: no color of scope "${scopeName}" has a lightness between ${min} and ${max}`, fn);
  }
  return kept;
}
