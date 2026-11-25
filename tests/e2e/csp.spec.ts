/**
 * The content security policy suite: one policy per page, the directives it must and must not
 * carry, the resources that policy actually blocks, and the single foreign origin it actually
 * admits (WT-19, AAP 0.4.5, 0.13.1).
 *
 * Astro emits the policy from `security.csp` in `astro.config.mjs` as one
 * `<meta http-equiv="content-security-policy">` per built page, hashing that page's own inline
 * scripts and styles, and the config supplies the two directives Astro does not derive:
 * `default-src 'self'`, and a `connect-src` of `'self'` plus the validated `PUBLIC_FORM_ENDPOINT`
 * origin. The policy is **not** applied by `astro dev` (AAP 0.3.1), so every case here runs in a
 * browser against a built configuration served by `tests/helpers/build.ts` behind
 * `playwright.config.ts`; this file builds and serves nothing itself.
 *
 * Four configurations reach a browser and each one runs this file: `default` (all four values
 * empty), `live` (site address, live flag, form endpoint and contact address set), `mailto` and
 * `screens`. No case is withheld anywhere. The policy exists on every page in all four, so the
 * directive assertions run everywhere; only the `connect-src` expectation is read from the
 * configuration the pass is running under, because that directive is the one value a configuration
 * sets. Both sides of that directive are asserted — in `live` the origin is named and the form's
 * post to it is allowed, in the other three the origin is absent and the same request is blocked and
 * reported — so no project gets a case that passes for want of an assertion.
 *
 * Copy-free by design. The content modules of a clone whose specification attachment is absent carry
 * placeholder text, so no assertion here reads a string a page or the specification supplies: the
 * form is located structurally (its form element, a text control, an email control, a number
 * control, a checkbox) and filled with values its own rules accept. The only literals in this file
 * are the two reserved example hosts below, and both are intercepted — `https://blocked.example` is
 * aborted the moment anything reaches for it, and `https://forms.example/enquiry` is fulfilled
 * inside this process.
 *
 * Rules honoured, and where:
 * - **B-1** — the whole file. The directive set is asserted, the three foreign resource types are
 *   proven blocked rather than merely reported, and a plain load of three routes is proven to reach
 *   no other origin. No case introduces traffic to a real host.
 * - **B-2** — no credential, token or real endpoint appears here. The endpoint is the plan's
 *   documented `forms.example` stub (AAP 0.13.2), and it is read back from the built page's own
 *   policy rather than from any environment this file reads.
 * - **B-3** — the elements the blocked-resource cases create exist for the length of their own
 *   `evaluate` and are removed inside it, so nothing here leaves a page in a state a later
 *   accessibility or keyboard assertion did not build.
 * - **B-4** — every blocked-resource assertion is a real outcome: a rejected promise, an image whose
 *   `naturalWidth` is 0, a global that stays undefined. A reported violation on its own proves
 *   nothing, so it is never the only evidence.
 * - **W-1** — no Figma string, place name or template node name appears here, and this file renders
 *   no copy of its own.
 * - **W-2** — static site only. The one outbound interaction asserted is the static page's own form
 *   post, and it is fulfilled locally; nothing here needs a server route, a server-set header or a
 *   session.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * The enquiry endpoint the `live` configuration sets — the value AAP 0.13.2 gives
 * `PUBLIC_FORM_ENDPOINT`, and the only address this suite ever posts to.
 */
const ENDPOINT = 'https://forms.example/enquiry';

/**
 * That endpoint's origin. A CSP source names a scheme and host and nothing else, so this — not the
 * full address — is what `connect-src` must carry.
 */
const ENDPOINT_ORIGIN = 'https://forms.example';

/** A reserved example host that never resolves, used as the foreign origin every blocking case names. */
const BLOCKED = 'https://blocked.example';

/** The `page.route` patterns that keep even a broken policy from reaching a network. */
const BLOCKED_PATTERN = 'https://blocked.example/**';
const ENDPOINT_FAMILY_PATTERN = 'https://forms.example/**';

