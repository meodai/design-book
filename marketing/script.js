// ════════════════════════════════════════════════════════════════════
// Design Book — Marketing page demos
// Real implementations of the six selector functions, run live in the
// browser. Colors are computed with culori; logic mirrors the library.
// ════════════════════════════════════════════════════════════════════

import {
  parse,
  formatHex,
  converter,
  wcagContrast,
  differenceEuclidean,
} from "https://esm.sh/culori@4?bundle";

import "hdr-color-input";

const toOklab  = converter("oklab");
const toOklch  = converter("oklch");

const hex = (c) => formatHex(c);
const lab = (c) => toOklab(parse(c));
const lch = (c) => toOklch(parse(c));

// — Distance in OKLab (perceptual) —
function deltaE(a, b) {
  const A = lab(a), B = lab(b);
  return Math.hypot(A.l - B.l, A.a - B.a, A.b - B.b);
}

// — Contrast: WCAG 2.1 ratio —
function contrast(a, b) {
  return wcagContrast(a, b);
}

// — bestContrastWith implementation —
function bestContrastWith(target, scope, { not = [] } = {}) {
  let best = null, bestRatio = -Infinity;
  for (const c of scope) {
    if (not.includes(c)) continue;
    const r = contrast(target, c);
    if (r > bestRatio) { bestRatio = r; best = c; }
  }
  return { color: best, ratio: bestRatio };
}

// — minContrastWith implementation —
function minContrastWith(target, scope, { threshold = 0, not = [] } = {}) {
  let best = null, bestRatio = Infinity;
  for (const c of scope) {
    if (not.includes(c)) continue;
    const r = contrast(target, c);
    if (r >= threshold && r < bestRatio) { bestRatio = r; best = c; }
  }
  return { color: best, ratio: bestRatio };
}

// — closestColor implementation (OKLab) —
function closestColor(target, scope, { not = [] } = {}) {
  const ranked = scope
    .filter((c) => !not.includes(c))
    .map((c) => ({ color: c, d: deltaE(target, c) }))
    .sort((a, b) => a.d - b.d);
  return ranked;
}

// — furthestFrom implementation —
function furthestFrom(anchor, scope) {
  let best = null, bestD = -Infinity;
  for (const c of scope) {
    if (c === anchor) continue;
    const d = deltaE(anchor, c);
    if (d > bestD) { bestD = d; best = c; }
  }
  return { color: best, d: bestD };
}

// — averageColor implementation (OKLab) —
function averageColor(scope) {
  let l = 0, a = 0, b = 0, n = 0;
  for (const c of scope) {
    const L = lab(c);
    l += L.l; a += L.a; b += L.b; n++;
  }
  return hex({ mode: "oklab", l: l / n, a: a / n, b: b / n });
}

// — mostVivid implementation (highest chroma in OKLCh) —
function mostVivid(scope) {
  let best = null, bestC = -Infinity;
  for (const c of scope) {
    const C = lch(c).c;
    if (C > bestC) { bestC = C; best = c; }
  }
  return { color: best, chroma: bestC };
}

// ── Palettes ────────────────────────────────────────────────────────
// A single primary palette used across most demos so the page reads
// as one cohesive document. A few demos use specific sets.

const PALETTE_BRAND = [
  "#14110d", // ink
  "#c8391a", // vermilion
  "#d49623", // saffron
  "#4f6033", // moss
  "#1c3a9a", // lapis
  "#7a3c8e", // plum
  "#dcd2b8", // bone
  "#1d6b6a", // teal
];

const PALETTE_CONTRAST_SURFACES = [
  "#14110d", // ink
  "#ece5d3", // paper
  "#c8391a", // vermilion
  "#1c3a9a", // lapis
  "#4f6033", // moss
  "#d49623", // saffron
];

// ── Year in footer ──────────────────────────────────────────────────
(function setYear () {
  const yEl = document.getElementById("year");
  if (yEl) yEl.textContent = new Date().getFullYear();
})();

// ── I. bestContrastWith ─────────────────────────────────────────────
(function demoContrast () {
  const row = document.getElementById("demo-contrast");
  const pal = document.getElementById("demo-contrast-palette");
  if (!row) return;

  const surfaces = PALETTE_CONTRAST_SURFACES;
  const palette  = PALETTE_BRAND;

  row.innerHTML = surfaces.map((surface) => {
    const { color: text, ratio } = bestContrastWith(surface, palette);
    return `
      <div class="contrast-tile" style="background:${surface};color:${text}">
        <span class="ctop">surface ${surface}</span>
        <span class="cbig">Aa</span>
        <span class="cbottom">${text} · ${ratio.toFixed(1)}:1</span>
      </div>
    `;
  }).join("");

  pal.innerHTML = palette.map((c) =>
    `<span style="background:${c}" title="${c}"></span>`
  ).join("");
})();

