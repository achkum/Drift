// Page URLs can name a topic someone is reading about or a household member's id.
// Analytics only ever sees the route pattern, never those values, and never a query string or hash
// (which can carry ids such as ?as=<member> or invite details).

const PRIVATE_ROUTES: readonly [RegExp, string][] = [
  [/^\/topic\/[^/]+/, '/topic/[id]'],
  [/^\/household\/(?!compare(?:\/|$))[^/]+/, '/household/[member]'],
];

export function redactAnalyticsUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return '/';
  }
  let path = url.pathname;
  for (const [pattern, replacement] of PRIVATE_ROUTES) path = path.replace(pattern, replacement);
  return `${url.origin}${path}`;
}