/**
 * The four configurations that reach a browser (AAP 0.13.2), by the project names
 * `playwright.config.ts` declares. The names are the contract between that file and this one, so a
 * project renamed there is reported here rather than silently taking the wrong branch.
 */
const CONFIGURATIONS = ['default', 'live', 'mailto', 'screens'] as const;

/** One browser-reached configuration name. */
type Configuration = (typeof CONFIGURATIONS)[number];

/** The configuration set every case in this file applies to, as each test title states it. */
const CONFIGURATION_SET = CONFIGURATIONS.join(', ');

/** The eight navigable pages the build emits (AAP 0.4.2). */
const EIGHT_PAGES = [
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
 * The 404 document, served as the built file. It is not a ninth navigable page: it is absent from
 * the navigation and the sitemap and is `noindex, nofollow` in every configuration, which is why it
 * is reached by its own path here and identified by having no description meta.
 */
const NOT_FOUND_DOCUMENT = '/404.html';

/**
 * The routes where the whole document is inspected for a `style` attribute or an inline event
 * handler — the precondition of a hash-only policy holding at all (AAP 0.4.5, 0.6.1).
 */
const INLINE_ATTRIBUTE_PAGES = ['/', '/sovereignty', '/contact'] as const;

/** The routes where a foreign fetch, image and script are each proven blocked (WT-19). */
const BLOCKED_RESOURCE_PAGES = ['/', NOT_FOUND_DOCUMENT] as const;

/** The routes whose plain load is proven to reach no origin but the page's own (rule B-1). */
const PLAIN_LOAD_PAGES = ['/', '/contact', NOT_FOUND_DOCUMENT] as const;

/** `'self'`: the one source form this policy admits without a hash. */
const SELF = "'self'";

/** One per-page inline script or style hash, as Astro emits it, e.g. `'sha256-xIb/Pa7FUshAu4…='`. */
const HASH_SOURCE = /^'sha256-[A-Za-z0-9+/]+={0,2}'$/;

/** The source tokens the policy must admit nowhere, in their quoted spellings (WT-19). */
const FORBIDDEN_TOKENS: readonly string[] = [
  "'unsafe-inline'",
  "'unsafe-eval'",
  "'unsafe-hashes'",
];

/**
 * Every attribute a `style` attribute or an inline event handler could arrive under. A hash-only
 * policy covers inline `<script>` and `<style>` elements but not `style` attributes or inline
 * handlers, which would need `'unsafe-hashes'` — forbidden above — so their absence is the condition
 * this policy rests on.
 */
const INLINE_ATTRIBUTES: readonly string[] = [
  'style',
  'onclick',
  'ondblclick',
  'onload',
  'onerror',
  'onsubmit',
  'onreset',
  'onchange',
  'oninput',
  'onfocus',
  'onblur',
  'onkeydown',
  'onkeyup',
  'onkeypress',
  'onmousedown',
  'onmouseup',
  'onmouseover',
  'onmouseout',
  'onmousemove',
  'onpointerdown',
  'onpointerup',
  'ontouchstart',
  'onscroll',
  'onanimationstart',
  'onanimationend',
  'ontransitionend',
  'oncontextmenu',
];

/** One `securitypolicyviolation` record, as the page's own listener captured it. */
interface CspViolation {
  /** The directive that was checked for this resource, e.g. `connect-src`. */
  effectiveDirective: string;
  /** The directive the emitted policy actually violated, e.g. `default-src` for a fallback. */
  violatedDirective: string;
  /** The absolute address of the blocked resource. */
  blockedURI: string;
}

declare global {
  interface Window {
    /**
     * The records the page's `securitypolicyviolation` listener has kept, installed before any page
     * script runs. Absent on a page this suite did not arm, which reads as an empty list.
     */
    __cspViolations?: CspViolation[];
  }
}

/** The configuration this case is running under, from the project `playwright.config.ts` started. */
function currentConfiguration(): Configuration {
  const name = test.info().project.name;
  for (const configuration of CONFIGURATIONS) {
    if (configuration === name) {
      return configuration;
    }
  }
  throw new Error(
    `this suite runs under the four browser configurations ${CONFIGURATION_SET}, and the project this case is running in is named "${name}". playwright.config.ts owns that list, so a project added or renamed there must be named here too.`,
  );
}

/**
 * Opens one route at the wide design width. The policy does not vary with the viewport, but 1440 is
 * the width WT-19's page set is stated at, and a fixed width keeps two passes comparable.
 */
async function openPage(page: Page, route: string): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(route);
}

