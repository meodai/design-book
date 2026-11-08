import { parse, formatHex, formatHex8 } from 'culori';
import type { DesignBook } from '../design-book';
import type { FunctionTokenValue, ReferenceValue } from '../tokens';
import { isScopeReference } from '../tokens';
import { isPaletteLinker, findResolvedSource } from './svg-renderer';

export interface ScaleViewOptions {
  fontSize?: number;
  /** Width of one step of a scale. */
  stepWidth?: number;
}

/** Where a role lands: the scale step it ends on, and how it got there. */
interface Landing {
  scope: string;
  role: string;
  /** `scale.step`, or null when the chain ends on no scale (a mix). */
  step: string | null;
  rule: string;
  color: string;
}

function hexOf(book: DesignBook, key: string): string {
  try {
    const parsed = parse(book.resolve(key));
    if (parsed) return ((parsed.alpha ?? 1) < 1 ? formatHex8(parsed) : formatHex(parsed)) ?? '#888888';
  } catch { /* unresolvable */ }
  return '#888888';
}

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** A scale view: instead of a line per dependency, each scale (a scope the
 *  others pick from) is drawn as a ruler of its steps, and each role (a
 *  token name the reading scopes share) is one row on it, with a chip under
 *  the step each reading scope's role landed on. A connection becomes a
 *  position; how the scopes differ shows as chips in different columns.
 *
 *  Scales and roles come from the book: a role's chain (references, a
 *  selector's pick) is followed until it lands in a scope nothing in it
 *  picks or refers out of: that scope is a scale. Roles that end on no
 *  scale (a mix, a value of their own) are listed at the end with their
 *  colors. Prototype: colors only. */
export class ScaleView {
  private book: DesignBook;
  private fontSize: number;
  private stepWidth: number;

  constructor(book: DesignBook, options: ScaleViewOptions = {}) {
    this.book = book;
    this.fontSize = options.fontSize ?? 12;
    this.stepWidth = options.stepWidth ?? 48;
  }

  /** Follows a key's chain (references, picks) within its own scope to
   *  the first step in another scope, and says how: the first rule on the
   *  way. One scope out: a context lands on the scale it picks from, not
   *  on whatever that scale is made of. */
  private land(key: string): { end: string; rule: string } {
    const book = this.book;
    const home = key.slice(0, key.indexOf('.'));
    const out = (k: string) => k.slice(0, k.indexOf('.')) !== home;
    let current = key;
    let rule = '';
    for (let hop = 0; hop < 12; hop++) {
      const token = book.getTokenByKey(current);
      if (!token) break;
      if (token.type === 'reference') {
        const target = (token as ReferenceValue).key;
        if (!rule) rule = `ref(${target.replace(`${home}.`, '.')})`;
        current = target;
        if (out(current)) break;
        continue;
      }
      if (token.type === 'function' && isPaletteLinker(book, token)) {
        const fn = token as FunctionTokenValue;
        const pool = fn.args.filter(isScopeReference).map(a => (a as ReferenceValue).key)
          .concat(fn.metadata?.iteratedScopes ?? []);
        if (!rule) rule = `${fn.name} · ${[...new Set(pool)].join(', ')}`;
        const picked = findResolvedSource(book, current, token);
        if (!picked) break;
        current = picked;
        if (out(current)) break;
        continue;
      }
      if (token.type === 'function' && !rule) rule = (token as FunctionTokenValue).name;
      break;
    }
    return { end: current, rule: rule || 'value' };
  }

