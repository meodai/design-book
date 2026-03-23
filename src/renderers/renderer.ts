import { DesignBook } from '../design-book';
import type { TokenValue, ReferenceValue, FunctionTokenValue, AnyTokenValue } from '../tokens';
import { registerBuiltinFunctionRenderers } from './function-renderers';

export type RenderFormat = 'css-variables' | 'json' | 'w3-design-tokens';
export type FunctionRenderer = (args: any[], options?: any) => string;

function keyToHyphen(key: string): string {
  return key.replace(/[._]/g, '-');
}

function resolveTokenValue(book: DesignBook, scopeName: string, tokenName: string): string {
  return book.resolve(`${scopeName}.${tokenName}`);
}

function getTokenType(token: AnyTokenValue, book: DesignBook): string {
  if (token.type === 'reference') {
    const ref = token as ReferenceValue;
    const resolved = book.getTokenByKey(ref.key);
    if (resolved) return getTokenType(resolved, book);
    return 'unknown';
  }
  if (token.type === 'function') {
    const fn = token as FunctionTokenValue;
    return fn.metadata?.returnType ?? 'unknown';
  }
  return (token as TokenValue).type;
}

export class Renderer {
  protected book: DesignBook;
  protected format: RenderFormat;
  private functionRenderers: Map<string, FunctionRenderer> = new Map();

  constructor(book: DesignBook, format: RenderFormat = 'css-variables') {
    this.book = book;
    this.format = format;
    registerBuiltinFunctionRenderers(this);
  }

  render(): string {
    switch (this.format) {
      case 'css-variables':
        return this.renderCssVariables();
      case 'json':
        return this.renderJson();
      case 'w3-design-tokens':
        return this.renderW3DesignTokens();
      default:
        throw new Error(`Unknown render format: ${this.format}`);
    }
  }

  registerFunctionRenderer(name: string, renderer: FunctionRenderer): void {
    this.functionRenderers.set(name, renderer);
  }

  private renderCssVariables(): string {
    const lines: string[] = [':root {'];

    for (const scope of this.book.getAllScopes()) {
      for (const key of scope.getAllKeys()) {
        const token = scope.get(key);
        if (!token) continue;

        const cssPropName = `--${keyToHyphen(scope.name)}-${keyToHyphen(key)}`;
        let value: string;

        if (token.type === 'reference') {
          const ref = token as ReferenceValue;
          value = `var(--${keyToHyphen(ref.key)})`;
        } else if (token.type === 'function') {
          const fn = token as FunctionTokenValue;
          const funcRenderer = this.functionRenderers.get(fn.rawValue);
          if (funcRenderer) {
            value = funcRenderer(fn.args, fn.options);
          } else {
            value = resolveTokenValue(this.book, scope.name, key);
          }
        } else {
          value = resolveTokenValue(this.book, scope.name, key);
        }

        lines.push(`  ${cssPropName}: ${value};`);
      }
    }

    lines.push('}');
    return lines.join('\n');
  }

  private renderJson(): string {
    const result: Record<string, string> = {};

    for (const scope of this.book.getAllScopes()) {
      for (const key of scope.getAllKeys()) {
        const qualifiedKey = `${scope.name}.${key}`;
        result[qualifiedKey] = resolveTokenValue(this.book, scope.name, key);
      }
    }

    return JSON.stringify(result, null, 2);
  }

  private renderW3DesignTokens(): string {
    const result: Record<string, any> = {};

    for (const scope of this.book.getAllScopes()) {
      if (!result[scope.name]) {
        result[scope.name] = {};
      }

      for (const key of scope.getAllKeys()) {
        const token = scope.get(key);
        if (!token) continue;

        let dollarValue: string;
        let dollarType: string;

        if (token.type === 'reference') {
          const ref = token as ReferenceValue;
          dollarValue = `{${ref.key}}`;
          // Try to determine the type from the resolved token
          const resolvedToken = this.book.getTokenByKey(ref.key);
          dollarType = resolvedToken ? getTokenType(resolvedToken, this.book) : 'unknown';
        } else {
          dollarValue = resolveTokenValue(this.book, scope.name, key);
          dollarType = getTokenType(token, this.book);
        }

        result[scope.name][key] = {
          $value: dollarValue,
          $type: dollarType,
        };
      }
    }

    return JSON.stringify(result, null, 2);
  }
}
