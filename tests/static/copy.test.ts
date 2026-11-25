/**
 * tests/static/copy.test.ts — the copy-free component scan (AAP 0.7.2, 0.4.3; `npm run test:copy`).
 *
 * The site's hardest promise is that every word a visitor reads comes from the content
 * specification, character for character. A typed page can only be compared against that
 * specification if there is exactly one place a string can come from, so the plan makes
 * `src/content` that place and every component and layout a consumer of it. This file is how the
 * second half of that arrangement is enforced: it reads the markup of every `.astro` file under
 * `src/components/` and `src/layouts/` and fails on any text a reader would see that is not a prop
 * reference or an expression over props.
 *
 * Its absence is what would make the per-page fidelity comparison in `output.test.ts` (WT-15)
 * decorative: if a component could type its own caption, a page could agree with the specification
 * and still show a sentence nobody reviewed. It is the machine half of "copy has one home", and the
 * reason a copywriter edits `src/content` alone.
 *
 * What the project rules require of this file, and where each is honoured:
 *
 * - **W-1** — the design reference supplies layout and style only, and all copy comes from the
 *   content map. A string typed into a component is, by definition, a string no content module
 *   supplies, which makes it a string the run invented; the text-node scan and the attribute scan
 *   below are that requirement enforced rather than stated. Copy may also not be pulled in behind
 *   the caller's back, which is why a component may import from `src/content` for its types alone.
 * - **B-4** — nothing invented, and nothing unfounded. An invented label, caption, button word or
 *   accessible name is invented content, and the same two scans make one impossible to introduce
 *   silently.
 * - **B-3** — WCAG 2.2 AA. Visible labels and accessible names must arrive as real, reviewed text,
 *   so the four attributes that name a control are held to the same rule as visible copy. Contrast,
 *   focus, keyboard operation and the axe run belong to `tests/e2e/a11y.spec.ts`; nothing here
 *   duplicates or weakens them.
 * - **B-2** — no secrets and no configured values in code. A host, an address or a token typed into
 *   a component would be a text node or an attribute value here, and the configuration half of the
 *   rule is `source.test.ts`'s.
 * - **W-2** — static output only. The three islands' module scripts are the only place a component
 *   legitimately carries code literals such as an attribute name or a key, so their bodies are
 *   skipped — the element's content only, never the rest of the file, and the skip's boundaries are
 *   asserted in their own test below so it cannot grow into a hole in the rule.
 *
 * What this file deliberately does not do. It does not scan page files: a page is a composition
 * whose frontmatter imports the content modules, and its job is exactly to hand copy to components.
 * It does not check tokens, `style` attributes or secrets (`source.test.ts`), visual behaviour
 * (`tests/e2e/pages.spec.ts`), accessibility conformance (`tests/e2e/a11y.spec.ts`) or copy fidelity
 * (`output.test.ts`). It writes nothing — no build, no directory, no scratch file — and it imports
 * nothing beyond Node's built-ins, because AAP 0.12.1 gives `tests/helpers/` exactly two members and
 * neither of them is this suite's.
 *
 * How the scan reads a file. Astro's template half — everything after the closing fence of the
 * frontmatter, or the whole file when there is no frontmatter — is lexed in one pass by a small
 * mode machine, in the same spirit as `source.test.ts`'s masked views but without a parser package:
 *
 * - **Tags** are scanned quote- and brace-aware, so a `>` inside `content="width=device-width"` or
 *   inside a `class={cond ? 'a' : 'b'}` expression never ends a tag early.
 * - **Expressions** (`{…}`) are tracked by depth and skipped as text, because a value that comes
 *   from a prop or from an expression over props is precisely what the rule wants. Inside an
 *   expression the lexer respects single quotes, double quotes, template literals with their own
 *   `${…}` nesting, line comments and block comments, so `class={a ? "b" : "c"}` and a multi-line
 *   template can never be mistaken for markup.
 * - **Markup inside an expression** — Astro's JSX-shaped children, as in
 *   `{cond && <span class={X}>{y}</span>}` — is parsed as markup by the same function, recursively,
 *   so text and attributes written there are held to the same rule rather than hidden inside the
 *   expression. That recursion recognises a tag only where a JS comparison could not be: `<` must be
 *   followed directly by a name that ends at whitespace, `/` or `>`, and must not follow an
 *   identifier character, a closing bracket or a quote. No comparison in this repository's markup
 *   matches that shape, and a construct the lexer cannot parse raises an error naming the file and
 *   the offset rather than passing quietly.
 * - **`<script>` and `<style>` bodies** are skipped to their own closing tag, so an island's code
 *   literals are never copy; **HTML comments** and **JSX comments** are skipped because a comment is
 *   not shown to anyone.
 *
 * At markup level, outside a tag, outside an expression and outside a comment, any run of characters
 * that is not entirely whitespace is a violation — a lone punctuation mark or a bare `&nbsp;`
 * included, because AAP 0.6.6 puts brackets, separators, bullets and ordinals in CSS so the DOM text
 * equals the specification's text and the fidelity comparison has something exact to compare.
 *
 * One boundary in this file is worth stating where a reader will meet it. Every component must
 * receive its copy as props, and the suite holds all of them to that with a rule that admits type
 * imports from `src/content` only. The layout is the one composition root in the tree — AAP 0.8.1
 * fixes its interface at four members — so it binds the shared shell copy once and hands it down to
 * the header, the footer, the skip link and the head. It is therefore held to what the architecture
 * actually promises for it: copy may enter a layout only to be forwarded as a prop, never to be
 * rendered. A layout that typed a word, or that rendered an imported string instead of passing it
 * on, fails here.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { describe, it } from 'node:test';

/*
 * The repository root is found by walking up from this file until `package.json` sits there, so the
 * suite behaves the same whether `node --test` is started from the root, from `tests/`, or by the
 * harness from another working directory. A root that cannot be found throws here, at load, naming
 * the directory the walk started from: every scan below would otherwise read an empty tree and
 * report a pass.
 */