// ── II. closestColor (interactive) ──────────────────────────────────
(function demoClosest () {
  const palette = PALETTE_BRAND;
  const swatchHost = document.getElementById("closest-target-swatch");
  const hexEl = document.getElementById("closest-target-hex");
  const stage = document.getElementById("closest-ranked");

  // Replace static swatch with an hdr-color-input — click to open picker.
  const picker = document.createElement("color-input");
  picker.value = "#7f4dc4";
  picker.setAttribute("no-alpha", "");
  picker.className = "closest-picker";
  swatchHost.replaceWith(picker);
  picker.id = "closest-target-swatch";

  function render (target) {
    hexEl.textContent = target;
    const ranked = closestColor(target, palette).slice(0, 7);
    stage.innerHTML = ranked.map((r, i) => `
      <div class="rank${i === 0 ? " winner" : ""}"
           style="background:${r.color}"
           title="ΔE ${r.d.toFixed(3)}">
        <span class="num">${i + 1}</span>
        <span>${r.color}</span>
      </div>
    `).join("");
  }

  picker.addEventListener("change", () => {
    if (!picker.value) return;
    try { render(picker.value); }
    catch (e) { /* invalid color — ignore */ }
  });

  render(picker.value);
})();

// ── III. furthestFrom ───────────────────────────────────────────────
(function demoFurthest () {
  const stage = document.getElementById("furthest-stage");
  const readout = document.getElementById("furthest-readout");
  if (!stage) return;

  const palette = PALETTE_BRAND.slice(0, 7);
  let anchor = palette[1]; // vermilion to start

  function render () {
    const { color: far, d } = furthestFrom(anchor, palette);
    stage.innerHTML = palette.map((c) => {
      const cls = [];
      if (c === anchor) cls.push("anchor");
      if (c === far)    cls.push("furthest");
      return `
        <div class="swatch-fr ${cls.join(" ")}"
             data-c="${c}"
             style="background:${c}">
          <span class="hex">${c}</span>
        </div>
      `;
    }).join("");

    readout.innerHTML = `
      <span>anchor <b>${anchor}</b></span>
      <span>furthest <b>${far}</b></span>
      <span>ΔE <b>${d.toFixed(3)}</b></span>
    `;

    // attach hover handlers
    stage.querySelectorAll(".swatch-fr").forEach((el) => {
      el.addEventListener("mouseenter", () => {
        anchor = el.dataset.c;
        render();
      });
    });
  }
  render();
})();

// ── IV. minContrastWith ─────────────────────────────────────────────
(function demoMin () {
  const surface = "#ece5d3";       // paper
  // A ramp of neutrals from light → dark so each threshold finds a
  // distinct quietest member.
  const ramp = [
    "#ece5d3", "#d5cdb5", "#beb497", "#9c907a",
    "#766b5b", "#564f44", "#3a342c", "#14110d",
  ];

  function paint (id, threshold) {
    const el = document.getElementById(id);
    const { color, ratio } = minContrastWith(surface, ramp, { threshold });
    if (!color || !isFinite(ratio)) {
      el.classList.add("fail");
      el.style.background = surface;
      el.querySelector(".min-text").style.color = surface;
      el.querySelector(".min-text").textContent = "—";
      return;
    }
    el.style.background = surface;
    el.querySelector(".min-text").style.color = color;
    el.querySelector(".min-text").innerHTML =
      `Aa — Body, caption, label.<br>
       <span style="font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.04em;opacity:.75">
         ${color} · ${ratio.toFixed(1)}:1
       </span>`;
  }

  paint("min-sample-3",  3);
  paint("min-sample-45", 4.5);
  paint("min-sample-7",  7);
})();

// ── V. averageColor ────────────────────────────────────────────────
(function demoAverage () {
  const reroll = document.getElementById("reroll-avg");
  const inputsEl = document.getElementById("avg-inputs");
  const swatch = document.getElementById("avg-swatch");
  const hexEl = document.getElementById("avg-hex");

  // a curated set of pleasing palettes to cycle through
  const SETS = [
    ["#c8391a","#d49623","#1c3a9a","#4f6033","#7a3c8e","#1d6b6a"],
    ["#f2c14e","#f78154","#b4436c","#4d9078","#1d3557","#fef9ef"],
    ["#0b3954","#087e8b","#bfd7ea","#ff5a5f","#c81d25","#fff8f0"],
    ["#264653","#2a9d8f","#e9c46a","#f4a261","#e76f51","#dad7cd"],
    ["#003049","#d62828","#f77f00","#fcbf49","#eae2b7","#7fb069"],
    ["#1a535c","#4ecdc4","#f7fff7","#ff6b6b","#ffe66d","#7a4f9e"],
  ];

  let idx = 0;
  function render () {
    const palette = SETS[idx % SETS.length];
    inputsEl.innerHTML = palette
      .map((c) => `<span style="background:${c}"></span>`)
      .join("");
    const avg = averageColor(palette);
    swatch.style.background = avg;
    hexEl.textContent = avg;
  }
  render();
  reroll?.addEventListener("click", () => { idx++; render(); });
})();

