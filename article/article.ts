import {
  DesignBook,
  color,
  ref,
  px,
  darken,
  spacingScale,
  typographyScale,
  bestContrastWith,
  minContrastWith,
  colorMix,
} from '../src';
import type {
  FunctionTokenValue,
  ReferenceValue,
  TokenValue,
} from '../src';
import 'hdr-color-input';
import './style.css';

// ---------------------------------------------------------------------------
// 1. Token setup
// ---------------------------------------------------------------------------

const book = new DesignBook('article');

// The values layer is the atom layer: every token here is named after WHAT
// it is (a colour, a length), not what it MEANS. No semantics, no roles —
// just raw material the rest of the system can reference.
const values = book.addScope('values');
values.set('gray50',   color('#fafafa'));
values.set('gray500',  color('#717c8f'));
values.set('gray800',  color('#202126'));
values.set('gray900',  color('#1a1a1a'));
values.set('blue500',  color('#1d4eb8'));
values.set('red500',   color('#dc2626'));
values.set('white',    color('#ffffff'));

// The color layer is the semantic layer: refs that give the raw values a
// role in the system. "surface" / "onSurface" name a paired purpose;
// "brand" and "interaction" name intents. Same hex behind the scenes — but
// here the names mean something to the design system.
const colorScope = book.addScope('color');
colorScope.set('surface',     ref('values.gray50'));
colorScope.set('onSurface',   ref('values.gray900'));
colorScope.set('brand',       ref('values.gray800'));
colorScope.set('interaction', ref('values.blue500'));
colorScope.set('text',        ref('color.onSurface'));
colorScope.set('linkHover',   darken(ref('color.interaction'), { amount: 0.15 }));

// A procedural ramp: 7 steps interpolated between color.surface and
// color.interaction in oklch. Re-pointing either anchor re-tones the chart,
// the button outline, and any best/min-contrast tokens that read from it.
const ramp = book.addScope('ramp');
ramp.set('s100', colorMix(ref('color.surface'), ref('color.interaction'), { ratio: 0.05, colorSpace: 'oklch' }));
ramp.set('s200', colorMix(ref('color.surface'), ref('color.interaction'), { ratio: 0.15, colorSpace: 'oklch' }));
ramp.set('s300', colorMix(ref('color.surface'), ref('color.interaction'), { ratio: 0.30, colorSpace: 'oklch' }));
ramp.set('s400', colorMix(ref('color.surface'), ref('color.interaction'), { ratio: 0.50, colorSpace: 'oklch' }));
ramp.set('s500', colorMix(ref('color.surface'), ref('color.interaction'), { ratio: 0.70, colorSpace: 'oklch' }));
ramp.set('s700', colorMix(ref('color.surface'), ref('color.interaction'), { ratio: 0.90, colorSpace: 'oklch' }));
ramp.set('s900', ref('color.interaction'));
// Button label: highest-contrast ramp step against color.brand (the button
// background). The decision ("readable label on whatever the button is")
// lives in the token instead of in a comment.
colorScope.set('buttonText', bestContrastWith(ref('color.brand'), ramp));
// Hairline / outline: the ramp step that *just barely* contrasts with the
// surface — visible but not loud. minContrastWith picks the lowest candidate
// above the threshold, so this gives a soft border that auto-flips when the
// surface goes dark.
colorScope.set('line',       minContrastWith(ref('color.surface'), ramp, { ratio: 1.5 }));

const space = book.addScope('space');
space.set('base', px(16));
space.set('xs', spacingScale(ref('space.base'), { multiplier: 0.25 }));
space.set('s',  spacingScale(ref('space.base'), { multiplier: 0.5 }));
space.set('m',  spacingScale(ref('space.base'), { multiplier: 1 }));
space.set('l',  spacingScale(ref('space.base'), { multiplier: 1.75 }));
space.set('xl', spacingScale(ref('space.base'), { multiplier: 3 }));

const type = book.addScope('type');
type.set('base', px(18));
type.set('body', ref('type.base'));
type.set('h3',   typographyScale(ref('type.base'), { ratio: 1.2, step: 1 }));
type.set('h2',   typographyScale(ref('type.base'), { ratio: 1.2, step: 2 }));
type.set('h1',   typographyScale(ref('type.base'), { ratio: 1.2, step: 3 }));

const radius = book.addScope('radius');
radius.set('base', px(6));
radius.set('lg',   px(10));

