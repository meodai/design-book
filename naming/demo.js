import "hdr-color-input";
import { converter, formatHex, toGamut, interpolate } from "culori";
import {
  DesignBook, color, px, nameValues, nameBetween, namingScheme, schemes,
} from "../src/index";

const $ = (id) => document.getElementById(id);
const toOklch = converter("oklch");
const toRgb = toGamut("rgb", "oklch");

// What each scheme and strategy accepts — mirrors the library's own checks.
const RANGES = ["hundreds", "tones", "unit", "signed"];
const OPEN_ENDED = ["ordinal", "roman", "tshirt"];
const LISTS = ["greek", "paper", "creatures", "objects", "intensity", "dynamics", "weights", "custom"];
const ANCHOR_ABOUT = {
  start: "consecutive steps up from a first name (from, step)",
  base: "consecutive steps both ways from a centre (base, step)",
  range: "both ends fixed, spread evenly between (from, to, a pinned [n, name], overflow)",
};
const ABOUT = {
  ordinal: "1 2 3 … — open-ended, centre 0",
  roman: "i ii iii iv …",
  greek: "alpha … omega (24)",
  paper: "a10 … a0 (11)",
  creatures: "tardigrade … whale (23, by size)",
  objects: "atom … universe (100, each ≥ 15% bigger)",
  things: "nothing glitter pinhead … cup … car … earth (21, a ladder for UI sizes)",
  value: "each value named by its own number (fed an irregular px scale here)",
  tshirt: "… xs s m l xl … — open-ended, centre m",
  intensity: "hint … mid … intense",
  dynamics: "ppp … mf … fff",
  weights: "thin … regular … black",
  hundreds: "50 … 950",
  tones: "0 … 100",
  unit: "0 … 1",
  signed: "-1 … 1",
  custom: "your own list",
};

const state = {
  baseMode: "none", anchor: "default", caseV: "lower", overflow: "throw", view: "colors",
  items: [], grown: [], scheme: null, opts: {}, baseIdx: -1,
};

// Scheme picker, grouped by default strategy.
for (const anchor of ["start", "base", "range"]) {
  const group = document.createElement("optgroup");
  group.label = `default: ${anchor}`;
  for (const [name, s] of Object.entries(schemes)) if (s.anchor === anchor) group.append(new Option(name, name));
  $("scheme").append(group);
}
$("scheme").append(new Option("custom (namingScheme)", "custom"));
$("scheme").value = "hundreds";
$("seed").value = $("seed").getAttribute("value");

function schemeName () { return $("scheme").value; }

function currentScheme () {
  const name = schemeName();
  if (name !== "custom") return { scheme: name, label: `'${name}'` };
  const names = $("custom").value.split(/[\s,]+/).filter(Boolean);
  const centre = $("custom-base").value.trim();
  return {
    scheme: namingScheme(names, centre ? { base: centre } : {}),
    label: "myScheme",
    define: `const myScheme = namingScheme([${names.map((n) => `'${n}'`).join(", ")}]${centre ? `, { base: '${centre}' }` : ""});`,
  };
}

/** The strategy the library will use — the same rule scaleNames applies:
 *  explicit anchor, else a bare base index → base, a pinned name → range on
 *  vocabularies with ends and base on open-ended ones, else the default. */
function effectiveAnchor () {
  const s = schemeName();
  if (state.anchor !== "default") return state.anchor;
  if (state.baseMode === "centre") return "base";
  if (state.baseMode === "pair" && $("base-name").value.trim()) return OPEN_ENDED.includes(s) ? "base" : "range";
  if (s !== "custom") return schemes[s].anchor;
  try { return currentScheme().scheme.anchor; } catch { return "start"; }
}

/** Which controls make sense for the current scheme and strategy. */
function applicable () {
  const s = schemeName();
  const a = effectiveAnchor();
  const explicit = state.anchor !== "default";
  if (s === "value") return { anchor: "start", centre: false, pair: false, from: false, to: false, step: false, caseOpt: false, overflow: false, valueOnly: true };
  return {
    anchor: a,
    centre: !explicit || a === "base",
    pair: !(explicit && a === "start"),
    from: a === "start" || a === "range",
    to: a === "range",
    step: a === "start" || a === "base",
    caseOpt: s === "roman",
    overflow: (a === "range" && !OPEN_ENDED.includes(s)) || (a === "start" && LISTS.includes(s)),
  };
}

