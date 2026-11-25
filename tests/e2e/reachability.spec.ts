/**
 * tests/e2e/reachability.spec.ts — the link-graph suite (WT-17, and rule B-4's reachability half).
 *
 * WT-17 asks three things of the built site: a crawl from `/` reaches all eight pages through the
 * header, the footer and the links a page renders; the product route `/platform/site-intelligence`
 * is reached from the home page by two independent affordances, the product-feature action and
 * stage card 01; and stage cards 02–04 are not links. Rule B-4 asks the same of every control on
 * every route — each one either performs its function or is visibly disabled with a text
 * explanation — which is why this suite also walks every anchor on every document, the
 * page-not-found document included, and refuses a dead or foreign one.
 *
 * The crawl is the proof, not a formality. Each visited document's own anchors are read from the
 * DOM and only the targets they name are visited, so a missing link, a mistyped path or a route
 * that stopped being linked from anywhere fails the suite. The route constant is never loaded
 * directly: the one path the crawl starts from is `/`, and every other path arrives from an anchor
 * some page actually renders.
 *
 * Copy is never asserted. The content specification is absent from this checkout, so the content
 * modules carry the plan's placeholder marker and the words on the pages are not final (AAP 0.7.7,
 * 0.16.2). Every assertion here is therefore about a target, a count or a relation: the product
 * route is found by its `href`, its two home-page affordances are told apart by the region each
 * sits in, and no expected link text exists anywhere in this file. A copy edit cannot fail this
 * suite, and this suite cannot bless a wrong link.
 *
 * Configuration. The link graph is identical in all four browser configurations — the shell does
 * not depend on the form endpoint, the contact address, the site address or the live flag — so
 * every test runs in every project and nothing is ever omitted. The project name is read inside
 * each test body, because `test.info()` reports the running test and throws when it is called while
 * none is running, and it is checked against the declared set here so a renamed project fails
 * loudly instead of quietly matching a stale name.
 *
 * Two DOM facts the assertions are written around, both of them correct markup rather than
 * concessions.
 *
 * The header renders the five navigation links twice — the wide row's navigation and the narrow
 * width's menu list — with one of the two out of the layout at any width, so `header nav a` is ten
 * anchors at the desktop viewport while five are rendered to a reader. The suite therefore asserts
 * five *distinct* destinations, five rendered items and exactly one rendered `aria-current`, which
 * is the property A0 states and the property a responsive header has to keep; a raw anchor count
 * would fail a correct header.
 *
 * The current page is marked only where it is one of the five navigation destinations. A page
 * reached outside the navigation carries no `aria-current` at all, because marking a destination
 * that is not the current page would itself be the defect.
 *
 * The page-not-found document is withheld in three independent ways (AAP 0.4.2), and this suite
 * proves the three a browser can see: it is reached at `/404.html`, no page links to it, and it is
 * identifiable structurally by carrying no description tag — which is what lets the crawl tell a
 * real page from the fallback document.
 *
 * Rules honoured here, and how:
 *
 * - **B-4** — the whole file. Every anchor on every document resolves to a page of this site, to an
 *   in-page target that exists, or to a mailbox with an address in it; and no control is disabled
 *   on a plain load, because the delivered site has nothing to disable.
 * - **B-3** — the current navigation item is marked with `aria-current="page"` and not by its
 *   underline alone, and no static stage card is focusable, so no card invites a keyboard reader to
 *   a control it does not have.
 * - **B-1** — the crawl never leaves this origin: a foreign absolute reference fails the anchor
 *   walk rather than being followed.
 * - **B-2** — nothing here is a credential and nothing here reads the environment; the four
 *   configured values are other suites' business.
 * - **W-1** — no string, name, place or node identifier of the design reference appears in this
 *   file, and none of its text is asserted.
 * - **W-2** — every destination is a static document: the suite loads pages, submits nothing, opens
 *   no session and never touches a form.
 *
 * Out of scope by design: no build, no server and no port (Playwright's own four projects build and
 * serve each configuration), no quality gate, no screenshot, no source-tree scan, and no timing
 * pause — every assertion waits on a locator or a navigation event.
 */

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/* -------------------------------------------------------------------------------------------------
 * What this file is allowed to assume
 * ---------------------------------------------------------------------------------------------- */

/**
 * The four browser configurations AAP 0.13.2 and `playwright.config.ts` define between them. They
 * are declared here so every test title names the set it runs under, and so a project whose name is
 * outside the set is caught rather than tolerated.
 */
const CONFIGURATIONS = ['default', 'live', 'mailto', 'screens'] as const;

