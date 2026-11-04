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
      if (stage.contains(pre) || used.has(stage) || stage.closest(".dfolder")) continue;
      return stage;
    }
  }
  return null;
}

function sheet(name, label, content, front) {
  const article = document.createElement("div");
  article.className = `dfolder-sheet dfolder-${name}${front ? " is-front" : ""}`;
  const tab = document.createElement("button");
  tab.type = "button";
  tab.className = "dfolder-tab";
  tab.textContent = label;
  tab.setAttribute("aria-pressed", String(front));
  const body = document.createElement("div");
  body.className = "dfolder-body";
  body.append(content);
  body.inert = !front;
  article.append(tab, body);
  return article;
}

/** Put a code block and its result into a folder in the result's place. */
function fold(pre, result) {
  used.add(result);
  const folder = document.createElement("div");
  folder.className = "dfolder";
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

for (const folder of document.querySelectorAll(".dfolder")) {
  folder.addEventListener("click", (event) => {
    // Its tab, or any part of a paper behind that shows, brings it forward.
    const picked = event.target.closest(".dfolder-tab")?.closest(".dfolder-sheet")
      ?? event.target.closest(".dfolder-sheet:not(.is-front)");
    if (!picked || picked.parentElement !== folder) return;
    for (const s of folder.querySelectorAll(":scope > .dfolder-sheet")) {
      const front = s === picked;
      s.classList.toggle("is-front", front);
      s.querySelector(".dfolder-tab").setAttribute("aria-pressed", String(front));
      s.querySelector(".dfolder-body").inert = !front;
    }
  });
}