/**
 * Reads every `content-security-policy` meta's raw content from the loaded document.
 *
 * Every `meta[http-equiv]` is examined and its value compared case-insensitively, because `http-equiv`
 * values are case-insensitive in HTML and the comparison must not depend on how the build spells it.
 */
async function readPolicyMetas(page: Page): Promise<string[]> {
  return await page.evaluate(() =>
    Array.from(document.querySelectorAll('meta[http-equiv]'))
      .filter(
        (meta) => (meta.getAttribute('http-equiv') ?? '').trim().toLowerCase() === 'content-security-policy',
      )
      .map((meta) => meta.getAttribute('content') ?? ''),
  );
}

/** Reads the document's one policy, failing on the route that carries none or more than one. */
async function readSinglePolicy(page: Page, route: string): Promise<string> {
  const policies = await readPolicyMetas(page);
  expect(
    policies,
    `${route} must carry exactly one content-security-policy meta element and carries ${policies.length}: ${JSON.stringify(policies)}`,
  ).toHaveLength(1);
  return policies[0] ?? '';
}

/**
 * Splits a policy into its directives. Each clause is trimmed and its sources are kept in the order
 * the policy states them; a clause with no directive name (a trailing `;`, as the emitted policy
 * ends with) is ignored rather than becoming a directive with an empty name.
 */
function parsePolicy(raw: string): Map<string, string[]> {
  const directives = new Map<string, string[]>();
  for (const clause of raw.split(';')) {
    const tokens = clause.trim().split(/\s+/).filter((token) => token !== '');
    const [name, ...sources] = tokens;
    if (name === undefined) {
      continue;
    }
    directives.set(name.toLowerCase(), sources);
  }
  return directives;
}

/** The sources of one directive, as a comparable sorted string, or `null` when it is absent. */
function sourcesOf(directives: ReadonlyMap<string, string[]>, name: string): string[] | null {
  const sources = directives.get(name);
  return sources === undefined ? null : sources;
}

/** Whether two source lists hold the same tokens, whatever order the policy states them in. */
function sameSources(actual: readonly string[], expected: readonly string[]): boolean {
  return [...actual].sort().join(' ') === [...expected].sort().join(' ');
}

/**
 * Every way one page's policy departs from WT-19 and AAP 0.4.5, as readable sentences, so one case
 * reports all of a page's faults rather than the first.
 *
 * `configuration` selects the one expected value that is not fixed: `connect-src` names the endpoint
 * origin in `live` and only `'self'` everywhere else.
 */
function policyProblems(route: string, raw: string, configuration: Configuration): string[] {
  const problems: string[] = [];
  const directives = parsePolicy(raw);

  const defaultSrc = sourcesOf(directives, 'default-src');
  if (defaultSrc === null) {
    problems.push('no default-src directive');
  } else if (!sameSources(defaultSrc, [SELF])) {
    problems.push(`default-src is ${JSON.stringify(defaultSrc)}, and it must be exactly ${JSON.stringify([SELF])}`);
  }

  const expectedConnectSrc = configuration === 'live' ? [SELF, ENDPOINT_ORIGIN] : [SELF];
  const connectSrc = sourcesOf(directives, 'connect-src');
  if (connectSrc === null) {
    problems.push('no connect-src directive');
  } else if (!sameSources(connectSrc, expectedConnectSrc)) {
    problems.push(
      `connect-src is ${JSON.stringify(connectSrc)}, and the ${configuration} configuration must emit exactly ${JSON.stringify(expectedConnectSrc)}; the endpoint is named as its origin with no path`,
    );
  }

  for (const name of ['script-src', 'style-src']) {
    const sources = sourcesOf(directives, name);
    if (sources === null) {
      problems.push(`no ${name} directive`);
      continue;
    }
    for (const source of sources) {
      if (source !== SELF && !HASH_SOURCE.test(source)) {
        problems.push(`${name} carries ${source}, which is neither 'self' nor a per-page sha256 hash`);
      }
    }
  }

  for (const [name, sources] of directives) {
    for (const source of sources) {
      if (FORBIDDEN_TOKENS.includes(source)) {
        problems.push(`${name} carries ${source}`);
      }
      if (source === '*') {
        problems.push(`${name} carries the wildcard source *`);
      }
      if (/^data:/i.test(source)) {
        problems.push(`${name} carries the data: source ${source}`);
      }
      if (/^http:/i.test(source)) {
        problems.push(`${name} carries the insecure scheme source ${source}`);
      }
    }
  }

  return problems.map((problem) => `${route}: ${problem} (policy: ${raw})`);
}