/** One browser configuration's name, as `test.info().project.name` reports it. */
type Configuration = (typeof CONFIGURATIONS)[number];

/** The declared set, written once for the test titles. */
const CONFIGURATION_SET: string = CONFIGURATIONS.join(', ');

/**
 * The eight navigable pages of AAP 0.4.2, in the order the plan lists them. The page-not-found
 * document is deliberately not one of them: it is withheld from navigation, from the sitemap and
 * from every crawler, and this suite asserts that no page links to it.
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
 * The page-not-found document's own path. It is a built file rather than a route a reader browses
 * to, which is why it is named separately from the eight and asserted to be linked from nowhere.
 */
const NOT_FOUND_DOCUMENT = '/404.html';

/**
 * The product route: the one page the home page reaches twice, through the product-feature action
 * and through stage card 01 (WT-17). It is located by this target and never by its link text.
 */
const PRODUCT_PAGE: string = '/platform/site-intelligence';

/** The four stage cards' count, which is what makes the stage list identifiable structurally. */
const STAGE_CARD_COUNT = 4;

/**
 * The shape of a usable contact address: one local part, one `@`, one domain. A `mailto:` link with
 * nothing after the scheme is a control that leads nowhere, which rule B-4 forbids, and the four
 * configurations differ only in whether such a link exists at all.
 */
const MAILBOX = /^[^\s@]+@[^\s@]+$/;

/** The bypass link's target id, which the layout's `<main id="main">` supplies on every document. */
const MAIN_ID = 'main';

/* -------------------------------------------------------------------------------------------------
 * Reading a link
 * ---------------------------------------------------------------------------------------------- */

/**
 * What one anchor's `href` points at, from the point of view of the document it is rendered in.
 *
 * These five kinds are the only categories rule B-4 and rule B-1 need. A page of this site is the
 * healthy case; an in-page target is the document's own bypass link; a mailbox carries the
 * configured contact address; a foreign origin is what rule B-1 forbids the site from naming and
 * what this suite refuses to follow; and a dead reference leads nowhere at all.
 */
type Reference =
  | { kind: 'page'; path: string }
  | { kind: 'fragment'; id: string }
  | { kind: 'mailbox'; address: string }
  | { kind: 'foreign'; href: string; origin: string }
  | { kind: 'dead'; href: string; reason: string };

/**
 * A route path with any trailing slashes removed, so `/platform`, `/platform/` and `/platform//`
 * are the one destination. The root stays `/`, and the comparison never depends on how a particular
 * anchor happened to be written.
 */
function normalisePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

/** Whether a normalised path is one of the eight navigable pages. */
function isPage(path: string): boolean {
  return (EIGHT_PAGES as readonly string[]).includes(path);
}

/**
 * Classify one anchor's `href` against the document it appears in.
 *
 * The order of the checks is the order of the failures rule B-4 names: a missing, empty, bare-`#`
 * or `javascript:` reference is dead before any resolution is attempted; a `mailto:` reference is a
 * mailbox whether or not it carries an address (the caller judges the address); anything whose
 * origin differs from the document's is foreign; a same-document fragment is an in-page target; and
 * whatever is left names a page of this site, which the caller then checks against the eight.
 */
function classifyReference(rawHref: string | null, documentUrl: string): Reference {
  if (rawHref === null) {
    return { kind: 'dead', href: '', reason: 'the anchor carries no href attribute' };
  }

  const href = rawHref.trim();

  if (href === '') {
    return { kind: 'dead', href: rawHref, reason: 'the href is empty' };
  }

  if (href === '#') {
    return { kind: 'dead', href, reason: 'a bare "#" names no target' };
  }

  if (href.toLowerCase().startsWith('javascript:')) {
    return { kind: 'dead', href, reason: 'a javascript: URL is not a link' };
  }

  let resolved: URL;
  try {
    resolved = new URL(href, documentUrl);
  } catch {
    return { kind: 'dead', href, reason: 'the href does not resolve to a URL' };
  }

  if (resolved.protocol === 'mailto:') {
    return { kind: 'mailbox', address: href.slice(href.indexOf(':') + 1).trim() };
  }

  const document = new URL(documentUrl);

  if (resolved.origin !== document.origin) {
    return { kind: 'foreign', href, origin: resolved.origin };
  }

  if (
    resolved.hash !== '' &&
    normalisePath(resolved.pathname) === normalisePath(document.pathname)
  ) {
    return { kind: 'fragment', id: resolved.hash.slice(1) };
  }

  return { kind: 'page', path: normalisePath(resolved.pathname) };
}