const ROOT: string = findRepoRoot();

/** The two directories the rule covers: every component, and the one layout (AAP 0.7.2, 0.10.2). */
const COMPONENTS_ROOT = 'src/components';
const LAYOUTS_ROOT = 'src/layouts';

/**
 * Files the plan declares by path, asserted present so a rename or a move cannot shrink the scan
 * without failing it (AAP 0.12.1, 0.8.1). The layout and the three islands are here because they are
 * the files whose scanning shape differs from the rest; `Icon.astro` and `Meta.astro` because they
 * carry the most literals of their own (an icon inventory, protocol tokens) and are the ones a
 * scanner that over-reaches would break.
 */
const REQUIRED_FILES: readonly string[] = [
  'src/layouts/BaseLayout.astro',
  'src/components/Meta.astro',
  'src/components/ContactForm.astro',
  'src/components/Icon.astro',
  'src/components/Header.astro',
  'src/components/Footer.astro',
  'src/components/FaqAccordion.astro',
];

/**
 * The components that carry a module script (AAP 0.4.2, rule W-2). The raw-text skip that keeps an
 * island's code out of the scan is asserted to be bounded on these three files, so the one place
 * this suite could hide a defect is proven not to swallow the markup around it.
 */
const ISLAND_FILES: readonly string[] = [
  'src/components/ContactForm.astro',
  'src/components/FaqAccordion.astro',
  'src/components/MobileMenu.astro',
];

/**
 * The attributes whose value a reader or an assistive technology reads as text, and which therefore
 * may only come from a prop (AAP 0.7.2, rule B-3). Everything the rule does not name — `charset`,
 * `lang`, `content`, `type`, `place`, `as`, `variant`, `state`, `tone`, `class`, `id`, `hidden` — is
 * a protocol token, a framework directive or a system enum, not copy, and is left alone deliberately:
 * a scanner that flagged those would be relaxed into uselessness by the first exemption somebody
 * needed, which is the failure mode this list exists to avoid.
 */
const COPY_ATTRIBUTES: readonly string[] = ['alt', 'title', 'aria-label', 'placeholder'];

/** Elements with no end tag, so a tag stack never waits for one. */
const VOID_ELEMENTS: ReadonlySet<string> = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/** The two elements whose content is raw text rather than markup (rule W-2). */
const RAW_TEXT_ELEMENTS: ReadonlySet<string> = new Set(['script', 'style']);

/** A content module's path, as an import specifier reaches it from a component or the layout. */
const CONTENT_SPECIFIER = /\/content\//;

/** One thing the scan found, reported with the file, the position and what was read. */
interface Violation {
  /** Repository-relative POSIX path of the file. */
  readonly path: string;
  /** 1-based line of the finding. */
  readonly line: number;
  /** 1-based column of the finding. */
  readonly column: number;
  /** Which rule-shaped check produced it, in a few words. */
  readonly finding: string;
  /** The offending text or attribute, quoted, so the failure can be acted on without opening the file. */
  readonly detail: string;
}

/** The span of a `<script>` or `<style>` element whose body the scan skipped. */
interface RawTextSpan {
  readonly name: string;
  readonly start: number;
  readonly end: number;
}

/** An expression in rendered-children position, kept so the layout rule can inspect it. */
interface ExpressionSpan {
  /** 1-based line the expression opens on. */
  readonly line: number;
  /** The expression's body, without its braces. */
  readonly text: string;
}

/** An import of a `src/content` module, with the bindings it brings into the file. */
interface ContentImport {
  /** The specifier exactly as written, so a failure quotes what the author wrote. */
  readonly specifier: string;
  /** The local names the import binds, whether default, namespace, named or aliased. */
  readonly bindings: readonly string[];
  /** 1-based line of the `import` keyword. */
  readonly line: number;
  /** True for `import type`, which erases at build time and cannot carry copy into a page. */
  readonly typeOnly: boolean;
}

/** Everything one file's scan produced, read by the assertions below. */
interface FileScan {
  readonly path: string;
  /** Offset of the template half's first character. */
  readonly templateStart: number;
  /** Where the scan stopped; asserted to be the end of the template. */
  readonly consumed: number;
  /** The whole file's length, which the scan of the template must reach. */
  readonly length: number;
  /** Markup elements the lexer opened, so a file that parsed nothing is reported. */
  readonly elements: number;
  /** Offsets of every markup text run examined, whitespace included. */
  readonly textRunOffsets: readonly number[];
  /** Expressions in rendered-children position. */
  readonly textExpressions: readonly ExpressionSpan[];
  /** The raw-text elements the scan skipped. */
  readonly rawTextSpans: readonly RawTextSpan[];
  readonly violations: readonly Violation[];
  readonly contentImports: readonly ContentImport[];
}

