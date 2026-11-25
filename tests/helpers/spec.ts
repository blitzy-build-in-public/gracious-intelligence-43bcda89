/**
 * The fidelity harness' reader for the committed content specification.
 *
 * `tests/static/output.test.ts` (WT-15) compares a built page's DOM text against strings derived
 * mechanically from the content specification, and `tests/static/residue.test.ts` (WT-16) proves the
 * template-residue fixture is disjoint from the specification's own copy. Both read the document
 * through this module, which applies the document's own reading rules (AAP 0.7.3) to
 * `tests/fixtures/website-content-specification.md`. Deriving the strings here, instead of re-typing
 * them into a test, is what makes "the site shows the specification's copy verbatim" a build gate.
 *
 * The module is a pure parser, a loader and a small CLI entry. It reads no file at import time,
 * touches no network, names no configuration value and holds no copy of its own, so it can never
 * invent a string to fill a gap (rule W-1, rule B-4, AAP 0.7.7).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * The section identifiers the specification is required to carry, one per page-facing section of
 * the content map plus the interface strings: A0 the global shell through A8 the interface strings.
 */
export type SectionId = 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'A7' | 'A8';

/** Every section identifier, in order. The model is ordered by this list, so `sections` is stable. */
export const SECTION_IDS: readonly SectionId[] = ['A0', 'A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8'];

/**
 * The machine-detectable line a fixture carries when the document itself could not be supplied.
 * `loadSpecification` treats its presence as a hard failure rather than as an empty document: a
 * model with no copy in it would let every fidelity assertion pass quietly.
 */
export const FIXTURE_ABSENT_MARKER = '<!-- FIXTURE ABSENT: website-content-specification.md -->';

/** Link text and its target, read from `text -> /path`. The text is copy; the `href` is not. */
export interface SpecLink {
  text: string;
  href: string;
}

/**
 * One `Name: value` line. `name` and its colon are structure, never copy; only `value` yields
 * assertable strings, and `value` keeps the raw text as written (markdown emphasis stripped) so a
 * reader can compare it against the document by eye.
 */
export interface SpecField {
  name: string;
  value: string;
  parts: string[];
  links: SpecLink[];
}

/** One list item, split into its ` / `-separated parts. `text` is the whole item as written. */
export interface SpecItem {
  parts: string[];
  text: string;
  links: SpecLink[];
}

/** One A0–A8 section. `title` and `headings` are structure; `copy` is what must reach a page. */
export interface SpecSection {
  id: SectionId;
  title: string;
  headings: string[];
  fields: SpecField[];
  items: SpecItem[];
  paragraphs: string[];
  links: SpecLink[];
  instructions: string[];
  copy: string[];
}

/** The whole document: its nine sections in A0–A8 order, plus an identifier lookup. */
export interface Specification {
  source: string;
  sections: SpecSection[];
  byId: Record<SectionId, SpecSection>;
}

/** The fixture `loadSpecification` reads when no path is given, resolved next to this module. */
const DEFAULT_FIXTURE_SOURCE = fileURLToPath(
  new URL('../fixtures/website-content-specification.md', import.meta.url),
);

/** The named entities the DOM may carry, matched case-insensitively in a single pass. */
const ENTITY_CHARACTERS: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  nbsp: ' ',
};