/** The reference described in a sentence, so a failure names what the offending anchor points at. */
function describeReference(reference: Reference): string {
  switch (reference.kind) {
    case 'page':
      return `the page ${reference.path}`;
    case 'fragment':
      return `the in-page target #${reference.id}`;
    case 'mailbox':
      return reference.address === ''
        ? 'a mailbox with no address'
        : `the mailbox ${reference.address}`;
    case 'foreign':
      return `the foreign origin ${reference.origin}`;
    case 'dead':
      return `nothing (${reference.reason})`;
  }
}

/* -------------------------------------------------------------------------------------------------
 * Reading a page
 * ---------------------------------------------------------------------------------------------- */

/** One anchor as it exists in the DOM: its attribute, its markup, and the text a reader is given. */
interface AnchorRecord {
  /** The raw `href` attribute, or `null` when the anchor has none. */
  href: string | null;
  /** The anchor's own markup, quoted in a failure message so the offending element is visible. */
  markup: string;
  /** Its text, trimmed; empty for an anchor that names itself some other way. */
  text: string;
  /** Its `aria-label`, when it carries one instead of visible text. */
  label: string | null;
}

/** Every anchor matching a selector, read in the page rather than through a second navigation. */
async function readAnchors(page: Page, selector: string): Promise<AnchorRecord[]> {
  return page.locator(selector).evaluateAll((nodes) =>
    nodes.map((node) => ({
      href: node.getAttribute('href'),
      markup: node.outerHTML,
      text: (node.textContent ?? '').trim(),
      label: node.getAttribute('aria-label'),
    })),
  );
}

/**
 * The distinct page paths the header's navigation points at.
 *
 * The header renders the same five links twice for the two sides of the theme's one breakpoint, so
 * duplicates are expected and collapsed: what matters is how many destinations the navigation
 * offers, which is what A0 fixes at five.
 */
async function readNavigationTargets(page: Page): Promise<string[]> {
  const anchors = await readAnchors(page, 'header nav a[href]');
  const targets = new Set<string>();

  for (const anchor of anchors) {
    const reference = classifyReference(anchor.href, page.url());
    if (reference.kind === 'page') {
      targets.add(reference.path);
    }
  }

  return [...targets].sort();
}

/** One card of the stage list, as the structural walk below records it. */
interface StageCardRecord {
  /** The card's position in its list, counted from zero. */
  position: number;
  /** How many anchors the card contains. A static card contains none. */
  anchors: number;
  /** The markup of those anchors, joined, for a failure message that shows the offending link. */
  markup: string;
  /** How many elements inside the card claim `role="link"`. */
  roleLinks: number;
  /** How many elements inside the card carry a `tabindex`, i.e. can be focused. */
  focusable: number;
  /** How many elements inside the card carry an inline event handler attribute. */
  inlineHandlers: number;
}

/** One `ul` of four stage cards, located by the shape the component renders. */
interface StageListRecord {
  /** The list's position among the document's `ul` elements, for a failure message. */
  listPosition: number;
  /** How many `li` children the list has. */
  cards: number;
  /** Every card in list order. */
  records: StageCardRecord[];
}

/**
 * Find every four-card stage list in the document and describe its cards.
 *
 * The list is located structurally rather than by a class name or a surrounding landmark, because a
 * class name is presentation and would make this check a second copy of the component's styling:
 * the stage list is the `ul` of exactly four `li` children in which exactly one card holds a link
 * to the product route. A list of four cards with no such link, or a list of another length, is a
 * different block and is not a stage list.
 */
async function readStageLists(page: Page): Promise<StageListRecord[]> {
  return page.evaluate((target) => {
    const lists: {
      listPosition: number;
      cards: number;
      records: {
        position: number;
        anchors: number;
        markup: string;
        roleLinks: number;
        focusable: number;
        inlineHandlers: number;
      }[];
    }[] = [];

    document.querySelectorAll('ul').forEach((list, listPosition) => {
      const cards = Array.from(list.querySelectorAll(':scope > li'));
      const linked = cards.filter((card) => card.querySelector(`a[href="${target}"]`) !== null);

      if (cards.length !== 4 || linked.length !== 1) {
        return;
      }

      lists.push({
        listPosition,
        cards: cards.length,
        records: cards.map((card, position) => {
          const anchors = Array.from(card.querySelectorAll('a'));

          return {
            position,
            anchors: anchors.length,
            markup: anchors.map((anchor) => anchor.outerHTML).join('\n'),
            roleLinks: card.querySelectorAll('[role="link"]').length,
            focusable: card.querySelectorAll('[tabindex]').length,
            inlineHandlers: Array.from(card.querySelectorAll('*')).filter((element) =>
              Array.from(element.attributes).some((attribute) =>
                attribute.name.toLowerCase().startsWith('on'),
              ),
            ).length,
          };
        }),
      });
    });

    return lists;
  }, PRODUCT_PAGE);
}

