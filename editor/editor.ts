import {
  DesignBook, hex, ref, px, rem, ms,
  bestContrastWith, minContrastWith, colorMix, relativeTo,
  spacingScale, typographyScale,
  Renderer, SVGRenderer,
} from '../src/index';
import type { RenderFormat } from '../src/index';
import type { Scope } from '../src/index';
import { parseTokenInput } from './editor-input-parser';
import { setupAutocomplete } from './editor-autocomplete';

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
});
book.on('change', (e: { detail: any }) => {
  logEvent('change', e.detail);
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

// --- Build the input UI ---

function renderInputColumn() {
  inputColumn.innerHTML = '';

  const scopes = book.getAllScopes();

  for (const scope of scopes) {
    const block = document.createElement('div');
    block.className = 'scope-block';

    // Header
    const header = document.createElement('div');
    header.className = 'scope-header';
    header.innerHTML = `<span class="scope-name">${scope.name}</span>`;

    // Check if scope extends another (via allTokens keys vs own keys heuristic)
    // We'll track extends info separately
    const extendsInfo = getScopeExtends(scope.name);
    if (extendsInfo) {
      header.innerHTML += `<span class="scope-extends">extends ${extendsInfo}</span>`;
    }

    block.appendChild(header);

    // Token rows
    const keys = scope.getAllKeys();
    for (const tokenName of keys) {
      const { value: resolved, error } = safeResolve(scope.name, tokenName);
      const isColor = !error && looksLikeColor(resolved);

      const row = document.createElement('div');
      row.className = 'token-row';

      // Color swatch
      const swatch = document.createElement('div');
      swatch.className = `token-swatch${isColor ? '' : ' hidden'}`;
      if (isColor) {
        swatch.style.background = resolved;
      }
      row.appendChild(swatch);

      // Name (read-only)
      const nameInput = document.createElement('input');
      nameInput.className = 'token-name';
      nameInput.value = tokenName;
      nameInput.readOnly = true;
      row.appendChild(nameInput);

      // Value (editable)
      const valueInput = document.createElement('input');
      valueInput.className = 'token-value';
      valueInput.value = getTokenDisplayValue(scope, tokenName);
      if (error) {
        valueInput.classList.add('error');
      }
      valueInput.addEventListener('change', () => {
        handleTokenValueChange(scope.name, tokenName, valueInput.value);
      });
      row.appendChild(valueInput);

      block.appendChild(row);

      // Error display
      if (error) {
        const errorEl = document.createElement('div');
        errorEl.className = 'token-error';
        errorEl.textContent = error;
        block.appendChild(errorEl);
      }
    }

    // Add token button
    const addBtn = document.createElement('button');
    addBtn.className = 'add-token-btn';
    addBtn.textContent = '+ Add token';
    addBtn.addEventListener('click', () => {
      handleAddToken(scope.name);
    });
    block.appendChild(addBtn);

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

// --- Scope extends tracking ---

const scopeExtendsMap = new Map<string, string>();
// Pre-populate
scopeExtendsMap.set('dark', 'brand');

function getScopeExtends(name: string): string | undefined {
  return scopeExtendsMap.get(name);
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
    return `${fn.rawValue}(...)`;
  }
  // Plain token
  const tv = token as any;
  if (tv.metadata?.unit) {
    return `${tv.metadata.unit}(${tv.rawValue})`;
  }
  return String(tv.rawValue);
}

// --- Handle value changes ---

function handleTokenValueChange(scopeName: string, tokenName: string, rawInput: string) {
  const scope = book.getScope(scopeName);
  if (!scope) return;

  try {
    const tokenValue = parseTokenInput(rawInput);
    scope.set(tokenName, tokenValue);
  } catch (err) {
    logEvent('error', { key: `${scopeName}.${tokenName}`, message: (err as Error).message });
  }

  // Re-render everything
  renderInputColumn();
  updateAll();
}

// --- Add token ---

function handleAddToken(scopeName: string) {
  const name = prompt('Token name:');
  if (!name || !name.trim()) return;

  const value = prompt('Token value (e.g. #ff0000, px(16), rem(1)):');
  if (!value || !value.trim()) return;

  const scope = book.getScope(scopeName);
  if (!scope) return;

  try {
    const tokenValue = parseTokenInput(value.trim());
    scope.set(name.trim(), tokenValue);
  } catch (err) {
    logEvent('error', { key: `${scopeName}.${name.trim()}`, message: (err as Error).message });
  }

  renderInputColumn();
  updateAll();
}

// --- Add scope ---

function showAddScopeForm() {
  // Remove existing form if present
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

// --- Autocomplete ---

setupAutocomplete(book);

// --- Initial render ---

renderInputColumn();
updateAll();
