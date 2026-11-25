/**
 * Build-time configuration for the site.
 *
 * Four optional public values, all empty by default. They are read at build time only and baked
 * into the emitted HTML, `sitemap.xml` and `robots.txt`, so changing one requires a rebuild — a
 * host that re-serves a previous build after setting a new value changes nothing.
 *
 * A value comes from the process environment or, where that has none, from a `.env` file in the
 * working directory. The environment outranks the file, and the file is the documented place for
 * an owner to keep these values: `.env.example` lists all four and `.env` itself stays out of the
 * repository. Supporting it here rather than in the caller matters, because Astro does not load
 * `.env` files while it evaluates the config, and an endpoint configured the documented way would
 * otherwise never reach the CSP `connect-src` that the same config builds.
 *
 * This is the only module under `src` that reads `process.env`, and it imports nothing, so the
 * same file runs unchanged inside the Astro config loader, in page frontmatter and in a plain
 * Node script — which also means `.env` is loaded with Node's built-in loader, before any value
 * is read, instead of by whichever of those callers happens to run first. A value that is set but
 * invalid stops the build rather than falling back to another state: a silently non-live or
 * silently formless site is worse than a failed build.
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

/**
 * `local@domain.tld`: a local part of letters, digits and the common `_%+-` characters in
 * dot-separated runs, then a domain of dot-separated labels that each start and end with a letter
 * or digit and a final label of two or more letters. The address reaches a `mailto` href, so a
 * space, comma, `?`, quote, angle bracket or colon — anything that could break out of that
 * attribute — is rejected here rather than trusted to the escaping of every consumer.
 */
const EMAIL_PATTERN =
  /^[A-Za-z0-9_%+-]+(?:\.[A-Za-z0-9_%+-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

/** Set once the `.env` file has been offered to `process.env`, so one process reads it once. */
let dotenvLoaded = false;

/** Set once a misread `PUBLIC_SITE_LIVE` value has been reported, so one instance warns once. */
let liveFlagWarned = false;

/** Whether `error` is the `ENOENT` that a missing `.env` file raises. */
function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

/**
 * Copies the project's `.env` file into `process.env`, once per process. A clone with no `.env`
 * is the normal state and stays silent; any other failure is thrown, because it means a file the
 * owner wrote was not applied. A variable that is already in the environment is left untouched by
 * Node's loader, so a real environment variable keeps outranking the file.
 */
function loadDotEnvFile(): void {
  if (dotenvLoaded) {
    return;
  }
  dotenvLoaded = true;
  if (typeof process === 'undefined' || typeof process.loadEnvFile !== 'function') {
    return;
  }
  try {
    process.loadEnvFile('./.env');
  } catch (error) {
    if (!isMissingFile(error)) {
      throw error;
    }
  }
}

loadDotEnvFile();

/** The value `name` carries exactly as given, or the empty string when it is absent. */
function raw(name: string): string {
  const value = process.env[name];
  return value === undefined ? '' : value;
}

/**
 * Reads one of the three URL or address values. An absent variable and a value that is empty
 * after trimming both read as the empty string, which is the documented and valid default; the
 * padding is trimmed because those three are parsed as a URL or an address, where it means
 * nothing. `PUBLIC_SITE_LIVE` is read with `raw` instead: for that one flag the padding is the
 * difference between a live site and a misconfigured one.
 */
function read(name: string): string {
  return raw(name).trim();
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

/** `PUBLIC_FORM_ENDPOINT` as configured, validated on this call; `null` when it is empty. */
function formEndpointValue(): string | null {
  const value = read(FORM_ENDPOINT_VAR);
  if (value === '') {
    return null;
  }
  validateFormEndpoint(value);
  return value;
}

/** `PUBLIC_CONTACT_EMAIL` as configured, validated on this call; `null` when it is empty. */
function contactEmailValue(): string | null {
  const value = read(CONTACT_EMAIL_VAR);
  if (value === '') {
    return null;
  }
  validateContactEmail(value);
  return value;
}

/** `PUBLIC_SITE_URL`'s origin, validated on this call; `null` when it is empty. */
function siteUrlValue(): string | null {
  const value = read(SITE_URL_VAR);
  if (value === '') {
    return null;
  }
  validateSiteUrl(value);
  return new URL(value).origin;
}

/**
 * Warns once per module instance for a `PUBLIC_SITE_LIVE` value that is present but is not exactly
 * `true`, naming the value it received. An empty value is the documented default and stays silent,
 * so a default build prints nothing; warning on the absent value would flood the log without
 * telling an operator anything. The value is compared untrimmed, so ` true` is not live either.
 */
function warnIfLiveFlagMisread(): void {
  if (liveFlagWarned) {
    return;
  }
  const value = raw(SITE_LIVE_VAR);
  if (value === '' || value === 'true') {
    return;
  }
  liveFlagWarned = true;
  console.warn(
    `${SITE_LIVE_VAR} is set to "${value}", which is not exactly "true"; the site is not live, every page keeps noindex and robots.txt disallows all.`,
  );
}

/**
 * Validates the three values that have an invalid state — `PUBLIC_FORM_ENDPOINT`,
 * `PUBLIC_CONTACT_EMAIL`, then `PUBLIC_SITE_URL` — and stops the build on the first one that is
 * set but invalid, naming the variable and the rule it broke and never echoing the value. Then it
 * warns for a `PUBLIC_SITE_LIVE` value that is not exactly `true`.
 *
 * Call it at the top of the Astro config so a bad value fails before any page is rendered. Every
 * accessor below validates the value it reads on the same call, so a value that appears after
 * this ran is still checked before it is used.
 */
export function assertValidEnv(): void {
  formEndpointValue();
  contactEmailValue();
  siteUrlValue();
  warnIfLiveFlagMisread();
}

/**
 * The site's absolute origin without a trailing slash, for building `og:url`, `og:image` and the
 * sitemap location; `null` when `PUBLIC_SITE_URL` is empty, in which case both Open Graph URL
 * fields are omitted and the sitemap is emitted with no entries rather than a guessed host.
 */
export function getSiteUrl(): string | null {
  return siteUrlValue();
}

/**
 * The absolute URL the enquiry form posts to, as configured; `null` when `PUBLIC_FORM_ENDPOINT`
 * is empty, which is what replaces the form with the mailto link or the fallback text.
 */
export function getFormEndpoint(): string | null {
  return formEndpointValue();
}

/**
 * The one contact address, for the footer, the contact area and the form's mailto link; `null`
 * when `PUBLIC_CONTACT_EMAIL` is empty, which keeps the address off the site entirely.
 */
export function getContactEmail(): string | null {
  return contactEmailValue();
}

/**
 * Whether the site may be indexed: `true` only when `PUBLIC_SITE_LIVE` is exactly `true`. Any
 * other value — including `TRUE`, `1` and `yes` — is not live, and an empty value is the default.
 */
export function isLive(): boolean {
  warnIfLiveFlagMisread();
  return raw(SITE_LIVE_VAR) === 'true';
}