/**
 * Walks up from this file's directory to the first directory holding `package.json`.
 *
 * `import.meta.dirname` is the starting point rather than `process.cwd()`, so the suite finds the
 * same root however it is invoked. Reaching the filesystem root without a `package.json` throws,
 * naming the directory the walk began in, because a scan of the wrong directory would pass.
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
        `copy.test.ts: no package.json was found above ${start}, so the repository root is unknown and nothing can be scanned.`,
      );
    }

    directory = parent;
  }
}

/** A repository-relative POSIX path, which is how every failure names a file. */
function toRelative(absolutePath: string): string {
  return relative(ROOT, absolutePath).split(sep).join('/');
}

/**
 * Every `.astro` file under a repository-relative directory, recursively and sorted, so the scan
 * covers a component added in a subdirectory and reports the same order every run.
 */
function astroFilesUnder(relativeDirectory: string): readonly string[] {
  const absoluteDirectory = join(ROOT, relativeDirectory);
  const found: string[] = [];
  const pending: string[] = [absoluteDirectory];

  while (pending.length > 0) {
    const current = pending.pop();

    if (current === undefined) {
      break;
    }

    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const child = join(current, entry.name);

      if (entry.isDirectory()) {
        pending.push(child);
        continue;
      }

      if (entry.isFile() && entry.name.endsWith('.astro')) {
        found.push(toRelative(child));
      }
    }
  }

  return found.sort();
}

/** Every file the rule covers, both roots together, sorted. */
function allScanTargets(): readonly string[] {
  return [...astroFilesUnder(COMPONENTS_ROOT), ...astroFilesUnder(LAYOUTS_ROOT)].sort();
}

/** The offset of every line start, so any offset becomes a 1-based line and column. */
function lineStartsOf(text: string): readonly number[] {
  const starts: number[] = [0];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === '\n') {
      starts.push(index + 1);
    }
  }

  return starts;
}

/** The index of the line holding an offset, by binary search over the line starts. */
function lineIndexAt(lineStarts: readonly number[], offset: number): number {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low < high) {
    const middle = Math.ceil((low + high) / 2);

    if (lineStarts[middle] <= offset) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  return low;
}

/**
 * Where the template half begins: just past the closing fence of the frontmatter, or 0 for a file
 * without one. A frontmatter fence that is opened and never closed is malformed, so it fails here
 * naming the file rather than leaving nothing to scan.
 */
function templateStartOf(path: string, text: string): number {
  const opening = /^(?:\uFEFF)?---[ \t]*\r?\n/.exec(text);

  if (opening === null) {
    return 0;
  }

  let lineStart = opening[0].length;

  while (lineStart <= text.length) {
    const newline = text.indexOf('\n', lineStart);
    const lineEnd = newline === -1 ? text.length : newline;
    const line = text.slice(lineStart, lineEnd).replace(/\r$/, '');

    if (line.trim() === '---') {
      return newline === -1 ? text.length : newline + 1;
    }

    if (newline === -1) {
      break;
    }

    lineStart = newline + 1;
  }

  throw new Error(
    `${path}: the frontmatter fence opened on line 1 is never closed, so the template half cannot be found and the copy scan would read nothing.`,
  );
}

/** The state one file's lexer carries while it walks the template. */
interface LexContext {
  readonly path: string;
  readonly text: string;
  readonly lineStarts: readonly number[];
  readonly violations: Violation[];
  readonly textRunOffsets: number[];
  readonly textExpressions: ExpressionSpan[];
  readonly rawTextSpans: RawTextSpan[];
  elements: number;
}

/** The line and column of an offset. */
function locationOf(context: LexContext, offset: number): { line: number; column: number } {
  const lineIndex = lineIndexAt(context.lineStarts, offset);

  return {
    line: lineIndex + 1,
    column: offset - context.lineStarts[lineIndex] + 1,
  };
}

/** Records one finding at the offset it was read at. */
function report(context: LexContext, offset: number, finding: string, detail: string): void {
  const { line, column } = locationOf(context, offset);
  context.violations.push({ path: context.path, line, column, finding, detail });
}

/** The error a file the lexer cannot read produces: a named position, never a silent pass. */
function lexError(context: LexContext, offset: number, message: string): Error {
  const { line, column } = locationOf(context, offset);

  return new Error(
    `${context.path}:${line}:${column}: ${message}. The copy scan cannot read this file, so it fails rather than passing over markup it does not understand.`,
  );
}

/** A character that can appear in an element or attribute name. */
const NAME_CHAR = /[A-Za-z0-9:_@.-]/;

/** A character that continues a JavaScript identifier, used to tell a tag from a comparison. */
const IDENTIFIER_CHAR = /[A-Za-z0-9_$]/;

/** Skips a quoted value from its opening quote to just past its closing quote. */
function skipQuoted(context: LexContext, start: number): number {
  const quote = context.text[start];
  let index = start + 1;

  while (index < context.text.length) {
    const character = context.text[index];

    if (character === '\\') {
      index += 2;
      continue;
    }

    if (character === quote) {
      return index + 1;
    }

    index += 1;
  }

  throw lexError(context, start, 'a quoted value is never closed');
}