// All scopes we manage, in display order. Used for the defaults snapshot
// and the reference-token candidate picker.
const trackedScopes = [
  ['values', values],
  ['ramp',   ramp],
  ['color',  colorScope],
  ['space',  space],
  ['type',   type],
  ['radius', radius],
] as const;

// Snapshot defaults (raw values only) for the reset button.
type Snapshot = Array<{ scope: string; name: string; value: number | string }>;
const defaults: Snapshot = [];
for (const [scopeName, scope] of trackedScopes) {
  for (const [name, tok] of Object.entries(scope.allTokens())) {
    if (tok.type === 'color' || tok.type === 'dimension') {
      defaults.push({ scope: scopeName, name, value: (tok as TokenValue).rawValue as number | string });
    } else if (tok.type === 'function') {
      const fn = tok as FunctionTokenValue;
      if (fn.name === 'darken' && fn.options?.amount !== undefined) {
        defaults.push({ scope: scopeName, name: `${name}.amount`, value: fn.options.amount as number });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 2. CSS custom-prop binding
// ---------------------------------------------------------------------------

const cssBindings: Record<string, string> = {
  '--color-surface':    'color.surface',
  '--color-text':       'color.text',
  '--color-brand':       'color.brand',
  '--color-interaction': 'color.interaction',
  '--color-link-hover':  'color.linkHover',
  '--color-button-text': 'color.buttonText',
  '--color-line':        'color.line',
  '--ramp-100':         'ramp.s100',
  '--ramp-200':         'ramp.s200',
  '--ramp-300':         'ramp.s300',
  '--ramp-400':         'ramp.s400',
  '--ramp-500':         'ramp.s500',
  '--ramp-700':         'ramp.s700',
  '--ramp-900':         'ramp.s900',
  '--space-xs':         'space.xs',
  '--space-s':          'space.s',
  '--space-m':          'space.m',
  '--space-l':          'space.l',
  '--space-xl':         'space.xl',
  '--type-body':        'type.body',
  '--type-h1':          'type.h1',
  '--type-h2':          'type.h2',
  '--type-h3':          'type.h3',
  '--radius-base':      'radius.base',
  '--radius-lg':        'radius.lg',
};

function syncCss() {
  const root = document.documentElement;
  for (const [prop, key] of Object.entries(cssBindings)) {
    try {
      root.style.setProperty(prop, book.resolve(key));
    } catch (err) {
      console.warn(`[article] could not resolve ${key}:`, err);
    }
  }
  updateChips();
}

book.on('change', syncCss);

// ---------------------------------------------------------------------------
// 3. Chip rendering
// ---------------------------------------------------------------------------

type ChipInfo =
  | { kind: 'token'; scopeName: string; name: string }
  | { kind: 'fn-option'; scopeName: string; name: string; optionName: string };

function getChipInfo(chip: HTMLElement): ChipInfo | null {
  const tokenAttr = chip.dataset.token;
  if (tokenAttr) {
    const dot = tokenAttr.indexOf('.');
    if (dot < 0) return null;
    return { kind: 'token', scopeName: tokenAttr.slice(0, dot), name: tokenAttr.slice(dot + 1) };
  }
  const fnAttr = chip.dataset.fnOption;
  if (fnAttr) {
    const parts = fnAttr.split('.');
    if (parts.length < 3) return null;
    const optionName = parts.pop()!;
    const scopeName = parts.shift()!;
    return { kind: 'fn-option', scopeName, name: parts.join('.'), optionName };
  }
  return null;
}

/** Walk through reference tokens until we reach a non-reference. */
function resolveToPrimitive(scopeName: string, name: string): { scopeName: string; name: string } | null {
  let s = scopeName;
  let n = name;
  for (let i = 0; i < 10; i++) {
    const scope = book.getScope(s);
    if (!scope) return null;
    const tok = scope.get(n);
    if (!tok) return null;
    if (tok.type !== 'reference') return { scopeName: s, name: n };
    const key = (tok as ReferenceValue).key;
    const dot = key.indexOf('.');
    if (dot < 0) return null;
    s = key.slice(0, dot);
    n = key.slice(dot + 1);
  }
  return null;
}

function getPrimitiveType(scopeName: string, name: string): string | null {
  const prim = resolveToPrimitive(scopeName, name);
  if (!prim) return null;
  const tok = book.getScope(prim.scopeName)?.get(prim.name);
  return tok?.type ?? null;
}

function renderChip(chip: HTMLElement) {
  const info = getChipInfo(chip);
  if (!info) return;
  const scope = book.getScope(info.scopeName);
  if (!scope) return;

  chip.innerHTML = '';
  chip.classList.remove('token-chip--color', 'token-chip--num', 'token-chip--ref');

  if (info.kind === 'fn-option') {
    const tok = scope.get(info.name) as FunctionTokenValue | undefined;
    if (!tok || tok.type !== 'function') return;
    const value = (tok.options as Record<string, unknown> | undefined)?.[info.optionName];
    chip.classList.add('token-chip--num');
    const span = document.createElement('span');
    span.className = 'chip-value';
    span.textContent = String(value ?? '');
    chip.append(span);
    chip.title = `${info.scopeName}.${info.name} option “${info.optionName}” = ${value}`;
    return;
  }

  const tok = scope.get(info.name);
  const primType = getPrimitiveType(info.scopeName, info.name);
  let resolved = '';
  try {
    resolved = book.resolve(`${info.scopeName}.${info.name}`);
  } catch {
    // leave resolved empty
  }

  // Reference tokens render as `[swatch] → target.key` so the indirection is
  // visible. The swatch shows the resolved color for context; the arrow + key
  // make it unmistakable that this token points elsewhere rather than holding
  // a value.
  if (tok && tok.type === 'reference') {
    const refKey = (tok as ReferenceValue).key;
    chip.classList.add('token-chip--ref');
    if (primType === 'color') {
      const swatch = document.createElement('span');
      swatch.className = 'chip-swatch';
      swatch.style.background = resolved || 'transparent';
      chip.append(swatch);
    }
    const arrow = document.createElement('span');
    arrow.className = 'chip-arrow';
    arrow.textContent = '→';
    chip.append(arrow);
    const target = document.createElement('span');
    target.className = 'chip-value';
    target.textContent = refKey;
    chip.append(target);
    chip.title = `${info.scopeName}.${info.name} = ref('${refKey}')`;
    return;
  }

  if (primType === 'color') {
    chip.classList.add('token-chip--color');
    const swatch = document.createElement('span');
    swatch.className = 'chip-swatch';
    swatch.style.background = resolved || 'transparent';
    chip.append(swatch);
    const value = document.createElement('span');
    value.className = 'chip-value';
    value.textContent = resolved.toLowerCase();
    chip.append(value);
  } else {
    chip.classList.add('token-chip--num');
    const value = document.createElement('span');
    value.className = 'chip-value';
    value.textContent = resolved;
    chip.append(value);
  }
  chip.title = `${info.scopeName}.${info.name}`;
}

function updateChips() {
  document.querySelectorAll<HTMLElement>('.token-chip').forEach(renderChip);
}

// ---------------------------------------------------------------------------
// 4. Popover
// ---------------------------------------------------------------------------

const popoverRoot = document.getElementById('popover-root')!;
let activePopover: HTMLElement | null = null;
let activeChip: HTMLElement | null = null;

function closePopover() {
  if (activePopover) {
    activePopover.remove();
    activePopover = null;
  }
  activeChip = null;
}

function positionPopover(pop: HTMLElement, chip: HTMLElement) {
  const rect = chip.getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(window.innerWidth - 280, rect.left))}px`;
  pop.style.top = `${rect.bottom + 8}px`;
}

function openPopover(chip: HTMLElement) {
  closePopover();

  const info = getChipInfo(chip);
  if (!info) return;

  const pop = document.createElement('div');
  pop.className = 'popover';

  if (info.kind === 'fn-option') {
    buildFnOptionUI(pop, info, chip);
  } else {
    const scope = book.getScope(info.scopeName);
    if (!scope) return;
    const tok = scope.get(info.name);
    if (!tok) return;

    // Colors get a bare picker — no popover chrome — since the picker IS
    // the UI. Routing it through openColorPicker bypasses the labelled
    // popover entirely.
    if (tok.type === 'color') {
      openColorPicker(chip, info.scopeName, info.name);
      return;
    }

    const label = document.createElement('div');
    label.className = 'popover-title';
    label.textContent = `${info.scopeName}.${info.name}`;
    pop.append(label);

    if (tok.type === 'reference') {
      // Reference tokens are decisions about what to point at. Editing one
      // means re-pointing it at a different token of compatible type, not
      // changing the destination's value.
      buildRefUI(pop, info.scopeName, info.name);
    } else if (tok.type === 'dimension') {
      buildDimensionUI(pop, info.scopeName, info.name, chip);
    } else {
      const note = document.createElement('div');
      note.className = 'popover-note';
      note.textContent = `Editing tokens of type "${tok.type}" isn't supported in this demo.`;
      pop.append(note);
    }
  }

  popoverRoot.append(pop);
  positionPopover(pop, chip);
  activePopover = pop;
  activeChip = chip;
}

