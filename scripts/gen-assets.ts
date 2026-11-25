/**
 * Builds the three image files the site publishes but never keeps in its source tree, and proves
 * the rasteriser can draw the site's own typeface before it draws anything (AAP 0.4.2, 0.8.1, PA-3):
 *
 *   public/favicon.svg           a byte copy of src/illustrations/favicon.svg
 *   public/og-image.png          src/illustrations/og-template.svg at exactly 1200x630, with the
 *                                two social-image strings from src/content/global.ts substituted
 *   public/apple-touch-icon.png  src/illustrations/favicon.svg rasterised at exactly 180x180
 *
 * `public/` is copied verbatim into the build, so those three paths publish as `/favicon.svg`,
 * `/og-image.png` and `/apple-touch-icon.png` with no route, plugin or import. This script is
 * `npm run assets` and the `prebuild` step of `npm run build`, and it reads no configuration and
 * fetches nothing: the same checkout always produces the same bytes (Rule B-1, Rule B-2).
 *
 * The order of work below is a hard requirement rather than a style choice. fontconfig reads
 * `FONTCONFIG_FILE` once per process, so the variable is pinned before the rasteriser is loaded —
 * hence the dynamic `import('sharp')` in `loadSharp()` and the absence of any static import of it
 * in this file. Loading the rasteriser first would bind the host's fonts instead of the
 * repository's and the social image would silently ship in a face the site never chose.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { global } from '../src/content/global.ts';

/** The rasteriser's factory, loaded only once `FONTCONFIG_FILE` is pinned; see `loadSharp()`. */
type SharpFactory = (typeof import('sharp'))['default'];

/** What this script needs to know about the file the rasteriser produced. */
interface RasterSize {
  readonly width: number;
  readonly height: number;
}

/** The font configuration this script pins, relative to the repository root. */
const FONTCONFIG_FILE = join('scripts', 'fonts.conf');

/** The authored SVGs this script reads; the only sources of every pixel it writes. */
const OG_TEMPLATE_FILE = join('src', 'illustrations', 'og-template.svg');
const FAVICON_SOURCE_FILE = join('src', 'illustrations', 'favicon.svg');

/** The three published files, relative to the repository root. */
const OG_OUTPUT_FILE = join('public', 'og-image.png');
const ICON_OUTPUT_FILE = join('public', 'apple-touch-icon.png');
const FAVICON_OUTPUT_FILE = join('public', 'favicon.svg');

/** Published size of the link-preview image, and of the apple-touch-icon. */
const SOCIAL_IMAGE_SIZE = { width: 1200, height: 630 } as const;
const APPLE_TOUCH_ICON_SIZE = 180;
const APPLE_TOUCH_ICON_BOX = {
  width: APPLE_TOUCH_ICON_SIZE,
  height: APPLE_TOUCH_ICON_SIZE,
} as const;

/** SVG user units per CSS inch: at this density one SVG unit rasterises to one pixel. */
const BASE_DENSITY = 72;

/**
 * The markers the template writes as the whole content of its two `<text>` elements, and which
 * become the two content strings. The template documents this contract in its own header.
 */
const TITLE_MARKER = '{{SOCIAL_IMAGE_TITLE}}';
const TEXT_MARKER = '{{SOCIAL_IMAGE_TEXT}}';

/** The probe family that cannot exist, whose render the resolved family's render must differ from. */
const ABSENT_PROBE_FAMILY = 'Probe Family That Does Not Exist';

/** Probe geometry and sample: diagnostics only, never part of any published file. */
const PROBE_CANVAS = { width: 360, height: 80 } as const;
const PROBE_FONT_SIZE = 32;
const PROBE_BASELINE_OFFSET = 20;
const PROBE_SAMPLE = 'Probe 0123';

/**
 * Conservative advance of one Urbanist character as a fraction of the font size. Urbanist's widest
 * lowercase letters sit well under 0.60 em, so a line this estimate calls too wide really is too
 * wide and a line it accepts fits: wrapping may break a line early, and never runs past the slot.
 */
const ADVANCE_EM = 0.6;

/** Fixed encoder settings, so two runs over the same inputs produce identical bytes. */
const PNG_OPTIONS = { compressionLevel: 9 } as const;

