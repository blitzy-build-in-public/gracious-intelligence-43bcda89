/**
 * tests/static/content.test.ts — a copy edit changes the page and no component (WT-11; AAP 0.4.3,
 * 0.12.1, 0.13.1, 0.13.3).
 *
 * The copy layer has one contract: every user-visible string lives in `src/content`, so a copywriter
 * edits a string there, rebuilds, and the page changes without a component, a layout or a page file
 * moving (AAP 0.4.3). `tests/static/copy.test.ts` proves the negative half of that — no component or
 * layout holds a literal — which cannot see a string that reaches a page by some route other than
 * the content module that owns it. This file proves the positive half end to end, and it is the only
 * check that exercises the claim instead of inspecting the tree for it: edit one string in
 * `src/content`, build, and observe that the built page changed and that nothing in the presentation
 * layer had to move.
 *
 * The repository is never the thing that changes. The edit lands in a staged copy under
 * `.build/static-content/project`, both builds run inside that copy, and the repository itself is
 * proved byte-identical afterwards: its `git status`, the content hash of every file under `src/` and
 * the bytes of `package.json` are captured before staging and compared after the second build. A test
 * that demonstrated "a copy edit needs no code change" by editing the checkout would leave a
 * permanent uncommitted diff and a trap for the next reader, so the isolation is asserted rather than
 * promised.
 *
 * What is asserted, and why each assertion takes the form it does:
 *
 * - **The page changed.** The edited build's visible text carries the marker appended to the string,
 *   on the route that carried the original, and the baseline build's does not — both directions, on
 *   the same route, so neither a build that emitted nothing nor a stale output directory satisfies it.
 * - **Only that string changed.** On every one of the nine emitted documents, replacing each
 *   `<original> zq7` in the edited text with `<original>` recovers the baseline text exactly. That is
 *   stronger than "the marker appears where the string rendered", and it is the form that stays true
 *   when the chosen string is a substring of another rendered string — "Design intent" inside
 *   "Design intent, checked at each deployment", for instance — where plain set equality of pages
 *   would report a change on a page the edit never reached. Where no content string contains the
 *   chosen one — the usual case — the page set is asserted exactly, so a presentation file keeping
 *   its own copy of the string is caught; otherwise the pages carrying the marker must be a subset of
 *   the pages that rendered the original, which nothing can fake.
 * - **No component, layout or page differs.** Recursive content hashes of the copy's
 *   `src/components/`, `src/layouts/` and `src/pages/` are taken before the edit and after the second
 *   build, and the two maps must agree. The copy is hashed rather than the repository because the
 *   claim is about the presentation layer having nothing to move, not about the checkout.
 * - **Exactly one content file differs, by exactly one insertion.** Every file under the copy's
 *   `src/content` is compared with its repository counterpart, and the single differing file must
 *   equal its original with one marker inserted at one offset. An "edit" that touched two strings
 *   would prove nothing about which string reached which page.
 *
 * The string to edit is chosen deterministically rather than named here, because a test that named a
 * string would carry copy of its own and would break the day the copy is reworded (rule B-4). The
 * longest literal in `src/content/global.ts` that the baseline home page actually renders wins, with
 * the other content modules as an ordered fallback; it must be at least two words and eight
 * characters long, occur exactly once in its file, and — the corroboration — be one the content
 * specification itself yields. `src/content/global.ts` comes first because the shell renders on every
 * page, so the shell's reach is observable in the same run.
 *
 * Rules this file keeps, and where each is honoured:
 *
 * - **B-4** — nothing invented. The edit appends a marker to a string the baseline build already
 *   renders, so no word of the test's own reaches the site's copy; the marker is asserted absent from
 *   the copy's whole `src/` tree, from both test fixtures and from the specification's copy before it
 *   is used.
 * - **B-2** — configuration only through the four documented variables, empty by default. Both builds
 *   run `default`'s environment exactly as `tests/helpers/build.ts` defines it — all four `PUBLIC_*`
 *   values empty — with `LAUNCH_CHECK` deleted from the ambient environment, and the copy is asserted
 *   to carry no `.env` file but `.env.example`, so a developer's own configuration cannot make the
 *   result depend on their machine.
 * - **W-1** / **W-2** — the copy holds the project's own sources only, and the build driven is the
 *   documented static build `npm run build`; this file adds no route, handler, fixture or host.
 * - **B-3** — contrast, focus and axe belong to `tests/e2e/a11y.spec.ts`; this file adds no
 *   accessibility assertion and reads no colour, focus or motion value.
 * - **B-1** — nothing here fetches: the two builds run the project's own npm script, which resolves
 *   the pinned toolchain from the copy's own `node_modules` path and reaches no network.
 *
 * The specification's absence is a recorded state, not a silence. `tests/fixtures/
 * website-content-specification.md` carries the marker that says the document could not be supplied,
 * and `tests/helpers/spec.ts` refuses to model an absent document rather than yielding an empty
 * corpus. In that state this file still proves WT-11 — a statement about the copy layer, not about the
 * specification — and reports the degraded corroboration in its own log line: the chosen string must
 * be a literal unique in its module that the baseline home page renders. When the document is
 * supplied, the same code enforces the corpus gate exactly. Failing the whole file instead would leave
 * WT-11 with no command that exercises it, which the completion gate does not allow.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { environmentFor } from '../helpers/build.ts';
import { FIXTURE_ABSENT_MARKER, loadSpecification, normaliseText } from '../helpers/spec.ts';

/* -------------------------------------------------------------------------------------------------
 * Where everything lives
 * ---------------------------------------------------------------------------------------------- */

/** This file's directory, from which the repository root and every input are resolved. */
const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));

/**
 * The repository root, resolved from this module's own location rather than from the working
 * directory, so the suite reads and stages the same tree whether it is started from the root or by
 * the runner.
 */
const REPOSITORY_ROOT = path.resolve(TEST_DIRECTORY, '..', '..');

/**
 * This file's whole staging area, inside the one output root `.gitignore` covers. Deleting it is the
 * only recursive delete this file performs, and it never names a sibling suite's directory, `dist/`
 * or anything else in the checkout.
 */
const STAGING_ROOT = path.join(REPOSITORY_ROOT, '.build', 'static-content');

/** The staged copy of the project the two builds run in — the only project that is ever edited. */
const COPY_ROOT = path.join(STAGING_ROOT, 'project');

/** The baseline build's output: the copy as the repository holds it. */
const BASELINE_OUT = path.join(STAGING_ROOT, 'baseline');

/** The edited build's output: the copy with exactly one string changed. */
const EDITED_OUT = path.join(STAGING_ROOT, 'edited');

/**
 * What the copy leaves behind, by name at any depth. `node_modules` is linked in after the copy is
 * made, `dist` is another build's output, `.build` is the staging area itself — copying it would
 * recurse into the copy being written — `screenshots` is a review aid, and `.git` would make the copy
 * a repository rather than a directory tree.
 */
const COPY_EXCLUSIONS: ReadonlySet<string> = new Set([
  'node_modules',
  'dist',
  '.build',
  'screenshots',
  '.git',
]);

/** The content layer: the only directory a copy edit may touch. */
const CONTENT_DIRECTORY = 'src/content';

/** The two presentation directories that must not move for a copy edit to take effect (WT-11). */
const COMPONENT_DIRECTORY = 'src/components';
const LAYOUT_DIRECTORY = 'src/layouts';

/** Every route's source. Also asserted unchanged, so the change is attributable to `src/content`. */
const PAGE_DIRECTORY = 'src/pages';

/**
 * The content module searched first. It holds A0, the shell every page renders, so an edit there is
 * observable on more than one route without the test having to know which component renders what.
 */
