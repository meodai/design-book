import {
  DesignBook, color, ref, px, rem, ms,
  bestContrastWith, minContrastWith, colorMix, relativeTo,
  spacingScale, typographyScale,
  Renderer, SVGRenderer,
} from '../src/index';
import type { RenderFormat } from '../src/index';
import type { Scope } from '../src/index';
import { parseTokenInput } from './editor-input-parser';

import { EditorView, keymap, ViewPlugin, ViewUpdate, Decoration, DecorationSet, WidgetType } from '@codemirror/view';
import { EditorState, RangeSetBuilder } from '@codemirror/state';
import { defaultKeymap } from '@codemirror/commands';
import { autocompletion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';

// Register the <color-input> web component
import 'hdr-color-input';

import { parse as culoriParse, formatHex } from 'culori';

// --- Create the design system (populated after event listeners are attached) ---

const book = new DesignBook('demo-system');

function bootDesignSystem() {
  // Brand scope
  const brand = book.addScope('brand');
  brand.set('primary', color('#0066cc'));
  brand.set('secondary', color('#ff8800'));
  brand.set('neutral-dark', color('#1a1a1a'));
  brand.set('neutral-light', color('#ffffff'));
  brand.set('success', color('#28a745'));
  brand.set('error', color('#dc3545'));
  brand.set('space-sm', px(8));
  brand.set('space-md', px(16));
  brand.set('font-base', rem(1));

  // Semantic scope
  const semantic = book.addScope('semantic');
  semantic.set('background', ref('brand.neutral-light'));
  semantic.set('text', bestContrastWith(ref('semantic.background'), brand));
  semantic.set('hover', colorMix(ref('brand.primary'), color('#000000'), { ratio: 0.1 }));

  // UI scope
  const ui = book.addScope('ui');
  ui.set('complement', relativeTo(ref('brand.primary'), 'oklch', [null, null, '+180']));
  ui.set('muted', relativeTo(ref('brand.primary'), 'oklch', [null, '*0.5', null]));
  ui.set('accessible-text', minContrastWith(ref('brand.neutral-light'), brand, { ratio: 4.5 }));
  ui.set('heading-lg', typographyScale(ref('brand.font-base'), { ratio: 1.25, step: 3 }));
  ui.set('section-spacing', spacingScale(ref('brand.space-md'), { multiplier: 2 }));

  // Dark theme extending brand
  const dark = book.addScope('dark', { extends: 'brand' });
  dark.set('neutral-dark', color('#ffffff'));
  dark.set('neutral-light', color('#1a1a1a'));

  scopeExtendsMap.set('dark', 'brand');
}

// --- State ---

let activeFormat: RenderFormat | 'svg' | 'log' = 'log';

// Track CodeMirror editor instances per scope name
const editorViews = new Map<string, EditorView>();

// Guard against sync loops: when we're programmatically syncing from editor -> scope,
// don't let scope events trigger editor re-render
let syncingFromEditor = false;

// --- DOM refs ---

const inputColumn = document.getElementById('input-column')!;
const outputEl = document.getElementById('output')!;
const eventLog = document.getElementById('event-log')!;
const svgContainer = document.getElementById('svg-container')!;
const showConnectionsCb = document.getElementById('show-connections') as HTMLInputElement;

// --- Event log ---

function logEvent(type: string, detail: Record<string, unknown>) {
  const now = new Date();
  const ts = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`;

  const entry = document.createElement('div');
  entry.className = 'event-entry';

  let detailStr = '';
  if (detail.key) {
    detailStr = ` <span class="event-key">${detail.key}</span>`;
  } else if (detail.changedKeys) {
    const keys = detail.changedKeys as string[];
    detailStr = ` <span class="event-key">${keys.join(', ')}</span>`;
  } else if (detail.scope) {
    detailStr = ` <span class="event-key">${detail.scope}</span>`;
  }

  entry.innerHTML = `<span class="event-time">${ts}</span> <span class="event-type">${type}</span>${detailStr}`;
  eventLog.appendChild(entry);
  eventLog.scrollTop = eventLog.scrollHeight;
}

// Wire up events
book.on('tokenChanged', (e: { detail: any }) => {
  logEvent('tokenChanged', e.detail);
  if (!syncingFromEditor) {
    updateAll();
  }
});
book.on('change', (e: { detail: any }) => {
  logEvent('change', e.detail);
  if (!syncingFromEditor) {
    updateAll();
  }
});
book.on('scopeAdded', (e: { detail: any }) => {
  logEvent('scopeAdded', e.detail);
});

// --- Rendering ---

const visualizationEl = document.getElementById('visualization')!;

function renderActiveTab() {
  outputEl.style.display = 'none';
  visualizationEl.style.display = 'none';
  eventLog.style.display = 'none';

  if (activeFormat === 'log') {
    eventLog.style.display = '';
  } else if (activeFormat === 'svg') {
    visualizationEl.style.display = '';
    try {
      const svgRenderer = new SVGRenderer(book, {
        showConnections: showConnectionsCb.checked,
      });
      svgContainer.innerHTML = svgRenderer.render();
    } catch (err) {
      svgContainer.innerHTML = `<p style="color:#dc3545">SVG render error: ${(err as Error).message}</p>`;
    }
  } else {
    outputEl.style.display = '';
    try {
      const renderer = new Renderer(book, activeFormat as RenderFormat);
      outputEl.textContent = renderer.render();
    } catch (err) {
      outputEl.textContent = `Error: ${(err as Error).message}`;
    }
  }
}

function updateAll() {
  renderActiveTab();
  // Update decorations in all editors (resolved colors may have changed)
  for (const view of editorViews.values()) {
    view.dispatch({ effects: [] });
  }
}

// --- Resolve a token for display, returning resolved value or error string ---

function safeResolve(scopeName: string, tokenName: string): { value: string; error?: string } {
  try {
    const resolved = book.resolve(`${scopeName}.${tokenName}`);
    return { value: resolved };
  } catch (err) {
    return { value: '', error: (err as Error).message };
  }
}

// --- Check if a resolved value looks like a color ---

function looksLikeColor(value: string): boolean {
  return /^#[0-9a-fA-F]{3,8}$/.test(value)
    || value.startsWith('rgb')
    || value.startsWith('hsl');
}

// --- Get display value for a token ---

function getTokenDisplayValue(scope: Scope, tokenName: string): string {
  // If inherited (not locally defined), show "inherit"
  if (!scope.hasOwn(tokenName) && scope.has(tokenName)) {
    return 'inherit';
  }

  const token = scope.get(tokenName);
  if (!token) return '';

  if (token.type === 'reference') {
    return `ref('${(token as any).key}')`;
  }
  if (token.type === 'function') {
    const fn = token as any;
    const argStrs: string[] = [];
    if (fn.args) {
      for (const arg of fn.args) {
        if (typeof arg === 'object' && arg !== null) {
          if (arg.type === 'reference') {
            argStrs.push(`ref('${arg.key}')`);
          } else if (arg.type === 'color') {
            argStrs.push(`color('${arg.rawValue}')`);
          } else if (typeof arg.getAllKeys === 'function') {
            // Scope argument -- show scope name
            argStrs.push(arg.name || 'scope');
          } else if (arg.type === 'dimension') {
            argStrs.push(`${arg.metadata?.unit || ''}(${arg.rawValue})`);
          }
        } else if (typeof arg === 'string') {
          argStrs.push(arg);
        } else if (typeof arg === 'number') {
          argStrs.push(String(arg));
        }
      }
    }
    return `${fn.rawValue}(${argStrs.join(', ')})`;
  }
  // Plain token
  const tv = token as any;
  if (tv.type === 'color') {
    return `color('${tv.rawValue}')`;
  }
  if (tv.metadata?.unit) {
    return `${tv.metadata.unit}(${tv.rawValue})`;
  }
  if (tv.type === 'string') {
    return `string('${tv.rawValue}')`;
  }
  return String(tv.rawValue);
}

// --- Scope extends tracking ---

const scopeExtendsMap = new Map<string, string>();

function getScopeExtends(name: string): string | undefined {
  return scopeExtendsMap.get(name);
}

// --- Convert scope tokens to text for CodeMirror ---

function scopeToText(scope: Scope): string {
  const lines: string[] = [];
  for (const key of scope.getAllKeys()) {
    lines.push(`${key}: ${getTokenDisplayValue(scope, key)}`);
  }
  return lines.join('\n');
}

// --- Sync editor content to scope ---

function syncScopeFromEditor(scope: Scope, text: string, _book: DesignBook) {
  syncingFromEditor = true;
  try {
    const lines = text.split('\n');
    const newKeys = new Set<string>();

    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx < 0) continue;

      const key = line.slice(0, colonIdx).trim();
      const valueStr = line.slice(colonIdx + 1).trim();

      // Track key even if incomplete — prevents deletion while editing
      if (key) newKeys.add(key);

      if (!key || !valueStr) continue;

      // "inherit" keyword — delete local override, revert to parent
      if (valueStr === 'inherit') {
        if (scope.hasOwn(key)) {
          scope.delete(key);
        }
        continue;
      }

      // Skip inherited keys only if the text still says "inherit"
      // (if the user typed a new value, we should set it locally as an override)
      if (!scope.hasOwn(key) && scope.has(key) && valueStr === getTokenDisplayValue(scope, key)) {
        continue;
      }

      try {
        const tokenValue = parseTokenInput(valueStr, _book, scope);
        scope.set(key, tokenValue);
      } catch (err) {
        // Log but don't interrupt editing
        logEvent('parseError', { key: `${scope.name}.${key}`, message: (err as Error).message });
      }
    }

    // Remove local tokens that are no longer in the editor
    for (const existingKey of scope.getAllKeys()) {
      if (!newKeys.has(existingKey) && scope.hasOwn(existingKey)) {
        scope.delete(existingKey);
      }
    }
  } finally {
    syncingFromEditor = false;
  }

  // Re-inject missing inherited keys at their expected position
  const scopeView = editorViews.get(scope.name);
  if (scopeView) {
    const allKeys = scope.getAllKeys();
    const doc = scopeView.state.doc;
    const editorLines = doc.toString().split('\n');

    // Build map of key → line index in editor
    const keyToLineIdx = new Map<string, number>();
    for (let i = 0; i < editorLines.length; i++) {
      const ci = editorLines[i].indexOf(':');
      if (ci >= 0) {
        const k = editorLines[i].slice(0, ci).trim();
        if (k) keyToLineIdx.set(k, i);
      }
    }

    // Find missing inherited keys and insert them after the previous key's line
    const missingInserts: Array<{ afterLineIdx: number; text: string }> = [];
    for (let ki = 0; ki < allKeys.length; ki++) {
      const key = allKeys[ki];
      if (keyToLineIdx.has(key)) continue;

      const lineText = `${key}: ${getTokenDisplayValue(scope, key)}`;

      // Find the last preceding key that exists in the editor
      let insertAfter = -1;
      for (let prev = ki - 1; prev >= 0; prev--) {
        const prevIdx = keyToLineIdx.get(allKeys[prev]);
        if (prevIdx !== undefined) {
          insertAfter = prevIdx;
          break;
        }
      }

      missingInserts.push({ afterLineIdx: insertAfter, text: lineText });
    }

    if (missingInserts.length > 0) {
      syncingFromEditor = true;
      // Apply in reverse order so line indices stay valid
      const changes: Array<{ from: number; insert: string }> = [];
      for (const { afterLineIdx, text } of missingInserts.reverse()) {
        if (afterLineIdx >= 0 && afterLineIdx < doc.lines) {
          const line = doc.line(afterLineIdx + 1); // 1-based
          changes.push({ from: line.to, insert: '\n' + text });
        } else {
          // Insert at the beginning
          changes.push({ from: 0, insert: text + '\n' });
        }
      }
      scopeView.dispatch({ changes });
      syncingFromEditor = false;
    }
  }

  // Now update outputs after all changes are applied
  updateAll();
}

// --- Color swatch widget ---

class ColorSwatchWidget extends WidgetType {
  constructor(private _color: string, private _pos: number, private _editable: boolean = false) { super(); }

  eq(other: ColorSwatchWidget) {
    return this._color === other._color && this._pos === other._pos && this._editable === other._editable;
  }

  toDOM() {
    const span = document.createElement('span');
    span.style.cssText = `
      display: inline-block;
      width: 12px; height: 12px;
      border-radius: 2px;
      border: 1px solid rgba(0,0,0,0.2);
      vertical-align: middle;
      margin: 0 4px 0 2px;
      background: ${this._color};
      cursor: ${this._editable ? 'pointer' : 'default'};
    `;
    span.className = 'cm-color-swatch';
    if (this._editable) {
      span.classList.add('cm-color-swatch--editable');
      span.dataset.color = this._color;
      span.dataset.pos = String(this._pos);
    }
    return span;
  }

  ignoreEvent() { return !this._editable; }
}

// --- Build decorations for color swatches + error highlighting ---

const errorLineDeco = Decoration.line({ class: 'cm-error-line' });
const inheritedLineDeco = Decoration.line({ class: 'cm-inherited-line' });

class InheritedValueWidget extends WidgetType {
  constructor(private _resolved: string, private _isColor: boolean) { super(); }

  eq(other: InheritedValueWidget) {
    return this._resolved === other._resolved;
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = 'cm-inherited-value';
    let content = ` → ${this._resolved}`;
    span.textContent = content;
    if (this._isColor) {
      const swatch = document.createElement('span');
      swatch.style.cssText = `
        display: inline-block;
        width: 10px; height: 10px;
        border-radius: 2px;
        border: 1px solid rgba(0,0,0,0.2);
        vertical-align: middle;
        margin-left: 4px;
        background: ${this._resolved};
      `;
      span.appendChild(swatch);
    }
    return span;
  }

  ignoreEvent() { return true; }
}

function buildDecorations(view: EditorView, _book: DesignBook, _scope?: Scope): DecorationSet {
  const doc = view.state.doc;

  // Collect widget decorations (swatches) with their positions
  const widgets: { pos: number; widget: WidgetType }[] = [];
  // Collect line decorations — keyed by line start to deduplicate
  const errorLines = new Set<number>();
  const inheritedLines = new Set<number>();

  for (const { from, to } of view.visibleRanges) {
    const text = doc.sliceString(from, to);

    // Find color('...') and hex('...') calls — editable, opens picker
    const colorCallRegex = /(?:color|hex)\(\s*['"]?([^'")\s]+)['"]?\s*\)/g;
    let match;
    while ((match = colorCallRegex.exec(text)) !== null) {
      const colorVal = match[1];
      const parsed = culoriParse(colorVal);
      if (parsed) {
        const hex = formatHex(parsed) ?? colorVal;
        const pos = from + match.index;
        widgets.push({ pos, widget: new ColorSwatchWidget(hex, pos, true) });
      }
    }

    // Find bare #hex colors (inside function args) — editable
    const hexRegex = /#[0-9a-fA-F]{3,8}\b/g;
    while ((match = hexRegex.exec(text)) !== null) {
      const pos = from + match.index;
      // Skip if already covered by a color() call above
      const alreadyCovered = widgets.some(w => {
        const wPos = (w.widget as ColorSwatchWidget).pos;
        return wPos !== undefined && pos > wPos && pos < wPos + 20;
      });
      if (!alreadyCovered) {
        widgets.push({ pos, widget: new ColorSwatchWidget(match[0], pos, true) });
      }
    }

    // Find ref('...') and resolve to show swatch (read-only — no picker)
    const refRegex = /ref\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = refRegex.exec(text)) !== null) {
      const refKey = match[1];
      try {
        const resolved = book.resolve(refKey);
        if (resolved && looksLikeColor(resolved)) {
          const pos = from + match.index;
          widgets.push({ pos, widget: new ColorSwatchWidget(resolved, pos, false) });
        }
      } catch {
        // skip unresolvable refs
      }
    }
  }

  // Check each line for parse errors
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const lineText = line.text.trim();
    if (!lineText) continue; // blank lines are fine

    const colonIdx = lineText.indexOf(':');
    if (colonIdx < 0) {
      // No colon — not a valid key: value line
      errorLines.add(line.from);
      continue;
    }

    const key = lineText.slice(0, colonIdx).trim();
    const valueStr = lineText.slice(colonIdx + 1).trim();

    if (!key) {
      errorLines.add(line.from);
      continue;
    }

    if (!valueStr) continue; // empty value is OK while typing

    // Parse check (skip for "inherit" keyword)
    if (valueStr !== 'inherit') {
      try {
        parseTokenInput(valueStr, _book, _scope);
      } catch {
        errorLines.add(line.from);
      }
    }

    // Mark inherited lines (key exists in scope but not locally owned)
    if (_scope && !_scope.hasOwn(key) && _scope.has(key)) {
      inheritedLines.add(line.from);
    }

    // Show resolved value after "inherit" keyword
    if (valueStr === 'inherit' && _scope) {
      try {
        const resolved = book.resolve(`${_scope.name}.${key}`);
        const isColor = looksLikeColor(resolved);
        const endOfLine = line.from + line.text.length;
        widgets.push({ pos: endOfLine, widget: new InheritedValueWidget(resolved, isColor) });
      } catch {
        // skip if can't resolve
      }
    }
  }

  // Build a single sorted DecorationSet with both widgets and line decorations
  const builder = new RangeSetBuilder<Decoration>();

  // Merge widgets and error lines into a single sorted pass
  const allDecos: { pos: number; deco: Decoration; isLine: boolean }[] = [];

  for (const { pos, widget } of widgets) {
    allDecos.push({ pos, deco: Decoration.widget({ widget, side: -1 }), isLine: false });
  }
  for (const lineStart of inheritedLines) {
    allDecos.push({ pos: lineStart, deco: inheritedLineDeco, isLine: true });
  }
  for (const lineStart of errorLines) {
    allDecos.push({ pos: lineStart, deco: errorLineDeco, isLine: true });
  }

  // Sort by position
  allDecos.sort((a, b) => a.pos - b.pos);

  for (const { pos, deco, isLine } of allDecos) {
    if (isLine) {
      builder.add(pos, pos, deco);
    } else {
      builder.add(pos, pos, deco);
    }
  }

  return builder.finish();
}

// --- Color swatch + error highlight plugin ---

function colorSwatchPlugin(_book: DesignBook, _scope?: Scope) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view, _book, _scope);
    }

    update(update: ViewUpdate) {
      this.decorations = buildDecorations(update.view, _book, _scope);
    }
  }, { decorations: v => v.decorations });
}

// --- Autocomplete ---

const FUNCTION_NAMES = [
  'bestContrastWith', 'minContrastWith', 'colorMix',
  'lighten', 'darken', 'relativeTo',
  'closestColor', 'furthestFrom', 'averageColor',
  'spacingScale', 'typographyScale', 'timing',
];

const VALUE_CONSTRUCTORS = [
  { label: "color('#...')", apply: "color('#", type: 'keyword' as const },
  { label: 'px(...)', apply: 'px(', type: 'keyword' as const },
  { label: 'rem(...)', apply: 'rem(', type: 'keyword' as const },
  { label: 'ms(...)', apply: 'ms(', type: 'keyword' as const },
  { label: "dimension(n, 'unit')", apply: "dimension(", type: 'keyword' as const },
  { label: "string('...')", apply: "string('", type: 'keyword' as const },
];

function getAllQualifiedKeys(): { key: string; color?: string }[] {
  const results: { key: string; color?: string }[] = [];
  for (const scope of book.getAllScopes()) {
    for (const tokenName of scope.getAllKeys()) {
      const qualifiedKey = `${scope.name}.${tokenName}`;
      let color: string | undefined;
      try {
        const resolved = book.resolve(qualifiedKey);
        if (resolved && (resolved.startsWith('#') || resolved.startsWith('rgb') || resolved.startsWith('hsl'))) {
          color = resolved;
        }
      } catch {
        // skip
      }
      results.push({ key: qualifiedKey, color });
    }
  }
  return results;
}

function createCompletionSource(_book: DesignBook, _currentScope: Scope) {
  return (context: CompletionContext): CompletionResult | null => {
    const line = context.state.doc.lineAt(context.pos);
    const lineText = line.text;
    const cursorInLine = context.pos - line.from;

    // Find if we're in value position (after "key: ")
    const colonIndex = lineText.indexOf(':');
    if (colonIndex < 0 || cursorInLine <= colonIndex) return null;

    const afterColon = lineText.slice(colonIndex + 1);
    const afterColonTrimStart = afterColon.length - afterColon.trimStart().length;
    const valueStart = line.from + colonIndex + 1 + afterColonTrimStart;
    const valueText = lineText.slice(colonIndex + 1).trimStart();
    const valueTextUpToCursor = valueText.slice(0, cursorInLine - (colonIndex + 1 + afterColonTrimStart));

    // Check if we're inside ref('...')
    const insideRefMatch = valueTextUpToCursor.match(/ref\(\s*['"]([^'"]*)$/);
    if (insideRefMatch) {
      const partial = insideRefMatch[1];
      const refFrom = context.pos - partial.length;
      const allKeys = getAllQualifiedKeys();
      const options = allKeys
        .filter(({ key }) => !partial || key.toLowerCase().includes(partial.toLowerCase()))
        .map(({ key, color }) => ({
          label: key,
          type: 'variable' as const,
          detail: color || undefined,
          apply: key,
        }));

      if (options.length === 0) return null;
      return { from: refFrom, options };
    }

    // Check if we're inside a function call argument position
    // Use a smarter match that handles nested parens (e.g. ref('...') inside the args)
    const funcArgMatch = valueTextUpToCursor.match(/^(\w+)\((.*?)$/s);
    if (funcArgMatch && FUNCTION_NAMES.includes(funcArgMatch[1])) {
      // Extract the current (last) argument being typed
      const argsText = funcArgMatch[2];
      const lastComma = argsText.lastIndexOf(',');
      const currentArgText = lastComma >= 0 ? argsText.slice(lastComma + 1).trim() : argsText.trim();
      const partial = currentArgText;
      const wordFrom = context.pos - partial.length;
      const lowerPartial = partial.toLowerCase();
      const options: any[] = [];

      // Only suggest scope names for functions that take a scope argument
      const SCOPE_ARG_FUNCTIONS = [
        'bestContrastWith', 'minContrastWith', 'closestColor',
        'furthestFrom', 'averageColor',
      ];
      if (SCOPE_ARG_FUNCTIONS.includes(funcArgMatch[1])) {
        for (const scope of book.getAllScopes()) {
          if (!partial || scope.name.toLowerCase().includes(lowerPartial)) {
            options.push({
              label: scope.name,
              type: 'namespace',
              detail: 'scope',
              boost: 1, // show scopes prominently
            });
          }
        }
      }

      // Suggest ref('...') completions (for token arguments)
      const allKeys = getAllQualifiedKeys();
      for (const { key, color } of allKeys) {
        const refLabel = `ref('${key}')`;
        if (!partial || refLabel.toLowerCase().includes(lowerPartial) || key.toLowerCase().includes(lowerPartial)) {
          options.push({
            label: refLabel,
            type: 'variable',
            detail: color || undefined,
            apply: `ref('${key}')`,
          });
        }
      }

      if (options.length === 0) return null;
      return { from: wordFrom, options };
    }

    // General value position: get word at cursor for "from" position
    const wordMatch = valueTextUpToCursor.match(/[\w#'(.]*$/);
    const partial = wordMatch ? wordMatch[0] : '';
    const wordFrom = context.pos - partial.length;

    // Don't show completions if we have no partial and no explicit activation
    if (!partial && !context.explicit) return null;

    const lowerPartial = partial.toLowerCase();
    const options: any[] = [];

    // Refs
    const allKeys = getAllQualifiedKeys();
    for (const { key, color } of allKeys) {
      const refLabel = `ref('${key}')`;
      if (!partial || refLabel.toLowerCase().includes(lowerPartial) || key.toLowerCase().includes(lowerPartial)) {
        options.push({
          label: refLabel,
          type: 'variable',
          detail: color || undefined,
          apply: `ref('${key}')`,
        });
      }
    }

    // Functions
    for (const fn of FUNCTION_NAMES) {
      if (!partial || fn.toLowerCase().includes(lowerPartial)) {
        options.push({
          label: `${fn}(...)`,
          type: 'function',
          apply: `${fn}(`,
        });
      }
    }

    // Value constructors
    for (const vc of VALUE_CONSTRUCTORS) {
      if (!partial || vc.label.toLowerCase().includes(lowerPartial)) {
        options.push({
          label: vc.label,
          type: vc.type,
          apply: vc.apply,
        });
      }
    }

    // "inherit" keyword — only in scopes that extend another
    if (getScopeExtends(_currentScope.name)) {
      if (!partial || 'inherit'.includes(lowerPartial)) {
        options.push({
          label: 'inherit',
          type: 'keyword',
          detail: 'use parent value',
          boost: 2,
        });
      }
    }

    if (options.length === 0) return null;
    return { from: wordFrom, options };
  };
}

// --- Create a CodeMirror editor for a scope ---

function createScopeEditor(scope: Scope, container: HTMLElement, _book: DesignBook): EditorView {
  const initialDoc = scopeToText(scope);

  const state = EditorState.create({
    doc: initialDoc,
    extensions: [
      keymap.of(defaultKeymap),
      autocompletion({
        override: [createCompletionSource(_book, scope)],
        activateOnTyping: true,
      }),
      colorSwatchPlugin(_book, scope),
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.docChanged) {
          syncScopeFromEditor(scope, update.state.doc.toString(), _book);
        }
        // On blur: if editor is empty, remove the scope
        if (update.focusChanged && !update.view.hasFocus) {
          const text = update.state.doc.toString().trim();
          const hasTokens = text.split('\n').some(line => {
            const colonIdx = line.indexOf(':');
            if (colonIdx < 0) return false;
            const key = line.slice(0, colonIdx).trim();
            const val = line.slice(colonIdx + 1).trim();
            return key.length > 0 && val.length > 0;
          });
          if (!hasTokens) {
            // Defer to avoid issues during the focus transition
            setTimeout(() => {
              try {
                _book.deleteScope(scope.name);
                scopeExtendsMap.delete(scope.name);
              } catch {
                // scope may already be gone
              }
              renderInputColumn();
              updateAll();
            }, 0);
          }
        }
      }),
      EditorView.theme({
        '&': { fontSize: '13px' },
        '.cm-content': {
          fontFamily: "'SF Mono', 'Fira Code', 'Fira Mono', Menlo, monospace",
          padding: '8px 0',
        },
        '.cm-line': { padding: '1px 8px' },
        '.cm-focused': { outline: 'none' },
        '.cm-scroller': { overflow: 'auto' },
        '&.cm-focused .cm-cursor': { borderLeftColor: '#0066cc' },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
          background: 'rgba(0, 102, 204, 0.15)',
        },
      }),
    ],
  });

  const view = new EditorView({ state, parent: container });
  return view;
}

// --- Build the input UI ---

function renderInputColumn() {
  // Destroy existing editors
  for (const view of editorViews.values()) {
    view.destroy();
  }
  editorViews.clear();

  inputColumn.innerHTML = '';

  const scopes = book.getAllScopes();

  for (const scope of scopes) {
    const block = document.createElement('div');
    block.className = 'scope-block';

    // Header
    const header = document.createElement('div');
    header.className = 'scope-header';
    header.innerHTML = `<span class="scope-name">${scope.name}</span>`;

    const extendsInfo = getScopeExtends(scope.name);
    if (extendsInfo) {
      header.innerHTML += `<span class="scope-extends">extends ${extendsInfo}</span>`;
    }

    block.appendChild(header);

    // CodeMirror editor container
    const editorContainer = document.createElement('div');
    editorContainer.className = 'scope-editor';
    block.appendChild(editorContainer);

    const view = createScopeEditor(scope, editorContainer, book);
    editorViews.set(scope.name, view);

    inputColumn.appendChild(block);
  }

  // Add scope button / form
  const addScopeBtn = document.createElement('button');
  addScopeBtn.className = 'add-scope-btn';
  addScopeBtn.textContent = '+ Add scope';
  addScopeBtn.addEventListener('click', () => {
    showAddScopeForm();
  });
  inputColumn.appendChild(addScopeBtn);
}

// --- Add scope ---

function showAddScopeForm() {
  const existing = inputColumn.querySelector('.new-scope-form');
  if (existing) {
    existing.remove();
    return;
  }

  const form = document.createElement('div');
  form.className = 'new-scope-form';

  const nameInput = document.createElement('input');
  nameInput.placeholder = 'Scope name';
  form.appendChild(nameInput);

  const extendsSelect = document.createElement('select');
  const noneOption = document.createElement('option');
  noneOption.value = '';
  noneOption.textContent = '(no extends)';
  extendsSelect.appendChild(noneOption);

  for (const s of book.getAllScopes()) {
    const opt = document.createElement('option');
    opt.value = s.name;
    opt.textContent = `extends ${s.name}`;
    extendsSelect.appendChild(opt);
  }
  form.appendChild(extendsSelect);

  const createBtn = document.createElement('button');
  createBtn.textContent = 'Create';
  createBtn.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) return;

    const extendsVal = extendsSelect.value || undefined;
    try {
      book.addScope(name, extendsVal ? { extends: extendsVal } : undefined);
      if (extendsVal) {
        scopeExtendsMap.set(name, extendsVal);
      }
    } catch (err) {
      logEvent('error', { scope: name, message: (err as Error).message });
    }

    renderInputColumn();
    updateAll();
  });
  form.appendChild(createBtn);

  inputColumn.appendChild(form);
}

// --- Tabs ---

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    activeFormat = (tab as HTMLElement).dataset.format as RenderFormat | 'svg' | 'log';
    renderActiveTab();
  });
});

// --- Show connections toggle ---

showConnectionsCb.addEventListener('change', () => {
  if (activeFormat === 'svg') renderActiveTab();
});

// --- Color picker (hdr-color-input) ---

let pickerTargetView: EditorView | null = null;
let pickerTargetPos: number = -1;
let activePicker: HTMLElement | null = null;

function cleanupPicker() {
  if (activePicker) {
    activePicker.remove();
    activePicker = null;
  }
  pickerTargetView = null;
  pickerTargetPos = -1;
}

function replaceColorInEditor(view: EditorView, pos: number, newColor: string) {
  const doc = view.state.doc;
  const line = doc.lineAt(pos);
  const lineText = line.text;

  const colorCallRegex = /color\(\s*['"]([^'"]+)['"]\s*\)/g;
  const hexRegex = /#[0-9a-fA-F]{3,8}/g;

  let m;
  while ((m = colorCallRegex.exec(lineText)) !== null) {
    const absStart = line.from + m.index;
    const absEnd = absStart + m[0].length;
    if (pos >= absStart && pos < absEnd) {
      view.dispatch({
        changes: { from: absStart, to: absEnd, insert: `color('${newColor}')` },
      });
      return;
    }
  }

  while ((m = hexRegex.exec(lineText)) !== null) {
    const absStart = line.from + m.index;
    const absEnd = absStart + m[0].length;
    if (pos >= absStart && pos < absEnd) {
      view.dispatch({
        changes: { from: absStart, to: absEnd, insert: newColor },
      });
      return;
    }
  }
}

// Global click handler for color swatches
document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;

  // Clicking inside existing picker — leave it alone
  if (activePicker && activePicker.contains(target)) return;

  if (!target.classList.contains('cm-color-swatch--editable')) {
    cleanupPicker();
    return;
  }

  const colorValue = target.dataset.color;
  const pos = parseInt(target.dataset.pos || '-1', 10);
  if (!colorValue || pos < 0) return;

  // Find the owning editor view
  let foundView: EditorView | null = null;
  for (const [, view] of editorViews) {
    if (view.dom.contains(target)) {
      foundView = view;
      break;
    }
  }
  if (!foundView) return;

  pickerTargetView = foundView;
  pickerTargetPos = pos;

  // Clean up any previous picker
  cleanupPicker();
  pickerTargetView = foundView;
  pickerTargetPos = pos;

  // Create a fresh picker element positioned at the swatch
  const picker = document.createElement('color-input') as any;
  picker.value = colorValue;
  picker.setAttribute('no-alpha', '');

  // Position it absolutely near the swatch
  const wrapper = document.createElement('div');
  wrapper.className = 'color-picker-wrapper';
  const rect = target.getBoundingClientRect();
  wrapper.style.cssText = `
    position: fixed;
    left: ${rect.left}px;
    top: ${rect.bottom + 4}px;
    z-index: 2000;
  `;
  wrapper.appendChild(picker);
  document.body.appendChild(wrapper);
  activePicker = wrapper;

  picker.addEventListener('change', () => {
    const newColor = picker.value;
    if (newColor && pickerTargetView && pickerTargetPos >= 0) {
      replaceColorInEditor(pickerTargetView, pickerTargetPos, newColor);
    }
  });

  // Auto-open the picker
  requestAnimationFrame(() => {
    if (typeof picker.show === 'function') {
      picker.show();
    }
  });
});

// --- Boot & initial render ---

bootDesignSystem();
renderInputColumn();
updateAll();