/** A from/to field: numbers as numbers, names as strings. */
const fieldValue = (id) => {
  const v = $(id).value.trim();
  return v === "" ? undefined : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
};

function options (can) {
  const o = {};
  if (state.anchor !== "default") o.anchor = state.anchor;
  const n = Number($("base-index").value);
  if (state.baseMode === "centre" && can.centre) o.base = n;
  if (state.baseMode === "pair" && can.pair && $("base-name").value.trim()) o.base = [n, $("base-name").value.trim()];
  if (can.from && fieldValue("from") !== undefined) o.from = fieldValue("from");
  if (can.to && fieldValue("to") !== undefined) o.to = fieldValue("to");
  if (can.step && $("step").value !== "") o.step = Number($("step").value);
  if (can.caseOpt && state.caseV === "upper") o.case = "upper";
  if (can.overflow && state.overflow === "between") o.overflow = "between";
  if ($("prefix").value) o.prefix = $("prefix").value;
  if ($("suffix").value) o.suffix = $("suffix").value;
  return o;
}

const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
function fmtValue (v) {
  if (Array.isArray(v)) return `[${v[0]}, <span class="s">'${esc(v[1])}'</span>]`;
  return typeof v === "string" ? `<span class="s">'${esc(v)}'</span>` : String(v);
}
function fmtOptions (o) {
  const parts = Object.entries(o).map(([k, v]) => `<span class="k">${k}</span>: ${fmtValue(v)}`);
  return parts.length ? `, { ${parts.join(", ")} }` : "";
}

/** n colors light → dark through the seed, in OKLCH. */
function ramp (n, seedHex) {
  const seed = toOklch(seedHex) ?? { l: 0.5, c: 0.1, h: 250 };
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const c = (seed.c ?? 0.1) * Math.sin(Math.PI * Math.min(1, Math.max(0, t * 0.9 + 0.05)));
    return formatHex(toRgb({ mode: "oklch", l: 0.97 - t * 0.82, c, h: seed.h ?? 0 }));
  });
}

function syncControls (can) {
  const s = schemeName();
  $("count-val").textContent = $("count").value;
  $("scheme-hint").textContent = ABOUT[s] ?? "";
  $("anchor-hint").textContent = can.valueOnly ? "the values are the names — no strategy" : `${can.anchor}: ${ANCHOR_ABOUT[can.anchor]}`;
  $("anchor").closest(".field").hidden = Boolean(can.valueOnly);
  $("base-field").hidden = !can.centre && !can.pair;
  for (const b of $("base-mode").querySelectorAll("button")) {
    b.disabled = (b.dataset.mode === "centre" && !can.centre) || (b.dataset.mode === "pair" && !can.pair);
  }
  if ((state.baseMode === "centre" && !can.centre) || (state.baseMode === "pair" && !can.pair)) setSeg("base-mode", "none", "mode");
  $("base-controls").hidden = state.baseMode === "none";
  $("base-name").hidden = state.baseMode !== "pair";
  $("base-index").max = Math.max(0, Number($("count").value) - 1);
  $("base-index-val").textContent = $("base-index").value;
  let centreName = "";
  try { centreName = scaleNamesSafe(1, { anchor: "base" })[0]; } catch { /* roman: no centre */ }
  $("base-hint").textContent =
    state.baseMode === "centre" ? (centreName ? `value ${$("base-index").value} gets "${centreName}", the rest step outward` : "this scheme has no centre — use [n, name]") :
    state.baseMode === "pair" ? (RANGES.includes(s) ? "a step inside the range, e.g. 500" :
      s === "ordinal" ? "a whole number, e.g. 10" : s === "roman" ? "a numeral, e.g. v" : "a name of the scheme, e.g. cat") : "";
  $("range-field").hidden = !can.from;
  $("to").hidden = !can.to;
  $("range-lbl").textContent = can.to ? "from / to" : "from";
  $("from").placeholder = RANGES.includes(s) || s === "ordinal" || s === "roman" ? "from (number)" : "from (name)";
  $("to").placeholder = RANGES.includes(s) || s === "ordinal" || s === "roman" ? "to (number)" : "to (name)";
  $("step-field").hidden = !can.step;
  $("case-field").hidden = !can.caseOpt;
  $("overflow-field").hidden = !can.overflow;
  $("custom-field").hidden = s !== "custom";
  $("seed-field").hidden = state.view !== "colors";
}