const ENTITY_PATTERN = /&(amp|lt|gt|quot|apos|nbsp|#39);/gi;
const LINK_ARROW = '->';
const LINK_SENTINEL_PATTERN = /\u0000(\d+)\u0000/g;
const LINK_TARGET_PREFIX = /^(?:\/|\.\/|https?:\/\/|mailto:|#)/;
const LINK_TARGET_TERMINATOR = /[\s,;)\]}>"'`]/;
const FIELD_PATTERN = /^([^:|<>*#]{1,80}?):(?:\s|$)(.*)$/;
const INSTRUCTION_PATTERN = /^\[(.+)\](?:[.,;:!?…]*)$/;
const LIST_ITEM_PATTERN = /^(?:[-*+]|\d{1,3}[.)])\s+(.*)$/;
const HEADING_PATTERN = /^#{1,6}\s+(.*)$/;
const THEMATIC_BREAK_PATTERN = /^([-*_=])\1{2,}$/;
const FENCE_PATTERN = /^(?:```|~~~)/;
const SECTION_TOKEN_PATTERN = /^(?:section\s+|§\s*)?(A[0-8])\b/i;

/**
 * The one comparison helper both sides of a fidelity assertion use. It decodes the basic HTML
 * entities a built DOM may contain, collapses every whitespace run to a single space and trims.
 * It changes no letter, no case and no punctuation — `tests/static/output.test.ts` applies it to
 * built DOM text, and the model's strings are normalised the same way, so the two are comparable.
 */
export function normaliseText(value: string): string {
  const decoded = value.replace(ENTITY_PATTERN, (match: string, name: string): string => {
    const character = ENTITY_CHARACTERS[name.toLowerCase()];
    return character === undefined ? match : character;
  });
  return decoded.replace(/\s+/gu, ' ').trim();
}

/**
 * Removes markdown emphasis delimiters around a value and nothing else (reading rule 9). Underscores
 * are only removed as a pair wrapped in non-word boundaries, so an identifier such as
 * `PUBLIC_SITE_URL` keeps its characters.
 */
function stripEmphasis(value: string): string {
  return value
    .replace(/\*\*([^*]+?)\*\*/g, '$1')
    .replace(/__([^_]+?)__/g, '$1')
    .replace(/(^|[\s([{'"])_([^_\n]+?)_(?=$|[\s)\]},.;:!?'"])/g, '$1$2')
    .replace(/(^|[\s([{'"])\*(?!\s)([^*\n]+?)\*(?=$|[\s)\]},.;:!?'"])/g, '$1$2')
    .replace(/`/g, '');
}

/** True when a value is one of the nine section identifiers. */
function isSectionId(value: string): value is SectionId {
  return (SECTION_IDS as readonly string[]).includes(value);
}

/**
 * The section a heading opens, or `null` when it opens none (reading rule 1). Only a heading that
 * *leads* with its identifier counts — `## A3 …`, `## Section A3 …` — so a heading that merely
 * mentions another section keeps belonging to the section it sits in. The document declares no
 * other way to name a section, and a partial model is never returned, so a heading the rule misses
 * surfaces as a named missing section rather than as quietly mis-assigned copy.
 */
function leadingSectionId(headingText: string): SectionId | null {
  const match = SECTION_TOKEN_PATTERN.exec(normaliseText(stripEmphasis(headingText)));
  if (match === null) return null;
  const token = (match[1] ?? '').toUpperCase();
  return isSectionId(token) ? token : null;
}

/** The bracketed builder instruction a line carries, with its brackets, or `null` (reading rule 6). */
function bracketedInstruction(text: string): string | null {
  const match = INSTRUCTION_PATTERN.exec(text);
  if (match === null) return null;
  const inner = (match[1] ?? '').trim();
  return inner.length === 0 ? null : `[${inner}]`;
}

/** Splits a `Name: value` line; the name must be followed by whitespace or the end of the line. */
function parseFieldLine(text: string): { name: string; value: string } | null {
  const match = FIELD_PATTERN.exec(text);
  if (match === null) return null;
  const name = (match[1] ?? '').trim();
  const value = (match[2] ?? '').trim();
  if (name.length === 0 || name.includes(' / ')) return null;
  return { name, value };
}

function skipSpaces(value: string, from: number): number {
  let index = from;
  while (index < value.length && /\s/.test(value.charAt(index))) index += 1;
  return index;
}

/**
 * Reads the target of a `text -> /path` pair, or `null` when what follows the arrow is not a link
 * target. A bare arrow inside prose is therefore left as prose, and a sentence-ending full stop is
 * not read as part of the path.
 */
function readLinkTarget(value: string, from: number): string | null {
  let end = from;
  while (end < value.length && !LINK_TARGET_TERMINATOR.test(value.charAt(end))) end += 1;
  const target = value.slice(from, end).replace(/[.,;:]+$/, '');
  if (target.length === 0 || !LINK_TARGET_PREFIX.test(target)) return null;
  return target;
}

/**
 * Separates link pairs from a value before any splitting happens (reading rule 5, and the order of
 * operations the document's rules require). Each pair is replaced in the returned `remainder` by a
 * sentinel, so a ` / ` or `;` inside a link's own text can never split it and a target can never
 * become copy. The link array keeps every pair in order, so sentinel indices stay valid.
 */