/**
 * The browser configuration this test is running under.
 *
 * `test.info()` describes the running test and refuses to answer outside one, so this is called from
 * inside a test body and never at module scope. A project whose name is not one of the four the
 * harness declares would mean a renamed configuration, and stopping here names it rather than
 * letting every message below report a name nothing recognises.
 */
function configuration(): Configuration {
  const name = test.info().project.name;
  const match = CONFIGURATIONS.find((candidate) => candidate === name);

  if (match === undefined) {
    throw new Error(
      `This suite runs in the four configurations ${CONFIGURATION_SET}; the runner reported the project "${name}", which is not one of them.`,
    );
  }

  return match;
}

/* -------------------------------------------------------------------------------------------------
 * WT-17, clause one — the crawl from the home page
 * ---------------------------------------------------------------------------------------------- */

test(`WT-17 [${CONFIGURATION_SET}] a crawl from the home page reaches all eight pages`, async ({ page }) => {
  const project = configuration();

  /*
   * The frontier starts with the home page and nothing else. Every other path enters it only when
   * an anchor on a visited page names it, so the crawl proves the link graph rather than the route
   * constant: a route nobody links to stays unvisited and is reported by name.
   */
  const frontier: string[] = ['/'];
  const visited = new Set<string>();
  const arrivals: string[] = [];

  while (frontier.length > 0) {
    const path = frontier.shift();

    if (path === undefined || visited.has(path)) {
      continue;
    }

    const response = await page.goto(path);

    expect(
      response,
      `[${project}] The crawl reached ${path} from a link on a visited page, but the server answered nothing, so the document could not be read.`,
    ).not.toBeNull();

    const status = response?.status();
    expect(
      status,
      `[${project}] The crawl reached ${path} from a link on a visited page and the document answered ${status}, so a reader following that link does not arrive at a page.`,
    ).toBe(200);

    const contentType = response?.headers()['content-type'] ?? '';
    expect(
      contentType,
      `[${project}] The crawl reached ${path} and it was served as "${contentType}", not as an HTML document.`,
    ).toContain('text/html');

    /*
     * The eight pages each carry a description; the withheld page-not-found document carries none,
     * which is how it is recognised structurally (AAP 0.4.3). A link that lands on a document with
     * no description therefore lands on the fallback rather than on a page.
     */
    const descriptions = await page.locator('meta[name="description"]').count();
    expect(
      descriptions,
      `[${project}] The crawl reached ${path} and found ${descriptions} description tags. Every one of the eight pages carries exactly one and the withheld page-not-found document carries none, so this arrival is not a page a reader was meant to reach.`,
    ).toBe(1);

    visited.add(path);
    arrivals.push(path);

    const hrefs = await page.evaluate(() => {
      const found: string[] = [];

      for (const region of Array.from(document.querySelectorAll('main, header, footer'))) {
        for (const anchor of Array.from(region.querySelectorAll('a[href]'))) {
          const href = anchor.getAttribute('href');

          if (href !== null) {
            found.push(href);
          }
        }
      }

      return found;
    });

    for (const href of hrefs) {
      const reference = classifyReference(href, page.url());

      if (reference.kind !== 'page' || !isPage(reference.path)) {
        continue;
      }

      if (visited.has(reference.path) || frontier.includes(reference.path)) {
        continue;
      }

      frontier.push(reference.path);
    }
  }

  const unreached = EIGHT_PAGES.filter((path) => !visited.has(path));

  expect(
    unreached,
    `[${project}] The crawl from / visited ${visited.size} of the eight pages (${arrivals.join(' then ')}) and never reached: ${unreached.join(', ')}. Nothing the crawl could follow links to those paths: its only sources are the header, the footer and the links inside a page.`,
  ).toEqual([]);

  expect(
    [...visited].sort(),
    `[${project}] The crawl from / reached a set of documents that is not the eight pages: ${[...visited].sort().join(', ')}.`,
  ).toEqual([...EIGHT_PAGES].sort());
});

/* -------------------------------------------------------------------------------------------------
 * WT-17, the shell — the header's navigation and the footer's links
 * ---------------------------------------------------------------------------------------------- */

