/**
 * tests/e2e/pages.spec.ts — WT-04 and WT-06 (AAP 0.13.1, 0.13.3; `npm run test:e2e`).
 *
 * Two requirements, one file, in a real browser against the artefact that ships.
 *
 * - **WT-04** — every route, the page-not-found document included, renders at 320, 360, 390, 1440
 *   and 1920 CSS pixels with no console error, no uncaught exception, no horizontal scroll and no
 *   request to a host other than the site's own.
 * - **WT-06** — the skip link, the mobile menu, every accordion and the form are operable by
 *   keyboard alone; every focused interactive element shows a visible focus indicator; and under
 *   `prefers-reduced-motion: reduce` nothing animates.
 *
 * What this file deliberately does not do. It does not run axe-core (that is `a11y.spec.ts`,
 * WT-05), does not drive the form's three states or its network outcomes (`form.spec.ts`, WT-07),
 * does not assert the product-screen fallback (`screens.spec.ts`, WT-12), does not crawl links
 * (`reachability.spec.ts`, WT-17) and does not assert the content security policy
 * (`csp.spec.ts`, WT-19). The file-level criteria — residue, tokens, secrets, copy fidelity,
 * indexability, the launch guard — belong to `tests/static/*.test.ts`, the quality gate to
 * `tests/lighthouse/run.ts`, and the review screenshots to `scripts/screenshots.ts`.
 *
 * How the suite reaches a site, and why it never builds or serves one itself. `playwright.config.ts`
 * declares four projects — `default`, `live`, `mailto` and `screens` — and backs each with its own
 * `webServer`, which builds that configuration through `tests/helpers/build.ts` and serves the
 * result on that project's port. This file therefore loads relative paths through the project's
 * `baseURL` and names no port, no origin and no host: a project's base address is the runner's, and
 * a literal here would both duplicate it and pin the suite to one checkout's numbering.
 *
 * How every configuration is covered without a single skip. All four projects serve the same nine
 * routes, so every test below applies in every project and none is guarded by the project name.
 * The one genuine difference is the contact form, which exists only where `PUBLIC_FORM_ENDPOINT` is
 * configured: `live` renders it and the keyboard path through it is asserted there, while
 * `default`, `mailto` and `screens` render no form at all (AAP 0.9.3) and the same test asserts the
 * complementary invariant — no `form` element, and the designed state instead of one, with the
 * mailto link focusable where an address is configured and no dead control anywhere. A test body is
 * never empty in any project, nothing is marked skipped, fixed or expected to fail, and the
 * project name is validated against the four configurations before every test so a renamed or
 * added project fails loudly rather than falling into the wrong branch.
 *
 * Copy independence. The content specification is not readable from this checkout, so the copy
 * layer carries the plan's placeholder marker for the strings it owns. No assertion here therefore
 * holds an A-copy string: everything is located structurally — element, role, `for`/`id`
 * association, `aria-*` state, `href`, count — and asserted as a relation (non-empty, equal across
 * siblings, absent in the other state, changed after a transition). Where a rendered string is the
 * subject of the assertion, its length is read from the DOM first and an empty one fails with a
 * message naming the copy module that owes it, so no check can pass by vacuity. The only literals
 * in this file are the route paths of AAP 0.4.2, the plan's own stub address for the configured
 * contact email, and the numbers AAP and WCAG fix.
 *
 * What the project rules require of this file, and where each is honoured:
 *
 * - **W-1** — the design reference supplies layout and style only. Nothing in this file names a
 *   string, place or frame from it; the vocabulary it uses is the AAP's own (page top, accordion,
 *   row, band).
 * - **B-1** — no runtime request to a third-party host. This file is the browser-side half of that
 *   proof: every request a load makes is captured and asserted same-origin, and no test performs a
 *   request of its own. The only address it knows is the loopback origin the runner serves.
 * - **B-2** — no secret, no configured value, no environment read. The one address below is the
 *   plan's documented example stub, not a credential, and it arrives in the page from the harness's
 *   own environment rather than from this file.
 * - **B-3** — WCAG 2.2 AA is what most of this file exists for: keyboard operation of every
 *   control (tests 4–7), a visible focus indicator at a 2 px floor (test 8), reduced motion (test
 *   9) and reflow with no horizontal scroll at 320 px (test 1). The floors are the rule's own and
 *   none is softened; a missing control fails naming the page rather than passing quietly.
 * - **B-4** — nothing invented, no dead control. Locators are structural, so no expected string is
 *   authored here; and the menus, accordions and form the tests drive are the site's real controls,
 *   each of which performs its function on the built page.
 * - **W-2** — the site is static. No test asserts a server route, a session or a stored enquiry; the
 *   form is exercised only as markup and keyboard behaviour, never by submitting it, and the
 *   submission itself belongs to `form.spec.ts`.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/* ================================================================================================
 * Constants
 * ============================================================================================== */

/**
 * The four configurations AAP 0.13.2 builds for the browser, and the four project names
 * `playwright.config.ts` declares. The two lists are the same list: the harness types its own
 * `ConfigurationName` against them, and `configurationOf` below refuses a project name that is not
 * one of these, so a fifth project cannot silently take a branch meant for another state.
 */
const CONFIGURATIONS = ['default', 'live', 'mailto', 'screens'] as const;

/** One of the four browser configurations, as the running project is named. */
type Configuration = (typeof CONFIGURATIONS)[number];

/**
 * The eight navigable routes of AAP 0.4.2, in the order the sitemap lists them. Local on purpose:
 * a check that verified a route list by importing the product's own copy of it could not detect a
 * route missing from both, so the expected set is written here and nowhere else in this file.
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
 * The page-not-found document. AAP 0.4.2 emits it as `404.html` at the root of the build, so it is
 * a real file rather than a status the server chooses, and every build carries it — which is why
 * this file can load it directly and needs no console filter for a failed document request.
 */
const NOT_FOUND_DOCUMENT = '/404.html';

/** One width the suite renders at, and whether it claims reflow alone. */
interface WidthCase {
  /** The viewport width in CSS pixels. */
  readonly width: number;
  /**
   * `true` for 320, which rule B-3 names for reflow and nothing else: at that width the suite
   * claims no horizontal scroll and a rendered heading, and asserts no geometry the design never
   * promised. The four design widths claim the full set.
   */
  readonly reflowOnly: boolean;
}

/**
 * The five widths the suite renders at: the three narrow ones the request and rule B-3 name, the
 * design's two artboard widths, and the widest the layout has to survive. 320 is a reflow check
 * only; 360 is the low end of the range the layout is designed for; 390 and 1440 are the two
 * widths of the design reference; 1920 proves the content column centres instead of stretching.
 */
