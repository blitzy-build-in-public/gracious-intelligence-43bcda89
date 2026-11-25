/**
 * The tracked-tree scan suite: the acceptance evidence that reads the repository as it stands, with
 * no build and no browser (AAP 0.12.1, 0.13.3, 0.13.4). It runs first among the static checks, so a
 * defect is caught in the sources rather than in the output they produce.
 *
 * Six obligations, each stated with the section that sets it:
 *
 * - **WT-08, source side** (0.13.1, 0.13.7) — no raster image is tracked; the three files
 *   `npm run assets` generates into `public/` are not tracked either; `public/screens/.gitkeep`
 *   is tracked so the owner's drop point survives a clone; and a screen PNG left in
 *   `public/screens/` by an interrupted build is reported rather than passing quietly.
 * - **0.6.6 / 0.17.2** — every colour, length, radius and stroke resolves to the single token
 *   definition in `src/styles/theme.css`. No hex literal, no `rgb()`-family function, no raw `px`
 *   length in a style context, and no `style` attribute or `<style>` element anywhere else.
 * - **B-2 / 0.9.6** — no private key, provider token, `Authorization` value or high-entropy base64
 *   run is tracked or built; `process.env` is read in exactly one module; only the four documented
 *   variables are named under `src/`; no `.env` file but `.env.example` is tracked.
 * - **0.9.5 / B-2** — no test-only hook reaches production code: nothing under `src/` reads
 *   `LAUNCH_CHECK`, the address bar, or defines a `window.__` global.
 * - **0.8.2 / B-1** — the three fixtures stay out of the product, no absolute URI under `src/` or
 *   `scripts/` names a host beyond the sitemap namespace and XML namespace declarations, and
 *   `astro.config.mjs` installs no adapter and no middleware.
 * - **0.13.6** — no review screenshot is tracked.
 *
 * What the project rules require of this file, and where each is honoured:
 *
 * - **W-1** — the Figma file supplies layout and style only, so nothing downloaded from it may be
 *   committed. The raster scan is the mechanical half of that: a photographic or exported asset
 *   cannot be tracked at all, and the only images the tree holds are the authored SVGs under
 *   `src/illustrations/` plus the two vendored font files.
 * - **B-1** — no runtime request to a third-party host, fonts and icons bundled. The host scan
 *   below is the source-side half of WT-03: outside the sitemap's XML namespace, and outside XML
 *   namespace declarations, no file under `src/` or `scripts/` may name an absolute URI.
 * - **B-2** — no secret in the repository or the bundle, configuration only from named variables
 *   with empty defaults. This file is that scan, and the confinement check that keeps the four
 *   documented names in one module.
 * - **B-4** — nothing invented. A test-only hook in shipped code is the same defect as an invented
 *   string, so the hook scan and the fixture-isolation scan both serve it.
 * - **W-2** — static site only. `astro.config.mjs` must carry no adapter and no middleware.
 * - **B-3** is the axe suite's obligation in `tests/e2e/a11y.spec.ts`; nothing here duplicates it
 *   and nothing here weakens it.
 *
 * Two properties are deliberate. First, **no assertion passes when its input is missing**: the
 * roots and dependencies this suite reads are asserted to exist before anything is scanned, and
 * every scan reports the files it visited so an empty scan fails instead of proving nothing.
 * Second, **a comment is not a style context and not a credential**: the scans match a view of each
 * file in which comments — and, for markup, the frontmatter and any inline script body — are
 * blanked in place rather than cut out, so an offset still points at the line it came from; HTML
 * character references are blanked the same way, so prose about `rgb()` or an entity such as a
 * numeric apostrophe is never a hit. A credential is the exception: the secret scan reads each file
 * exactly as it stands, because a key written into a comment is committed just the same.
 *
 * This file writes nothing — no build, no directory, no scratch file, no `.build/` output — and it
 * imports nothing beyond Node's built-ins. Every helper it needs lives here, because AAP 0.12.1
 * gives `tests/helpers/` exactly two members and neither of them is this suite's.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { describe, it } from 'node:test';

/*
 * The repository root is found by walking up from this file until `package.json` sits there, so the
 * suite behaves the same whether `node --test` is started from the root, from `tests/`, or by the
 * harness from another working directory. A root that cannot be found fails here, at load, naming
 * the directory the walk started from: every scan below would otherwise read an empty tree and
 * report a pass.
 */
const ROOT: string = findRepoRoot();

/**
 * The files this suite cannot scan the tree without: its own declared dependencies plus the roots
 * and entry points every scan reads (AAP 0.12.1, 0.13.3). Each is reported by absolute path when
 * absent, because a missing root is what makes a scan vacuous.
 *
 * `src/layouts/` is deliberately absent from this list. The plan generates it in another lane of
 * the same run, so it may not exist yet in a checkout that holds this file; requiring it would fail
 * the suite on a tree state this file does not own, while proving nothing about the scans, whose
 * `.astro` walk covers `src/` recursively and therefore covers the layout root the moment it
 * appears.
 */
const REQUIRED_PATHS: readonly string[] = [
  'package.json',
  'tsconfig.json',
  '.gitignore',
  '.env.example',
  'astro.config.mjs',
  'src',
  'src/content',
  'src/components',
  'src/lib',
  'src/pages',
  'src/styles/theme.css',
  'src/illustrations',
  'src/illustrations/panels',
  'src/illustrations/panels/top.svg',
  'src/lib/env.ts',
  'src/pages/sitemap.xml.ts',
  'public',
  'tests',
  'tests/fixtures',
  'tests/fixtures/website-content-specification.md',
  'tests/fixtures/figma-residue.json',
  'tests/fixtures/vendor-names.json',
];

/** The single token definition site (AAP 0.6.1, 0.6.6): the one file allowed to state a value. */
const TOKEN_FILE = 'src/styles/theme.css';

/**
 * The authored illustrations are exempt from the colour and length scans, and only they: an SVG
 * file has no CSS cascade to consume a token from, so its presentation attributes are literal hex by
 * design (AAP 0.2.2, 0.6.6).
 */
const ILLUSTRATIONS_PREFIX = 'src/illustrations/';

/** The three files `npm run assets` writes into `public/`; all git-ignored, all regenerated (0.4.2). */
const GENERATED_PUBLIC_FILES: readonly string[] = [
  'public/favicon.svg',
  'public/og-image.png',
  'public/apple-touch-icon.png',
];

/** The owner's drop point for the three product screens (0.12.1, 0.16.2). */
const SCREEN_DIRECTORY = 'public/screens';
const SCREEN_FILES: readonly string[] = [
  `${SCREEN_DIRECTORY}/investigate.png`,
  `${SCREEN_DIRECTORY}/compare.png`,
  `${SCREEN_DIRECTORY}/audit.png`,
];