/** Skips a template literal, including the expressions its own `${…}` holes contain. */
function skipTemplate(context: LexContext, start: number): number {
  let index = start + 1;

  while (index < context.text.length) {
    const character = context.text[index];

    if (character === '\\') {
      index += 2;
      continue;
    }

    if (character === '`') {
      return index + 1;
    }

    if (character === '$' && context.text[index + 1] === '{') {
      index = skipBraced(context, index + 1);
      continue;
    }

    index += 1;
  }

  throw lexError(context, start, 'a template literal is never closed');
}

/**
 * Skips a balanced `{…}` inside JavaScript, quote- and comment-aware. Used for a template
 * literal's own holes, which are values rather than markup.
 */
function skipBraced(context: LexContext, start: number): number {
  const text = context.text;
  let depth = 0;
  let index = start;

  while (index < text.length) {
    const character = text[index];

    if (character === "'" || character === '"') {
      index = skipQuoted(context, index);
      continue;
    }

    if (character === '`') {
      index = skipTemplate(context, index);
      continue;
    }

    if (character === '/' && text[index + 1] === '/') {
      index = skipLineComment(text, index);
      continue;
    }

    if (character === '/' && text[index + 1] === '*') {
      index = skipBlockComment(context, index);
      continue;
    }

    if (character === '{') {
      depth += 1;
      index += 1;
      continue;
    }

    if (character === '}') {
      depth -= 1;
      index += 1;

      if (depth === 0) {
        return index;
      }

      continue;
    }

    index += 1;
  }

  throw lexError(context, start, 'a braced value is never closed');
}

/** The offset just past the end of the line a `//` comment starts on. */
function skipLineComment(text: string, start: number): number {
  const newline = text.indexOf('\n', start);

  return newline === -1 ? text.length : newline + 1;
}

/** The offset just past the delimiter that closes a block comment. */
function skipBlockComment(context: LexContext, start: number): number {
  const close = context.text.indexOf('*/', start + 2);

  if (close === -1) {
    throw lexError(context, start, 'a block comment is never closed');
  }

  return close + 2;
}

/**
 * Whether a `<` at this offset opens an element rather than being a JavaScript operator.
 *
 * A tag's name must begin at the very next character and end at whitespace, `/` or `>`, so `< b`
 * and `<=` are read as operators. Inside an expression the `<` must additionally not follow an
 * identifier character, a closing bracket, a quote or a dot, which is what separates `a < b` and
 * `count<b` from `{cond && <span>}`.
 */
function tagStartAt(context: LexContext, index: number, insideExpression: boolean): boolean {
  const text = context.text;
  const next = text[index + 1];

  if (next === undefined) {
    return false;
  }

  if (next === '/') {
    return true;
  }

  if (!/[A-Za-z]/.test(next)) {
    return false;
  }

  let end = index + 1;

  while (end < text.length && NAME_CHAR.test(text[end])) {
    end += 1;
  }

  const after = text[end];

  if (after !== undefined && !/\s/.test(after) && after !== '>' && after !== '/') {
    return false;
  }

  if (!insideExpression) {
    return true;
  }

  let before = index - 1;

  while (before >= 0 && /\s/.test(text[before])) {
    before -= 1;
  }

  if (before < 0) {
    return true;
  }

  const previous = text[before];

  return !(
    IDENTIFIER_CHAR.test(previous) ||
    previous === ')' ||
    previous === ']' ||
    previous === "'" ||
    previous === '"' ||
    previous === '`' ||
    previous === '.'
  );
}

/**
 * Skips a `<script>` or `<style>` body to just past its closing tag, and records the span so the
 * skip's boundaries can be asserted. Code literals inside an island are not copy (rule W-2), and a
 * `<style>` element cannot exist under the hash-only policy that `source.test.ts` enforces.
 */
function skipRawText(context: LexContext, from: number, name: string): number {
  const text = context.text;
  const close = text.toLowerCase().indexOf(`</${name}`, from);

  if (close === -1) {
    throw lexError(context, from, `a <${name}> element is never closed`);
  }

  const end = text.indexOf('>', close);

  if (end === -1) {
    throw lexError(context, close, `a </${name}> tag is never closed`);
  }

  context.rawTextSpans.push({ name, start: from, end: end + 1 });

  return end + 1;
}

/**
 * Records an attribute the rule names when its value is written rather than computed. Everything
 * outside `COPY_ATTRIBUTES` is left alone on purpose: protocol tokens, framework directives and
 * system enums are not copy, and a scan that flagged them would be relaxed away by the first
 * exemption someone needed.
 */
function checkAttribute(
  context: LexContext,
  offset: number,
  name: string,
  value: string,
  quoted: boolean,
): void {
  const attribute = name.toLowerCase();

  if (!COPY_ATTRIBUTES.includes(attribute)) {
    return;
  }

  report(
    context,
    offset,
    'attribute literal',
    `${attribute}=${quoted ? JSON.stringify(value) : value}`,
  );
}

/**
 * Scans one element's tag, quote- and brace-aware, and returns its name, the offset just past its
 * `>` and whether it closed itself.
 */