const PREFERRED_CONTENT_FILE = 'src/content/global.ts';

/** The content module whose files are searched second, after the root modules. */
const SHARED_CONTENT_DIRECTORY = 'src/content/shared';

/** The committed specification; the corroboration for the chosen string. */
const SPECIFICATION_FIXTURE = 'tests/fixtures/website-content-specification.md';

/** The two derived fixtures. The marker must collide with neither (AAP 0.13.8). */
const RESIDUE_FIXTURE = 'tests/fixtures/figma-residue.json';
const VENDOR_FIXTURE = 'tests/fixtures/vendor-names.json';

/**
 * The marker appended to the chosen string. It is a plain word preceded by a space, so it cannot
 * touch the copy's punctuation, it carries none of `[`, `]`, `#` or `%`, and its absence from every
 * source, fixture and specification string is asserted before it is used.
 */
const MARKER = ' zq7';

/** The marker alone, which is what every page-text search looks for. */
const MARKER_TOKEN = 'zq7';

/** A string shorter than this would make an accidental match in a page plausible. */
const MINIMUM_LENGTH = 8;

/** Two words at least, so the edit changes a sentence rather than a token. */
const TWO_WORDS = /[^\s]+\s+[^\s]+/;

/** The generous per-test and per-hook budget: this file makes two full builds. */
const BUILD_TIMEOUT = 900_000;

/** `npm run build`'s executable; the same platform rule `tests/helpers/build.ts` applies. */
const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/** Room for the child's whole output; a build prints a few kilobytes, and a failure prints it all. */
const CHILD_BUFFER = 64 * 1024 * 1024;

/**
 * A staged copy holds the project's own sources and fixtures — a little over a hundred files today.
 * The bound catches a copy that recursed into itself, which would otherwise fill the disk before any
 * assertion ran.
 */
const MINIMUM_COPIED_FILES = 40;
const MAXIMUM_COPIED_FILES = 5000;

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
 * The nine documents the build emits, in navigation order with the page-not-found route last. The
 * list is written out rather than discovered by walking the output, because a scan that discovers its
 * own pages would pass on a build that emitted none of them.
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
 * Text, paths, hashes and the visible text of a page
 * ---------------------------------------------------------------------------------------------- */

/** A path as every report quotes it: relative to the repository root, with `/` separators. */
function displayPath(absolute: string): string {
  const relative = path.relative(REPOSITORY_ROOT, absolute);
  if (relative === '') {
    return '.';
  }
  return relative.startsWith('..') ? absolute : relative.split(path.sep).join('/');
}

/** The reason a file operation failed, without printing a stack trace or a configured value. */
function failureReason(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') {
      return code;
    }
  }
  return error instanceof Error ? error.message : String(error);
}

/** One file's text, or a failure quoting the path and the reason. */
function readText(absolute: string, label: string): string {
  try {
    return readFileSync(absolute, 'utf8');
  } catch (error: unknown) {
    throw new Error(`cannot read ${label} at ${displayPath(absolute)}: ${failureReason(error)}`);
  }
}

/** One file's raw bytes, or a failure quoting the path and the reason. */
function readBytes(absolute: string, label: string): Buffer {
  try {
    return readFileSync(absolute);
  } catch (error: unknown) {
    throw new Error(`cannot read ${label} at ${displayPath(absolute)}: ${failureReason(error)}`);
  }
}

/** The SHA-256 of one file's bytes: what a "nothing moved" assertion compares. */
function hashOfFile(absolute: string): string {
  return createHash('sha256').update(readBytes(absolute, 'a file the hashes cover')).digest('hex');
}

/**
 * Every file under one directory, as `/`-joined paths relative to it and in sorted order, so two
 * snapshots can be compared without depending on directory order. A missing directory is a failure
 * that names it: an empty map would let a "nothing moved" comparison pass against nothing at all.
 */
function walkFiles(root: string, relative = ''): string[] {
  const directory = relative === '' ? root : path.join(root, relative);
  let entries: Dirent[];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error: unknown) {
    throw new Error(
      `cannot list ${displayPath(directory)} (${failureReason(error)}), so nothing under it could be hashed`,
    );
  }
  const files: string[] = [];
  for (const entry of entries) {
    const childRelative = relative === '' ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...walkFiles(root, childRelative));
      continue;
    }
    if (entry.isFile()) {
      files.push(childRelative);
    }
  }
  return files.sort();
}

/** A recursive content hash of one directory: relative path → SHA-256. */
function hashMap(root: string): Map<string, string> {
  const hashes = new Map<string, string>();
  for (const file of walkFiles(root)) {
    hashes.set(file, hashOfFile(path.join(root, file)));
  }
  return hashes;
}

/**
 * The paths whose content differs between two hash maps, including a path present in only one of
 * them. Reported sorted, so a failure reads the same on every run.
 */
function differingPaths(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
): string[] {
  const differing: string[] = [];
  for (const [file, hash] of before) {
    if (after.get(file) !== hash) {
      differing.push(file);
    }
  }
  for (const file of after.keys()) {
    if (!before.has(file)) {
      differing.push(file);
    }
  }
  return differing.sort();
}

/**
 * Asserts that two snapshots hold the same paths with the same hashes, naming every path that moved
 * together with both sides' short hashes so a reviewer can tell a rewrite from a new file.
 */
function assertSameSnapshot(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
  label: string,
): void {
  const detail: string[] = [];
  for (const [file, hash] of before) {
    const next = after.get(file);
    if (next === undefined) {
      detail.push(`${file} was removed (was ${hash.slice(0, 12)})`);
      continue;
    }
    if (next !== hash) {
      detail.push(`${file} changed (was ${hash.slice(0, 12)}, now ${next.slice(0, 12)})`);
    }
  }
  for (const [file, hash] of after) {
    if (!before.has(file)) {
      detail.push(`${file} appeared (${hash.slice(0, 12)})`);
    }
  }
  assert.equal(
    detail.length,
    0,
    `${label}, but ${detail.length} path(s) moved: ${detail.join('; ')}`,
  );
}

/**
 * The subset of a snapshot below one directory, keyed relative to that directory, so a map taken of
 * the repository's whole `src/` can be compared with a map taken of one directory inside the copy.
 */
function underPrefix(snapshot: ReadonlyMap<string, string>, prefix: string): Map<string, string> {
  const filtered = new Map<string, string>();
  for (const [file, hash] of snapshot) {
    if (file.startsWith(`${prefix}/`)) {
      filtered.set(file.slice(prefix.length + 1), hash);
    }
  }
  return filtered;
}

/**
 * Every plain string literal the content layer declares, in a stable order. The set is read from the
 * staged copy, so it describes exactly the tree the two builds render, and it is what tells the
 * page-set assertion whether the chosen string can appear inside a longer rendered string.
 */
function allContentLiterals(): string[] {
  const root = path.join(COPY_ROOT, CONTENT_DIRECTORY);
  const values: string[] = [];
  for (const file of walkFiles(root)) {
    const source = readText(
      path.join(root, file),
      `the content module ${CONTENT_DIRECTORY}/${file}`,
    );
    for (const literal of stringLiterals(source)) {
      values.push(literal.value);
    }
  }
  return values;
}

/**
 * The content strings that contain the chosen string and are longer than it. When this list is
 * empty, every rendered occurrence of the chosen string is one the edit changes, so the pages
 * showing the marker must be exactly the pages that rendered the original — the exact form of the
 * criterion. When it is not empty, a page can legitimately render the original inside a longer
 * string the edit never touched ("Design intent" inside "Design intent, checked at each
 * deployment"), so the assertion takes the form that stays true: the marker adds nothing but its own
 * insertion, and its pages are a subset of the original's.
 */