function scaleNamesSafe (count, extra) {
  const { scheme } = currentScheme();
  return nameValues(Array.from({ length: count }), scheme, extra).map(([n]) => n);
}

function setSeg (id, value, key = "v") {
  for (const b of $(id).querySelectorAll("button")) b.classList.toggle("is-active", b.dataset[key] === value);
  if (id === "base-mode") state.baseMode = value;
}

/** An irregular px scale for the "value" scheme: 1 2 3 4 6 8 9 12 16 … */
function sizesFor (n) {
  const base = [1, 2, 3, 4, 6, 8, 9, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128];
  return Array.from({ length: n }, (_, i) => base[i] ?? base[base.length - 1] + (i - base.length + 1) * 32);
}

function regenerate () {
  const can = applicable();
  syncControls(can);
  const o = options(can);
  const count = Number($("count").value);
  const values = ramp(count, $("seed").value || "#2d60a5");

  showError(null);
  let pairs = [];
  let def;
  try {
    const { scheme, label, define } = currentScheme();
    def = define;
    state.scheme = scheme;
    renderCode(label, o, define);
    // "value" names each value by its own number, so it is fed the sizes
    // (an irregular hairline scale) rather than the colors.
    pairs = scheme === "value"
      ? nameValues(sizesFor(count).map((n) => `${n}px`), "value", o).map(([n], i) => [n, values[i]])
      : nameValues(values, scheme, o);
  } catch (e) {
    renderCode(def ? "myScheme" : `'${schemeName()}'`, o, def);
    showError(e);
  }
  state.opts = o;
  state.baseIdx = o.base === undefined ? -1 : Array.isArray(o.base) ? o.base[0] : o.base;
  const CENTRES = { tshirt: "m", intensity: "mid", dynamics: "mf", weights: "regular" };
  if (state.baseIdx === -1 && CENTRES[schemeName()] && effectiveAnchor() !== "start") {
    const centre = `${o.prefix ?? ""}${CENTRES[schemeName()]}${o.suffix ?? ""}`;
    state.baseIdx = pairs.findIndex(([n]) => n === centre);
  }
  const sizes = schemeName() === "value" ? sizesFor(count) : null;
  state.items = pairs.map(([name, hex], i) => ({ name, hex, size: sizes ? sizes[i] : 4 * (i + 1), isNew: false, isBase: i === state.baseIdx }));
  state.grown = [];
  draw();
}

function renderCode (label, o, define) {
  const target = state.view === "colors" ? "color(value)" : "px(value)";
  $("code").innerHTML =
    (define ? `${esc(define).replace(/'([^']*)'/g, '<span class="s">\'$1\'</span>').replace("namingScheme", '<span class="f">namingScheme</span>')}\n` : "") +
    `<span class="k">for</span> (<span class="k">const</span> [name, value] <span class="k">of</span> ` +
    `<span class="f">nameValues</span>(values, ${label.startsWith("'") ? `<span class="s">${label}</span>` : label}${fmtOptions(o)})) {\n` +
    `  scale.<span class="f">set</span>(name, <span class="f">${target.split("(")[0]}</span>(value));\n}`;
}

function showError (e) {
  $("error").hidden = !e;
  if (e) $("error").textContent = `${e.name}: ${e.message}`;
}