function extractLinks(value: string): { remainder: string; links: SpecLink[] } {
  const links: SpecLink[] = [];
  let remainder = '';
  let segmentStart = 0;
  let copiedUpTo = 0;
  let arrowAt = value.indexOf(LINK_ARROW);

  while (arrowAt !== -1) {
    const targetStart = skipSpaces(value, arrowAt + LINK_ARROW.length);
    const target = readLinkTarget(value, targetStart);
    if (target === null) {
      arrowAt = value.indexOf(LINK_ARROW, arrowAt + LINK_ARROW.length);
      continue;
    }
    const targetEnd = targetStart + target.length;
    const linkText = normaliseText(value.slice(segmentStart, arrowAt).replace(/^[\s;,(]+/, ''));
    links.push({ text: linkText, href: target });
    remainder += value.slice(copiedUpTo, segmentStart);
    remainder += `\u0000${links.length - 1}\u0000`;
    copiedUpTo = targetEnd;
    segmentStart = targetEnd;
    arrowAt = value.indexOf(LINK_ARROW, targetEnd);
  }

  remainder += value.slice(copiedUpTo);
  return { remainder, links };
}

/** Puts each link's text back where its sentinel stood. */
function expandLinks(text: string, links: readonly SpecLink[]): string {
  return text.replace(LINK_SENTINEL_PATTERN, (match: string, digits: string): string => {
    const link = links[Number.parseInt(digits, 10)];
    return link === undefined ? match : link.text;
  });
}

/**
 * The assertable strings a value yields: split on ` / ` (rule 3), then on `;` (rule 4), then
 * normalised and emptied of blanks. A value with neither separator is one string.
 */
function partsFromValue(expanded: string): string[] {
  const parts: string[] = [];
  for (const group of expanded.split(' / ')) {
    for (const piece of group.split(';')) {
      const part = normaliseText(piece);
      if (part.length > 0) parts.push(part);
    }
  }
  return parts;
}

/** Adds links to a section's own list once each, skipping any pair whose text is empty. */
function pushLinks(target: SpecLink[], links: readonly SpecLink[]): void {
  for (const link of links) {
    if (link.text.length === 0) continue;
    const known = target.some((existing) => existing.text === link.text && existing.href === link.href);
    if (!known) target.push(link);
  }
}

/** A field line built into its model, with links extracted before the parts are split. */
function buildField(name: string, rawValue: string): SpecField {
  const value = normaliseText(rawValue);
  const { remainder, links } = extractLinks(value);
  return { name, value, parts: partsFromValue(expandLinks(remainder, links)), links };
}

/** A section while the document is being walked once, already in the shape the model exposes. */
interface SectionBuilder {
  id: SectionId;
  title: string;
  headings: string[];
  fields: SpecField[];
  items: SpecItem[];
  paragraphs: string[];
  links: SpecLink[];
  instructions: string[];
}

/**
 * Parses the specification's markdown into the model every fidelity assertion compares against.
 * Pure: no I/O, no clock, no randomness, no network, so the same text always yields the same model.
 *
 * The document's own reading rules are applied in one pass over its lines:
 *
 * 1. A heading that leads with a section identifier opens that section (`## A3 …`); headings are
 *    structure and populate `title` and `headings`, never `copy`.
 * 2. A `Name: value` line is a field: the name and its colon are not copy, only the value is.
 * 3. A list item is split on ` / ` into separately asserted parts.
 * 4. A value with semicolons is a list of separate strings.
 * 5. `text -> /path` is a link: its text is copy, its target is not. Links are separated from a
 *    value before any split, so a target can never become copy.
 * 6. A bullet whose whole body is square-bracketed is an instruction to the builder: it is kept in
 *    `instructions` — brackets included — and appears in no other collection.
 * 7. Headings are structure (see rule 1).
 * 9. Markdown emphasis is stripped; characters, case and punctuation are preserved.
 *
 * Rule 8 is the one judgement the printed rules leave silent, and it is settled here: markdown
 * table rows and fenced code blocks contribute nothing to the model. The document's tables carry
 * the template-to-content mapping — they name template sections that WT-02 and WT-16 forbid from
 * the output, so reading their cells as page copy would make the fidelity gate assert text the site
 * must never render — and its fenced blocks illustrate shapes rather than page text. The exclusion
 * is narrow on purpose: only `|`-leading table rows and fenced blocks, never a prose line, a list
 * item, a field or a heading.
 *
 * Three further calls the rules do not name, all made in the fail-loud direction:
 *
 * - A blockquoted line is read as prose with its `>` marker stripped. Its content is text a reader
 *   of the document sees, so leaving it out of `copy` could let a rendered string go unasserted.
 * - A paragraph is one prose block, so its wrapped lines are joined; paragraph text is not split on
 *   ` / ` or `;`, because rule 3 and rule 4 describe items and values, not prose.
 * - Setext underlines (`===`, `---`) are treated like any other horizontal rule, and an HTML comment
 *   line contributes nothing. The document is written with ATX headings.
 *
 * A document missing any of A0–A8 throws, naming every missing identifier and the source, so a
 * partial or empty model is impossible to obtain.
 */
export function parseSpecification(markdown: string, sourceLabel?: string): Specification {
  const source = sourceLabel ?? 'the markdown passed to parseSpecification';
  const builders: SectionBuilder[] = [];
  const started = new Set<SectionId>();
  let current: SectionBuilder | null = null;
  let paragraph: string[] = [];
  let inFence = false;

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    const raw = paragraph.join(' ');
    paragraph = [];
    if (current === null) return;
    const { remainder, links } = extractLinks(stripEmphasis(raw));
    pushLinks(current.links, links);
    const text = normaliseText(expandLinks(remainder, links));
    if (text.length > 0) current.paragraphs.push(text);
  };

  for (const rawLine of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim();
    const fenceLine = FENCE_PATTERN.test(line);

    if (inFence) {
      if (fenceLine) inFence = false;
      continue;
    }
    if (fenceLine) {
      flushParagraph();
      inFence = true;
      continue;
    }
    if (
      line.length === 0 ||
      line.startsWith('|') ||
      line.startsWith('<!--') ||
      line.endsWith('-->') ||
      THEMATIC_BREAK_PATTERN.test(line)
    ) {
      flushParagraph();
      continue;
    }

    const headingMatch = HEADING_PATTERN.exec(line);
    if (headingMatch !== null) {
      flushParagraph();
      const headingSource = headingMatch[1] ?? '';
      const headingText = normaliseText(stripEmphasis(headingSource));
      const id = leadingSectionId(headingSource);
      if (id !== null && !started.has(id)) {
        started.add(id);
        current = {
          id,
          title: headingText,
          headings: [headingText],
          fields: [],
          items: [],
          paragraphs: [],
          links: [],
          instructions: [],
        };
        builders.push(current);
      } else if (current !== null) {
        current.headings.push(headingText);
      }
      continue;
    }

    const listMatch = LIST_ITEM_PATTERN.exec(line);
    if (listMatch !== null) {
      flushParagraph();
      if (current === null) continue;
      const body = normaliseText(stripEmphasis(listMatch[1] ?? ''));
      if (body.length === 0) continue;
      const instruction = bracketedInstruction(body);
      if (instruction !== null) {
        current.instructions.push(instruction);
        continue;
      }
      const field = parseFieldLine(body);
      if (field !== null) {
        const built = buildField(field.name, field.value);
        current.fields.push(built);
        pushLinks(current.links, built.links);
        continue;
      }
      const { remainder, links } = extractLinks(body);
      current.items.push({ parts: partsFromValue(expandLinks(remainder, links)), text: body, links });
      pushLinks(current.links, links);
      continue;
    }

    if (current === null) continue;
    const proseSource = line.startsWith('>') ? line.replace(/^>\s*/, '') : line;
    const prose = normaliseText(stripEmphasis(proseSource));
    if (prose.length === 0) continue;
    const instruction = bracketedInstruction(prose);
    if (instruction !== null) {
      flushParagraph();
      current.instructions.push(instruction);
      continue;
    }
    const field = parseFieldLine(prose);
    if (field !== null) {
      flushParagraph();
      const built = buildField(field.name, field.value);
      current.fields.push(built);
      pushLinks(current.links, built.links);
      continue;
    }
    paragraph.push(proseSource);
  }

  flushParagraph();

  const missing = SECTION_IDS.filter((id) => !started.has(id));
  if (missing.length > 0) {
    throw new Error(
      `tests/helpers/spec.ts: ${source} has no section heading for ${missing.join(', ')}. ` +
        `Every one of ${SECTION_IDS.join(', ')} is required, so no partial model is returned.`,
    );
  }

  const byId = {} as Record<SectionId, SpecSection>;
  const sections: SpecSection[] = [];
  for (const id of SECTION_IDS) {
    const builder = builders.find((candidate) => candidate.id === id);
    if (builder === undefined) continue;
    const section = toSection(builder);
    sections.push(section);
    byId[id] = section;
  }

  return { source, sections, byId };
}

