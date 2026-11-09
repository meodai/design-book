import { isFunctionTokenValue, isPoolReference, isReferenceValue, isScopePath, isTokenValue, isUnresolvable, MEMBER_SLOTS } from './tokens';
import type { FunctionArg, FunctionTokenValue, ReferenceValue, TokenValue } from './tokens';
import type { FunctionImplementation } from './design-book';
import type { Scope } from './scope';
import { FunctionError, TokenError } from './errors';
import { isPick } from './functions/picks';
import type { Resolution } from './functions/picks';

/** What evaluating a token needs from the book. */
export interface EvaluationBook {
  resolve(key: string): string;
  _resolution(key: string): Resolution;
  getScope(name: string): Scope | undefined;
  getFunction(name: string): FunctionImplementation | undefined;
}

/**
 * Evaluates a function token — a key's own or one nested as an argument:
 * its arguments and inputs resolved, its implementation called. A selector
 * returns the member it picked; its value is the member's. The one place a
 * function token is evaluated, for scopes and renderers alike.
 */
export function evaluateFunction(book: EvaluationBook, fn: FunctionTokenValue): Resolution {
  const args = fn.args.map((arg: FunctionArg) => evaluateArg(book, arg));
  if (fn.metadata?.returnType === 'color') assertNoGroup(fn, args);
  const implementation = book.getFunction(fn.name);
  if (!implementation) throw new Error(`Function "${fn.name}" is not registered`);
  const result = implementation(...args, evaluateInputs(book, fn.options));
  // A pick passes on the member's value — or, when the member is a group,
  // the group.
  if (isPick(result)) return { ...book._resolution(result.picked), pick: result.picked };
  return { value: String(result) };
}

/** A function argument as the implementation receives it: a value, or a
 *  live scope — the pool a selector searches, or the group a reference's
 *  value is (a text style a comparison measures by `by`). */
export function evaluateArg(book: EvaluationBook, arg: FunctionArg): unknown {
  if (isUnresolvable(arg)) throw new TokenError(`${arg.key}: ${arg.message}`, arg.key);
  if (isPoolReference(arg)) {
    const scope = book.getScope(arg.key);
    if (!scope) throw new TokenError(`"${arg.key}" names no scope to search`, arg.key);
    return scope;
  }
  if (isReferenceValue(arg)) {
    const resolution = book._resolution(arg.key);
    if (resolution.group !== undefined) return book.getScope(resolution.group);
    return resolution.value;
  }
  if (isFunctionTokenValue(arg)) return evaluateFunction(book, arg).value;
  if (isTokenValue(arg)) return valueOf(arg);
  return arg;
}

/** A value token's value: its raw value with its unit. */
export function valueOf(token: TokenValue): string {
  return token.metadata?.unit ? `${token.rawValue}${token.metadata.unit}` : String(token.rawValue);
}

/** The key a bound reference reads as a value. Refuses a scope, which has
 *  no value of its own. */
export function valueKey(reference: ReferenceValue, where: string): string {
  if (reference.key === '.') {
    throw new TokenError(`${where}: ref('${reference.key}') names a scope; a value needs 'scope.token'`, where);
  }
  return reference.key;
}

/** The options a function receives: every input — a reference, a token or
 *  a function token at the top level, outside the member slots — resolved
 *  like an argument (`closest`'s `upTo`, a selector's `readableOn`).
 *  Member references and plain values pass as they are. */
function evaluateInputs(book: EvaluationBook, options: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!options) return options;
  let resolved: Record<string, unknown> | undefined;
  for (const [name, value] of Object.entries(options)) {
    if (MEMBER_SLOTS.has(name)) continue;
    if (isReferenceValue(value) || isFunctionTokenValue(value) || isTokenValue(value) || isUnresolvable(value)) {
      resolved ??= { ...options };
      resolved[name] = evaluateArg(book, value as FunctionArg);
    }
  }
  return resolved ?? options;
}

/** A color transform handed a whole group (a text style, say) gets a
 *  message that says how to pass one of its members, instead of failing to
 *  parse a color. */
function assertNoGroup(fn: FunctionTokenValue, args: unknown[]): void {
  args.forEach((value, i) => {
    if (typeof value !== 'object' || value === null || !('getAllKeys' in value)) return;
    const arg = fn.args[i];
    if (isPoolReference(arg)) return; // a pool is a scope on purpose
    const key = isReferenceValue(arg) ? arg.key : undefined;
    const group = value as Scope;
    const what = group.getKind() === 'typography' ? 'a text style' : 'a group';
    const member = group.getAllKeys().includes('color') ? 'color' : group.getAllKeys()[0];
    const hint = key && member ? `, e.g. ref('${key}.${member}')` : '';
    throw new FunctionError(`${fn.name}: ${key ? `"${key}"` : 'that argument'} is ${what}; pass one of its members${hint}`, fn.name);
  });
}