test(`WT-17 / B-3 [${CONFIGURATION_SET}] the header carries the five navigation items and marks the current page`, async ({ page }) => {
  const project = configuration();

  for (const path of EIGHT_PAGES) {
    await page.goto(path);

    const currentPath = normalisePath(new URL(page.url()).pathname);

    /*
     * Every control in the header — the five navigation links in each of the two renderings, and
     * the one call to action — has to lead to a page of this site, which is rule B-4's requirement
     * of a control that performs its function.
     */
    const headerAnchors = await readAnchors(page, 'header a[href]');
    const targets = new Set<string>();
    const stray: string[] = [];

    for (const anchor of headerAnchors) {
      const reference = classifyReference(anchor.href, page.url());

      if (reference.kind !== 'page' || !isPage(reference.path)) {
        stray.push(`${describeReference(reference)} — ${anchor.markup}`);
        continue;
      }

      targets.add(reference.path);
    }

    expect(
      stray,
      `[${project}] On ${path}, ${stray.length} header controls do not lead to one of the eight pages, so they cannot perform their function (rule B-4):\n${stray.join('\n')}`,
    ).toEqual([]);

    expect(
      targets.size,
      `[${project}] On ${path}, the header navigation offers ${targets.size} distinct destinations (${[...targets].sort().join(', ')}); A0 fixes the navigation at five.`,
    ).toBe(5);

    /*
     * The header renders the navigation twice, once for each side of the breakpoint, with one
     * rendering out of the layout at any width. What a reader is offered is therefore the rendered
     * set, and that is what has to be five.
     */
    const rendered = await page.locator('header nav a[href]:visible').count();
    expect(
      rendered,
      `[${project}] On ${path}, the header renders ${rendered} navigation links at this viewport; a reader is offered exactly five destinations, and the second rendering is out of the layout (rule B-3).`,
    ).toBe(5);

    /*
     * The current page is marked machine-readably, because an underline alone conveys it to sighted
     * readers only (rule B-3). No item may claim the state for a different page.
     */
    const marked = await readAnchors(page, 'header nav a[aria-current="page"]');
    const mislabelled: string[] = [];

    for (const anchor of marked) {
      const reference = classifyReference(anchor.href, page.url());

      if (reference.kind !== 'page' || reference.path !== currentPath) {
        mislabelled.push(`${describeReference(reference)} — ${anchor.markup}`);
      }
    }

    expect(
      mislabelled,
      `[${project}] On ${path}, ${mislabelled.length} navigation items claim to be a page other than the one being read, which is worse than marking nothing (rule B-3):\n${mislabelled.join('\n')}`,
    ).toEqual([]);

    const renderedMarked = await page.locator('header nav a[aria-current="page"]:visible').count();

    if (targets.has(currentPath)) {
      expect(
        renderedMarked,
        `[${project}] ${path} is one of the five navigation destinations, so exactly one rendered navigation item carries aria-current="page"; ${renderedMarked} do, and the current page would otherwise be conveyed by its underline alone (rule B-3).`,
      ).toBe(1);
    } else {
      expect(
        marked.length,
        `[${project}] ${path} is reached outside the five navigation destinations, so no navigation item may claim to be the current page; ${marked.length} carry the marker: ${marked.map((anchor) => anchor.markup).join(', ')} (rule B-3).`,
      ).toBe(0);
      expect(
        renderedMarked,
        `[${project}] ${path} is reached outside the five navigation destinations, so no rendered navigation item may carry aria-current="page"; ${renderedMarked} do (rule B-3).`,
      ).toBe(0);
    }
  }
});

