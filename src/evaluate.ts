import { isFunctionTokenValue, isReferenceValue, isScopeKey, isTokenValue, isUnresolvable, MEMBER_SLOTS } from './tokens';
import type { FunctionArg, FunctionTokenValue, ReferenceValue, TokenValue } from './tokens';
import type { FunctionImplementation } from './design-book';
import type { Scope } from './scope';
import { FunctionError, TokenError } from './errors';
import { isPick } from './functions/picks';
import type { Resolution } from './functions/picks';

/** What evaluating a token needs from the book. */
export interface EvaluationBook {
  resolve(key: string): string;
  getScope(name: string): Scope | undefined;
  getFunction(name: string): FunctionImplementation | undefined;
}

/** A resolved text style: CSS declarations. */
const TEXT_STYLE = /^[a-z-]+\s*:/i;

/**
 * Evaluates a function token — a key's own or one nested as an argument:
 * its arguments and inputs resolved, its implementation called. A selector
 * returns the member it picked; its value is the member's. The one place a
 * function token is evaluated, for scopes and renderers alike.
 */
export function evaluateFunction(book: EvaluationBook, fn: FunctionTokenValue): Resolution {
  const args = fn.args.map((arg: FunctionArg) => evaluateArg(book, arg));
  if (fn.metadata?.returnType === 'color') assertNoTextStyle(fn, args);
  const implementation = book.getFunction(fn.name);
  if (!implementation) throw new Error(`Function "${fn.name}" is not registered`);
  const result = implementation(...args, evaluateInputs(book, fn.options));
  if (isPick(result)) return { value: book.resolve(result.picked), pick: result.picked };
  return { value: String(result) };
}

/** A function argument as the implementation receives it: a value, or the
 *  live scope for a pool. */
export function evaluateArg(book: EvaluationBook, arg: FunctionArg): unknown {
  if (isUnresolvable(arg)) throw new TokenError(`${arg.key}: ${arg.message}`, arg.key);
  if (isReferenceValue(arg)) {
    // A scope reference is a pool: hand the function the scope itself.
    if (isScopeKey(arg.key)) {
      const scope = book.getScope(arg.key);
      if (!scope) throw new TokenError(`Scope "${arg.key}" not found`, arg.key);
      return scope;
    }
    return book.resolve(arg.key);
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
  if (isScopeKey(reference.key)) {
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

/** A color transform handed a whole text style gets a message that says
 *  how to pass one of its fields, instead of failing to parse a color. */
function assertNoTextStyle(fn: FunctionTokenValue, args: unknown[]): void {
  args.forEach((value, i) => {
    if (typeof value !== 'string' || !TEXT_STYLE.test(value)) return;
    const arg = fn.args[i];
    const key = isReferenceValue(arg) ? arg.key : undefined;
    const what = key ? `"${key}" is a text style` : 'that argument is a text style';
    const hint = key ? `, e.g. ref('${key}.color')` : '';
    throw new FunctionError(`${fn.name}: ${what}; pass one of its fields${hint}`, fn.name);
  });
}
