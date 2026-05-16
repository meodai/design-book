import {
  createFunctionToken,
  extractDependencies,
  extractVisualDependencies,
  normalizeNotKeys,
} from '../../tokens';
import type { FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';
import type { Scope } from '../../scope';

interface Parsed {
  num: number;
  unit: string;
}

/** A function token "iterates" a scope when that scope is one of its args
 *  (direct identity match). Used to break recursion when two scope-iterating
 *  selectors share a scope. */
function iteratesScope(fn: FunctionTokenValue, scope: Scope): boolean {
  for (const arg of fn.args) {
    if (arg === scope) return true;
  }
  return false;
}

function parseDimension(value: string, label: string): Parsed {
  const match = value.match(/^(-?[\d.]+)(.*)$/);
  if (!match) {
    throw new Error(`${label}: cannot parse dimensional value "${value}"`);
  }
  const num = parseFloat(match[1]);
  if (!Number.isFinite(num)) {
    throw new Error(`${label}: not a finite number in "${value}"`);
  }
  return { num, unit: match[2].trim() };
}

export function nextLargerImpl(
  targetValue: string,
  scope: Scope,
  minDistance = 0,
  not: string[] = [],
): string {
  const target = parseDimension(targetValue, 'nextLarger');
  const excluded = new Set(not);

  let best: Parsed | null = null;
  let bestRaw: string | null = null;

  for (const key of scope.getAllKeys()) {
    if (excluded.has(`${scope.name}.${key}`)) continue;

    // Skip function tokens that iterate this same scope — resolving
    // them would recurse back through us. The graph's cycle detection
    // only covers declared refs, not scope-iterating selectors.
    const tok = scope.get(key);
    if (tok && tok.type === 'function' && iteratesScope(tok as FunctionTokenValue, scope)) continue;

    let resolved: string;
    try {
      resolved = scope.resolve(key);
    } catch {
      continue;
    }

    let candidate: Parsed;
    try {
      candidate = parseDimension(resolved, 'nextLarger');
    } catch {
      continue;
    }

    if (candidate.unit !== target.unit) {
      throw new Error(
        `nextLarger: unit mismatch in scope "${scope.name}" — `
          + `target uses "${target.unit || '(unitless)'}" but key "${key}" uses "${candidate.unit || '(unitless)'}"`,
      );
    }

    if (candidate.num <= target.num + minDistance) continue;
    if (!best || candidate.num < best.num) {
      best = candidate;
      bestRaw = resolved;
    }
  }

  if (!bestRaw) {
    throw new Error(
      `nextLarger: no member of scope "${scope.name}" is larger than ${target.num}${target.unit}`
        + (minDistance ? ` by at least ${minDistance}${target.unit}` : ''),
    );
  }
  return bestRaw;
}

export function nextLarger(
  target: TokenValue | ReferenceValue | FunctionTokenValue,
  scope: Scope,
  options?: {
    /** Minimum gap (in the scope's unit) the candidate must clear above the target. */
    minDistance?: number;
    /** Keys to exclude from the candidate pool. */
    not?: ReadonlyArray<string | ReferenceValue>;
    description?: string;
    [key: string]: any;
  },
): FunctionTokenValue {
  return createFunctionToken(
    'nextLarger',
    [target, scope],
    {
      description: options?.description,
      options: {
        minDistance: options?.minDistance ?? 0,
        not: normalizeNotKeys(options?.not),
      },
      metadata: {
        dependencies: extractDependencies([target]),
        visualDependencies: extractVisualDependencies([target, scope]),
        returnType: 'dimension',
      },
    },
  );
}