test(`WT-17 / B-4 [${CONFIGURATION_SET}] the footer repeats the five navigation destinations and carries its own two links`, async ({ page }) => {
  const project = configuration();

  for (const path of EIGHT_PAGES) {
    await page.goto(path);

    const navigationTargets = await readNavigationTargets(page);
    const footerAnchors = await readAnchors(page, 'footer a[href]');

    const destinations = new Set<string>();
    const problems: string[] = [];

    for (const anchor of footerAnchors) {
      const reference = classifyReference(anchor.href, page.url());

      if (reference.kind === 'mailbox') {
        if (!MAILBOX.test(reference.address)) {
          problems.push(`a mailto link with no usable address — ${anchor.markup}`);
        }
        continue;
      }

      if (reference.kind !== 'page') {
        problems.push(`${describeReference(reference)} — ${anchor.markup}`);
        continue;
      }

      if (!isPage(reference.path)) {
        problems.push(`the page ${reference.path}, which is outside the eight — ${anchor.markup}`);
        continue;
      }

      destinations.add(reference.path);
    }

    expect(
      problems,
      `[${project}] On ${path}, ${problems.length} footer links do not lead anywhere this site offers, so they cannot perform their function (rule B-4):\n${problems.join('\n')}`,
    ).toEqual([]);

    const missingNavigation = navigationTargets.filter((target) => !destinations.has(target));
    expect(
      missingNavigation,
      `[${project}] On ${path}, the footer omits ${missingNavigation.length} of the navigation destinations the header carries (${missingNavigation.join(', ')}); the footer links to ${[...destinations].sort().join(', ')}.`,
    ).toEqual([]);

    const missingFooterLinks = ['/privacy', '/legal'].filter((target) => !destinations.has(target));
    expect(
      missingFooterLinks,
      `[${project}] On ${path}, the footer omits ${missingFooterLinks.join(', ')}, which A0 lists among the footer's own links; the footer links to ${[...destinations].sort().join(', ')}.`,
    ).toEqual([]);

    const unnamed = footerAnchors.filter(
      (anchor) => anchor.text === '' && (anchor.label ?? '').trim() === '',
    );
    expect(
      unnamed.map((anchor) => anchor.markup),
      `[${project}] On ${path}, ${unnamed.length} footer links carry no accessible name, so a reader cannot tell where they lead (rule B-4).`,
    ).toEqual([]);
  }
});

/* -------------------------------------------------------------------------------------------------
 * WT-17, clause two — the two independent ways into the product route
 * ---------------------------------------------------------------------------------------------- */

test(`WT-17 [${CONFIGURATION_SET}] the product route is reached from the home page by two independent affordances`, async ({ page }) => {
  const project = configuration();

  await page.goto('/');

  const selector = `main a[href="${PRODUCT_PAGE}"]`;
  const links = page.locator(selector);
  const count = await links.count();

  expect(
    count,
    `[${project}] The home page carries ${count} anchors to ${PRODUCT_PAGE} inside main. WT-17 requires two independent affordances — stage card 01 inside the stage list and the product-feature action outside it — and the link is located by its target, never by its text, because the copy is not yet final.`,
  ).toBe(2);

  /*
   * The two affordances are told apart by the region each sits in: the stage list is the `ul` of
   * four cards in which exactly one card links to the product route, and the product-feature action
   * sits in no list at all. That is a structural distinction, so it survives a copy edit and a
   * reordered page.
   */
  const regions = await page.locator(selector).evaluateAll(
    (nodes, parameters) =>
      nodes.map((node) => {
        const list = node.closest('ul');
        const cards = list === null ? [] : Array.from(list.querySelectorAll(':scope > li'));
        const linkedCards = cards.filter(
          (card) => card.querySelector(`a[href="${parameters.target}"]`) !== null,
        );

        return {
          inStageList: cards.length === parameters.cards && linkedCards.length === 1,
          markup: node.outerHTML,
        };
      }),
    { target: PRODUCT_PAGE, cards: STAGE_CARD_COUNT },
  );

  const insideStageList = regions.filter((region) => region.inStageList).length;

  expect(
    insideStageList,
    `[${project}] Of the ${count} home-page anchors to ${PRODUCT_PAGE}, ${insideStageList} sit inside the stage list. WT-17 names two independent affordances, one in each region:\n${regions
      .map(
        (region, index) =>
          `${index + 1}. ${region.inStageList ? 'inside the stage list' : 'in no list (the product-feature action)'} — ${region.markup}`,
      )
      .join('\n')}`,
  ).toBe(1);

  for (let index = 0; index < count; index += 1) {
    await expect(
      links.nth(index),
      `[${project}] The home page's anchor ${index + 1} to ${PRODUCT_PAGE} carries no accessible name, so a reader is given a link with no idea where it leads (rule B-4).`,
    ).toHaveAccessibleName(/\S/);
  }

  /*
   * Each affordance is followed on its own, and the page is reloaded in between, because one can
   * break while the other still works: a broken card target and a broken action are separate
   * defects, and the crawl alone would only prove that some route into the page existed.
   */
  for (let index = 0; index < count; index += 1) {
    const affordance = regions[index].inStageList
      ? 'stage card 01'
      : 'the product-feature action';

    await page.goto('/');

    const [response] = await Promise.all([
      page.waitForResponse((candidate) => {
        if (!candidate.request().isNavigationRequest()) {
          return false;
        }

        return normalisePath(new URL(candidate.url()).pathname) === PRODUCT_PAGE;
      }),
      page.locator(selector).nth(index).click(),
    ]);

    expect(
      response.status(),
      `[${project}] Following ${affordance} from the home page answered ${response.status()} for ${PRODUCT_PAGE}, so the destination is not a document a reader arrives at.`,
    ).toBe(200);

    await page.waitForURL((url) => normalisePath(url.pathname) === PRODUCT_PAGE);

    expect(
      normalisePath(new URL(page.url()).pathname),
      `[${project}] Following ${affordance} from the home page landed on ${page.url()} rather than on ${PRODUCT_PAGE}.`,
    ).toBe(PRODUCT_PAGE);

    const descriptions = await page.locator('meta[name="description"]').count();
    expect(
      descriptions,
      `[${project}] Following ${affordance} from the home page arrived at a document with ${descriptions} description tags. The product page carries exactly one and the withheld page-not-found document carries none, so this arrival is not the destination the affordance promises.`,
    ).toBe(1);
  }
});