function draw () {
  const added = state.items.filter((it) => it.isNew).length;
  $("meta").textContent = state.items.length
    ? `${state.items.length} names${added ? ` · ${added} inserted with nameBetween` : ""}`
    : "";

  const tiles = $("tiles");
  tiles.className = `tiles ${state.view}`;
  tiles.innerHTML = "";
  state.items.forEach((it, i) => {
    if (i > 0) {
      const g = document.createElement("div");
      g.className = "grow";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = "+";
      btn.title = `Keep these names and insert nameBetween('${bare(state.items[i - 1].name)}', '${bare(it.name)}')`;
      btn.addEventListener("click", () => grow(i));
      g.append(btn);
      tiles.append(g);
    }
    const t = document.createElement("div");
    t.className = `tile${it.isBase ? " is-base" : ""}${it.isNew ? " is-new" : ""}`;
    if (state.view === "colors") {
      t.style.background = it.hex;
      t.style.color = (toOklch(it.hex)?.l ?? 0.5) > 0.62 ? "#1d1c1c" : "#fcf6ee";
      t.innerHTML = `<span class="name"></span><span>${it.hex}</span>`;
    } else {
      const size = 16 + it.size * 3;
      t.style.width = `${Math.max(84, size)}px`;
      t.style.height = `${size + 40}px`;
      t.innerHTML = `<span class="name"></span><span>${+it.size.toFixed(2)}px</span>`;
    }
    t.querySelector(".name").textContent = it.name;
    tiles.append(t);
  });

  $("rerun").hidden = added === 0;
  $("rerun").textContent = `Re-run with ${state.items.length} names instead`;
  $("grown").innerHTML = state.grown.map((l) => `<li>${esc(l)}</li>`).join("");

  try {
    const book = new DesignBook("naming-demo");
    const scale = book.addScope("scale");
    for (const it of state.items) scale.set(it.name, state.view === "colors" ? color(it.hex) : px(+it.size.toFixed(2)));
    $("css").textContent = state.items.length ? book.render("css-variables") : "/* no names */";
  } catch (e) {
    $("css").textContent = `/* ${e.message} */`;
  }
}

/** nameBetween takes bare names: strip the prefix/suffix the scale added. */
function bare (n) {
  const p = state.opts.prefix ?? "", x = state.opts.suffix ?? "";
  return n.slice(p.length, x ? n.length - x.length : undefined);
}

function grow (i) {
  const a = state.items[i - 1], b = state.items[i];
  const call = `nameBetween('${bare(a.name)}', '${bare(b.name)}')`;
  try {
    const name = `${state.opts.prefix ?? ""}${nameBetween(bare(a.name), bare(b.name), state.scheme)}${state.opts.suffix ?? ""}`;
    const hex = formatHex(interpolate([a.hex, b.hex], "oklab")(0.5));
    state.items.splice(i, 0, { name, hex, size: (a.size + b.size) / 2, isNew: true, isBase: false });
    state.grown.unshift(`${call} → '${name}'`);
    showError(null);
  } catch (e) {
    state.grown.unshift(`${call} → ${e.message}`);
    showError(e);
  }
  state.grown = state.grown.slice(0, 10);
  draw();
}

// Wiring
$("rerun").addEventListener("click", () => {
  $("count").max = Math.max(Number($("count").max), state.items.length);
  $("count").value = state.items.length;
  regenerate();
});
$("base-mode").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-mode]");
  if (!b || b.disabled) return;
  setSeg("base-mode", b.dataset.mode, "mode");
  if (b.dataset.mode === "pair" && !$("base-name").value) {
    const s = schemeName();
    $("base-name").value = { hundreds: "500", tones: "50", unit: "0_5", signed: "0", ordinal: "0", roman: "v", creatures: "cat", objects: "car", tshirt: "m", intensity: "mid", dynamics: "mf", weights: "regular", greek: "mu", paper: "a4" }[s] ?? "";
  }
  regenerate();
});
for (const [id, key] of [["anchor", "anchor"], ["case", "caseV"], ["overflow", "overflow"], ["view", "view"]]) {
  $(id).addEventListener("click", (e) => {
    const b = e.target.closest("button[data-v]");
    if (!b) return;
    state[key] = b.dataset.v;
    setSeg(id, b.dataset.v);
    if (id === "view") { syncControls(applicable()); renderCode(currentSchemeLabel(), state.opts); draw(); }
    else regenerate();
  });
}
function currentSchemeLabel () { return schemeName() === "custom" ? "myScheme" : `'${schemeName()}'`; }
$("scheme").addEventListener("change", () => { $("base-name").value = ""; $("from").value = ""; $("to").value = ""; regenerate(); });
for (const id of ["count", "base-index", "base-name", "from", "to", "step", "custom", "custom-base", "prefix", "suffix"]) {
  $(id).addEventListener("input", regenerate);
}
$("seed").addEventListener("input", regenerate);
$("seed").addEventListener("change", regenerate);
regenerate();