/** Assembles a section's `copy` in the order the rules state: field parts, item parts, prose, link text. */
function toSection(builder: SectionBuilder): SpecSection {
  const copy: string[] = [];
  const seen = new Set<string>();
  const add = (value: string): void => {
    const text = normaliseText(value);
    if (text.length === 0 || seen.has(text)) return;
    seen.add(text);
    copy.push(text);
  };

  for (const field of builder.fields) for (const part of field.parts) add(part);
  for (const item of builder.items) for (const part of item.parts) add(part);
  for (const paragraph of builder.paragraphs) add(paragraph);
  for (const link of builder.links) add(link.text);

  return {
    id: builder.id,
    title: builder.title,
    headings: builder.headings,
    fields: builder.fields,
    items: builder.items,
    paragraphs: builder.paragraphs,
    links: builder.links,
    instructions: builder.instructions,
    copy,
  };
}

/** The reason a file could not be read, without printing a stack trace or a configuration value. */
function readFailureReason(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return error instanceof Error ? error.message : 'unknown read error';
}

/**
 * Reads the committed specification and parses it. With no argument it reads
 * `tests/fixtures/website-content-specification.md`, resolved relative to this module rather than
 * to the working directory, so a test run from any directory reads the same document.
 *
 * It throws — naming the document and the reason — when the file is missing, unreadable, empty or
 * whitespace only, or carries `FIXTURE_ABSENT_MARKER`, because a document with no copy in it must
 * never turn into a model that quietly satisfies a fidelity assertion (AAP 0.7.7).
 */
