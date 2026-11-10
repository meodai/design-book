import { FunctionError } from '../../errors';
import type { ColorMember } from '../pool';

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
export function filterLightness(
  fn: string,
  pool: ReadonlyArray<ColorMember>,
  range: LightnessRange | undefined,
  scopeName: string,
): ReadonlyArray<ColorMember> {
  if (!range) return pool;
  const [min, max] = range;
  const kept = pool.filter((c) => c.l >= min - 1e-9 && c.l <= max + 1e-9);
  if (kept.length === 0) {
    throw new FunctionError(`${fn}: no color of scope "${scopeName}" has a lightness between ${min} and ${max}`, fn);
  }
  return kept;
}
