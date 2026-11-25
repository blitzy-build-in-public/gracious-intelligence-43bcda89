/**
 * tests/static/residue.test.ts — what the site must never say, and the two faces it may ship
 * (WT-16 and WT-13; AAP 0.12.1, 0.13.1, 0.13.8).
 *
 * The plan's opening criterion is that the site shows the content specification's copy verbatim and
 * nothing else. `tests/static/output.test.ts` proves the positive half of that — every string the
 * specification yields reaches its page — and this file proves the negative half: no string of the
 * purchased design reference, no place name, no competitor name and no banned phrase appears in what
 * a visitor reads, and the only typefaces the output can load are the two the project vendors.
 *
 * Two committed fixtures carry the negative list, and this file reads them without ever repairing
 * them (AAP 0.13.8): `tests/fixtures/figma-residue.json` holds the design reference's own strings of
 * four or more words, and `tests/fixtures/vendor-names.json` holds the shortlisted vendor names plus
 * the four banned phrases. A fixture that is missing, empty, malformed, short of its expected count,
 * or that collides with the specification's own copy is a defect this file reports and does not
 * correct: every failure names the fixture, the offending entry and the page or file it appears in.
 *
 * Rules this file enforces, and the boundaries it keeps:
 *
 * - **W-1** — the design reference supplies layout and style only, so none of its text, images,
 *   logos, names or places may reach the output. The residue scan and the font-family allow-list are
 *   that rule's two mechanical halves: a template string or a template typeface would be caught here
 *   and nowhere else before review.
 * - **B-4** — no invented customer, logo, testimonial, statistic, certification, award or team
 *   member, and no lorem ipsum. The vendor fixture's eleven competitor names and four banned phrases
 *   are what stop promotional vocabulary or a rival's name standing in for copy.
 * - **B-1** — fonts are bundled and nothing is fetched from a third-party host. The last group proves
 *   the output publishes exactly the two vendored woff2 files, that every family any built stylesheet
 *   or inline value names is one of those two or a fallback of its stack, and that both faces load
 *   from this origin.
 * - **B-2** — this file reads no configuration value and holds no host, key, token or password.
 * - **B-3** — contrast, focus and axe belong to `tests/e2e/a11y.spec.ts`; this file asserts text
 *   content only and adds no colour or contrast judgement.
 * - **W-2** — nothing here needs a server: one static build is read as files.
 *
 * What the scans read, and why it is extracted rather than grepped. Each of the nine emitted
 * documents (`index.html`, the seven route documents and `404.html`) is reduced to the text a visitor
 * reads: HTML comments removed, `<script>` and `<style>` removed **with their content** so the CSP
 * `content` strings and the islands' code can never produce a hit, the remaining tags removed with no
 * replacement character so a phrase split across an element (`<em>The</em> model board`) still reads
 * as one phrase, and the result decoded and whitespace-normalised by the same `normaliseText` the
 * fidelity harness uses, so the two files cannot disagree about entities or spacing. Raw HTML is
 * deliberately not scanned: an attribute value no visitor reads is not visible text, and a class name
 * would be flagged by a raw scan and then excused by the first exemption, which is how a residue
 * check becomes decorative. `sitemap.xml` and `robots.txt` are not scanned either — they are machine
 * files, not what a visitor reads.
 *
 * One build, made once. `before` builds the `default` configuration into
 * `.build/static-residue-default` through the shared harness (AAP 0.13.2), so no assertion can read a
 * sibling suite's output and the whole file costs one build. A build that does not exit zero fails
 * there, with the child's own output quoted, rather than letting a dozen assertions each report a
 * damaged page. The build regenerates the three image files through its `prebuild` step, and the
 * harness refuses to start a build whose images are absent, naming the file and the command that
 * writes it — that precondition belongs to the harness, and `npm test` satisfies it by running
 * `npm run assets` before any configuration builds (AAP 0.4.2).
 */

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { build } from '../helpers/build.ts';
import { loadSpecification, normaliseText } from '../helpers/spec.ts';

/* -------------------------------------------------------------------------------------------------
 * Where everything lives
 * ---------------------------------------------------------------------------------------------- */

/** This file's directory, from which the repository root and every input are resolved. */
const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));

/**
 * The repository root, resolved from this module's own location rather than from the working
 * directory, so the suite reads the same tree whether it is started from the root or by the runner.
 */
const REPOSITORY_ROOT = path.resolve(TEST_DIRECTORY, '..', '..');

/** The residue fixture: the design reference's own strings of four or more words. */
const RESIDUE_FIXTURE = path.join(REPOSITORY_ROOT, 'tests', 'fixtures', 'figma-residue.json');

/** The vendor fixture: the eleven shortlisted vendor names and the four banned phrases. */
const VENDOR_FIXTURE = path.join(REPOSITORY_ROOT, 'tests', 'fixtures', 'vendor-names.json');

/**
 * This file's own build output, inside the one output root `.gitignore` covers. It is named here
 * rather than taken from the harness default so the directory is recognisably this suite's, and it
 * carries its own `static-residue-` prefix rather than the bare configuration name the suites that
 * need several configurations share.
 */
const OUTPUT_DIRECTORY = path.join(REPOSITORY_ROOT, '.build', 'static-residue-default');

/** Astro's asset directory in the output; the only place a built stylesheet can be. */
const STYLESHEET_DIRECTORY = path.join(OUTPUT_DIRECTORY, '_astro');

/** The output's font directory: `public/fonts/` copied verbatim, so exactly the vendored files. */
const FONT_DIRECTORY = path.join(OUTPUT_DIRECTORY, 'fonts');

/**
 * One document the build emits, named by the route a visitor asks for. Every report quotes the route
 * rather than the file path, because the route is what a reviewer compares against the frames.
 */