/** One `<text>` slot of the social-image template, as the template itself declares it. */
interface Slot {
  /** The marker that is the element's whole content. */
  readonly marker: string;
  /** The template's own name for the slot, used in every message about it. */
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly wrapWidth: number;
  readonly family: string;
}

/** A canvas declared by an SVG's own `width`/`height` attributes or by its `viewBox`. */
interface Canvas {
  readonly width: number;
  readonly height: number;
}

/** What the rasteriser is asked to render, and how. */
interface RasterRequest {
  readonly input: Buffer;
  readonly density?: number;
  readonly size?: { readonly width: number; readonly height: number };
}

/** A failure this script reports as one sentence naming the file, marker, slot or family at fault. */
class AssetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssetError';
  }
}

/** The files already published by this run, so a later failure can report what it left behind. */
const published: string[] = [];

/** Resolves the repository root from this module's own location, so the cwd never matters. */
function repositoryRoot(): string {
  return fileURLToPath(new URL('..', import.meta.url));
}

/**
 * Loads the rasteriser. Dynamic on purpose: fontconfig reads `FONTCONFIG_FILE` once, when the
 * rasteriser initialises, so this must run after `main()` pins the variable.
 */
async function loadSharp(): Promise<SharpFactory> {
  const rasteriser = await import('sharp');
  return rasteriser.default;
}

/** Reads one authored source file, naming the path when it cannot be read. */
async function readSource(path: string): Promise<Buffer> {
  try {
    return await readFile(path);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new AssetError(
      `the source file ${path} cannot be read, so nothing can be generated from it: ${reason}`,
    );
  }
}

/** Escapes a string for XML text and attribute content. */
function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/** Escapes a string so it can be used literally inside a regular expression. */
function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The attribute text of an element's opening tag. */
function openingTag(svg: string, element: string, source: string): string {
  const match = new RegExp(`<${element}\\b([^>]*)>`).exec(svg);
  if (match === null) {
    throw new AssetError(
      `${source} has no <${element}> element, so it is not the image this script knows how to compose.`,
    );
  }
  return match[1] ?? '';
}

/** One attribute's raw value, or `null` when the element does not declare it. */
function readAttribute(attributes: string, name: string): string | null {
  const match = new RegExp(`\\s${name}="([^"]*)"`).exec(attributes);
  return match === null ? null : (match[1] ?? null);
}

/** One attribute parsed as a plain number, naming what was missing when it is not one. */
function readNumber(attributes: string, name: string, context: string): number {
  const raw = readAttribute(attributes, name);
  if (raw === null || !/^-?\d+(?:\.\d+)?$/.test(raw)) {
    throw new AssetError(
      `${context} declares no numeric ${name} attribute, so its geometry cannot be read.`,
    );
  }
  return Number.parseFloat(raw);
}

/** The canvas an SVG declares, from its `width`/`height` attributes or else from its `viewBox`. */
function readCanvas(svg: string, source: string): Canvas {
  const attributes = openingTag(svg, 'svg', source);
  const width = readAttribute(attributes, 'width');
  const height = readAttribute(attributes, 'height');
  if (width !== null && height !== null) {
    return {
      width: readNumber(attributes, 'width', `the root of ${source}`),
      height: readNumber(attributes, 'height', `the root of ${source}`),
    };
  }
  const viewBox = readAttribute(attributes, 'viewBox');
  const parts = viewBox === null ? [] : viewBox.trim().split(/[\s,]+/);
  if (parts.length !== 4) {
    throw new AssetError(
      `${source} declares neither width/height nor a four-part viewBox, so its canvas size is unknown.`,
    );
  }
  const declared = { width: parts[2] ?? '', height: parts[3] ?? '' };
  if (!/^\d+(?:\.\d+)?$/.test(declared.width) || !/^\d+(?:\.\d+)?$/.test(declared.height)) {
    throw new AssetError(`${source} has a viewBox this script cannot read: "${viewBox ?? ''}".`);
  }
  return { width: Number.parseFloat(declared.width), height: Number.parseFloat(declared.height) };
}

/** One substitution slot and the content string that fills it. */
interface Placement {
  readonly slot: Slot;
  readonly value: string;
}

