import { poolArg } from '../args';
import type { PoolArg } from '../args';
import { createFunctionToken, normalizeNotKeys } from '../../tokens';
import type { FunctionTokenValue, ReferenceValue } from '../../tokens';
import type { Scope } from '../../scope';
import { FunctionError } from '../../errors';
import { measuredMembers, onlyMeasuredGroup } from '../kinds';
import { picked } from '../picks';

type Extreme = 'largest' | 'smallest';

/**
 * The largest (or smallest) size or text style in `scope`, by value — text
 * styles by their font size. The pool may hold other kinds; they are
 * skipped. When it holds more than one group (sizes in px and in rem, or
 * sizes and text styles), `type` picks one or the call throws. Ties go to the
 * first member in scope order.
 */
function extremeImpl(name: Extreme, scope: Scope, not: string[], type?: 'size' | 'text'): string {
  const group = onlyMeasuredGroup(name, scope, not, type);
  const members = measuredMembers(scope, group.kind, group.unit, not);
  const sign = name === 'largest' ? 1 : -1;
  let best = members[0];
  for (const member of members) if (sign * (member.num - best.num) > 0) best = member;
  return picked(scope, best.key, best.value);
}

export function largestImpl(scope: Scope, options?: { not?: string[]; type?: 'size' | 'text' }): string {
  return extremeImpl('largest', scope, options?.not ?? [], options?.type);
}

export function smallestImpl(scope: Scope, options?: { not?: string[]; type?: 'size' | 'text' }): string {
  return extremeImpl('smallest', scope, options?.not ?? [], options?.type);
}

export interface ExtremeOptions {
  /** 'size' or 'text', when the pool holds both. */
  type?: 'size' | 'text';
  /** Keys to exclude from the candidate pool. */
  not?: ReadonlyArray<string | ReferenceValue>;
  description?: string;
}

function build(name: Extreme, pool: PoolArg, options?: ExtremeOptions): FunctionTokenValue {
  const scope = poolArg(name, pool);
  const type = options?.type;
  if (type !== undefined && type !== 'size' && type !== 'text') {
    throw new FunctionError(`${name}: \`type\` is 'size' or 'text', got ${String(type)}`, name);
  }
  return createFunctionToken(name, [scope], {
    description: options?.description,
    options: { not: normalizeNotKeys(options?.not), ...(type ? { type } : {}) },
    metadata: {
      dependencies: [],
      returnType: undefined,
    },
  });
}

/** The largest size (or text style, by font size) in `pool`. */
export function largest(pool: PoolArg, options?: ExtremeOptions): FunctionTokenValue {
  return build('largest', pool, options);
}

/** The smallest size (or text style, by font size) in `pool`. */
export function smallest(pool: PoolArg, options?: ExtremeOptions): FunctionTokenValue {
  return build('smallest', pool, options);
}