interface EmittedPage {
  /** The route the page answers on, including the page-not-found route. */
  readonly route: string;
  /** The document's path inside the build output, in the output's own directory format. */
  readonly file: string;
}

/**
 * The nine documents the scans read, in the order the navigation presents the eight pages, with the
 * page-not-found route last. The list is written out rather than derived by walking the output,
 * because a scan that discovers its own pages would pass on a build that emitted none of them.
 */
const EMITTED_PAGES: readonly EmittedPage[] = [
  { route: '/', file: 'index.html' },
  { route: '/platform', file: 'platform/index.html' },
  { route: '/platform/site-intelligence', file: 'platform/site-intelligence/index.html' },
  { route: '/sovereignty', file: 'sovereignty/index.html' },
  { route: '/about', file: 'about/index.html' },
  { route: '/contact', file: 'contact/index.html' },
  { route: '/privacy', file: 'privacy/index.html' },
  { route: '/legal', file: 'legal/index.html' },
  { route: '/404', file: '404.html' },
];

/* -------------------------------------------------------------------------------------------------
 * What the fixtures must hold
 * ---------------------------------------------------------------------------------------------- */

/**
 * The shortest string the residue fixture may carry. WT-16 extracts every design-reference string of
 * four or more words; anything shorter is a phrase the site's own copy could plausibly contain too,
 * so a short entry would either collide with the specification or flag an innocent page.
 */
const RESIDUE_MINIMUM_WORDS = 4;

/**
 * The number of entries the vendor fixture must hold: the eleven vendor names the research document's
 * section 4 shortlists plus the four banned phrases. The expectation is fixed by the plan (WT-13, AAP
 * 0.13.8) and is never derived from the fixture's own length, which would let the scan pass with no
 * vendor name checked at all; a fixture short of fifteen is reported as a defect, never trimmed to
 * fit and never topped up with an invented name (AAP 0.7.7).
 */
const EXPECTED_VENDOR_COUNT = 15;

/**
 * The four phrases the vendor fixture must carry whatever else it holds: the two invented names the
 * plan forbids outright and the two superlatives rule B-4 rules out of a truthful site.
 */
const BANNED_PHRASES: readonly string[] = ['Aldermoor', 'Plumbline', 'best-in-class', 'world-leading'];

/* -------------------------------------------------------------------------------------------------
 * What may ship as a typeface
 * ---------------------------------------------------------------------------------------------- */

/** The two vendored files, sorted, as the output's `fonts/` directory must hold them. */
const SHIPPED_FONT_FILES: readonly string[] = [
  'geist-mono-latin-var.woff2',
  'urbanist-latin-var.woff2',
];

/** The same two files as output-relative paths, sorted, as the whole output must hold them. */
const SHIPPED_FONT_PATHS: readonly string[] = [
  'fonts/geist-mono-latin-var.woff2',
  'fonts/urbanist-latin-var.woff2',
];

/** Every extension a font file can carry: no file with one may appear beyond the two above. */
const FONT_FILE_EXTENSIONS: ReadonlySet<string> = new Set(['.woff2', '.woff', '.ttf', '.otf', '.eot']);

/**
 * The family the request replaces and never bundles (AAP 0.6.3, 0.14.7). It is named here in full
 * because its absence is an assertion: the one type substitution the request fixes is that the
 * design's ten-pixel Instrument Sans slot takes the Geist Mono pair instead.
 */
const FORBIDDEN_FAMILY = 'Instrument Sans';

/**
 * Every family name a built stylesheet may resolve to, lower-cased and unquoted: the two shipped
 * families, the metric-adjacent fallback of each stack (AAP 0.6.6, and the `--font-*` declarations
 * in `src/styles/theme.css`), and `inherit`. Nothing else is admitted, so a family can be added to
 * the site only by adding it here and declaring it in the theme.
 */
const ALLOWED_FAMILIES: ReadonlySet<string> = new Set([
  'urbanist',
  'system-ui',
  'segoe ui',
  'sans-serif',
  'geist mono',
  'ui-monospace',
  'sfmono-regular',
  'menlo',
  'monospace',
  'inherit',
]);

/**
 * The two custom properties Tailwind's preflight reads through `var()` without declaring them:
 * `--default-font-family` on `html, :host` and `--default-mono-font-family` on `code, kbd, samp,
 * pre`. The theme clears the `--font-*` namespace (AAP 0.2.2 admits exactly two families), so
 * neither property is ever declared and the declarations are delegations to the user agent's own
 * stack — which the theme's own `html` rule then overrides with Urbanist. They are named here so the
 * allow-list can tell that delegation apart from a family the site itself names: any *other*
 * undeclared custom property inside a `font-family` value is a failure, not a delegation.
 */
const FONT_DELEGATION_PROPERTIES: ReadonlySet<string> = new Set([
  '--default-font-family',
  '--default-mono-font-family',
]);

/** The guard against a custom property that refers to itself; deeper than any real stack. */
const MAX_VAR_DEPTH = 8;

/** How much of the sentence around a hit a failure quotes, in characters either side. */
const CONTEXT_CHARACTERS = 40;

/* -------------------------------------------------------------------------------------------------
 * Visible text
 * ---------------------------------------------------------------------------------------------- */

/** An HTML comment, content included. A comment's content is never copy. */
const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/g;

/**
 * A `<script>` or `<style>` element with its content. The CSP meta carries no script, but the three
 * islands ship inline scripts and Astro inlines small styles, and neither is text a visitor reads.
 */
const SCRIPT_OR_STYLE_PATTERN = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

/** Any remaining tag. Attribute values inside are removed with it — they are not visible text. */
const TAG_PATTERN = /<[^>]*>/g;

