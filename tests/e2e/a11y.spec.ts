/**
 * WT-05 — the accessibility gate: axe-core over every route at both main widths, failing on any
 * serious or critical violation (AAP 0.13.1, 0.14.4; rule B-3).
 *
 * **What is scanned.** All nine routes of the built site — the eight navigable pages plus the
 * not-found document at `/404.html`, which AAP 0.13.1's closing note puts inside "every page" — at
 * both main widths, 390 and 1440, exactly as WT-05 words them.
 *
 * **Where it is scanned.** In every browser configuration `playwright.config.ts` declares:
 * `default`, `live`, `mailto` and `screens`. AAP 0.13.1 names `default` and `live` as the floor;
 * the other two serve the same nine routes with a different state of `/contact` and of
 * `/platform/site-intelligence`, and each of those states has to clear the same bar, so scanning
 * all four is a superset of the floor rather than a relaxation of it.
 *
 * **How it fails.** Never by narrowing. No rule is disabled, no tag filter reduces the ruleset, no
 * region is excluded from the document, no severity is remapped, no case is skipped, marked as
 * expected to fail, or retried (rule B-3, AAP 0.13.5). The builder is given the page and nothing
 * else, so it scans the whole document with axe's own default ruleset, and the floor is the
 * `serious`/`critical` severity pair the request fixes. A `minor` or `moderate` finding is left
 * where it is: the floor may be neither raised nor lowered from here.
 *
 * **What it refuses to accept as a pass.** A scan that produced no passing checks did not evaluate
 * the document, and a document that is blank, half-rendered or the wrong route would produce
 * exactly that, so each case asserts the page it is about to measure first — a non-empty title, the
 * single `h1` and the one `main` landmark every route renders — and then asserts that axe really
 * ran (`testEngine.name`) and really found passing checks. The contrast rule is asserted to have
 * executed as well, because WCAG 1.4.3 is part of rule B-3 and it is the one rule that reports
 * itself inapplicable on a page with no text to measure.
 *
 * **What it does not do.** It asserts no copy: `tests/fixtures/website-content-specification.md` is
 * the fidelity harness's source, and the content modules may legitimately hold the specification's
 * placeholders until the owner supplies those pages, so nothing here reads a string of the site's
 * text. It names no host and no port — every request is a relative path against the project's own
 * `baseURL`, so the scan only ever observes the served build on loopback (rule B-1). It reads no
 * environment variable and holds no credential (rule B-2), and it drives no server route, session
 * or stored enquiry (rule W-2): the form is measured as rendered on `/contact`, never submitted —
 * submission belongs to `form.spec.ts`.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/** The axe result shape, taken from the pinned builder rather than from a second dependency. */
type AxeScan = Awaited<ReturnType<AxeBuilder['analyze']>>;

/** One rule's finding, as axe reports it in any of its four result groups. */
type RuleFinding = AxeScan['violations'][number];

/**
 * The four configurations AAP 0.13.2 builds for a browser. `playwright.config.ts` declares one
 * project per entry, and each project's server builds and serves its own configuration, so the
 * project name is the configuration name.
 */
const CONFIGURATIONS = ['default', 'live', 'mailto', 'screens'] as const;
type Configuration = (typeof CONFIGURATIONS)[number];

/**
 * The configuration list a title carries. A title is fixed when the file is collected, before any
 * project is known, so it names the whole set the case runs in rather than the one it is running as.
 */
const CONFIGURATION_LABEL = CONFIGURATIONS.join(' | ');

/**
 * The eight navigable pages, in the order AAP 0.4.2 lists them. Deliberately declared here rather
 * than imported: a spec owns its own constants, and reading the route list from `src/` would make a
 * route added there silently unmeasured here.
 */
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
 * The ninth route. A static build emits the not-found page as a real file at the output root, so it
 * is loaded directly rather than through a path the server answers with a 404 status.
 */
const NOT_FOUND_DOCUMENT = '/404.html';

