// Docs: each example's code and its live result are two papers in a
// folder, like the landing page's: the result in front, the code behind,
// a tab on each to bring it forward.

const STAGE = '[class$="-stage"], [class*="-stage "], figure.demo';
const used = new Set();

/** The result that belongs to a code block: the nearest stage around it
 *  (a stage inside a figure.demo counts as that figure). */
function resultFor(pre) {
  for (let el = pre.parentElement; el && el !== document.body; el = el.parentElement) {
    for (const found of el.querySelectorAll(STAGE)) {
      const stage = found.closest("figure.demo") ?? found;
      if (stage.contains(pre) || used.has(stage) || stage.closest(".folder")) continue;
      return stage;
    }
  }
  return null;
}

function sheet(name, label, content, front) {
  const article = document.createElement("div");
  article.className = `folder-sheet folder-sheet--${name}${front ? " is-front" : ""}`;
  const tab = document.createElement("button");
  tab.type = "button";
  tab.className = "folder-tab";
  tab.textContent = label;
  tab.setAttribute("aria-pressed", String(front));
  const body = document.createElement("div");
  body.className = "folder-body";
  body.append(content);
  article.append(tab, body);
  return article;
}

/** Put a code block and its result into a folder in the result's place. */
function fold(pre, result) {
  used.add(result);
  const folder = document.createElement("div");
  folder.className = "folder";
  result.replaceWith(folder);
  folder.append(sheet("code", "Code", pre, false), sheet("result", "Result", result, true));
}

// "Bring your own": each card's code and the result it computes.
for (const card of document.querySelectorAll(".extend-card")) {
  const pre = card.querySelector(":scope > pre.code");
  const result = card.querySelector(":scope > .extend-result");
  if (pre && result) fold(pre, result);
}

for (const pre of document.querySelectorAll("pre.code")) {
  if (pre.closest(".renderers, .extend, .outro, .hero")) continue;
  // Code shown inside a result (a stage's own output) stays where it is.
  if (pre.parentElement.closest(STAGE)) continue;
  const result = resultFor(pre);
  if (result) fold(pre, result);
}

// The renderers: one folder, a paper per output, its tab its name.
const rTabs = document.querySelector(".renderer-tabs");
const rPanes = document.querySelector(".renderer-panes");
if (rTabs && rPanes) {
  const folder = document.createElement("div");
  folder.className = "folder renderer-folder";
  const tabs = [...rTabs.querySelectorAll(".r-tab")];
  // Built back to front: the first output ends up in front.
  for (const [i, tab] of [...tabs.entries()].reverse()) {
    const pane = document.getElementById(tab.dataset.target);
    if (!pane) continue;
    const label = tab.textContent.replace(/\s+/g, " ").trim();
    folder.append(sheet(`renderer folder-sheet--${tab.dataset.target}`, label, pane, i === 0));
  }
  rTabs.replaceWith(folder);
  rPanes.remove();
  // Tabs side by side, each as wide as its name.
  requestAnimationFrame(() => {
    let left = 0;
    for (const t of tabs) {
      const own = [...folder.querySelectorAll(".folder-sheet")].find((s) => s.classList.contains(`folder-sheet--${t.dataset.target}`));
      if (!own) continue;
      own.style.setProperty("--tab-left", `${left}px`);
      left += own.querySelector(".folder-tab").offsetWidth + 4;
    }
  });
}

for (const folder of document.querySelectorAll(".folder")) {
  folder.addEventListener("click", (event) => {
    // Its tab, or any part of a paper behind that shows, brings it forward.
    const picked = event.target.closest(".folder-tab")?.closest(".folder-sheet")
      ?? event.target.closest(".folder-sheet:not(.is-front)");
    if (!picked || picked.parentElement !== folder) return;
    for (const s of folder.querySelectorAll(":scope > .folder-sheet")) {
      const front = s === picked;
      s.classList.toggle("is-front", front);
      s.querySelector(".folder-tab").setAttribute("aria-pressed", String(front));
    }
  });
}

// Code is printer paper: feed holes down its left edge (shared.css).
for (const code of document.querySelectorAll("pre.code, .r-pane")) code.classList.add("holes-left");

// Every group of choices is the shared switch.
for (const group of document.querySelectorAll(".names-schemes, .order-modes, .ref-modes, .extends-modes, .readable-ratios, .sibling-offsets, .nth-presets")) {
  group.classList.add("switch");
}

// Tables are the shared ledger: the rows of a scope, under its head; the
// value transforms as one numbered list. Some demos draw their tables
// again whenever their input changes, so new ones are marked as they
// appear.
function markLedgers(root = document) {
  for (const rows of root.querySelectorAll(".extends-rows:not([data-ledger])")) rows.setAttribute("data-ledger", "");
  for (const head of root.querySelectorAll(".extends-pane-head:not([data-ledger-head])")) head.setAttribute("data-ledger-head", "");
}
markLedgers();
document.querySelector(".coda-list")?.setAttribute("data-ledger", "");
new MutationObserver(() => markLedgers()).observe(document.body, { childList: true, subtree: true });

// A result is a whole number of rows tall, so its paper ends on a line.
const ROW = 28;
const snap = new ResizeObserver((entries) => {
  for (const { target } of entries) {
    target.style.paddingBottom = "";
    const base = parseFloat(getComputedStyle(target).paddingBottom) || 0;
    const h = target.getBoundingClientRect().height;
    const extra = (ROW - (h % ROW)) % ROW;
    if (extra > 0.5) target.style.paddingBottom = `${base + extra}px`;
  }
});
for (const result of document.querySelectorAll(".folder-sheet--result .folder-body > *")) snap.observe(result);
