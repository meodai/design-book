import { parse } from 'culori';
import {
  createFunctionToken,
  extractVisualDependencies,
  normalizeNotKeys,
} from '../../tokens';
import type {
  FunctionTokenValue,
  ReferenceValue,
} from '../../tokens';
import type { Scope } from '../../scope';
import { FunctionError } from '../../errors';

export type RandomType = 'color' | 'dimension' | 'string';

export interface RandomOptions {
  /** Token type to pick from. Candidates whose resolved value doesn't
   *  match this type are skipped. Required because picking across mixed
   *  types would yield unpredictable consumer behaviour. */
  type: RandomType;
  /** Optional explicit seed. Pass a number or a string (hashed
   *  internally). If omitted, a fresh seed is generated at construction
   *  time and stored in `options.seed` — so the pick is stable across
   *  re-resolves but varies across machines/sessions. */
  seed?: number | string;
  /** Keys to exclude from the candidate pool. */
  not?: ReadonlyArray<string | ReferenceValue>;
  description?: string;
  [key: string]: any;
}

/** djb2 string hash → uint32. */
function djb2(str: string): number {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0;
  }
  return h >>> 0;
}

function seedToInt(seed: number | string): number {
  if (typeof seed === 'number') return seed >>> 0;
  return djb2(seed);
}

/** Mulberry32 — small, fast, statistically decent PRNG. Returns a
 *  function that yields floats in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIMENSION_RE = /^-?\d+(?:\.\d+)?[a-z%]+$/i;

/** Detects the base type of a resolved string value. */
function detectType(value: string): RandomType | 'unknown' {
  if (parse(value)) return 'color';
  if (DIMENSION_RE.test(value)) return 'dimension';
  if (value.length > 0) return 'string';
  return 'unknown';
}

export function randomImpl(
  scope: Scope,
  type: RandomType,
  seed: number | string,
  not: string[] = [],
): string {
  const excluded = new Set(not);
  const candidates: string[] = [];

  for (const key of scope.getAllKeys()) {
    if (excluded.has(`${scope.name}.${key}`)) continue;
    let resolved: string;
    try {
      resolved = scope.resolve(key);
    } catch {
      continue;
    }
    if (detectType(resolved) !== type) continue;
    candidates.push(resolved);
  }

  if (candidates.length === 0) {
    throw new FunctionError(
      `random: no "${type}" candidates found in scope "${scope.name}"`,
      'random',
    );
  }

  const rng = mulberry32(seedToInt(seed));
  const index = Math.floor(rng() * candidates.length);
  return candidates[index];
}

/**
 * Picks a random token from a scope, filtered by type. Each new
 * `random(...)` call gets its own seed at construction time, so the
 * pick is stable across re-resolves but varies across declarations.
 * Pass `seed` explicitly for reproducibility across sessions.
 */
export function random(
  scope: Scope,
  options: RandomOptions,
): FunctionTokenValue {
  const { type, seed, not, description, ...rest } = options;
  const resolvedSeed = seed ?? Math.floor(Math.random() * 0x1_0000_0000);

  return createFunctionToken(
    'random',
    [scope],
    {
      description,
      ...rest,
      options: { type, seed: resolvedSeed, not: normalizeNotKeys(not) },
      metadata: {
        dependencies: [],
        visualDependencies: extractVisualDependencies([scope]),
        returnType: type,
      },
    },
  );
}
