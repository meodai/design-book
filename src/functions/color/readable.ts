import { parse } from 'culori';
import { extractDependencies } from '../../tokens';
import type { FunctionArg, FunctionTokenValue, ReferenceValue, TokenValue } from '../../tokens';
import { FunctionError } from '../../errors';
import { contrastAgainst } from './scope-colors';
import type { ScopeColor } from './scope-colors';

/**
 * Readability filter shared by the color selectors. Like `not`, it narrows
 * the candidate pool before the selector ranks anything: every candidate
 * that does not reach `minContrast` against `readableOn` is dropped. The
 * selector's own rule (chroma, lightness, distance, …) then picks from what
 * is left.
 *
 * `readableOn` is stored as a trailing function argument rather than an
 * option so it resolves like any other argument and registers as a value
 * dependency — the pick follows the backdrop when it changes.
 */
export interface ReadableOnOptions {
  /** Backdrop every candidate must stay readable on. */
  readableOn?: TokenValue | ReferenceValue | FunctionTokenValue;
  /** WCAG ratio a candidate must reach against `readableOn`. Defaults to 4.5. */
  minContrast?: number;
}

export const DEFAULT_MIN_CONTRAST = 4.5;

/**
 * Constructor side: validates the options and returns the extra argument,
 * its dependencies, and the options to store on the token.
 */
export function readableOnParts(
  name: string,
  options?: ReadableOnOptions & Record<string, unknown>,
): { args: FunctionArg[]; dependencies: string[]; options: { minContrast?: number } } {
  if (options && 'against' in options) {
    throw new FunctionError(`${name}: \`against\` was renamed to \`readableOn\``, name);
  }

  const on = options?.readableOn;
  const min = options?.minContrast;
  if (!on) {
    if (min !== undefined) {
      throw new FunctionError(`${name}: \`minContrast\` needs \`readableOn\` to measure against`, name);
    }
    return { args: [], dependencies: [], options: {} };
  }

  const ratio = min ?? DEFAULT_MIN_CONTRAST;
  if (typeof ratio !== 'number' || !(ratio > 0)) {
    throw new FunctionError(`${name}: \`minContrast\` must be a positive number, got ${String(min)}`, name);
  }
  return { args: [on], dependencies: extractDependencies([on]), options: { minContrast: ratio } };
}

/**
 * Position of the `readableOn` backdrop in a selector token's `args`, or -1
 * when it has none. `readableOnParts` appends the backdrop as the last
 * argument and stores `minContrast` exactly when it does, so the option is
 * the token's own record of the backdrop — serializers use this instead of
 * keeping a table of each selector's fixed arity.
 */
export function readableOnArgIndex(fn: Pick<FunctionTokenValue, 'args' | 'options'>): number {
  if (fn.options?.minContrast === undefined || fn.args.length === 0) return -1;
  return fn.args.length - 1;
}

/**
 * Registry side: splits the resolved arguments that follow a selector's
 * fixed ones into the optional backdrop and the options object.
 */
export function splitReadableArgs<O extends { minContrast?: number }>(
  rest: unknown[],
): { readableOn: string | null; options: O } {
  const [first, second] = rest;
  if (typeof first === 'string') return { readableOn: first, options: (second ?? {}) as O };
  return { readableOn: null, options: (first ?? {}) as O };
}

/**
 * Implementation side: drops the candidates that do not reach `minContrast`
 * against `readableOn`. Translucent candidates are judged composited over the
 * backdrop. An empty pool passes through so each selector keeps its own
 * empty-scope behaviour; a pool that empties *because of* the filter throws,
 * so a selector never hands back a color the caller asked to be readable
 * but is not.
 */
export function filterReadable(
  name: string,
  pool: ScopeColor[],
  readableOn: string | null,
  minContrast: number = DEFAULT_MIN_CONTRAST,
): ScopeColor[] {
  if (readableOn === null) return pool;

  const backdrop = parse(readableOn);
  if (!backdrop) {
    throw new FunctionError(`${name}: cannot parse \`readableOn\` color "${readableOn}"`, name);
  }

  const readable = pool.filter((c) => contrastAgainst(backdrop, c.parsed) >= minContrast);
  if (pool.length > 0 && readable.length === 0) {
    throw new FunctionError(
      `${name}: no candidate reaches ${minContrast}:1 against ${readableOn}`,
      name,
    );
  }
  return readable;
}