// ── nextLarger / nextSmaller ───────────────────────────────────────
function nextLargerLocal(target, scope, minDistance = 0) {
  let best = null;
  for (const v of scope) {
    if (v <= target + minDistance) continue;
    if (best === null || v < best) best = v;
  }
  return best;
}
function nextSmallerLocal(target, scope, minDistance = 0) {
  let best = null;
  for (const v of scope) {
    if (v >= target - minDistance) continue;
    if (best === null || v > best) best = v;
  }
  return best;
}

(function demoStep () {
  const scale = [4, 8, 12, 16, 24, 32, 48]; // px
  const scaleEl = document.getElementById("step-scale");
  if (!scaleEl) return;

  const targetSlider = document.getElementById("step-target");
  const targetVal   = document.getElementById("step-target-val");
  const minSlider   = document.getElementById("step-min");
  const minVal      = document.getElementById("step-min-val");
  const targetOut   = document.getElementById("step-target-out");
  const largerOut   = document.getElementById("step-larger");
  const smallerOut  = document.getElementById("step-smaller");
  const largerCell  = largerOut.parentElement;
  const smallerCell = smallerOut.parentElement;

  // Build the bars once
  const max = Math.max(...scale);
  scaleEl.innerHTML = scale.map((v, i) => `
    <span class="bar" data-i="${i}" style="height:${(v / max) * 100}%">
      <span class="lbl">${v}px</span>
    </span>
  `).join("");

  scaleEl.querySelectorAll(".bar").forEach((bar) => {
    bar.addEventListener("click", () => {
      targetSlider.value = bar.dataset.i;
      targetSlider.dispatchEvent(new Event("input"));
    });
  });

  function render () {
    const targetIdx = Number(targetSlider.value);
    const target = scale[targetIdx];
    const minD = Number(minSlider.value);

    targetVal.textContent = `${target}px`;
    minVal.textContent = `${minD}px`;
    targetOut.textContent = `${target}px`;

    const larger  = nextLargerLocal(target, scale, minD);
    const smaller = nextSmallerLocal(target, scale, minD);

    if (larger === null) {
      largerOut.textContent = "no match";
      largerCell.classList.add("error");
    } else {
      largerOut.textContent = `${larger}px`;
      largerCell.classList.remove("error");
    }

    if (smaller === null) {
      smallerOut.textContent = "no match";
      smallerCell.classList.add("error");
    } else {
      smallerOut.textContent = `${smaller}px`;
      smallerCell.classList.remove("error");
    }

    // colour the bars
    scaleEl.querySelectorAll(".bar").forEach((bar, i) => {
      const v = scale[i];
      bar.classList.remove("target", "larger", "smaller", "dim");
      if (v === target) bar.classList.add("target");
      else if (v === larger) bar.classList.add("larger");
      else if (v === smaller) bar.classList.add("smaller");
      else bar.classList.add("dim");
    });
  }

  targetSlider.addEventListener("input", render);
  minSlider.addEventListener("input", render);
  render();
})();

// ── VI. mostVivid ──────────────────────────────────────────────────
(function demoVivid () {
  const stage = document.getElementById("vivid-stage");
  if (!stage) return;

  // A palette that mixes a few clearly vivid colors with neutrals
  const palette = [
    "#c8391a", "#d49623", "#1c3a9a", "#4f6033",
    "#7a3c8e", "#dcd2b8", "#1d6b6a", "#14110d",
  ];

  const { color: crown } = mostVivid(palette);

  stage.innerHTML = palette.map((c) => {
    const C = lch(c).c || 0;
    return `
      <div class="vtile ${c === crown ? "crown" : ""}" style="background:${c}">
        <span class="chroma">${C.toFixed(2)}</span>
        <span>${c}</span>
      </div>
    `;
  }).join("");
})();

// ── Copy buttons ────────────────────────────────────────────────────
document.querySelectorAll(".install-copy").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const text = btn.dataset.copy;
    try {
      await navigator.clipboard.writeText(text);
    } catch { /* ignore */ }
    const orig = btn.textContent;
    btn.textContent = "Copied ✓";
    btn.classList.add("copied");
    setTimeout(() => {
      btn.textContent = orig;
      btn.classList.remove("copied");
    }, 1400);
  });
});
