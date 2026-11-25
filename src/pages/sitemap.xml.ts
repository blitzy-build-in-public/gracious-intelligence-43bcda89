/**
 * The generated `/sitemap.xml` route (AAP 0.4.2, 0.8.3).
 *
 * Two routes emit text at build time and nothing responds to a request at run time: this one and
 * `robots.txt.ts`. The sitemap integration is deliberately not installed, because it writes no
 * file at all without a configured site address, while this site must ship a valid, empty
 * `<urlset>` until the owner supplies one (PA-2, 0.5.1).
 *
 * Static output only (Rule W-2): `GET` is evaluated once by the build, and the `Response` it
 * returns is written to `dist/sitemap.xml`. There is no adapter, no request handler, no header or
 * query read and no runtime state, so the file is identical whichever host serves `dist/`.
 */

import type { APIRoute } from 'astro';
import { getSiteUrl } from '../lib/env.ts';

/** The namespace a sitemap 0.9 document declares, and the only absolute URL this file holds. */
const SITEMAP_NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9';

/**
 * The eight navigable routes, in the order the sitemap lists them (AAP 0.4.2).
 *
 * The list is written out rather than derived by walking the page directory, because the
 * directory also holds the page-not-found route, which must never be listed: it is
 * `noindex, nofollow` in every configuration, is linked from nowhere and is not a page a crawler
 * may reach (B-3, B-4, 0.4.2). Every entry is a route the build actually emits, so each listed URL
 * performs its function.
 */
export const PAGE_PATHS = [
  '/',
  '/platform',
  '/platform/site-intelligence',
  '/sovereignty',
  '/about',
  '/contact',
  '/privacy',
  '/legal',
] as const;

/**
 * The sitemap document for `siteUrl`.
 *
 * With no configured address the document is a `<urlset>` with zero `<url>` children: valid, and
 * the only honest content, because a `<loc>` needs an absolute address and neither a guessed host
 * nor an empty one is acceptable (0.8.3, A-2). With an address, it carries one `<url>` per entry of
 * `PAGE_PATHS`, each with exactly one `<loc>` and no `<lastmod>`, `<changefreq>` or `<priority>` —
 * the plan gives none, and a build timestamp would make two builds of one configuration differ.
 *
 * Nothing is escaped because nothing interpolated can be markup: the origin is validated by
 * `getSiteUrl()` (scheme, host and port only, path `/`, no query) so it cannot carry `&` or `<`,
 * and the eight paths are literals of this module. Every listed URL is on the site's own origin
 * (Rule B-1).
 */
function buildSitemap(siteUrl: string | null): string {
  const open = `<urlset xmlns="${SITEMAP_NAMESPACE}">`;
  if (siteUrl === null) {
    return `${open}</urlset>\n`;
  }
  /* `getSiteUrl()` already returns a bare origin; the strip keeps a future change to it harmless. */
  const origin = siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl;
  /* Every path starts with "/", so the home path yields the bare origin plus that slash. */
  const entries = PAGE_PATHS.map((path) => `  <url>\n    <loc>${origin}${path}</loc>\n  </url>`);
  return `${open}\n${entries.join('\n')}\n</urlset>\n`;
}

/** `GET /sitemap.xml` — served as a build-time artefact, never by a running server (W-2). */
export const GET: APIRoute = () =>
  new Response(buildSitemap(getSiteUrl()), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
