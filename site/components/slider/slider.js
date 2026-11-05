// The slider: a native <input type="range"> drawn as a ruler whose track is
// its row's bottom rule (slider.css). Importing this module once styles
// every range input on the page; no markup of its own is needed.
//
// Every slider's ticks: one per step when there are few enough to read,
// else ten. Sliders added later (the article's popovers) are marked as
// they appear, and a slider whose range changes is re-marked.

import "./slider.css";

function mark(input) {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const step = Number(input.step) || 1;
  const steps = Math.round((max - min) / step);
  input.style.setProperty("--ticks", String(steps > 0 && steps <= 24 ? steps : 10));
  place(input);
}

// Where the handle sits, 0 to 1: the wave of ticks centres on it.
function place(input) {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const p = max > min ? (Number(input.value) - min) / (max - min) : 0;
  const at = Math.min(1, Math.max(0, p));
  input.style.setProperty("--p", String(at));
  // An end tick sinks under the handle: fully while the handle's ring is
  // over it, easing back up within one more handle width.
  const thumb = 13;
  const width = input.clientWidth - thumb;
  const near = (d) => String(Math.min(1, Math.max(0, 1.5 - d / thumb)));
  input.style.setProperty("--near-lo", near(at * width));
  input.style.setProperty("--near-hi", near((1 - at) * width));
}

const isRange = (el) => el instanceof HTMLInputElement && el.type === "range";
for (const type of ["input", "focusin", "pointerdown", "keydown"]) {
  document.addEventListener(type, (e) => { if (isRange(e.target)) place(e.target); }, true);
}
document.addEventListener("pointermove", (e) => { if (isRange(e.target) && e.buttons) place(e.target); }, true);

const markAll = (root = document) => {
  for (const input of root.querySelectorAll('input[type="range"]')) mark(input);
};

markAll();
new MutationObserver((records) => {
  for (const record of records) {
    if (record.type === "attributes") mark(record.target);
    else for (const node of record.addedNodes) {
      if (node.nodeType !== 1) continue;
      if (node.matches('input[type="range"]')) mark(node);
      else markAll(node);
    }
  }
}).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["min", "max", "step"] });
