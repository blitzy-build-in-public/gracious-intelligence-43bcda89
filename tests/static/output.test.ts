/**
 * tests/static/output.test.ts — the built-output suite (WT-02, WT-03, WT-08, WT-09, WT-14, WT-15).
 *
 * This is the file that reads what the build actually emitted and holds it against six acceptance
 * criteria at once: no design-reference residue anywhere in the nine documents (WT-02), no
 * third-party host and no published font licence (WT-03), the raster allow-list on the output side
 * (WT-08), indexability following `PUBLIC_SITE_LIVE` with the page-not-found route withheld in every
 * configuration (WT-09), the ten sovereignty controls each carrying its status label plus the limits
 * statement (WT-14), and per-page copy fidelity against the content specification (WT-15). WT-01's
 * completeness is asserted first, as a precondition, because every other assertion needs the pages to
 * exist: a scan that discovers its own pages would pass on a build that emitted none of them.
 *
 * The plan's hardest gate lives here. WT-15 is performed through `tests/helpers/spec.ts`, which
 * applies the specification's own field, item, link and bracket reading rules (AAP 0.7.3), so no
 * expected string is hand-typed into this file: the document supplies every one. Where a structural
 * assertion needs a string the specification does not have to supply — the ten controls, their
 * status labels, the three screen frames' fallback panel — it comes from the content module that
 * owns it (`src/content/*`), never from a literal here.
 *
 * Rules this file enforces, and the boundaries it keeps:
 *
 * - **W-1** — the design reference supplies layout and style only. WT-02's word list and the
 *   committed residue fixture are that rule's output-side proof: no template string of four or more
 *   words, and none of the ten words the criterion names, may reach a document.
 * - **B-1** — no runtime request to a third-party host. Every absolute reference the output makes is
 *   collected from the places a page can actually fetch from (an element's `href` or `src`, the Open
 *   Graph URL and image, the sitemap's `<loc>`, `robots.txt`'s `Sitemap:` line and a stylesheet's
 *   `url()`) and each one must be `https:` on the site's own origin or the form endpoint's. Nothing
 *   from `licenses/` may be published, and no built file may carry a font licence text.
 * - **B-2** — no secret and no configured value leaking: no built file names an `.env` path or
 *   carries a credential header, and the contact address appears only in the configuration that sets
 *   it (the `live` build sets one; the `default` build sets none).
 * - **B-4** — no invented content. WT-15's copy fidelity is the mechanism, and the conditional
 *   blocks are asserted absent by default so a figure can never appear without its attribution.
 * - **W-2** — static site only: `sitemap.xml` and `robots.txt` are build-time text, and no server
 *   artefact (`_worker.js`, `functions/`, a `middleware` module) exists in the output.
 * - **B-3** — contrast, focus and axe belong to `tests/e2e/a11y.spec.ts`. Nothing here asserts them,
 *   and the visible-text extraction below is deliberately faithful rather than forgiving so the
 *   accessibility suite is not handed a softened page.
 *
 * The state of the content specification, and what it means for the WT-15 groups. The document was
 * never supplied to this run: `tests/fixtures/website-content-specification.md` carries its
 * absent-document notice, and `loadSpecification()` therefore throws, naming the document and the
 * reason, rather than returning a model with no copy in it (AAP 0.7.7). Those groups are implemented
 * in full and are left to fail for exactly that reason — never skipped, never made conditional, never
 * replaced by a hand-typed string — because a fidelity assertion that passed while the document was
 * absent would be the one defect this suite exists to prevent. Every other grouping is live now and
 * must pass. Each group that depends on the document opens by loading it, so the failure quotes the
 * path of the missing document rather than a downstream symptom.
 *
 * How a document is reduced to text. Each of the nine emitted documents is reduced to what a visitor
 * reads: HTML comments removed, `<script>` and `<style>` removed **with their content** so the CSP
 * `content` strings and the islands' code can never produce a hit, the remaining tags removed with no
 * replacement character so a phrase split across an element still reads as one phrase, the result's
 * entities decoded, and the whole normalised by `normaliseText` — the same normaliser
 * `tests/helpers/spec.ts` applies to the model, so the two sides cannot disagree about entities or
 * whitespace (AAP 0.7.3; Astro 7's `compressHTML` makes that agreement load-bearing, AAP 0.3.1).
 * Attributes are read separately, because an `aria-label` or an `href` is not visible text and must
 * be asserted as the attribute it is.
 *
 * Two builds, made once each. `before` builds the `default` configuration and the `live` one into
 * their own directories under the one output root (AAP 0.13.2), so no assertion reads `dist/` or a
 * sibling suite's output, and the whole file costs two builds. The `default` build is the empty state
 * — no endpoint, no address, no site URL, not live — and is what most assertions read (AAP 0.9.3);
 * the `live` build proves that each switch moves. A build that does not exit zero fails there, with
 * the child's own output quoted, rather than letting two dozen assertions each report a damaged page.
 */

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { build, environmentFor } from '../helpers/build.ts';
import { loadSpecification, normaliseText } from '../helpers/spec.ts';
import type { SectionId, SpecSection, Specification } from '../helpers/spec.ts';
import { about } from '../../src/content/about.ts';
import { global } from '../../src/content/global.ts';
import { siteIntelligence } from '../../src/content/site-intelligence.ts';
import { sovereignty } from '../../src/content/sovereignty.ts';

/* -------------------------------------------------------------------------------------------------
 * Where everything lives
 * ---------------------------------------------------------------------------------------------- */

/** This file's directory, from which the repository root and every input are resolved. */
const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));

/**
 * The repository root, resolved from this module's own location rather than from the working
 * directory, so the suite reads the same tree whether the runner starts it from the root or not.
 */
const REPOSITORY_ROOT = path.resolve(TEST_DIRECTORY, '..', '..');

/** The residue fixture: the design reference's own strings of four or more words. */
const RESIDUE_FIXTURE = path.join(REPOSITORY_ROOT, 'tests', 'fixtures', 'figma-residue.json');

/**
 * This suite's own two output directories, inside the one root `.gitignore` covers and named for
 * this suite so neither can be mistaken for a configuration another suite built (AAP 0.13.2).
 */
const OUTPUT_DIRECTORIES = {
  default: path.join(REPOSITORY_ROOT, '.build', 'static-output-default'),
  live: path.join(REPOSITORY_ROOT, '.build', 'static-output-live'),
} as const;

/** The two configurations this suite builds. */
type BuildName = keyof typeof OUTPUT_DIRECTORIES;

/** The live configuration's environment, from the harness that owns it — never restated here. */
const LIVE_ENVIRONMENT = environmentFor('live');

/** The empty configuration's environment, for the precondition that it really is empty. */
const DEFAULT_ENVIRONMENT = environmentFor('default');

/** The site's own origin in the `live` build, derived from the harness's own configuration value. */
const LIVE_SITE_ORIGIN = new URL(LIVE_ENVIRONMENT.PUBLIC_SITE_URL).origin;

/** The form endpoint's origin in the `live` build, derived the same way. */
const LIVE_ENDPOINT_ORIGIN = new URL(LIVE_ENVIRONMENT.PUBLIC_FORM_ENDPOINT).origin;

/**
 * The only two hosts the output may name: the site's own and the form endpoint's (rule B-1). Any
 * third host anywhere in the output is a defect, including a font CDN or a link-preview image served
 * from somewhere other than the site.
 */
const ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  new URL(LIVE_SITE_ORIGIN).host,
  new URL(LIVE_ENDPOINT_ORIGIN).host,
]);

/** The contact address the `live` configuration configures, and the `default` one does not. */
const LIVE_CONTACT_ADDRESS = LIVE_ENVIRONMENT.PUBLIC_CONTACT_EMAIL;

/**
 * One document the build emits, named by the route a visitor asks for. Every report quotes the route
 * rather than the file path, because the route is what a reviewer compares against the frames.
 */
interface EmittedPage {
  /** The route the page answers on. */
  readonly route: string;
  /** The document's path inside the build output, in the output's own directory format. */
  readonly file: string;
}

/**
 * The eight navigable pages, in navigation order. The list is written out rather than derived by
 * walking the output, because a scan that discovered its own pages would pass on a build that
 * emitted none of them.
 */
const PAGES: readonly EmittedPage[] = [
  { route: '/', file: 'index.html' },
  { route: '/platform', file: 'platform/index.html' },
  { route: '/platform/site-intelligence', file: 'platform/site-intelligence/index.html' },
  { route: '/sovereignty', file: 'sovereignty/index.html' },
  { route: '/about', file: 'about/index.html' },
  { route: '/contact', file: 'contact/index.html' },
  { route: '/privacy', file: 'privacy/index.html' },
  { route: '/legal', file: 'legal/index.html' },
];

/** The page-not-found route: emitted, withheld from every crawler, never in the sitemap. */
const NOT_FOUND: EmittedPage = { route: '/404', file: '404.html' };

/** All nine emitted documents: the eight pages and the page-not-found route. */
const DOCUMENTS: readonly EmittedPage[] = [...PAGES, NOT_FOUND];

/**
 * Every non-document artefact the build must emit (AAP 0.4.2, 0.8.3): the two generated text routes,
 * the generated favicon and the two generated PNGs, and the two vendored font files. A missing entry
 * fails by name, because each is referenced from every page and its absence is a 404 in production.
 */
const REQUIRED_ARTEFACTS: readonly string[] = [
  'sitemap.xml',
  'robots.txt',
  'favicon.svg',
  'og-image.png',
  'apple-touch-icon.png',
  'fonts/urbanist-latin-var.woff2',
  'fonts/geist-mono-latin-var.woff2',
];

/**
 * The directories of the source tree that must never be published (AAP 0.4.2). `public/` is copied
 * verbatim into the build, so a licence text left there would ship; `licenses/` therefore sits at the
 * repository root and `tests/`, `scripts/` and `screenshots/` never enter the output at all.
 */
const FORBIDDEN_OUTPUT_DIRECTORIES: readonly string[] = [
  'src',
  'tests',
  'scripts',
  'licenses',
  'screenshots',
];

/** Every extension a raster image can carry; the output may hold only the generated ones (WT-08). */
const RASTER_EXTENSIONS: ReadonlySet<string> = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif']);

/** The two rasters the build generates for itself, as output-relative paths (AAP 0.4.2). */
const GENERATED_RASTERS: ReadonlySet<string> = new Set(['og-image.png', 'apple-touch-icon.png']);

/** The owner's drop point for the three product screens; its PNGs are the only other admitted raster. */
const SCREEN_DIRECTORY = 'screens/';

/** The namespace a sitemap 0.9 document declares; the one absolute URI WT-03 must tolerate. */
const SITEMAP_NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9';

/** The font-licence marker no built file may contain (WT-03, AAP 0.5.3). */
const FONT_LICENCE_MARKER = 'SIL OPEN FONT LICENSE';

/**
 * The request header that carries a credential, named here so the published output can be scanned for
 * it. The name is held apart from the separator that follows it in the assertion below, because a
 * header written with a value beside it is exactly the shape this file reports — in the output, and
 * never in its own source.
 */
const CREDENTIAL_HEADER = 'Authorization';

/**
 * That header followed by a value, bare or behind an auth scheme word (`Bearer <token>`, `Basic
 * <token>`, `token <token>`): the shape a credential in a built file would have.
 */
const CREDENTIAL_HEADER_WITH_VALUE = new RegExp(
  `\\b${CREDENTIAL_HEADER}\\b\\s*[:=]\\s*(?:[A-Za-z][\\w-]*\\s+)?\\S{8,}`,
  'i',
);