/**
 * Arms the page to record every `securitypolicyviolation` before any page script runs.
 *
 * The listener is registered in the capture phase on `window`, so a record is kept whether the event
 * is dispatched at the document or at the element that caused it. Installing it through
 * `addInitScript` means the records cover the page's own load as well as everything a case injects
 * afterwards — a listener installed after `goto` could not tell an already-violating page from a
 * clean one.
 */
async function recordViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const violations: CspViolation[] = [];
    window.addEventListener(
      'securitypolicyviolation',
      (event) => {
        violations.push({
          effectiveDirective: event.effectiveDirective,
          violatedDirective: event.violatedDirective,
          blockedURI: event.blockedURI,
        });
      },
      true,
    );
    window.__cspViolations = violations;
  });
}

/** Every violation the page has recorded so far, in the order they fired. */
async function readViolations(page: Page): Promise<CspViolation[]> {
  return await page.evaluate(() => window.__cspViolations ?? []);
}

/**
 * Refuses every request matching the given patterns, so a policy that failed to block a stub host
 * still cannot reach a network. On a working policy these routes are never consulted: the renderer
 * rejects the request before it is issued, and the route is only the backstop.
 */
async function refuseRequests(page: Page, patterns: readonly string[]): Promise<void> {
  for (const pattern of patterns) {
    await page.route(pattern, (route) => route.abort());
  }
}

/**
 * Fetches `url` from inside the page and reports whether the promise settled or rejected. A URL the
 * policy refuses rejects with a `TypeError`; the distinction is the whole point, so it is reported
 * rather than allowed to throw out of the evaluation.
 */
async function attemptFetch(page: Page, url: string): Promise<'resolved' | 'rejected'> {
  return await page.evaluate(async (target) => {
    try {
      await fetch(target);
      return 'resolved' as const;
    } catch {
      return 'rejected' as const;
    }
  }, url);
}

/**
 * Appends an image for `url`, waits for it to settle, records what the browser made of it and
 * removes it again — so the document is left exactly as it was found (rule B-3).
 */
async function attemptImage(page: Page, url: string): Promise<{ event: 'load' | 'error'; naturalWidth: number }> {
  return await page.evaluate(async (target) => {
    const image = document.createElement('img');
    const settled = new Promise<'load' | 'error'>((resolve) => {
      image.addEventListener('load', () => resolve('load'), { once: true });
      image.addEventListener('error', () => resolve('error'), { once: true });
    });
    image.src = target;
    document.body.append(image);
    const event = await settled;
    const naturalWidth = image.naturalWidth;
    image.remove();
    return { event, naturalWidth };
  }, url);
}

/**
 * Appends a script for `url`, waits for it to settle, and reports whether the global it would have
 * defined exists. The script is removed again before the case ends (rule B-3).
 */
async function attemptScript(
  page: Page,
  url: string,
  globalName: string,
): Promise<{ event: 'load' | 'error'; globalDefined: boolean }> {
  return await page.evaluate(
    async ({ target, name }) => {
      const script = document.createElement('script');
      const settled = new Promise<'load' | 'error'>((resolve) => {
        script.addEventListener('load', () => resolve('load'), { once: true });
        script.addEventListener('error', () => resolve('error'), { once: true });
      });
      script.src = target;
      document.head.append(script);
      const event = await settled;
      const globalDefined = Object.hasOwn(window, name);
      script.remove();
      return { event, globalDefined };
    },
    { target: url, name: globalName },
  );
}

