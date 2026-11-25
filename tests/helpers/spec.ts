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

/**
 * One list item. `parts` are the assertable strings its body yields — split on ` / ` and on `;`,
 * and taken from the field's value when the body also carries the `Name: value` shape — while
 * `text` is the whole body as written, name and colon included.
 */
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

/**
 * The whole document: its nine sections in A0–A8 order, an identifier lookup, and the text that
 * precedes the first section heading.
 */
export interface Specification {
  source: string;
  /**
   * The text recorded before the first section heading, in document order: prose paragraphs joined
   * and normalised exactly as body paragraphs are, plus each field-shaped or bullet-shaped line as
   * its own entry. It is kept so that no line of the document is dropped silently (AAP 0.7.7), and
   * it is not copy, because no section owns it. A document title heading before A0 stays permitted
   * and is not preamble.
   */
  preamble: string[];
  sections: SpecSection[];
  byId: Record<SectionId, SpecSection>;
}

/** The fixture `loadSpecification` reads when no path is given, resolved next to this module. */
const DEFAULT_FIXTURE_SOURCE = fileURLToPath(
  new URL('../fixtures/website-content-specification.md', import.meta.url),
);

/**
 * The named entities a built page or the specification realistically carries: the five markup
 * escapes, the spacing entity, and the typographic and symbol characters a document written in a
 * word processor introduces. A `Map`, not an object literal, so a name that happens to be an
 * inherited property (`constructor`, `valueof`) is unknown here and is left literal like any other
 * unlisted name. The lookup runs case-insensitively, because a DOM may emit `&AMP;`.
 */
const ENTITY_CHARACTERS: ReadonlyMap<string, string> = new Map([
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
  ['reg', '\u00ae'],
  ['trade', '\u2122'],
  ['deg', '\u00b0'],
  ['middot', '\u00b7'],
  ['bull', '\u2022'],
  ['times', '\u00d7'],
  ['laquo', '\u00ab'],
  ['raquo', '\u00bb'],
]);

/**
 * One entity reference, named or numeric, in a single left-to-right pass over the text as written,
 * so each reference is decoded exactly once and `&amp;lt;` becomes `&lt;` rather than `<`.
 */
const ENTITY_PATTERN = /&(#[xX][0-9a-fA-F]+|#\d+|[a-z][a-z0-9]*);/gi;
const LINK_ARROW = '->';
const LINK_SENTINEL_PATTERN = /\u0000(\d+)\u0000/g;
const LINK_TARGET_PREFIX = /^(?:\/|\.\/|https?:\/\/|mailto:|#)/;
const LINK_TARGET_TERMINATOR = /[\s,;)\]}>"'`]/;
/**
 * The longest name a `Name: value` line may carry and still be read as a field. The bound keeps a
 * long prose line that happens to contain a colon out of the field reading, so only a prefix shaped
 * like a field name is taken for one.
 */