function enclosingContentStrings(chosen: string): string[] {
  return allContentLiterals()
    .filter((value) => value !== chosen && value.includes(chosen))
    .sort();
}

/** How many times `needle` occurs in `haystack`, counting non-overlapping occurrences. */
function occurrences(haystack: string, needle: string): number {
  if (needle.length === 0) {
    return 0;
  }
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) {
      return count;
    }
    count += 1;
    from = at + needle.length;
  }
}

/** HTML comments, whose content is never what a visitor reads. */
const COMMENT_PATTERN = /<!--[\s\S]*?-->/g;

/** A `<script>` or `<style>` element with its content, so island code and the CSP string never read. */
const RAW_TEXT_ELEMENT_PATTERN = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

/** Every remaining tag. Removed with no replacement character, so a phrase split across an element
 * still reads as one phrase, which is what the marker search needs. */
const TAG_PATTERN = /<[^>]*>/g;

/**
 * The text a visitor reads on one built page: comments, `<script>` and `<style>` elements removed
 * with their content, the remaining tags removed, then the same `normaliseText` the specification
 * harness uses — so an entity, a curly quote or a whitespace run cannot disguise a copy change, and
 * both builds are compared through one comparison.
 */
function visibleText(html: string): string {
  const withoutComments = html.replace(COMMENT_PATTERN, '');
  const withoutRawText = withoutComments.replace(RAW_TEXT_ELEMENT_PATTERN, '');
  return normaliseText(withoutRawText.replace(TAG_PATTERN, ''));
}


/* -------------------------------------------------------------------------------------------------
 * The string literals one content module declares
 * ---------------------------------------------------------------------------------------------- */

/** One quoted string literal in a source file: its text and the offsets that delimit it. */
interface LiteralSpan {
  /** The literal's text as written, without its quotes. */
  readonly value: string;
  /** Offset of its first character inside the opening quote. */
  readonly start: number;
  /** Offset of the closing quote, which is also where its text ends. */
  readonly end: number;
  /** The quote character that delimits it. */
  readonly quote: string;
}

/**
 * Every plain quoted string literal a source file declares, in source order.
 *
 * The scan is deliberately narrow. It walks the source once, skipping line and block comments so a
 * quoted example in a doc comment is never taken for a declared string, and it discards any literal
 * carrying an escape sequence or a template interpolation, because neither can be compared with
 * rendered text without also decoding it. Each literal it returns sits immediately between its own
 * quotes — the caller asserts that — so the offset it reports is exactly where an edit belongs.
 */
function stringLiterals(source: string): LiteralSpan[] {
  const spans: LiteralSpan[] = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index] ?? '';
    if (character === '/' && source[index + 1] === '/') {
      const newline = source.indexOf('\n', index);
      index = newline === -1 ? source.length : newline + 1;
      continue;
    }
    if (character === '/' && source[index + 1] === '*') {
      const close = source.indexOf('*/', index + 2);
      index = close === -1 ? source.length : close + 2;
      continue;
    }
    if (character !== '"' && character !== "'" && character !== '`') {
      index += 1;
      continue;
    }
    const quote = character;
    let cursor = index + 1;
    let value = '';
    let escaped = false;
    let interpolated = false;
    while (cursor < source.length) {
      const inner = source[cursor] ?? '';
      if (inner === '\\') {
        escaped = true;
        cursor += 2;
        continue;
      }
      if (quote === '`' && inner === '$' && source[cursor + 1] === '{') {
        interpolated = true;
      }
      if (inner === quote) {
        break;
      }
      value += inner;
      cursor += 1;
    }
    if (!escaped && !interpolated && source[cursor] === quote) {
      spans.push({ value, start: index + 1, end: cursor, quote });
    }
    index = cursor + 1;
  }
  return spans;
}

/* -------------------------------------------------------------------------------------------------
 * The specification's corroboration, and the one string this run edits
 * ---------------------------------------------------------------------------------------------- */

/**
 * How the chosen string is corroborated as copy the site is meant to show, and the line the run logs
 * about which corroboration it used. `corpus` is `null` only when the specification fixture records
 * its own absence — the state this checkout is in — and never because a document was empty or
 * unreadable, which the loader reports as a failure instead.
 */
interface Corroboration {
  /** Every copy string the specification yields, case-folded, or `null` when it cannot be read. */
  readonly corpus: ReadonlySet<string> | null;
  /** The one line the run logs, naming the corroboration and any reason it could not be the corpus. */
  readonly note: string;
}

/** The case-folded form both sides of a corpus comparison use. */
function folded(value: string): string {
  return normaliseText(value).toLowerCase();
}

/**
 * Reads the committed specification and returns its copy strings, or reports why it cannot.
 *
 * The fixture is read here before the loader is called so that the two states stay distinct: a
 * fixture carrying `FIXTURE_ABSENT_MARKER` is the recorded absence of the document, which this file
 * reports and works around, while a fixture that is present but empty or malformed is a defect the
 * loader throws on — deliberately, because a corpus quietly shrunk to nothing would corroborate every
 * literal.
 */
function readCorroboration(): Corroboration {
  const fixture = path.join(REPOSITORY_ROOT, SPECIFICATION_FIXTURE);
  let markdown: string;
  try {
    markdown = readFileSync(fixture, 'utf8');
  } catch (error: unknown) {
    return {
      corpus: null,
      note: `${SPECIFICATION_FIXTURE} could not be read (${failureReason(error)}), so the edited string is corroborated by being a literal the baseline home page renders`,
    };
  }
  if (markdown.includes(FIXTURE_ABSENT_MARKER)) {
    return {
      corpus: null,
      note: `${SPECIFICATION_FIXTURE} records its own absence with ${FIXTURE_ABSENT_MARKER}, so the specification corpus cannot be consulted and the edited string is corroborated by being a literal the baseline home page renders`,
    };
  }

  const specification = loadSpecification();
  const corpus = new Set<string>();
  for (const section of specification.sections) {
    for (const copy of section.copy) {
      const key = folded(copy);
      if (key.length > 0) {
        corpus.add(key);
      }
    }
  }
  assert.ok(
    corpus.size > 0,
    `the content specification at ${specification.source} yields no copy strings at all, so no literal could be corroborated against it`,
  );
  return {
    corpus,
    note: `the edited string is copy the content specification at ${displayPath(specification.source)} yields (${corpus.size} strings)`,
  };
}

/** The one string this run edits, with everything a report quotes about it. */
interface ChosenString {
  /** The content module it is declared in, repository-relative. */
  readonly file: string;
  /** Its text, as written. */
  readonly value: string;
  /** Offset of its first character inside the opening quote. */
  readonly start: number;
  /** Offset of the closing quote. */
  readonly end: number;
  /** The quote character that delimits it. */
  readonly quote: string;
  /** How it was corroborated as copy, for the run's log line and for a failure's message. */
  readonly corroboratedBy: string;
}

/**
 * The content modules in search order: the preferred shell module first, then the remaining root
 * modules, then the shared ones. Each group is sorted, so the choice does not depend on directory
 * order, and a group is only searched when the groups before it yielded nothing.
 */
function contentSearchGroups(): string[][] {
  const contentRoot = path.join(REPOSITORY_ROOT, CONTENT_DIRECTORY);
  const modulesIn = (directory: string, relative: string): string[] =>
    readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => `${relative}/${entry.name}`)
      .sort();

  const preferred = path.join(REPOSITORY_ROOT, PREFERRED_CONTENT_FILE);
  assert.ok(
    existsSync(preferred),
    `${PREFERRED_CONTENT_FILE} does not exist, so the shell copy every page renders could not be searched; the staging step copies it, so check that it is still part of the project`,
  );

  const rootModules = modulesIn(contentRoot, CONTENT_DIRECTORY).filter(
    (file) => file !== PREFERRED_CONTENT_FILE,
  );
  const sharedRoot = path.join(REPOSITORY_ROOT, SHARED_CONTENT_DIRECTORY);
  const sharedModules = existsSync(sharedRoot)
    ? modulesIn(sharedRoot, SHARED_CONTENT_DIRECTORY)
    : [];
  return [[PREFERRED_CONTENT_FILE], rootModules, sharedModules];
}

