// The favicon: the mark, the wordmark's book with "DB" on it, as outlines
// (logo/db.ts), in the site's dark blue.
import { book, maskShapes } from '../components/logo/book';
import { DB_FLIPPED as DB, DB_FLIPPED_INK as DB_INK } from '../components/logo/db';

const b = book(DB_INK);
const INK = '#172c4f'; // the site's dark blue

export function GET() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.viewBox}">
<mask id="book" maskUnits="userSpaceOnUse" x="-40" y="-20" width="200" height="120">${maskShapes(b)}</mask>
<rect x="-40" y="-20" width="200" height="120" fill="${INK}" mask="url(#book)"/>
<path transform="translate(${b.x} ${b.baseline})" fill="${INK}" d="${DB}"/>
</svg>
`;
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } });
}