/** Reads one substitution slot out of the template, exactly as the template declares it. */
function readSlot(template: string, marker: string): Slot {
  const element = new RegExp(`<text\\b[^>]*>\\s*${escapeRegExp(marker)}\\s*</text>`).exec(template);
  if (element === null) {
    throw new AssetError(
      `${OG_TEMPLATE_FILE} no longer carries the ${marker} marker as the whole content of one <text> element, so the social image would be published without that string.`,
    );
  }
  const context = `the ${marker} slot of ${OG_TEMPLATE_FILE}`;
  const attributes = openingTag(element[0], 'text', context);
  const family = readAttribute(attributes, 'font-family');
  if (family === null) {
    throw new AssetError(
      `${context} names no font-family, so the rasteriser would choose a face the site never chose.`,
    );
  }
  return {
    marker,
    name: readAttribute(attributes, 'data-slot') ?? marker,
    x: readNumber(attributes, 'x', context),
    y: readNumber(attributes, 'y', context),
    fontSize: readNumber(attributes, 'font-size', context),
    lineHeight: readNumber(attributes, 'data-line-height', context),
    wrapWidth: readNumber(attributes, 'data-wrap-width', context),
    family,
  };
}

/** An upper-bound estimate of a string's rendered width, in the slot's own coordinates. */
function estimateWidth(text: string, slot: Slot): number {
  return text.length * slot.fontSize * ADVANCE_EM;
}

/** Wraps a string greedily at spaces so no estimated line is wider than the slot's wrap width. */
function wrapToWidth(value: string, slot: Slot): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of value.trim().split(/\s+/)) {
    if (estimateWidth(word, slot) > slot.wrapWidth) {
      throw new AssetError(
        `the word "${word}" in the ${slot.name} slot is wider than that slot's ${slot.wrapWidth} wrap width at ${slot.fontSize}, and words are never broken to make one fit.`,
      );
    }
    const candidate = line === '' ? word : `${line} ${word}`;
    if (line !== '' && estimateWidth(candidate, slot) > slot.wrapWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line !== '') {
    lines.push(line);
  }
  return lines;
}

/** Refuses to publish the social image with either of its two strings blank. */
function assertCarriesText(value: string, slot: Slot): void {
  if (value.trim() === '') {
    throw new AssetError(
      `the social image's ${slot.name} string is empty, so ${OG_OUTPUT_FILE} would carry a blank line. Both strings come from src/content/global.ts and are never invented or shortened here.`,
    );
  }
}

/**
 * Refuses a composition that would overflow the frame. A slot has as much height as the next
 * slot's baseline minus its own, and the lowest slot as much as the frame has left below it, the
 * frame's bottom inset being equal to its left inset. Overflow is fixed by shortening the copy,
 * never by shrinking the type.
 */
function assertFits(
  lines: readonly string[],
  slot: Slot,
  slots: readonly Slot[],
  canvas: Canvas,
): void {
  const below = slots
    .filter((other) => other.y > slot.y)
    .sort((first, second) => first.y - second.y)
    .at(0);
  const inset = Math.min(...slots.map((other) => other.x));
  const available = below === undefined ? canvas.height - inset - slot.y : below.y - slot.y;
  const allowed = Math.floor(available / slot.lineHeight);
  if (lines.length > allowed) {
    throw new AssetError(
      `the ${slot.name} slot wraps to ${lines.length} lines but its frame has room for ${allowed} at ${slot.lineHeight} per line, so ${OG_OUTPUT_FILE} would overflow. Shorten the string; the type size is never reduced to make it fit.`,
    );
  }
}

/** Replaces a slot's marker with one `<tspan>` per wrapped line, keeping the element's attributes. */
function replaceSlotContent(svg: string, slot: Slot, lines: readonly string[]): string {
  const pattern = new RegExp(`(<text\\b[^>]*>)\\s*${escapeRegExp(slot.marker)}\\s*(</text>)`);
  const match = pattern.exec(svg);
  if (match === null) {
    throw new AssetError(
      `${OG_TEMPLATE_FILE} no longer carries the ${slot.marker} marker, so it cannot be composed.`,
    );
  }
  // A `<tspan>` without an x continues where the previous line ended, so every line restates x;
  // dy alone would stair-step the lines instead of stacking them left-aligned.
  const tspans = lines
    .map((line, index) =>
      index === 0
        ? `<tspan x="${slot.x}" y="${slot.y}">${escapeXml(line)}</tspan>`
        : `<tspan x="${slot.x}" dy="${slot.lineHeight}">${escapeXml(line)}</tspan>`,
    )
    .join('');
  const opening = match[1] ?? '';
  const closing = match[2] ?? '';
  const before = svg.slice(0, match.index);
  const after = svg.slice(match.index + match[0].length);
  return `${before}${opening}${tspans}${closing}${after}`;
}

