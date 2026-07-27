/* live-test — token-beam receiver that themes a generic page via design-book.
 *
 * Colors beamed from any token-beam source land in the `beam` scope
 * (kept perceptually sorted via the scope's own order). The `ui` scope
 * derives every color the page actually uses — text, surfaces, borders,
 * accents — through design-book functions, and the whole book is rendered
 * to CSS custom properties on every change.
 */

import {
  DesignBook,
  color,
  ref,
  mostVivid,
  leastVivid,
  minContrastWith,
  bestContrastWith,
  furthestFrom,
  nth,
  colorMix,
  ramp,
} from '../src/index';

import {
  TargetSession,
  normalizeSessionToken,
  extractColorTokens,
} from 'token-beam';

// ── The book ─────────────────────────────────────────────────────

// Batch mode so a beamed palette applies as one atomic flush — derived
// tokens never resolve against a half-replaced scope.
const book = new DesignBook('live-test', { mode: 'batch' });

// Contrast anchors: the only two colors on the page that are not beamed
// or derived. They exist so text pickers always have a readable candidate
// even when the beamed palette is all mid-tones.
const base = book.addScope('base');
base.set('ink', color('#141414'));
base.set('paper', color('#fbfbf8'));

// Raw beamed palette — self-sorting, so swatches and positional picks
// (nth) follow a perceptually smooth order regardless of arrival order.
const beam = book.addScope('beam', { order: [{ by: 'value' }] });

// Candidate pool for contrast picking: the beamed palette plus the anchors.
const pool = book.addScope('pool', { extends: 'beam' });
pool.set('ink', ref('base.ink'));
pool.set('paper', ref('base.paper'));

// Every color the page uses, derived from the palette.
//
// Text colors are picked with minContrastWith from `pool`: among all
// candidates that clear the ratio it takes the LOWEST-contrast one — the
// most palette-flavored color that is still readable. The ink/paper
// anchors in the pool are the safety net: they only win when no beamed
// color clears the bar (e.g. an all-mid-tone palette).
const ui = book.addScope('ui');
// Background: a whisper-light ramp step OF the palette's most muted color
// — carries the palette's hue instead of defaulting to plain paper.
ui.set('bg-seed', leastVivid(beam));
ui.set('bg', ramp(ref('ui.bg-seed'), { shade: '100' }));
ui.set('card', ramp(ref('ui.bg-seed'), { shade: '50' }));
ui.set('text', minContrastWith(ref('ui.bg'), pool, { ratio: 7 }));
// Interaction color: the palette's most vivid, full stop. The text on it
// is the most READABLE pool candidate (bestContrastWith = max contrast) —
// and since the pool carries the ink/paper anchors, there is always a
// readable option even when the whole palette sits near the accent.
ui.set('accent', mostVivid(beam));
ui.set('accent-text', bestContrastWith(ref('ui.accent'), pool));
// A tonal ramp grown from the accent: deep step for hover, whisper-light
// steps for the panel wash — one received color becomes a whole family.
ui.set('accent-hover', ramp(ref('ui.accent'), { shade: '700' }));
ui.set('panel', ramp(ref('ui.accent'), { shade: '100' }));
ui.set('panel-border', ramp(ref('ui.accent'), { shade: '200' }));
ui.set('panel-text', minContrastWith(ref('ui.panel'), pool, { ratio: 4.5 }));
ui.set('border', colorMix(ref('ui.bg'), ref('ui.text'), { ratio: 0.18 }));
ui.set('muted', colorMix(ref('ui.bg'), ref('ui.text'), { ratio: 0.7 }));
ui.set('second', furthestFrom(beam));
ui.set('second-text', minContrastWith(ref('ui.second'), pool, { ratio: 4.5 }));
ui.set('chip-1', nth(beam, 0.15));
ui.set('chip-2', nth(beam, 0.5));
ui.set('chip-3', nth(beam, 0.85));
ui.set('code-bg', colorMix(ref('ui.card'), ref('ui.border'), { ratio: 0.45 }));
// Five consecutive ramp steps of the accent — the fake barchart's bars.
ui.set('ramp-1', ramp(ref('ui.accent'), { shade: '300' }));
ui.set('ramp-2', ramp(ref('ui.accent'), { shade: '400' }));
ui.set('ramp-3', ramp(ref('ui.accent'), { shade: '500' }));
ui.set('ramp-4', ramp(ref('ui.accent'), { shade: '600' }));
ui.set('ramp-5', ramp(ref('ui.accent'), { shade: '800' }));

// ── Palette application ──────────────────────────────────────────