function scanTag(
  context: LexContext,
  start: number,
): { name: string; end: number; selfClosing: boolean } {
  const text = context.text;
  let index = start + 1;
  let name = '';

  while (index < text.length && NAME_CHAR.test(text[index])) {
    name += text[index];
    index += 1;
  }

  context.elements += 1;

  for (;;) {
    while (index < text.length && /\s/.test(text[index])) {
      index += 1;
    }

    if (index >= text.length) {
      throw lexError(context, start, 'a tag is never closed');
    }

    const character = text[index];

    if (character === '>') {
      return { name, end: index + 1, selfClosing: false };
    }

    if (character === '/' && text[index + 1] === '>') {
      return { name, end: index + 2, selfClosing: true };
    }

    if (character === '/') {
      index += 1;
      continue;
    }

    if (character === '{') {
      index = scanExpression(context, index, 'attribute');
      continue;
    }

    const nameStart = index;

    while (index < text.length && !/[\s=/>]/.test(text[index])) {
      index += 1;
    }

    const attributeName = text.slice(nameStart, index);

    if (attributeName === '') {
      index += 1;
      continue;
    }

    let cursor = index;

    while (cursor < text.length && /\s/.test(text[cursor])) {
      cursor += 1;
    }

    if (text[cursor] !== '=') {
      continue;
    }

    cursor += 1;

    while (cursor < text.length && /\s/.test(text[cursor])) {
      cursor += 1;
    }

    if (text[cursor] === '"' || text[cursor] === "'") {
      const valueEnd = skipQuoted(context, cursor);
      checkAttribute(context, nameStart, attributeName, text.slice(cursor + 1, valueEnd - 1), true);
      index = valueEnd;
      continue;
    }

    if (text[cursor] === '{') {
      index = scanExpression(context, cursor, 'attribute');
      continue;
    }

    const valueStart = cursor;

    while (cursor < text.length && !/[\s>]/.test(text[cursor])) {
      cursor += 1;
    }

    checkAttribute(context, nameStart, attributeName, text.slice(valueStart, cursor), false);
    index = cursor;
  }
}

/**
 * Scans a `{…}` expression and returns the offset just past its closing brace.
 *
 * The body is a value, not copy, so nothing in it is reported as text. Strings, template literals
 * and comments are skipped so their brackets cannot close the expression early, and markup written
 * inside it — Astro's JSX-shaped children — is handed to the markup scanner so text and attributes
 * there are checked too.
 */
function scanExpression(
  context: LexContext,
  start: number,
  position: 'text' | 'attribute',
): number {
  const text = context.text;
  const bodyStart = start + 1;
  let index = bodyStart;
  let depth = 1;

  while (index < text.length) {
    const character = text[index];

    if (character === "'" || character === '"') {
      index = skipQuoted(context, index);
      continue;
    }

    if (character === '`') {
      index = skipTemplate(context, index);
      continue;
    }

    if (character === '/' && text[index + 1] === '/') {
      index = skipLineComment(text, index);
      continue;
    }

    if (character === '/' && text[index + 1] === '*') {
      index = skipBlockComment(context, index);
      continue;
    }

    if (character === '{') {
      depth += 1;
      index += 1;
      continue;
    }

    if (character === '}') {
      depth -= 1;

      if (depth === 0) {
        if (position === 'text') {
          context.textExpressions.push({
            line: locationOf(context, start).line,
            text: text.slice(bodyStart, index),
          });
        }

        return index + 1;
      }

      index += 1;
      continue;
    }

    if (character === '<' && tagStartAt(context, index, true)) {
      index = scanMarkup(context, index, true);
      continue;
    }

    index += 1;
  }

  throw lexError(context, start, 'a template expression is never closed');
}

/**
 * Scans markup from an offset, in either of its two roles.
 *
 * At the top of a template (`insideExpression` false) it walks to the end of the file, reporting
 * every literal text run it meets. Inside an expression it stops as soon as the element it started
 * on is closed, so the surrounding JavaScript can carry on being lexed.
 */
function scanMarkup(context: LexContext, from: number, insideExpression: boolean): number {
  const text = context.text;
  const stack: string[] = [];
  let index = from;

  while (index < text.length) {
    const character = text[index];

    if (character === '<' && text.startsWith('<!--', index)) {
      const close = text.indexOf('-->', index + 4);

      if (close === -1) {
        throw lexError(context, index, 'an HTML comment is never closed');
      }

      index = close + 3;
      continue;
    }

    if (character === '<' && (text[index + 1] === '!' || text[index + 1] === '?')) {
      const end = text.indexOf('>', index);

      if (end === -1) {
        throw lexError(context, index, 'a declaration is never closed');
      }

      index = end + 1;
      continue;
    }

    if (character === '<') {
      if (text[index + 1] === '/') {
        const end = text.indexOf('>', index);

        if (end === -1) {
          throw lexError(context, index, 'a closing tag is never closed');
        }

        const name = text.slice(index + 2, end).trim().toLowerCase();
        const at = stack.lastIndexOf(name);

        if (at !== -1) {
          stack.length = at;
        }

        index = end + 1;

        if (insideExpression && stack.length === 0) {
          return index;
        }

        continue;
      }

      if (text.startsWith('<>', index)) {
        stack.push('');
        index += 2;
        continue;
      }

      if (tagStartAt(context, index, insideExpression)) {
        const tag = scanTag(context, index);
        index = tag.end;

        const name = tag.name.toLowerCase();

        if (RAW_TEXT_ELEMENTS.has(name)) {
          index = skipRawText(context, index, name);
          continue;
        }

        if (tag.selfClosing || VOID_ELEMENTS.has(name)) {
          if (insideExpression && stack.length === 0) {
            return index;
          }

          continue;
        }

        stack.push(name);
        continue;
      }
    }

    if (character === '{') {
      index = scanExpression(context, index, 'text');
      continue;
    }

    // A run of literal text between tags: at least the character under the cursor, so a `<` that
    // opened no tag is consumed as text and cannot stall the walk.
    let end = index + 1;

    while (end < text.length && text[end] !== '<' && text[end] !== '{') {
      if (insideExpression && (text[end] === '}' || text[end] === ')' || text[end] === ';')) {
        break;
      }

      end += 1;
    }

    context.textRunOffsets.push(index);

    const run = text.slice(index, end);
    const trimmed = run.trim();

    if (trimmed !== '') {
      report(
        context,
        index + (run.length - run.trimStart().length),
        'text node',
        JSON.stringify(trimmed),
      );
    }

    index = end;

    if (
      insideExpression &&
      index < text.length &&
      (text[index] === '}' || text[index] === ')' || text[index] === ';')
    ) {
      return index;
    }
  }

  if (insideExpression) {
    throw lexError(context, from, 'markup inside an expression is never closed');
  }

  return index;
}