/* -------------------------------------------------------------------------------------------------
 * WT-17, clause three — the cards that are not links
 * ---------------------------------------------------------------------------------------------- */

test(`WT-17 / B-4 [${CONFIGURATION_SET}] the stage cards without a page of their own are not links`, async ({ page }) => {
  const project = configuration();

  for (const path of ['/', '/platform']) {
    await page.goto(path);

    const lists = await readStageLists(page);

    expect(
      lists.length,
      `[${project}] On ${path}, ${lists.length} four-card stage lists were found; exactly one is expected, the list of ${STAGE_CARD_COUNT} cards in which exactly one card links to ${PRODUCT_PAGE}. A different count means the block this check locates is not the stage list, so the cards below it were never examined.`,
    ).toBe(1);

    const [list] = lists;
    const linked = list.records
      .filter((card) => card.anchors > 0)
      .map((card) => card.position);

    expect(
      linked,
      `[${project}] On ${path}, the stage list renders the cards at positions ${linked.map((position) => position + 1).join(', ') || 'none'} as links. Only card 1 is a link, because it is the only stage with a page of its own; the linked markup is:\n${list.records
        .filter((card) => card.anchors > 0)
        .map((card) => card.markup)
        .join('\n')}`,
    ).toEqual([0]);

    expect(
      list.records[0].anchors,
      `[${project}] On ${path}, card 1 of the stage list renders ${list.records[0].anchors} anchors; it is the one stage with a page of its own, so it is exactly one link and no more:\n${list.records[0].markup}`,
    ).toBe(1);

    for (const card of list.records) {
      if (card.position === 0) {
        continue;
      }

      const label = `card ${card.position + 1} of the stage list`;

      expect(
        card.anchors,
        `[${project}] On ${path}, ${label} renders ${card.anchors} anchor(s), so a card that leads nowhere is presented as a link (rule B-4):\n${card.markup}`,
      ).toBe(0);

      expect(
        card.roleLinks,
        `[${project}] On ${path}, ${label} contains ${card.roleLinks} element(s) claiming role="link", so a card that leads nowhere is presented as a link (rule B-4).`,
      ).toBe(0);

      expect(
        card.focusable,
        `[${project}] On ${path}, ${label} contains ${card.focusable} element(s) carrying a tabindex, so a keyboard reader is invited to a control the card does not have (rule B-3).`,
      ).toBe(0);

      expect(
        card.inlineHandlers,
        `[${project}] On ${path}, ${label} carries ${card.inlineHandlers} inline event handler(s), which makes a static card behave like a control (rule B-4).`,
      ).toBe(0);
    }
  }
});

/* -------------------------------------------------------------------------------------------------
 * B-4 — no dead control on any document
 * ---------------------------------------------------------------------------------------------- */