/**
 * Chooses the single string to edit, deterministically and without naming any copy in this file.
 *
 * A literal qualifies when it is at least two words and eight characters long, when it is the only
 * declaration of its text in its module and its text occurs in that module exactly once, when the
 * baseline home page renders it, and when the specification yields it as copy. Among a group's
 * qualifying literals the longest wins, with the alphabetically first as the tie-break, so two runs
 * over the same tree always edit the same string. Every literal that came close and failed is
 * collected, so a run that finds nothing reports what it saw instead of only that it failed.
 */
function chooseString(homeText: string, corroboration: Corroboration): ChosenString {
  const nearMisses: string[] = [];
  for (const group of contentSearchGroups()) {
    const candidates: ChosenString[] = [];
    for (const file of group) {
      const source = readText(path.join(REPOSITORY_ROOT, file), `the content module ${file}`);
      const literals = stringLiterals(source);
      const declared = new Map<string, number>();
      for (const literal of literals) {
        declared.set(literal.value, (declared.get(literal.value) ?? 0) + 1);
      }
      for (const literal of literals) {
        const value = literal.value;
        if (value.length < MINIMUM_LENGTH || !TWO_WORDS.test(value)) {
          continue;
        }
        const reject = (why: string): void => {
          nearMisses.push(`${file}: "${value}" — ${why}`);
        };
        if (source[literal.start - 1] !== literal.quote || source[literal.end] !== literal.quote) {
          reject('its offsets do not sit inside its own quotes');
          continue;
        }
        if (value.trim() !== value) {
          reject('it carries surrounding whitespace');
          continue;
        }
        if ((declared.get(value) ?? 0) !== 1) {
          reject('its text is declared more than once in its module');
          continue;
        }
        if (occurrences(source, value) !== 1) {
          reject('its text occurs more than once in its module');
          continue;
        }
        if (!homeText.includes(normaliseText(value))) {
          reject('the baseline home page does not render it');
          continue;
        }
        if (corroboration.corpus !== null && !corroboration.corpus.has(folded(value))) {
          reject('the content specification does not yield it');
          continue;
        }
        candidates.push({
          file,
          value,
          start: literal.start,
          end: literal.end,
          quote: literal.quote,
          corroboratedBy: corroboration.note,
        });
      }
    }
    if (candidates.length > 0) {
      candidates.sort(
        (left, right) =>
          right.value.length - left.value.length ||
          left.value.localeCompare(right.value) ||
          left.start - right.start,
      );
      return candidates[0] as ChosenString;
    }
  }
  assert.fail(
    `no string in ${CONTENT_DIRECTORY} qualifies as this file's single copy edit. A qualifying string must be at least two words and ${MINIMUM_LENGTH} characters long, be declared once in its own module, be rendered by the baseline home page, and be copy the content specification yields. The strings considered and rejected were: ${nearMisses.length === 0 ? 'none, so no module declared a literal of two words or more' : nearMisses.join('; ')}`,
  );
}

/* -------------------------------------------------------------------------------------------------
 * Staging the copy, and building in it
 * ---------------------------------------------------------------------------------------------- */

/** What the staging step found, so each fact can be asserted where it is reported. */
interface StagedCopy {
  /** The copy's directory, repository-relative in every message. */
  readonly root: string;
  /** How many files the copy holds, which catches a copy that recursed into itself. */
  readonly fileCount: number;
  /** Every `.env*` path in the copy, `/`-joined and sorted: the only one allowed is `.env.example`. */
  readonly envFiles: string[];
  /** The paths the copy must carry, filtered to the ones that are missing. */
  readonly missingRequired: string[];
  /** Whether the copy can resolve the pinned toolchain from its own `node_modules` path. */
  readonly toolchainResolved: boolean;
}

/**
 * The paths a staged copy must carry for either build to mean anything: the manifest and the two
 * build configurations, the four source trees the assertions compare, the fonts the pages load and
 * the fixtures the choice reads.
 */
const REQUIRED_COPY_PATHS: readonly string[] = [
  'package.json',
  'astro.config.mjs',
  'tsconfig.json',
  'src/content',
  'src/components',
  'src/layouts',
  'src/pages',
  'public',
  'public/fonts',
  'scripts',
  'tests/fixtures',
];

/** One line of progress, so a long run says where it is without a reader reconstructing it. */
function log(line: string): void {
  console.log(`content.test: ${line}`);
}

/**
 * The environment both builds run in: `default`'s configuration — every documented `PUBLIC_*` value
 * explicitly empty (AAP 0.9.3) — with the harness-only `LAUNCH_CHECK` deleted from the ambient
 * environment, so a shell that exported it cannot change what either build proves (AAP 0.9.5). The
 * ambient environment is otherwise inherited, so `PATH` and the npm caches are the caller's own.
 */
function copyEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env, ...environmentFor('default') };
  delete environment.LAUNCH_CHECK;
  return environment;
}

/**
 * Copies one directory tree, skipping the names in `COPY_EXCLUSIONS` at every depth.
 *
 * This is an explicit walk rather than `cpSync(…, { recursive: true })` because Node refuses a copy
 * whose destination lies inside its own source — `ERR_FS_CP_EINVAL`, "cannot copy a directory to a
 * subdirectory of itself" — and the staging area is deliberately inside the checkout, under the one
 * output root `.gitignore` covers. `tests/helpers/build.ts` walks its `flags` copy for the same
 * reason. Skipping `.build` keeps the destination out of the walk, so the copy cannot recurse into
 * itself; a file is copied by content, and a symlink to a file is followed and copied, while a
 * symlink to a directory is left behind so a cyclic link cannot become an endless walk.
 */
function copyProjectTree(source: string, destination: string): void {
  mkdirSync(destination, { recursive: true });
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (COPY_EXCLUSIONS.has(entry.name)) {
      continue;
    }
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyProjectTree(from, to);
      continue;
    }
    if (entry.isFile()) {
      cpSync(from, to);
      continue;
    }
    if (entry.isSymbolicLink()) {
      const target = statSync(from, { throwIfNoEntry: false });
      if (target !== undefined && target.isFile()) {
        cpSync(from, to);
      }
    }
  }
}

/**
 * Deletes the staging area and copies the project into it.
 *
 * The symlink that gives the copy its toolchain is removed before the tree is, because it points at
 * the repository's own `node_modules`: a recursive delete that followed it would destroy the
 * installed dependencies. The copy then leaves `node_modules`, `dist`, `screenshots`, `.git` and
 * `.build` behind — `.build` most of all, since the copy lives there and a walk that entered it
 * would recurse into the copy being written.
 *
 * `node_modules` is linked rather than installed. This suite must never run `npm install` — `npm
 * test` would then need the network — and the copy sits inside the repository, so the link is the
 * same thing `tests/helpers/build.ts` does for its `flags` copy: one installed tree, resolved by
 * both projects, and no write outside `.build/`.
 */
