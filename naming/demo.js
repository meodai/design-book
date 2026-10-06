import "hdr-color-input";
import { converter, formatHex, toGamut, interpolate } from "culori";
import {
  DesignBook, color, px, nameValues, nameBetween, namingScheme, schemes,
} from "../src/index";

const $ = (id) => document.getElementById(id);
const toOklch = converter("oklch");
const toRgb = toGamut("rgb", "oklch");

// What each scheme accepts — mirrors the library's own option checks.
const CENTRE = { tshirt: "m", intensity: "mid", dynamics: "mf", weights: "regular" };
const NUMBERED = ["ordinal", "hundreds", "tones", "unit", "signed"];
const RANGES = ["hundreds", "tones", "unit", "signed"];
const PLAIN_LISTS = ["greek", "paper", "creatures", "objects"];
const NEVER_RUN_OUT = ["ordinal", "roman", "tshirt"];
const ABOUT = {
  ordinal: "1 2 3 … — or centred on 0 with a base",
  roman: "i ii iii iv …",
  greek: "alpha … omega (24)",
  paper: "a10 … a0 (11)",
  creatures: "tardigrade … whale (23)",
  objects: "atom … universe (100, each ≥ 15% bigger)",
  tshirt: "… xs s m l xl …, grows both ways",
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
  baseMode: "none", caseV: "lower", overflow: "throw", view: "colors",
  items: [], grown: [], scheme: null, opts: {}, baseIdx: -1,
};

// Scheme picker, grouped by default anchor.
for (const anchor of ["start", "base", "range"]) {
  const group = document.createElement("optgroup");
  group.label = `${anchor}-anchored`;
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

/** Which controls make sense for the current scheme. */
function applicable () {
  const s = schemeName();
  const customCentre = s === "custom" && $("custom-base").value.trim();
  return {
    centre: s in CENTRE || NUMBERED.includes(s) || Boolean(customCentre),
    pair: s !== "roman",
    fromTo: RANGES.includes(s),
    from: s === "ordinal",
    step: s === "ordinal",
    caseOpt: s === "roman",
    overflow: !NEVER_RUN_OUT.includes(s),
  };
}

function options (can) {
  const o = {};
  const n = Number($("base-index").value);
  if (state.baseMode === "centre" && can.centre) o.base = n;
  if (state.baseMode === "pair" && can.pair && $("base-name").value.trim()) o.base = [n, $("base-name").value.trim()];
  const centred = state.baseMode === "centre";
  if (can.fromTo && !centred) {
    if ($("from").value !== "") o.from = Number($("from").value);
    if ($("to").value !== "") o.to = Number($("to").value);
  }
  if (can.from && !centred && state.baseMode === "none" && $("from").value !== "") o.from = Number($("from").value);
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
  $("base-field").hidden = !can.centre && !can.pair;
  for (const b of $("base-mode").querySelectorAll("button")) {
    b.disabled = (b.dataset.mode === "centre" && !can.centre) || (b.dataset.mode === "pair" && !can.pair);
  }
  if ((state.baseMode === "centre" && !can.centre) || (state.baseMode === "pair" && !can.pair)) setSeg("base-mode", "none", "mode");
  $("base-controls").hidden = state.baseMode === "none";
  $("base-name").hidden = state.baseMode !== "pair";
  $("base-index").max = Math.max(0, Number($("count").value) - 1);
  $("base-index-val").textContent = $("base-index").value;
  const centreName = s in CENTRE ? CENTRE[s] : NUMBERED.includes(s) ? "0" : $("custom-base").value.trim();
  $("base-hint").textContent =
    state.baseMode === "centre" ? `value ${$("base-index").value} gets "${centreName}"` +
      (NUMBERED.includes(s) ? ", the rest count outward both ways" : "") :
    state.baseMode === "pair" ? (RANGES.includes(s) ? "a step inside the range, e.g. 500" :
      s === "ordinal" ? "a whole number, e.g. 10" : PLAIN_LISTS.includes(s) ? "a name from the list, e.g. cat" : "a name of the scheme") : "";
  const showFromTo = can.fromTo && state.baseMode !== "centre";
  const showFrom = can.from && state.baseMode === "none";
  $("range-field").hidden = !showFromTo && !showFrom;
  $("to").hidden = !showFromTo;
  $("range-lbl").textContent = showFromTo ? "from / to" : "from";
  $("step-field").hidden = !can.step;
  $("case-field").hidden = !can.caseOpt;
  $("overflow-field").hidden = !can.overflow;
  $("custom-field").hidden = s !== "custom";
  $("seed-field").hidden = state.view !== "colors";
}

function setSeg (id, value, key = "v") {
  for (const b of $(id).querySelectorAll("button")) b.classList.toggle("is-active", b.dataset[key] === value);
  if (id === "base-mode") state.baseMode = value;
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
    pairs = nameValues(values, scheme, o);
  } catch (e) {
    renderCode(def ? "myScheme" : `'${schemeName()}'`, o, def);
    showError(e);
  }
  state.opts = o;
  state.baseIdx = o.base === undefined ? -1 : Array.isArray(o.base) ? o.base[0] : o.base;
  if (state.baseIdx === -1 && schemeName() in CENTRE) {
    const centre = `${o.prefix ?? ""}${CENTRE[schemeName()]}${o.suffix ?? ""}`;
    state.baseIdx = pairs.findIndex(([n]) => n === centre);
  }
  state.items = pairs.map(([name, hex], i) => ({ name, hex, size: 4 * (i + 1), isNew: false, isBase: i === state.baseIdx }));
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
    $("base-name").value = { hundreds: "500", tones: "50", unit: "0_5", signed: "0", ordinal: "0", creatures: "cat", objects: "car" }[s] ?? (CENTRE[s] ?? "");
  }
  regenerate();
});
for (const [id, key] of [["case", "caseV"], ["overflow", "overflow"], ["view", "view"]]) {
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
