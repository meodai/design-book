// Inlines every data/*.json into template.html → flow-viz.html (open it straight from disk).
// Each JSON is one book as written by collect.mjs; its file name becomes the dataset's button.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const here = new URL('./', import.meta.url);
const sets = {};
for (const f of readdirSync(new URL('data/', here)).filter(f => f.endsWith('.json')).sort())
  sets[f.replace(/\.json$/, '')] = JSON.parse(readFileSync(new URL(`data/${f}`, here), 'utf8'));
const html = readFileSync(new URL('template.html', here), 'utf8').replace('/*DATA*/', JSON.stringify(sets));
writeFileSync(new URL('flow-viz.html', here), html);
console.log(`flow-viz.html: ${Object.keys(sets).join(', ')}`);