/** The two main widths WT-05 names, and the whole set of them. */
const WIDTHS = [390, 1440] as const;
type Width = (typeof WIDTHS)[number];

/** The viewport height every width is measured at, held constant so only the width varies. */
const VIEWPORT_HEIGHT = 900;

/**
 * The severity floor rule B-3 fixes. A finding at either impact fails the case; nothing at a lower
 * impact is reported as one, and nothing here promotes a lower impact to this pair.
 */
const BLOCKING_IMPACT: readonly string[] = ['serious', 'critical'];

/**
 * The configuration the case is running in, from the project Playwright selected. A project that is
 * not one of the four is a defect in the runner rather than a case to run, so it stops the case
 * instead of measuring an unlabelled configuration.
 */
function configurationOf(): Configuration {
  const name = test.info().project.name;
  const known = CONFIGURATIONS.find((configuration) => configuration === name);
  if (known === undefined) {
    throw new Error(
      `a11y: this case ran in the "${name}" project, which is not one of the browser configurations (${CONFIGURATION_LABEL}). The accessibility gate measures the four built configurations and cannot label a result it cannot name.`,
    );
  }
  return known;
}

/** The route, width and configuration a failure names, since the same route is scanned eight times. */
function contextFor(route: string, width: Width, configuration: Configuration): string {
  return `${route} at ${String(width)}px in the ${configuration} configuration`;
}

/**
 * The action a reviewer needs from a failing scan: each offending rule's id, impact and help text,
 * then every element it was reported on, so the finding can be acted on without rerunning the case.
 * A shadow-DOM selector arrives as a list and is joined into one path.
 */
function describeFindings(findings: readonly RuleFinding[]): string {
  return findings
    .map((finding) => {
      const targets = finding.nodes
        .map((node) =>
          node.target
            .map((selector) => (Array.isArray(selector) ? selector.join(' ') : selector))
            .join(' >> '),
        )
        .join(' | ');
      return `  - ${finding.id} [${finding.impact ?? 'unknown'}] ${finding.help}\n    at: ${targets}`;
    })
    .join('\n');
}

/**
 * The page-identity guard, run before the scan so a blank or wrong document cannot produce an
 * empty, passing scan. One `h1` and one `main` are what every route renders (AAP 0.8.1, 0.14.4);
 * the title is asserted to be present rather than to say anything in particular, because the copy
 * is the fidelity harness's business and not this file's.
 */
async function assertPageIdentity(page: Page, context: string): Promise<void> {
  /* A route with no title did not render, and a document with no text gives axe nothing to measure. */
  await expect(page, `${context}: the document has no title, so the page did not render`).toHaveTitle(/\S/);
  /* One page heading and one main region: AAP 0.8.1's shell, and the two landmarks axe expects. */
  await expect(page.locator('h1'), `${context}: the page must render exactly one h1`).toHaveCount(1);
  await expect(page.locator('main'), `${context}: the page must render exactly one main landmark`).toHaveCount(1);
}

/**
 * The scan itself: axe over the whole document with its default ruleset, a guard that the scan ran,
 * and the serious/critical floor. `analyze()` is given the page alone, so no rule, tag or region is
 * narrowed (rule B-3, AAP 0.13.5).
 */