const FIELD_NAME_MAX_LENGTH = 80;
const FIELD_PATTERN = new RegExp(`^([^:|<>*#]{1,${FIELD_NAME_MAX_LENGTH}}?):(?:\\s|$)(.*)$`);
/** The same shape without the name bound, used only to recognise a name too long to be a field. */
const FIELD_SHAPE_PATTERN = /^([^:|<>*#]+?):(?:\s|$)(.*)$/;
const INSTRUCTION_PATTERN = /^\[(.+)\](?:[.,;:!?…]*)$/;
/**
 * A line that opens with a square-bracketed span and carries further text after it. Reading rule 6
 * makes a bracketed span an instruction to the builder, which must appear nowhere on the site, while
 * the text after the span on the same line reads as copy; the two readings cannot both hold, so such
 * a line is reported rather than merged (AAP 0.7.7).
 */
const OPENING_BRACKET_SPAN_PATTERN = /^\[[^\]]*\]\s*\S/;
/** The markers an HTML comment opens and closes with. A comment's content is never copy. */
const COMMENT_OPEN = '<!--';
const COMMENT_CLOSE = '-->';
const LIST_ITEM_PATTERN = /^(?:[-*+]|\d{1,3}[.)])\s+(.*)$/;
const HEADING_PATTERN = /^#{1,6}\s+(.*)$/;
const THEMATIC_BREAK_PATTERN = /^([-*_=])\1{2,}$/;
const FENCE_PATTERN = /^(?:```|~~~)/;
const SECTION_TOKEN_PATTERN = /^(?:section\s+|§\s*)?(A[0-8])\b/i;
/** How a report names a line that sits before the first section heading, where no section is open. */
const PREAMBLE_WHERE = 'the text before the first section heading';

/**
 * The one comparison helper both sides of a fidelity assertion use. It decodes the HTML entities a
 * built DOM carries — every numeric character reference, decimal or hexadecimal, plus the named set
 * above — folds `‘` and `’` onto `'` and `“` and `”` onto `"`, collapses every whitespace run to a
 * single space and trims. Decoding runs before folding, so `&#8217;` ends as `'`.
 *
 * Folding is what makes the two sides comparable, and this is the single shared normaliser that
 * does it: a built page's DOM text, the model's strings and the template-residue fixture are all
 * normalised here, so a page that emits a straight apostrophe still matches a document written with
 * a curly one, and no comparison depends on which of the two characters a contributor typed. A
 * second normaliser would let the sides drift apart. Beyond those two quote styles this changes no
 * letter, no case and no other punctuation, and whatever cannot be decoded — an unknown entity
 * name, an unparsable number, a code point a string cannot carry — is left exactly as written.
 */
export function normaliseText(value: string): string {
  const decoded = value.replace(ENTITY_PATTERN, (match: string, body: string): string => {
    if (body.startsWith('#')) {
      const hexadecimal = body[1] === 'x' || body[1] === 'X';
      const codePoint = Number.parseInt(body.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
      const decodable = codePoint > 0 && codePoint <= 0x10ffff
        && (codePoint < 0xd800 || codePoint > 0xdfff);
      return decodable ? String.fromCodePoint(codePoint) : match;
    }
    const character = ENTITY_CHARACTERS.get(body.toLowerCase());
    return character === undefined ? match : character;
  });
  return decoded
    .replace(/[\u2018\u2019]/gu, "'")
    .replace(/[\u201c\u201d]/gu, '"')
    .replace(/\s+/gu, ' ')
    .trim();
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

/**
 * Reports a bullet or prose line that opens with a square-bracketed span and continues with further
 * text, naming the source, the section it sits in, the line itself and why it cannot be read
 * (reading rule 6, AAP 0.7.7). A bracketed span is an instruction to the builder and must appear
 * nowhere, so the text after it can be neither copy nor instruction; the passage is reported rather
 * than merged, and has to be split or rewritten before the document is read. A wholly bracketed body
 * — with or without the sentence punctuation the rule allows after it — is no ambiguity at all, and
 * `bracketedInstruction` takes it.
 */
function rejectPartlyBracketed(text: string, source: string, where: string): void {
  if (bracketedInstruction(text) !== null) return;
  if (!OPENING_BRACKET_SPAN_PATTERN.test(text)) return;
  throw new Error(
    `tests/helpers/spec.ts: ${source} carries a line in ${where} that opens with a square-bracketed ` +
      `span and continues with further text: "${text}". A bracketed span is an instruction to the ` +
      'builder and must appear nowhere on the site, while the text after it reads as copy, so the ' +
      'line cannot be told apart as one or the other: the ambiguity is reported rather than merged, ' +
      'and the passage has to be split or rewritten before the document is read.',
  );
}

/**
 * True when a line can be the wrapped continuation of the field or item above it, which is to say
 * plain prose: a `Name: value` line and a wholly bracketed directive each start a block of their own
 * instead of extending one, so neither is swallowed into the block above it.
 */
function continuesBlock(text: string): boolean {
  return FIELD_SHAPE_PATTERN.test(text) === false && bracketedInstruction(text) === null;
}

/**
 * Splits a `Name: value` line; the name must be followed by whitespace or the end of the line.
 *
 * A `name: value` shape whose name runs past `FIELD_NAME_MAX_LENGTH` is reported instead of being
 * read as prose: the same line can be read as a field or as a prose string, the two readings assert
 * different text, and one line cannot be asserted both ways, so the ambiguity is reported rather
 * than guessed (AAP 0.7.7). A name inside the bound parses as a field exactly as before.
 */
function parseFieldLine(text: string, source: string): { name: string; value: string } | null {
  const match = FIELD_PATTERN.exec(text);
  if (match === null) {
    reportOverlongFieldName(text, source);
    return null;
  }
  const name = (match[1] ?? '').trim();
  const value = (match[2] ?? '').trim();
  if (name.length === 0 || name.includes(' / ')) return null;
  return { name, value };
}

/**
 * Refuses a line shaped like a field whose name is longer than a field name may be. `FIELD_PATTERN`
 * stops recognising the line at the bound, which would otherwise leave the whole line — name and
 * colon included — as an assertable prose string; that reading cannot be reconciled with the field
 * reading of the same line, so the line and the bound it broke are reported instead.
 */
function reportOverlongFieldName(text: string, source: string): void {
  const shape = FIELD_SHAPE_PATTERN.exec(text);
  if (shape === null) return;
  const name = (shape[1] ?? '').trim();
  if (name.length <= FIELD_NAME_MAX_LENGTH) return;
  throw new Error(
    `tests/helpers/spec.ts: ${source} carries a field-shaped line whose name is ` +
      `${name.length} characters long, beyond the ${FIELD_NAME_MAX_LENGTH}-character bound a field ` +
      `name may carry: "${text}". The line reads both as a field and as prose, and one line cannot ` +
      'be asserted both ways, so it is reported rather than guessed.',
  );
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
 *
 * The result also carries `end`, the index just past everything the read consumed — the target
 * together with the trailing punctuation stripped off it — so the caller can continue after that
 * punctuation instead of finding it in the text that follows the pair.
 */
function readLinkTarget(value: string, from: number): { target: string; end: number } | null {
  let end = from;
  while (end < value.length && !LINK_TARGET_TERMINATOR.test(value.charAt(end))) end += 1;
  const target = value.slice(from, end).replace(/[.,;:]+$/, '');
  if (target.length === 0 || !LINK_TARGET_PREFIX.test(target)) return null;
  return { target, end };
}

/**
 * Separates link pairs from a value before any splitting happens (reading rule 5, and the order of
 * operations the document's rules require). Each pair is replaced in the returned `remainder` by a
 * sentinel, so a ` / ` or `;` inside a link's own text can never split it and a target can never
 * become copy. The link array keeps every pair in order, so sentinel indices stay valid.
 *
 * The link text is copy and the space before its arrow is structure, so the text is trimmed of its
 * leading run of spaces and `; , ( / >` markers and of nothing else. That leading run is written
 * back into the remainder ahead of the sentinel, which keeps the document's own separators between
 * two pairs and between a pair and the text that follows it: `See -> /a / Read more -> /b` stays two
 * parts, `Privacy -> /p; Legal -> /l` stays two strings, and `Read -> /a then go -> /b` stays one
 * string reading `Read then go`. Each pair is consumed up to the index `readLinkTarget` reports, so
 * punctuation written after a target is dropped with the target and never joins the text.
 */
function extractLinks(value: string): { remainder: string; links: SpecLink[] } {
  const links: SpecLink[] = [];
  let remainder = '';
  let segmentStart = 0;
  let copiedUpTo = 0;
  let arrowAt = value.indexOf(LINK_ARROW);

  while (arrowAt !== -1) {
    const targetStart = skipSpaces(value, arrowAt + LINK_ARROW.length);
    const linkTarget = readLinkTarget(value, targetStart);
    if (linkTarget === null) {
      arrowAt = value.indexOf(LINK_ARROW, arrowAt + LINK_ARROW.length);
      continue;
    }
    const { target, end: targetEnd } = linkTarget;
    const rawText = value.slice(segmentStart, arrowAt);
    const separator = /^[\s;,(\/>]*/.exec(rawText)?.[0] ?? '';
    const linkText = normaliseText(rawText.slice(separator.length));
    links.push({ text: linkText, href: target });
    remainder += value.slice(copiedUpTo, segmentStart);
    remainder += separator;
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
 * A field or item a wrapped line may still extend, held until the block it belongs to ends. A field
 * keeps its name and the value read so far; a bullet keeps its whole body, because that body may
 * also have the field shape and both readings continue together. The owning section travels with the
 * block, so the block is recorded where it started whatever ends it.
 */
type PendingBlock =
  | { kind: 'field'; name: string; value: string; section: SectionBuilder }
  | { kind: 'bullet'; body: string; section: SectionBuilder };

/**
 * Parses the specification's markdown into the model every fidelity assertion compares against.
 * Pure: no I/O, no clock, no randomness, no network, so the same text always yields the same model.
 *
 * The document's own reading rules are applied in one pass over its lines:
 *
 * 1. A heading that leads with a section identifier opens that section (`## A3 …`); headings are
 *    structure and populate `title` and `headings`, never `copy`.
 * 2. A `Name: value` line is a field: the name and its colon are not copy, only the value is.
 * 3. A list item is split on ` / ` into separately asserted parts, and every bullet is an item: one
 *    whose body also has the field shape is recorded in `fields` and `items` both.
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
 * - A blockquoted line starts a block of its own: it ends the field or the item above it exactly as
 *   a blank line, a heading, a bullet, a fence, a table row, a rule or a comment does, and it is
 *   then read as prose with its `>` marker stripped, joining the prose around it as any prose line
 *   does. Its content is text a reader of the document sees, so leaving it out of `copy` could let
 *   a rendered string go unasserted; merging it into the block above would assert a string the page
 *   never carries, so the two blocks are never joined.
 * - A paragraph is one prose block, so its wrapped lines are joined; paragraph text is not split on
 *   ` / ` or `;`, because rule 3 and rule 4 describe items and values, not prose.
 * - Setext underlines (`===`, `---`) are treated like any other horizontal rule. The document is
 *   written with ATX headings.
 *
 * Two block extents the rules also leave silent are settled in the same direction:
 *
 * - An HTML comment contributes no copy. A line that opens one is dropped, every line of its
 *   interior is dropped with it, and the line that closes it is dropped too, so note text written
 *   inside a comment is never demanded of a page; a line carrying both markers opens and closes the
 *   comment at once. An opening line that also carries text after the closing marker is skipped with
 *   the rest of the line and closes with it, rather than read or left open — the document writes its
 *   comments on lines of their own, and a comment left open would drop every line beneath it.
 * - A field or an item is one block however many lines it occupies. A prose line that follows a
 *   field, a bullet or a field-shaped bullet with no blank line, heading, bullet, directive,
 *   blockquote, field-shaped line, fence, table row, rule or comment between extends that block's
 *   raw text before anything is split or classified, so a value or an item wrapped across lines is
 *   read whole, both readings of a field-shaped bullet see the continuation, and a link it wraps
 *   onto is still extracted as a link. Any of those ends the extension, so a paragraph after a blank
 *   line never absorbs the field above it, and a field written with no value keeps its documented
 *   empty reading (AAP 0.7.4) instead of taking the line beneath it. Prose still joins prose exactly
 *   as before.
 *
 * A line that opens with a square-bracketed span and continues with further text is reported, never
 * read: the span belongs to an instruction and the text after it to copy, so the line cannot be one
 * or the other. The report names the source, the section, the line itself and that reason (AAP
 * 0.7.7), and the passage has to be split before the document can be read. A wholly bracketed body
 * stays an instruction and reaches no other collection.
 *
 * Text before the first section heading is not dropped: it is recorded on the model's `preamble`, a
 * prose paragraph joined and normalised exactly as body paragraphs are and a field-shaped or
 * bullet-shaped line as an entry of its own. A document title heading before A0 names no section, so
 * it stays permitted and is not preamble.
 *
 * A document missing any of A0–A8 throws, naming every missing identifier and the source. So does a
 * document that would yield a model asserting nothing: a section whose `copy` set is empty and a list
 * item whose every part is empty are each reported by name, so a fidelity assertion built on this
 * model can never pass while checking nothing at all (AAP 0.7.7).
 */
export function parseSpecification(markdown: string, sourceLabel?: string): Specification {
  const source = sourceLabel ?? 'the markdown passed to parseSpecification';
  const builders: SectionBuilder[] = [];
  const started = new Set<SectionId>();
  const preamble: string[] = [];
  let current: SectionBuilder | null = null;
  let paragraph: string[] = [];
  let pending: PendingBlock | null = null;
  let inFence = false;
  let inComment = false;

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    const raw = paragraph.join(' ');
    paragraph = [];
    const { remainder, links } = extractLinks(stripEmphasis(raw));
    const text = normaliseText(expandLinks(remainder, links));
    if (current === null) {
      if (text.length > 0) preamble.push(text);
      return;
    }
    pushLinks(current.links, links);
    if (text.length > 0) current.paragraphs.push(text);
  };

  /**
   * Records a bullet's body in the collections reading rules 2, 3 and 6 put it in. A wholly
   * bracketed body is an instruction to the builder and appears in no other collection; a body that
   * also has the `Name: value` shape is recorded in `fields` and `items` both, so `items` keeps the
   * whole body as written and takes its parts from the field's value, the name and its colon staying
   * out of `copy` while no collection that counts items can miss it.
   */
  const recordBullet = (section: SectionBuilder, body: string): void => {
    const instruction = bracketedInstruction(body);
    if (instruction !== null) {
      section.instructions.push(instruction);
      return;
    }
    const field = parseFieldLine(body, source);
    if (field !== null) {
      const built = buildField(field.name, field.value);
      section.fields.push(built);
      pushLinks(section.links, built.links);
      section.items.push({ parts: [...built.parts], text: body, links: [...built.links] });
      return;
    }
    const { remainder, links } = extractLinks(body);
    const parts = partsFromValue(expandLinks(remainder, links));
    if (parts.length === 0) {
      throw new Error(
        `tests/helpers/spec.ts: ${source} carries a list item in ${section.id} whose every part ` +
          `is empty: "${body}". An item with no parts would let a fidelity assertion pass while ` +
          'asserting nothing from it, so it is reported rather than recorded with no parts.',
      );
    }
    section.items.push({ parts, text: body, links });
    pushLinks(section.links, links);
  };

  /**
   * Ends the field or the item a wrapped line may still extend, reading it from the text collected
   * so far. Everything that cannot continue a block ends it: a blank line, a heading, a bullet, a
   * directive, a field-shaped line, a fence, a table row, a rule, a comment and the end of the
   * document.
   */
  const flushPending = (): void => {
    if (pending === null) return;
    const block = pending;
    pending = null;
    if (block.kind === 'field') {
      const built = buildField(block.name, block.value);
      block.section.fields.push(built);
      pushLinks(block.section.links, built.links);
      return;
    }
    recordBullet(block.section, block.body);
  };

  /** Ends every block in progress: the one a continuation may still extend, then a prose paragraph. */
  const flushBlock = (): void => {
    flushPending();
    flushParagraph();
  };

  for (const rawLine of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim();
    const fenceLine = FENCE_PATTERN.test(line);

    if (inFence) {
      if (fenceLine) inFence = false;
      continue;
    }
    if (fenceLine) {
      flushBlock();
      inFence = true;
      continue;
    }
    // An HTML comment contributes no copy: its opening line, every line of its interior and its
    // closing line are dropped together, so note text inside one is never demanded of a page. A
    // line that carries both markers opens and closes the comment at once. An opening line that also
    // carries text after the closing marker is skipped with the rest of the line rather than read,
    // and closes with it, because the document writes its comments on lines of their own and a line
    // left open would drop every line beneath it.
    if (inComment) {
      flushBlock();
      if (line.includes(COMMENT_CLOSE)) inComment = false;
      continue;
    }
    if (line.startsWith(COMMENT_OPEN)) {
      flushBlock();
      inComment = !line.includes(COMMENT_CLOSE);
      continue;
    }
    if (
      line.length === 0 ||
      line.startsWith('|') ||
      line.endsWith(COMMENT_CLOSE) ||
      THEMATIC_BREAK_PATTERN.test(line)
    ) {
      flushBlock();
      continue;
    }

    const headingMatch = HEADING_PATTERN.exec(line);
    if (headingMatch !== null) {
      flushBlock();
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
      flushBlock();
      const body = normaliseText(stripEmphasis(listMatch[1] ?? ''));
      if (body.length === 0) continue;
      rejectPartlyBracketed(body, source, current === null ? PREAMBLE_WHERE : current.id);
      if (current === null) {
        preamble.push(body);
        continue;
      }
      // An instruction is not copy, so nothing continues it: `instructions` keeps the body with its
      // brackets, and the line beneath it reads as the block of its own that it is. Every other
      // bullet is an item — one shaped like a field is read as both when its block ends — and it
      // stays open for a wrapped line to extend.
      if (bracketedInstruction(body) !== null) {
        recordBullet(current, body);
        continue;
      }
      pending = { kind: 'bullet', body, section: current };
      continue;
    }

    // A blockquote line is a block of its own, so it ends the field or the item above it before its
    // own text is read as prose with the `>` marker stripped. Without this the continuation rule
    // below would swallow it into that block and assert a merged string no page carries.
    const blockquote = line.startsWith('>');
    if (blockquote) flushPending();
    const proseSource = blockquote ? line.replace(/^>\s*/, '') : line;
    const prose = normaliseText(stripEmphasis(proseSource));
    if (prose.length === 0) continue;
    rejectPartlyBracketed(prose, source, current === null ? PREAMBLE_WHERE : current.id);
    if (current === null) {
      // Before the first section heading the text is kept on `preamble`. A prose paragraph's lines
      // are joined exactly as a body paragraph's are, while a field-shaped or bracket-only line
      // stands alone as the entry of its own line. Either reading of a field shape records the same
      // text here, so nothing about it is ambiguous and nothing is dropped.
      if (bracketedInstruction(prose) !== null || FIELD_SHAPE_PATTERN.test(prose)) {
        flushBlock();
        preamble.push(prose);
        continue;
      }
      paragraph.push(proseSource);
      continue;
    }
    if (pending !== null) {
      // A prose line with none of the block starts listed above between it and the field or the item
      // above belongs to that block, so a wrapped value or item is read whole and a link it wraps
      // onto is extracted with it. A line that starts a block of its own ends the block above rather
      // than being swallowed into it.
      if (continuesBlock(prose)) {
        if (pending.kind === 'field') pending.value = `${pending.value} ${prose}`;
        else pending.body = `${pending.body} ${prose}`;
        continue;
      }
      flushBlock();
    }
    const instruction = bracketedInstruction(prose);
    if (instruction !== null) {
      flushBlock();
      current.instructions.push(instruction);
      continue;
    }
    const field = parseFieldLine(prose, source);
    if (field !== null) {
      flushBlock();
      // A field written with no value is the documented empty field (AAP 0.7.4), so the line beneath
      // it starts a block of its own instead of being taken as its value.
      if (field.value.length === 0) {
        const built = buildField(field.name, field.value);
        current.fields.push(built);
        pushLinks(current.links, built.links);
        continue;
      }
      pending = { kind: 'field', name: field.name, value: field.value, section: current };
      continue;
    }
    paragraph.push(proseSource);
  }

  flushBlock();

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

  const vacuous = sections
    .filter((section) => section.copy.length === 0)
    .map((section) => section.id);
  if (vacuous.length > 0) {
    throw new Error(
      `tests/helpers/spec.ts: ${source} yields no assertable copy for ${vacuous.join(', ')}. ` +
        'A section whose copy set is empty would let a fidelity assertion pass while asserting ' +
        'nothing at all, so it is reported by name rather than returned as part of a vacuous model.',
    );
  }

  return { source, preamble, sections, byId };
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

/**
 * Prints the model as JSON: the preamble and every section, or the preamble and the sections named
 * on the command line.
 */
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
      `${JSON.stringify(
        { source: specification.source, preamble: specification.preamble, sections, byId },
        null,
        2,
      )}\n`,
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

