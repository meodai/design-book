import { createFunctionToken, extractDependencies, isFunctionTokenValue } from '../../tokens';
import type { AnyTokenValue, FunctionTokenValue, TokenValue, ReferenceValue } from '../../tokens';
import { FunctionError } from '../../errors';
import { VALID_TOKEN_KEY } from '../../keys';

export type TypographyField = TokenValue | ReferenceValue | FunctionTokenValue | string | number;
export type TypographyFields = Record<string, TypographyField>;

/** fontSize → font-size */
const toKebab = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

/** The resolved typography: one CSS declaration per field, in field order. */
export function typographyImpl(...args: unknown[]): string {
  const options = args.pop() as { fields: string[] };
  return options.fields.map((field, i) => `${toKebab(field)}: ${String(args[i])}`).join('; ');
}

/**
 * A text style as one token — the W3 `typography` composite. Each field
 * (`fontFamily`, `fontSize`, `lineHeight`, …; any key is allowed) is an
 * argument, so the refs it holds are graph dependencies like any function's,
 * and a `ref()` to the token carries the whole style. It resolves to its CSS
 * declarations (`font-size: 2rem; line-height: 1.5`); the css-variables
 * renderer writes one variable per field plus a class.
 */
export function typography(
  fields: TypographyFields,
  options?: { description?: string },
): FunctionTokenValue {
  const names = Object.keys(fields);
  if (names.length === 0) {
    throw new FunctionError('typography: needs at least one field', 'typography');
  }
  for (const name of names) {
    if (!VALID_TOKEN_KEY.test(name)) {
      throw new FunctionError(
        `typography: field "${name}" may only contain letters, digits, "-" and "_"`,
        'typography',
      );
    }
  }
  const args = names.map((name) => fields[name]);
  return createFunctionToken('typography', args, {
    description: options?.description,
    options: { fields: names },
    metadata: {
      dependencies: extractDependencies(args),
      visualDependencies: [],
      returnType: 'typography',
    },
  });
}

export function isTypographyToken(token: unknown): token is FunctionTokenValue {
  return isFunctionTokenValue(token) && token.name === 'typography';
}

/** The fields of a typography token, by name. */
export function typographyFields(token: FunctionTokenValue): TypographyFields {
  const names: string[] = token.options?.fields ?? [];
  return Object.fromEntries(names.map((name, i) => [name, token.args[i] as TypographyField]));
}

/** A copy of a typography token with some fields replaced or added — how a
 *  breakpoint or theme layer changes one text style without restating it
 *  (a token cannot `ref()` the value it replaces). */
export function withFields(
  token: AnyTokenValue | undefined,
  overrides: TypographyFields,
): FunctionTokenValue {
  if (!isTypographyToken(token)) {
    throw new FunctionError('withFields: expects a typography() token', 'withFields');
  }
  return typography(
    { ...typographyFields(token), ...overrides },
    { description: token.description },
  );
}