/**
 * Blanks comments in a TypeScript region in place — offsets and newlines preserved — so an `import`
 * quoted inside a doc comment is not read as a real import. Quotes are respected, so a `//` inside a
 * string (a URL, say) is not mistaken for a comment.
 */
function blankComments(source: string): string {
  const characters = source.split('');
  let index = 0;

  while (index < source.length) {
    const character = source[index];

    if (character === "'" || character === '"' || character === '`') {
      index = skipPlainQuoted(source, index);
      continue;
    }

    if (character === '/' && source[index + 1] === '/') {
      while (index < source.length && source[index] !== '\n') {
        characters[index] = ' ';
        index += 1;
      }

      continue;
    }

    if (character === '/' && source[index + 1] === '*') {
      const close = source.indexOf('*/', index + 2);
      const end = close === -1 ? source.length : close + 2;

      for (let at = index; at < end; at += 1) {
        if (source[at] !== '\n') {
          characters[at] = ' ';
        }
      }

      index = end;
      continue;
    }

    index += 1;
  }

  return characters.join('');
}

/** Skips a quoted run without any error reporting, for masking rather than scanning. */
function skipPlainQuoted(source: string, start: number): number {
  const quote = source[start];
  let index = start + 1;

  while (index < source.length) {
    if (source[index] === '\\') {
      index += 2;
      continue;
    }

    if (source[index] === quote) {
      return index + 1;
    }

    index += 1;
  }

  return source.length;
}

/**
 * The local names an import clause binds: a default name, a namespace alias, and each named
 * binding's local side of `as`. A `type` member inside a named list is skipped, because it erases.
 */
function bindingNames(clause: string): readonly string[] {
  const names: string[] = [];
  const braces = /\{([\s\S]*)\}/.exec(clause);
  const head = braces === null ? clause : clause.slice(0, braces.index);

  for (const piece of head.split(',')) {
    const trimmed = piece.trim();

    if (trimmed === '') {
      continue;
    }

    const namespace = /^\*\s+as\s+([A-Za-z_$][\w$]*)$/.exec(trimmed);

    if (namespace !== null) {
      names.push(namespace[1]);
      continue;
    }

    const identifier = /^([A-Za-z_$][\w$]*)$/.exec(trimmed);

    if (identifier !== null) {
      names.push(identifier[1]);
    }
  }

  if (braces === null) {
    return names;
  }

  for (const piece of braces[1].split(',')) {
    const trimmed = piece.trim();

    if (trimmed === '' || /^type\s/.test(trimmed)) {
      continue;
    }

    const aliased = /\bas\s+([A-Za-z_$][\w$]*)$/.exec(trimmed);

    if (aliased !== null) {
      names.push(aliased[1]);
      continue;
    }

    const plain = /^([A-Za-z_$][\w$]*)/.exec(trimmed);

    if (plain !== null) {
      names.push(plain[1]);
    }
  }

  return names;
}

/**
 * Every import of a `src/content` module in a file's frontmatter, with the bindings it brings in.
 *
 * Imports are read statement by statement — from one `import` keyword to the next — so a
 * side-effect import such as the stylesheet's cannot borrow the `from` of the statement that
 * follows it. Only the frontmatter is read, because that is where Astro allows an import.
 */
function contentImportsIn(
  text: string,
  frontmatterEnd: number,
  lineStarts: readonly number[],
): readonly ContentImport[] {
  const frontmatter = blankComments(text.slice(0, frontmatterEnd));
  const starts: number[] = [];
  const boundary = /(?:^|\n)[ \t]*import\b/g;
  let match = boundary.exec(frontmatter);

  while (match !== null) {
    starts.push(match.index + (match[0].startsWith('\n') ? 1 : 0));
    match = boundary.exec(frontmatter);
  }

  const imports: ContentImport[] = [];

  for (let position = 0; position < starts.length; position += 1) {
    const from = starts[position];
    const to = position + 1 < starts.length ? starts[position + 1] : frontmatter.length;
    const statement = frontmatter.slice(from, to);
    const parsed = /^import\s+([\s\S]*?)\s+from\s*['"]([^'"\n]+)['"]/.exec(statement);

    if (parsed === null) {
      continue;
    }

    const specifier = parsed[2];

    if (!CONTENT_SPECIFIER.test(specifier)) {
      continue;
    }

    const clause = parsed[1].trim();
    const typeOnly = /^type\b/.test(clause);
    const bindings = bindingNames(typeOnly ? clause.replace(/^type\b/, '') : clause);

    imports.push({
      specifier,
      bindings,
      line: lineIndexAt(lineStarts, from) + 1,
      typeOnly,
    });
  }

  return imports;
}