test(`B-4 [${CONFIGURATION_SET}] every anchor on every document performs its function`, async ({ page }) => {
  const project = configuration();

  const documents: readonly string[] = [...EIGHT_PAGES, NOT_FOUND_DOCUMENT];

  for (const path of documents) {
    const response = await page.goto(path);

    expect(
      response?.status(),
      `[${project}] ${path} answered ${response?.status()} rather than serving a document, so no anchor on it could be read.`,
    ).toBe(200);

    const anchors = await readAnchors(page, 'a[href]');
    const withoutHref = await page
      .locator('a:not([href])')
      .evaluateAll((nodes) => nodes.map((node) => node.outerHTML));

    const problems: string[] = withoutHref.map(
      (markup) => `an anchor with no href attribute leads nowhere — ${markup}`,
    );
    const fragments: string[] = [];

    for (const anchor of anchors) {
      const reference = classifyReference(anchor.href, page.url());

      switch (reference.kind) {
        case 'dead':
          problems.push(`${reference.reason} — ${anchor.markup}`);
          break;
        case 'foreign':
          problems.push(
            `points at the foreign origin ${reference.origin}, which rule B-1 forbids the site from naming and this crawl from following — ${anchor.markup}`,
          );
          break;
        case 'mailbox':
          if (!MAILBOX.test(reference.address)) {
            problems.push(`a mailto link with no usable address — ${anchor.markup}`);
          }
          break;
        case 'fragment':
          fragments.push(reference.id);
          break;
        case 'page':
          if (!isPage(reference.path)) {
            problems.push(
              `points at ${reference.path}, which is outside the eight pages — ${anchor.markup}`,
            );
          }
          break;
      }
    }

    expect(
      problems,
      `[${project}] On ${path}, ${problems.length} anchors are dead or lead outside the eight pages, so they cannot perform their function (rule B-4):\n${problems.join('\n')}`,
    ).toEqual([]);

    if (fragments.length > 0) {
      const missing = await page.evaluate(
        (ids) => ids.filter((id) => document.getElementById(id) === null),
        fragments,
      );

      expect(
        missing,
        `[${project}] On ${path}, ${missing.length} in-page anchors point at ids the document does not carry (${missing.join(', ')}), so activating them goes nowhere (rule B-4).`,
      ).toEqual([]);
    }

    const mainExists = await page.evaluate((id) => document.getElementById(id) !== null, MAIN_ID);
    expect(
      mainExists,
      `[${project}] On ${path}, the main region is missing, so the document's first control leads nowhere (rule B-4).`,
    ).toBe(true);

    /*
     * Rule B-4 allows a control that cannot act to be presented as disabled with a text
     * explanation. Nothing on the delivered site is in that state, so a disabled control found on a
     * plain load is reported rather than allowed: it would be a control that performs no function
     * without saying so.
     */
    const disabled = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll(
          'button[disabled], input[disabled], select[disabled], textarea[disabled], [aria-disabled="true"]',
        ),
      ).map((element) => element.outerHTML),
    );

    expect(
      disabled,
      `[${project}] On ${path}, ${disabled.length} controls are disabled on a plain load:\n${disabled.join('\n')}`,
    ).toEqual([]);
  }
});

/* -------------------------------------------------------------------------------------------------
 * WT-17 — the withheld fallback document
 * ---------------------------------------------------------------------------------------------- */

test(`WT-17 [${CONFIGURATION_SET}] no page links to the page-not-found document`, async ({ page }) => {
  const project = configuration();

  for (const path of ['/', '/about', '/contact']) {
    await page.goto(path);

    const anchors = await readAnchors(page, 'a[href]');
    const toFallback: string[] = [];
    const outside: string[] = [];

    for (const anchor of anchors) {
      const reference = classifyReference(anchor.href, page.url());

      if (reference.kind !== 'page') {
        continue;
      }

      if (reference.path === normalisePath(NOT_FOUND_DOCUMENT)) {
        toFallback.push(anchor.markup);
      } else if (!isPage(reference.path)) {
        outside.push(`${reference.path} — ${anchor.markup}`);
      }
    }

    expect(
      toFallback,
      `[${project}] On ${path}, ${toFallback.length} anchors link to the page-not-found document, which is withheld from the navigation, from the sitemap and from every crawler (AAP 0.4.2):\n${toFallback.join('\n')}`,
    ).toEqual([]);

    expect(
      outside,
      `[${project}] On ${path}, ${outside.length} anchors lead outside the eight pages:\n${outside.join('\n')}`,
    ).toEqual([]);
  }

  /*
   * The crawl above distinguishes a real page from the fallback document by the description tag,
   * so that marker is asserted here rather than assumed: the fallback carries none.
   */
  const response = await page.goto(NOT_FOUND_DOCUMENT);

  expect(
    response?.status(),
    `[${project}] ${NOT_FOUND_DOCUMENT} answered ${response?.status()} rather than serving the built fallback document.`,
  ).toBe(200);

  const descriptions = await page.locator('meta[name="description"]').count();
  expect(
    descriptions,
    `[${project}] ${NOT_FOUND_DOCUMENT} carries ${descriptions} description tags. The crawl identifies the fallback document by its having none, so a description here would make a wrong arrival indistinguishable from a page.`,
  ).toBe(0);
});