/**
 * The text a visitor reads in one document: comments, script and style content and every tag
 * removed, then decoded and normalised by the shared normaliser.
 *
 * Tags are removed with no replacement character on purpose. A phrase the design reference owns can
 * span an element boundary (`<em>The</em> model board`), and inserting a separator would break that
 * match while adding nothing: the whitespace between elements in the emitted markup is real text and
 * survives the strip.
 */
function extractVisibleText(document: string): string {
  const withoutComments = document.replace(HTML_COMMENT_PATTERN, '');
  const withoutScripts = withoutComments.replace(SCRIPT_OR_STYLE_PATTERN, '');
  return normaliseText(withoutScripts.replace(TAG_PATTERN, ''));
}

/** One page's visible text, read once and reused by every scan in this file. */
let visibleTextCache: Map<string, string> | null = null;

/** The same text case-folded, computed once for the case-insensitive comparisons. */
let foldedTextCache: Map<string, string> | null = null;

/**
 * The visible text of every page, keyed by route, read from this file's own build output.
 *
 * A page whose document is missing or carries no visible text is a failure that names the route and
 * the path: an assertion that passes because the page it meant to read was never emitted would let
 * every residue string through, which is the one failure mode this file exists to prevent.
 */
function pageTexts(): Map<string, string> {
  if (visibleTextCache !== null) {
    return visibleTextCache;
  }
  const texts = new Map<string, string>();
  const problems: string[] = [];
  for (const page of EMITTED_PAGES) {
    const documentPath = path.join(OUTPUT_DIRECTORY, page.file);
    if (!existsSync(documentPath)) {
      problems.push(`${page.route} has no document at ${documentPath}`);
      continue;
    }
    const visible = extractVisibleText(readText(documentPath, `the built ${page.route} page`));
    if (visible.length === 0) {
      problems.push(`${page.route} carries no visible text in ${documentPath}`);
      continue;
    }
    texts.set(page.route, visible);
  }
  assert.deepEqual(
    problems,
    [],
    `the build in ${OUTPUT_DIRECTORY} must emit all ${EMITTED_PAGES.length} page documents the scans read, each with visible text, and it did not: ${problems.join('; ')}`,
  );
  visibleTextCache = texts;
  return texts;
}

/**
 * The visible text of every page, case-folded once. Case-insensitivity is required rather than
 * tolerated: AAP 0.6.6 keeps the mono label, navigation and button case in CSS so the DOM text stays
 * exactly as the specification writes it, and the design reference's own specimens are upper case
 * while its body copy is lower. Folding both sides once, up front, is also what keeps a scan over a
 * hundred entries and nine pages cheap and its failure messages short.
 */
function foldedPageTexts(): Map<string, string> {
  if (foldedTextCache !== null) {
    return foldedTextCache;
  }
  const folded = new Map<string, string>();
  for (const [route, text] of pageTexts()) {
    folded.set(route, text.toLowerCase());
  }
  foldedTextCache = folded;
  return folded;
}

/* -------------------------------------------------------------------------------------------------
 * Reading a fixture
 * ---------------------------------------------------------------------------------------------- */