/**
 * Fills the enquiry form the way a person would, without reading a label: every control is located
 * structurally, a text or number control takes a value its own rule accepts, the email control takes
 * a well-formed address, and the consent checkbox is ticked. The hidden honeypot is avoided by
 * attribute, not by position, so a bot trap is never tripped by the test.
 */
async function fillEnquiryForm(page: Page): Promise<void> {
  const form = page.locator('form[data-enquiry-form]');
  await expect(
    form,
    'the live configuration sets PUBLIC_FORM_ENDPOINT, so /contact must render the enquiry form',
  ).toBeVisible();

  const controls = form.locator('input:not([type="hidden"]):not([hidden]), textarea:not([hidden])');
  const count = await controls.count();
  expect(count, 'the enquiry form must render its labelled controls').toBeGreaterThan(0);

  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index);
    const type = (await control.getAttribute('type')) ?? 'text';
    if (type === 'checkbox') {
      await control.check();
    } else {
      await control.fill(type === 'email' ? 'someone@example.com' : '1');
    }
  }
}

/**
 * Reports why one blocked resource's violation record does not fit the directives the policy
 * declares, or `null` when it fits.
 *
 * CSP fallback makes two spellings correct per resource: a type with no directive of its own is
 * checked against `default-src`, and CSP 3 names the element-level form of `script-src` for a
 * `<script src>`. Each resource therefore accepts its own directive or `default-src`, and nothing
 * else — a record naming some other directive is a different failure and is reported as one.
 */
function directiveProblem(
  record: CspViolation | undefined,
  accepted: readonly string[],
  resource: string,
): string | null {
  if (record === undefined) {
    return `${resource} raised no securitypolicyviolation record whose blockedURI named blocked.example`;
  }
  const seen = [record.effectiveDirective, record.violatedDirective];
  if (accepted.some((directive) => seen.includes(directive))) {
    return null;
  }
  return `${resource} reported effectiveDirective "${record.effectiveDirective}" and violatedDirective "${record.violatedDirective}"; expected one of ${accepted.join(', ')}`;
}

/* ------------------------------------------------------------------------------------------------
 * Case 1 — every route carries exactly one policy, with the directives WT-19 requires and none of
 * the relaxations it forbids. One case per route, so a page whose emitted policy differs from AAP
 * 0.4.5 is named by the run rather than folded into a single aggregate failure.
 * ---------------------------------------------------------------------------------------------- */

for (const route of EIGHT_PAGES) {
  test(`WT-19 ${route} carries one policy: default-src 'self', the configured connect-src, and hash-only script-src and style-src [${CONFIGURATION_SET}]`, async ({
    page,
  }) => {
    const configuration = currentConfiguration();
    await openPage(page, route);

    const raw = await readSinglePolicy(page, route);
    const problems = policyProblems(route, raw, configuration);

    expect(
      problems,
      `${route} in the ${configuration} configuration carries a policy that breaks WT-19:\n  ${problems.join('\n  ')}`,
    ).toEqual([]);
  });
}

/* ------------------------------------------------------------------------------------------------
 * Case 2 — the 404 document. WT-19 names it explicitly: it is not a navigable page, it is withheld
 * from every crawler in every configuration, and it must carry the same policy as the rest.
 * ---------------------------------------------------------------------------------------------- */