export function loadSpecification(fixturePath?: string): Specification {
  const source = fixturePath === undefined ? DEFAULT_FIXTURE_SOURCE : path.resolve(fixturePath);
  let markdown: string;
  try {
    markdown = readFileSync(source, 'utf8');
  } catch (error: unknown) {
    throw new Error(
      `tests/helpers/spec.ts: cannot read the content specification at ${source} ` +
        `(${readFailureReason(error)}). The fidelity harness has no copy to assert against without it.`,
    );
  }

  if (markdown.includes(FIXTURE_ABSENT_MARKER)) {
    throw new Error(
      `tests/helpers/spec.ts: the content specification at ${source} carries ${FIXTURE_ABSENT_MARKER} ` +
        'and therefore holds no copy at all. The document must be supplied before copy fidelity can be ' +
        'asserted; no string is reconstructed in its place.',
    );
  }
  if (markdown.trim().length === 0) {
    throw new Error(
      `tests/helpers/spec.ts: the content specification at ${source} is empty. ` +
        'An empty document yields no copy, so it is reported rather than parsed.',
    );
  }

  return parseSpecification(markdown, source);
}

/** Prints the model as JSON: every section, or the ones named on the command line. */
function runCli(): void {
  const requested = process.argv.slice(2);

  try {
    const specification = loadSpecification();
    if (requested.length === 0) {
      process.stdout.write(`${JSON.stringify(specification, null, 2)}\n`);
      return;
    }

    const sections: SpecSection[] = [];
    const byId: Partial<Record<SectionId, SpecSection>> = {};
    for (const raw of requested) {
      const token = raw.trim().toUpperCase();
      if (!isSectionId(token)) {
        throw new Error(
          `tests/helpers/spec.ts: "${raw}" is not a section identifier. ` +
            `The document defines ${SECTION_IDS.join(', ')}.`,
        );
      }
      const section = specification.byId[token];
      sections.push(section);
      byId[token] = section;
    }
    process.stdout.write(
      `${JSON.stringify({ source: specification.source, sections, byId }, null, 2)}\n`,
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && path.resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  runCli();
}