/**
 * The ten words WT-02 names, lower-cased. The criterion allows this list to be literal, and it is
 * the criterion's own vocabulary rather than specification copy, so it is stated here rather than
 * derived: the residue fixture is the derived half of the same rule.
 */
const RESIDUE_WORDS: readonly string[] = [
  'modelz',
  'hire a model',
  'become a model',
  'new faces',
  'latest show',
  'los angeles',
  'runway',
  'fashion',
  'photoshoot',
  'lorem',
];

/** How much of the sentence around a hit a failure quotes, in characters either side. */
const CONTEXT_CHARACTERS = 80;

/* -------------------------------------------------------------------------------------------------
 * Visible text
 * ---------------------------------------------------------------------------------------------- */

/** An HTML comment, content included. A comment's content is never copy. */
const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/g;

/**
 * A `<script>` or `<style>` element with its content. Astro emits three island scripts by reference
 * and inlines no style element, but the CSP-bearing neighbours and any inlined style are still not
 * text a visitor reads, so both are removed with their content.
 */
const SCRIPT_OR_STYLE_PATTERN = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

/** Any remaining tag. Attribute values inside are removed with it — they are not visible text. */
const TAG_PATTERN = /<[^>]*>/g;

/**
 * One entity reference, named or numeric, matched left to right so each is decoded exactly once and
 * `&amp;lt;` becomes `&lt;` rather than `<`.
 */
const ENTITY_PATTERN = /&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g;

/**
 * The named entities a built page realistically carries: the five markup escapes, the spacing entity
 * and the punctuation Astro may emit. A `Map`, so an unknown name is left literal instead of being
 * resolved through an inherited property; the lookup is case-insensitive because a DOM may emit
 * `&AMP;`.
 */
const NAMED_ENTITIES: ReadonlyMap<string, string> = new Map([
  ['amp', '&'],
  ['lt', '<'],
  ['gt', '>'],
  ['quot', '"'],
  ['apos', "'"],
  ['nbsp', ' '],
  ['hellip', '\u2026'],
  ['mdash', '\u2014'],
  ['ndash', '\u2013'],
  ['lsquo', '\u2018'],
  ['rsquo', '\u2019'],
  ['ldquo', '\u201c'],
  ['rdquo', '\u201d'],
  ['copy', '\u00a9'],
  ['middot', '\u00b7'],
  ['times', '\u00d7'],
]);

/**
 * Decodes the entities a built document carries: every numeric character reference, decimal or
 * hexadecimal, plus the named set above. This is the step 0.7.3 requires before any comparison —
 * Astro escapes `&`, `<`, `>` and quotes in text and in attribute values, so an undecoded page
 * would never equal the document's own spelling of the same string.
 */
function decodeEntities(text: string): string {
  return text.replace(ENTITY_PATTERN, (match: string, body: string): string => {
    if (body.startsWith('#')) {
      const hexadecimal = body[1] === 'x' || body[1] === 'X';
      const codePoint = Number.parseInt(body.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      const decodable =
        codePoint > 0 && codePoint <= 0x10ffff && (codePoint < 0xd800 || codePoint > 0xdfff);
      return decodable ? String.fromCodePoint(codePoint) : match;
    }
    const character = NAMED_ENTITIES.get(body.toLowerCase());
    return character === undefined ? match : character;
  });
}

/**
 * A document with everything a visitor cannot read removed: comments, `<script>`/`<style>` elements
 * with their content, and every remaining tag.
 *
 * Tags are removed with no replacement character on purpose. A string the design reference owns can
 * span an element boundary, and inserting a separator would break that match while adding nothing:
 * the whitespace between elements in the emitted markup is real text and survives the strip.
 */
function stripNonVisible(document: string): string {
  const withoutComments = document.replace(HTML_COMMENT_PATTERN, '');
  const withoutScripts = withoutComments.replace(SCRIPT_OR_STYLE_PATTERN, '');
  return withoutScripts.replace(TAG_PATTERN, '');
}

/**
 * The text a visitor reads in one document, normalised for comparison: comments, script and style
 * content and every tag removed, entities decoded, then normalised by the shared `normaliseText`.
 *
 * The shared normaliser is used on both sides of every assertion — here for the page, and inside
 * `tests/helpers/spec.ts` for the model — so the two can never disagree about whitespace or about
 * which quote character a contributor typed.
 */
function visibleText(document: string): string {
  return normaliseText(decodeEntities(stripNonVisible(document)));
}


/* -------------------------------------------------------------------------------------------------
 * Elements and attributes
 * ---------------------------------------------------------------------------------------------- */

/**
 * One element as this file reads it: its attributes decoded, and its inner content as written.
 *
 * There is no DOM parser in the tree and none is added, so an element is read by its own tag name.
 * That is sufficient here because every element this file inspects — `a`, `title`, `meta`, `link`,
 * `ul`, `h2`, `details`, `summary`, `figure` — is emitted by Astro with balanced tags and never
 * nests inside itself, so the first closing tag ends the element.
 */
interface ElementMatch {
  /** The element's attributes, names lower-cased and values decoded. */
  readonly attributes: ReadonlyMap<string, string>;
  /** Everything between the open and close tags, or the empty string for a void element. */
  readonly inner: string;
}

/** One attribute, with or without a value, in any of HTML's four quoting forms. */
const ATTRIBUTE_PATTERN = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

/** Reads an element's attribute source into a map, decoding each value and keeping the first of a name. */
function attributeMap(source: string): Map<string, string> {
  const attributes = new Map<string, string>();
  for (const match of source.matchAll(ATTRIBUTE_PATTERN)) {
    const name = (match[1] ?? '').toLowerCase();
    if (name.length === 0 || attributes.has(name)) continue;
    attributes.set(name, decodeEntities(match[2] ?? match[3] ?? match[4] ?? ''));
  }
  return attributes;
}

/** One attribute of an element, or `undefined` when the element does not carry it. */
function attributeValue(element: ElementMatch, name: string): string | undefined {
  return element.attributes.get(name);
}

/** Every element of one tag name that has a closing tag, in document order. */
function pairedElements(document: string, tagName: string): ElementMatch[] {
  const pattern = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}\\s*>`, 'gi');
  const elements: ElementMatch[] = [];
  for (const match of document.matchAll(pattern)) {
    elements.push({ attributes: attributeMap(match[1] ?? ''), inner: match[2] ?? '' });
  }
  return elements;
}

/** Every void element of one tag name, in document order: `meta`, `link`, `img`, `input`, `source`. */
function voidElements(document: string, tagName: string): ElementMatch[] {
  const pattern = new RegExp(`<${tagName}\\b([^>]*)>`, 'gi');
  const elements: ElementMatch[] = [];
  for (const match of document.matchAll(pattern)) {
    const source = (match[1] ?? '').replace(/\/\s*$/, '');
    elements.push({ attributes: attributeMap(source), inner: '' });
  }
  return elements;
}

/** Every element of any name, as one chunk of tag source, which is how an attribute is read. */
const FETCHING_TAG_PATTERN = /<[a-zA-Z][^>]*>/g;

/** The text of a document's `<title>` elements, normalised. Empty when the document has none. */
function documentTitles(document: string): string[] {
  return pairedElements(document, 'title').map((element) => normaliseText(decodeEntities(element.inner)));
}

/** Every `<meta>` element in a document, as an attribute map. */
function metaElements(document: string): ElementMatch[] {
  return voidElements(document, 'meta');
}

/** Every `content` value a `<meta>` carries for one `name`/`property` key, in document order. */
function metaContents(document: string, key: string): string[] {
  const contents: string[] = [];
  for (const element of metaElements(document)) {
    const name = attributeValue(element, 'name') ?? attributeValue(element, 'property');
    if (name === undefined || name.toLowerCase() !== key.toLowerCase()) continue;
    const content = attributeValue(element, 'content');
    if (content !== undefined) contents.push(content);
  }
  return contents;
}

/** One anchor: the text a visitor reads inside it, and the target it carries. */
interface Anchor {
  /** The anchor's visible text, normalised — the same reduction every other assertion compares against. */
  readonly text: string;
  /** The anchor's `href`, decoded. */
  readonly href: string;
}

/** Every anchor in a document that carries an `href`, in document order. */
function anchors(document: string): Anchor[] {
  const found: Anchor[] = [];
  for (const element of pairedElements(document, 'a')) {
    const href = attributeValue(element, 'href');
    if (href === undefined) continue;
    found.push({ text: visibleText(element.inner), href: href.trim() });
  }
  return found;
}

/* -------------------------------------------------------------------------------------------------
 * The build output
 * ---------------------------------------------------------------------------------------------- */

/** Every file in a build output, as paths relative to it and joined with `/`. */
function builtFiles(
  configuration: BuildName,
  directory: string = OUTPUT_DIRECTORIES[configuration],
  relative = '',
): string[] {
  assert.ok(
    existsSync(directory),
    `${directory} does not exist, so the ${configuration} build's files could not be read at all; the before hook of this file builds that configuration there`,
  );
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const childRelative = relative === '' ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...builtFiles(configuration, path.join(directory, entry.name), childRelative));
      continue;
    }
    files.push(childRelative);
  }
  return files.sort();
}

/** One built file's text, with a failure naming the absolute path when it is absent. */
function readBuiltFile(configuration: BuildName, relative: string): string {
  const absolute = path.join(OUTPUT_DIRECTORIES[configuration], relative);
  assert.ok(
    existsSync(absolute),
    `${absolute} does not exist, so the ${configuration} build did not emit it and no assertion about its content can be made`,
  );
  return readFileSync(absolute, 'utf8');
}

/** One emitted document's own bytes. */
function pageDocument(configuration: BuildName, page: EmittedPage): string {
  return readBuiltFile(configuration, page.file);
}

/** One emitted document's visible text, reduced exactly as every assertion here expects. */
function pageText(configuration: BuildName, page: EmittedPage): string {
  return visibleText(pageDocument(configuration, page));
}

/** The characters either side of one hit, so a reviewer can find the sentence without re-running. */
function quoteContext(text: string, offset: number, length: number): string {
  const start = Math.max(0, offset - CONTEXT_CHARACTERS);
  const end = Math.min(text.length, offset + length + CONTEXT_CHARACTERS);
  return text.slice(start, end);
}

/** Every offset at which `needle` occurs in `haystack`, found left to right. */
function offsetsOf(haystack: string, needle: string): number[] {
  const offsets: number[] = [];
  if (needle.length === 0) return offsets;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return offsets;
    offsets.push(at);
    from = at + needle.length;
  }
}

/* -------------------------------------------------------------------------------------------------
 * Absolute references, rasters and licence text
 * ---------------------------------------------------------------------------------------------- */

/** One reference the output makes, with the file it appears in. */
interface AbsoluteReference {
  /** The reference exactly as the output writes it, entity-decoded. */
  readonly uri: string;
  /** The output-relative file it appears in. */
  readonly file: string;
}

/** Everything the output refers to, split by the two kinds WT-03 judges differently. */
interface CollectedReferences {
  /** Absolute references: every one must be `https:` on one of the two legitimate hosts. */
  readonly absolute: AbsoluteReference[];
  /** `mailto:` references, which WT-03 ignores and the contact-address assertion reads instead. */
  readonly mailto: AbsoluteReference[];
}

/** A URI's scheme, if it has one. A value without a scheme is a same-site path, not a reference. */
const SCHEME_PATTERN = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;

/** One `url(...)` reference in a stylesheet, quoted or not. */
const CSS_URL_PATTERN = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;

/** The line in `robots.txt` that names the sitemap on the site's own origin. */
const ROBOTS_SITEMAP_PREFIX = 'Sitemap:';

