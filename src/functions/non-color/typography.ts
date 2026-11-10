import { assertOptions } from '../args';
import { VALID_TOKEN_KEY } from '../../keys';
import { asMember } from '../../tokens';
import type { FunctionTokenValue, GroupInput, GroupValue, ReferenceValue, TokenValue } from '../../tokens';
import { FunctionError } from '../../errors';

/** A text style's field as written: a token, or a plain string or number
 *  (`'700'`, `1.5`), which becomes one. */
export type TypographyField = TokenValue | ReferenceValue | FunctionTokenValue | string | number;
export type TypographyFields = Record<string, TypographyField>;

function assertMemberNames(names: string[], fn: string): void {
  for (const name of names) {
    if (!VALID_TOKEN_KEY.test(name)) {
      throw new FunctionError(`${fn}: "${name}" may only contain letters, digits, "-" and "_"`, fn);
    }
  }
}

function members(fields: Record<string, unknown>): Record<string, GroupInput> {
  return Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, asMember(value) as GroupInput]));
}

/**
 * A text style written in place: shorthand for a group of kind
 * `typography`. `type.set('title', typography({ fontSize: rem(2) }))` is the
 * same as a scope made with `addScope('…', { kind: 'typography' })` holding
 * `fontSize`, held at `type.title` — only without a name of its own. On top,
 * it takes plain numbers and strings for fields (`1.5`, `'700'`).
 *
 * Each field (`fontFamily`, `fontSize`, `lineHeight`, …; any key is allowed)
 * is a member, an ordinary key: `ref('type.title.fontSize')` reads one. The
 * kind changes nothing inside the book; outside it, a text style gets a CSS
 * class and the W3 composite, and `fontSize` stands for it in comparisons and
 * sorts.
 */
export function typography(fields: TypographyFields, options?: { description?: string }): GroupValue {
  assertOptions('typography', options, []);
  const names = Object.keys(fields);
  if (names.length === 0) {
    throw new FunctionError('typography: needs at least one field', 'typography');
  }
  assertMemberNames(names, 'typography');
  return {
    type: 'group',
    kind: 'typography',
    members: members(fields),
    ...(options?.description !== undefined ? { description: options.description } : {}),
  };
}