test(`WT-19 ${NOT_FOUND_DOCUMENT} carries the same policy as every page and stays noindex, nofollow [${CONFIGURATION_SET}]`, async ({
  page,
}) => {
  const configuration = currentConfiguration();
  await openPage(page, NOT_FOUND_DOCUMENT);

  /*
   * Identify the document before asserting anything about it: A8 gives the page-not-found copy a
   * title, a heading, a text and a link and no description, so the absent description meta is what
   * distinguishes this document from a page that happens to be served at the same address.
   */
  const descriptions = await page.locator('meta[name="description"]').count();
  expect(
    descriptions,
    `${NOT_FOUND_DOCUMENT} must be the page-not-found document, which carries no description meta, and carries ${descriptions}`,
  ).toBe(0);

  const robots = page.locator('meta[name="robots"]');
  expect(await robots.count(), `${NOT_FOUND_DOCUMENT} must carry exactly one robots meta`).toBe(1);
  expect(
    await robots.getAttribute('content'),
    `${NOT_FOUND_DOCUMENT} must stay noindex, nofollow even in the live configuration, because it is never indexable`,
  ).toBe('noindex, nofollow');

  const raw = await readSinglePolicy(page, NOT_FOUND_DOCUMENT);
  const problems = policyProblems(NOT_FOUND_DOCUMENT, raw, configuration);

  expect(
    problems,
    `${NOT_FOUND_DOCUMENT} in the ${configuration} configuration carries a policy that breaks WT-19:\n  ${problems.join('\n  ')}`,
  ).toEqual([]);
});

/* ------------------------------------------------------------------------------------------------
 * Case 3 — no `style` attribute and no inline event handler anywhere on a page. This is the
 * precondition the policy rests on: a hash-only policy covers inline <script> and <style> elements
 * but not attributes, which would need `'unsafe-hashes'` (AAP 0.4.5, 0.6.1).
 * ---------------------------------------------------------------------------------------------- */

test(`WT-19 no page carries a style attribute or an inline event handler, so the hash-only policy can hold [${CONFIGURATION_SET}]`, async ({
  page,
}) => {
  for (const route of INLINE_ATTRIBUTE_PAGES) {
    await openPage(page, route);

    const offending = await page.evaluate((attributes) => {
      const found: string[] = [];
      for (const attribute of attributes) {
        for (const element of Array.from(document.querySelectorAll(`[${attribute}]`))) {
          found.push(`[${attribute}] on ${element.outerHTML.slice(0, 160)}`);
        }
      }
      return found;
    }, [...INLINE_ATTRIBUTES]);

    expect(
      offending,
      `${route} must carry no style attribute and no inline event handler:\n  ${offending.join('\n  ')}`,
    ).toEqual([]);
  }
});

/* ------------------------------------------------------------------------------------------------
 * Cases 4 and 5 — the policy actually blocks foreign resources, and it does not block the site
 * itself. Both are needed: a listener that never fires would let the blocking assertions pass for
 * the wrong reason, and a policy that blocked its own origin would be a defect the directive
 * assertions alone cannot see.
 * ---------------------------------------------------------------------------------------------- */

for (const route of BLOCKED_RESOURCE_PAGES) {
  test(`WT-19 a foreign fetch, image and script are each blocked on ${route} and each raise a securitypolicyviolation [${CONFIGURATION_SET}]`, async ({
    page,
  }) => {
    await refuseRequests(page, [BLOCKED_PATTERN]);
    await recordViolations(page);
    await openPage(page, route);

    /*
     * The anti-vacuity guard, restated inside this case: the page must be able to reach its own
     * origin without a violation, or the three blocked attempts below would be measuring a page
     * whose policy refuses everything rather than one that refuses foreign sources.
     */
    const ownOrigin = await page.evaluate(async () => {
      const response = await fetch('/');
      return { ok: response.ok, violations: (window.__cspViolations ?? []).length };
    });
    expect(ownOrigin.ok, `${route} must be able to fetch its own origin`).toBe(true);
    expect(ownOrigin.violations, `a same-origin fetch must raise no violation on ${route}`).toBe(0);

    const fetchOutcome = await attemptFetch(page, `${BLOCKED}/`);
    expect(fetchOutcome, `fetch(${BLOCKED}/) must be refused by connect-src on ${route}`).toBe('rejected');

    const image = await attemptImage(page, `${BLOCKED}/pixel.png`);
    expect(image.event, `the image at ${BLOCKED}/pixel.png must fail rather than load on ${route}`).toBe('error');
    expect(image.naturalWidth, `the blocked image must have loaded no pixels on ${route}`).toBe(0);

    const script = await attemptScript(page, `${BLOCKED}/x.js`, '__cspBlockedProbe');
    expect(script.event, `the script at ${BLOCKED}/x.js must fail rather than load on ${route}`).toBe('error');
    expect(script.globalDefined, `the blocked script must have defined no global on ${route}`).toBe(false);

    const violations = await readViolations(page);
    expect(
      violations.map((violation) => `${violation.effectiveDirective}/${violation.violatedDirective} ${violation.blockedURI}`),
      `exactly three violations must be recorded on ${route} — one per blocked resource — because a silently ignored case would otherwise pass`,
    ).toHaveLength(3);

    /*
     * CSP fallback makes two spellings correct per resource: a type with no directive of its own is
     * checked against `default-src`, and CSP 3 names the element-level `script-src-elem` for a
     * `<script src>`. Each resource therefore accepts its own directive or `default-src`, and
     * nothing else.
     */
    const directiveProblems = [
      directiveProblem(
        violations.find((violation) => violation.blockedURI === `${BLOCKED}/`),
        ['connect-src'],
        `the blocked fetch on ${route}`,
      ),
      directiveProblem(
        violations.find((violation) => violation.blockedURI.endsWith('/pixel.png')),
        ['img-src', 'default-src'],
        `the blocked image on ${route}`,
      ),
      directiveProblem(
        violations.find((violation) => violation.blockedURI.endsWith('/x.js')),
        ['script-src', 'script-src-elem', 'default-src'],
        `the blocked script on ${route}`,
      ),
    ].filter((problem): problem is string => problem !== null);

    expect(directiveProblems, `a blocked resource reported the wrong directive:\n  ${directiveProblems.join('\n  ')}`).toEqual(
      [],
    );
  });
}