/** A value read from disk, as a message describes it. */
function readText(filePath: string, role: string): string {
  try {
    return readFileSync(filePath, 'utf8');
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${role} at ${filePath} could not be read: ${reason}`);
  }
}

/** How a parsed JSON value is described in a failure message. */
function jsonKind(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'an array';
  }
  return `a ${typeof value}`;
}

/**
 * One fixture, parsed. A missing file is a failure that names the absolute path: the fixtures are
 * derived once at authoring time and committed (AAP 0.13.8), so at test time there is nothing to fall
 * back to, and a check that re-derived them would be measuring a different list from the one
 * reviewed.
 */
function readFixtureJson(fixturePath: string): unknown {
  if (!existsSync(fixturePath)) {
    throw new Error(
      `the fixture ${fixturePath} is missing. WT-16 and WT-13 read the two committed fixtures under tests/fixtures, and a missing fixture is a failing check rather than a passing one, because a scan with nothing to scan lets every banned string through`,
    );
  }
  const source = readText(fixturePath, 'the fixture');
  try {
    return JSON.parse(source) as unknown;
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`the fixture ${fixturePath} is not valid JSON: ${reason}`);
  }
}

/**
 * One fixture's entries, with its shape asserted: a top-level JSON array of strings. The array check
 * is a `fail` rather than an `ok` so the compiler narrows the value for the entry checks that follow;
 * either way, an object, an array of objects or a scalars array is reported with its index.
 */
function requireStringEntries(fixturePath: string): string[] {
  const parsed = readFixtureJson(fixturePath);
  if (!Array.isArray(parsed)) {
    assert.fail(
      `the fixture ${fixturePath} must hold a top-level JSON array of strings, not ${jsonKind(parsed)}`,
    );
  }
  const entries: string[] = [];
  const offending: string[] = [];
  parsed.forEach((entry: unknown, index: number) => {
    if (typeof entry === 'string') {
      entries.push(entry);
      return;
    }
    offending.push(`[${index}] is ${jsonKind(entry)}`);
  });
  assert.deepEqual(
    offending,
    [],
    `every entry of ${fixturePath} must be a string; these are not: ${offending.join(', ')}`,
  );
  return entries;
}

/* -------------------------------------------------------------------------------------------------
 * Comparing a string against a page
 * ---------------------------------------------------------------------------------------------- */

/**
 * The form both sides of every comparison are reduced to: entity-decoded, quote-folded,
 * whitespace-normalised and case-folded by the shared normaliser, so a page that emits a straight
 * apostrophe matches a fixture written with a curly one and no comparison depends on which the
 * contributor typed.
 */
function comparable(value: string): string {
  return normaliseText(value).toLowerCase();
}

/** A letter or digit, in any script: the character class the whole-word boundary tests against. */
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/** Whether a character is a letter or a digit; an empty string (a string's edge) never is. */
function isLetterOrDigit(character: string): boolean {
  return character.length > 0 && LETTER_OR_DIGIT.test(character);
}

/**
 * Every offset at which `needle` occurs in `haystack` as a whole word.
 *
 * The boundary is built from the entry itself and stated as one rule: the character before and the
 * character after the match must not be a letter or a digit. So a hyphen inside the entry is part of
 * the phrase being sought — `best-in-class` matches as a whole phrase — while a hyphen immediately
 * outside it is a boundary, and `Plumbline` matches inside `the Plumbline platform` but not inside
 * `Plumblines`. Both sides arrive already case-folded.
 */
function wholeWordOffsets(haystack: string, needle: string): number[] {
  const offsets: number[] = [];
  if (needle.length === 0) {
    return offsets;
  }
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) {
      return offsets;
    }
    const before = at === 0 ? '' : haystack.charAt(at - 1);
    const after = haystack.charAt(at + needle.length);
    if (!isLetterOrDigit(before) && !isLetterOrDigit(after)) {
      offsets.push(at);
    }
    from = at + 1;
  }
}

/**
 * The characters either side of one hit, so a reviewer can find the sentence without re-running the
 * scan. The text quoted is the case-folded page text the offset was measured in, which keeps the
 * offset and the quote consistent.
 */
function quoteContext(text: string, offset: number, length: number): string {
  const start = Math.max(0, offset - CONTEXT_CHARACTERS);
  const end = Math.min(text.length, offset + length + CONTEXT_CHARACTERS);
  return text.slice(start, end);
}

/* -------------------------------------------------------------------------------------------------
 * The specification's own copy
 * ---------------------------------------------------------------------------------------------- */

/**
 * Every copy string the specification parser yields, folded for comparison: the field values, item
 * parts, list members and link texts of all nine sections, which is what the residue fixture's
 * derivation excluded itself against.
 *
 * The document's own field names, headings and bracketed builder instructions are not copy and are
 * not in this corpus, which is why a residue entry naming a template section cannot collide merely
 * because the specification describes the removal of that section. The loader throws — naming the
 * absolute path and the reason — when the fixture holds no document, so an absent specification is
 * reported here rather than quietly shrinking the corpus to nothing (AAP 0.7.7).
 */
function specificationCorpus(): string[] {
  const specification = loadSpecification();
  const corpus: string[] = [];
  const seen = new Set<string>();
  for (const section of specification.sections) {
    for (const copy of section.copy) {
      const folded = comparable(copy);
      if (folded.length === 0 || seen.has(folded)) {
        continue;
      }
      seen.add(folded);
      corpus.push(folded);
    }
  }
  assert.ok(
    corpus.length > 0,
    `the content specification at ${specification.source} yields no copy strings at all, so no residue entry could be proved disjoint from it`,
  );
  return corpus;
}


/* -------------------------------------------------------------------------------------------------
 * The published output, its stylesheets and its faces
 * ---------------------------------------------------------------------------------------------- */

/** Every file in the build output, as paths relative to it and joined with `/`. */
function builtFiles(directory: string = OUTPUT_DIRECTORY, relative: string = ''): string[] {
  assert.ok(
    existsSync(directory),
    `${directory} does not exist, so the build's files could not be read at all; the before hook of this file builds the default configuration there`,
  );
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const childRelative = relative === '' ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...builtFiles(path.join(directory, entry.name), childRelative));
      continue;
    }
    files.push(childRelative);
  }
  return files;
}

/** One built stylesheet, identified by its output-relative path. */
interface BuiltStylesheet {
  /** The stylesheet's path inside the build output, as every report quotes it. */
  readonly file: string;
  /** Its text. */
  readonly css: string;
}

/**
 * Every stylesheet the build emitted. An empty directory is a failure that names it: the fonts and
 * the type scale exist only in the compiled theme, so a build with no stylesheet proves nothing
 * about either, and a scan that treated "no CSS" as "no bad family" would go green on a broken build.
 */
function builtStylesheets(): BuiltStylesheet[] {
  assert.ok(
    existsSync(STYLESHEET_DIRECTORY),
    `${STYLESHEET_DIRECTORY} does not exist, so the build emitted no stylesheet and the font declarations could not be read`,
  );
  const names = readdirSync(STYLESHEET_DIRECTORY)
    .filter((name: string) => name.endsWith('.css'))
    .sort();
  assert.ok(
    names.length > 0,
    `${STYLESHEET_DIRECTORY} holds no .css file, so the build emitted no compiled theme and no font declaration could be checked`,
  );
  return names.map((name: string) => ({
    file: `_astro/${name}`,
    css: readText(path.join(STYLESHEET_DIRECTORY, name), 'the built stylesheet'),
  }));
}

/** A custom property declaration. Values stop at the first `;` or `}`, which minified CSS respects. */
const CUSTOM_PROPERTY_PATTERN = /(--[\w-]+)\s*:\s*([^;}]+)/g;

/**
 * Every custom property the built stylesheets declare, last declaration winning, as a browser
 * resolves them for the document root. A `font-family` value that reads one through `var()` is
 * resolved against this map, so the check judges the family the site actually renders with rather
 * than the reference to it.
 */
function customProperties(sheets: readonly BuiltStylesheet[]): Map<string, string> {
  const properties = new Map<string, string>();
  for (const sheet of sheets) {
    for (const match of sheet.css.matchAll(CUSTOM_PROPERTY_PATTERN)) {
      const name = match[1] ?? '';
      const value = (match[2] ?? '').trim();
      if (name.length > 0) {
        properties.set(name, value);
      }
    }
  }
  return properties;
}