function sanitizeKey(name: string, i: number): string {
  const key = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return key || `color-${i}`;
}

function applyPalette(colors: { name: string; hex: string }[]) {
  // First-wins dedupe (first mode of a multi-mode payload is the default).
  const incoming = new Map<string, string>();
  colors.forEach((c, i) => {
    let key = sanitizeKey(c.name, i);
    while (incoming.has(key)) key += '-b';
    incoming.set(key, c.hex);
  });
  if (incoming.size === 0) return; // never empty the scope

  // Set new/updated tokens first, delete leftovers after — the scope is
  // never empty mid-apply, so scope-iterating functions always have a pool.
  for (const [key, hex] of incoming) {
    try {
      beam.set(key, color(hex));
    } catch {
      /* unparseable color — skip token */
    }
  }
  for (const key of [...beam.getAllKeys()]) {
    if (!incoming.has(key)) beam.delete(key);
  }

  book.flush();
  renderAll();
}

// ── Render: book → CSS custom properties + swatch strip ─────────

const styleEl = document.createElement('style');
styleEl.id = 'live-vars';
document.head.appendChild(styleEl);

const paletteEl = document.getElementById('beam-palette')!;

function renderAll() {
  try {
    styleEl.textContent = book.render('css-variables');
  } catch (e) {
    console.warn('[live-test] render failed:', e);
    return;
  }

  paletteEl.innerHTML = '';
  for (const key of beam.getAllKeys()) {
    try {
      const hex = beam.resolve(key);
      const el = document.createElement('div');
      el.className = 'swatch';
      el.style.background = hex;
      el.title = `beam.${key} — ${hex}`;
      paletteEl.appendChild(el);
    } catch {
      /* unresolvable token — no swatch */
    }
  }
}

// Seed so the page has a theme before anything is beamed.
applyPalette([
  { name: 'porcelain', hex: '#e9e4d8' },
  { name: 'verdigris', hex: '#3e8e7e' },
  { name: 'marigold', hex: '#e8a13c' },
  { name: 'oxblood', hex: '#6d2331' },
  { name: 'nightshade', hex: '#2b2d42' },
]);

// ── token-beam session ───────────────────────────────────────────

const form = document.getElementById('beam-form') as HTMLFormElement;
const codeInput = document.getElementById('beam-code') as HTMLInputElement;
const dot = document.getElementById('beam-dot')!;
const stateLabel = document.getElementById('beam-state-label')!;

let session: TargetSession | null = null;

function setStatus(state: string, label: string) {
  dot.dataset.state = state;
  stateLabel.textContent = label;
}

async function connect(rawCode: string) {
  const sessionToken = normalizeSessionToken(rawCode);
  if (!sessionToken) {
    setStatus('error', 'invalid code — expected beam://XXXXXX');
    return;
  }

  session?.disconnect();
  // clientType is left at the library default ('receiver') — the sync
  // server routes payloads by role, so an unknown clientType pairs fine
  // but never receives sync messages.
  session = new TargetSession({
    sessionToken,
    origin: 'design-book live-test',
    icon: { type: 'unicode', value: '📖' },
  });

  session.on('state', ({ current }) => {
    const labels: Record<string, string> = {
      connecting: 'connecting…',
      connected: 'connected — waiting for source',
      paired: 'paired — waiting for tokens',
      disconnected: 'disconnected',
      error: 'connection error',
    };
    if (labels[current]) setStatus(current, labels[current]);
  });

  session.on('sync', ({ payload }) => {
    const colors = extractColorTokens(payload);
    if (colors.length === 0) {
      setStatus('paired', 'payload had no colors');
      return;
    }
    applyPalette(colors.map((c) => ({ name: c.token.name, hex: c.hex })));
    setStatus('paired', `receiving — ${beam.getAllKeys().length} colors`);
  });

  session.on('peer-disconnected', ({ clientType }) => {
    setStatus('connected', `source left (${clientType})`);
  });

  session.on('error', ({ message }) => setStatus('error', message));
  session.on('warning', ({ message }) => console.warn('[token-beam]', message));

  try {
    setStatus('connecting', 'connecting…');
    await session.connect();
    localStorage.setItem('live-test-beam-code', rawCode);
  } catch (e) {
    setStatus('error', e instanceof Error ? e.message : 'connection failed');
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const code = codeInput.value.trim();
  if (code) connect(code);
});

// Prefill the last-used code (no auto-connect — sessions expire).
const lastCode = localStorage.getItem('live-test-beam-code');
if (lastCode) codeInput.value = lastCode;