test(`WT-19 the policy does not block the site itself: a same-origin fetch is allowed and the island hashes are present [${CONFIGURATION_SET}]`, async ({
  page,
}) => {
  await recordViolations(page);
  await openPage(page, '/');

  const scripts = await page.locator('script').count();
  expect(
    scripts,
    'the home page ships the menu and accordion islands, so it must reference at least one script',
  ).toBeGreaterThan(0);

  const ownOrigin = await page.evaluate(async () => {
    const response = await fetch('/');
    return { ok: response.ok, violations: (window.__cspViolations ?? []).length };
  });
  expect(ownOrigin.ok, "a fetch of the site's own home page must resolve").toBe(true);
  expect(
    ownOrigin.violations,
    'the policy must raise no violation for a request to the page’s own origin, or the blocked-resource cases prove nothing',
  ).toBe(0);

  const raw = await readSinglePolicy(page, '/');
  const directives = parsePolicy(raw);
  const scriptSrc = directives.get('script-src') ?? [];
  const styleSrc = directives.get('style-src') ?? [];
  const hashes = [...scriptSrc, ...styleSrc].filter((source) => source.startsWith("'sha256-"));

  expect(
    hashes.length,
    `a page that ships an island must carry at least one sha256 hash in script-src or style-src; script-src is ${JSON.stringify(scriptSrc)} and style-src is ${JSON.stringify(styleSrc)}`,
  ).toBeGreaterThan(0);
});

/* ------------------------------------------------------------------------------------------------
 * Case 6 — the one foreign origin the policy may admit, and its absence. `live` names the endpoint
 * origin, so the form's post to it is allowed and answered by the fulfilled stub; the other three
 * name only `'self'`, so the same request is refused and reported. Both directions are asserted, so
 * no configuration gets a case that passes for want of an assertion.
 * ---------------------------------------------------------------------------------------------- */