async function assertNoBlockingViolations(page: Page, context: string): Promise<void> {
  const results: AxeScan = await new AxeBuilder({ page }).analyze();

  expect(results, `${context}: axe returned no result object`).toBeTruthy();
  expect(
    results.testEngine?.name,
    `${context}: the result did not come from the axe engine, so the scan did not run`,
  ).toBe('axe-core');
  expect(
    Array.isArray(results.violations),
    `${context}: the result carries no violations array, so the scan did not complete`,
  ).toBe(true);
  expect(
    results.passes.length,
    `${context}: axe reported no passing checks, so it did not evaluate the document and an empty result must not pass`,
  ).toBeGreaterThan(0);

  const blocking = results.violations.filter((violation) =>
    BLOCKING_IMPACT.includes(violation.impact ?? ''),
  );
  expect(
    blocking,
    `${context}: axe reported ${String(blocking.length)} serious or critical violation(s):\n${describeFindings(blocking)}`,
  ).toEqual([]);

  /*
   * WCAG 1.4.3 is part of rule B-3, so the contrast rule is asserted to have executed rather than
   * merely to be absent from the violations. It reports itself inapplicable on a document with no
   * text to measure, which is a failure of the page rather than a pass.
   */
  const contrast = [...results.passes, ...results.incomplete, ...results.violations].find(
    (finding) => finding.id === 'color-contrast',
  );
  expect(
    contrast,
    `${context}: the color-contrast rule did not execute, so the 4.5:1 requirement of rule B-3 was not measured`,
  ).toBeDefined();
  expect(
    results.inapplicable.some((finding) => finding.id === 'color-contrast'),
    `${context}: the color-contrast rule was inapplicable, which means the page rendered no text to measure`,
  ).toBe(false);
  expect(
    results.violations.some((finding) => finding.id === 'color-contrast'),
    `${context}: the color-contrast rule reported a failure:\n${describeFindings(results.violations.filter((finding) => finding.id === 'color-contrast'))}`,
  ).toBe(false);
}

/**
 * Registers one page's case at one width: load the route, check the page is the page, then scan it.
 * A free function rather than an inline callback keeps each registered case to its own three steps,
 * and each registration is one Playwright test, so a failing route, width or configuration is one
 * reported result that names all three.
 */
function definePageScan(route: string, width: Width): void {
  test(`[WT-05] ${route} at ${String(width)} has no serious or critical axe violation — ${CONFIGURATION_LABEL}`, async ({
    page,
  }) => {
    const configuration = configurationOf();
    const context = contextFor(route, width, configuration);

    await page.goto(route, { waitUntil: 'load' });
    await assertPageIdentity(page, context);
    await assertNoBlockingViolations(page, context);
  });
}

/**
 * Registers the not-found document's case at one width. AAP 0.13.1 puts the 404 inside "every page",
 * and the route a run forgets would be the one page nobody ever measured, so it gets the same scan
 * on the same bar — reached at the file the static build emits rather than through a 404 response.
 */
function defineNotFoundScan(width: Width): void {
  test(`[WT-05] ${NOT_FOUND_DOCUMENT} at ${String(width)} has no serious or critical axe violation — ${CONFIGURATION_LABEL}`, async ({
    page,
  }) => {
    const configuration = configurationOf();
    const context = contextFor(NOT_FOUND_DOCUMENT, width, configuration);

    await page.goto(NOT_FOUND_DOCUMENT, { waitUntil: 'load' });

    /*
     * A document that quietly served one of the eight pages would otherwise pass here, so the
     * not-found page is identified structurally before it is measured: it is the one route A8 gives
     * no description, and the one route withheld from crawlers in every configuration (AAP 0.4.2,
     * 0.4.3). Neither check reads a string of the page's copy.
     */
    await expect(
      page.locator('meta[name="description"]'),
      `${context}: the document carries a description meta, so it is not the not-found page`,
    ).toHaveCount(0);

    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(
      robots,
      `${context}: the not-found page must carry a robots meta that withholds it from crawlers`,
    ).not.toBeNull();
    expect(robots ?? '', `${context}: the not-found page must be noindex`).toMatch(/noindex/i);
    expect(robots ?? '', `${context}: the not-found page must be nofollow`).toMatch(/nofollow/i);

    await assertPageIdentity(page, context);
    await assertNoBlockingViolations(page, context);
  });
}

for (const width of WIDTHS) {
  test.describe(`[WT-05] axe scan at ${String(width)}px`, () => {
    test.use({ viewport: { width, height: VIEWPORT_HEIGHT } });

    for (const route of EIGHT_PAGES) {
      definePageScan(route, width);
    }

    defineNotFoundScan(width);
  });
}