/**
 * Splits one reference into the kind WT-03 judges it by, or `null` for a same-site path.
 *
 * Only a value with a scheme is a reference here: an `href="/contact"` or a `url(/fonts/…)` is a
 * request to the site's own origin, which rule B-1 permits by construction. An `xmlns` declaration is
 * never classified, because this function is only ever handed the attributes a page fetches from —
 * `href`, `src`, the Open Graph URL and image, a `<loc>`, a robots `Sitemap:` line and a CSS `url()`.
 */
function classifyReference(value: string): 'absolute' | 'mailto' | null {
  const scheme = SCHEME_PATTERN.exec(value.trim());
  if (scheme === null) return null;
  return (scheme[1] ?? '').toLowerCase() === 'mailto' ? 'mailto' : 'absolute';
}

/**
 * Every reference a build makes, collected from the places a page can actually fetch from: an
 * element's `href` or `src`, the `og:url` and `og:image` values, the sitemap's `<loc>`, `robots.txt`'s
 * `Sitemap:` line, and a stylesheet's `url()`.
 *
 * An XML namespace declaration is not a fetch and is never collected, and neither is a comment: the
 * built stylesheet opens with the bundler's own licence banner, which names the tool's home page in a
 * comment that no browser requests. What remains is exactly the set of network destinations the
 * artefact asks for, which is what rule B-1 constrains.
 */
function collectReferences(configuration: BuildName): CollectedReferences {
  const absolute: AbsoluteReference[] = [];
  const mailto: AbsoluteReference[] = [];

  const record = (value: string, file: string): void => {
    const trimmed = normaliseText(value);
    if (trimmed.length === 0) return;
    const kind = classifyReference(trimmed);
    if (kind === null) return;
    (kind === 'mailto' ? mailto : absolute).push({ uri: trimmed, file });
  };

  for (const file of builtFiles(configuration)) {
    if (file.endsWith('.html')) {
      const document = readBuiltFile(configuration, file);
      for (const match of document.matchAll(FETCHING_TAG_PATTERN)) {
        const source = (match[0] ?? '').replace(/^<[a-zA-Z]+/, '').replace(/>$/, '');
        const attributes = attributeMap(source);
        record(attributes.get('href') ?? '', file);
        record(attributes.get('src') ?? '', file);
      }
      for (const key of ['og:url', 'og:image']) {
        for (const content of metaContents(document, key)) record(content, file);
      }
      continue;
    }
    if (file === 'sitemap.xml') {
      for (const element of pairedElements(readBuiltFile(configuration, file), 'loc')) {
        record(element.inner, file);
      }
      continue;
    }
    if (file === 'robots.txt') {
      for (const line of readBuiltFile(configuration, file).split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith(ROBOTS_SITEMAP_PREFIX)) continue;
        record(trimmed.slice(ROBOTS_SITEMAP_PREFIX.length), file);
      }
      continue;
    }
    if (file.endsWith('.css')) {
      for (const match of readBuiltFile(configuration, file).matchAll(CSS_URL_PATTERN)) {
        record(match[2] ?? '', file);
      }
    }
  }

  return { absolute, mailto };
}

/** Every raster image in a build output, as output-relative paths (WT-08's output-side scan). */
function builtRasters(configuration: BuildName): string[] {
  return builtFiles(configuration).filter((file) => RASTER_EXTENSIONS.has(path.extname(file).toLowerCase()));
}

/** The last stretch of a child process's output, so a build failure quotes what it actually said. */
function outputTail(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) return '(no output)';
  return trimmed.length <= 4000 ? trimmed : `…${trimmed.slice(-4000)}`;
}

/* -------------------------------------------------------------------------------------------------
 * The two builds
 * ---------------------------------------------------------------------------------------------- */

/**
 * How long the two builds may take together. The build spawns the project's own script twice; a
 * generous bound keeps a slow host from failing the suite while still failing a build that hangs.
 */
const BUILD_TIMEOUT_MS = 1_200_000;

/**
 * Builds the `default` and `live` configurations once each, into this suite's own directories.
 *
 * A failed build fails here with the child's own output quoted, rather than letting every assertion
 * below report a damaged page: one readable build failure is worth two dozen symptoms.
 */
before(async () => {
  for (const configuration of ['default', 'live'] as const) {
    const result = await build(configuration, { outDir: OUTPUT_DIRECTORIES[configuration] });
    assert.ok(
      result.ok,
      `the ${configuration} build failed (exit ${result.status}), so no assertion about the ${configuration} output can be made.\nstdout:\n${outputTail(result.stdout)}\nstderr:\n${outputTail(result.stderr)}`,
    );
  }
}, { timeout: BUILD_TIMEOUT_MS });


/* -------------------------------------------------------------------------------------------------
 * The specification model, and which route carries which of its sections
 * ---------------------------------------------------------------------------------------------- */

/**
 * The content specification, loaded from the committed fixture. Throws — naming the document and
 * the reason — when the fixture holds no document, which is the state this checkout is in.
 *
 * That throw is the intended failure rather than an accident: AAP 0.7.7 requires the fidelity
 * assertions to report a missing or unreadable document instead of building a model that would let
 * every comparison pass while checking nothing. So the groups below that depend on the document open
 * by calling this, and their failure message is the loader's own, naming the path.
 */
function specification(): Specification {
  return loadSpecification();
}

/**
 * A field whose value is not page text, and is therefore asserted somewhere other than a document's
 * visible text.
 *
 * Two of the specification's field kinds carry copy that a page never renders as text. A text
 * alternative is an attribute — the `aria-label` of a figure, the `alt` of an image — and is read by
 * assistive technology rather than displayed, so it is asserted as the attribute it is (the diagram's
 * accessible name, and the screen alternatives that must be absent while the frames show their
 * fallback panel). The social-image text and any link-preview wording are rendered into the 1200x630
 * PNG `scripts/gen-assets.ts` draws at build time (AAP 0.4.2), so no document carries them either.
 * Excluding these by name is what keeps a correct build from failing a text comparison it can never
 * satisfy; nothing else is excluded, and no page-text string is skipped.
 */
const NON_PAGE_TEXT_FIELD = /\b(?:text alternative|alternative text|alt text|accessible name|social image|social card|link preview|open graph|og:[\w-]+)\b/i;

/**
 * A field that carries document metadata — a page title or a meta description — and is asserted in
 * the metadata group rather than in a document's visible text, because `<title>` and `<meta>` content
 * are not text a visitor reads in the flow. A8 is the only section that holds these (AAP 0.7.2).
 */
const METADATA_FIELD = /\b(?:title|description)\b/i;

/**
 * A field holding a status label — `Proposed product, in discovery`, `Design intent` — which qualifies
 * a claim and therefore appears only where the claim is made rather than on every page of the shell.
 * A0 carries both labels (AAP 0.7.2, 0.7.5) and A0 is otherwise asserted on all nine documents, so
 * they are excluded here and asserted where they belong: the product's label on the pages that
 * present the offering, the sovereignty label on each of the ten control rows, and the page's own top
 * label on `/sovereignty`.
 */
const STATUS_LABEL_FIELD = /\bstatus\b/i;

/**
 * A field holding A5's conditional block: the Why now heading, its three figures and the source line
 * that closes them. The block is switched off in the repository (`about.sourceConfirmed` is `false`,
 * AAP 0.7.4), so its copy is asserted absent rather than demanded of the page, and the present half is
 * the `flags` configuration in `tests/static/builds.test.ts`.
 */
const CONDITIONAL_FIELD = /\bwhy now\b|\bfigures?\b|\bsource\b/i;

/**
 * One section of the specification and the routes that carry it.
 *
 * `shared` marks a section whose copy is deliberately divided between several documents. A7 supplies
 * the `/privacy` and `/legal` copy in one section, where neither page carries the other's body, and
 * A8 is divided by nature: the interface strings are on every page, the page-not-found copy on one,
 * the form's messages on another, the titles and descriptions in the head and the text alternatives
 * in attributes. For a shared section every string must appear on at least one of its routes — the
 * strongest assertion a divided section admits — while every other section is asserted on every route
 * that carries it, so a page that lost a block cannot be rescued by a sibling. A0 is strict on all
 * nine documents, because the shell is on every one of them.
 *
 * `configuration` is the build a section's copy is read from, when the default build does not render
 * it: A6's form is state 1 of three, so its labels, messages, confirmation and mailto copy are
 * rendered by the `live` build, and the default build shows only the fallback text.
 *
 * `omit` names the fields that are not demanded of a page here, each for a reason the field itself
 * states: a text alternative or a social-image string is not page text, a status label appears only
 * where the claim it qualifies is made, and A5's conditional block is switched off by default and is
 * asserted absent below rather than required here.
 */
interface SectionMapping {
  /** The section identifier. */
  readonly section: SectionId;
  /** The routes that carry it. */
  readonly routes: readonly string[];
  /** Whether the section's copy is divided between its routes rather than repeated on each. */
  readonly shared: boolean;
  /** The build the section's copy is read from. Defaults to the empty configuration. */
  readonly configuration?: BuildName;
  /** The fields whose values are asserted elsewhere, by the name the specification gives them. */
  readonly omit?: readonly RegExp[];
}

/**
 * The section-to-route table of AAP 0.4.3, 0.8.4 and 0.9.3. Only this table is literal: every string
 * it is compared against comes from the loaded document.
 */
const SECTION_MAPPINGS: readonly SectionMapping[] = [
  {
    section: 'A0',
    routes: DOCUMENTS.map((page: EmittedPage): string => page.route),
    shared: false,
    omit: [NON_PAGE_TEXT_FIELD, STATUS_LABEL_FIELD],
  },
  { section: 'A1', routes: ['/'], shared: false, omit: [NON_PAGE_TEXT_FIELD] },
  { section: 'A2', routes: ['/platform'], shared: false, omit: [NON_PAGE_TEXT_FIELD] },
  { section: 'A3', routes: ['/platform/site-intelligence'], shared: false, omit: [NON_PAGE_TEXT_FIELD] },
  { section: 'A4', routes: ['/sovereignty'], shared: false, omit: [NON_PAGE_TEXT_FIELD] },
  {
    section: 'A5',
    routes: ['/about'],
    shared: false,
    omit: [NON_PAGE_TEXT_FIELD, CONDITIONAL_FIELD],
  },
  { section: 'A6', routes: ['/contact'], shared: false, configuration: 'live', omit: [NON_PAGE_TEXT_FIELD] },
  { section: 'A7', routes: ['/privacy', '/legal'], shared: true, omit: [NON_PAGE_TEXT_FIELD] },
  {
    section: 'A8',
    routes: DOCUMENTS.map((page: EmittedPage): string => page.route),
    shared: true,
    omit: [NON_PAGE_TEXT_FIELD, METADATA_FIELD],
  },
];

/** The emitted document for one route, with a failure naming the route when the build lacks it. */
function pageForRoute(route: string): EmittedPage {
  const page = DOCUMENTS.find((candidate: EmittedPage): boolean => candidate.route === route);
  assert.ok(
    page !== undefined,
    `${route} is not one of the nine documents this suite knows about, so it cannot be read`,
  );
  return page;
}

/** One string a page must carry, with the part of the document it came from, for a readable report. */
interface ExpectedString {
  /** The string, normalised exactly as the page's text is. */
  readonly text: string;
  /** Where the document writes it, in words a reviewer can act on. */
  readonly origin: string;
}

/** A string trimmed for a report, so one long paragraph cannot swallow the failure message. */
function shorten(value: string): string {
  const normalised = normaliseText(value);
  return normalised.length <= 60 ? normalised : `${normalised.slice(0, 57)}…`;
}

