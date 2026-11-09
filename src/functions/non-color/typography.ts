import { assertOptions } from '../args';
import { parseKey, VALID_TOKEN_KEY } from '../../keys';
import { dimension, isGroupValue, isMemberObject, isReferenceValue, isMemberReference, string, toMember } from '../../tokens';
import type { FunctionTokenValue, GroupInput, GroupValue, MemberReference, ReferenceValue, TokenValue } from '../../tokens';
import { FunctionError } from '../../errors';

/** A text style's field as written: a token, or a plain string or number
 *  (`'700'`, `1.5`), which becomes one. */
export type TypographyField = TokenValue | ReferenceValue | FunctionTokenValue | string | number;
export type TypographyFields = Record<string, TypographyField>;
/** `variant` overrides: a value replaces or adds a member, `null` leaves
 *  the base's out. */
export type TypographyOverrides = Record<string, TypographyField | GroupInput | null>;

function assertMemberNames(names: string[], fn: string): void {
  for (const name of names) {
    if (!VALID_TOKEN_KEY.test(name)) {
      throw new FunctionError(`${fn}: "${name}" may only contain letters, digits, "-" and "_"`, fn);
    }
  }
}

/** A field written as a plain string or number, as the token it stands for:
 *  a number is a unitless dimension (`1.5`), a string a string (`'700'`). */
function asMember(value: unknown): GroupInput {
  if (typeof value === 'number') return dimension(value, '');
  if (typeof value === 'string') return string(value);
  return value as GroupInput;
}

function members(fields: Record<string, unknown>): Record<string, GroupInput> {
  return Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, asMember(value)]));
}

/**
 * A text style: a group of kind `typography` — the W3 `typography`
 * composite. Each field (`fontFamily`, `fontSize`, `lineHeight`, …; any key
 * is allowed) is a member, an ordinary key: `ref('type.title.fontSize')`
 * reads one, and what it reads is a dependency like any token's. Outside the
 * book the kind gives it a CSS class and the W3 composite, and makes
 * `fontSize` the member that stands for it in comparisons and sorts.
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

/**
 * A group that extends another: the members it does not set read the base's,
 * live, and a `null` leaves one of the base's out. The base is a reference
 * to a group (`ref('type.title')`, `ref('.title')`, `inherited(ref('.title'))`);
 * the variant is of the base's kind — a variant of a text style is a text
 * style. Called with no overrides it places the base where it is written: its
 * relative references (`holder(ref('.surface'))`) read the new place.
 *
 * To change a group in place, set its members: a group cannot extend the one
 * it replaces.
 */
export function variant(
  base: ReferenceValue | MemberReference,
  overrides: TypographyOverrides = {},
): GroupValue {
  if (!isReferenceValue(base) && !isMemberReference(base)) {
    const hint = isGroupValue(base) || isMemberObject(base)
      ? '; to change a group in place, set its members'
      : '';
    throw new FunctionError(`variant: the base is a ref(...) to a group${hint}`, 'variant');
  }
  const parsed = parseKey(base.key);
  if (!parsed?.token) {
    throw new FunctionError(`variant: the base must name a group, got "${base.key}"`, 'variant');
  }
  const set: Record<string, unknown> = {};
  const omit: string[] = [];
  for (const [name, value] of Object.entries(overrides)) {
    if (value === null) omit.push(name);
    else set[name] = value;
  }
  assertMemberNames(Object.keys(overrides), 'variant');
  return {
    type: 'group',
    base: toMember(base),
    members: members(set),
    ...(omit.length ? { omit } : {}),
  };
}
