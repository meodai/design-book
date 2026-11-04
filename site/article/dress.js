// The article, dressed like the landing page. This only moves and labels
// what is already on the page; article.ts keeps driving every demo.

// The hero, its top line and the footer are markup now (site/pages/article
// and the shared components); this dresses what the article's own script
// fills in.

// ─── Section numbers hang in the margin, as in a ledger ──────────────
for (const h2 of document.querySelectorAll(".article-content section > h2")) {
  const match = h2.textContent.match(/^\s*(\d+)\.\s*(.*)$/s);
  if (!match) continue;
  h2.innerHTML = `<span class="sec-no" aria-hidden="true">${match[1]}</span><span class="sr-only">${match[1]}. </span>${match[2]}`;
}

// ─── The live example: a folder of two papers ────────────────────────
const panel = document.querySelector(".example-panel");
const frame = panel?.querySelector(".example-frame");
const graphFigure = panel?.querySelector(".dep-graph-figure");
if (panel && frame && graphFigure) {
  panel.querySelector(".example-label")?.remove();
  graphFigure.querySelector(".dep-graph-figure__caption")?.remove();

  const folder = document.createElement("div");
  folder.className = "folder";
  const sheet = (name, label, content, front) => {
    const el = document.createElement("div");
    el.className = `folder-sheet folder-sheet--${name} ruled${front ? " is-front" : ""}`;
    el.innerHTML = `<button class="folder-tab" type="button" aria-pressed="${front}">${label}</button>`;
    const body = document.createElement("div");
    body.className = "folder-body";
    body.append(content);
    el.append(body);
    return el;
  };
  folder.append(sheet("graph", "Token graph", graphFigure, false), sheet("example", "Live example", frame, true));
  panel.prepend(folder);

  folder.addEventListener("click", (event) => {
    const picked = event.target.closest(".folder-tab")?.closest(".folder-sheet")
      ?? event.target.closest(".folder-sheet:not(.is-front)");
    if (!picked) return;
    for (const s of folder.children) {
      const front = s === picked;
      s.classList.toggle("is-front", front);
      s.querySelector(".folder-tab").setAttribute("aria-pressed", String(front));
    }
  });
}

// ─── Each demo gets a tab with its name on its top edge ──────────────
const DEMO_NAMES = {
  "pair-demo": null, // has its own title
  "scale-demo": null,
  "extend-demo": "Card and inverted card",
  "poline-demo": "Palette, drawn with Poline",
  "bezier-demo": "Spacing, drawn as a curve",
};
for (const [cls, name] of Object.entries(DEMO_NAMES)) {
  const demo = document.querySelector(`.${cls}`);
  if (!demo) continue;
  const own = demo.querySelector(`.${cls}__title`);
  if (own) {
    own.classList.add("demo-tab");
  } else if (name) {
    const tab = document.createElement("span");
    tab.className = "demo-tab";
    tab.textContent = name;
    demo.prepend(tab);
  }
}