const WIDTHS: readonly WidthCase[] = [
  { width: 320, reflowOnly: true },
  { width: 360, reflowOnly: false },
  { width: 390, reflowOnly: false },
  { width: 1440, reflowOnly: false },
  { width: 1920, reflowOnly: false },
];

/**
 * The height every width is rendered at. Fixed so a viewport differs from its sibling only in the
 * dimension under test, and tall enough that the header, a page top and the first section are in
 * view without scrolling.
 */
const VIEWPORT_HEIGHT = 900;

/**
 * The breakpoint at which the header stops collapsing into the menu, in CSS pixels — the plan's own
 * 900 px step (PA-5), the same value the theme's `--breakpoint-wide` declares. The suite does not
 * read the stylesheet for it: the value is what decides which side of the breakpoint a viewport is
 * on, so it is stated here and every menu expectation is derived from it by comparison.
 */
const MOBILE_MENU_MAX_WIDTH = 900;

/**
 * The number of global navigation items A0 defines: the five-link header navigation and the same
 * five links in the footer (FR-3). Used as the expected count on both sides of the breakpoint, so a
 * dropped or duplicated item fails instead of passing on a bare non-empty list.
 */
const GLOBAL_NAV_ITEMS = 5;

/**
 * The three routes the keyboard, focus and motion sweeps walk. Each composition carries a different
 * set of interactive surfaces — the home page has the value list and the bands, `/sovereignty` the
 * ten-row list of controls, `/contact` the enquiry block — so together they exercise every control
 * shape the site renders.
 */
const KEYBOARD_ROUTES = ['/', '/sovereignty', '/contact'] as const;

/**
 * The plan's stub value for `PUBLIC_CONTACT_EMAIL`, which the harness sets for the `live` and
 * `mailto` configurations. It is the plan's documented example address and not a credential (rule
 * B-2), and it is the only address this file knows: in the `mailto` project the anchor carrying it
 * is the designed state that replaces the form, so the test has to be able to look for it.
 */
const STUB_CONTACT_EMAIL = 'hello@site.example';

/** The element types WCAG 2.2 counts as interactive, and the set test 8 holds to a focus ring. */
const INTERACTIVE_TAGS: readonly string[] = ['a', 'button', 'summary', 'input', 'textarea', 'select'];

/**
 * How many Tab presses one focus-indicator sweep may take. A bound, not a sleep: the sweep stops at
 * the first interactive element it has already seen, and this cap only stops a page with an
 * unusually long tab order from turning one test into an unbounded walk.
 */
const MAX_TAB_STOPS = 25;

/**
 * The narrowest a focus indicator may be and still satisfy rule B-3: the theme draws both rings at
 * 2 px with a 2 px offset, one on the Cream ground and one on each dark band, so 2 is the rule's
 * floor rather than a value this file chooses.
 */
const MIN_FOCUS_OUTLINE_WIDTH = 2;

/** The two viewport widths the design widths are named for, used where a test spans the breakpoint. */
const NARROW_VIEWPORT = 390;
const WIDE_VIEWPORT = 1440;

/* ================================================================================================
 * Helpers
 * ============================================================================================== */

/**
 * What one page recorded while a route was loaded: its error output and every request it made.
 *
 * The listeners are attached before any navigation because a console message raised during the
 * document's own parse would otherwise be missed, and nothing is filtered: no message is
 * allowlisted, so an error the site introduces fails the route that introduced it.
 */
interface Observations {
  /** Everything the page logged at error level, in the order the browser reported it. */
  readonly consoleErrors: string[];
  /** Every uncaught exception the page raised. */
  readonly pageErrors: string[];
  /** Every request URL the page issued, in request order. */
  readonly requests: string[];
}

/** Attaches the three listeners a route's assertions read, and returns the arrays they fill. */
function observe(page: Page): Observations {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requests: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  page.on('request', (request) => {
    requests.push(request.url());
  });

  return { consoleErrors, pageErrors, requests };
}

/**
 * The configuration the running project stands for, validated against the four names the harness
 * builds.
 *
 * Every test in this file applies in every project, so a test does not branch on the name until it
 * has to; when it does, it gets the narrowed type from here rather than an unchecked cast, and a
 * project named something else fails with a message naming both sides instead of quietly taking the
 * `live` branch because that is the branch an unrecognised name falls through to.
 */
function configurationOf(projectName: string): Configuration {
  const match = CONFIGURATIONS.find((configuration) => configuration === projectName);

  if (match === undefined) {
    throw new Error(
      `this spec knows the four browser configurations (${CONFIGURATIONS.join(', ')}) and the running project is named "${projectName}". A project outside that set would take a branch meant for another state, so it is refused here rather than asserted against (AAP 0.13.2).`,
    );
  }

  return match;
}

/**
 * The origin a load's requests have to share, read from the document the browser actually reached
 * rather than from configuration, so the assertion compares the page against its own address.
 */
function originOf(page: Page): string {
  return new URL(page.url()).origin;
}

/**
 * The URL a route answers on, as the address the browser would have requested if the load had
 * failed and a redirect had left it somewhere else. Used only in failure messages.
 */
function describeRoute(route: string, width: number): string {
  return `route ${route} at ${width} px`;
}

/* ================================================================================================
 * Test 0 — every test runs in one of the four configurations
 * ============================================================================================== */

/*
 * Runs before every test in every project, so the project name is validated once per test rather
 * than only where a branch reads it, and a mis-named project fails at the first test instead of at
 * the one test that happened to compare it. It asserts nothing about the page: it is the guard that
 * makes "every test applies in every configuration" true rather than assumed.
 */
test.beforeEach(() => {
  const configuration = configurationOf(test.info().project.name);

  expect(
    CONFIGURATIONS.includes(configuration),
    `the running project "${configuration}" must be one of ${CONFIGURATIONS.join(', ')}`,
  ).toBe(true);
});

/* ================================================================================================
 * Test 1 — WT-04: every route renders clean at every width
 * ============================================================================================== */

/*
 * One describe per width, so a failure names the width it happened at instead of burying it inside a
 * loop, and so the viewport is declared once per width through `test.use` rather than reset inside a
 * test body. Both values come from the same `WIDTHS` constant the assertions read, so the width the
 * report names and the width the browser rendered at cannot disagree.
 */