/** The review aid's output folder, which `.gitignore` carries and no commit may reach (0.13.6). */
const SCREENSHOTS_DIRECTORY = 'screenshots/';

/** Raster extensions: a tracked file with one of these is a committed image (WT-08, rule W-1). */
const RASTER_PATTERN = /\.(?:png|jpe?g|gif|webp|avif|bmp|tiff?|ico)$/i;

/**
 * Binary extensions the text scans skip, with the reason each is safe to skip: none of these can
 * carry a colour literal in a style context, a credential, a hook or a URI in a form a text scan
 * would read, and decoding them as UTF-8 would only produce noise matches. The list is also
 * followed by a content check — a file holding a NUL byte is binary whatever its extension — and
 * every skipped file is named in a failure message, so a skip is never silent.
 */
const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.ico',
  '.bmp',
  '.tif',
  '.tiff',
  '.pdf',
  '.zip',
  '.gz',
  '.br',
  '.wasm',
  '.mp4',
  '.webm',
  '.mp3',
]);

/** Style sources: the only places a length or a colour can stand in a style context (0.6.6). */
const STYLE_EXTENSIONS: ReadonlySet<string> = new Set(['.astro', '.css', '.html']);

/** The four configuration names rule B-2 documents, and the only ones `src/` may mention (0.9.6). */
const CONFIGURATION_VARIABLES: readonly string[] = [
  'PUBLIC_FORM_ENDPOINT',
  'PUBLIC_CONTACT_EMAIL',
  'PUBLIC_SITE_URL',
  'PUBLIC_SITE_LIVE',
];

/** The one absolute URI a source file may hold: the namespace a sitemap 0.9 document declares. */
const SITEMAP_NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9';

/** The fixture paths and names that no file under `src/` may reference (AAP 0.8.2, 0.12.1). */
const FIXTURE_REFERENCES: readonly string[] = [
  'tests/fixtures',
  'website-content-specification.md',
  'figma-residue.json',
  'vendor-names.json',
];

/** The adapter packages `astro.config.mjs` must not import, since static output has no adapter. */
const ADAPTER_PACKAGES =
  /@astrojs\/(?:node|vercel|netlify|cloudflare|deno|aws-lambda|alibaba-cloud|azure|google-cloud)\b/;

/** One tracked or built file read as text. */
interface TextSource {
  /** Repository-relative POSIX path for a tracked file; the built directory's path otherwise. */
  readonly path: string;
  readonly text: string;
}

/** What one scan visited, what it skipped as binary, and every hit it found. */
interface ScanResult {
  readonly visited: readonly string[];
  readonly skipped: readonly string[];
  readonly hits: readonly string[];
}

/**
 * Walks up from this file's directory to the first directory holding `package.json`.
 *
 * `import.meta.dirname` is the starting point rather than `process.cwd()`, so the suite finds the
 * same root however it is invoked. Reaching the filesystem root without a `package.json` throws,
 * naming the directory the walk began in.
 */
function findRepoRoot(): string {
  const start = import.meta.dirname;
  let directory = start;

  for (;;) {
    if (existsSync(join(directory, 'package.json'))) {
      return directory;
    }
    const parent = dirname(directory);
    if (parent === directory) {
      throw new Error(
        `source.test.ts: no package.json was found above ${start}, so the repository root is unknown and nothing can be scanned.`,
      );
    }
    directory = parent;
  }
}

/** The tracked file list, memoised: one `git ls-files -z` per process. */
let trackedFileCache: readonly string[] | null = null;

/**
 * Every path git tracks, repository-relative and POSIX-separated.
 *
 * `git ls-files` is the definition of "tracked" this suite needs, and it is the only source for it:
 * a `find` walk would report files that are ignored, which would fail on the generated images in
 * `public/` and on `.build/` output, and would silently change what every scan means. A git that is
 * missing or exits non-zero fails here, naming the command and its status.
 */
function trackedFiles(): readonly string[] {
  if (trackedFileCache !== null) {
    return trackedFileCache;
  }

  let raw: string;
  try {
    raw = execFileSync('git', ['ls-files', '-z'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const status =
      typeof error === 'object' && error !== null && 'status' in error ? String(error.status) : 'none';
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `source.test.ts: \`git ls-files -z\` failed in ${ROOT} (exit status ${status}): ${detail}`,
    );
  }

  trackedFileCache = raw.split('\0').filter((path) => path.length > 0);
  return trackedFileCache;
}

/** Whether `relativePath` is one of `prefixes` or sits beneath one of them. */
function isUnder(relativePath: string, prefix: string): boolean {
  return relativePath === prefix || relativePath.startsWith(prefix);
}

/** Whether a tracked path is a style source the token scan must cover (0.6.6). */
function isStyleSource(relativePath: string): boolean {
  if (isUnder(relativePath, ILLUSTRATIONS_PREFIX) || relativePath === TOKEN_FILE) {
    return false;
  }
  return STYLE_EXTENSIONS.has(extname(relativePath).toLowerCase());
}

/** Whether a file's own extension already marks it as binary, so its bytes are never decoded. */
function hasBinaryExtension(relativePath: string): boolean {
  return BINARY_EXTENSIONS.has(extname(relativePath).toLowerCase());
}

/** Absolute path of a repository-relative path. */
function absolute(relativePath: string): string {
  return join(ROOT, relativePath);
}

/** Reads a tracked file as UTF-8 text, failing with the absolute path when it cannot be read. */
function readTrackedText(relativePath: string): string {
  const path = absolute(relativePath);
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`source.test.ts: cannot read the tracked file ${path}: ${detail}`);
  }
  return text;
}

/** Reads a file as bytes, failing with the absolute path when it cannot be read. */
function readBytes(path: string): Buffer {
  try {
    return readFileSync(path);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`source.test.ts: cannot read ${path}: ${detail}`);
  }
}

/** The 1-indexed line a character offset falls on, for a failure message. */
function lineOf(text: string, index: number): number {
  let line = 1;
  for (let cursor = 0; cursor < index && cursor < text.length; cursor += 1) {
    if (text.charCodeAt(cursor) === 10) {
      line += 1;
    }
  }
  return line;
}

/** The whole line a match sits on, trimmed and bounded, so a failure quotes what to change. */
function excerptAt(text: string, index: number): string {
  const start = text.lastIndexOf('\n', index - 1) + 1;
  const end = text.indexOf('\n', index);
  const line = text.slice(start, end === -1 ? text.length : end).trim();
  return line.length > 180 ? `${line.slice(0, 177)}...` : line;
}