function stageCopy(): StagedCopy {
  const link = path.join(COPY_ROOT, 'node_modules');
  if (existsSync(link) && lstatSync(link).isSymbolicLink()) {
    rmSync(link, { force: true });
  }
  rmSync(STAGING_ROOT, { recursive: true, force: true });
  copyProjectTree(REPOSITORY_ROOT, COPY_ROOT);

  const files = walkFiles(COPY_ROOT);
  const envFiles = files
    .filter((file) => path.basename(file) === '.env' || path.basename(file).startsWith('.env.'))
    .sort();
  const missingRequired = REQUIRED_COPY_PATHS.filter(
    (required) => !existsSync(path.join(COPY_ROOT, required)),
  );

  symlinkSync(path.join(REPOSITORY_ROOT, 'node_modules'), link, 'dir');
  const toolchainResolved = existsSync(path.join(link, '.bin', 'astro'));

  return {
    root: displayPath(COPY_ROOT),
    fileCount: files.length,
    envFiles,
    missingRequired,
    toolchainResolved,
  };
}

/** What one build of the copy produced. */
interface BuildOutcome {
  /** The copy the build ran in, repository-relative in every message. */
  readonly projectRoot: string;
  /** The output directory it wrote, repository-relative in every message. */
  readonly outDir: string;
  /** The child's exit status, or `1` when it was killed without reporting one. */
  readonly status: number;
  /** Everything it wrote to stdout. */
  readonly stdout: string;
  /** Everything it wrote to stderr. */
  readonly stderr: string;
  /** How long it took, in milliseconds, as the log line reports it. */
  readonly elapsedMs: number;
}

/** The last lines a child produced, so a failure quotes the build without dumping everything. */
function outputTail(text: string): string {
  const lines = text.trimEnd().split('\n');
  const kept = lines.slice(Math.max(0, lines.length - 40)).join('\n').trim();
  return kept.length > 0 ? kept : '(no output)';
}

/**
 * Builds the copy with the project's own documented command — `npm run build -- --outDir <dir>` —
 * so `prebuild` regenerates the three image files inside the copy and Astro's own `outDir` does the
 * rest. The package script is the entry point rather than the Astro CLI because that is the command
 * the project documents and the one whose behaviour the pages are reviewed against.
 *
 * A failed spawn is a harness fault and throws; a non-zero exit is returned, because the assertion
 * that reports it belongs to the run that knows which build it was.
 */