for (const { width, reflowOnly } of WIDTHS) {
  test.describe(`every route at ${width} px${reflowOnly ? ' (reflow only)' : ''}`, () => {
    test.use({ viewport: { width, height: VIEWPORT_HEIGHT } });

    test(`[WT-04] every route renders with no console error, no uncaught exception and no horizontal scroll — ${CONFIGURATIONS.join(' | ')}`, async ({
      page,
    }) => {
      const observed = observe(page);
      const routes: readonly string[] = [...EIGHT_PAGES, NOT_FOUND_DOCUMENT];
      let rendered = 0;

      for (const route of routes) {
        const errorsBefore = observed.consoleErrors.length;
        const exceptionsBefore = observed.pageErrors.length;

        /* `load` rather than `domcontentloaded`: the islands' module scripts have run by then, which
           is what makes the menu trigger revealed and the accordion glyphs synced. */
        const response = await page.goto(route, { waitUntil: 'load' });

        expect(
          response,
          `${describeRoute(route, width)} returned no document response at all`,
        ).not.toBeNull();

        const layout = await page.evaluate(() => {
          const root = document.documentElement;
          const headings = document.querySelectorAll('h1');
          const heading = headings.length === 1 ? headings[0] ?? null : null;
          const box = heading === null ? null : heading.getBoundingClientRect();

          return {
            scrollWidth: root.scrollWidth,
            clientWidth: root.clientWidth,
            headings: headings.length,
            headingCharacters: (heading?.textContent ?? '').trim().length,
            headingWidth: box?.width ?? 0,
            headingHeight: box?.height ?? 0,
            header: document.querySelectorAll('header').length,
            main: document.querySelectorAll('main#main').length,
            footer: document.querySelectorAll('footer').length,
          };
        });

        /*
         * No tolerance: a scrollbar's worth of overflow is a defect in the stylesheet that the
         * stylesheet has to fix, and widening the assertion would hide it at every width at once.
         */
        expect(
          layout.scrollWidth,
          `${describeRoute(route, width)} scrolls horizontally: documentElement.scrollWidth is ${layout.scrollWidth} against a clientWidth of ${layout.clientWidth}. The page must fit its viewport at every width from 320 px up (rule B-3, WT-04).`,
        ).toBeLessThanOrEqual(layout.clientWidth);

        expect(
          layout.headings,
          `${describeRoute(route, width)} must render exactly one h1, and rendered ${layout.headings}`,
        ).toBe(1);

        expect(
          layout.headingCharacters,
          `${describeRoute(route, width)} renders an empty h1. Every heading is copy and comes from src/content, so an empty one means the page module that carries it has no string for it (AAP 0.7.2, rule B-4).`,
        ).toBeGreaterThan(0);

        if (reflowOnly) {
          /* At 320 px the claim is reflow alone: the heading is rendered, not a zero-sized box. */
          expect(
            layout.headingWidth,
            `${describeRoute(route, width)} renders an h1 with no width; at the reflow width the heading must still occupy its column (rule B-3)`,
          ).toBeGreaterThan(0);
          expect(
            layout.headingHeight,
            `${describeRoute(route, width)} renders an h1 with no height; at the reflow width the heading must still be laid out (rule B-3)`,
          ).toBeGreaterThan(0);
        } else {
          expect(
            layout.header,
            `${describeRoute(route, width)} must render the one header landmark and rendered ${layout.header}`,
          ).toBe(1);
          expect(
            layout.main,
            `${describeRoute(route, width)} must render the one main landmark with id "main" and rendered ${layout.main}`,
          ).toBe(1);
          expect(
            layout.footer,
            `${describeRoute(route, width)} must render the one footer landmark and rendered ${layout.footer}`,
          ).toBe(1);
        }

        expect(
          observed.consoleErrors.slice(errorsBefore),
          `${describeRoute(route, width)} logged console errors: ${observed.consoleErrors.slice(errorsBefore).join(' | ')}`,
        ).toEqual([]);

        expect(
          observed.pageErrors.slice(exceptionsBefore),
          `${describeRoute(route, width)} raised uncaught exceptions: ${observed.pageErrors.slice(exceptionsBefore).join(' | ')}`,
        ).toEqual([]);

        rendered += 1;
      }

      /* The count guard: the loop above is the whole claim, so it has to have covered every route. */
      expect(
        rendered,
        `every route must have been rendered at ${width} px, and ${rendered} of ${routes.length} were`,
      ).toBe(routes.length);
    });
  });
}


/* ================================================================================================
 * Test 2 — WT-04 and rule B-1: nothing a page loads comes from another host
 * ============================================================================================== */

/*
 * Rule B-1's runtime half. The fonts are vendored, the icons are inlined at build time and the one
 * outbound call the site can make is the enquiry post, which no load makes; so every request a
 * route issues has to share the page's own origin. The capture runs at both design widths because a
 * narrower viewport is where a substituted remote asset would most plausibly slip in.
 *
 * The three routes are the ones whose loads differ most: the home page pulls the panelled bands,
 * `/sovereignty` the longest list, `/contact` the heaviest page top. A request count per route is
 * asserted before the origins are, so a page that requested nothing at all — a broken document, a
 * navigation that never happened — fails instead of passing on an empty list.
 */
test(`[WT-04] no request leaves the page's own origin — ${CONFIGURATIONS.join(' | ')}`, async ({
  page,
}) => {
  const observed = observe(page);
  const routes = ['/', '/contact', '/sovereignty'] as const;
  const widths = [NARROW_VIEWPORT, WIDE_VIEWPORT] as const;
  let checked = 0;

  for (const width of widths) {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });

    for (const route of routes) {
      const requestsBefore = observed.requests.length;

      await page.goto(route, { waitUntil: 'load' });

      const requested = observed.requests.slice(requestsBefore);
      const origin = originOf(page);

      expect(
        requested.length,
        `${describeRoute(route, width)} issued no request at all, so there is nothing to prove about its origins; the document itself must at least have been fetched`,
      ).toBeGreaterThan(0);

      const foreign = requested.filter((url) => {
        try {
          return new URL(url).origin !== origin;
        } catch {
          /* A URL the runtime cannot parse is not this origin, and is reported as a finding. */
          return true;
        }
      });

      expect(
        foreign,
        `${describeRoute(route, width)} loaded from a host other than its own origin ${origin}: ${foreign.join(', ')}. Fonts, icons, styles and scripts are all bundled and no third-party host may be contacted at runtime (rule B-1).`,
      ).toEqual([]);

      checked += 1;
    }
  }

  expect(
    checked,
    `every route must have been loaded at both widths, and ${checked} of ${routes.length * widths.length} were`,
  ).toBe(routes.length * widths.length);
});