/** Scans one file: its template half, and the copy imports its frontmatter declares. */
function scanFile(relativePath: string): FileScan {
  const text = readFileSync(join(ROOT, relativePath), 'utf8');
  const templateStart = templateStartOf(relativePath, text);
  const lineStarts = lineStartsOf(text);

  const context: LexContext = {
    path: relativePath,
    text,
    lineStarts,
    violations: [],
    textRunOffsets: [],
    textExpressions: [],
    rawTextSpans: [],
    elements: 0,
  };

  const consumed = scanMarkup(context, templateStart, false);

  return {
    path: relativePath,
    templateStart,
    consumed,
    length: text.length,
    elements: context.elements,
    textRunOffsets: context.textRunOffsets,
    textExpressions: context.textExpressions,
    rawTextSpans: context.rawTextSpans,
    violations: context.violations,
    contentImports: contentImportsIn(text, templateStart, lineStarts),
  };
}

/** The whole corpus, scanned once per process so no assertion pays for a second read. */
let corpusCache: readonly FileScan[] | null = null;

/** Every scanned file, memoised. */
function corpus(): readonly FileScan[] {
  if (corpusCache === null) {
    corpusCache = allScanTargets().map(scanFile);
  }

  return corpusCache;
}

/** Every finding of one kind, formatted as `path:line:column: finding detail`. */
function findings(kind: string): readonly string[] {
  return corpus()
    .flatMap((file) => file.violations)
    .filter((violation) => violation.finding === kind)
    .map(
      (violation) =>
        `${violation.path}:${violation.line}:${violation.column}: ${violation.finding} ${violation.detail}`,
    );
}

/** The files whose path begins with a root, which is how components and layouts are told apart. */
function filesUnder(root: string): readonly FileScan[] {
  return corpus().filter((file) => file.path.startsWith(`${root}/`));
}

/** A snippet short enough to quote inside a failure message. */
function snippet(text: string): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();

  return JSON.stringify(collapsed.length > 120 ? `${collapsed.slice(0, 117)}...` : collapsed);
}

describe('the files the copy-free rule covers (AAP 0.7.2, 0.12.1)', () => {
  it('reads a non-empty set of .astro files under both scan roots (rule W-1)', () => {
    const componentsDirectory = join(ROOT, COMPONENTS_ROOT);
    const layoutsDirectory = join(ROOT, LAYOUTS_ROOT);

    assert.ok(
      existsSync(componentsDirectory),
      `the component root ${componentsDirectory} does not exist, so no component was checked against the copy-free rule (AAP 0.7.2, rule W-1)`,
    );
    assert.ok(
      existsSync(layoutsDirectory),
      `the layout root ${layoutsDirectory} does not exist, so no layout was checked against the copy-free rule (AAP 0.7.2, rule W-1)`,
    );

    const components = astroFilesUnder(COMPONENTS_ROOT);
    const layouts = astroFilesUnder(LAYOUTS_ROOT);

    assert.ok(
      components.length > 0,
      `the scan of ${componentsDirectory} found no .astro file, so every component would satisfy the copy-free rule by never being read (rule W-1)`,
    );
    assert.ok(
      layouts.length > 0,
      `the scan of ${layoutsDirectory} found no .astro file, so the layout would satisfy the copy-free rule by never being read (rule W-1)`,
    );
  });

  it('finds every component and layout the plan names by path (rule W-1)', () => {
    const scanned = new Set(allScanTargets());
    const missing = REQUIRED_FILES.filter((path) => !scanned.has(path));

    assert.deepEqual(
      missing,
      [],
      `every file AAP 0.12.1 declares must be scanned, so that a rename or a move cannot shrink the scan without failing it (rule W-1). The walk covered ${scanned.size} files and these were absent: ${missing.join(', ')}`,
    );
  });

  it('lexes every file to the end of its template and reports what it read (rule W-1)', (test) => {
    const files = corpus();

    for (const file of files) {
      assert.equal(
        file.consumed,
        file.length,
        `${file.path}: the scan stopped at offset ${file.consumed} of ${file.length}, so everything below that point escaped the copy-free rule (rule W-1)`,
      );
      assert.ok(
        file.elements > 0,
        `${file.path}: the scan opened no element at all, so its template was never read as markup (rule W-1)`,
      );
    }

    const elements = files.reduce((total, file) => total + file.elements, 0);
    const textRuns = files.reduce((total, file) => total + file.textRunOffsets.length, 0);
    const imports = files.reduce((total, file) => total + file.contentImports.length, 0);

    test.diagnostic(
      `copy scan: ${files.length} files (${filesUnder(COMPONENTS_ROOT).length} components, ${filesUnder(LAYOUTS_ROOT).length} layouts), ${elements} elements, ${textRuns} markup text runs, ${imports} copy-layer imports`,
    );
  });
});