/**
 * Every string one section supplies that a page must show as text: each field value (as its rule 3
 * and rule 4 parts), each item part, each body paragraph and each link's text.
 *
 * A field whose value is not page text — a text alternative, a link-preview string, or (in A8) a page
 * title or description — is left to the group that asserts it as what it is. Everything else is
 * demanded verbatim of the page, including a value that still holds the owner's placeholder marker:
 * the placeholder is specification copy while the owner's text is outstanding (AAP 0.11.2, 0.16.2),
 * and the guard that keeps it out of a published build is `builds.test.ts`'s.
 */
function pageTextStrings(section: SpecSection, exclusions: readonly RegExp[]): ExpectedString[] {
  const expected = new Map<string, string>();
  const add = (value: string, origin: string): void => {
    const text = normaliseText(value);
    if (text.length === 0 || expected.has(text)) return;
    expected.set(text, origin);
  };

  for (const field of section.fields) {
    if (exclusions.some((pattern: RegExp): boolean => pattern.test(field.name))) continue;
    for (const part of field.parts) add(part, `the field "${field.name}"`);
  }
  for (const item of section.items) {
    for (const part of item.parts) add(part, `the item "${shorten(item.text)}"`);
  }
  for (const paragraph of section.paragraphs) add(paragraph, 'a body paragraph');
  for (const link of section.links) add(link.text, `the link text of "${link.href}"`);

  return [...expected].map(([text, origin]: [string, string]) => ({ text, origin }));
}

/** A failure naming the build, the route, the file, the section and every string it could not find. */
function describeMissing(
  configuration: BuildName,
  route: string,
  file: string,
  section: SectionId,
  missing: readonly ExpectedString[],
  total: number,
): string {
  const shown = missing.slice(0, 8).map((entry: ExpectedString): string => `  - ${entry.origin}: "${entry.text}"`);
  const more = missing.length > shown.length ? `\n  …and ${missing.length - shown.length} more` : '';
  return `the ${configuration} build's ${route} (${file}) does not carry ${missing.length} of the ${total} strings ${section} supplies, so the page is not the specification's copy:\n${shown.join('\n')}${more}`;
}

/* -------------------------------------------------------------------------------------------------
 * A8's per-page metadata, and the page names it pairs with
 * ---------------------------------------------------------------------------------------------- */

/** One page's expected document metadata. `description` is `null` where A8 gives the page none. */
interface PageMetadata {
  /** The page's `<title>`. */
  readonly title: string;
  /** The page's meta description, or `null` for the one page A8 withholds it from. */
  readonly description: string | null;
}

/** The names A8 may give a page, at the head of its title and description fields. */
const ROUTE_PAGE_NAMES: ReadonlyArray<{ readonly route: string; readonly names: readonly string[] }> = [
  { route: '/', names: ['home', 'home page', 'homepage'] },
  { route: '/platform', names: ['platform', 'platform page'] },
  {
    route: '/platform/site-intelligence',
    names: ['site intelligence', 'platform site intelligence', 'site intelligence page'],
  },
  { route: '/sovereignty', names: ['sovereignty', 'sovereignty page'] },
  { route: '/about', names: ['about', 'about page'] },
  { route: '/contact', names: ['contact', 'contact page'] },
  { route: '/privacy', names: ['privacy', 'privacy page'] },
  { route: '/legal', names: ['legal', 'legal page'] },
  { route: '/404', names: ['page not found', 'not found', '404'] },
];