/* ================================================================================================
 * Test 3 — WT-04: the page-not-found document is identifiable and withheld
 * ============================================================================================== */

/*
 * The 404 is identified structurally, never by copy, and the identification is discriminating: the
 * suite first proves that a page with A8 metadata carries exactly one description, then proves that
 * the page-not-found document carries none at all. That contrast is the property itself — a title
 * and no description — so the two loads together are what identify the document rather than one
 * load and an assumption about it.
 *
 * The one anchor to the home route is counted inside the `main` landmark. The global shell's own
 * navigation and footer legitimately link there too, on every route including this one, so the
 * document-wide count is not the 404's property; the page's own way out of the dead end is.
 */
test(`[WT-04] the page-not-found document is identifiable by its metadata and withheld from indexing — ${CONFIGURATIONS.join(' | ')}`, async ({
  page,
}) => {
  await page.goto('/', { waitUntil: 'load' });

  const described = await page.evaluate(() => {
    const descriptions = [...document.querySelectorAll('meta[name="description"]')];

    return {
      count: descriptions.length,
      characters: (descriptions[0]?.getAttribute('content') ?? '').trim().length,
    };
  });

  expect(
    described.count,
    'a page with A8 metadata must carry exactly one meta description, and the home page carried a different number, so the page-not-found document cannot be identified by its absence here (WT-15)',
  ).toBe(1);
  expect(
    described.characters,
    'the home page renders an empty meta description, so its description is copy the content layer owes (AAP 0.7.2)',
  ).toBeGreaterThan(0);

  const response = await page.goto(NOT_FOUND_DOCUMENT, { waitUntil: 'load' });

  expect(
    response,
    `the page-not-found document ${NOT_FOUND_DOCUMENT} returned no response; every build emits it as a real file (AAP 0.4.2)`,
  ).not.toBeNull();

  const notFound = await page.evaluate(() => {
    const robots = document.querySelector('meta[name="robots"]');
    const homeAnchors = [...document.querySelectorAll('main#main a[href]')].filter(
      (anchor) => anchor.getAttribute('href') === '/',
    );

    return {
      descriptions: document.querySelectorAll('meta[name="description"]').length,
      robots: robots?.getAttribute('content') ?? '',
      headings: document.querySelectorAll('h1').length,
      headingCharacters: (document.querySelector('h1')?.textContent ?? '').trim().length,
      homeAnchors: homeAnchors.length,
      homeAnchorVisible: homeAnchors.some((anchor) => anchor.getClientRects().length > 0),
    };
  });

  expect(
    notFound.descriptions,
    `the page-not-found document must carry no description tag at all rather than an empty or invented one, and carried ${notFound.descriptions}`,
  ).toBe(0);

  expect(
    notFound.robots,
    `the page-not-found document must carry "noindex, nofollow" in every configuration and carried "${notFound.robots}"`,
  ).toContain('noindex');
  expect(notFound.robots).toContain('nofollow');

  expect(
    notFound.headings,
    `the page-not-found document must render exactly one h1 and rendered ${notFound.headings}`,
  ).toBe(1);
  expect(
    notFound.headingCharacters,
    'the page-not-found document renders an empty h1, so src/content/not-found.ts owes that heading (AAP 0.7.2)',
  ).toBeGreaterThan(0);

  expect(
    notFound.homeAnchors,
    `the page-not-found document must offer exactly one way back to the home route inside its main landmark and offered ${notFound.homeAnchors}`,
  ).toBe(1);
  expect(
    notFound.homeAnchorVisible,
    'the page-not-found document\'s link home is not rendered, so the route is a dead end for a reader (rule B-4)',
  ).toBe(true);
});


/* ================================================================================================
 * Test 4 — WT-06: the skip link is the first thing a keyboard reaches
 * ============================================================================================== */

/*
 * The skip link is how a keyboard reader bypasses the header, so it has to be the document's first
 * focusable element, it has to be reachable while it is still out of sight — it sits above the
 * viewport until focused — and it has to come into view the moment it holds focus. All three are
 * asserted at both design widths, because both of them render the same header and both of them are
 * widths a reader actually uses.
 *
 * The link is located by its target rather than by its class: an anchor whose `href` is `#main` is
 * the skip link whatever it is styled as, and the element it targets is asserted present in the
 * same pass so the control cannot be a link to nowhere (rule B-4).
 */
test(`[WT-06] the skip link is the first focusable element and becomes visible when focused — ${CONFIGURATIONS.join(' | ')}`, async ({
  page,
}) => {
  const widths = [NARROW_VIEWPORT, WIDE_VIEWPORT] as const;
  let checked = 0;

  for (const width of widths) {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
    await page.goto('/', { waitUntil: 'load' });

    const resting = await page.evaluate(() => {
      const link = document.querySelector('a[href="#main"]');
      const rect = link === null ? null : link.getBoundingClientRect();

      return {
        targets: document.querySelectorAll('#main').length,
        bottom: rect === null ? null : rect.bottom,
      };
    });

    expect(
      resting.targets,
      `${describeRoute('/', width)} must carry exactly one main landmark with id "main" for the skip link to reach, and carried ${resting.targets}`,
    ).toBe(1);
    expect(
      resting.bottom,
      `${describeRoute('/', width)} renders no anchor targeting #main, so the document has no skip link at all (rule B-3)`,
    ).not.toBeNull();
    expect(
      resting.bottom ?? 0,
      `${describeRoute('/', width)} renders its skip link inside the viewport before it is focused; it must stay out of the way until a keyboard reader reaches it`,
    ).toBeLessThanOrEqual(0);

    await page.keyboard.press('Tab');

    const focused = await page.evaluate(() => {
      const element = document.activeElement;
      const rect = element === null ? null : element.getBoundingClientRect();

      return {
        tag: element?.tagName.toLowerCase() ?? '',
        href: element?.getAttribute('href') ?? '',
        top: rect?.top ?? null,
        width: rect?.width ?? 0,
        height: rect?.height ?? 0,
      };
    });

    expect(
      focused.href,
      `${describeRoute('/', width)} must focus the anchor targeting #main as the document's first focusable element, and the first Tab focused a <${focused.tag}> with href "${focused.href}"`,
    ).toBe('#main');
    expect(focused.tag).toBe('a');
    expect(
      focused.top ?? -1,
      `${describeRoute('/', width)} leaves its skip link above the viewport while it holds focus, so a keyboard reader cannot see where they are (rule B-3)`,
    ).toBeGreaterThanOrEqual(0);
    expect(
      focused.width,
      `${describeRoute('/', width)} focuses a skip link with no rendered width`,
    ).toBeGreaterThan(0);
    expect(
      focused.height,
      `${describeRoute('/', width)} focuses a skip link with no rendered height; every target is at least 24 by 24 (rule B-3)`,
    ).toBeGreaterThan(0);

    checked += 1;
  }

  expect(
    checked,
    `the skip link must have been checked at both design widths, and ${checked} of ${widths.length} were`,
  ).toBe(widths.length);
});