describe('W-1: no user-visible text is typed into a component or layout', () => {
  it('renders no literal text node in any component or layout (AAP 0.7.2, rule W-1)', () => {
    const violations = findings('text node');

    assert.deepEqual(
      violations,
      [],
      `a component or layout may render a string only from a prop or from an expression over props, because every word a visitor reads comes from src/content (AAP 0.7.2, 0.4.3; rule W-1). Punctuation and entity references count too: brackets, separators and ordinals belong to CSS (AAP 0.6.6). ${violations.length} typed text node(s) were found: ${violations.join('; ')}`,
    );
  });

  it('carries no literal alt, title, aria-label or placeholder value (AAP 0.7.2, rule W-1)', () => {
    const violations = findings('attribute literal');

    assert.deepEqual(
      violations,
      [],
      `alt, title, aria-label and placeholder name something a reader or an assistive technology hears, so their value comes from a prop like any other copy (AAP 0.7.2, rule W-1), and an invented one would be invented content (rule B-4). Protocol tokens and framework enums — charset, lang, content, type, place, as, variant, state, tone — are not copy and are deliberately not reported. ${violations.length} literal value(s) were found: ${violations.join('; ')}`,
    );
  });

  it('examines markup text in every file, so the two checks above cannot pass by reading nothing (rule W-1)', () => {
    const files = corpus();
    const textRuns = files.reduce((total, file) => total + file.textRunOffsets.length, 0);

    assert.ok(
      textRuns > 0,
      `no markup text run was examined anywhere under ${COMPONENTS_ROOT} or ${LAYOUTS_ROOT}, so a lexer that had stopped reading would report exactly the same clean result as one that had read everything (rule W-1)`,
    );
  });

  it('skips an island script without skipping the markup around it (rule W-2, AAP 0.4.2)', () => {
    const scanned = new Map(corpus().map((file) => [file.path, file] as const));

    for (const path of ISLAND_FILES) {
      const file = scanned.get(path);

      assert.ok(
        file !== undefined,
        `${path} is one of the three islands AAP 0.4.2 declares, so it must be among the files this scan reads (rule W-2)`,
      );

      const script = file.rawTextSpans.find((span) => span.name === 'script');

      assert.ok(
        script !== undefined,
        `${path} carries a module script, so the scan must have recognised it as raw text and skipped it; a script the lexer did not see would be read as markup (rule W-2)`,
      );

      assert.ok(
        file.elements > 0,
        `${path}: the script skip consumed the whole file, so the markup that surrounds the island was never checked (rule W-2)`,
      );

      assert.ok(
        file.textRunOffsets.some((offset) => offset < script.start),
        `${path}: no text above the island was examined, so the scan never reached the markup the script was meant to sit inside (rule W-2)`,
      );

      assert.ok(
        file.textRunOffsets.some((offset) => offset >= script.end),
        `${path}: the scan stopped at the script's closing tag (offset ${script.end}) instead of resuming after it, so everything below the island escaped the copy-free rule (rule W-2)`,
      );
    }
  });
});

describe('the copy layer is imported for its types, never for its copy (AAP 0.3.2, 0.7.2; rule W-1)', () => {
  it('lets a component import from src/content only as a type (rule W-1)', () => {
    const offences: string[] = [];

    for (const file of filesUnder(COMPONENTS_ROOT)) {
      for (const imported of file.contentImports) {
        if (imported.typeOnly) {
          continue;
        }

        offences.push(
          `${file.path}:${imported.line}: value import { ${imported.bindings.join(', ')} } from '${imported.specifier}'`,
        );
      }
    }

    assert.deepEqual(
      offences,
      [],
      `every component receives its copy as props (AAP 0.3.2, 0.4.3), so a component that imported the copy layer as a value would have a second way to obtain a string and could render text the caller never supplied. import type is the supported form, because a type erases at build time and carries no copy into a page. ${offences.length} value import(s) were found: ${offences.join('; ')}`,
    );
  });

  it('lets the layout bind the shared shell copy only to forward it as a prop (rule W-1, AAP 0.8.1)', () => {
    const offences: string[] = [];

    for (const file of filesUnder(LAYOUTS_ROOT)) {
      for (const imported of file.contentImports) {
        if (imported.typeOnly) {
          continue;
        }

        for (const binding of imported.bindings) {
          const reference = new RegExp(`\\b${binding.replace(/[$]/g, '\\$&')}\\b`);

          for (const span of file.textExpressions) {
            if (!reference.test(span.text)) {
              continue;
            }

            offences.push(
              `${file.path}:${span.line}: '${binding}' from '${imported.specifier}' is rendered as children: ${snippet(span.text)}`,
            );
          }
        }
      }
    }

    assert.deepEqual(
      offences,
      [],
      `the layout is the one composition root in the tree: AAP 0.8.1 fixes its interface at four members, so it binds the shared shell copy once and hands it down to the header, the footer, the skip link and the head as props (AAP 0.7.2, rule W-1). Binding it is therefore allowed; rendering it is not, because a string rendered here would bypass the caller exactly as a typed one would. ${offences.length} rendered binding(s) were found: ${offences.join('; ')}`,
    );
  });

  it('finds the type imports the components take from the copy layer, so the import scan is not vacuous (rule W-1)', () => {
    const typeImports = filesUnder(COMPONENTS_ROOT).flatMap((file) =>
      file.contentImports.filter((imported) => imported.typeOnly),
    );

    assert.ok(
      typeImports.length > 0,
      `no component was seen importing a type from src/content, so the import scan read nothing and both import checks above would pass whatever the components did (AAP 0.3.2, rule W-1)`,
    );
  });
});