// ─── The Poline wheel, drawn like the landing page's ─────────────────
// Only its outline; every color on the line a flat dot of that color,
// the ends ringed, each dot with a 1px outline 1px away from it.
const SVG_NS = "http://www.w3.org/2000/svg";
function restyleWheel(picker) {
  const root = picker.shadowRoot;
  if (!root) return;
  if (!picker.dataset.restyled) {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(`
      .picker::before { display: none; }
      .picker::after {
        content: ""; position: absolute; inset: 0; z-index: 1;
        border-radius: 50%; border: 1px solid var(--poline-picker-line-color);
        pointer-events: none;
      }
      .wheel__line { stroke-dasharray: 1 1; }
      .wheel__point { r: 2.6px; stroke: none; }
      .wheel__anchor { r: 4.2px; stroke: none; }
      .wheel__saturation-ring { display: none; }
      .wheel__outlines circle { fill: none; stroke: var(--poline-picker-line-color); pointer-events: none; }
    `);
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    picker.dataset.restyled = "1";
  }
  const svg = root.querySelector("svg");
  const wheel = root.querySelector(".wheel");
  if (!svg || !wheel) return;
  const anchors = [...root.querySelectorAll(".wheel__anchor")];
  for (const a of anchors) a.style.fill = a.getAttribute("fill");
  let outlines = wheel.querySelector(".wheel__outlines");
  if (!outlines) {
    outlines = document.createElementNS(SVG_NS, "g");
    outlines.setAttribute("class", "wheel__outlines");
    wheel.append(outlines);
  }
  const near = (a, b) => Math.hypot(a.getAttribute("cx") - b.getAttribute("cx"), a.getAttribute("cy") - b.getAttribute("cy")) < 4.5;
  const dots = [...anchors, ...[...root.querySelectorAll(".wheel__point")].filter((p) => !anchors.some((a) => near(a, p)))];
  const px = 100 / (svg.clientWidth || 300);
  while (outlines.children.length > dots.length) outlines.lastElementChild.remove();
  dots.forEach((dot, i) => {
    const ring = outlines.children[i] ?? outlines.appendChild(document.createElementNS(SVG_NS, "circle"));
    const r = parseFloat(getComputedStyle(dot).r) || Number(dot.getAttribute("r"));
    ring.setAttribute("cx", dot.getAttribute("cx"));
    ring.setAttribute("cy", dot.getAttribute("cy"));
    ring.setAttribute("r", String(r + px * 1.5));
    ring.setAttribute("stroke-width", String(px));
  });
}

const articlePicker = document.querySelector(".poline-demo poline-picker");
if (articlePicker) {
  const redraw = () => requestAnimationFrame(() => restyleWheel(articlePicker));
  customElements.whenDefined("poline-picker").then(redraw);
  articlePicker.addEventListener("poline-change", redraw);
  document.getElementById("poline-invert")?.addEventListener("change", redraw);
  addEventListener("load", redraw);
}


// ─── Tables: the shared ledger (marketing/shared.css) ───────────────
// Every row becomes number · key · value cell(s).
for (const row of document.querySelectorAll(".pair-demo__row, .scale-demo__row")) {
  const label = row.querySelector(":scope > .pair-demo__label, :scope > .scale-demo__label");
  if (!label || row.querySelector(":scope > .ledger-cell")) continue;
  const cell = document.createElement("span");
  cell.className = "ledger-cell";
  for (const child of [...row.childNodes]) if (child !== label) cell.append(child);
  row.append(cell);
}
document.querySelector(".pair-demo__rows")?.setAttribute("data-ledger", "");
document.querySelector(".pair-demo__rule")?.setAttribute("data-ledger-head", "");
const scaleDemo = document.querySelector(".scale-demo");
if (scaleDemo) {
  scaleDemo.setAttribute("data-ledger", "");
  scaleDemo.querySelector(".demo-tab")?.setAttribute("data-ledger-skip", "");
}

// Token lists: key · what it is · a note.
for (const list of document.querySelectorAll(".token-list")) {
  for (const li of list.children) {
    const key = li.querySelector(":scope > code");
    const note = li.querySelector(":scope > .aside");
    const value = document.createElement("span");
    value.className = "ledger-cell";
    for (const child of [...li.childNodes]) {
      if (child === key || child === note) continue;
      if (child.nodeType === Node.TEXT_NODE && child.textContent.trim() === "=") continue;
      value.append(child);
    }
    li.replaceChildren(...[key, value, note].filter(Boolean));
  }
  list.setAttribute("data-ledger", "");
}

// ─── Shared parts (marketing/shared.css) ────────────────────────────
// Formulas and the Poline palette are printer paper; the two ways of
// reading a surface are a switch.
for (const line of document.querySelectorAll(".rule-line")) line.classList.add("holes-left");
document.querySelector(".poline-demo")?.classList.add("holes-both");
document.querySelector(".extend-demo__modes")?.classList.add("switch");