/* ================================================================================================
 * Test 5 — WT-06: the navigation works by keyboard on both sides of the breakpoint
 * ============================================================================================== */

/** What one menu list renders: whether it exists, and how many of its links a reader can see. */
interface MenuLinkReport {
  /** Whether the element the trigger names exists in the document at all. */
  readonly exists: boolean;
  /** How many of its links are rendered, and therefore reachable. */
  readonly visible: number;
  /** How many distinct destinations those visible links point at. */
  readonly distinct: number;
}

/** Reports the visible links of the list one trigger controls, located by the id it names. */
async function menuLinkReport(page: Page, listId: string): Promise<MenuLinkReport> {
  return page.evaluate((id) => {
    const list = document.getElementById(id);

    if (list === null) {
      return { exists: false, visible: 0, distinct: 0 };
    }

    const shown = [...list.querySelectorAll('a[href]')].filter(
      (anchor) => anchor.getClientRects().length > 0,
    );

    return {
      exists: true,
      visible: shown.length,
      distinct: new Set(shown.map((anchor) => anchor.getAttribute('href') ?? '')).size,
    };
  }, listId);
}

/*
 * One header, two behaviours, decided by the width against the breakpoint constant rather than by a
 * literal: below it the five links collapse behind a trigger and the trigger is the whole keyboard
 * path into the navigation; above it the links are rendered inline and no collapsed trigger is
 * exposed. Both halves are asserted, because the desktop half is what proves the collapse is not
 * simply hiding the navigation from one group of readers while showing it to another.
 *
 * The trigger is found by its `aria-expanded` state, which is what a reader's assistive technology
 * reads to know whether the menu is open, and the list it drives is found from the id its
 * `aria-controls` names — so the pair is asserted to be wired to each other, not merely both
 * present. Nothing here asserts how many links the site's navigation has beyond the count A0
 * defines, and no label is read.
 */
test(`[WT-06] the navigation is keyboard-operable on both sides of the ${MOBILE_MENU_MAX_WIDTH} px breakpoint — ${CONFIGURATIONS.join(' | ')}`, async ({
  page,
}) => {
  const widths = [NARROW_VIEWPORT, WIDE_VIEWPORT] as const;
  let checked = 0;

  for (const width of widths) {
    /* Below the breakpoint the header collapses; at and above it the links are inline. */
    const collapsed = width < MOBILE_MENU_MAX_WIDTH;
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
    await page.goto('/', { waitUntil: 'load' });

    const trigger = page.locator('header button[aria-expanded]');

    if (collapsed) {
      await expect(
        trigger,
        `${describeRoute('/', width)} must expose exactly one menu trigger carrying aria-expanded below the ${MOBILE_MENU_MAX_WIDTH} px breakpoint`,
      ).toHaveCount(1);
      await expect(
        trigger,
        `${describeRoute('/', width)} renders its menu trigger hidden, so the navigation is unreachable until a script reveals it`,
      ).toBeVisible();
      await expect(
        trigger,
        `${describeRoute('/', width)} must ship its menu closed`,
      ).toHaveAttribute('aria-expanded', 'false');

      /* Tab to the trigger rather than focusing it: the claim is that a keyboard reaches it. */
      let reached = false;
      for (let step = 0; step < 10 && !reached; step += 1) {
        await page.keyboard.press('Tab');
        reached = await page.evaluate(
          () => document.activeElement?.hasAttribute('data-mobile-menu-trigger') === true,
        );
      }

      expect(
        reached,
        `${describeRoute('/', width)} cannot reach its menu trigger with a bounded walk of Tab presses, so the navigation is not keyboard-operable there (rule B-3)`,
      ).toBe(true);

      const listId = (await trigger.getAttribute('aria-controls')) ?? '';
      expect(
        listId,
        `${describeRoute('/', width)} renders a menu trigger whose aria-controls names nothing`,
      ).not.toBe('');

      const closed = await menuLinkReport(page, listId);
      expect(
        closed.exists,
        `${describeRoute('/', width)} renders a menu trigger whose aria-controls names an element that is not in the document ("${listId}")`,
      ).toBe(true);
      expect(
        closed.visible,
        `${describeRoute('/', width)} renders ${closed.visible} of its navigation links while the menu reports itself closed; a closed menu must show none of them`,
      ).toBe(0);

      await page.keyboard.press('Enter');
      await expect(
        trigger,
        `${describeRoute('/', width)} does not report itself expanded after Enter, so the menu cannot be opened by keyboard`,
      ).toHaveAttribute('aria-expanded', 'true');

      const open = await menuLinkReport(page, listId);
      expect(
        open.visible,
        `${describeRoute('/', width)} shows ${open.visible} of the ${GLOBAL_NAV_ITEMS} navigation links once the menu is open`,
      ).toBe(GLOBAL_NAV_ITEMS);
      expect(
        open.distinct,
        `${describeRoute('/', width)} shows ${open.distinct} distinct destinations across ${open.visible} open navigation links, so the list repeats one instead of offering all ${GLOBAL_NAV_ITEMS}`,
      ).toBe(GLOBAL_NAV_ITEMS);

      await page.keyboard.press('Escape');
      await expect(
        trigger,
        `${describeRoute('/', width)} does not report itself collapsed after Escape, so a keyboard reader cannot close the menu`,
      ).toHaveAttribute('aria-expanded', 'false');

      const reopened = await menuLinkReport(page, listId);
      expect(
        reopened.visible,
        `${describeRoute('/', width)} leaves ${reopened.visible} navigation links rendered after Escape; closing the menu must hide them again`,
      ).toBe(0);

      const focusReturned = await page.evaluate(
        () => document.activeElement?.hasAttribute('data-mobile-menu-trigger') === true,
      );
      expect(
        focusReturned,
        `${describeRoute('/', width)} drops focus somewhere in the document when the menu closes on Escape instead of returning it to the trigger, which strands a keyboard reader (rule B-3)`,
      ).toBe(true);
    } else {
      await expect(
        trigger,
        `${describeRoute('/', width)} still exposes a collapsed menu trigger above the ${MOBILE_MENU_MAX_WIDTH} px breakpoint, so the same navigation is present twice`,
      ).toBeHidden();

      const inline = await page.evaluate(() => {
        const isRendered = (element: Element): boolean => element.getClientRects().length > 0;
        const shownNavs = [...document.querySelectorAll('header nav')].filter(isRendered);
        const links = shownNavs.flatMap((nav) =>
          [...nav.querySelectorAll('a[href]')]
            .filter(isRendered)
            .map((anchor) => anchor.getAttribute('href') ?? ''),
        );

        return { navs: shownNavs.length, links };
      });

      expect(
        inline.navs,
        `${describeRoute('/', width)} renders ${inline.navs} visible navigation landmarks above the breakpoint; exactly one navigation is in the accessibility tree at a time (rule B-3)`,
      ).toBe(1);
      expect(
        inline.links.length,
        `${describeRoute('/', width)} renders ${inline.links.length} visible navigation links above the breakpoint and A0 defines ${GLOBAL_NAV_ITEMS}`,
      ).toBe(GLOBAL_NAV_ITEMS);
      expect(
        new Set(inline.links).size,
        `${describeRoute('/', width)} points ${inline.links.length} inline navigation links at ${new Set(inline.links).size} distinct destinations, so one of them is duplicated`,
      ).toBe(GLOBAL_NAV_ITEMS);

      /* The inline links are keyboard-operable too: Tab reaches one of them, bounded. */
      let inlineReached = false;
      for (let step = 0; step < 10 && !inlineReached; step += 1) {
        await page.keyboard.press('Tab');
        inlineReached = await page.evaluate(() => {
          const element = document.activeElement;

          return element !== null && element.closest('header nav') !== null;
        });
      }

      expect(
        inlineReached,
        `${describeRoute('/', width)} cannot reach its inline navigation with a bounded walk of Tab presses (rule B-3)`,
      ).toBe(true);
    }

    checked += 1;
  }

  expect(
    checked,
    `the navigation must have been checked on both sides of the breakpoint, and ${checked} of ${widths.length} were`,
  ).toBe(widths.length);
});