/**
 * One `font-family` declaration's value, with the terminator before it kept in the pattern so a
 * custom property named `--font-family-something` can never be mistaken for a declaration.
 */
const FONT_FAMILY_DECLARATION_PATTERN = /(?:^|[;{])\s*font-family\s*:\s*([^;}]+)/gi;

/** Every `font-family` declaration in the built stylesheets, with the file it came from. */
function fontFamilyDeclarations(sheets: readonly BuiltStylesheet[]): { file: string; value: string }[] {
  const declarations: { file: string; value: string }[] = [];
  for (const sheet of sheets) {
    for (const match of sheet.css.matchAll(FONT_FAMILY_DECLARATION_PATTERN)) {
      declarations.push({ file: sheet.file, value: (match[1] ?? '').trim() });
    }
  }
  return declarations;
}

/** A `style` attribute's value, single- or double-quoted. */
const STYLE_ATTRIBUTE_PATTERN = /style\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;

/** One declaration inside a `style` attribute's value. */
const INLINE_FONT_FAMILY_PATTERN = /(?:^|;)\s*font-family\s*:\s*([^;]+)/gi;

/**
 * Every `font-family` value an inline `style` attribute carries in one built document. The site
 * ships no style attribute — a hash-only CSP would not cover one — so this is expected to find
 * nothing; it is scanned anyway because a value that arrived by another route would otherwise be the
 * one place a third family could hide from the stylesheet check.
 */
function inlineFontFamilyValues(document: string): string[] {
  const values: string[] = [];
  for (const attribute of document.matchAll(STYLE_ATTRIBUTE_PATTERN)) {
    const declarations = attribute[1] ?? attribute[2] ?? '';
    for (const declaration of declarations.matchAll(INLINE_FONT_FAMILY_PATTERN)) {
      values.push((declaration[1] ?? '').trim());
    }
  }
  return values;
}

/** The `var(` a family value may delegate through. */
const VAR_PREFIX = 'var(';

/** What a family-value resolution found, so a caller can report each part of it. */
interface FontFamilyExpansion {
  /** The family names the value resolves to, lower-cased and unquoted. */
  readonly families: string[];
  /** Everything that makes the value unresolvable or uncheckable. */
  readonly problems: string[];
}

/**
 * Resolves one `font-family` value to the family names it selects.
 *
 * Three cases are distinguished, and the distinction is the whole point of the resolution:
 *
 * - a `var()` over a custom property the stylesheets declare is replaced by that property's value,
 *   recursively, so `var(--font-urbanist)` is judged as the stack it names;
 * - a `var()` over one of the two `--default-*` properties Tailwind's preflight reads is a
 *   delegation to the user agent's own default stack, which the theme's `html` rule then overrides
 *   with Urbanist — it selects no family of the site's, so it resolves to `inherit`;
 * - a `var()` over any other undeclared property is reported as a problem: nothing in the build can
 *   say which family it would select, and guessing is how an unvetted family would pass unnoticed.
 */
function expandFontFamily(value: string, properties: ReadonlyMap<string, string>): FontFamilyExpansion {
  const problems: string[] = [];
  const expanded = expandVarReferences(value, properties, problems, 0);
  return { families: splitFamilyList(expanded), problems };
}

/** Replaces every `var()` reference in a value, in one left-to-right pass per nesting level. */
function expandVarReferences(
  value: string,
  properties: ReadonlyMap<string, string>,
  problems: string[],
  depth: number,
): string {
  if (depth > MAX_VAR_DEPTH) {
    problems.push('the family value refers to custom properties in a cycle deeper than any real stack');
    return 'inherit';
  }
  let output = '';
  let index = 0;
  while (index < value.length) {
    const start = value.indexOf(VAR_PREFIX, index);
    if (start === -1) {
      output += value.slice(index);
      return output;
    }
    output += value.slice(index, start);
    const close = matchingParenthesis(value, start + VAR_PREFIX.length - 1);
    if (close === -1) {
      output += value.slice(start);
      return output;
    }
    const inner = value.slice(start + VAR_PREFIX.length, close);
    const comma = topLevelComma(inner);
    const name = (comma === -1 ? inner : inner.slice(0, comma)).trim();
    const declared = properties.get(name);
    if (declared !== undefined) {
      output += expandVarReferences(declared, properties, problems, depth + 1);
    } else if (FONT_DELEGATION_PROPERTIES.has(name)) {
      output += 'inherit';
    } else {
      problems.push(
        `the value delegates through ${name}, which no built stylesheet declares, so the family it selects cannot be checked`,
      );
      output += 'inherit';
    }
    index = close + 1;
  }
  return output;
}

