// Every slider's ticks: one per step when there are few enough to read,
// else ten. Sliders added later (the article's popovers) are marked as
// they appear, and a slider whose range changes is re-marked.

function mark(input) {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const step = Number(input.step) || 1;
  const steps = Math.round((max - min) / step);
  input.style.setProperty("--ticks", String(steps > 0 && steps <= 24 ? steps : 10));
}

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