/*
 * Masking, not stripping. Every scan below matches a **view** of a file in which the parts that are
 * not code — comments, and for markup the frontmatter and any inline `<script>` body — have been
 * replaced by spaces. A view is the same length as its file and keeps every line break, so a match's
 * offset is the file's own offset: a failure quotes the line number a reader will find in their
 * editor, and the excerpt it prints is the untouched source line.
 *
 * A comment is prose. `rgb()`, a hex colour, `process.env` or a variable's name discussed in a
 * docblock is not a style value, not a hook and not a credential, so no scan reads one as a hit.
 * String literals are left untouched — that is what the quote tracking is for — because a value
 * inside a string is code. A single- or double-quoted literal cannot span a newline in JavaScript,
 * so an apostrophe in prose closes at the end of its line instead of swallowing the rest of a file.
 */

/** A half-open character range: `[start, end)`. */
type Range = readonly [start: number, end: number];

/** Replaces every character in `ranges` with a space, keeping line breaks so offsets do not move. */
function mask(text: string, ranges: readonly Range[]): string {
  if (ranges.length === 0) {
    return text;
  }
  const characters = text.split('');
  for (const [start, end] of ranges) {
    for (let index = start; index < end && index < characters.length; index += 1) {
      const character = characters[index];
      if (character !== '\n' && character !== '\r') {
        characters[index] = ' ';
      }
    }
  }
  return characters.join('');
}

/** The ranges JavaScript or TypeScript comments occupy between `from` and `to`. */
function jsCommentRanges(text: string, from = 0, to = text.length): Range[] {
  const ranges: Range[] = [];
  let index = from;
  let quote: string | null = null;

  while (index < to) {
    const character = text[index] as string;
    const next = text[index + 1];

    if (quote !== null) {
      if (character === '\\') {
        index += 2;
        continue;
      }
      if (character === quote || ((quote === '"' || quote === "'") && character === '\n')) {
        quote = null;
      }
      index += 1;
      continue;
    }

    if (character === '"' || character === "'" || character === '`') {
      quote = character;
      index += 1;
      continue;
    }
    if (character === '/' && next === '/') {
      const start = index;
      while (index < to && text[index] !== '\n') {
        index += 1;
      }
      ranges.push([start, index]);
      continue;
    }
    if (character === '/' && next === '*') {
      const start = index;
      index += 2;
      while (index < to && !(text[index] === '*' && text[index + 1] === '/')) {
        index += 1;
      }
      index = Math.min(to, index + 2);
      ranges.push([start, index]);
      continue;
    }
    index += 1;
  }

  return ranges;
}