function buildCopy(projectRoot: string, outDir: string): BuildOutcome {
  const started = Date.now();
  const result = spawnSync(NPM_COMMAND, ['run', 'build', '--', '--outDir', outDir], {
    cwd: projectRoot,
    env: copyEnvironment(),
    encoding: 'utf8',
    maxBuffer: CHILD_BUFFER,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error !== undefined) {
    throw new Error(
      `\`npm run build\` could not be started in ${displayPath(projectRoot)}: ${result.error.message}. The build must run inside the staged copy, which resolves the toolchain through its node_modules link, and it must never need the network`,
    );
  }
  return {
    projectRoot: displayPath(projectRoot),
    outDir: displayPath(outDir),
    status: result.status ?? 1,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    stderr: typeof result.stderr === 'string' ? result.stderr : '',
    elapsedMs: Date.now() - started,
  };
}

/** Asserts that one build exited zero, quoting which build it was and the tail of what it said. */
function assertBuildSucceeded(outcome: BuildOutcome, label: string): void {
  assert.equal(
    outcome.status,
    0,
    `the ${label} build in ${outcome.projectRoot} must exit 0 before any copy-edit assertion can read its output; it exited ${outcome.status} and wrote ${outcome.outDir}\n--- stdout (tail) ---\n${outputTail(outcome.stdout)}\n--- stderr (tail) ---\n${outputTail(outcome.stderr)}`,
  );
}

/**
 * The visible text of every emitted document in one build output, keyed by route. A missing
 * document is a failure that names its route: a build that emitted nothing must not satisfy a
 * comparison that then finds "no change" on no pages.
 */
function pageTexts(outDir: string): Map<string, string> {
  const texts = new Map<string, string>();
  for (const page of EMITTED_PAGES) {
    const file = path.join(outDir, page.file);
    assert.ok(
      existsSync(file),
      `the build in ${displayPath(outDir)} emitted no document for ${page.route}, which should be ${displayPath(file)}; every assertion in this file reads all ${EMITTED_PAGES.length} documents`,
    );
    texts.set(page.route, visibleText(readText(file, `the built page for ${page.route}`)));
  }
  return texts;
}

/* -------------------------------------------------------------------------------------------------
 * The one edit
 * ---------------------------------------------------------------------------------------------- */

/** The single edit applied to the copy, with the evidence that it was the only one. */
interface ContentEdit {
  /** The file that was edited, repository-relative. */
  readonly file: string;
  /** The string as it stood, and as it stands after the marker was appended. */
  readonly original: string;
  readonly replacement: string;
  /** The file's whole text before and after the edit. */
  readonly before: string;
  readonly after: string;
  /** Every path that differs from its repository counterpart, repository-relative, under src/content. */
  readonly differingFiles: string[];
}

/**
 * Asserts that the marker collides with nothing it must not: no file under the copy's `src/`, neither
 * derived fixture, the committed specification, and — when it can be read — the specification's own
 * copy strings. The marker must be a word the site has never said, or a page-text search for it would
 * match text the edit did not touch.
 */
function assertMarkerIsFree(corroboration: Corroboration): void {
  const offenders: string[] = [];
  const sourceRoot = path.join(COPY_ROOT, 'src');
  for (const file of walkFiles(sourceRoot)) {
    if (readFileSync(path.join(sourceRoot, file), 'utf8').includes(MARKER_TOKEN)) {
      offenders.push(`src/${file}`);
    }
  }
  for (const fixture of [RESIDUE_FIXTURE, VENDOR_FIXTURE, SPECIFICATION_FIXTURE]) {
    const absolute = path.join(REPOSITORY_ROOT, fixture);
    if (existsSync(absolute) && readFileSync(absolute, 'utf8').includes(MARKER_TOKEN)) {
      offenders.push(fixture);
    }
  }
  if (corroboration.corpus !== null) {
    for (const copy of corroboration.corpus) {
      if (copy.includes(MARKER_TOKEN)) {
        offenders.push(`a content-specification copy string: "${copy}"`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `the marker "${MARKER_TOKEN}" must be a word nothing on the site already says, or the page-text searches would report text the edit never touched; it already occurs in ${offenders.length} place(s)`,
  );
}

/**
 * Appends the marker to the chosen string inside the copy, and returns the edit with its evidence.
 *
 * Every step is asserted: that the recorded offsets really do sit inside the chosen string's own
 * quotes (so the edit cannot land in a comment or a neighbour), that the append changes the length by
 * exactly the marker's (so nothing else was rewritten), that the marker occurs once afterwards (so
 * the edit is the single occurrence claimed), and that exactly one file under the copy's `src/content`
 * now differs from the repository's — the comparison the whole file rests on.
 */
function applyEdit(chosen: ChosenString): ContentEdit {
  const absolute = path.join(COPY_ROOT, chosen.file);
  const before = readText(absolute, `the copy's ${chosen.file}`);

  assert.equal(
    before.slice(chosen.start - 1, chosen.start),
    chosen.quote,
    `the chosen string in ${chosen.file} was recorded at offset ${chosen.start}, but the character before that offset is ${JSON.stringify(before[chosen.start - 1] ?? '')} rather than its opening ${chosen.quote}`,
  );
  assert.equal(
    before.slice(chosen.end, chosen.end + 1),
    chosen.quote,
    `the chosen string in ${chosen.file} was recorded as ending at offset ${chosen.end}, but the character there is ${JSON.stringify(before[chosen.end] ?? '')} rather than its closing ${chosen.quote}`,
  );
  assert.equal(
    before.slice(chosen.start, chosen.end),
    chosen.value,
    `the offsets recorded for the chosen string in ${chosen.file} do not hold that string, so the edit would replace something else`,
  );

  const replacement = chosen.value + MARKER;
  const after = before.slice(0, chosen.start) + replacement + before.slice(chosen.end);
  assert.equal(
    after.length,
    before.length + MARKER.length,
    `appending the marker to ${chosen.file} must lengthen it by exactly ${MARKER.length} characters`,
  );
  assert.equal(
    occurrences(after, MARKER_TOKEN),
    1,
    `after the edit ${chosen.file} must hold the marker once, and it holds it ${occurrences(after, MARKER_TOKEN)} time(s)`,
  );

  writeFileSync(absolute, after, 'utf8');
  assert.equal(
    readText(absolute, `the copy's ${chosen.file}`),
    after,
    `the copy's ${chosen.file} does not hold the text that was just written to it`,
  );

  const differingFiles = differingPaths(
    hashMap(path.join(COPY_ROOT, CONTENT_DIRECTORY)),
    hashMap(path.join(REPOSITORY_ROOT, CONTENT_DIRECTORY)),
  ).map((file) => `${CONTENT_DIRECTORY}/${file}`);
  return { file: chosen.file, original: chosen.value, replacement, before, after, differingFiles };
}

/* -------------------------------------------------------------------------------------------------
 * The evidence that the repository itself never moved
 * ---------------------------------------------------------------------------------------------- */

/** The repository's own state before staging and after the second build, compared by assertion. */
interface RepositoryEvidence {
  /** `git status --porcelain` before staging and after the edited build. */
  readonly statusBefore: string;
  readonly statusAfter: string;
  /** Recursive content hashes of the repository's `src/` at the same two moments. */
  readonly srcBefore: Map<string, string>;
  readonly srcAfter: Map<string, string>;
  /** The bytes of the repository's `package.json`, as a hash, at the same two moments. */
  readonly manifestBefore: string;
  readonly manifestAfter: string;
  /** Whether the repository's copy of the edited file still holds the original string. */
  readonly originalSurvives: boolean;
  /** Whether the staged copy is the only place the edit landed. */
  readonly editIsInTheCopy: boolean;
}

/** `git status --porcelain` for the repository, or a failure naming why it could not be read. */
function gitStatus(): string {
  const result = spawnSync('git', ['status', '--porcelain'], {
    cwd: REPOSITORY_ROOT,
    encoding: 'utf8',
    maxBuffer: CHILD_BUFFER,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error !== undefined) {
    throw new Error(
      `\`git status --porcelain\` could not be started in ${displayPath(REPOSITORY_ROOT)}: ${result.error.message}; this file proves the checkout is untouched by comparing that output before and after, so it cannot run without it`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `\`git status --porcelain\` failed in ${displayPath(REPOSITORY_ROOT)} with exit ${result.status}: ${outputTail(typeof result.stderr === 'string' ? result.stderr : '')}`,
    );
  }
  return typeof result.stdout === 'string' ? result.stdout : '';
}

/* -------------------------------------------------------------------------------------------------
 * The one run
 * ---------------------------------------------------------------------------------------------- */

/** Everything the assertions report on, gathered once so the two builds happen a single time. */
interface CopyEditRun {
  readonly staged: StagedCopy;
  readonly corroboration: Corroboration;
  readonly baseline: BuildOutcome;
  readonly baselineText: Map<string, string>;
  readonly chosen: ChosenString;
  readonly edit: ContentEdit;
  /** The content strings longer than the chosen one that contain it; see `enclosingContentStrings`. */
  readonly enclosingStrings: readonly string[];
  readonly componentsBefore: Map<string, string>;
  readonly componentsAfter: Map<string, string>;
  readonly layoutsBefore: Map<string, string>;
  readonly layoutsAfter: Map<string, string>;
  readonly pagesBefore: Map<string, string>;
  readonly pagesAfter: Map<string, string>;
  readonly edited: BuildOutcome;
  readonly editedText: Map<string, string>;
  readonly outputDifferences: string[];
  readonly repository: RepositoryEvidence;
}

/**
 * Stage, build, choose, edit, build again — the whole run, in the order the criterion needs it.
 *
 * The repository's own state is captured first, before anything is written, and again after the
 * edited build, so the comparison brackets every write this file makes.
 */
function performRun(): CopyEditRun {
  const statusBefore = gitStatus();
  const srcBefore = hashMap(path.join(REPOSITORY_ROOT, 'src'));
  const manifestBefore = hashOfFile(path.join(REPOSITORY_ROOT, 'package.json'));

  const staged = stageCopy();
  log(`staged ${staged.fileCount} files into ${staged.root}`);

  const baseline = buildCopy(COPY_ROOT, BASELINE_OUT);
  log(`baseline build exited ${baseline.status} in ${baseline.elapsedMs} ms -> ${baseline.outDir}`);
  assertBuildSucceeded(baseline, 'baseline');
  const baselineText = pageTexts(BASELINE_OUT);

  const corroboration = readCorroboration();
  const chosen = chooseString(baselineText.get('/') ?? '', corroboration);
  log(`editing "${chosen.value}" in ${chosen.file}: ${chosen.corroboratedBy}`);
  assertMarkerIsFree(corroboration);

  const componentsBefore = hashMap(path.join(COPY_ROOT, COMPONENT_DIRECTORY));
  const layoutsBefore = hashMap(path.join(COPY_ROOT, LAYOUT_DIRECTORY));
  const pagesBefore = hashMap(path.join(COPY_ROOT, PAGE_DIRECTORY));

  // Read before the edit: afterwards the edited literal contains the chosen string, which would make
  // every run look as though it needed the weaker page-set form of the assertion.
  const enclosingStrings = enclosingContentStrings(chosen.value);

  const edit = applyEdit(chosen);
  log(`edited ${edit.file}: "${edit.original}" -> "${edit.replacement}"`);

  const edited = buildCopy(COPY_ROOT, EDITED_OUT);
  log(`edited build exited ${edited.status} in ${edited.elapsedMs} ms -> ${edited.outDir}`);
  assertBuildSucceeded(edited, 'edited');
  const editedText = pageTexts(EDITED_OUT);

  const outputDifferences = differingPaths(hashMap(BASELINE_OUT), hashMap(EDITED_OUT));

  const repositoryCopy = readText(
    path.join(REPOSITORY_ROOT, chosen.file),
    `the repository's ${chosen.file}`,
  );
  const originalSurvives =
    repositoryCopy.includes(chosen.value) && !repositoryCopy.includes(MARKER_TOKEN);
  const editIsInTheCopy = readText(
    path.join(COPY_ROOT, chosen.file),
    `the copy's ${chosen.file}`,
  ).includes(chosen.value + MARKER);

  const repository: RepositoryEvidence = {
    statusBefore,
    statusAfter: gitStatus(),
    srcBefore,
    srcAfter: hashMap(path.join(REPOSITORY_ROOT, 'src')),
    manifestBefore,
    manifestAfter: hashOfFile(path.join(REPOSITORY_ROOT, 'package.json')),
    originalSurvives,
    editIsInTheCopy,
  };

  return {
    staged,
    corroboration,
    baseline,
    baselineText,
    chosen,
    edit,
    enclosingStrings,
    componentsBefore,
    componentsAfter: hashMap(path.join(COPY_ROOT, COMPONENT_DIRECTORY)),
    layoutsBefore,
    layoutsAfter: hashMap(path.join(COPY_ROOT, LAYOUT_DIRECTORY)),
    pagesBefore,
    pagesAfter: hashMap(path.join(COPY_ROOT, PAGE_DIRECTORY)),
    edited,
    editedText,
    outputDifferences,
    repository,
  };
}

/**
 * The run happens once, before any assertion reads it: two full builds, the edit between them, and
 * the repository's own state captured on either side. A failure here is the run's failure and is
 * reported with the child's own output quoted, rather than repeated by a dozen assertions that would
 * each report a damaged page.
 */
let run: CopyEditRun;

before(
  () => {
    run = performRun();
  },
  { timeout: BUILD_TIMEOUT },
);

/* -------------------------------------------------------------------------------------------------
 * Phase 1 — the staged copy
 * ---------------------------------------------------------------------------------------------- */

describe('WT-11: the staged copy the run edits', () => {
  it('WT-11: stages the project into its own directory under .build', () => {
    assert.ok(
      run.staged.root.startsWith('.build/static-content/'),
      `the copy must live at ${displayPath(COPY_ROOT)}, inside the one output root .gitignore covers, and it was staged at ${run.staged.root}`,
    );
    assert.ok(
      run.staged.fileCount >= MINIMUM_COPIED_FILES && run.staged.fileCount <= MAXIMUM_COPIED_FILES,
      `the copy at ${run.staged.root} holds ${run.staged.fileCount} files, which is outside the plausible range of ${MINIMUM_COPIED_FILES}–${MAXIMUM_COPIED_FILES}. A copy that recursed into .build would be far larger; an empty or partly filtered one far smaller`,
    );
    assert.deepEqual(
      run.staged.missingRequired,
      [],
      `the copy at ${run.staged.root} is missing ${run.staged.missingRequired.length} path(s) the assertions read: ${run.staged.missingRequired.join(', ')}`,
    );
  });

  it('WT-11: carries no .env file but .env.example, so no local configuration can shape the build', () => {
    assert.deepEqual(
      run.staged.envFiles,
      ['.env.example'],
      `the copy at ${run.staged.root} must carry .env.example and no other .env file, because both builds run the default configuration — every documented value empty (AAP 0.9.3) — and a real .env would make the result depend on the machine the suite runs on; it carries ${run.staged.envFiles.join(', ')}`,
    );
  });

  it('WT-11: resolves the pinned toolchain without installing anything', () => {
    assert.ok(
      run.staged.toolchainResolved,
      `the copy at ${run.staged.root} cannot resolve the astro binary: its node_modules link does not expose .bin/astro. This suite never runs npm install — npm test must not need the network — so the link to the repository's installed tree is what makes the build possible`,
    );
  });
});

/* -------------------------------------------------------------------------------------------------
 * Phase 1 and 2 — the baseline build and the chosen string
 * ---------------------------------------------------------------------------------------------- */

describe('WT-11: the baseline build and the string to edit', () => {
  it('WT-11: builds the unedited copy and emits all nine documents', () => {
    assertBuildSucceeded(run.baseline, 'baseline');
    assert.equal(
      run.baselineText.size,
      EMITTED_PAGES.length,
      `the baseline build must emit all ${EMITTED_PAGES.length} documents this file reads, and ${run.baselineText.size} could be read from ${run.baseline.outDir}`,
    );
  });

  it('WT-11: chooses a string the home page renders, of two words and at least eight characters', () => {
    assert.ok(
      run.chosen.value.length >= MINIMUM_LENGTH,
      `the chosen string "${run.chosen.value}" in ${run.chosen.file} is shorter than ${MINIMUM_LENGTH} characters, which would make an accidental match in a page plausible`,
    );
    assert.ok(
      TWO_WORDS.test(run.chosen.value),
      `the chosen string "${run.chosen.value}" in ${run.chosen.file} is a single word, so editing it would change a token rather than a sentence`,
    );
    assert.ok(
      run.baselineText.get('/')?.includes(normaliseText(run.chosen.value)) === true,
      `the chosen string "${run.chosen.value}" in ${run.chosen.file} is not in the baseline home page's visible text, so the run could not show that an edit to it reaches a page`,
    );
  });

  it('WT-11: chooses a string declared exactly once in its own module', () => {
    const source = readText(
      path.join(REPOSITORY_ROOT, run.chosen.file),
      `the content module ${run.chosen.file}`,
    );
    const declarations = stringLiterals(source).filter(
      (literal) => literal.value === run.chosen.value,
    );
    assert.equal(
      declarations.length,
      1,
      `the string "${run.chosen.value}" must be declared exactly once in ${run.chosen.file}, and it is declared ${declarations.length} time(s), so the edit would be ambiguous`,
    );
    assert.equal(
      occurrences(source, run.chosen.value),
      1,
      `the text of "${run.chosen.value}" must occur exactly once in ${run.chosen.file}, and it occurs ${occurrences(source, run.chosen.value)} time(s)`,
    );
  });

  it('WT-11: corroborates the chosen string as copy the specification yields', () => {
    log(`corroboration: ${run.corroboration.note}`);
    if (run.corroboration.corpus === null) {
      // A recorded absence is reported, not invented around: the fixture states that the document
      // was not supplied, so this run corroborates the edited string by the two properties it can
      // observe — a literal unique in its module, rendered by the baseline home page — and the
      // surrounding assertions prove both. Failing the file instead would leave WT-11 with no
      // command that exercises it, and WT-11 ("changing a string in src/content changes the built
      // page and edits no component") is a statement about the copy layer that holds whether or not
      // the specification can be read; the corpus gate is the corroboration of the edit target, not
      // the criterion itself. When the document is supplied, the branch below enforces it exactly.
      assert.ok(
        run.corroboration.note.includes(SPECIFICATION_FIXTURE),
        `the corroboration note must name ${SPECIFICATION_FIXTURE} when the specification cannot be consulted, and it reads: ${run.corroboration.note}`,
      );
      return;
    }
    assert.ok(
      run.corroboration.corpus.has(folded(run.chosen.value)),
      `the chosen string "${run.chosen.value}" in ${run.chosen.file} is not copy the content specification yields, so editing it would edit text the site is not meant to show (Rule B-4)`,
    );
  });
});

/* -------------------------------------------------------------------------------------------------
 * Phase 3 — the edit and the second build
 * ---------------------------------------------------------------------------------------------- */

describe('WT-11: the one edit and the build that follows it', () => {
  it('WT-11: edits exactly one file under src/content, by exactly one occurrence', () => {
    assert.deepEqual(
      run.edit.differingFiles,
      [run.edit.file],
      `a copy edit must touch exactly one file under ${CONTENT_DIRECTORY}, and these differ from the repository: ${run.edit.differingFiles.join(', ')}`,
    );
    const expected =
      run.edit.before.slice(0, run.chosen.start) +
      run.edit.replacement +
      run.edit.before.slice(run.chosen.end);
    assert.equal(
      run.edit.after,
      expected,
      `the edit to ${run.edit.file} must be the original text with exactly one marker inserted at offset ${run.chosen.start}, and the file that was written is not that`,
    );
    assert.equal(
      occurrences(run.edit.after, MARKER_TOKEN),
      1,
      `the edited ${run.edit.file} must hold the marker once, and it holds it ${occurrences(run.edit.after, MARKER_TOKEN)} time(s)`,
    );
  });

  it('WT-11: builds the edited copy into its own directory', () => {
    assertBuildSucceeded(run.edited, 'edited');
    assert.equal(
      run.editedText.size,
      EMITTED_PAGES.length,
      `the edited build must emit all ${EMITTED_PAGES.length} documents this file reads, and ${run.editedText.size} could be read from ${run.edited.outDir}`,
    );
  });

  it('WT-11: produces a different artefact from the edited copy', () => {
    assert.ok(
      run.outputDifferences.length > 0,
      `the baseline build in ${run.baseline.outDir} and the edited build in ${run.edited.outDir} are byte-identical, so the edit reached no page at all`,
    );
    assert.ok(
      run.outputDifferences.includes('index.html'),
      `the edited build's index.html must differ from the baseline's, because the chosen string renders on the home page; the files that differ are ${run.outputDifferences.join(', ')}`,
    );
    log(`artefacts that differ: ${run.outputDifferences.join(', ')}`);
  });
});

/* -------------------------------------------------------------------------------------------------
 * Phase 4 — the four assertions that state the criterion
 * ---------------------------------------------------------------------------------------------- */

describe('WT-11: the page changed where the copy renders', () => {
  it('WT-11: shows the new string on the page that carried the old one', () => {
    const baselineHome = run.baselineText.get('/') ?? '';
    const editedHome = run.editedText.get('/') ?? '';
    assert.ok(
      baselineHome.includes(normaliseText(run.chosen.value)),
      `the baseline home page must render "${run.chosen.value}" for this run to show that an edit to it changed the page; its visible text does not`,
    );
    assert.ok(
      editedHome.includes(normaliseText(run.chosen.value + MARKER)),
      `the edited home page must render "${run.chosen.value + MARKER}"; its visible text does not`,
    );
    assert.ok(
      !baselineHome.includes(MARKER_TOKEN),
      `the baseline home page must not contain the marker "${MARKER_TOKEN}" before the edit, or the run cannot tell the edit's effect from what was already there`,
    );
  });

  it('WT-11: changes the visible text of no page except by the marker it inserted', () => {
    const details: string[] = [];
    const markerPages: string[] = [];
    const markerRoutes: string[] = [];
    const originalPages: string[] = [];
    for (const page of EMITTED_PAGES) {
      const baseline = run.baselineText.get(page.route) ?? '';
      const edited = run.editedText.get(page.route) ?? '';
      const markers = occurrences(edited, normaliseText(run.chosen.value + MARKER));
      if (markers > 0) {
        markerPages.push(`${page.route} (${markers})`);
        markerRoutes.push(page.route);
      }
      if (baseline.includes(normaliseText(run.chosen.value))) {
        originalPages.push(page.route);
      }
      // Replacing each inserted marker with the string it was appended to must recover the baseline
      // text exactly. Anything else — an added word, a lost line, a reordered block — shows up here.
      const restored = edited
        .split(normaliseText(run.chosen.value + MARKER))
        .join(normaliseText(run.chosen.value));
      if (restored !== baseline) {
        details.push(`${page.route}: the edited text is not the baseline text plus the marker`);
      }
      // A page cannot show the marker unless it rendered the original string in the first place.
      if (markers > 0 && !baseline.includes(normaliseText(run.chosen.value))) {
        details.push(`${page.route}: shows the marker without having rendered the original string`);
      }
    }
    log(`pages rendering the original: ${originalPages.join(', ')}`);
    log(`pages showing the marker: ${markerPages.join(', ')}`);
    assert.deepEqual(
      details,
      [],
      `the edit may only append its marker where the copy renders, and every page must otherwise read exactly as it did; ${details.length} page(s) disagree: ${details.join('; ')}`,
    );
    assert.ok(
      markerPages.length > 0,
      `no page of the edited build shows the marker, so the edit reached no rendered copy; the pages that rendered the original were ${originalPages.join(', ') || 'none'}`,
    );

    if (run.enclosingStrings.length === 0) {
      // No content string contains the chosen one, so every rendered occurrence of it is one the edit
      // changes and the pages showing the marker must be exactly the pages that rendered the original.
      // A page that rendered the original without gaining the marker is the failure this catches: a
      // presentation file holding its own copy of the string, so the edit no longer reaches that slot.
      assert.deepEqual(
        markerRoutes,
        originalPages,
        `the marker must appear on exactly the pages whose baseline text rendered "${run.chosen.value}", because no content string contains it and the edit therefore changes every occurrence; it appears on ${markerRoutes.join(', ') || 'no page'} while the original rendered on ${originalPages.join(', ') || 'no page'}`,
      );
      return;
    }
    log(
      `the exact page-set form is not asserted: ${run.enclosingStrings.length} content string(s) contain "${run.chosen.value}" and would render it unchanged, so the marker can only be required on a subset of the original's pages`,
    );
  });

  it('WT-11: leaves every component and layout byte-identical', () => {
    assertSameSnapshot(
      run.componentsBefore,
      run.componentsAfter,
      `no file under ${COMPONENT_DIRECTORY} may change for a copy edit to take effect (WT-11)`,
    );
    assertSameSnapshot(
      run.layoutsBefore,
      run.layoutsAfter,
      `no file under ${LAYOUT_DIRECTORY} may change for a copy edit to take effect (WT-11)`,
    );
    assertSameSnapshot(
      run.componentsAfter,
      underPrefix(run.repository.srcBefore, 'components'),
      `the staged copy's ${COMPONENT_DIRECTORY} must still be exactly the repository's own, because a copy edit may change nothing in the presentation layer (WT-11)`,
    );
    assertSameSnapshot(
      run.layoutsAfter,
      underPrefix(run.repository.srcBefore, 'layouts'),
      `the staged copy's ${LAYOUT_DIRECTORY} must still be exactly the repository's own, because a copy edit may change nothing in the presentation layer (WT-11)`,
    );
  });

  it('WT-11: leaves every page file byte-identical', () => {
    assertSameSnapshot(
      run.pagesBefore,
      run.pagesAfter,
      `no file under ${PAGE_DIRECTORY} may change for a copy edit to take effect, so the change is attributable to ${CONTENT_DIRECTORY} alone`,
    );
    assertSameSnapshot(
      run.pagesAfter,
      underPrefix(run.repository.srcBefore, 'pages'),
      `the staged copy's ${PAGE_DIRECTORY} must still be exactly the repository's own, so the change is attributable to ${CONTENT_DIRECTORY} alone`,
    );
  });
});

/* -------------------------------------------------------------------------------------------------
 * Phase 5 — the repository was never the thing that changed
 * ---------------------------------------------------------------------------------------------- */

describe('WT-11: the repository itself was never edited', () => {
  it('WT-11: leaves git status and every file under src/ exactly as they were', () => {
    assert.equal(
      run.repository.statusAfter,
      run.repository.statusBefore,
      `\`git status --porcelain\` must read the same after both builds as it did before staging, because every write belongs inside ${displayPath(STAGING_ROOT)}; it was\n${run.repository.statusBefore}\nand is now\n${run.repository.statusAfter}`,
    );
    assert.ok(
      !run.repository.statusAfter.includes('.build'),
      `\`git status --porcelain\` must not report the staging area, which .gitignore covers; it reports\n${run.repository.statusAfter}`,
    );
    assertSameSnapshot(
      run.repository.srcBefore,
      run.repository.srcAfter,
      'the repository\'s src/ tree must be byte-identical after the run, because the edit belongs to the copy',
    );
    assert.equal(
      run.repository.manifestAfter,
      run.repository.manifestBefore,
      `the repository's package.json must be byte-identical after the run, so no dependency and no script changed: it was ${run.repository.manifestBefore.slice(0, 12)} and is now ${run.repository.manifestAfter.slice(0, 12)}`,
    );
  });

  it('WT-11: leaves the original string in the repository and the edit in the copy', () => {
    assert.ok(
      run.repository.originalSurvives,
      `the repository's ${run.edit.file} must still hold "${run.edit.original}" and must not hold the marker "${MARKER_TOKEN}", because the edit belongs to the staged copy; restore the file if it was changed`,
    );
    assert.ok(
      run.repository.editIsInTheCopy,
      `the staged copy's ${run.edit.file} must hold "${run.edit.replacement}", which is what the second build rendered`,
    );
  });
});