function openColorPicker(chip: HTMLElement, scopeName: string, name: string) {
  const scope = book.getScope(scopeName)!;
  let current = '#000000';
  try {
    const resolved = book.resolve(`${scopeName}.${name}`);
    if (/^#[0-9a-f]{6}$/i.test(resolved)) current = resolved;
  } catch {
    // leave default
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'color-picker-wrapper';

  const picker = document.createElement('color-input') as HTMLElement & {
    value: string;
    show?: () => void;
  };
  picker.value = current;
  picker.setAttribute('no-alpha', '');
  wrapper.append(picker);

  popoverRoot.append(wrapper);
  positionPopover(wrapper, chip);
  activePopover = wrapper;
  activeChip = chip;

  picker.addEventListener('change', () => {
    if (!picker.value) return;
    try {
      scope.set(name, color(picker.value));
    } catch (err) {
      console.warn('[article] invalid color', picker.value, err);
    }
  });

  // Open the picker panel immediately — we're inside the chip-click gesture.
  requestAnimationFrame(() => {
    if (typeof picker.show === 'function') picker.show();
  });
}

function buildDimensionUI(pop: HTMLElement, scopeName: string, name: string, chip: HTMLElement) {
  const scope = book.getScope(scopeName)!;
  const tok = scope.get(name) as TokenValue;
  const unit = (tok.metadata?.unit as string | undefined) ?? '';
  const currentNum = Number(tok.rawValue);

  const min = Number(chip.dataset.min ?? Math.max(0, currentNum - 16));
  const max = Number(chip.dataset.max ?? currentNum + 16);
  const step = Number(chip.dataset.step ?? 1);

  const wrap = document.createElement('div');
  wrap.className = 'slider-wrap';

  const range = document.createElement('input');
  range.type = 'range';
  range.min = String(min);
  range.max = String(max);
  range.step = String(step);
  range.value = String(currentNum);

  const display = document.createElement('span');
  display.className = 'slider-value';
  display.textContent = `${currentNum}${unit}`;

  wrap.append(range, display);
  pop.append(wrap);

  range.addEventListener('input', () => {
    const v = Number(range.value);
    display.textContent = `${v}${unit}`;
    if (unit === 'px') {
      scope.set(name, px(v));
    } else {
      scope.set(name, { ...tok, rawValue: v } as TokenValue);
    }
  });
}

function buildFnOptionUI(
  pop: HTMLElement,
  info: Extract<ChipInfo, { kind: 'fn-option' }>,
  chip: HTMLElement,
) {
  const scope = book.getScope(info.scopeName);
  if (!scope) return;
  const tok = scope.get(info.name) as FunctionTokenValue | undefined;
  if (!tok || tok.type !== 'function') return;

  const label = document.createElement('div');
  label.className = 'popover-title';
  label.textContent = `${tok.name}( … ${info.optionName} )`;
  pop.append(label);

  const min = Number(chip.dataset.min ?? '0');
  const max = Number(chip.dataset.max ?? '1');
  const step = Number(chip.dataset.step ?? '0.01');
  const currentVal = Number((tok.options as Record<string, unknown> | undefined)?.[info.optionName] ?? 0);

  const wrap = document.createElement('div');
  wrap.className = 'slider-wrap';

  const range = document.createElement('input');
  range.type = 'range';
  range.min = String(min);
  range.max = String(max);
  range.step = String(step);
  range.value = String(currentVal);

  const display = document.createElement('span');
  display.className = 'slider-value';
  display.textContent = formatNumber(currentVal);

  wrap.append(range, display);
  pop.append(wrap);

  range.addEventListener('input', () => {
    const v = Number(range.value);
    display.textContent = formatNumber(v);
    const fresh = scope.get(info.name) as FunctionTokenValue;
    const newOptions = { ...(fresh.options ?? {}), [info.optionName]: v };
    scope.set(info.name, { ...fresh, options: newOptions });
  });
}

function buildRefUI(pop: HTMLElement, scopeName: string, name: string) {
  const scope = book.getScope(scopeName)!;
  const tok = scope.get(name) as ReferenceValue;
  const currentTarget = tok.key;
  const selfKey = `${scopeName}.${name}`;
  const targetType = getPrimitiveType(scopeName, name);

  const hint = document.createElement('div');
  hint.className = 'popover-note';
  hint.textContent = `Pick a token to point at. Same-type (${targetType ?? 'unknown'}) only.`;
  pop.append(hint);

  const list = document.createElement('div');
  list.className = 'ref-list';

  for (const [sName, s] of trackedScopes) {
    const tokenEntries = Object.entries(s.allTokens());
    const groupRows: HTMLElement[] = [];

    for (const [tName] of tokenEntries) {
      const candKey = `${sName}.${tName}`;
      if (candKey === selfKey) continue; // no self-reference
      if (getPrimitiveType(sName, tName) !== targetType) continue;

      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ref-option';
      if (candKey === currentTarget) row.classList.add('ref-option--selected');

      if (targetType === 'color') {
        const sw = document.createElement('span');
        sw.className = 'ref-option-swatch';
        try {
          sw.style.background = book.resolve(candKey);
        } catch {
          sw.style.background = 'transparent';
        }
        row.append(sw);
      }

      const keyLabel = document.createElement('span');
      keyLabel.className = 'ref-option-key';
      keyLabel.textContent = candKey;
      row.append(keyLabel);

      row.addEventListener('click', () => {
        try {
          scope.set(name, ref(candKey));
          closePopover();
        } catch (err) {
          console.warn('[article] cannot re-point ref:', err);
          row.classList.add('ref-option--error');
          setTimeout(() => row.classList.remove('ref-option--error'), 1000);
        }
      });

      groupRows.push(row);
    }

    if (groupRows.length) {
      const header = document.createElement('div');
      header.className = 'ref-group-header';
      header.textContent = sName;
      list.append(header, ...groupRows);
    }
  }

  pop.append(list);
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

// ---------------------------------------------------------------------------
// 5. Event wiring
// ---------------------------------------------------------------------------

document.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;

  if (activePopover && activePopover.contains(target)) return;

  const chip = target.closest<HTMLElement>('.token-chip');
  if (chip) {
    // Always (re)open: clicking the same chip while its popover is open
    // simply rebuilds the popover. Closing is via outside click or Escape.
    openPopover(chip);
    return;
  }

  closePopover();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closePopover();
});

window.addEventListener('scroll', () => {
  if (activePopover && activeChip) positionPopover(activePopover, activeChip);
}, { passive: true });

window.addEventListener('resize', () => {
  if (activePopover && activeChip) positionPopover(activePopover, activeChip);
});

// Reset button
document.getElementById('reset')?.addEventListener('click', () => {
  closePopover();
  for (const entry of defaults) {
    const scope = book.getScope(entry.scope);
    if (!scope) continue;
    if (entry.name.includes('.')) {
      // function option, e.g. "linkHover.amount"
      const [tokenName, optionName] = entry.name.split('.');
      const tok = scope.get(tokenName) as FunctionTokenValue | undefined;
      if (!tok || tok.type !== 'function') continue;
      const newOptions = { ...(tok.options ?? {}), [optionName]: entry.value };
      scope.set(tokenName, { ...tok, options: newOptions });
    } else {
      const tok = scope.get(entry.name) as TokenValue | undefined;
      if (!tok) continue;
      if (tok.type === 'color') {
        scope.set(entry.name, color(String(entry.value)));
      } else if (tok.type === 'dimension' && tok.metadata?.unit === 'px') {
        scope.set(entry.name, px(Number(entry.value)));
      } else {
        scope.set(entry.name, { ...tok, rawValue: entry.value } as TokenValue);
      }
    }
  }
});

// Close the popover when the chip it belongs to scrolls off-screen, so a
// stale popover never floats in the middle of the article.
function closePopoverIfChipOffScreen() {
  if (!activeChip) return;
  const rect = activeChip.getBoundingClientRect();
  if (rect.bottom < 0 || rect.top > window.innerHeight) {
    closePopover();
  }
}

window.addEventListener('scroll', closePopoverIfChipOffScreen, { passive: true });
window.addEventListener('resize', closePopoverIfChipOffScreen);

// ---------------------------------------------------------------------------
// 6. Boot
// ---------------------------------------------------------------------------

syncCss();
