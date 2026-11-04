// The pages' markup lives in site/partials/*.html: plain HTML (its code
// samples are full of braces, which an Astro template would read as
// expressions). Links in it say {{base}} for the site root; a page whose
// top line sits inside its markup marks the spot with <!--brand-->.
const BASE = import.meta.env.BASE_URL.replace(/\/?$/, '/');

export function partial(html: string): [string, string] {
  const filled = html.replaceAll('{{base}}', BASE);
  const [before, after = ''] = filled.split('<!--brand-->');
  return [before, after];
}
