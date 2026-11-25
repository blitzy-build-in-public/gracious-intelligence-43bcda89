/**
 * The generated `/robots.txt` route (AAP 0.4.2, 0.8.3).
 *
 * Two routes emit text at build time and nothing responds to a request at run time: this one and
 * `sitemap.xml.ts`. Static output only (rule W-2): `GET` is evaluated once by the build and the
 * `Response` it returns is written to `dist/robots.txt`, so the file is identical whichever host
 * serves `dist/` — there is no adapter, no request handler, no header or query read and no runtime
 * state to keep.
 *
 * The body follows one flag and nothing else. `isLive()` is the same predicate `Meta.astro` derives
 * each page's robots meta from, so the crawler rule in this file and the rule in every page's head
 * cannot disagree: unless `PUBLIC_SITE_LIVE` is exactly `true`, every path stays withheld (0.9.3 —
 * `TRUE`, `1` and an absent value all mean not live, and `env.ts` reports the misreading). Only a
 * live site allows crawling, and only then does the file name the sitemap the sibling route emits,
 * where the eight navigable pages are listed. The page-not-found route is in no sitemap, carries
 * `noindex` in every configuration and is linked from nowhere.
 */

import type { APIRoute } from 'astro';
import { getSiteUrl, isLive } from '../lib/env.ts';

/** The single crawler group. The site has no per-bot rules and no crawl delay. */
const USER_AGENT_DIRECTIVE = 'User-agent: *';

/** The pre-launch body: every path withheld (WT-09). */
const DISALLOW_ALL_DIRECTIVE = 'Disallow: /';

/** The live permission, which takes the place of the disallow above. */
const ALLOW_ALL_DIRECTIVE = 'Allow: /';

/** The document `sitemap.xml.ts` emits, resolved against the site's own origin (0.8.3, B-1). */
const SITEMAP_PATH = '/sitemap.xml';

/** Set once the live-without-address case has been reported, so one process reports it once. */
let missingSiteUrlReported = false;

/**
 * Reports the one state this route cannot express: a live site with no configured address, where a
 * `Sitemap:` line would have to name a host the repository does not own (rule B-1). The launch guard
 * already fails such a build, so reaching this is a defect rather than a supported configuration;
 * the line is omitted rather than emitted malformed, and the operator is told which value is empty.
 */
function reportMissingSiteUrl(): void {
  if (missingSiteUrlReported) {
    return;
  }
  missingSiteUrlReported = true;
  console.warn(
    'PUBLIC_SITE_LIVE is true while PUBLIC_SITE_URL is empty: robots.txt omits its Sitemap line rather than name a host the project does not own; set PUBLIC_SITE_URL and rebuild.',
  );
}

/**
 * The file's text for one configuration: one directive per line, with a trailing newline.
 *
 * Not live: the crawler group then `Disallow: /`, and nothing else — no `Allow`, no `Sitemap` line,
 * no comment and no crawl delay, because a pre-launch site has nothing a crawler may take. Live:
 * the same group, `Allow: /`, then the sitemap URL on the site's own origin. The origin loses a
 * trailing slash first, so the emitted URL never carries a double slash whatever form the
 * configured address takes; `getSiteUrl()` returns a bare origin today, and the strip keeps that
 * guarantee true if its implementation ever changes.
 */
function buildRobots(live: boolean, siteUrl: string | null): string {
  if (!live) {
    return `${USER_AGENT_DIRECTIVE}\n${DISALLOW_ALL_DIRECTIVE}\n`;
  }
  const directives = [USER_AGENT_DIRECTIVE, ALLOW_ALL_DIRECTIVE];
  if (siteUrl === null) {
    reportMissingSiteUrl();
  } else {
    const origin = siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl;
    directives.push(`Sitemap: ${origin}${SITEMAP_PATH}`);
  }
  return `${directives.join('\n')}\n`;
}

/** `GET /robots.txt` — a build-time artefact, never served by a running server (W-2). */
export const GET: APIRoute = () =>
  new Response(buildRobots(isLive(), getSiteUrl()), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