/** A page name reduced to the letters and digits it holds, so punctuation and case cannot split a pair. */
function canonicalName(value: string): string {
  return normaliseText(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * A8's title and description for each page, read off the section's own field names — `Home title:`,
 * `Home description:` and their siblings — so no expected string is typed here.
 *
 * A route whose metadata A8 does not expose fails by name, listing the field names the section does
 * carry: the pairing is the one judgement this assertion makes, and guessing a different shape would
 * silently compare the wrong strings.
 */
function a8Metadata(loaded: Specification): Map<string, PageMetadata> {
  const a8 = loaded.byId.A8;
  const titles = new Map<string, string>();
  const descriptions = new Map<string, string>();
  const fieldPattern = /^(.*?)\s*(?:page\s+)?(title|description)$/i;

  for (const field of a8.fields) {
    const match = fieldPattern.exec(normaliseText(field.name));
    if (match === null) continue;
    const key = canonicalName(match[1] ?? '');
    const value = normaliseText(field.value);
    if (key.length === 0 || value.length === 0) continue;
    if ((match[2] ?? '').toLowerCase() === 'title') titles.set(key, value);
    else descriptions.set(key, value);
  }

  const metadata = new Map<string, PageMetadata>();
  const unanswered: string[] = [];
  for (const entry of ROUTE_PAGE_NAMES) {
    const wanted = entry.names.map(canonicalName);
    const title = wanted
      .map((name: string): string | undefined => titles.get(name))
      .find((value: string | undefined): boolean => value !== undefined);
    if (title === undefined) {
      unanswered.push(`${entry.route} has no "${entry.names[0]} title" field`);
      continue;
    }
    const description = wanted
      .map((name: string): string | undefined => descriptions.get(name))
      .find((value: string | undefined): boolean => value !== undefined);
    metadata.set(entry.route, { title, description: description ?? null });
  }

  assert.deepEqual(
    unanswered,
    [],
    `A8 does not expose every page's metadata: ${unanswered.join('; ')}. The fields it does carry are ${a8.fields.map((field): string => `"${field.name}"`).join(', ') || '(none)'}, so the per-page metadata cannot be paired with a route`,
  );

  return metadata;
}


/* -------------------------------------------------------------------------------------------------
 * The two configurations, and the completeness precondition (WT-01)
 * ---------------------------------------------------------------------------------------------- */

describe('the two states this suite builds', () => {
  it('builds the empty state and the live state from the harness table, not from the ambient environment', () => {
    const emptyState = [
      DEFAULT_ENVIRONMENT.PUBLIC_FORM_ENDPOINT,
      DEFAULT_ENVIRONMENT.PUBLIC_CONTACT_EMAIL,
      DEFAULT_ENVIRONMENT.PUBLIC_SITE_URL,
      DEFAULT_ENVIRONMENT.PUBLIC_SITE_LIVE,
    ];
    assert.deepEqual(
      emptyState,
      ['', '', '', ''],
      'the default configuration must set none of the four documented values: it is the empty state most assertions read (AAP 0.9.3), and a value that leaked in from the shell would make every "not configured" assertion meaningless',
    );
    assert.equal(
      LIVE_ENVIRONMENT.PUBLIC_SITE_LIVE,
      'true',
      'the live configuration must set PUBLIC_SITE_LIVE to exactly "true", or the indexability switch it is meant to prove never moves',
    );
    assert.ok(
      LIVE_ENVIRONMENT.PUBLIC_SITE_URL.length > 0 &&
        LIVE_ENVIRONMENT.PUBLIC_FORM_ENDPOINT.length > 0 &&
        LIVE_ENVIRONMENT.PUBLIC_CONTACT_EMAIL.length > 0,
      'the live configuration must set the site address, the form endpoint and the contact address, which are the three values its assertions read',
    );
    for (const configuration of ['default', 'live'] as const) {
      assert.ok(
        existsSync(OUTPUT_DIRECTORIES[configuration]),
        `${OUTPUT_DIRECTORIES[configuration]} does not exist: the before hook of this file builds the ${configuration} configuration there`,
      );
    }
  });
});

describe('WT-01: the build emits a complete static site', () => {
  it('emits the eight page documents, the page-not-found document and every artefact the plan names, in both configurations', () => {
    const missing: string[] = [];
    for (const configuration of ['default', 'live'] as const) {
      const files = new Set(builtFiles(configuration));
      for (const relative of [...DOCUMENTS.map((page: EmittedPage): string => page.file), ...REQUIRED_ARTEFACTS]) {
        if (!files.has(relative)) missing.push(`${configuration}: ${relative}`);
      }
    }
    assert.deepEqual(
      missing,
      [],
      `the build did not emit every file its pages reference (AAP 0.4.2):\n${missing.map((entry: string): string => `  - ${entry}`).join('\n')}`,
    );
  });

  it('publishes nothing from the source tree, the tests, the scripts, the licences or the review folder', () => {
    const problems: string[] = [];
    for (const configuration of ['default', 'live'] as const) {
      for (const file of builtFiles(configuration)) {
        const segments = file.split('/');
        const top = segments[0] ?? '';
        if (FORBIDDEN_OUTPUT_DIRECTORIES.includes(top)) {
          problems.push(`${configuration}: ${file} sits under ${top}/, which must never be published`);
        }
        if (path.basename(file).startsWith('.env')) {
          problems.push(`${configuration}: ${file} is a configuration file, which must never be published`);
        }
      }
    }
    assert.deepEqual(
      problems,
      [],
      `the published output carries files it must not (AAP 0.4.2, rule B-2):\n${problems.map((entry: string): string => `  - ${entry}`).join('\n')}`,
    );
  });
});

/* -------------------------------------------------------------------------------------------------
 * WT-15: copy fidelity, through the specification's own reading rules
 * ---------------------------------------------------------------------------------------------- */

/**
 * The visible text of every route in a mapping, so a shared section can be judged across its routes
 * and a strict one route by route. A route the build did not emit fails by name rather than being
 * skipped, which is what keeps every assertion below from passing on an incomplete build.
 */
function routeTexts(
  configuration: BuildName,
  routes: readonly string[],
): Array<{ readonly route: string; readonly file: string; readonly text: string }> {
  return routes.map((route: string) => {
    const page = pageForRoute(route);
    return { route, file: page.file, text: pageText(configuration, page) };
  });
}

/** The field names a section's page-text assertion excludes when the mapping names none. */
const DEFAULT_OMISSIONS: readonly RegExp[] = [NON_PAGE_TEXT_FIELD];

describe('WT-15: every page carries the specification copy', () => {
  it('carries every field value and item part of the sections its route maps to', () => {
    const loaded = specification();
    const problems: string[] = [];

    for (const mapping of SECTION_MAPPINGS) {
      const configuration = mapping.configuration ?? 'default';
      const section = loaded.byId[mapping.section];
      const expected = pageTextStrings(section, mapping.omit ?? DEFAULT_OMISSIONS);
      assert.ok(
        expected.length > 0,
        `${mapping.section} yields no page text once the attribute-only fields are excluded, so this assertion would check nothing at all`,
      );
      const pages = routeTexts(configuration, mapping.routes);

      if (mapping.shared) {
        const missing = expected.filter(
          (entry: ExpectedString): boolean => !pages.some((page): boolean => page.text.includes(entry.text)),
        );
        if (missing.length > 0) {
          problems.push(
            `${mapping.section}'s copy is missing from every ${configuration} route that carries it (${mapping.routes.join(', ')}) — ${missing.length} of the ${expected.length} strings:\n${missing
              .map((entry: ExpectedString): string => `  - ${entry.origin}: "${entry.text}"`)
              .join('\n')}`,
          );
        }
        continue;
      }

      for (const page of pages) {
        const missing = expected.filter((entry: ExpectedString): boolean => !page.text.includes(entry.text));
        if (missing.length > 0) {
          problems.push(describeMissing(configuration, page.route, page.file, section.id, missing, expected.length));
        }
      }
    }

    assert.deepEqual(
      problems,
      [],
      `the built pages are not the specification's copy, character for character (WT-15, AAP 0.7.3):\n\n${problems.join('\n\n')}`,
    );
  });

  it('renders every specification link as an anchor with exactly its text and target', () => {
    const loaded = specification();
    const problems: string[] = [];

    for (const mapping of SECTION_MAPPINGS) {
      const configuration = mapping.configuration ?? 'default';
      const section = loaded.byId[mapping.section];
      if (section.links.length === 0) continue;

      const rendered = mapping.routes.map((route: string) => {
        const page = pageForRoute(route);
        return { route, file: page.file, found: anchors(pageDocument(configuration, page)) };
      });

      for (const link of section.links) {
        const hosts = rendered.map((page) => ({
          route: page.route,
          carrying: page.found.filter((anchor: Anchor): boolean => anchor.text === link.text),
        }));
        const withText = hosts.filter((page) => page.carrying.length > 0);

        if (withText.length === 0) {
          problems.push(
            `the ${configuration} build: ${mapping.routes.join(' and ')} carries no anchor whose text is ${section.id}'s "${link.text}", so the link "${link.text} -> ${link.href}" is not rendered at all`,
          );
          continue;
        }

        const withTarget = withText.filter((page) =>
          page.carrying.some((anchor: Anchor): boolean => anchor.href === link.href),
        );
        if (withTarget.length === 0) {
          const seen = withText
            .flatMap((page) => page.carrying.map((anchor: Anchor): string => `${page.route} -> "${anchor.href}"`))
            .join(', ');
          problems.push(
            `the ${configuration} build: ${section.id}'s link "${link.text} -> ${link.href}" renders its text but not its target — the anchors carrying that text point at ${seen}`,
          );
        }
      }
    }

    assert.deepEqual(
      problems,
      [],
      `the specification's links are not rendered as written (WT-15, AAP 0.7.3):\n${problems.map((entry: string): string => `  - ${entry}`).join('\n')}`,
    );
  });

  it('carries no square-bracketed builder instruction on any page', () => {
    const loaded = specification();
    const instructions = loaded.sections.flatMap((section: SpecSection) =>
      section.instructions.map((text: string) => ({ section: section.id, text })),
    );
    const problems: string[] = [];

    // A document that carries no bracketed instruction has nothing to leak, so an empty list is not
    // a defect: the assertion is "no instruction reaches a page", not "the document has one".
    for (const page of DOCUMENTS) {
      const text = pageText('default', page);
      for (const instruction of instructions) {
        const at = text.indexOf(instruction.text);
        if (at === -1) continue;
        problems.push(
          `${page.route} (${page.file}) carries ${instruction.section}'s builder instruction "${shorten(instruction.text)}", which is an instruction to the builder and must appear nowhere: …${quoteContext(text, at, instruction.text.length)}…`,
        );
      }
    }

    assert.deepEqual(
      problems,
      [],
      `a square-bracketed builder instruction reached a page (WT-15, AAP 0.7.3):\n${problems.map((entry: string): string => `  - ${entry}`).join('\n')}`,
    );
  });
});


/* -------------------------------------------------------------------------------------------------
 * WT-15: document metadata — title, description, Open Graph, Twitter, and the accessible name
 * ---------------------------------------------------------------------------------------------- */

/** A path reduced to the route it names, so a trailing slash cannot make two identical routes differ. */
function normalisePath(value: string): string {
  return value.length > 1 ? value.replace(/\/+$/, '') : value;
}

describe('WT-15: document metadata', () => {
  it('gives every page one non-empty title and one non-empty description, and the page-not-found document a title and no description tag', () => {
    const problems: string[] = [];

    for (const configuration of ['default', 'live'] as const) {
      for (const page of PAGES) {
        const document = pageDocument(configuration, page);
        const titles = documentTitles(document);
        if (titles.length !== 1) {
          problems.push(
            `${configuration}: ${page.route} (${page.file}) carries ${titles.length} <title> elements; every page carries exactly one (AAP 0.8.1)`,
          );
        } else if ((titles[0] ?? '').length === 0) {
          problems.push(`${configuration}: ${page.route} (${page.file}) carries an empty <title>`);
        }
        const descriptions = metaContents(document, 'description');
        if (descriptions.length !== 1) {
          problems.push(
            `${configuration}: ${page.route} (${page.file}) carries ${descriptions.length} <meta name="description"> tags; every page carries exactly one (AAP 0.8.1)`,
          );
        } else if (normaliseText(descriptions[0] ?? '').length === 0) {
          problems.push(`${configuration}: ${page.route} (${page.file}) carries an empty meta description`);
        }
      }

      // The one page A8 gives no description, asserted as two halves: it has a non-empty title, and it
      // carries no description tag at all — not an empty one, and no `content=""` either.
      const notFound = pageDocument(configuration, NOT_FOUND);
      const notFoundTitles = documentTitles(notFound);
      if (notFoundTitles.length !== 1 || (notFoundTitles[0] ?? '').length === 0) {
        problems.push(
          `${configuration}: ${NOT_FOUND.route} (${NOT_FOUND.file}) carries ${notFoundTitles.length} <title> elements, and a page-not-found document carries exactly one non-empty title`,
        );
      }
      const notFoundDescriptions = metaContents(notFound, 'description');
      if (notFoundDescriptions.length !== 0) {
        problems.push(
          `${configuration}: ${NOT_FOUND.route} (${NOT_FOUND.file}) carries ${notFoundDescriptions.length} <meta name="description"> tag(s) with content ${notFoundDescriptions.map((value: string): string => `"${value}"`).join(', ')}; A8 gives the page-not-found copy no description, so Meta.astro must emit no tag rather than an empty or invented one (AAP 0.4.3)`,
        );
      }
    }

    assert.deepEqual(
      problems,
      [],
      `document metadata is incomplete or over-emitted (WT-15, AAP 0.8.1):\n${problems.map((entry: string): string => `  - ${entry}`).join('\n')}`,
    );
  });

  it('emits the Open Graph and Twitter protocol fields on the eight pages, in both configurations', () => {
    const problems: string[] = [];
    const company = normaliseText(global.wordmark);

    for (const configuration of ['default', 'live'] as const) {
      for (const page of PAGES) {
        const document = pageDocument(configuration, page);
        const where = `${configuration}: ${page.route} (${page.file})`;
        const title = (documentTitles(document)[0] ?? '').trim();
        const description = normaliseText(metaContents(document, 'description')[0] ?? '');

        const expectations: ReadonlyArray<readonly [string, string]> = [
          ['og:type', 'website'],
          ['og:title', title],
          ['og:description', description],
          ['og:site_name', company],
          ['twitter:card', 'summary_large_image'],
        ];
        for (const entry of expectations) {
          const key = entry[0];
          const wanted = entry[1];
          const values = metaContents(document, key);
          if (values.length !== 1) {
            problems.push(
              `${where} carries ${values.length} <meta name/property="${key}"> tags; exactly one is required (AAP 0.8.1)`,
            );
            continue;
          }
          if (normaliseText(values[0] ?? '') !== wanted) {
            problems.push(`${where} emits ${key} "${values[0] ?? ''}" where "${wanted}" is required`);
          }
        }
      }
    }

    assert.deepEqual(
      problems,
      [],
      `the Open Graph and Twitter metadata is missing or wrong (WT-15, AAP 0.8.1):\n${problems.map((entry: string): string => `  - ${entry}`).join('\n')}`,
    );
  });

  it('omits og:url and og:image while no site address is configured', () => {
    const problems: string[] = [];
    for (const page of DOCUMENTS) {
      const document = pageDocument('default', page);
      for (const key of ['og:url', 'og:image']) {
        const values = metaContents(document, key);
        if (values.length > 0) {
          problems.push(
            `${page.route} (${page.file}) emits ${key} ${values.map((value: string): string => `"${value}"`).join(', ')} while PUBLIC_SITE_URL is empty; a link preview rejects a relative URL and a guessed host would fail WT-03, so both tags are omitted until the address is known (AAP 0.8.1, A-7)`,
          );
        }
      }
    }
    assert.deepEqual(
      problems,
      [],
      `an absolute address was emitted without a configured site address:\n${problems.map((entry: string): string => `  - ${entry}`).join('\n')}`,
    );
  });

  it('addresses og:url and og:image absolutely once the site address is known', () => {
    const problems: string[] = [];
    const wantedImage = `${LIVE_SITE_ORIGIN}/og-image.png`;

    for (const page of PAGES) {
      const document = pageDocument('live', page);
      const where = `live: ${page.route} (${page.file})`;

      const urls = metaContents(document, 'og:url');
      if (urls.length !== 1) {
        problems.push(`${where} emits ${urls.length} og:url tags; exactly one is required when the site address is known`);
      } else {
        const emitted = normaliseText(urls[0] ?? '');
        const parsed = new URL(emitted);
        if (parsed.origin !== LIVE_SITE_ORIGIN) {
          problems.push(
            `${where} emits og:url "${emitted}" on ${parsed.origin} rather than the site's own origin ${LIVE_SITE_ORIGIN}`,
          );
        } else if (normalisePath(parsed.pathname) !== normalisePath(page.route)) {
          problems.push(`${where} emits og:url "${emitted}", whose path is ${parsed.pathname} rather than ${page.route}`);
        }
      }

      const images = metaContents(document, 'og:image');
      if (images.length !== 1) {
        problems.push(`${where} emits ${images.length} og:image tags; exactly one is required when the site address is known`);
      } else if (normaliseText(images[0] ?? '') !== wantedImage) {
        problems.push(`${where} emits og:image "${images[0] ?? ''}" rather than the generated image at "${wantedImage}"`);
      }
    }

    assert.deepEqual(
      problems,
      [],
      `the Open Graph URL and image are not absolute and site-owned once the address is configured:\n${problems.map((entry: string): string => `  - ${entry}`).join('\n')}`,
    );
  });

  it("takes each page's title and description from A8, and keeps every title distinct", () => {
    const loaded = specification();
    const expected = a8Metadata(loaded);
    const problems: string[] = [];
    const titles: string[] = [];

    for (const page of PAGES) {
      const wanted = expected.get(page.route);
      assert.ok(
        wanted !== undefined,
        `A8 yields no title for ${page.route}, so the page's own title cannot be checked against the document`,
      );
      const document = pageDocument('default', page);
      const emittedTitle = normaliseText(documentTitles(document)[0] ?? '');
      titles.push(emittedTitle);
      if (emittedTitle !== wanted.title) {
        problems.push(`${page.route} (${page.file}) carries the title "${emittedTitle}" where A8 gives "${wanted.title}"`);
      }
      const emittedDescriptions = metaContents(document, 'description').map((value: string): string =>
        normaliseText(value),
      );
      if (wanted.description === null) {
        if (emittedDescriptions.length > 0) {
          problems.push(`${page.route} (${page.file}) carries a description where A8 gives none`);
        }
        continue;
      }
      if (emittedDescriptions.length !== 1) {
        problems.push(`${page.route} (${page.file}) carries ${emittedDescriptions.length} descriptions where A8 gives one`);
      } else if ((emittedDescriptions[0] ?? '') !== wanted.description) {
        problems.push(
          `${page.route} (${page.file}) carries the description "${emittedDescriptions[0] ?? ''}" where A8 gives "${wanted.description}"`,
        );
      }
    }

    const notFoundWanted = expected.get(NOT_FOUND.route);
    assert.ok(notFoundWanted !== undefined, 'A8 yields no title for the page-not-found document');
    assert.equal(
      notFoundWanted.description,
      null,
      'A8 supplies a description for the page-not-found copy, so the claim that its document carries none cannot be tested against the document: A8 gives that page a title, a heading, a text and a link and no description',
    );

    const duplicates = titles.filter((title: string, index: number): boolean => titles.indexOf(title) !== index);
    assert.deepEqual(
      duplicates,
      [],
      `two pages share a title, so the titles are not unique as A8 requires: ${duplicates.join(', ')}`,
    );

    assert.deepEqual(
      problems,
      [],
      `the document metadata is not A8's own wording (WT-15, AAP 0.7.3):\n${problems.map((entry: string): string => `  - ${entry}`).join('\n')}`,
    );
  });

  it("names the product-feature diagram with A8's text alternative", () => {
    const loaded = specification();
    const a8Copy = new Set(loaded.byId.A8.copy);
    const home = pageForRoute('/');
    const document = pageDocument('default', home);

    const labelled = pairedElements(document, 'figure')
      .map((figure): string => attributeValue(figure, 'aria-label') ?? '')
      .map((label: string): string => normaliseText(label))
      .filter((label: string): boolean => label.length > 0);

    assert.ok(
      labelled.length > 0,
      `${home.route} (${home.file}) carries no <figure> with an aria-label, so the product-feature diagram has no accessible name (AAP 0.8.1, rule B-3)`,
    );
    const unrecognised = labelled.filter((label: string): boolean => !a8Copy.has(label));
    assert.deepEqual(
      unrecognised,
      [],
      `${home.route} (${home.file}) names a figure ${unrecognised.map((label: string): string => `"${label}"`).join(', ')} where A8 supplies the text alternative, so the accessible name is not A8's copy`,
    );
  });
});

/* -------------------------------------------------------------------------------------------------
 * WT-15: the conditional blocks, and the screen frames' designed fallback
 * ---------------------------------------------------------------------------------------------- */

describe('WT-15: the conditional blocks and the screen frames', () => {
  it('renders the three product-screen frames as the designed fallback panel, captions kept', () => {
    const page = pageForRoute('/platform/site-intelligence');
    const fallbackLabel = normaliseText(siteIntelligence.screens.fallbackLabel);
    const frames = siteIntelligence.screens.frames;
    const document = pageDocument('default', page);
    const text = visibleText(document);
    const problems: string[] = [];

    const fallbacks = offsetsOf(text, fallbackLabel);
    if (fallbacks.length !== frames.length) {
      problems.push(
        `${page.route} (${page.file}) shows "${fallbackLabel}" ${fallbacks.length} times; each of the ${frames.length} frames renders the designed panel while no screenshot is supplied (WT-12, AAP 0.7.4)`,
      );
    }
    for (const frame of frames) {
      const caption = normaliseText(frame.caption);
      if (!text.includes(caption)) {
        problems.push(
          `${page.route} (${page.file}) does not carry the caption "${caption}" of the ${frame.key} frame; the caption survives the fallback so the frame still says what it will show`,
        );
      }
    }

    const figures = pairedElements(document, 'figure');
    if (figures.length !== frames.length) {
      problems.push(
        `${page.route} (${page.file}) carries ${figures.length} <figure> frames where the content layer holds ${frames.length} product screens`,
      );
    }
    const images = voidElements(document, 'img');
    if (images.length > 0) {
      const sources = images.map((image): string => attributeValue(image, 'src') ?? '(no src)').join(', ');
      problems.push(
        `${page.route} (${page.file}) carries ${images.length} <img> element(s) (${sources}) while no screenshot exists in the drop point; a frame whose PNG is absent degrades to the panel rather than pointing at a file that is not there (WT-12)`,
      );
    }

    assert.deepEqual(
      problems,
      [],
      `the product-screen frames are not in their designed fallback state (WT-12, AAP 0.7.4):\n${problems.map((entry: string): string => `  - ${entry}`).join('\n')}`,
    );
  });

  it('withholds the product-screen text alternatives while every frame shows the fallback panel', () => {
    const loaded = specification();
    const a8 = loaded.byId.A8;
    const alternatives = a8.fields
      .filter((field): boolean => NON_PAGE_TEXT_FIELD.test(field.name))
      .flatMap((field): string[] => field.parts)
      .map((value: string): string => normaliseText(value))
      .filter((value: string): boolean => value.length > 0);
    assert.ok(
      alternatives.length > 0,
      `A8 carries no text-alternative field, so the accessible names a degraded frame must not claim would go unchecked. Its fields are ${a8.fields.map((field): string => `"${field.name}"`).join(', ') || '(none)'}`,
    );

    const page = pageForRoute('/platform/site-intelligence');
    const document = pageDocument('default', page);
    const text = visibleText(document);
    const labels = new Set(
      pairedElements(document, 'figure')
        .map((figure): string => normaliseText(attributeValue(figure, 'aria-label') ?? ''))
        .filter((label: string): boolean => label.length > 0),
    );
    const leaked = alternatives.filter(
      (alternative: string): boolean => text.includes(alternative) || labels.has(alternative),
    );

    // The split is deliberate: this is the absent half, asserted because no screenshot exists in this
    // configuration and an alternative that described one would claim an image the page does not
    // show. The supplied half — one screen present, the other two still degraded — belongs to
    // `tests/e2e/screens.spec.ts`, which builds the `screens` configuration for it.
    assert.deepEqual(
      leaked,
      [],
      `${page.route} (${page.file}) carries a text alternative ${leaked.map((value: string): string => `"${value}"`).join(', ')} while all three frames show the fallback panel; the alternative describes a screenshot that is not there (WT-12, AAP 0.7.4)`,
    );
  });

  it('renders no Why now block, so its figures never appear without their source line', () => {
    const loaded = specification();
    const a5 = loaded.byId.A5;
    const conditional = a5.fields.filter((field): boolean => CONDITIONAL_FIELD.test(field.name));
    assert.ok(
      conditional.length > 0,
      `A5 carries no Why now field, so the block's absence could not be asserted against the document. Its fields are ${a5.fields.map((field): string => `"${field.name}"`).join(', ') || '(none)'}`,
    );
    const strings = conditional
      .flatMap((field): string[] => field.parts)
      .map((value: string): string => normaliseText(value))
      .filter((value: string): boolean => value.length > 0);

    assert.equal(
      about.sourceConfirmed,
      false,
      'about.sourceConfirmed is true, so the Why now block renders by design; the present half of this pair is the `flags` configuration in tests/static/builds.test.ts (AAP 0.13.2)',
    );

    const page = pageForRoute('/about');
    const text = pageText('default', page);
    const found = strings.filter((value: string): boolean => text.includes(value));
    assert.deepEqual(
      found,
      [],
      `${page.route} (${page.file}) carries ${found.map((value: string): string => `"${value}"`).join(', ')} while the Why now block is switched off. The heading, the three figures and the source line render as one unit or not at all, so one of them appearing alone is the defect this assertion exists to catch (AAP 0.7.4, rule B-4)`,
    );
  });

  it('renders no Founder block and leaves no gap where it would stand', () => {
    const loaded = specification();
    const founderFields = loaded.byId.A5.fields.filter((field): boolean =>
      /\b(?:bio|biography|founder)\b/i.test(field.name),
    );
    const strings = founderFields
      .flatMap((field): string[] => field.parts)
      .map((value: string): string => normaliseText(value))
      .filter((value: string): boolean => value.length > 0);

    const page = pageForRoute('/about');
    const document = pageDocument('default', page);
    const text = visibleText(document);

    // A5 supplies no founder text of its own — the biography is an owner input (AAP 0.16.2) — so the
    // operative assertion is the switch below; whatever A5 does supply is searched for as well.
    const found = strings.filter((value: string): boolean => text.includes(value));
    assert.deepEqual(
      found,
      [],
      `${page.route} (${page.file}) carries ${found.map((value: string): string => `"${value}"`).join(', ')} from A5's founder-bio field while the block is switched off`,
    );
    assert.equal(
      normaliseText(about.founderBio),
      '',
      'about.founderBio is set, so the Founder block renders by design and /about is expected to carry it; the present half of this pair is the `flags` configuration in tests/static/builds.test.ts (AAP 0.13.2)',
    );

    // With the switch empty the component returns before emitting anything, so the page must carry no
    // hollow section: a block that is off leaves no placeholder, no empty paragraph and no gap.
    const hollow = pairedElements(document, 'section')
      .filter((section): boolean => visibleText(section.inner).length === 0)
      .map((section): string => attributeValue(section, 'class') ?? '(no class)');
    assert.deepEqual(
      hollow,
      [],
      `${page.route} (${page.file}) carries ${hollow.length} empty <section> element(s) (${hollow.join(', ')}); a conditional block that is off emits nothing at all rather than a hollow frame (AAP 0.7.4)`,
    );
  });
});

/* -------------------------------------------------------------------------------------------------
 * WT-02: no design-reference residue
 * ---------------------------------------------------------------------------------------------- */

/**
 * The committed residue fixture, validated before it is used: a JSON array of non-empty strings, and
 * not empty itself. A fixture that is missing, malformed or empty fails here and names the file,
 * because a scan against no entries would report a clean site while checking nothing (WT-16).
 */
function residueFixture(): string[] {
  assert.ok(
    existsSync(RESIDUE_FIXTURE),
    `${RESIDUE_FIXTURE} does not exist, so the design reference's own strings cannot be scanned for and the residue assertion would check nothing`,
  );
  const parsed: unknown = JSON.parse(readFileSync(RESIDUE_FIXTURE, 'utf8'));
  assert.ok(Array.isArray(parsed), `${RESIDUE_FIXTURE} does not hold a JSON array`);
  const entries = parsed.filter(
    (entry: unknown): entry is string => typeof entry === 'string' && entry.trim().length > 0,
  );
  assert.equal(
    entries.length,
    parsed.length,
    `${RESIDUE_FIXTURE} carries ${parsed.length - entries.length} entries that are not non-empty strings`,
  );
  assert.ok(
    entries.length > 0,
    `${RESIDUE_FIXTURE} holds no entries, so no residue string would be checked and the site would pass a scan that asserts nothing (WT-16, AAP 0.13.8)`,
  );
  return entries;
}

describe('WT-02: no design-reference residue', () => {
  it('carries none of the ten words the criterion names, on any of the nine documents', () => {
    const problems: string[] = [];
    for (const configuration of ['default', 'live'] as const) {
      for (const page of DOCUMENTS) {
        const text = pageText(configuration, page).toLowerCase();
        for (const word of RESIDUE_WORDS) {
          const at = text.indexOf(word);
          if (at === -1) continue;
          problems.push(
            `${configuration}: ${page.route} (${page.file}) carries the design reference's word "${word}": …${quoteContext(text, at, word.length)}…`,
          );
        }
      }
    }
    assert.deepEqual(
      problems,
      [],
      `the built pages carry vocabulary the design reference owns (WT-02, rule W-1):\n${problems.map((entry: string): string => `  - ${entry}`).join('\n')}`,
    );
  });

  it("carries none of the design reference's own strings, so its logo strip, Blog, Testimonials and Map are removed rather than filled", () => {
    const entries = residueFixture();
    const problems: string[] = [];

    // `tests/static/residue.test.ts` performs the exhaustive WT-16 scan on its own build, and this
    // assertion overlaps it deliberately: WT-15 names those four removed blocks explicitly, so the
    // removal is proved here against the documents this suite built as well.
    for (const configuration of ['default', 'live'] as const) {
      for (const page of DOCUMENTS) {
        const text = pageText(configuration, page).toLowerCase();
        for (const entry of entries) {
          const needle = normaliseText(entry).toLowerCase();
          const at = text.indexOf(needle);
          if (at === -1) continue;
          problems.push(
            `${configuration}: ${page.route} (${page.file}) carries the design reference's string "${shorten(entry)}": …${quoteContext(text, at, needle.length)}…`,
          );
        }
      }
    }

    assert.deepEqual(
      problems,
      [],
      `the built pages carry the design reference's own text, which may never appear in the output (rule W-1, WT-02, WT-16):\n${problems.map((entry: string): string => `  - ${entry}`).join('\n')}`,
    );
  });
});

/* -------------------------------------------------------------------------------------------------
 * WT-09: indexability follows the flag, and the 404 is always withheld
 * ---------------------------------------------------------------------------------------------- */

/** The non-empty lines of a built text file, in order. */
function textLines(configuration: BuildName, relative: string): string[] {
  return readBuiltFile(configuration, relative)
    .split('\n')
    .map((line: string): string => line.trim())
    .filter((line: string): boolean => line.length > 0);
}

describe('WT-09: indexability follows the live flag', () => {
  it('withholds every document, the page-not-found one included, while the site is not live', () => {
    const problems: string[] = [];
    for (const page of DOCUMENTS) {
      const robots = metaContents(pageDocument('default', page), 'robots').map((value: string): string =>
        normaliseText(value).toLowerCase(),
      );
      if (robots.length !== 1 || !robots[0].includes('noindex') || !robots[0].includes('nofollow')) {
        problems.push(
          `${page.route} (${page.file}) carries ${robots.length} robots meta tag(s) reading "${robots.join(' | ')}"; every page of a site that is not live carries exactly one "noindex, nofollow" (AAP 0.4.2, 0.8.1)`,
        );
      }
    }
    assert.deepEqual(
      problems,
      [],
      `a page of the non-live build is indexable (WT-09):\n${problems.map((entry: string): string => `  - ${entry}`).join('\n')}`,
    );
  });

  it('disallows every path in robots.txt while the site is not live', () => {
    assert.deepEqual(
      textLines('default', 'robots.txt'),
      ['User-agent: *', 'Disallow: /'],
      `robots.txt must carry exactly the crawler group and a disallow-all while the site is not live, with no Allow line and no Sitemap line (AAP 0.8.3); it carries:\n${readBuiltFile('default', 'robots.txt')}`,
    );
  });

  it('indexes the eight pages and still withholds the page-not-found document once the site is live', () => {
    const problems: string[] = [];
    for (const page of PAGES) {
      const robots = metaContents(pageDocument('live', page), 'robots').map((value: string): string =>
        normaliseText(value).toLowerCase(),
      );
      if (robots.length !== 1) {
        problems.push(`${page.route} (${page.file}) carries ${robots.length} robots meta tags; exactly one is required`);
        continue;
      }
      if ((robots[0] ?? '').includes('noindex')) {
        problems.push(`${page.route} (${page.file}) keeps "${robots[0] ?? ''}" on a live site, so a published page is withheld from every crawler`);
      }
    }
    const notFound = metaContents(pageDocument('live', NOT_FOUND), 'robots').map((value: string): string =>
      normaliseText(value).toLowerCase(),
    );
    if (notFound.length !== 1 || !(notFound[0] ?? '').includes('noindex') || !(notFound[0] ?? '').includes('nofollow')) {
      problems.push(
        `${NOT_FOUND.route} (${NOT_FOUND.file}) carries ${notFound.length} robots meta tag(s) reading "${notFound.join(' | ')}" on a live site; the page-not-found document is withheld in every configuration (AAP 0.4.2)`,
      );
    }
    assert.deepEqual(
      problems,
      [],
      `the live build's indexability does not follow the flag (WT-09):\n${problems.map((entry: string): string => `  - ${entry}`).join('\n')}`,
    );
  });

  it('allows every path and names the sitemap in robots.txt once the site is live', () => {
    assert.deepEqual(
      textLines('live', 'robots.txt'),
      ['User-agent: *', 'Allow: /', `Sitemap: ${LIVE_SITE_ORIGIN}/sitemap.xml`],
      `robots.txt on a live site carries the crawler group, an allow-all and the sitemap on the site's own origin, one directive per line (AAP 0.8.3); it carries:\n${readBuiltFile('live', 'robots.txt')}`,
    );
  });
});

/* -------------------------------------------------------------------------------------------------
 * The sitemap in both configurations (AAP 0.8.3)
 * ---------------------------------------------------------------------------------------------- */

describe('the sitemap', () => {
  it('is a valid, empty urlset while no site address is configured', () => {
    const sitemap = readBuiltFile('default', 'sitemap.xml');
    assert.ok(
      sitemap.includes(`<urlset xmlns="${SITEMAP_NAMESPACE}"`),
      `sitemap.xml does not declare the sitemap 0.9 namespace ${SITEMAP_NAMESPACE}; it carries:\n${sitemap}`,
    );
    const entries = pairedElements(sitemap, 'url').map((entry): string => normaliseText(entry.inner));
    assert.deepEqual(
      entries,
      [],
      `sitemap.xml lists ${entries.length} entries (${entries.join(', ')}) while PUBLIC_SITE_URL is empty; a <loc> needs an absolute address, so the document is a valid <urlset> with no entries rather than a guessed host (AAP 0.8.3, A-2)`,
    );
  });

  it('lists exactly the eight navigable routes on the site origin once the address is configured', () => {
    const sitemap = readBuiltFile('live', 'sitemap.xml');
    assert.ok(
      sitemap.includes(`xmlns="${SITEMAP_NAMESPACE}"`),
      `sitemap.xml does not declare the sitemap 0.9 namespace ${SITEMAP_NAMESPACE}; it carries:\n${sitemap}`,
    );

    const locations = pairedElements(sitemap, 'loc').map((element): string => normaliseText(element.inner));
    const wanted = PAGES.map((page): string => `${LIVE_SITE_ORIGIN}${page.route}`);
    assert.deepEqual(
      [...locations].sort(),
      [...wanted].sort(),
      `sitemap.xml lists ${locations.length} locations where the eight navigable routes are ${wanted.length}: it carries ${locations.join(', ')}`,
    );
    const notFoundEntry = locations.filter((location: string): boolean => normalisePath(location).endsWith('/404'));
    assert.deepEqual(
      notFoundEntry,
      [],
      `sitemap.xml lists the page-not-found route (${notFoundEntry.join(', ')}), which is withheld from every crawler and is linked from nowhere (AAP 0.4.2)`,
    );
  });
});


/* -------------------------------------------------------------------------------------------------
 * WT-03: no third-party host, and no published font licence
 * ---------------------------------------------------------------------------------------------- */

describe('WT-03: no third-party host, and no published font licence', () => {
  it('makes no absolute reference at all in the empty configuration', () => {
    const references = collectReferences('default').absolute;
    assert.deepEqual(
      references.map((reference): string => `${reference.file}: ${reference.uri}`),
      [],
      'the empty configuration references nothing absolute: with no site address and no form endpoint configured, every reference a page makes is a same-site path or a bundled font (rule B-1). It references',
    );
  });

  it('references only the site and the form endpoint, over https, once both are configured', () => {
    const references = collectReferences('live').absolute;
    assert.ok(
      references.length > 0,
      'the live build references nothing absolute at all, so the allow-list below would check nothing: og:url, og:image, the sitemap locations and the robots sitemap line are all absolute in this configuration',
    );

    const problems: string[] = [];
    for (const reference of references) {
      let parsed: URL;
      try {
        parsed = new URL(reference.uri);
      } catch {
        problems.push(`${reference.file}: "${reference.uri}" is not a parsable absolute reference`);
        continue;
      }
      if (parsed.protocol !== 'https:') {
        problems.push(
          `${reference.file}: "${reference.uri}" uses ${parsed.protocol} where https is required (rule B-1, AAP 0.9.1)`,
        );
      }
      if (!ALLOWED_HOSTS.has(parsed.host)) {
        problems.push(
          `${reference.file}: "${reference.uri}" names ${parsed.host}, which is neither the site's own origin nor the form endpoint's — the only two hosts the output may name (rule B-1, WT-03)`,
        );
      }
    }

    assert.deepEqual(
      problems,
      [],
      `the output reaches a host it may not (rule B-1, WT-03):\n${problems.map((entry: string): string => `  - ${entry}`).join('\n')}`,
    );
  });

  it('publishes no font licence text', () => {
    const problems: string[] = [];
    for (const configuration of ['default', 'live'] as const) {
      for (const file of builtFiles(configuration)) {
        const base = path.basename(file);
        if (file.startsWith('licenses/') || /(^|\/)ofl/i.test(file) || /licen[sc]e/i.test(base)) {
          problems.push(
            `${configuration}: ${file} is a licence file in the published output; the texts live at licenses/fonts/ precisely so they travel with the repository and are never served as a page (WT-03, AAP 0.5.3)`,
          );
          continue;
        }
        if (readBuiltFile(configuration, file).toUpperCase().includes(FONT_LICENCE_MARKER)) {
          problems.push(
            `${configuration}: ${file} carries the font licence text "${FONT_LICENCE_MARKER}", which belongs beside the fonts in licenses/fonts/ and not in the published output (AAP 0.5.3)`,
          );
        }
      }
    }
    assert.deepEqual(
      problems,
      [],
      `a font licence reached the artifact:\n${problems.map((entry: string): string => `  - ${entry}`).join('\n')}`,
    );
  });
});

/* -------------------------------------------------------------------------------------------------
 * WT-08: the raster allow-list, on the output side
 * ---------------------------------------------------------------------------------------------- */

describe('WT-08: the raster allow-list', () => {
  it('publishes only the two generated PNGs and any owner-supplied product screen', () => {
    const problems: string[] = [];
    for (const configuration of ['default', 'live'] as const) {
      for (const raster of builtRasters(configuration)) {
        if (GENERATED_RASTERS.has(raster) || raster.startsWith(SCREEN_DIRECTORY)) continue;
        problems.push(
          `${configuration}: ${raster} is a raster image the build may not publish; the source tree ships none, and the only rasters are the two generated PNGs plus any screen the owner supplies (WT-08, AAP 0.4.2)`,
        );
      }
    }
    assert.deepEqual(
      problems,
      [],
      `the output carries a raster image it may not:\n${problems.map((entry: string): string => `  - ${entry}`).join('\n')}`,
    );
  });

  it('publishes exactly the two generated PNGs while no product screen is supplied', () => {
    assert.deepEqual(
      builtRasters('default'),
      [...GENERATED_RASTERS].sort(),
      'the empty configuration publishes exactly the social image and the apple-touch-icon: no product screen is in the drop point, and its absence is a designed state rather than a build failure (WT-08, WT-12)',
    );
  });

  it('publishes the favicon as an SVG and no icon font or .ico file anywhere', () => {
    for (const configuration of ['default', 'live'] as const) {
      const favicon = readBuiltFile(configuration, 'favicon.svg').trimStart();
      assert.ok(
        favicon.startsWith('<svg') || favicon.startsWith('<?xml'),
        `${OUTPUT_DIRECTORIES[configuration]}/favicon.svg is neither an <svg> element nor an XML document, so it is not the authored vector the pages link`,
      );
      const icoFiles = builtFiles(configuration).filter((file): boolean => path.extname(file).toLowerCase() === '.ico');
      assert.deepEqual(
        icoFiles,
        [],
        `${configuration}: the output carries ${icoFiles.join(', ')}; the favicon is the hand-authored SVG and nothing else (WT-08, AAP 0.4.2)`,
      );
    }
  });
});

/* -------------------------------------------------------------------------------------------------
 * W-2 and B-2: a static, self-contained artefact that publishes no configuration value
 * ---------------------------------------------------------------------------------------------- */

describe('W-2 and B-2: a static, self-contained artefact', () => {
  it('carries no server artefact: no worker, no functions directory, no middleware module', () => {
    const problems: string[] = [];
    for (const configuration of ['default', 'live'] as const) {
      for (const file of builtFiles(configuration)) {
        const base = path.basename(file);
        if (base === '_worker.js' || base === '_worker.mjs') {
          problems.push(`${configuration}: ${file} is a server worker, and the site ships as static files only`);
        }
        if (file.startsWith('functions/')) {
          problems.push(`${configuration}: ${file} sits in a functions directory, which is server-side code`);
        }
        if (/^middleware\.(?:js|mjs|ts)$/.test(base)) {
          problems.push(`${configuration}: ${file} is a middleware module, which runs per request`);
        }
      }
    }
    assert.deepEqual(
      problems,
      [],
      `the output carries server-side code (rule W-2):\n${problems.map((entry: string): string => `  - ${entry}`).join('\n')}`,
    );
  });

  it('publishes no secret, no .env path, and the contact address only in the configuration that sets it', () => {
    assert.ok(
      LIVE_CONTACT_ADDRESS.length > 0,
      'the live configuration sets no contact address, so the assertion that the address reaches the pages it configures would check nothing',
    );

    const problems: string[] = [];
    for (const configuration of ['default', 'live'] as const) {
      for (const file of builtFiles(configuration)) {
        const content = readBuiltFile(configuration, file);
        if (CREDENTIAL_HEADER_WITH_VALUE.test(content)) {
          problems.push(
            `${configuration}: ${file} carries a ${CREDENTIAL_HEADER} header with a value, which is a credential and may not ship (rule B-2)`,
          );
        }
        if (/(^|[^a-zA-Z0-9_])\.env\b/.test(content)) {
          problems.push(`${configuration}: ${file} names an .env path, which is configuration and may not ship (rule B-2)`);
        }
        if (configuration === 'default' && content.includes(LIVE_CONTACT_ADDRESS)) {
          problems.push(
            `default: ${file} carries the contact address ${LIVE_CONTACT_ADDRESS} while PUBLIC_CONTACT_EMAIL is empty; the address appears nowhere at all until it is configured (AAP 0.9.3)`,
          );
        }
      }
    }

    const defaultMailtos = collectReferences('default').mailto;
    assert.deepEqual(
      defaultMailtos.map((reference): string => `${reference.file}: ${reference.uri}`),
      [],
      'the empty configuration publishes a mailto reference although no contact address is configured, so the mailto state would appear where the fallback text belongs (AAP 0.9.3)',
    );

    for (const page of DOCUMENTS) {
      const configured = anchors(pageDocument('live', page)).filter(
        (anchor: Anchor): boolean => anchor.href === `mailto:${LIVE_CONTACT_ADDRESS}`,
      );
      if (configured.length === 0) {
        problems.push(
          `live: ${page.route} (${page.file}) carries no mailto:${LIVE_CONTACT_ADDRESS} link, so the configured address never reaches the page it belongs on (AAP 0.9.3)`,
        );
      }
    }

    assert.deepEqual(
      problems,
      [],
      `the output publishes a value it may not, or withholds one it should (rule B-2, AAP 0.9.3):\n${problems.map((entry: string): string => `  - ${entry}`).join('\n')}`,
    );
  });
});

/* -------------------------------------------------------------------------------------------------
 * WT-14: the ten sovereignty controls, labelled, and the limits statement
 * ---------------------------------------------------------------------------------------------- */

/**
 * The controls list on `/sovereignty`: the page's only `<ul role="list">`, which is the list of rows
 * `CategoryRows` renders for the ten controls.
 *
 * Locating the block structurally and then counting positions inside its text is how "each row
 * carries its label" is asserted without a DOM parser. The block is found once, by an attribute the
 * markup declares — `role="list"` — and every assertion below then works on the block's own visible
 * text, so a label that leaked into the hero or the footer cannot be mistaken for a row's.
 */
function controlsBlock(document: string, page: EmittedPage): ElementMatch {
  const lists = pairedElements(document, 'ul').filter(
    (list): boolean => (attributeValue(list, 'role') ?? '').toLowerCase() === 'list',
  );
  assert.equal(
    lists.length,
    1,
    `${page.route} (${page.file}) carries ${lists.length} <ul role="list"> elements; the ten controls are the page's only list of rows (AAP 0.8.4)`,
  );
  return lists[0] as ElementMatch;
}

describe('WT-14: the ten sovereignty controls, labelled, and the limits statement', () => {
  it('states the sovereignty top status label once, on this page and nowhere else', () => {
    const declared = sovereignty.hero.statusLabel ?? '';
    assert.ok(
      declared.trim().length > 0,
      'the content layer declares no top status label for /sovereignty, so the page cannot state the claim the design-intent label qualifies (AAP 0.7.5)',
    );
    const label = normaliseText(declared);
    const problems: string[] = [];
    for (const page of DOCUMENTS) {
      const occurrences = offsetsOf(pageText('default', page), label).length;
      const wanted = page.route === '/sovereignty' ? 1 : 0;
      if (occurrences !== wanted) {
        problems.push(
          `${page.route} (${page.file}) carries the top status label "${label}" ${occurrences} time(s) where ${wanted} is required; the label qualifies the sovereignty page's top block and appears on that page only (AAP 0.7.5)`,
        );
      }
    }
    assert.deepEqual(
      problems,
      [],
      `the sovereignty status label is missing or repeated (WT-14, AAP 0.7.5):\n${problems.map((entry: string): string => `  - ${entry}`).join('\n')}`,
    );
  });

  it('renders ten controls, each in its own row with its own status label', () => {
    const page = pageForRoute('/sovereignty');
    const document = pageDocument('default', page);
    const label = normaliseText(global.status.sovereignty);
    const rows = sovereignty.controls;
    const block = visibleText(controlsBlock(document, page).inner);
    const problems: string[] = [];

    // The label is the row separator: with no DOM parser, the number of times it occurs inside the
    // block is the number of rows that carry it, and splitting on it yields one segment per row. A
    // row that lost its label leaves nine, and a row that gained two leaves eleven, so both fail the
    // count — which is why the count and the per-row search below are asserted together.
    const segments = block.split(label);
    const labelledRows = segments.length - 1;
    if (labelledRows !== rows.length) {
      problems.push(
        `${page.route} (${page.file}): the controls block carries the status label "${label}" ${labelledRows} time(s) across ${rows.length} rows, each of which carries it exactly once (AAP 0.7.5, WT-14)`,
      );
    }
    const tail = normaliseText(segments[segments.length - 1] ?? '');
    if (tail.length > 0) {
      problems.push(
        `${page.route} (${page.file}): the controls block continues after the last row's status label with "${shorten(tail)}", so the block holds a row that carries no label`,
      );
    }

    const pairs = Math.min(rows.length, labelledRows);
    for (let index = 0; index < pairs; index += 1) {
      const row = rows[index] as (typeof rows)[number];
      const segment = segments[index] ?? '';
      const fields = [row.number ?? '', row.title, row.line]
        .map((value: string): string => normaliseText(value))
        .filter((value: string): boolean => value.length > 0);
      let from = 0;
      for (const field of fields) {
        const at = segment.indexOf(field, from);
        if (at === -1) {
          problems.push(
            `${page.route} (${page.file}): control ${index + 1}'s "${shorten(field)}" is not in its own row segment "${shorten(segment)}", so the row does not render what the content layer holds`,
          );
          break;
        }
        from = at + field.length;
      }
    }

    const titles = pairedElements(controlsBlock(document, page).inner, 'h2').map((heading): string =>
      visibleText(heading.inner),
    );
    if (titles.length !== rows.length) {
      problems.push(
        `${page.route} (${page.file}) carries ${titles.length} control titles where the content layer holds ${rows.length} controls (WT-14)`,
      );
    } else {
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index] as (typeof rows)[number];
        const wanted = normaliseText(row.title);
        if (titles[index] !== wanted) {
          problems.push(
            `${page.route} (${page.file}): control ${index + 1} is titled "${titles[index] ?? ''}" where the content layer holds "${wanted}", so the specification's order is not the page's`,
          );
        }
      }
    }

    assert.deepEqual(
      problems,
      [],
      `the ten sovereignty controls are not rendered as ten labelled rows (WT-14):\n${problems.map((entry: string): string => `  - ${entry}`).join('\n')}`,
    );
  });

  it('carries the limits statement as plain text, and the ten questions as accordion items', () => {
    const page = pageForRoute('/sovereignty');
    const document = pageDocument('default', page);
    const questions = sovereignty.faq;
    const limits = normaliseText(sovereignty.limits);
    const problems: string[] = [];

    const accordions = pairedElements(document, 'details');
    if (accordions.length !== questions.length) {
      problems.push(
        `${page.route} (${page.file}) carries ${accordions.length} <details> items where the content layer holds ${questions.length} questions (AAP 0.8.4, WT-14)`,
      );
    }
    const summarised = accordions.map((details) =>
      pairedElements(details.inner, 'summary').map((summary): string => visibleText(summary.inner)),
    );
    for (let index = 0; index < Math.min(questions.length, summarised.length); index += 1) {
      const wanted = normaliseText((questions[index] as (typeof questions)[number]).question);
      const carried = summarised[index] ?? [];
      if (carried.length !== 1) {
        problems.push(
          `${page.route} (${page.file}): accordion ${index + 1} carries ${carried.length} <summary> elements; each question is one summary`,
        );
        continue;
      }
      if (carried[0] !== wanted) {
        problems.push(
          `${page.route} (${page.file}): accordion ${index + 1} asks "${carried[0] ?? ''}" where the content layer holds "${wanted}"`,
        );
      }
    }

    const paragraphs = pairedElements(document, 'p').map((paragraph): string => visibleText(paragraph.inner));
    if (!paragraphs.includes(limits)) {
      problems.push(
        `${page.route} (${page.file}) renders no paragraph equal to the limits statement "${shorten(limits)}"; it is plain text above the pilot band rather than a claim inside the accordion (AAP 0.8.1, WT-14)`,
      );
    }

    assert.deepEqual(
      problems,
      [],
      `the limits statement or the ten questions are not rendered as the plan requires (WT-14):\n${problems.map((entry: string): string => `  - ${entry}`).join('\n')}`,
    );
  });
});


