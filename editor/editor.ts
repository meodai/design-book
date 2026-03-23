import {
  DesignBook, hex, ref, px, rem, ms,
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

// --- Boot the design system ---

const book = new DesignBook('demo-system');

// Brand scope
const brand = book.addScope('brand');
brand.set('primary', hex('#0066cc'));
brand.set('secondary', hex('#ff8800'));
brand.set('neutral-dark', hex('#1a1a1a'));
brand.set('neutral-light', hex('#ffffff'));
brand.set('success', hex('#28a745'));
brand.set('error', hex('#dc3545'));
brand.set('space-sm', px(8));
brand.set('space-md', px(16));
brand.set('font-base', rem(1));

// Semantic scope
const semantic = book.addScope('semantic');
semantic.set('background', ref('brand.neutral-light'));
semantic.set('text', bestContrastWith(ref('semantic.background'), brand));
semantic.set('hover', colorMix(ref('brand.primary'), hex('#000000'), semantic, { ratio: 0.1 }));

// UI scope
const ui = book.addScope('ui');
ui.set('complement', relativeTo(ref('brand.primary'), 'oklch', [null, null, '+180'], ui));
ui.set('muted', relativeTo(ref('brand.primary'), 'oklch', [null, '*0.5', null], ui));
ui.set('accessible-text', minContrastWith(ref('brand.neutral-light'), brand, { ratio: 4.5 }));
ui.set('heading-lg', typographyScale(ref('brand.font-base'), ui, { ratio: 1.25, step: 3 }));
ui.set('section-spacing', spacingScale(ref('brand.space-md'), ui, { multiplier: 2 }));

// Dark theme extending brand
const dark = book.addScope('dark', { extends: 'brand' });
dark.set('neutral-dark', hex('#ffffff'));
dark.set('neutral-light', hex('#1a1a1a'));

// --- State ---

let activeFormat: RenderFormat = 'css-variables';

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

function renderOutput() {
  try {
    const renderer = new Renderer(book, activeFormat);
    outputEl.textContent = renderer.render();
  } catch (err) {
    outputEl.textContent = `Error: ${(err as Error).message}`;
  }
}

function renderSVG() {
  try {
    const svgRenderer = new SVGRenderer(book, {
      showConnections: showConnectionsCb.checked,
    });
    svgContainer.innerHTML = svgRenderer.render();
  } catch (err) {
    svgContainer.innerHTML = `<p style="color:#dc3545">SVG render error: ${(err as Error).message}</p>`;
  }
}

function updateAll() {
  renderOutput();
  renderSVG();
  // Update decorations in all editors (resolved colors may have changed)
  for (const view of editorViews.values()) {
    // Force decoration rebuild by dispatching a no-op transaction
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
            argStrs.push(String(arg.rawValue));
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
  if (tv.metadata?.unit) {
    return `${tv.metadata.unit}(${tv.rawValue})`;
  }
  return String(tv.rawValue);
}

// --- Scope extends tracking ---

const scopeExtendsMap = new Map<string, string>();
scopeExtendsMap.set('dark', 'brand');

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

      if (!key || !valueStr) continue;
      newKeys.add(key);

      try {
        const tokenValue = parseTokenInput(valueStr);
        scope.set(key, tokenValue);
      } catch (err) {
        // Log but don't interrupt editing
        logEvent('parseError', { key: `${scope.name}.${key}`, message: (err as Error).message });
      }
    }

    // Remove tokens that are no longer in the editor
    for (const existingKey of scope.getAllKeys()) {
      if (!newKeys.has(existingKey)) {
        try {
          (scope as any).delete?.(existingKey);
        } catch {
          // delete may not exist; skip
        }
      }
    }
  } finally {
    syncingFromEditor = false;
  }

  // Now update outputs after all changes are applied
  updateAll();
}

// --- Color swatch widget ---

class ColorSwatchWidget extends WidgetType {
  constructor(private color: string) { super(); }

  eq(other: ColorSwatchWidget) {
    return this.color === other.color;
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
      background: ${this.color};
    `;
    span.className = 'cm-color-swatch';
    return span;
  }

  ignoreEvent() { return true; }
}

// --- Build decorations for color swatches + error highlighting ---

const errorLineDeco = Decoration.line({ class: 'cm-error-line' });

function buildDecorations(view: EditorView, _book: DesignBook): DecorationSet {
  const doc = view.state.doc;

  // Collect widget decorations (swatches) with their positions
  const widgets: { pos: number; widget: WidgetType }[] = [];
  // Collect line decorations (errors) — keyed by line start to deduplicate
  const errorLines = new Set<number>();

  for (const { from, to } of view.visibleRanges) {
    const text = doc.sliceString(from, to);

    // Find hex colors for swatches
    const hexRegex = /#[0-9a-fA-F]{3,8}\b/g;
    let match;
    while ((match = hexRegex.exec(text)) !== null) {
      const pos = from + match.index;
      widgets.push({ pos, widget: new ColorSwatchWidget(match[0]) });
    }

    // Find ref('...') and resolve to show swatch
    const refRegex = /ref\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = refRegex.exec(text)) !== null) {
      const refKey = match[1];
      try {
        const resolved = book.resolve(refKey);
        if (resolved && looksLikeColor(resolved)) {
          const pos = from + match.index;
          widgets.push({ pos, widget: new ColorSwatchWidget(resolved) });
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

    try {
      parseTokenInput(valueStr);
    } catch {
      errorLines.add(line.from);
    }
  }

  // Build a single sorted DecorationSet with both widgets and line decorations
  const builder = new RangeSetBuilder<Decoration>();

  // Merge widgets and error lines into a single sorted pass
  const allDecos: { pos: number; deco: Decoration; isLine: boolean }[] = [];

  for (const { pos, widget } of widgets) {
    allDecos.push({ pos, deco: Decoration.widget({ widget, side: -1 }), isLine: false });
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

function colorSwatchPlugin(_book: DesignBook) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view, _book);
    }

    update(update: ViewUpdate) {
      this.decorations = buildDecorations(update.view, _book);
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
  { label: "hex('#...')", apply: "hex('#", type: 'keyword' as const },
  { label: 'px(...)', apply: 'px(', type: 'keyword' as const },
  { label: 'rem(...)', apply: 'rem(', type: 'keyword' as const },
  { label: 'ms(...)', apply: 'ms(', type: 'keyword' as const },
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
    const funcArgMatch = valueTextUpToCursor.match(/(\w+)\((?:[^)]*,\s*)?([^,)]*)$/);
    if (funcArgMatch && FUNCTION_NAMES.includes(funcArgMatch[1])) {
      const partial = funcArgMatch[2].trim();
      const wordFrom = context.pos - partial.length;
      const lowerPartial = partial.toLowerCase();
      const options: any[] = [];

      // Suggest scope names (for scope arguments)
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
      colorSwatchPlugin(_book),
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
    activeFormat = (tab as HTMLElement).dataset.format as RenderFormat;
    renderOutput();
  });
});

// --- Show connections toggle ---

showConnectionsCb.addEventListener('change', () => {
  renderSVG();
});

// --- Initial render ---

renderInputColumn();
updateAll();
