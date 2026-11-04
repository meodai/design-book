// Docs: the gutters are a map of the page, like the landing page's scales.
// Left: where each section sits on the page, numbered (select one to go
// there). Right: how far down the page you are. Both carry a needle that
// follows the scroll.

const left = document.createElement("aside");
left.className = "rail rail-left";
left.setAttribute("aria-label", "Sections of this page");
const right = document.createElement("aside");
right.className = "rail rail-right";
right.setAttribute("aria-hidden", "true");
document.body.prepend(left, right);

const sections = [...document.querySelectorAll("body > section")]
  .map((section, i) => {
    const heading = section.querySelector("h1, h2");
    if (!heading) return null;
    if (!section.id) section.id = heading.id ? `s-${heading.id}` : `section-${i + 1}`;
    return { section, title: heading.textContent.trim() };
  })
  .filter(Boolean);

function pageFraction(element) {
  const top = element.getBoundingClientRect().top + scrollY;
  const height = document.documentElement.scrollHeight - innerHeight;
  return height > 0 ? Math.min(1, Math.max(0, top / height)) : 0;
}

function build() {
  let l = `<span class="rail-legend">Sections, by position</span><div class="rail-scale">`;
  sections.forEach(({ section, title }, i) => {
    const y = pageFraction(section) * 100;
    l += `<i class="tick major" style="top:${y}%"></i>` +
      `<a class="num" href="#${section.id}" style="top:${y}%" title="${title.replace(/"/g, "&quot;")}">${i + 1}</a>`;
  });
  l += `<i class="needle" id="rail-here"></i></div>`;
  left.innerHTML = l;

  let r = `<span class="rail-legend">Read, percent</span><div class="rail-scale">`;
  for (let p = 0; p <= 100; p += 5) {
    const major = p % 25 === 0;
    r += `<i class="tick ${major ? "major" : "minor"}" style="top:${p}%"></i>`;
    if (major) r += `<span class="num" style="top:${p}%">${p}</span>`;
  }
  r += `<i class="needle" id="rail-read"></i></div>`;
  right.innerHTML = r;
  follow();
}

function follow() {
  const height = document.documentElement.scrollHeight - innerHeight;
  const read = height > 0 ? scrollY / height : 0;
  const here = document.getElementById("rail-here");
  const readNeedle = document.getElementById("rail-read");
  if (!here || !readNeedle) return;
  // The section whose top has passed the middle of the window.
  let current = 0;
  sections.forEach(({ section }, i) => {
    if (section.getBoundingClientRect().top < innerHeight / 2) current = i;
  });
  here.style.top = `${read * 100}%`;
  here.dataset.label = String(current + 1);
  readNeedle.style.top = `${read * 100}%`;
  readNeedle.dataset.label = `${Math.round(read * 100)}`;
}

addEventListener("scroll", follow, { passive: true });
addEventListener("resize", build);
addEventListener("load", build);
build();