/**
 * Substitutes both content strings into the template and returns the markup to rasterise. The
 * markup is composed in memory and never written to the source tree.
 */
function composeSocialImage(
  template: string,
  canvas: Canvas,
  placements: readonly Placement[],
): string {
  const slots = placements.map((placement) => placement.slot);
  let composed = template;
  for (const { slot, value } of placements) {
    assertCarriesText(value, slot);
    const lines = wrapToWidth(value, slot);
    assertFits(lines, slot, slots, canvas);
    composed = replaceSlotContent(composed, slot, lines);
  }
  return composed;
}

/**
 * The probe's SVG: one line of text on a transparent ground. It sets no colour on purpose — the
 * SVG default draws ink, which is all a byte comparison needs, and no colour value is duplicated
 * outside src/styles/theme.css.
 */
function probeSvg(family: string): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PROBE_CANVAS.width}" height="${PROBE_CANVAS.height}">`,
    `<text x="0" y="${PROBE_CANVAS.height - PROBE_BASELINE_OFFSET}" font-family="${escapeXml(family)}" font-size="${PROBE_FONT_SIZE}">${PROBE_SAMPLE}</text>`,
    '</svg>',
  ].join('');
}

/** Renders one buffer to PNG, optionally at a pinned density and a pinned pixel size. */
async function rasterise(
  sharp: SharpFactory,
  request: RasterRequest,
): Promise<{ data: Buffer; info: RasterSize }> {
  const source =
    request.density === undefined
      ? sharp(request.input)
      : sharp(request.input, { density: request.density });
  const sized =
    request.size === undefined
      ? source
      : source.resize(request.size.width, request.size.height, { fit: 'fill' });
  return sized.png(PNG_OPTIONS).toBuffer({ resolveWithObject: true });
}

/**
 * Collects what the rasteriser writes to stderr while `run` executes, so a font failure can quote
 * the diagnostic fontconfig or Pango printed instead of only reporting this script's conclusion.
 */
async function captureStderr<T>(run: () => Promise<T>): Promise<{ result: T; stderr: string }> {
  const original = process.stderr.write;
  const chunks: string[] = [];
  process.stderr.write = ((chunk: string | Uint8Array): boolean => {
    chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  }) as unknown as typeof process.stderr.write;
  try {
    return { result: await run(), stderr: chunks.join('').trim() };
  } finally {
    process.stderr.write = original;
  }
}

/**
 * The two-probe font check of PA-3. Two renders that differ only in font family must differ in
 * bytes: the family the template itself names, drawn through `scripts/fonts.conf`, versus a family
 * that cannot exist. Identical renders mean the rasteriser cannot tell the site's typeface from an
 * absent one — the social image would ship in a fallback face — so the run stops here, before any
 * file is written, and names the remedy instead of substituting a font.
 */
async function assertFontsResolve(sharp: SharpFactory, family: string): Promise<void> {
  const probe = await captureStderr(async () => {
    const resolved = await rasterise(sharp, { input: Buffer.from(probeSvg(family), 'utf8') });
    const absent = await rasterise(sharp, {
      input: Buffer.from(probeSvg(ABSENT_PROBE_FAMILY), 'utf8'),
    });
    return resolved.data.equals(absent.data);
  });
  if (probe.result) {
    const evidence = probe.stderr === '' ? '' : ` The rasteriser reported: ${probe.stderr}`;
    throw new AssetError(
      [
        `the font probes render identically: "${family}" and "${ABSENT_PROBE_FAMILY}" produced the same image, so the rasteriser cannot distinguish the site's own typeface from an absent one and ${OG_OUTPUT_FILE} would ship in a fallback face.`,
        `The rasteriser reads fonts only through ${FONTCONFIG_FILE}, whose single <dir> must be the rasteriser's font directory (src/fonts, holding the TTF copies Urbanist-var.ttf and GeistMono-var.ttf that librsvg can read; the published public/fonts/urbanist-latin-var.woff2 is not readable by every rasteriser).`,
        `PA-3's remedy is to vendor those two variable TTF copies under src/fonts/ for this script alone, never published, with no second font directory. No artefact was written.`,
      ].join(' ') + evidence,
    );
  }
  console.log(
    `fonts: "${family}" and "${ABSENT_PROBE_FAMILY}" render differently, so the local ${family} is the face the rasteriser draws.`,
  );
}

