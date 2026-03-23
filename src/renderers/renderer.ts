import { DesignBook } from '../design-book';
import type { TokenValue, ReferenceValue, FunctionTokenValue, AnyTokenValue, FunctionArg } from '../tokens';
import { registerBuiltinFunctionRenderers } from './function-renderers';
import { parse, formatHex, converter } from 'culori';

export type RenderFormat = 'css-variables' | 'json' | 'w3-design-tokens';
export type FunctionRenderer = (args: FunctionArg[], options?: any) => string;

const toRgb = converter('rgb');

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
          const funcRenderer = this.functionRenderers.get(fn.name);
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

        const entry: Record<string, any> = {};

        if (token.type === 'reference') {
          const refToken = token as ReferenceValue;
          entry.$value = `{${refToken.key}}`;
          // Determine $type from the resolved target
          const resolvedToken = this.book.getTokenByKey(refToken.key);
          if (resolvedToken) {
            entry.$type = this.mapW3Type(resolvedToken);
          }
        } else if (token.type === 'function') {
          // Resolve to computed value, then format per W3 type
          const fnToken = token as FunctionTokenValue;
          const internalType = fnToken.metadata?.returnType ?? 'unknown';
          const resolved = resolveTokenValue(this.book, scope.name, key);
          entry.$value = this.formatW3Value(internalType, resolved, token);
          entry.$type = this.mapW3TypeString(internalType);
        } else {
          const tv = token as TokenValue;
          entry.$value = this.formatW3Value(tv.type, String(tv.rawValue), tv);
          entry.$type = this.mapW3TypeString(tv.type, tv);
        }

        // Add $description if present
        if (token.description) {
          entry.$description = token.description;
        }

        result[scope.name][key] = entry;
      }
    }

    return JSON.stringify(result, null, 2);
  }

  /** Map internal type to W3 $type string */
  private mapW3Type(token: AnyTokenValue): string {
    const internalType = getTokenType(token, this.book);
    if (token.type === 'reference') {
      const resolved = this.book.getTokenByKey((token as ReferenceValue).key);
      if (resolved) return this.mapW3Type(resolved);
    }
    if (token.type !== 'function' && token.type !== 'reference') {
      return this.mapW3TypeString((token as TokenValue).type, token as TokenValue);
    }
    return this.mapW3TypeString(internalType);
  }

  /** Map internal type string to W3 spec type */
  private mapW3TypeString(internalType: string, token?: TokenValue): string {
    if (internalType === 'color') return 'color';
    if (internalType === 'dimension') {
      const unit = token?.metadata?.unit;
      if (unit === 'ms' || unit === 's') return 'duration';
      return 'dimension';
    }
    if (internalType === 'string') return 'fontFamily'; // best W3 match for string
    if (internalType === 'number') return 'number';
    return internalType; // pass through for custom types
  }

  /** Format a resolved value into the W3 structured format */
  private formatW3Value(internalType: string, resolvedStr: string, token: AnyTokenValue): any {
    if (internalType === 'color') {
      // W3 color: { colorSpace, components, alpha, hex }
      const parsed = parse(resolvedStr);
      const rgb = parsed ? toRgb(parsed) : null;
      if (parsed && rgb) {
        const hex = formatHex(rgb) ?? resolvedStr;
        return {
          colorSpace: 'srgb',
          components: [
            Math.round((rgb.r ?? 0) * 1000) / 1000,
            Math.round((rgb.g ?? 0) * 1000) / 1000,
            Math.round((rgb.b ?? 0) * 1000) / 1000,
          ],
          alpha: rgb.alpha ?? 1,
          hex,
        };
      }
      return resolvedStr;
    }

    if (internalType === 'dimension') {
      const tv = (token.type !== 'function' && token.type !== 'reference')
        ? token as TokenValue : null;
      if (tv) {
        const unit = tv.metadata?.unit ?? 'px';
        if (unit === 'ms' || unit === 's') {
          // Duration type
          return { value: Number(tv.rawValue), unit };
        }
        return { value: Number(tv.rawValue), unit };
      }
      // Function that returns dimension — parse from resolved string
      const match = resolvedStr.match(/^([\d.]+)(.+)$/);
      if (match) {
        return { value: parseFloat(match[1]), unit: match[2] };
      }
      return resolvedStr;
    }

    if (internalType === 'string') {
      const tv = (token.type !== 'function' && token.type !== 'reference')
        ? token as TokenValue : null;
      return tv ? String(tv.rawValue) : resolvedStr;
    }

    return resolvedStr;
  }
}