  render(): string {
    const book = this.book;
    const { fontSize } = this;
    const scopes = book.getAllScopes();

    // Every token's landing; a scale is a scope something lands in while
    // nothing in it leads elsewhere.
    const landings: Landing[] = [];
    for (const scope of scopes) {
      for (const name of scope.getAllKeys()) {
        const key = `${scope.name}.${name}`;
        const { end, rule } = this.land(key);
        const lands = end !== key && end.slice(0, end.indexOf('.')) !== scope.name;
        landings.push({ scope: scope.name, role: name, step: lands ? end : null, rule, color: hexOf(book, key) });
      }
    }
    const scaleOf = (step: string) => step.slice(0, step.indexOf('.'));
    // Scales: the scopes things land on, the most landed on first.
    const landedOn = new Map<string, number>();
    for (const l of landings) if (l.step) landedOn.set(scaleOf(l.step), (landedOn.get(scaleOf(l.step)) ?? 0) + 1);
    const scales = [...landedOn].sort((a, b) => b[1] - a[1]).map(([name]) => name);
    const readers = scopes.map(s => s.name).filter(name => landings.some(l => l.scope === name && l.step));

    // Chips: per section, a short name per reading scope from what tells
    // it apart from the others there (context-weak among contexts → W).
    const chipsFor = (names: string[]) => {
      // A first word several of them share is dropped (context-weak → weak).
      const firstWord = (n: string) => (n.includes('-') ? n.slice(0, n.indexOf('-') + 1) : '');
      const shared = (n: string) => !!firstWord(n) && names.filter(m => firstWord(m) === firstWord(n)).length > 1;
      const chips = new Map<string, { chip: string; short: string }>();
      const used = new Set<string>();
      for (const r of names) {
        const short = shared(r) ? r.slice(firstWord(r).length) : r;
        let chip = short.slice(0, 1).toUpperCase();
        for (let n = 2; used.has(chip) && n <= short.length; n++) chip = short.slice(0, n).toUpperCase();
        used.add(chip);
        chips.set(r, { chip, short });
      }
      return chips;
    };

    const rowHeight = fontSize * 2;
    const chipWidth = fontSize * 1.4;
    const labelWidth = fontSize * 0.62 * Math.max(12, ...landings.map(l => l.role.length)) + 16;
    const ruleWidth = fontSize * 0.62 * Math.max(10, ...landings.map(l => l.rule.length)) * 0.85 + 16;
    const left = labelWidth + ruleWidth;
    const out: string[] = [];
    let y = 16;
    let width = 0;

    for (const scale of scales) {
      const here0 = landings.filter(l => l.step && scaleOf(l.step) === scale);
      const chips = chipsFor(readers.filter(r => here0.some(l => l.scope === r)));
      const chipOf = new Map([...chips].map(([r, c]) => [r, c.chip]));
      const steps = book.getScope(scale)!.getAllKeys();
      // Wide enough for the most chips one role puts on one step here.
      let most = 1;
      for (const step of steps) {
        const at = here0.filter(l => l.step === `${scale}.${step}`);
        for (const role of new Set(at.map(l => l.role))) most = Math.max(most, at.filter(l => l.role === role).length);
      }
      const stepWidth = Math.max(this.stepWidth, most * chipWidth + 6);
      const x0 = left + 16;
      width = Math.max(width, x0 + steps.length * stepWidth + 16);
      // Title and ruler.
      out.push(`<text class="sv-title" x="16" y="${y + fontSize}" font-size="${fontSize * 1.2}">${escapeXml(scale)}</text>`);
      const legend = [...chips.values()].map(c => `${c.chip} ${c.short}`).join('  ');
      out.push(`<text class="sv-legend" x="16" y="${y + fontSize * 2.4}" font-size="${fontSize * 0.8}">${escapeXml(legend)}</text>`);
      steps.forEach((step, i) => {
        const x = x0 + i * stepWidth;
        out.push(`<rect class="sv-swatch" x="${x}" y="${y}" width="${stepWidth}" height="${rowHeight}" fill="${hexOf(book, `${scale}.${step}`)}"/>`);
        out.push(`<text class="sv-step" x="${x + stepWidth / 2}" y="${y + rowHeight + fontSize + 2}" font-size="${fontSize * 0.85}" text-anchor="middle">${escapeXml(step)}</text>`);
      });
      y += rowHeight + fontSize * 2;

      // Roles landing on this scale, in book order, each once.
      const roles: string[] = [];
      for (const l of landings) {
        if (l.step && scaleOf(l.step) === scale && readers.includes(l.scope) && !roles.includes(l.role)) roles.push(l.role);
      }
      const top = y;
      for (const role of roles) {
        const here = landings.filter(l => l.role === role && l.step && scaleOf(l.step) === scale && readers.includes(l.scope));
        const rule = here[0].rule;
        out.push(`<rect class="sv-row" x="0" y="${y}" width="100%" height="${rowHeight}"/>`);
        out.push(`<text class="sv-role" x="16" y="${y + rowHeight / 2 + fontSize / 3}" font-size="${fontSize}">${escapeXml(role)}</text>`);
        out.push(`<text class="sv-rule" x="${labelWidth}" y="${y + rowHeight / 2 + fontSize / 3}" font-size="${fontSize * 0.85}">${escapeXml(rule)}</text>`);
        // Chips per step.
        const byStep = new Map<string, Landing[]>();
        for (const l of here) {
          const list = byStep.get(l.step!);
          if (list) list.push(l);
          else byStep.set(l.step!, [l]);
        }
        for (const [step, list] of byStep) {
          const i = steps.indexOf(step.slice(scale.length + 1));
          if (i < 0) continue;
          const cx = x0 + i * stepWidth + stepWidth / 2;
          const total = list.length * chipWidth;
          list.forEach((l, k) => {
            const x = cx - total / 2 + k * chipWidth;
            out.push(`<g class="sv-chip"><title>${escapeXml(`${l.scope}.${l.role} → ${step}`)}</title>`
              + `<rect x="${x + 1}" y="${y + 4}" width="${chipWidth - 2}" height="${rowHeight - 8}" fill="${l.color}"/>`
              + `<text x="${x + chipWidth / 2}" y="${y + rowHeight / 2 + fontSize / 3}" font-size="${fontSize * 0.75}" text-anchor="middle" style="fill: ${contrastInk(l.color)}">${escapeXml(chipOf.get(l.scope)!)}</text></g>`);
          });
        }
        y += rowHeight;
      }
      // Column guides behind the rows.
      out.push(`<g class="sv-guides">${steps.map((_, i) => `<line x1="${x0 + i * stepWidth}" y1="${top}" x2="${x0 + i * stepWidth}" y2="${y}"/>`).join('')}<line x1="${x0 + steps.length * stepWidth}" y1="${top}" x2="${x0 + steps.length * stepWidth}" y2="${y}"/></g>`);
      y += rowHeight * 1.5;
    }

    // Roles that land on no scale.
    const loose = landings.filter(l => !l.step && readers.includes(l.scope));
    if (loose.length) {
      out.push(`<text class="sv-title" x="16" y="${y + fontSize}" font-size="${fontSize * 1.2}">their own values</text>`);
      y += rowHeight;
      for (const l of loose) {
        out.push(`<rect x="16" y="${y + 4}" width="${rowHeight - 8}" height="${rowHeight - 8}" fill="${l.color}" class="sv-loose"/>`);
        out.push(`<text class="sv-role" x="${16 + rowHeight}" y="${y + rowHeight / 2 + fontSize / 3}" font-size="${fontSize}">${escapeXml(`${l.scope}.${l.role}`)}</text>`);
        out.push(`<text class="sv-rule" x="${labelWidth + ruleWidth / 2}" y="${y + rowHeight / 2 + fontSize / 3}" font-size="${fontSize * 0.85}">${escapeXml(l.rule)}</text>`);
        y += rowHeight;
      }
    }

    width = Math.max(width, 600);
    const style = `<style>
svg { --surface: var(--c-surface, #fff); --on-surface: var(--c-surface-on, #292f2f); --font: var(--font-mono, 'Iosevka Web', ui-monospace, monospace); }
text { font-family: var(--font); fill: var(--on-surface); }
.sv-title { font-weight: 600; }
.sv-rule, .sv-step, .sv-legend { opacity: 0.6; }
.sv-swatch { stroke: var(--on-surface); stroke-width: 0.5; }
.sv-row { fill: none; stroke: var(--on-surface); stroke-opacity: 0.12; }
.sv-guides line { stroke: var(--on-surface); stroke-opacity: 0.08; }
.sv-chip rect, .sv-loose { stroke: var(--on-surface); stroke-width: 0.75; }
</style>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.ceil(width)} ${Math.ceil(y)}" width="${Math.ceil(width)}" height="${Math.ceil(y)}">${style}${out.join('')}</svg>`;
  }
}

/** Black or white, whichever reads on the fill. */
function contrastInk(hex: string): string {
  const parsed = parse(hex);
  if (!parsed) return '#000';
  const rgb = parsed as { r?: number; g?: number; b?: number };
  const l = 0.2126 * (rgb.r ?? 0) + 0.7152 * (rgb.g ?? 0) + 0.0722 * (rgb.b ?? 0);
  return l > 0.5 ? '#000' : '#fff';
}
