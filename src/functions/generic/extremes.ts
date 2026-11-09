import { poolArg } from '../args';
import type { PoolArg } from '../args';
import { createFunctionToken, toMembers } from '../../tokens';
import type { FunctionTokenValue, ReferenceValue } from '../../tokens';
import type { Scope } from '../../scope';
import { FunctionError } from '../../errors';
import { onlyMeasuredGroup } from '../kinds';
import { best, measuredPool } from '../pool';
import { picked } from '../picks';

type Extreme = 'largest' | 'smallest';

/**
 * The largest (or smallest) size or text style in `scope`, by value — text
 * styles by their font size. The pool may hold other kinds; they are
 * skipped. When it holds more than one group (sizes in px and in rem, or
 * sizes and text styles), `type` picks one or the call throws. Ties go to the
 * first member in scope order.
 */
function extremeImpl(name: Extreme, scope: Scope, options: { not: string[]; type?: 'size' | 'text' }): string {
  const members = onlyMeasuredGroup(name, scope, measuredPool(scope, options.not), options.type);
  const pick = best(members, (m) => m.num, name === 'largest' ? 'max' : 'min')!;
  return picked(scope, pick.key, pick.value);
}

export function largestImpl(scope: Scope, options: { not: string[]; type?: 'size' | 'text' }): string {
  return extremeImpl('largest', scope, options);
}

export function smallestImpl(scope: Scope, options: { not: string[]; type?: 'size' | 'text' }): string {
  return extremeImpl('smallest', scope, options);
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
    options: { not: toMembers(options?.not), ...(type ? { type } : {}) },
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
