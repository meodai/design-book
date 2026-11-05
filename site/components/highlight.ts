// Build-time highlighting for the code samples: plain JavaScript in,
// HTML out with the site's classes (marketing/docs.css):
//   c-dim  comments
//   c-str  strings
//   c-num  numbers, null, true, false, Infinity
//   c-fn   keywords and anything called: `set` in `ui.set(`
//   c-key  object keys: `ratio` in `{ ratio: 0.5 }`
// Everything else is left plain.

const KEYWORDS = new Set([
  'const', 'let', 'var', 'for', 'of', 'in', 'if', 'else', 'return', 'new',
  'function', 'import', 'from', 'export', 'await', 'async',
]);
const LITERALS = new Set(['null', 'true', 'false', 'undefined', 'Infinity', 'NaN']);

const TOKEN = new RegExp(
  [
    String.raw`(?<com>\/\/[^\n]*|\/\*[\s\S]*?\*\/)`,
    String.raw`(?<str>'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*")`,
    String.raw`(?<tpl>\`)`,
    String.raw`(?<re>\/(?![*/])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n\[])+\/[a-z]*)`,
    String.raw`(?<num>-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(?![\w$]))`,
    String.raw`(?<id>[A-Za-z_$][\w$]*)`,
  ].join('|'),
  'g',
);

const escape = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

const span = (cls: string, text: string) => `<span class="${cls}">${escape(text)}</span>`;

/** The class an identifier gets from what follows it (and what precedes it). */
function idClass(code: string, start: number, end: number, name: string): string | null {
  if (KEYWORDS.has(name)) return 'c-fn';
  if (LITERALS.has(name)) return 'c-num';
  const after = code.slice(end).match(/^\s*(.)/)?.[1];
  if (after === '(') return 'c-fn';
  // a key: `name:` but not the `b` of `a ? b : c`
  if (after === ':' && !/\?\s*$/.test(code.slice(0, start))) return 'c-key';
  return null;
}

/** Where a template literal that opens at `start` ends, and its HTML: the
 *  text parts as strings, each ${…} highlighted as code. */
function template(code: string, start: number): [number, string] {
  let out = '';
  let i = start + 1;
  let text = '`';
  while (i < code.length) {
    const ch = code[i];
    if (ch === '\\') { text += code.slice(i, i + 2); i += 2; continue; }
    if (ch === '`') { out += span('c-str', text + '`'); return [i + 1, out]; }
    if (ch === '$' && code[i + 1] === '{') {
      out += span('c-str', text + '${');
      text = '';
      let depth = 1;
      let j = i + 2;
      while (j < code.length && depth) {
        if (code[j] === '{') depth++;
        else if (code[j] === '}') depth--;
        j++;
      }
      out += highlight(code.slice(i + 2, j - 1));
      text = '}';
      i = j;
      continue;
    }
    text += ch;
    i++;
  }
  return [code.length, out + span('c-str', text)];
}

/** A slash starts a regex only where a value can start. */
const valueStarts = (before: string) => /(?:^|[(,=:[!&|?{};>]|\breturn)\s*$/.test(before);

export function highlight(code: string): string {
  let out = '';
  let last = 0;
  const tokens = new RegExp(TOKEN.source, 'g');
  for (let m = tokens.exec(code); m; m = tokens.exec(code)) {
    const start = m.index;
    const text = m[0];
    const g = m.groups!;
    if (g.tpl) {
      out += escape(code.slice(last, start));
      const [end, html] = template(code, start);
      out += html;
      last = end;
      tokens.lastIndex = end;
      continue;
    }
    if (g.re) {
      if (!valueStarts(code.slice(0, start))) {
        // a division: let the rest be tokenized after the slash
        tokens.lastIndex = start + 1;
        continue;
      }
      out += escape(code.slice(last, start)) + span('c-str', text);
      last = start + text.length;
      continue;
    }
    // a minus belongs to the number only where a value starts
    if (g.num && text.startsWith('-') && /[\w$)\]]\s*$/.test(code.slice(0, start))) {
      out += escape(code.slice(last, start + 1));
      out += span('c-num', text.slice(1));
      last = start + text.length;
      continue;
    }
    out += escape(code.slice(last, start));
    if (g.com) out += span('c-dim', text);
    else if (g.str) out += span('c-str', text);
    else if (g.num) out += span('c-num', text);
    else {
      const cls = idClass(code, start, start + text.length, text);
      out += cls ? span(cls, text) : escape(text);
    }
    last = start + text.length;
  }
  return out + escape(code.slice(last));
}

/** Slot text from `<Code is:raw>`: entities decoded, the first line break
 *  dropped, the common indent removed and the end trimmed. */
export function codeFromSlot(raw: string): string {
  const decoded = raw
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&');
  const lines = decoded.replace(/^\n/, '').replace(/\s+$/, '').split('\n');
  const indent = Math.min(
    ...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)![0].length),
  );
  return lines.map((l) => l.slice(indent)).join('\n');
}