/** The index of the `)` matching the `(` at `openIndex`, honouring quoted strings, or `-1`. */
function matchingParenthesis(value: string, openIndex: number): number {
  let depth = 0;
  let quote = '';
  for (let index = openIndex; index < value.length; index += 1) {
    const character = value.charAt(index);
    if (quote.length > 0) {
      if (character === quote) {
        quote = '';
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '(') {
      depth += 1;
      continue;
    }
    if (character === ')') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

/** The index of the first comma outside quotes and parentheses, or `-1`. */
function topLevelComma(value: string): number {
  let depth = 0;
  let quote = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value.charAt(index);
    if (quote.length > 0) {
      if (character === quote) {
        quote = '';
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '(') {
      depth += 1;
      continue;
    }
    if (character === ')') {
      depth -= 1;
      continue;
    }
    if (character === ',' && depth === 0) {
      return index;
    }
  }
  return -1;
}

/** One family name as it is compared: unquoted, trimmed and case-folded. */
function stripFamilyName(value: string): string {
  const trimmed = value.trim();
  const first = trimmed.charAt(0);
  const last = trimmed.charAt(trimmed.length - 1);
  const unquoted = trimmed.length >= 2 && (first === '"' || first === "'") && last === first
    ? trimmed.slice(1, -1)
    : trimmed;
  return unquoted.trim().toLowerCase();
}

/** Splits a resolved family list on its top-level commas. */
function splitFamilyList(value: string): string[] {
  const families: string[] = [];
  let current = '';
  let depth = 0;
  let quote = '';
  for (let index = 0; index < value.length; index += 1) {
    const character = value.charAt(index);
    if (quote.length > 0) {
      current += character;
      if (character === quote) {
        quote = '';
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      current += character;
      continue;
    }
    if (character === '(') {
      depth += 1;
      current += character;
      continue;
    }
    if (character === ')') {
      depth -= 1;
      current += character;
      continue;
    }
    if (character === ',' && depth === 0) {
      families.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  families.push(current);
  return families.map(stripFamilyName).filter((family: string) => family.length > 0);
}

/**
 * Everything wrong with one resolved `font-family` value, prefixed with the file it came from, so a
 * caller can collect the problems from every stylesheet and report them together.
 */
function familyProblems(
  file: string,
  value: string,
  properties: ReadonlyMap<string, string>,
): string[] {
  const problems: string[] = [];
  const expansion = expandFontFamily(value, properties);
  for (const problem of expansion.problems) {
    problems.push(`${file}: font-family: ${value} — ${problem}`);
  }
  const unexpected = expansion.families.filter((family: string) => !ALLOWED_FAMILIES.has(family));
  if (unexpected.length > 0) {
    problems.push(
      `${file}: font-family: ${value} selects ${unexpected.join(', ')}, which is neither a shipped family nor a fallback of its stack`,
    );
  }
  return problems;
}

/** An `@font-face` block. The block nests nothing that carries a `}`, so the body stops at the first. */
const FONT_FACE_PATTERN = /@font-face\s*\{([^}]*)\}/g;

/** Every `@font-face` block's body in one stylesheet. */
function fontFaceBlocks(css: string): string[] {
  const blocks: string[] = [];
  for (const match of css.matchAll(FONT_FACE_PATTERN)) {
    blocks.push(match[1] ?? '');
  }
  return blocks;
}

/** One family descriptor out of a block's body, as it is compared: unquoted and case-folded. */
function blockFamily(body: string): string {
  const match = /(?:^|;)\s*font-family\s*:\s*([^;}]+)/i.exec(body);
  return match === null ? '' : stripFamilyName(match[1] ?? '');
}

/** The `url()` targets of a block's `src`, in source order, with any quoting removed. */
function blockSourceUrls(body: string): string[] {
  const match = /(?:^|;)\s*src\s*:\s*([^;}]+)/i.exec(body);
  if (match === null) {
    return [];
  }
  const urls: string[] = [];
  const references = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi;
  for (const reference of (match[1] ?? '').matchAll(references)) {
    urls.push((reference[1] ?? reference[2] ?? reference[3] ?? '').trim());
  }
  return urls;
}

/* -------------------------------------------------------------------------------------------------
 * The one build
 * ---------------------------------------------------------------------------------------------- */

/**
 * Builds the `default` configuration once, before any assertion reads a page. It is the state the
 * majority of the plan's checks run against — every configured value empty, so no form endpoint, no
 * contact address, no site address and not live (AAP 0.9.3) — and it is the only build this file
 * makes, so a run costs one build rather than one per group.
 *
 * A non-zero exit fails here with the child's own output quoted: every later assertion reads the same
 * output directory, so letting each report a missing page would bury the one line that says why.
 */
before(async () => {
  const result = await build('default', { outDir: OUTPUT_DIRECTORY });
  assert.equal(
    result.status,
    0,
    `the default build must succeed before the residue and vendor scans can read its pages (AAP 0.13.2); it exited ${result.status} and wrote ${result.outDir}\n--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`,
  );
});

/* -------------------------------------------------------------------------------------------------
 * The documents every scan reads
 * ---------------------------------------------------------------------------------------------- */

describe('the built pages the scans read', () => {
  it('emits all nine page documents, each with visible text', () => {
    const pages = pageTexts();
    assert.equal(
      pages.size,
      EMITTED_PAGES.length,
      `the build in ${OUTPUT_DIRECTORY} must emit every one of the ${EMITTED_PAGES.length} documents WT-16 and WT-13 scan, and only ${pages.size} could be read`,
    );
  });
});

/* -------------------------------------------------------------------------------------------------
 * WT-16 — no design-reference residue reaches a page
 * ---------------------------------------------------------------------------------------------- */

describe('WT-16: the design-reference residue fixture', () => {
  it('ships a fixture that parses as a top-level array of strings', () => {
    // The shared validator is the assertion: it fails naming the absolute path when the file is
    // absent or is not JSON, when the parsed value is not a top-level array, and on every entry that
    // is not a string, quoting that entry's index.
    requireStringEntries(RESIDUE_FIXTURE);
  });

  it('holds a non-empty list, so the scan cannot pass by checking nothing', () => {
    const entries = requireStringEntries(RESIDUE_FIXTURE);
    assert.ok(
      entries.length > 0,
      `the fixture ${RESIDUE_FIXTURE} holds no entries. An empty fixture would let every string of the design reference through, so it is a failing check rather than a passing one (AAP 0.13.8)`,
    );
  });

  it('holds only entries of four or more words, with no duplicates', () => {
    const entries = requireStringEntries(RESIDUE_FIXTURE);
    assert.ok(
      entries.length > 0,
      `the fixture ${RESIDUE_FIXTURE} holds no entries, so the shape of nothing was checked`,
    );
    const problems: string[] = [];
    const firstSeen = new Map<string, number>();
    entries.forEach((entry: string, index: number) => {
      const normalised = normaliseText(entry);
      if (normalised.length === 0) {
        problems.push(`[${index}] is empty`);
        return;
      }
      const words = normalised.split(' ').filter((word: string) => word.length > 0);
      if (words.length < RESIDUE_MINIMUM_WORDS) {
        problems.push(
          `[${index}] "${entry}" is ${words.length} word(s) long, and WT-16 extracts only strings of ${RESIDUE_MINIMUM_WORDS} or more words`,
        );
      }
      const key = normalised.toLowerCase();
      const earlier = firstSeen.get(key);
      if (earlier !== undefined) {
        problems.push(`[${index}] "${entry}" duplicates [${earlier}] once normalised`);
        return;
      }
      firstSeen.set(key, index);
    });
    assert.deepEqual(
      problems,
      [],
      `the entries of ${RESIDUE_FIXTURE} must each be a distinct string of at least ${RESIDUE_MINIMUM_WORDS} words; ${problems.length} of ${entries.length} do not qualify: ${problems.join('; ')}`,
    );
  });

  it('is disjoint from the content specification copy', () => {
    const entries = requireStringEntries(RESIDUE_FIXTURE);
    assert.ok(
      entries.length > 0,
      `the fixture ${RESIDUE_FIXTURE} holds no entries, so nothing was checked against the specification`,
    );
    const corpus = specificationCorpus();
    const collisions: string[] = [];
    for (const entry of entries) {
      const needle = comparable(entry);
      if (needle.length === 0) {
        continue;
      }
      for (const copy of corpus) {
        if (copy.includes(needle)) {
          collisions.push(`"${entry}" also appears in the specification's "${copy}"`);
        }
      }
    }
    assert.deepEqual(
      collisions,
      [],
      `the fixture ${RESIDUE_FIXTURE} must already exclude every string the content specification also contains (AAP 0.13.1, 0.13.8). ${entries.length} entries were checked against ${corpus.length} specification strings and these collide: ${collisions.join('; ')}. The exclusion belongs in the fixture and is never subtracted here, because subtracting it at test time would hide the exclusion that never took place`,
    );
  });

  it('appears nowhere in the visible text of the nine pages', () => {
    const entries = requireStringEntries(RESIDUE_FIXTURE);
    assert.ok(
      entries.length > 0,
      `the fixture ${RESIDUE_FIXTURE} holds no entries, so no page was checked against it`,
    );
    const pages = foldedPageTexts();
    const hits: string[] = [];
    for (const entry of entries) {
      const needle = comparable(entry);
      if (needle.length === 0) {
        continue;
      }
      for (const [route, text] of pages) {
        const at = text.indexOf(needle);
        if (at === -1) {
          continue;
        }
        hits.push(`"${entry}" ⇢ ${route} at offset ${at}: …${quoteContext(text, at, needle.length)}…`);
      }
    }
    assert.deepEqual(
      hits,
      [],
      `no string of the design reference may appear in what a visitor reads (rule W-1, WT-16). ${entries.length} residue strings were checked over ${pages.size} pages and these were found: ${hits.join('; ')}`,
    );
  });
});

/* -------------------------------------------------------------------------------------------------
 * WT-13 — no competitor name and no banned phrase reaches a page
 * ---------------------------------------------------------------------------------------------- */

describe('WT-13: the vendor and banned-phrase fixture', () => {
  it('ships a fixture that parses as a top-level array of strings', () => {
    // The shared validator is the assertion, as in the residue group above: a missing or unparsable
    // file, a value that is not a top-level array and any non-string entry are each reported with the
    // absolute path and, for an entry, its index.
    requireStringEntries(VENDOR_FIXTURE);
  });

  it('holds exactly the fifteen expected entries', () => {
    const entries = requireStringEntries(VENDOR_FIXTURE);
    assert.equal(
      entries.length,
      EXPECTED_VENDOR_COUNT,
      `the fixture ${VENDOR_FIXTURE} must hold exactly ${EXPECTED_VENDOR_COUNT} entries — the eleven vendor names the research document's section 4 shortlists plus Aldermoor, Plumbline, best-in-class and world-leading (WT-13, AAP 0.13.8) — and it holds ${entries.length}: ${entries.join(', ')}. The shortfall is a defect in the fixture, reported rather than repaired here: the expected count is fixed by the plan, is never derived from the fixture's own length, and is never closed by inventing a name (AAP 0.7.7)`,
    );
  });

  it('carries the four banned phrases among its entries', () => {
    const entries = requireStringEntries(VENDOR_FIXTURE);
    const present = new Set(entries.map((entry: string) => comparable(entry)));
    const absent = BANNED_PHRASES.filter((phrase: string) => !present.has(comparable(phrase)));
    assert.deepEqual(
      absent,
      [],
      `the fixture ${VENDOR_FIXTURE} must carry the four banned phrases even when another extraction reaches the expected count by other means; missing: ${absent.join(', ')}`,
    );
  });

  it('appears nowhere in the visible text of the nine pages as a whole word', () => {
    const entries = requireStringEntries(VENDOR_FIXTURE);
    const pages = foldedPageTexts();
    const hits: string[] = [];
    for (const entry of entries) {
      const needle = comparable(entry);
      if (needle.length === 0) {
        continue;
      }
      for (const [route, text] of pages) {
        for (const at of wholeWordOffsets(text, needle)) {
          hits.push(`"${entry}" ⇢ ${route} at offset ${at}: …${quoteContext(text, at, needle.length)}…`);
        }
      }
    }
    assert.deepEqual(
      hits,
      [],
      `no shortlisted vendor name and none of the four banned phrases may reach a page as a whole word (rule B-4, WT-13). ${entries.length} entries were checked over ${pages.size} pages and these were found: ${hits.join('; ')}`,
    );
  });
});

/* -------------------------------------------------------------------------------------------------
 * WT-16 — only the two vendored families are shipped
 * ---------------------------------------------------------------------------------------------- */

describe('WT-16: only the two vendored families are shipped', () => {
  it('publishes exactly the two vendored woff2 files and no other font file', () => {
    assert.ok(
      existsSync(FONT_DIRECTORY),
      `${FONT_DIRECTORY} does not exist, so the build published no font at all and the two vendored families never reached the output`,
    );
    const published = readdirSync(FONT_DIRECTORY).sort();
    assert.deepEqual(
      published,
      [...SHIPPED_FONT_FILES],
      `${FONT_DIRECTORY} must hold exactly the two vendored families of AAP 0.5.3 (rule B-1), and it holds: ${published.join(', ')}`,
    );
    const fontFiles = builtFiles()
      .filter((file: string) => FONT_FILE_EXTENSIONS.has(path.extname(file).toLowerCase()))
      .sort();
    assert.deepEqual(
      fontFiles,
      [...SHIPPED_FONT_PATHS],
      `the published output must carry the two vendored files and no other font, so that no face can arrive from a stylesheet, a component or an asset the theme does not declare (rule B-1); it carries: ${fontFiles.join(', ')}`,
    );
  });

  it(`never names ${FORBIDDEN_FAMILY} in any built file`, () => {
    const files = builtFiles();
    assert.ok(
      files.length > 0,
      `${OUTPUT_DIRECTORY} holds no file at all, so the scan would have checked nothing`,
    );
    const needle = FORBIDDEN_FAMILY.toLowerCase();
    const hits: string[] = [];
    for (const file of files) {
      const text = readText(path.join(OUTPUT_DIRECTORY, file), 'a built file').toLowerCase();
      if (text.includes(needle)) {
        hits.push(file);
      }
    }
    assert.deepEqual(
      hits,
      [],
      `the design's ${FORBIDDEN_FAMILY} face is replaced by the Geist Mono pair and is never bundled (AAP 0.6.3, 0.14.7); ${files.length} built files were checked and these name it: ${hits.join(', ')}`,
    );
  });

  it('names only the two families and their fallback stacks in any font-family value', () => {
    const sheets = builtStylesheets();
    const properties = customProperties(sheets);
    assert.ok(
      properties.has('--font-urbanist') && properties.has('--font-geist-mono'),
      `the built stylesheet must declare both family stacks (AAP 0.6.6), and it declares: ${[...properties.keys()].filter((name: string) => name.startsWith('--font-')).join(', ') || 'none'}`,
    );
    const problems: string[] = [];
    let checked = 0;
    for (const declaration of fontFamilyDeclarations(sheets)) {
      checked += 1;
      problems.push(...familyProblems(declaration.file, declaration.value, properties));
    }
    for (const file of builtFiles().filter((candidate: string) => candidate.endsWith('.html'))) {
      for (const value of inlineFontFamilyValues(readText(path.join(OUTPUT_DIRECTORY, file), 'a built page'))) {
        checked += 1;
        problems.push(...familyProblems(file, value, properties));
      }
    }
    assert.ok(
      checked > 0,
      'no font-family value was found in the built stylesheets or pages, so the check would have passed without examining anything',
    );
    assert.deepEqual(
      problems,
      [],
      `every family a built stylesheet or inline value selects must be Urbanist, Geist Mono or a fallback of its own stack, so that no face arrives from anywhere but the two vendored files (rules W-1, B-1; AAP 0.6.6). ${checked} values were checked and these do not comply: ${problems.join('; ')}`,
    );
  });

  it('declares both faces with font-display swap, a unicode-range and a same-origin source', () => {
    const blocks: { file: string; body: string }[] = [];
    for (const sheet of builtStylesheets()) {
      for (const body of fontFaceBlocks(sheet.css)) {
        blocks.push({ file: sheet.file, body });
      }
    }
    assert.equal(
      blocks.length,
      2,
      `the build must declare exactly the two vendored faces and nothing else (rule B-1, AAP 0.5.3); it declares ${blocks.length}: ${blocks.map((block) => `${block.file} { ${block.body} }`).join(' | ')}`,
    );
    assert.deepEqual(
      blocks.map((block) => blockFamily(block.body)).sort(),
      ['geist mono', 'urbanist'],
      `the two @font-face blocks must be the two vendored families; they describe: ${blocks.map((block) => blockFamily(block.body) || 'an unnamed face').join(', ')}`,
    );
    for (const block of blocks) {
      const where = `${block.file} @font-face { ${block.body} }`;
      assert.match(
        block.body,
        /(?:^|;)\s*font-display\s*:\s*swap\b/i,
        `${where} must declare font-display: swap, so a face that does not load degrades in weight rather than holding the text back (AAP 0.5.3)`,
      );
      assert.match(
        block.body,
        /(?:^|;)\s*unicode-range\s*:\s*[^;}]+/i,
        `${where} must declare a unicode-range, so a glyph outside the Latin subset falls back rather than rendering blank (AAP 0.5.3, 0.6.3)`,
      );
      assert.ok(
        !block.body.includes('://'),
        `${where} must not name a host: both faces are served from this origin (rule B-1)`,
      );
      const urls = blockSourceUrls(block.body);
      assert.ok(
        urls.length > 0,
        `${where} must declare a src with a url(), and it declares none`,
      );
      for (const url of urls) {
        assert.ok(
          url.startsWith('/fonts/'),
          `${where} must load from /fonts/ on this origin, and it loads ${url} (rule B-1, AAP 0.4.2)`,
        );
      }
    }
  });
});