/** Fails when a rendered file would publish at a size other than the one the site expects. */
function assertSize(
  info: RasterSize,
  expected: { readonly width: number; readonly height: number },
  path: string,
): void {
  if (info.width !== expected.width || info.height !== expected.height) {
    throw new AssetError(
      `${path} rendered at ${info.width}x${info.height} instead of ${expected.width}x${expected.height}, so its own declared size and the rasteriser's scale disagree.`,
    );
  }
}

/** Writes one published file, recording it so a later failure can report what it left behind. */
async function publish(path: string, data: Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
  published.push(path);
}

async function main(): Promise<void> {
  process.chdir(repositoryRoot());

  // Pin the font configuration before the rasteriser is loaded: fontconfig reads this variable
  // once per process, and the working directory above is what its <dir prefix="cwd"> resolves to.
  const fontconfig = join(process.cwd(), FONTCONFIG_FILE);
  if (!existsSync(fontconfig)) {
    throw new AssetError(
      `${FONTCONFIG_FILE} is missing (${fontconfig}), so the rasteriser would consult the host's fonts instead of the repository's own and the social image could not be trusted to be in the site's typeface.`,
    );
  }
  process.env.FONTCONFIG_FILE = fontconfig;

  const sharp = await loadSharp();

  const template = (await readSource(OG_TEMPLATE_FILE)).toString('utf8');
  const favicon = await readSource(FAVICON_SOURCE_FILE);

  const canvas = readCanvas(template, OG_TEMPLATE_FILE);
  const titleSlot = readSlot(template, TITLE_MARKER);
  const textSlot = readSlot(template, TEXT_MARKER);
  const faviconCanvas = readCanvas(favicon.toString('utf8'), FAVICON_SOURCE_FILE);
  const placements: Placement[] = [
    { slot: titleSlot, value: global.socialImage.title },
    { slot: textSlot, value: global.socialImage.text },
  ];

  await assertFontsResolve(sharp, titleSlot.family);

  const socialImage = await rasterise(sharp, {
    input: Buffer.from(composeSocialImage(template, canvas, placements), 'utf8'),
  });
  assertSize(socialImage.info, SOCIAL_IMAGE_SIZE, OG_OUTPUT_FILE);
  await publish(OG_OUTPUT_FILE, socialImage.data);
  console.log(`${OG_OUTPUT_FILE}: ${socialImage.info.width}x${socialImage.info.height}`);

  // Rasterise the favicon at the icon's own scale instead of upsampling a 32 px bitmap: one SVG
  // unit is one pixel at 72 dpi, so 72 * (180 / 32) = 405 dpi draws a 32-unit canvas at 180 px, and
  // the resize below only pins the exact pixel size.
  const iconDensity =
    BASE_DENSITY * (APPLE_TOUCH_ICON_SIZE / Math.max(faviconCanvas.width, faviconCanvas.height));
  const icon = await rasterise(sharp, {
    input: favicon,
    density: iconDensity,
    size: APPLE_TOUCH_ICON_BOX,
  });
  assertSize(icon.info, APPLE_TOUCH_ICON_BOX, ICON_OUTPUT_FILE);
  await publish(ICON_OUTPUT_FILE, icon.data);
  console.log(`${ICON_OUTPUT_FILE}: ${icon.info.width}x${icon.info.height}`);

  // The favicon is copied byte for byte rather than re-serialised, so /favicon.svg publishes the
  // authored file itself and no rasteriser ever touches it.
  await publish(FAVICON_OUTPUT_FILE, favicon);
  console.log(`${FAVICON_OUTPUT_FILE}: byte copy of ${FAVICON_SOURCE_FILE}`);
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`gen-assets: ${message}`);
  if (published.length > 0) {
    console.error(`gen-assets: written before the failure: ${published.join(', ')}`);
  }
  process.exitCode = 1;
}