/** The ranges a stylesheet's block comments occupy. */
function cssCommentRanges(text: string): Range[] {
  const ranges: Range[] = [];
  for (const match of text.matchAll(/\/\*[\s\S]*?\*\//g)) {
    if (match.index === undefined) {
      continue;
    }
    ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges;
}

/** The ranges `<!-- … -->` comments occupy in markup, Markdown and SVG. */
function htmlCommentRanges(text: string): Range[] {
  const ranges: Range[] = [];
  for (const match of text.matchAll(/<!--[\s\S]*?-->/g)) {
    if (match.index === undefined) {
      continue;
    }
    ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges;
}

/**
 * The ranges inline `<script>` elements occupy from `from` on. The scan targets are markup, a
 * stylesheet or a document: JavaScript inside an island follows its own rules and is not an
 * attribute, so a `style` assignment in a script is not the `style` attribute this suite looks for.
 */
function scriptRanges(text: string, from = 0): Range[] {
  const ranges: Range[] = [];
  for (const match of text.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/gi)) {
    if (match.index === undefined || match.index < from) {
      continue;
    }
    ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges;
}

/** The ranges HTML character references occupy: `&#8217;` is an entity, not a hex colour. */
function characterReferenceRanges(text: string): Range[] {
  const ranges: Range[] = [];
  for (const match of text.matchAll(/&#[0-9]+;|&#[xX][0-9a-fA-F]+;|&[a-zA-Z][a-zA-Z0-9]*;/g)) {
    if (match.index === undefined) {
      continue;
    }
    ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges;
}

/** Where an `.astro` file's frontmatter sits: its code starts at `codeStart`, markup at `markupStart`. */
interface FrontmatterBounds {
  readonly codeStart: number;
  readonly markupStart: number;
}

/**
 * The bounds of an `.astro` file's frontmatter, or `null` for a file with none.
 *
 * Astro's frontmatter is the region between a line holding `---` at the top of the file and the
 * next line holding `---` alone. Everything after that second fence is markup; everything before it
 * is TypeScript, and the two are cleaned by different rules.
 */
function frontmatterBounds(text: string): FrontmatterBounds | null {
  if (!text.startsWith('---')) {
    return null;
  }
  const closing = /\r?\n---[ \t]*(?:\r?\n|$)/.exec(text.slice(3));
  if (closing === null) {
    return null;
  }
  const fenceStart = 3 + closing.index;
  return { codeStart: 3, markupStart: fenceStart + closing[0].length };
}

/**
 * The view a colour, hook, fixture or host scan reads: the file's code, with comments blanked.
 *
 * Which syntax supplies the comment ranges depends on the file's own extension, so a docblock in a
 * component, a comment in a stylesheet and a comment in a document are each recognised as prose.
 */
function colourView(source: TextSource): string {
  const extension = extname(source.path).toLowerCase();
  const ranges: Range[] = [];

  if (extension === '.astro') {
    const frontmatter = frontmatterBounds(source.text);
    if (frontmatter !== null) {
      ranges.push(...jsCommentRanges(source.text, frontmatter.codeStart, frontmatter.markupStart));
    }
    ranges.push(...htmlCommentRanges(source.text));
  } else if (extension === '.css') {
    ranges.push(...cssCommentRanges(source.text));
  } else if (extension === '.ts' || extension === '.mts' || extension === '.mjs' || extension === '.js') {
    ranges.push(...jsCommentRanges(source.text));
  } else {
    ranges.push(...htmlCommentRanges(source.text));
  }

  ranges.push(...characterReferenceRanges(source.text));
  return mask(source.text, ranges);
}

/** The view a length or attribute scan reads from a markup file, or `null` if it is not markup. */
function markupView(source: TextSource): string | null {
  const extension = extname(source.path).toLowerCase();
  const ranges: Range[] = [];
  let markupStart = 0;

  if (extension === '.astro') {
    const frontmatter = frontmatterBounds(source.text);
    if (frontmatter !== null) {
      /* The whole frontmatter is blanked: it is TypeScript, not markup. */
      ranges.push([0, frontmatter.markupStart]);
      markupStart = frontmatter.markupStart;
    }
  } else if (extension !== '.html') {
    return null;
  }

  for (const range of htmlCommentRanges(source.text)) {
    if (range[0] >= markupStart) {
      ranges.push(range);
    }
  }
  ranges.push(...scriptRanges(source.text, markupStart));
  return mask(source.text, ranges);
}

/** The view a length scan reads: a document's markup, or a stylesheet with its comments blanked. */
function styleView(source: TextSource): string {
  const markup = markupView(source);
  return markup ?? mask(source.text, cssCommentRanges(source.text));
}

/** The view that reads a file exactly as it stands: used where a comment could hold the hit. */
function rawView(source: TextSource): string {
  return source.text;
}

/**
 * Every match of `pattern` in the view of `sources`, formatted as `path:line: <the source line>`.
 *
 * The match runs against the view, but the line number and the excerpt come from the file itself,
 * which the view mirrors character for character, so a failure points at the line to change.
 */
function findHits(
  pattern: RegExp,
  sources: readonly TextSource[],
  view: (source: TextSource) => string | null,
  accept?: (match: RegExpExecArray, source: TextSource, text: string) => boolean,
): string[] {
  const global = new RegExp(
    pattern.source,
    pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`,
  );
  const hits: string[] = [];

  for (const source of sources) {
    const text = view(source);
    if (text === null) {
      continue;
    }
    for (const match of text.matchAll(global)) {
      if (match.index === undefined) {
        continue;
      }
      if (accept !== undefined && !accept(match, source, text)) {
        continue;
      }
      hits.push(
        `${source.path}:${lineOf(source.text, match.index)}: ${excerptAt(source.text, match.index)}`,
      );
    }
  }

  return hits;
}

/** Fails with every hit at once, and with the visited/skipped counts, so no hit hides a second. */
function assertNoHits(result: ScanResult, label: string): void {
  assert.ok(
    result.visited.length > 0,
    `${label}: the scan visited no file at all, so it proves nothing (repository root ${ROOT}).`,
  );

  const skipped =
    result.skipped.length === 0
      ? ''
      : `\n${result.skipped.length} binary file(s) skipped by extension or NUL byte: ${result.skipped.join(', ')}`;

  assert.deepEqual(
    [...result.hits],
    [],
    `${label}: ${result.hits.length} hit(s) in ${result.visited.length} file(s)\n${result.hits.join('\n')}${skipped}`,
  );
}

/** Assembles one scan's result from the files it visited, the binaries it skipped and its hits. */
function resultOf(
  visited: readonly string[],
  skipped: readonly string[],
  hits: readonly string[],
): ScanResult {
  return { visited, skipped, hits };
}

/** Every tracked file read as text, plus the binaries the text scans skip, memoised. */
interface TrackedTree {
  readonly text: readonly TextSource[];
  readonly binaries: readonly string[];
}

let trackedTreeCache: TrackedTree | null = null;

/**
 * Reads every tracked file once per process.
 *
 * A file is skipped as binary only when its extension is one of `BINARY_EXTENSIONS` or its bytes
 * hold a NUL — the two cases a text scan cannot read — and every skipped path is carried into a
 * failure message, so a skip is reported rather than silent.
 */
function trackedTree(): TrackedTree {
  if (trackedTreeCache !== null) {
    return trackedTreeCache;
  }

  const text: TextSource[] = [];
  const binaries: string[] = [];

  for (const path of trackedFiles()) {
    if (hasBinaryExtension(path)) {
      binaries.push(path);
      continue;
    }
    const bytes = readBytes(absolute(path));
    if (bytes.includes(0)) {
      binaries.push(path);
      continue;
    }
    text.push({ path, text: bytes.toString('utf8') });
  }

  trackedTreeCache = { text, binaries };
  return trackedTreeCache;
}

/** Every tracked file that reads as text. */
function trackedText(): readonly TextSource[] {
  return trackedTree().text;
}

/** The tracked files the text scans cannot read, reported in any failure message. */
function skippedTrackedBinaries(): readonly string[] {
  return trackedTree().binaries;
}

/** The tracked text files under one repository-relative prefix. */
function trackedUnder(prefix: string): readonly TextSource[] {
  return trackedText().filter((source) => source.path.startsWith(prefix));
}

/** The tracked files the token scan must cover: every style source outside the two exemptions. */
function trackedStyleSources(): readonly TextSource[] {
  return trackedText().filter((source) => isStyleSource(source.path));
}

/** Directory names no walk descends into: dependency trees, git internals and Astro's cache. */
const UNWALKED_DIRECTORIES: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  '.astro',
  '.build',
]);

/** One directory walked for text files, with the binaries it held. */
interface WalkedDirectory {
  readonly text: readonly TextSource[];
  readonly binaries: readonly string[];
}

/**
 * Walks `directory` for text files without following symbolic links.
 *
 * The build harness symlinks `node_modules` into its temporary project copies, so following a link
 * would drag a dependency tree into a scan whose subject is the product. Pruning that by name, and
 * skipping any symbolic link outright, keeps the walk inside the files it was asked about.
 */
function walkTextFiles(directory: string): WalkedDirectory {
  const text: TextSource[] = [];
  const binaries: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (UNWALKED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      const nested = walkTextFiles(path);
      text.push(...nested.text);
      binaries.push(...nested.binaries);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (hasBinaryExtension(entry.name)) {
      binaries.push(path);
      continue;
    }
    const bytes = readBytes(path);
    if (bytes.includes(0)) {
      binaries.push(path);
      continue;
    }
    text.push({ path, text: bytes.toString('utf8') });
  }

  return { text, binaries };
}

/**
 * The built directories that exist in this checkout, as absolute paths.
 *
 * `dist/` is the publishable artefact and `.build/<configuration>/` is where the harness writes each
 * configuration (AAP 0.13.2). A directory counts as a build only when it holds a file a build emits,
 * which keeps a fontconfig cache or an interrupted copy out of the scan. A checkout with no build is
 * a normal state — `npm run test:static` also runs before anything is built — so an empty list is
 * not a failure, and the tracked half of every scan still runs.
 */
function builtDirectories(): readonly string[] {
  const directories: string[] = [];
  const dist = absolute('dist');
  if (existsSync(dist) && statSync(dist).isDirectory()) {
    directories.push(dist);
  }

  const outRoot = absolute('.build');
  if (existsSync(outRoot) && statSync(outRoot).isDirectory()) {
    for (const entry of readdirSync(outRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        continue;
      }
      const candidate = join(outRoot, entry.name);
      const emitsBuildOutput = ['index.html', '404.html', 'sitemap.xml', 'robots.txt'].some((file) =>
        existsSync(join(candidate, file)),
      );
      if (emitsBuildOutput) {
        directories.push(candidate);
      }
    }
  }

  return directories;
}

/** Every built file that reads as text, plus the binaries skipped among them. */
function builtText(): WalkedDirectory {
  const text: TextSource[] = [];
  const binaries: string[] = [];
  for (const directory of builtDirectories()) {
    const walked = walkTextFiles(directory);
    text.push(...walked.text);
    binaries.push(...walked.binaries);
  }
  return { text, binaries };
}

/** Every file path under `directory`, POSIX-relative, without following symbolic links. */
function walkPaths(directory: string, prefix = ''): string[] {
  const paths: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      continue;
    }
    const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!UNWALKED_DIRECTORIES.has(entry.name)) {
        paths.push(...walkPaths(join(directory, entry.name), relativePath));
      }
      continue;
    }
    if (entry.isFile()) {
      paths.push(relativePath);
    }
  }
  return paths;
}

/** Whether a path is a licence text: it sits in a `licenses` directory or is an OFL file. */
function isLicencePath(path: string): boolean {
  return path.split('/').includes('licenses') || /OFL/i.test(basename(path));
}

/*
 * The colour scan's two pattern families. A hex literal of three to eight digits and any of the
 * colour functions break "one definition per token" wherever they stand, and the token file plus the
 * authored illustrations are the only two exemptions (AAP 0.2.2, 0.6.6).
 */
const HEX_COLOUR_PATTERN = /#[0-9a-fA-F]{3,8}\b/;
const COLOUR_FUNCTION_PATTERN = /\b(?:rgba?|hsla?|color-mix|oklch)\(/;

/*
 * A raw length. The plan admits exactly `0`, `none`, `auto`, `inherit`, `currentColor` and
 * `transparent` as literals, so any other figure carrying `px` is a value that belongs in the token
 * file (AAP 0.2.2, 0.6.6).
 */
const PX_PATTERN = /\d+(?:\.\d+)?px/;

/*
 * A `style` attribute and a `<style>` element. A hash-only policy covers inline <style> elements but
 * not attributes, which would need `'unsafe-hashes'` and are therefore refused outright
 * (AAP 0.4.5); 0.17.2 folds the two into the same check.
 */
const STYLE_ATTRIBUTE_PATTERN = /\sstyle\s*=/;
const STYLE_ELEMENT_PATTERN = /<style\b/i;

/**
 * The tracked files the colour scan reads: every text file outside the two exemptions. The token
 * file is the one place a value may be stated, and the authored illustrations have no CSS cascade
 * to consume a token from, so both are outside the scan by design and are asserted to stay outside
 * it below (AAP 0.2.2, 0.6.6).
 */
function trackedColourSources(): readonly TextSource[] {
  return trackedText().filter(
    (source) => source.path !== TOKEN_FILE && !isUnder(source.path, ILLUSTRATIONS_PREFIX),
  );
}

/** The tracked text files under one prefix, matched against the code view, with its binaries. */
function prefixScan(prefix: string, patterns: readonly RegExp[]): ScanResult {
  const sources = trackedUnder(prefix);
  const hits = patterns.flatMap((pattern) => findHits(pattern, sources, colourView));
  return resultOf(
    sources.map((source) => source.path),
    skippedTrackedBinaries().filter((path) => path.startsWith(prefix)),
    hits,
  );
}

/** One colour-pattern scan over every tracked text file outside the two exemptions (0.6.6). */
function colourScan(pattern: RegExp): ScanResult {
  const sources = trackedColourSources();
  return resultOf(
    sources.map((source) => source.path),
    skippedTrackedBinaries(),
    findHits(pattern, sources, colourView),
  );
}

/** The raw-length scan over every style source outside the two exemptions (0.6.6). */
function lengthScan(): ScanResult {
  const sources = trackedStyleSources();
  return resultOf(
    sources.map((source) => source.path),
    skippedTrackedBinaries(),
    findHits(PX_PATTERN, sources, styleView),
  );
}

/** The `style` attribute and `<style>` element scan over every markup source (0.4.5). */
function attributeScan(): ScanResult {
  const sources = trackedMarkupSources();
  const hits = [
    ...findHits(STYLE_ATTRIBUTE_PATTERN, sources, markupView),
    ...findHits(STYLE_ELEMENT_PATTERN, sources, markupView),
  ];
  return resultOf(
    sources.map((source) => source.path),
    skippedTrackedBinaries(),
    hits,
  );
}

/** The tracked markup files the attribute scan reads: every component, layout, page and document. */
function trackedMarkupSources(): readonly TextSource[] {
  return trackedText().filter((source) => {
    if (isUnder(source.path, ILLUSTRATIONS_PREFIX)) {
      return false;
    }
    const extension = extname(source.path).toLowerCase();
    return extension === '.astro' || extension === '.html';
  });
}

/** One credential pattern, named so a failure says which kind of secret it found. */
interface SecretPattern {
  readonly name: string;
  readonly pattern: RegExp;
}

/**
 * The credential shapes the scan looks for.
 *
 * Each provider prefix carries a minimum body length. A bare `sk-` matches ordinary prose — the word
 * "risk-aware" holds those three characters — so a prefix only identifies a credential together
 * with the length and alphabet the provider issues; every one of these bodies is far longer than any
 * word that could contain the prefix by accident.
 */
const SECRET_PATTERNS: readonly SecretPattern[] = [
  { name: 'a private-key header', pattern: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/ },
  { name: 'an AWS access-key id', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  {
    name: 'a GitHub token',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,})\b/,
  },
  { name: 'a Slack token', pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'an OpenAI-style key', pattern: /\bsk-[A-Za-z0-9_-]{16,}/ },
  { name: 'an npm token', pattern: /\bnpm_[A-Za-z0-9]{36}\b/ },
  { name: 'a Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  {
    name: 'an Authorization header with a value',
    pattern: /\bAuthorization\b\s*[:=]\s*["'`]?[^\s"'`]{8,}/,
  },
];

/** The secret scan's corpus: every tracked text file and every built text file, memoised. */
interface SecretCorpus {
  readonly sources: readonly TextSource[];
  readonly visited: readonly string[];
  readonly skipped: readonly string[];
}

let secretCorpusCache: SecretCorpus | null = null;

function secretCorpus(): SecretCorpus {
  if (secretCorpusCache !== null) {
    return secretCorpusCache;
  }
  const built = builtText();
  const sources = [...trackedText(), ...built.text];
  secretCorpusCache = {
    sources,
    visited: sources.map((source) => source.path),
    skipped: [...skippedTrackedBinaries(), ...built.binaries],
  };
  return secretCorpusCache;
}

/** Every hit of one named credential shape across the tracked and built corpus. */
function secretScan(secret: SecretPattern): ScanResult {
  const corpus = secretCorpus();
  /*
   * The secret scan reads each file exactly as it stands: a credential written into a comment is
   * committed just the same, so comments are no exemption here the way they are for a style value.
   */
  return resultOf(corpus.visited, corpus.skipped, findHits(secret.pattern, corpus.sources, rawView));
}

/**
 * The high-entropy base64 scan, with the one carve-out the corpus needs.
 *
 * `package-lock.json` carries `"integrity": "sha512-…"`, `"shasum": "…"` and `"resolved": "…"`
 * values holding the registry's own addresses. Those are public, deterministic registry digests and
 * public registry URLs, not credentials, and a lockfile must be committed with them.
 * The suppression is therefore **value-scoped**: a run is forgiven only when the characters
 * immediately before it are a `sha512-`, `sha256-` or `sha1-` prefix, or when it sits inside an
 * `integrity`, `shasum` or `resolved` value on that line. The lockfile stays in the scan — never a
 * file-scoped exclusion, which would be the narrowing this suite must not do.
 */
function highEntropyScan(): ScanResult {
  const corpus = secretCorpus();
  const run = /[A-Za-z0-9+/]{40,}={0,2}/g;
  const hits: string[] = [];

  for (const source of corpus.sources) {
    for (const match of source.text.matchAll(run)) {
      if (match.index === undefined) {
        continue;
      }
      const value = match[0];
      if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/[0-9]/.test(value)) {
        continue;
      }
      const lineStart = source.text.lastIndexOf('\n', match.index - 1) + 1;
      const before = source.text.slice(lineStart, match.index);
      const digestPrefixed = /sha(?:512|256|1)-$/.test(before);
      const registryValue = /"(?:integrity|resolved|shasum)"\s*:\s*"[^"]*$/.test(before);
      if (digestPrefixed || registryValue) {
        continue;
      }
      hits.push(`${source.path}:${lineOf(source.text, match.index)}: ${excerptAt(source.text, match.index)}`);
    }
  }

  return resultOf(corpus.visited, corpus.skipped, hits);
}

/** The files under `src/` that actually read `process.env`, comments excluded (rule B-2). */
function filesReadingProcessEnv(): readonly string[] {
  return trackedUnder('src/')
    .filter((source) => colourView(source).includes('process.env'))
    .map((source) => source.path);
}

/**
 * Every `PUBLIC_…` token named anywhere under `src/`, checked against the four the plan documents.
 *
 * This scan reads raw text rather than the code view: a docblock that names one of the four
 * variables is documentation and the allowlist passes it, while an undocumented fifth name is a
 * configuration surface nobody declared and fails wherever it is written (AAP 0.9.1, 0.9.6).
 */
function configurationNameScan(): ScanResult {
  const sources = trackedUnder('src/');
  const hits: string[] = [];

  for (const source of sources) {
    for (const match of source.text.matchAll(/\bPUBLIC_[A-Z0-9_]+/g)) {
      if (CONFIGURATION_VARIABLES.includes(match[0])) {
        continue;
      }
      hits.push(`${source.path}:${lineOf(source.text, match.index)}: ${match[0]}`);
    }
  }

  return resultOf(
    sources.map((source) => source.path),
    skippedTrackedBinaries().filter((path) => path.startsWith('src/')),
    hits,
  );
}

/**
 * The absolute-URI scan over `src/` and `scripts/` (rule B-1, WT-03 source side).
 *
 * Two exemptions and no others. The sitemap's XML namespace is a schema identifier the document must
 * declare; and a URI standing in an `xmlns` or `xmlns:*` attribute is an XML namespace name that no
 * browser resolves to a host, which WT-03 itself excludes. Everything else — a font CDN, an icon
 * CDN, an analytics endpoint, a remote image — fails here. `mailto:` is not an absolute `http(s)`
 * URI and is not matched: the footer's mailto link is assembled from a configured address at build
 * time and names no host in the source.
 */
function hostScan(): ScanResult {
  const sources = [...trackedUnder('src/'), ...trackedUnder('scripts/')];
  const absoluteUri = /https?:\/\/[^\s"'`<>)\]}]+/;
  const hits = findHits(absoluteUri, sources, colourView, (match, _source, text) => {
    if (match[0] === SITEMAP_NAMESPACE) {
      return false;
    }
    const index = match.index ?? 0;
    const before = text.slice(Math.max(0, index - 48), index);
    return !/xmlns(?::[A-Za-z0-9_-]+)?\s*=\s*["']$/.test(before);
  });

  return resultOf(
    sources.map((source) => source.path),
    skippedTrackedBinaries().filter(
      (path) => path.startsWith('src/') || path.startsWith('scripts/'),
    ),
    hits,
  );
}

/**
 * The absence of a server in the build configuration (rule W-2).
 *
 * The check reads `astro.config.mjs` through the code view and looks for the three things that would
 * make the output non-static: an `adapter` option, an import of an `@astrojs` adapter package, or a
 * middleware reference. The positive assertion beside it — that the config declares
 * `output: 'static'` — is what keeps the absence meaningful.
 */
function configScan(): ScanResult {
  const path = 'astro.config.mjs';
  const sources: readonly TextSource[] = [{ path, text: readTrackedText(path) }];
  const hits = [
    ...findHits(/\badapter\s*:/, sources, colourView),
    ...findHits(ADAPTER_PACKAGES, sources, colourView),
    ...findHits(/\bmiddleware\b/, sources, colourView),
  ];
  return resultOf([path], [], hits);
}

/** Whether the build configuration declares static output. */
function declaresStaticOutput(): boolean {
  const text = readTrackedText('astro.config.mjs');
  return /\boutput\s*:\s*['"]static['"]/.test(colourView({ path: 'astro.config.mjs', text }));
}

describe('the tree these scans read', () => {
  it('resolves the repository root and finds this suite at its own path', () => {
    assert.ok(
      existsSync(join(ROOT, 'package.json')),
      `source.test.ts: the resolved root ${ROOT} holds no package.json, so every scan would read an empty tree.`,
    );
    assert.ok(
      existsSync(join(ROOT, 'tests', 'static', 'source.test.ts')),
      `source.test.ts: the resolved root ${ROOT} does not hold tests/static/source.test.ts, so the walk up from ${import.meta.dirname} landed somewhere else.`,
    );
  });

  it('holds every root and dependency the scans read', () => {
    const missing = REQUIRED_PATHS.filter((path) => !existsSync(absolute(path)));
    assert.deepEqual(
      missing,
      [],
      `source.test.ts: ${missing.length} path(s) the scans read are absent from ${ROOT}:\n${missing
        .map((path) => `  ${absolute(path)}`)
        .join('\n')}`,
    );
  });

  it('takes the tracked file list from git rather than from a directory walk', () => {
    const files = trackedFiles();
    assert.ok(
      files.length > 0,
      `source.test.ts: \`git ls-files\` reported no tracked file in ${ROOT}, so every scan below would pass over an empty tree.`,
    );
    assert.ok(
      files.includes('package.json') && files.includes('src/lib/env.ts'),
      `source.test.ts: the tracked list from ${ROOT} does not hold the project's own files.`,
    );
    const notPosix = files.filter((path) => path.startsWith('/') || path.includes('\\'));
    assert.deepEqual(
      notPosix,
      [],
      `source.test.ts: tracked paths are expected repository-relative and POSIX-separated, and these are not:\n${notPosix.join('\n')}`,
    );
  });
});

describe('WT-08 — no raster image and no generated asset is tracked', () => {
  it('WT-08: no raster image is tracked', () => {
    const rasters = trackedFiles().filter((path) => RASTER_PATTERN.test(path));
    assert.deepEqual(
      rasters,
      [],
      `WT-08: ${rasters.length} raster image(s) are tracked. Rule W-1 keeps every Figma photograph, logo and export out of the repository, and the only PNGs the site publishes are the ones the build generates into git-ignored paths (AAP 0.13.7):\n${rasters.join('\n')}`,
    );
  });

  it('WT-08: the three files npm run assets generates are not tracked', () => {
    const tracked = trackedFiles();
    const offenders = GENERATED_PUBLIC_FILES.filter((path) => tracked.includes(path));
    assert.deepEqual(
      offenders,
      [],
      `WT-08: ${offenders.length} build-generated file(s) are tracked. \`npm run assets\` writes them on every build and .gitignore keeps them out of version control, so the source tree carries no raster (AAP 0.4.2):\n${offenders.join('\n')}`,
    );
  });

  it('WT-08: public/screens/.gitkeep is tracked so the owner drop point survives a clone', () => {
    assert.ok(
      trackedFiles().includes(`${SCREEN_DIRECTORY}/.gitkeep`),
      `WT-08: ${SCREEN_DIRECTORY}/.gitkeep is not tracked, so a clone would lose the directory the owner drops the three product screens into (AAP 0.12.1).`,
    );
  });

  it('WT-08: no product-screen PNG waits in public/screens/', () => {
    const present = SCREEN_FILES.filter((path) => existsSync(absolute(path)));
    assert.deepEqual(
      present,
      [],
      `WT-08: ${present.length} product-screen PNG(s) sit in the working tree. This suite never builds the \`screens\` configuration, so each of these is either an owner-supplied screen that belongs in the deployment checkout, or a probe left behind by an interrupted run (AAP 0.13.7):\n${present
        .map((path) => absolute(path))
        .join('\n')}`,
    );
  });

  it('WT-08: no review screenshot is tracked', () => {
    const tracked = trackedFiles().filter((path) => path.startsWith(SCREENSHOTS_DIRECTORY));
    assert.deepEqual(
      tracked,
      [],
      `WT-08: ${tracked.length} file(s) under ${SCREENSHOTS_DIRECTORY} are tracked. The sixteen review PNGs are a git-ignored review aid, not a committed artefact (AAP 0.13.6):\n${tracked.join('\n')}`,
    );
  });
});

describe('B-2 — the configuration surface stays in the environment', () => {
  it('B-2: no .env file other than .env.example is tracked', () => {
    const envFiles = trackedFiles().filter((path) => basename(path).startsWith('.env'));
    assert.deepEqual(
      envFiles,
      ['.env.example'],
      `B-2: the tracked .env files are ${JSON.stringify(envFiles)}, and exactly ['.env.example'] is expected. A committed .env carries whatever the owner's machine held, and .gitignore excludes every other .env* file (AAP 0.9.4).`,
    );
  });

  it('B-2: process.env is read in exactly one module, src/lib/env.ts', () => {
    const readers = filesReadingProcessEnv();
    assert.deepEqual(
      readers,
      ['src/lib/env.ts'],
      `B-2: process.env is read in ${readers.length} file(s) under src/, and exactly src/lib/env.ts is the planned single reader (AAP 0.9.1, 0.9.6). Every extra reader is a second owner of configuration:\n${readers.join('\n')}`,
    );
  });

  it('B-2: only the four documented variables are named under src/', () => {
    const scan = configurationNameScan();
    assert.ok(
      scan.visited.length > 0,
      `B-2: no file under src/ was scanned, so the variable allowlist proves nothing (repository root ${ROOT}).`,
    );
    assertNoHits(
      scan,
      `B-2: an undocumented configuration name is used under src/. The documented surface is exactly ${CONFIGURATION_VARIABLES.join(', ')} (AAP 0.9.1, 0.9.6)`,
    );
  });
});

describe('AAP 0.6.6 — every design value is defined once in src/styles/theme.css', () => {
  it('0.6.6: no hex colour literal outside the token file and the illustrations', () => {
    assertNoHits(
      colourScan(HEX_COLOUR_PATTERN),
      `0.6.6: a hex colour literal stands outside ${TOKEN_FILE} and outside ${ILLUSTRATIONS_PREFIX}. Every colour resolves to a token declared once in the theme (AAP 0.2.2)`,
    );
  });

  it('0.6.6: no rgb, hsl, color-mix or oklch colour function outside the token file and the illustrations', () => {
    assertNoHits(
      colourScan(COLOUR_FUNCTION_PATTERN),
      `0.6.6: a colour function stands outside ${TOKEN_FILE} and outside ${ILLUSTRATIONS_PREFIX}, and the palette admits no colour computed outside the theme (AAP 0.2.2). The scan reads every tracked text file, so a test title or message that quotes the call syntax is a hit too: name the function instead of writing it`,
    );
  });

  it('0.6.6: no raw px length in a style context outside the token file', () => {
    assertNoHits(
      lengthScan(),
      `0.6.6: a raw px length stands in a style context. Every length is a space, radius, border or type token from ${TOKEN_FILE}; the only literals the design admits are 0, none, auto, inherit, currentColor and transparent (AAP 0.2.2)`,
    );
  });

  it('0.4.5: no style attribute and no <style> element in markup', () => {
    assertNoHits(
      attributeScan(),
      `0.4.5: markup carries a style attribute or a <style> element. A hash-only content-security policy covers inline <style> elements but not attributes, so the policy admits neither and no component may ship one (AAP 0.17.2)`,
    );
  });

  it('0.6.6: the colour scan covers every file outside its two exemptions', () => {
    const colourVisited = colourScan(HEX_COLOUR_PATTERN).visited;
    const exempt = trackedText()
      .map((source) => source.path)
      .filter((path) => path === TOKEN_FILE || path.startsWith(ILLUSTRATIONS_PREFIX));

    assert.ok(
      colourVisited.length > 0,
      `0.6.6: the colour scan visited no file, so it proves nothing (repository root ${ROOT}).`,
    );
    assert.ok(
      exempt.length > 1,
      `0.6.6: the two exemptions hold ${exempt.length} file(s), so the exemption is not covering the token file and the nine authored illustrations it exists for (AAP 0.2.2).`,
    );

    const scannedExempt = exempt.filter((path) => colourVisited.includes(path));
    assert.deepEqual(
      scannedExempt,
      [],
      `0.6.6: an exempt file is inside the colour scan, so the scan would fail on the token definition or on an authored illustration:\n${scannedExempt.join('\n')}`,
    );

    const uncovered = trackedText()
      .map((source) => source.path)
      .filter((path) => !exempt.includes(path) && !colourVisited.includes(path));
    assert.deepEqual(
      uncovered,
      [],
      `0.6.6: ${uncovered.length} tracked file(s) are outside the colour scan although no exemption covers them:\n${uncovered.join('\n')}`,
    );
  });

  it('0.6.6: the length and attribute scans cover every style source in the tree', () => {
    const styleSources = trackedStyleSources().map((source) => source.path);
    const lengthVisited = lengthScan().visited;
    const attributeVisited = attributeScan().visited;

    assert.ok(
      styleSources.length > 0,
      `0.6.6: the tree holds no style source outside the two exemptions, so the length scan has nothing to prove (repository root ${ROOT}).`,
    );
    assert.ok(
      attributeVisited.length > 0,
      `0.4.5: the tree holds no markup file, so the attribute scan has nothing to prove (repository root ${ROOT}).`,
    );

    const uncovered = styleSources.filter((path) => !lengthVisited.includes(path));
    assert.deepEqual(
      uncovered,
      [],
      `0.6.6: ${uncovered.length} style source(s) are outside the raw-length scan:\n${uncovered.join('\n')}`,
    );

    assert.ok(
      !styleSources.includes(TOKEN_FILE),
      `0.6.6: ${TOKEN_FILE} is the single definition site and stays outside the scan it is the exemption for.`,
    );

    const illustrated = trackedText()
      .map((source) => source.path)
      .filter((path) => path.startsWith(ILLUSTRATIONS_PREFIX));
    assert.ok(
      illustrated.length > 0,
      `0.6.6: no authored illustration was found under ${ILLUSTRATIONS_PREFIX}, so the exemption it grants covers nothing and the scan would fail on a tree that legitimately holds an SVG with literal hex (AAP 0.2.2).`,
    );
    const illustratedScanned = illustrated.filter((path) => styleSources.includes(path));
    assert.deepEqual(
      illustratedScanned,
      [],
      `0.6.6: an illustration is inside the style scan, although an SVG file has no cascade to consume a token from:\n${illustratedScanned.join('\n')}`,
    );
  });
});

describe('B-2 / AAP 0.9.6 — no secret is tracked or built', () => {
  for (const secret of SECRET_PATTERNS) {
    it(`B-2: no ${secret.name} is tracked or built`, () => {
      assertNoHits(
        secretScan(secret),
        `B-2: the scan matched ${secret.name}. No key, token, password or credential belongs in the repository or the published bundle; configuration arrives only through the four documented variables (AAP 0.9.6)`,
      );
    });
  }

  it('B-2: no high-entropy base64 run is tracked or built', () => {
    assertNoHits(
      highEntropyScan(),
      `B-2: the scan matched a high-entropy base64 run that is not a registry digest or registry URL. A lockfile's own integrity and resolved values are public and deterministic and are carved out at the value, never by excluding the file (AAP 0.9.6)`,
    );
  });

  it('B-2: the secret scan covers the tracked tree and any build present', () => {
    const corpus = secretCorpus();
    assert.ok(
      corpus.visited.length > 0,
      `B-2: the secret scan visited no file at all (repository root ${ROOT}), so it proves nothing.`,
    );
    assert.ok(
      corpus.visited.includes('package-lock.json'),
      `B-2: the lockfile is outside the secret scan. It is the one file the digest carve-out exists for, so it must stay in the corpus (AAP 0.9.6).`,
    );
    const built = builtDirectories();
    assert.ok(
      corpus.visited.length > trackedText().length || built.length === 0,
      `B-2: ${built.length} built director(ies) were found but none of their files reached the secret scan, so the published bundle is unchecked (AAP 0.9.6).`,
    );
  });

  it('WT-03: no licence text is published into a built directory', () => {
    const licenceFiles = trackedFiles().filter((path) => path.startsWith('licenses/'));
    assert.deepEqual(
      licenceFiles,
      ['licenses/fonts/GeistMono-OFL.txt', 'licenses/fonts/Urbanist-OFL.txt'],
      `WT-03: the two OFL texts are expected at licenses/fonts/ and nowhere else; the licence has to travel with the vendored fonts but must not be served as site content (AAP 0.5.3). Found: ${JSON.stringify(licenceFiles)}`,
    );

    const offenders: string[] = [];
    offenders.push(...walkPaths(absolute('public')).filter(isLicencePath));
    for (const directory of builtDirectories()) {
      offenders.push(...walkPaths(directory).filter(isLicencePath));
    }
    assert.deepEqual(
      offenders,
      [],
      `WT-03: a licence text reaches the published output. public/ is copied verbatim into the build, so the two OFL texts sit at the repository root instead (AAP 0.5.3):\n${offenders.join('\n')}`,
    );
  });
});

describe('AAP 0.9.5 — no test hook reaches production code', () => {
  it('0.9.5: nothing under src/ reads LAUNCH_CHECK', () => {
    assertNoHits(
      prefixScan('src/', [/\bLAUNCH_CHECK\b/]),
      `0.9.5: a file under src/ reads LAUNCH_CHECK. The bypass is honoured only by scripts/launch-check.ts and the build script that calls it, so no page, component or bundle may observe it (AAP 0.9.5)`,
    );
  });

  it('0.9.5: nothing under src/ reads the address bar or defines a global hook', () => {
    assertNoHits(
      prefixScan('src/', [/location\s*\.\s*search/, /\bURLSearchParams\b/, /\bwindow\s*\.\s*__/]),
      `0.9.5: a file under src/ reads a query string or defines a window.__ global. The site carries no test-only hook that could change production behaviour (AAP 0.9.5)`,
    );
  });
});

describe('AAP 0.8.2 — the fixtures stay out of the product', () => {
  it('0.8.2: no file under src/ references a test fixture', () => {
    const patterns = FIXTURE_REFERENCES.map(
      (reference) => new RegExp(reference.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
    assertNoHits(
      prefixScan('src/', patterns),
      `0.8.2: a file under src/ names a test fixture. The specification copy, the Figma residue list and the vendor list are read by the static suite alone, so no page may reach one (AAP 0.8.2, 0.13.8)`,
    );
  });
});

describe('B-1 / W-2 — no foreign host and no runtime server', () => {
  it('B-1: no absolute http(s) URI under src/ or scripts/ beyond the sitemap namespace and XML namespaces', () => {
    assertNoHits(
      hostScan(),
      `B-1: a file under src/ or scripts/ names an absolute host. The only permitted absolute URI is the sitemap's XML namespace ${SITEMAP_NAMESPACE}, plus XML namespace declarations, which no browser resolves to a host (AAP 0.4.5, WT-03)`,
    );
  });

  it('W-2: astro.config.mjs installs no adapter and no middleware', () => {
    assertNoHits(
      configScan(),
      `W-2: astro.config.mjs carries an adapter or a middleware. The site is static output with nothing executing per request, so the config imports no @astrojs adapter and installs no middleware (AAP 0.4.1, 0.8.3)`,
    );
    assert.ok(
      declaresStaticOutput(),
      `W-2: astro.config.mjs does not declare output: 'static'. The static output setting is what makes the published artefact a directory of files (AAP 0.11.2).`,
    );
  });
});
