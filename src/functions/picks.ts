import type { Scope } from '../scope';

/**
 * What a selector returns: the member it picked, not a value. The book reads
 * the member's value and remembers which member it was, so two members with
 * the same value are never confused. A reference to a selector passes the
 * pick on; a transform of one (`lighten(mostVivid(…))`) computes a new value
 * and picks nothing. `book.pickOf(key)` answers which member a key's value
 * is; `sibling`, a `not` entry naming a pick and the SVG renderer read it.
 */
export interface Pick {
  /** The member, as a qualified key. */
  readonly picked: string;
}

/** The member `key` of `scope`, as a selector's result: `return pick(scope, best.key)`. */
export function pick(scope: Scope, key: string): Pick {
  return { picked: `${scope.name}.${key}` };
}

export function isPick(value: unknown): value is Pick {
  return typeof value === 'object' && value !== null && typeof (value as Pick).picked === 'string';
}

/** A key's value and, when the value is a member's, which member. */
export interface Resolution {
  value: string;
  pick?: string;
}