/* -------------------------------------------------------------------------------------------------
 * The status labels that qualify a claim (AAP 0.7.5, FR-3)
 * ---------------------------------------------------------------------------------------------- */

/**
 * Both status labels live in the shell copy module and are therefore A0's, but neither belongs on
 * every page: a label qualifies the claim beside it, so the product's label appears where the product
 * is presented and the sovereignty's label where a control is. That is why A0's status fields are
 * omitted from the per-document assertion above and asserted here, where the plan places them.
 */
describe('the status labels that qualify a claim', () => {
  it('qualifies every presentation of the product with its status label', () => {
    const label = normaliseText(global.status.product);
    assert.ok(
      label.length > 0,
      'the shell copy module declares no product status label, so no product claim on the site is qualified (AAP 0.7.5, rule B-4)',
    );

    const problems: string[] = [];
    for (const route of ['/', '/platform/site-intelligence']) {
      const page = pageForRoute(route);
      if (!pageText('default', page).includes(label)) {
        problems.push(
          `${route} (${page.file}) carries no "${label}", so it presents the product without the label that qualifies the claim (AAP 0.7.5)`,
        );
      }
    }

    assert.deepEqual(
      problems,
      [],
      `a page presents the product without qualifying it:\n${problems.map((entry: string): string => `  - ${entry}`).join('\n')}`,
    );
  });
});