/* ================================================================================================
 * Test 6 — WT-06: every accordion toggles by keyboard
 * ============================================================================================== */

/*
 * The disclosure lists on the three routes that carry one. Each item is a native `<details>` whose
 * `<summary>` is its keyboard stop, so the assertion is the platform's behaviour rather than a
 * script's: focus the summary, press Enter, and the item's open state flips, its answer becomes the
 * rendered one, and a second Enter puts it back.
 *
 * Nothing here assumes an item starts closed. A layout may open its first item in the markup, and
 * a test that demanded "closed" would fail that layout for a decision it is entitled to make — so
 * each item's own resting state is read first and the two transitions are asserted as the flips of
 * it. A route with no items at all fails and names itself, because a zero count is the defect this
 * test exists to catch rather than a reason to pass quietly.
 */
test(`[WT-06] every accordion item toggles by keyboard alone — ${CONFIGURATIONS.join(' | ')}`, async ({
  page,
}) => {
  await page.setViewportSize({ width: WIDE_VIEWPORT, height: VIEWPORT_HEIGHT });

  let toggled = 0;
  let expected = 0;

  for (const route of KEYBOARD_ROUTES) {
    await page.goto(route, { waitUntil: 'load' });

    const items = page.locator('main details');
    const count = await items.count();

    expect(
      count,
      `${route} renders no accordion item at all. The questions are copy from src/content/shared/faq.ts and the block is named for this route, so a zero count means the page composition dropped it (AAP 0.8.4, rule B-4).`,
    ).toBeGreaterThan(0);

    expected += count;

    for (let index = 0; index < count; index += 1) {
      const item = items.nth(index);
      const summary = item.locator('summary');

      await summary.focus();

      const summaryFocused = await page.evaluate(
        () => document.activeElement?.tagName.toLowerCase() === 'summary',
      );
      expect(
        summaryFocused,
        `${route}: the summary of accordion item ${index + 1} of ${count} cannot take keyboard focus, so the question cannot be opened without a pointer (rule B-3)`,
      ).toBe(true);

      const restedOpen = await item.evaluate((element) => element.hasAttribute('open'));

      await page.keyboard.press('Enter');
      const openedOpen = await item.evaluate((element) => element.hasAttribute('open'));

      expect(
        openedOpen,
        `${route}: Enter on accordion item ${index + 1} of ${count} did not flip its open state, which rested at ${restedOpen}`,
      ).toBe(!restedOpen);

      const answer = await item.evaluate((element) => {
        const paragraph = element.querySelector('p');

        return {
          characters: (paragraph?.textContent ?? '').trim().length,
          rendered: paragraph !== null && paragraph.getClientRects().length > 0,
        };
      });

      expect(
        answer.characters,
        `${route}: the answer of accordion item ${index + 1} of ${count} is empty. Every answer is copy and comes from src/content/shared/faq.ts (AAP 0.7.2).`,
      ).toBeGreaterThan(0);
      expect(
        answer.rendered,
        `${route}: the answer of accordion item ${index + 1} of ${count} is ${answer.rendered ? 'rendered' : 'not rendered'} while the item reports itself ${openedOpen ? 'open' : 'closed'}`,
      ).toBe(openedOpen);

      await page.keyboard.press('Enter');
      const returnedOpen = await item.evaluate((element) => element.hasAttribute('open'));

      expect(
        returnedOpen,
        `${route}: a second Enter on accordion item ${index + 1} of ${count} left it ${returnedOpen ? 'open' : 'closed'}, so the item does not toggle back`,
      ).toBe(restedOpen);

      toggled += 1;
    }
  }

  expect(
    toggled,
    `every accordion item on ${KEYBOARD_ROUTES.join(', ')} must have been toggled, and ${toggled} of ${expected} were`,
  ).toBe(expected);
  expect(
    expected,
    `the accordion sweep covered no item at all, so it proves nothing`,
  ).toBeGreaterThan(0);
});

/* ================================================================================================
 * Test 7 — WT-06: the form is keyboard-operable, or the state that replaces it is sound
 * ============================================================================================== */

/*
 * The contact route's enquiry block is the one surface whose markup depends on configuration
 * (AAP 0.9.3), so this is the one test that reads the running project's name. In `live` an endpoint
 * is configured and the form exists: every label is asserted to resolve to its own control, the tab
 * order is asserted to be the DOM order rather than whatever order the markup implies, and the
 * consent checkbox is asserted to toggle with Space. In the other three projects no endpoint is
 * configured and the page must render no form at all — so the same test asserts the designed state
 * instead: the block that would hold the form carries its text, holds no form control a reader
 * could try to use, and, where an address is configured, offers the mailto link where a keyboard
 * reader reaches it.
 *
 * The block's position is the one AAP 0.8.4 fixes for it — the second section of the main landmark,
 * after the page top and before the questions — and it is read as a position rather than by any
 * class, so the test cannot agree with a component about a name neither of them should own.
 */