test(`WT-19 the stubbed form post is allowed where the endpoint is configured and blocked where it is not [${CONFIGURATION_SET}]`, async ({
  page,
}) => {
  const configuration = currentConfiguration();
  await refuseRequests(page, [BLOCKED_PATTERN]);
  await recordViolations(page);
  await openPage(page, '/contact');

  const raw = await readSinglePolicy(page, '/contact');
  const connectSrc = sourcesOf(parsePolicy(raw), 'connect-src');

  if (configuration === 'live') {
    expect(
      sameSources(connectSrc ?? [], [SELF, ENDPOINT_ORIGIN]),
      `connect-src on /contact is ${JSON.stringify(connectSrc)}, and the live configuration must emit exactly ${JSON.stringify([SELF, ENDPOINT_ORIGIN])}`,
    ).toBe(true);

    /* The configured endpoint, answered inside this process: the post must reach it and succeed. */
    await page.route(ENDPOINT, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: '{"ok":true}',
      }),
    );

    await fillEnquiryForm(page);

    const [enquiry] = await Promise.all([
      page.waitForRequest((request) => request.url() === ENDPOINT && request.method() === 'POST'),
      page.locator('form[data-enquiry-form] button[type="submit"]').click(),
    ]);

    expect(enquiry.method(), `the enquiry must be sent as a POST to ${ENDPOINT}`).toBe('POST');
    expect(
      enquiry.headers()['accept'],
      'the enquiry must ask for a JSON answer, which is the only header the island sets',
    ).toBe('application/json');

    await expect(
      page.locator('[data-enquiry-confirmation]'),
      'a 2xx answer must replace the form with the confirmation, so the post was allowed rather than refused',
    ).toBeVisible();

    const violations = await readViolations(page);
    const namingEndpoint = violations.filter((violation) => violation.blockedURI.includes('forms.example'));
    expect(
      namingEndpoint,
      `connect-src names the endpoint origin, so no violation may mention it: ${JSON.stringify(namingEndpoint)}`,
    ).toEqual([]);
  } else {
    await refuseRequests(page, [ENDPOINT_FAMILY_PATTERN]);

    expect(
      connectSrc,
      `connect-src on /contact is ${JSON.stringify(connectSrc)}, and the ${configuration} configuration sets no endpoint, so it must be exactly ${JSON.stringify([SELF])}`,
    ).toEqual([SELF]);

    const outcome = await attemptFetch(page, ENDPOINT);
    expect(
      outcome,
      `the ${configuration} configuration names no endpoint origin, so fetch(${ENDPOINT}) must be refused by connect-src`,
    ).toBe('rejected');

    const violations = await readViolations(page);
    expect(
      violations.map((violation) => `${violation.effectiveDirective}/${violation.violatedDirective} ${violation.blockedURI}`),
      'the refused request must raise exactly one violation, and it must be the connect-src one',
    ).toHaveLength(1);

    const problem = directiveProblem(
      violations[0],
      ['connect-src'],
      `the refused request to ${ENDPOINT} on /contact`,
    );
    expect(
      problem,
      `the refused request to ${ENDPOINT} must be reported as a connect-src violation: ${problem ?? ''}`,
    ).toBeNull();
    expect(
      violations[0]?.blockedURI.includes('forms.example'),
      `the violation must name the endpoint host: ${JSON.stringify(violations[0])}`,
    ).toBe(true);
  }
});

/* ------------------------------------------------------------------------------------------------
 * Case 7 — the CSP complement of rule B-1: a plain load of a page reaches no origin but its own.
 * The capture reads both the requests the browser issued and the resource timings the page itself
 * recorded, so neither an event that arrived late nor one that never fired can hide a foreign load.
 * ---------------------------------------------------------------------------------------------- */

for (const route of PLAIN_LOAD_PAGES) {
  test(`WT-19 a plain load of ${route} requests nothing from a third-party host [${CONFIGURATION_SET}]`, async ({ page }) => {
    const issued: string[] = [];
    page.on('request', (request) => {
      issued.push(request.url());
    });

    await openPage(page, route);

    const recorded = await page.evaluate(() =>
      performance.getEntriesByType('resource').map((entry) => entry.name),
    );
    const attempted = [...issued, ...recorded];
    const origin = new URL(page.url()).origin;
    const foreign = attempted.filter((url) => {
      try {
        return new URL(url).origin !== origin;
      } catch {
        return true;
      }
    });

    expect(
      attempted.length,
      `the capture must observe the page's own requests, otherwise the check below proves nothing`,
    ).toBeGreaterThan(0);
    expect(
      foreign,
      `${route} must request nothing from another origin; it requested:\n  ${[...new Set(foreign)].join('\n  ')}`,
    ).toEqual([]);
  });
}

