/**
 * Build-time configuration for the site.
 *
 * Four optional public values, all empty by default. They are read at build time only and baked
 * into the emitted HTML, `sitemap.xml` and `robots.txt`, so changing one requires a rebuild — a
 * host that re-serves a previous build after setting a new value changes nothing.
 *
 * This is the only module under `src` that reads `process.env`, and it imports nothing, so the
 * same file runs unchanged inside the Astro config loader, in page frontmatter and in a plain
 * Node script. A value that is set but invalid stops the build rather than falling back to
 * another state: a silently non-live or silently formless site is worse than a failed build.
 */

/** Absolute URL the enquiry form posts to. Optional; empty selects a non-form state. */
const FORM_ENDPOINT_VAR = 'PUBLIC_FORM_ENDPOINT';

/** The one contact address. Optional; empty means the address appears nowhere on the site. */
const CONTACT_EMAIL_VAR = 'PUBLIC_CONTACT_EMAIL';

/** Absolute origin of the published site. Optional; empty leaves the sitemap with no entries. */
const SITE_URL_VAR = 'PUBLIC_SITE_URL';

/** Indexability switch. Exactly `true` means live; every other value means not live. */
const SITE_LIVE_VAR = 'PUBLIC_SITE_LIVE';

/** Rule text reported when a value is set but invalid — the variable is named, the value never is. */
const FORM_ENDPOINT_RULE = 'an absolute URL is required, including its scheme';
const FORM_ENDPOINT_SCHEME_RULE =
  'https is required, and http is accepted only for the hostnames localhost and 127.0.0.1';
const CONTACT_EMAIL_RULE =
  'a single address is required, local@domain.tld, with no space, comma or question mark';
const SITE_URL_RULE =
  'an absolute origin is required, https (http only for a local host), with no path beyond "/" and no query or fragment';

/** Hostnames for which plain `http:` is accepted, so a local endpoint can be exercised. */
const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1']);

/** `local@domain.tld` with no space, comma or question mark anywhere in the address. */
const EMAIL_PATTERN = /^[^\s@,?]+@[^\s@,?]+\.[^\s@,?]+$/;

/** Set once validation has completed, so a second call neither re-validates nor repeats the warning. */
let validated = false;

/**
 * Reads one configured value. An absent variable and a value that is empty after trimming both
 * read as the empty string, which is the documented and valid default for all four values.
 */
function read(name: string): string {
  const value = process.env[name];
  return value === undefined ? '' : value.trim();
}

/** Builds the failure for a value that is set but invalid: it names the variable and the rule only. */
function invalid(name: string, rule: string): Error {
  return new Error(`${name} is set but invalid: ${rule}`);
}

/** Parses `value` as an absolute URL, or returns `null` when it is not one. */
function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** Validates `PUBLIC_FORM_ENDPOINT`: an absolute URL, `https:`, or `http:` for a local host only. */
function validateFormEndpoint(value: string): void {
  const url = parseUrl(value);
  if (url === null) {
    throw invalid(FORM_ENDPOINT_VAR, FORM_ENDPOINT_RULE);
  }
  if (url.protocol === 'https:') {
    return;
  }
  if (url.protocol === 'http:' && LOCAL_HOSTNAMES.has(url.hostname)) {
    return;
  }
  throw invalid(FORM_ENDPOINT_VAR, FORM_ENDPOINT_SCHEME_RULE);
}

/** Validates `PUBLIC_CONTACT_EMAIL`: exactly one `local@domain.tld`, with no space, comma or `?`. */
function validateContactEmail(value: string): void {
  if (!EMAIL_PATTERN.test(value)) {
    throw invalid(CONTACT_EMAIL_VAR, CONTACT_EMAIL_RULE);
  }
}

/** Validates `PUBLIC_SITE_URL`: an absolute origin, `https:` or a local `http:`, and nothing after it. */
function validateSiteUrl(value: string): void {
  const url = parseUrl(value);
  if (url === null) {
    throw invalid(SITE_URL_VAR, SITE_URL_RULE);
  }
  const schemeAccepted =
    url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTNAMES.has(url.hostname));
  if (!schemeAccepted) {
    throw invalid(SITE_URL_VAR, SITE_URL_RULE);
  }
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw invalid(SITE_URL_VAR, SITE_URL_RULE);
  }
}

/**
 * Warns once for a `PUBLIC_SITE_LIVE` value that is present but is not exactly `true`, naming the
 * value it received. An empty value is the documented default and stays silent, so a default build
 * prints nothing; warning on the absent value would flood the log without telling an operator
 * anything.
 */
function warnIfLiveFlagMisread(value: string): void {
  if (value === '' || value === 'true') {
    return;
  }
  console.warn(
    `${SITE_LIVE_VAR} is set to "${value}", which is not exactly "true"; the site is not live, every page keeps noindex and robots.txt disallows all.`,
  );
}

/**
 * Validates all four build-time values and stops the build on the first one that is set but
 * invalid, naming the variable and the rule it broke and never echoing the value. Runs once per
 * process: a second call neither re-validates nor repeats the `PUBLIC_SITE_LIVE` warning.
 *
 * Call it at the top of the Astro config so a bad value fails before any page is rendered. The
 * four getters call it too, so no code path can read a set-but-invalid value even where this
 * call was skipped.
 */
export function assertValidEnv(): void {
  if (validated) {
    return;
  }
  const formEndpoint = read(FORM_ENDPOINT_VAR);
  if (formEndpoint !== '') {
    validateFormEndpoint(formEndpoint);
  }
  const contactEmail = read(CONTACT_EMAIL_VAR);
  if (contactEmail !== '') {
    validateContactEmail(contactEmail);
  }
  const siteUrl = read(SITE_URL_VAR);
  if (siteUrl !== '') {
    validateSiteUrl(siteUrl);
  }
  warnIfLiveFlagMisread(read(SITE_LIVE_VAR));
  validated = true;
}

/**
 * The site's absolute origin without a trailing slash, for building `og:url`, `og:image` and the
 * sitemap location; `null` when `PUBLIC_SITE_URL` is empty, in which case both Open Graph URL
 * fields are omitted and the sitemap is emitted with no entries rather than a guessed host.
 */
export function getSiteUrl(): string | null {
  assertValidEnv();
  const value = read(SITE_URL_VAR);
  return value === '' ? null : new URL(value).origin;
}

/**
 * The absolute URL the enquiry form posts to, as configured; `null` when `PUBLIC_FORM_ENDPOINT`
 * is empty, which is what replaces the form with the mailto link or the fallback text.
 */
export function getFormEndpoint(): string | null {
  assertValidEnv();
  const value = read(FORM_ENDPOINT_VAR);
  return value === '' ? null : value;
}

/**
 * The one contact address, for the footer, the contact area and the form's mailto link; `null`
 * when `PUBLIC_CONTACT_EMAIL` is empty, which keeps the address off the site entirely.
 */
export function getContactEmail(): string | null {
  assertValidEnv();
  const value = read(CONTACT_EMAIL_VAR);
  return value === '' ? null : value;
}

/**
 * Whether the site may be indexed: `true` only when `PUBLIC_SITE_LIVE` is exactly `true`. Any
 * other value — including `TRUE`, `1` and `yes` — is not live, and an empty value is the default.
 */
export function isLive(): boolean {
  assertValidEnv();
  return read(SITE_LIVE_VAR) === 'true';
}