test(`[WT-06] the enquiry block is keyboard-operable in whichever state the configuration selects — ${CONFIGURATIONS.join(' | ')}`, async ({
  page,
}) => {
  const configuration = configurationOf(test.info().project.name);

  await page.setViewportSize({ width: WIDE_VIEWPORT, height: VIEWPORT_HEIGHT });
  await page.goto('/contact', { waitUntil: 'load' });

  if (configuration === 'live') {
    const form = page.locator('main form');
    await expect(
      form,
      `the ${configuration} project configures an endpoint, so /contact must render the enquiry form (AAP 0.9.3, rule W-2)`,
    ).toHaveCount(1);

    const wiring = await page.evaluate(() => {
      const labels = [...document.querySelectorAll('form label[for]')];
      const unresolved = labels
        .filter((label) => document.getElementById(label.getAttribute('for') ?? '') === null)
        .map((label) => label.getAttribute('for') ?? '');
      const formElement = document.querySelector('form');
      const stops =
        formElement === null
          ? []
          : [...formElement.querySelectorAll('a[href], button, input, select, textarea')]
              .filter(
                (control) =>
                  !(control instanceof HTMLElement && control.hidden) &&
                  control.getAttribute('tabindex') !== '-1' &&
                  control.getClientRects().length > 0,
              )
              .map((control) => control.id);

      return { labels: labels.length, unresolved, stops };
    });

    expect(
      wiring.labels,
      '/contact renders a form with no labelled control at all, so no field has an accessible name (rule B-3)',
    ).toBeGreaterThan(0);
    expect(
      wiring.unresolved,
      `these labels name controls that are not in the document: ${wiring.unresolved.join(', ')}. Every field carries a visible label wired to it by for and id (AAP 0.6.4, rule B-3).`,
    ).toEqual([]);
    expect(
      wiring.stops.length,
      '/contact renders a form with no keyboard-reachable control beyond the honeypot, so it cannot be filled at all',
    ).toBeGreaterThan(1);

    const firstStop = wiring.stops[0] ?? '';
    expect(
      firstStop,
      '/contact renders a form whose first keyboard stop has no id, so the tab order cannot be driven from it',
    ).not.toBe('');

    await page.locator(`#${firstStop}`).focus();

    const walked: string[] = [];
    for (let step = 1; step < wiring.stops.length; step += 1) {
      await page.keyboard.press('Tab');
      walked.push(await page.evaluate(() => document.activeElement?.id ?? ''));
    }

    expect(
      walked,
      `the enquiry form's tab order does not follow the document order of its controls. Expected ${JSON.stringify(wiring.stops.slice(1))} and Tab visited ${JSON.stringify(walked)} (rule B-3).`,
    ).toEqual(wiring.stops.slice(1));

    const consent = page.locator('form input[type="checkbox"]').first();
    await expect(
      consent,
      '/contact renders a form with no consent checkbox, which the pilot enquiry cannot be submitted without (AAP 0.8.2)',
    ).toHaveCount(1);

    await consent.focus();
    const unchecked = await consent.isChecked();
    await page.keyboard.press(' ');
    const checked = await consent.isChecked();
    await page.keyboard.press(' ');
    const restored = await consent.isChecked();

    expect(
      checked,
      `the consent checkbox does not toggle with the Space key: it rested ${unchecked ? 'checked' : 'unchecked'} and Space left it ${checked ? 'checked' : 'unchecked'} (rule B-3)`,
    ).toBe(!unchecked);
    expect(
      restored,
      'a second Space on the consent checkbox did not return it to its resting state',
    ).toBe(unchecked);
  } else {
    const shapes = await page.evaluate((stubEmail) => {
      const sections = [...document.querySelectorAll('main > section')];
      const block = sections.length > 1 ? sections[1] ?? null : null;
      const mailtoAnchors = [...document.querySelectorAll('a[href]')].filter((anchor) =>
        (anchor.getAttribute('href') ?? '').startsWith('mailto:'),
      );

      return {
        forms: document.querySelectorAll('form').length,
        sections: sections.length,
        blockCharacters: (block?.textContent ?? '').trim().length,
        blockControls:
          block === null ? -1 : block.querySelectorAll('input, textarea, select, button').length,
        blockMailto:
          block === null
            ? -1
            : block.querySelectorAll(`a[href="mailto:${stubEmail}"]`).length,
        mailtoAnchors: mailtoAnchors.length,
      };
    }, STUB_CONTACT_EMAIL);

    expect(
      shapes.forms,
      `the ${configuration} project configures no endpoint, so /contact must render no form at all (AAP 0.9.3, rule W-2)`,
    ).toBe(0);

    expect(
      shapes.sections,
      `/contact must render its page top and the block that carries the enquiry state, and rendered ${shapes.sections} sections inside the main landmark (AAP 0.8.4)`,
    ).toBeGreaterThan(1);

    expect(
      shapes.blockCharacters,
      `/contact renders an empty enquiry block in the ${configuration} state. The block's text is copy from src/content/contact.ts, so an empty one is a state with nothing in it (rule B-4).`,
    ).toBeGreaterThan(0);

    expect(
      shapes.blockControls,
      `/contact renders ${shapes.blockControls} form controls in the ${configuration} state, which renders no form. A control that cannot submit anything is a dead control (rule B-4).`,
    ).toBe(0);

    if (configuration === 'mailto') {
      expect(
        shapes.blockMailto,
        `the mailto project configures a contact address, so the enquiry block must offer exactly one mailto link carrying it, and offered ${shapes.blockMailto}`,
      ).toBe(1);

      const block = page.locator('main > section').nth(1);
      const mailto = block.locator(`a[href="mailto:${STUB_CONTACT_EMAIL}"]`);
      await mailto.focus();

      const focusedHref = await page.evaluate(
        () => document.activeElement?.getAttribute('href') ?? '',
      );
      expect(
        focusedHref,
        `the mailto link in the enquiry block could not be focused by keyboard, so a reader without a form has no way to reach the site (rule B-3)`,
      ).toBe(`mailto:${STUB_CONTACT_EMAIL}`);
      await expect(
        mailto,
        'the mailto link in the enquiry block is present but not rendered, so it is not a control a reader can activate',
      ).toBeVisible();
    } else {
      expect(
        shapes.mailtoAnchors,
        `the ${configuration} project configures neither an endpoint nor a contact address, so no mailto link may appear anywhere on the site, and ${shapes.mailtoAnchors} did`,
      ).toBe(0);
    }
  }
});


/* ================================================================================================
 * Test 8 — WT-06: every focused interactive element shows a visible focus indicator
 * ============================================================================================== */

/*
 * A keyboard reader has to see where they are, so every interactive element the tab order reaches
 * is held to an indicator: either an outline at least 2 px wide that is actually drawn, or a box
 * shadow. The floor is the theme's own ring — 2 px at a 2 px offset, the Chocolate ring on the Cream
 * ground and the Cream ring on the two dark bands (AAP 0.6.4) — so the assertion is the numeric
 * floor and not a colour name: the ring changes colour with the band it sits on, and a test that
 * demanded one colour would fail the other band's correct ring.
 *
 * Focus is driven by real Tab presses from the document start, because focus arriving any other way
 * would not tell us whether a keyboard reader sees the indicator. The walk is bounded and stops at
 * the first element it has already seen, so a page whose tab order cycles does not turn the sweep
 * into an unbounded walk; and a sweep that checked nothing fails, because an empty sweep would
 * otherwise pass every assertion in it.
 */
test(`[WT-06] every focused interactive element shows a visible focus indicator — ${CONFIGURATIONS.join(' | ')}`, async ({
  page,
}) => {
  const widths = [NARROW_VIEWPORT, WIDE_VIEWPORT] as const;
  let checked = 0;

  for (const width of widths) {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });

    for (const route of KEYBOARD_ROUTES) {
      await page.goto(route, { waitUntil: 'load' });

      const seen = new Set<string>();

      for (let step = 0; step < MAX_TAB_STOPS; step += 1) {
        await page.keyboard.press('Tab');

        const focus = await page.evaluate((minimumWidth: number) => {
          const element = document.activeElement;

          if (element === null) {
            return { tag: '', descriptor: '', indicator: '' };
          }

          const style = getComputedStyle(element);
          const outlineWidth = Number.parseFloat(style.outlineWidth);
          const drawnOutline =
            style.outlineStyle !== 'none' &&
            Number.isFinite(outlineWidth) &&
            outlineWidth >= minimumWidth;
          const drawnShadow = style.boxShadow.trim() !== '' && style.boxShadow !== 'none';

          return {
            tag: element.tagName.toLowerCase(),
            descriptor: `${element.tagName.toLowerCase()}${element.id === '' ? '' : `#${element.id}`}`,
            indicator:
              drawnOutline || drawnShadow
                ? ''
                : `outline-style ${style.outlineStyle}, outline-width ${style.outlineWidth}, box-shadow ${style.boxShadow}`,
          };
        }, MIN_FOCUS_OUTLINE_WIDTH);

        /* The document body and anything else outside the interactive set is not a control. */
        if (!INTERACTIVE_TAGS.includes(focus.tag)) {
          continue;
        }

        expect(
          focus.indicator,
          `${describeRoute(route, width)}: the focused ${focus.descriptor} shows no visible focus indicator (${focus.indicator}). Every interactive element needs an indicator of at least ${MIN_FOCUS_OUTLINE_WIDTH} px, or a box shadow, when it holds keyboard focus (rule B-3, AAP 0.6.4).`,
        ).toBe('');

        if (seen.has(focus.descriptor)) {
          break;
        }

        seen.add(focus.descriptor);
        checked += 1;
      }

      expect(
        seen.size,
        `${describeRoute(route, width)} reached no interactive element in ${MAX_TAB_STOPS} Tab presses, so the focus sweep proved nothing about it (rule B-3)`,
      ).toBeGreaterThan(0);
    }
  }

  expect(
    checked,
    `the focus sweep checked ${checked} interactive elements across ${KEYBOARD_ROUTES.length} routes and ${widths.length} widths, which is none`,
  ).toBeGreaterThan(0);
});

/* ================================================================================================
 * Test 9 — WT-06: nothing animates for a reader who asked for less motion
 * ============================================================================================== */

/*
 * Rule B-3 requires `prefers-reduced-motion` to be honoured, and the theme honours it in one block
 * that stops every animation and transition. This test is that block's proof: with the media
 * preference set, every element in the document is inspected and any non-zero animation or
 * transition duration is a finding.
 *
 * The preference is emulated before the navigation so the first paint already honours it — a reader
 * who has asked for less motion must not be shown one while a stylesheet settles — and the sweep
 * counts what it inspected so an empty document cannot pass.
 */
test(`[WT-06] under prefers-reduced-motion: reduce no animation or transition runs — ${CONFIGURATIONS.join(' | ')}`, async ({
  page,
}) => {
  const widths = [NARROW_VIEWPORT, WIDE_VIEWPORT] as const;
  let inspected = 0;

  for (const width of widths) {
    await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });
    await page.emulateMedia({ reducedMotion: 'reduce' });

    for (const route of KEYBOARD_ROUTES) {
      await page.goto(route, { waitUntil: 'load' });

      const report = await page.evaluate(() => {
        const runsFor = (value: string): boolean =>
          value
            .split(',')
            .map((part) => part.trim())
            .some((part) => part !== '' && part !== '0s');

        let counted = 0;
        const offenders: string[] = [];

        for (const element of document.querySelectorAll('*')) {
          counted += 1;

          const style = getComputedStyle(element);

          if (runsFor(style.animationDuration) || runsFor(style.transitionDuration)) {
            offenders.push(
              `${element.tagName.toLowerCase()}${element.id === '' ? '' : `#${element.id}`} (animation ${style.animationDuration}, transition ${style.transitionDuration})`,
            );
          }
        }

        return { counted, total: offenders.length, offenders: offenders.slice(0, 5) };
      });

      expect(
        report.counted,
        `${describeRoute(route, width)} rendered no elements at all, so the reduced-motion sweep inspected nothing`,
      ).toBeGreaterThan(0);

      expect(
        report.total,
        `${describeRoute(route, width)} still runs ${report.total} animation or transition durations while prefers-reduced-motion: reduce is set: ${report.offenders.join(' | ')}. Nothing on the site may animate for a reader who asked for less motion (rule B-3).`,
      ).toBe(0);

      inspected += report.counted;
    }
  }

  expect(
    inspected,
    `the reduced-motion sweep inspected ${inspected} elements across ${KEYBOARD_ROUTES.length} routes and ${widths.length} widths, which is none`,
  ).toBeGreaterThan(0);
});

