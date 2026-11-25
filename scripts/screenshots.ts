/**
 * `npm run screenshots` — the design-review capture aid (AAP 0.6.6, 0.8.1, 0.13.6, WT-20).
 *
 * It builds the site in its **default** configuration — every `PUBLIC_*` value empty, `LAUNCH_CHECK`
 * unset, not live (AAP 0.13.2) — serves that build on loopback, and writes sixteen full-page PNGs:
 * the eight navigable pages at 390 px and at 1440 px, into the git-ignored `screenshots/` folder at
 * the repository root. The page-not-found route is deliberately absent, because the sixteen files
 * are the eight pages at two widths (0.13.6); the 404's appearance is covered by the e2e run and by
 * axe at both widths instead.
 *
 * This is a review aid, not a gate. It is not part of `npm test`, so it can never fail the suite,
 * and its output never enters version control: `.gitignore` carries `screenshots/` and `.build/`,
 * and this script stages and commits nothing.
 *
 * Two jobs belong to other files and are consumed rather than repeated. Build and serve are
 * `tests/helpers/build.ts`'s: `build('default', { outDir })` produces the artefact and
 * `serve(dir, port)` hands it out, so no second build path, static server or MIME table exists here
 * (0.13.2, 0.13.3). The three generated image files the build needs are `npm run assets`'s: when one
 * is missing this script relays the helper's message and stops rather than generating them itself
 * (0.4.2).
 *
 * What the project rules require of this file, and where each is honoured:
 *
 * - **W-1** — the Figma file is layout and style only. Nothing is captured but the site this build
 *   just produced: no template image, logo, place name or string is downloaded, embedded or used in
 *   a filename, and no frame of the Figma file is read.
 * - **B-1** — no runtime request to a third-party host. Every request here goes to `127.0.0.1` on
 *   `SERVER_PORT` — the readiness poll and the eight loads, and nothing else: no hosted screenshot
 *   service, no proxy, no analytics, no remote asset.
 * - **B-2** — no secret and no configured host. This file reads no `PUBLIC_*` value and no
 *   `LAUNCH_CHECK`, because the `default` configuration is the helper's to define and print; the
 *   only host in this file is the loopback address, and no configured value is ever echoed.
 * - **B-3** — WCAG 2.2 AA. This script renders nothing a visitor sees, so its duty is to leave the
 *   page alone: `reducedMotion: 'reduce'` emulates the media query the site's own CSS honours, and
 *   no stylesheet, style attribute or DOM node is injected to make a capture succeed.
 * - **B-4** — nothing invented. The PNGs are evidence of the pages that were just built: no sample
 *   data, no placeholder page, no fabricated state, and no capture of a page this run did not build.
 * - **W-2** — static site only. The server started below is a **review aid over an already-built
 *   directory**: it hands out bytes `astro build` wrote, resolves no route of its own, holds no
 *   session or store, is imported by nothing under `src/`, adds no dependency to the product, and
 *   exists only for the seconds this command runs. Deploying `dist/` needs none of it.
 *
 * The order of work is build -> serve -> readiness poll -> sixteen captures into a staging directory
 * -> promote the complete set. All sixteen or none: any failure deletes the staging directory,
 * leaves `screenshots/` exactly as it was and exits non-zero, so a half-written folder is never the
 * outcome (0.6.6).
 */

import { realpathSync } from 'node:fs';
import { mkdir, open, readdir, rename, rm } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/* Type-only, so this line is erased at runtime and adds no dependency to the command. Chromium
 * itself is loaded through a dynamic import in `launchBrowser` (0.3.3). */
import type { Browser, Page, Response as BrowserResponse } from '@playwright/test';

import { OUT_ROOT, assertGeneratedAssets, build, serve } from '../tests/helpers/build.ts';

/** One page of the review set: the route the server answers, and the stem its files are named by. */
export interface ScreenshotPage {
  /** The route as a visitor and a crawler see it, exactly as `PAGE_PATHS` lists it. */
  readonly route: string;
  /** The file stem this page's captures carry. */
  readonly slug: string;
}

/**
 * The eight navigable routes, in the order the sitemap lists them and the navigation links them.
 *
 * The list is declared here rather than imported: it mirrors `PAGE_PATHS` in
 * `src/pages/sitemap.xml.ts` and the navigation in `src/content/global.ts`, and a review script must
 * not load an Astro endpoint module to obtain a path. The page-not-found route is absent by design —
 * it is `noindex, nofollow`, linked from nowhere, and not one of the sixteen files this command
 * produces (0.4.2, 0.13.6).
 */
export const SCREENSHOT_PAGES: readonly ScreenshotPage[] = [
  { route: '/', slug: 'home' },
  { route: '/platform', slug: 'platform' },
  { route: '/platform/site-intelligence', slug: 'site-intelligence' },
  { route: '/sovereignty', slug: 'sovereignty' },
  { route: '/about', slug: 'about' },
  { route: '/contact', slug: 'contact' },
  { route: '/privacy', slug: 'privacy' },
  { route: '/legal', slug: 'legal' },
];

/** The two widths every page is captured at, in the order a reviewer compares the frames (0.13.6). */
export const SCREENSHOT_WIDTHS = [390, 1440] as const;

/** The folder the complete set lands in, at the repository root, git-ignored (A-8, WT-20). */
export const SCREENSHOT_DIR = 'screenshots';

/** The repository root, resolved from this module's own location so any working directory works. */
const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/**
 * The build's own output directory, under the helper's output root, so a capture run cannot clobber
 * a `default` build another check is using and every artefact this run writes lives in `.build/`.
 */
const OUT_DIR = join(REPOSITORY_ROOT, OUT_ROOT, 'screenshots', 'default');

/** Where the sixteen captures collect until the whole set has succeeded. */
const STAGING_DIR = join(REPOSITORY_ROOT, OUT_ROOT, 'screenshots', 'staging');

/** The published folder, at the repository root. */
const SCREENSHOT_ROOT = join(REPOSITORY_ROOT, SCREENSHOT_DIR);

/**
 * The one port this command serves on, and why it is this one.
 *
 * It must not be 4321, 4322, 4323 or 4324: those belong to `playwright.config.ts`'s four browser
 * projects. 4399 sits below the kernel's ephemeral range, which starts at 32768, so an outgoing
 * connection cannot already hold it, and it is clear of the per-clone preview ports
 * (`43210 + 10 * CLONE_INDEX`) this checkout's instructions assign. The command is a manual review
 * aid that runs one at a time per checkout, so one fixed port is what it needs.
 */
const SERVER_PORT = 4399;

/** The host served from and loaded: loopback only, never `0.0.0.0` and never a hostname (B-1). */
const LOOPBACK_HOST = '127.0.0.1';

/**
 * The capture viewport's height. Widths are the two design widths; the height only has to be a
 * plausible viewport, because every capture is `fullPage` and its height is the page's own.
 */
const VIEWPORT_HEIGHT = 900;

/** How long the served build has to start answering before the run fails, naming the port. */
const READINESS_TIMEOUT_MS = 15_000;

/** One readiness probe's own timeout, and the pause between probes. */
const PROBE_TIMEOUT_MS = 2_000;
const PROBE_INTERVAL_MS = 100;

/** How long one page load may take before it is reported as a failure for that page and width. */
const NAVIGATION_TIMEOUT_MS = 30_000;

/** The PNG signature, and the bytes needed to read the `IHDR` chunk's width and height. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_HEADER_BYTES = 24;

/**
 * The pixel size a PNG's header declares. Exported with `readPngSize`, so the capture's size
 * guarantee is testable without a browser.
 */
export interface PngSize {
  readonly width: number;
  readonly height: number;
}

/** What `serve` hands back: the loopback origin the captures load from, and its shutdown. */
type ServedSite = Awaited<ReturnType<typeof serve>>;

/** One capture waiting in the staging directory to be promoted, and the page and width it came from. */
interface StagedCapture {
  readonly file: string;
  readonly page: ScreenshotPage;
  readonly width: number;
}

/** A throwable as a message, so a failure is always one readable sentence. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A path as a failure message names it: repository-relative when it is inside the checkout. */
function displayPath(path: string): string {
  const relativePath = relative(REPOSITORY_ROOT, path);
  return relativePath === '' || relativePath.startsWith('..') ? path : relativePath;
}

/** The file one page's capture at one width is named by, relative to `screenshots/`. */
export function screenshotFileName(slug: string, width: number): string {
  return `${slug}-${width}.png`;
}

/** Resolves after `ms` milliseconds, for the readiness poll's pause between probes. */
function delay(ms: number): Promise<void> {
  return new Promise<void>((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}

/**
 * The width and height a PNG declares in its `IHDR` chunk, or `null` when the file is not a PNG.
 *
 * Only the first 24 bytes are read: a full-page capture of a long page is several megabytes, and the
 * capture's own size is all this needs to prove. Exported so the size assertion below can be
 * exercised on its own.
 */
export async function readPngSize(file: string): Promise<PngSize | null> {
  const handle = await open(file, 'r');
  try {
    const header = Buffer.alloc(PNG_HEADER_BYTES);
    const { bytesRead } = await handle.read(header, 0, PNG_HEADER_BYTES, 0);
    if (bytesRead < PNG_HEADER_BYTES) {
      return null;
    }
    if (!header.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
      return null;
    }
    /* Bytes 12-16 are the first chunk's type: a PNG opens with IHDR and nothing else. */
    if (header.toString('latin1', 12, 16) !== 'IHDR') {
      return null;
    }
    return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
  } finally {
    await handle.close();
  }
}

/**
 * Proves a capture is a PNG of exactly the width asked for, and at least a viewport tall.
 *
 * `deviceScaleFactor: 1` is what makes the pixel width equal the CSS width, and a full-page capture
 * is never shorter than the viewport it started from; checking both keeps a silently wrong capture
 * — a rescaled image, a viewport crop — out of the review set (0.13.6).
 */
async function assertCapturedSize(file: string, width: number, target: string): Promise<void> {
  const size = await readPngSize(file);
  if (size === null) {
    throw new Error(`${target}: ${displayPath(file)} is not a readable PNG`);
  }
  if (size.width !== width) {
    throw new Error(
      `${target}: ${displayPath(file)} is ${size.width} px wide rather than the ${width} px the capture asks for`,
    );
  }
  if (size.height < VIEWPORT_HEIGHT) {
    throw new Error(
      `${target}: ${displayPath(file)} is ${size.height} px tall, shorter than the ${VIEWPORT_HEIGHT} px viewport, so it is not a full-page capture`,
    );
  }
}

/** Empties and recreates the staging directory, so no earlier run's file can be promoted. */
async function prepareStagingDir(): Promise<void> {
  await rm(STAGING_DIR, { recursive: true, force: true });
  await mkdir(STAGING_DIR, { recursive: true });
}

/**
 * Publishes the complete set: `screenshots/` is ensured, the `*.png` files directly inside it are
 * removed, the sixteen staged files are moved in, and the staging directory goes.
 *
 * Only files are removed, only directly inside `screenshots/`, and nothing outside it is touched. If
 * a move fails the files already moved are removed again, so the folder never ends up holding part
 * of a set (0.6.6).
 */
async function promoteStaging(staged: readonly StagedCapture[]): Promise<void> {
  await mkdir(SCREENSHOT_ROOT, { recursive: true });
  for (const entry of await readdir(SCREENSHOT_ROOT, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) {
      await rm(join(SCREENSHOT_ROOT, entry.name), { force: true });
    }
  }
  const moved: string[] = [];
  try {
    for (const capture of staged) {
      const target = join(SCREENSHOT_ROOT, basename(capture.file));
      await rename(capture.file, target);
      moved.push(target);
    }
  } catch (error) {
    await Promise.all(moved.map((file) => rm(file, { force: true })));
    throw new Error(
      `the captured PNGs could not be moved into ${SCREENSHOT_DIR}/ (${messageOf(error)}); the files already moved were removed, so the folder holds no partial set`,
    );
  }
  await rm(STAGING_DIR, { recursive: true, force: true });
}

/** Shuts something down without masking the failure already being reported. */
async function closeQuietly(what: string, close: () => Promise<void>): Promise<void> {
  try {
    await close();
  } catch (error) {
    console.error(`screenshots: ${what} did not shut down cleanly: ${messageOf(error)}`);
  }
}

/**
 * Waits until the served build answers on its own origin, or fails naming the port and the directory.
 *
 * `serve` returns once it is already listening, so this is a belt-and-braces check rather than the
 * mechanism that makes the run work: it turns "the socket is bound" into "the build answers", and
 * fails with the port, the served directory and the last probe's own message instead of letting the
 * first page load report a bare connection error (0.6.6).
 */
async function waitForServer(origin: string): Promise<void> {
  const deadline = Date.now() + READINESS_TIMEOUT_MS;
  let lastFailure = 'no probe was answered';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      /* The body is drained and discarded: only the answer's existence and status matter. */
      await response.arrayBuffer();
      if (response.status === 200) {
        return;
      }
      lastFailure = `the server answered ${response.status}`;
    } catch (error) {
      lastFailure = messageOf(error);
    }
    await delay(PROBE_INTERVAL_MS);
  }
  throw new Error(
    `${LOOPBACK_HOST}:${SERVER_PORT} did not answer ${origin}/ within ${READINESS_TIMEOUT_MS} ms while serving ${displayPath(OUT_DIR)}: ${lastFailure}`,
  );
}

/** Loads one page, turning a navigation failure into a message that names its route and width. */
async function navigate(tab: Page, url: string, target: string): Promise<BrowserResponse> {
  let response: BrowserResponse | null;
  try {
    response = await tab.goto(url, { waitUntil: 'load', timeout: NAVIGATION_TIMEOUT_MS });
  } catch (error) {
    throw new Error(`${target}: ${url} could not be loaded: ${messageOf(error)}`);
  }
  if (response === null) {
    throw new Error(`${target}: ${url} produced no navigation response`);
  }
  return response;
}

/**
 * Captures one page at one width into `file`, reporting every failure as that page and width.
 *
 * A non-2xx answer, an off-origin redirect, a navigation that fails or times out, a page error and a
 * write that failed are one class of failure here: the file would not be evidence of the delivered
 * page, so it is not kept, and the message says which page and width it was (0.6.6).
 */
async function capturePage(
  browser: Browser,
  origin: string,
  page: ScreenshotPage,
  width: number,
  file: string,
): Promise<void> {
  const target = `${page.route} at ${width} px`;
  const url = `${origin}${page.route}`;
  const pageErrors: string[] = [];
  const context = await browser.newContext({
    viewport: { width, height: VIEWPORT_HEIGHT },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  try {
    const tab = await context.newPage();
    tab.on('pageerror', (error: Error) => {
      pageErrors.push(error.message);
    });
    const response = await navigate(tab, url, target);
    const status = response.status();
    if (status < 200 || status > 299) {
      throw new Error(`${target}: ${url} answered ${status}, so the page was not built`);
    }
    const landed = new URL(response.url());
    if (landed.origin !== origin) {
      throw new Error(`${target}: ${url} left the local origin for ${landed.href}`);
    }
    /* The self-hosted fonts are the last thing a page settles, and a capture taken before they
     * arrive would show a fallback face no visitor sees. */
    await tab.evaluate(async () => {
      await document.fonts.ready;
    });
    await tab.screenshot({ path: file, fullPage: true });
  } finally {
    await context.close();
  }
  const firstPageError = pageErrors[0];
  if (firstPageError !== undefined) {
    throw new Error(`${target}: ${url} raised ${firstPageError}`);
  }
  await assertCapturedSize(file, width, target);
}

/**
 * Captures every page at every width into the staging directory, and returns the complete set.
 *
 * A failing capture does not stop the run: every page and width is still attempted and the failures
 * are folded into one message, so a broken route is named at both widths in a single pass instead of
 * one run at a time. Nothing is promoted unless a full set comes back.
 */
async function captureAll(browser: Browser, origin: string): Promise<readonly StagedCapture[]> {
  await prepareStagingDir();
  const staged: StagedCapture[] = [];
  const failures: string[] = [];
  for (const page of SCREENSHOT_PAGES) {
    for (const width of SCREENSHOT_WIDTHS) {
      const file = join(STAGING_DIR, screenshotFileName(page.slug, width));
      try {
        await capturePage(browser, origin, page, width, file);
        staged.push({ file, page, width });
      } catch (error) {
        failures.push(messageOf(error));
      }
    }
  }
  if (failures.length > 0) {
    const expected = SCREENSHOT_PAGES.length * SCREENSHOT_WIDTHS.length;
    throw new Error(
      `${failures.length} of ${expected} captures failed, so ${SCREENSHOT_DIR}/ was left untouched:\n${failures.map((failure) => `  ${failure}`).join('\n')}`,
    );
  }
  return staged;
}

/**
 * The helper's own generated-asset guard, called before its build so a missing image file is reported
 * as the precondition it is, together with the command that writes it (0.4.2).
 */
function requireGeneratedAssets(): void {
  try {
    assertGeneratedAssets(REPOSITORY_ROOT);
  } catch (error) {
    throw new Error(
      `${messageOf(error)}\nremedy: run \`npm run assets\` first — it writes the three generated image files this build copies into the published output.`,
    );
  }
}

/** Builds the default configuration, failing on the build step and propagating what it printed. */
async function requireBuild(): Promise<void> {
  const result = await build('default', { outDir: OUT_DIR });
  if (result.ok) {
    return;
  }
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  throw new Error(
    `the default build step failed (exit ${result.status}), so there is nothing to capture; its own output is above, and no PNG was written`,
  );
}

/** Serves the build this run just made, failing with the port and directory it could not bind. */
async function startServer(): Promise<ServedSite> {
  try {
    return await serve(OUT_DIR, SERVER_PORT);
  } catch (error) {
    throw new Error(
      `the local review server could not start on ${LOOPBACK_HOST}:${SERVER_PORT} while serving ${displayPath(OUT_DIR)}: ${messageOf(error)}`,
    );
  }
}

/** Starts Chromium, failing with the command that installs its binary when it cannot start. */
async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import('@playwright/test');
  try {
    return await chromium.launch();
  } catch (error) {
    throw new Error(
      `Chromium could not be launched for the captures: ${messageOf(error)}\nremedy: if its binary is missing, run \`npx playwright install chromium\`.`,
    );
  }
}

/** One line per artefact published, then one line naming the folder and its count. */
function report(staged: readonly StagedCapture[]): void {
  for (const capture of staged) {
    const name = screenshotFileName(capture.page.slug, capture.width);
    console.log(`${SCREENSHOT_DIR}/${name}: ${capture.page.route} at ${capture.width} px`);
  }
  console.log(
    `${SCREENSHOT_DIR}/: ${staged.length} full-page PNGs, the ${SCREENSHOT_PAGES.length} navigable pages at ${SCREENSHOT_WIDTHS.join(' px and ')} px`,
  );
}

/**
 * The whole command, in the order 0.6.6 gives it.
 *
 * The nesting is the cleanup contract rather than a style choice: the review server is closed and
 * the staging directory removed whatever happens, and the browser closes before the server it was
 * loading from, so a failure at any step leaves no process still listening on the port.
 */
async function main(): Promise<void> {
  requireGeneratedAssets();
  await requireBuild();

  const server = await startServer();
  try {
    await waitForServer(server.url);
    const browser = await launchBrowser();
    try {
      const staged = await captureAll(browser, server.url);
      await promoteStaging(staged);
      report(staged);
    } finally {
      await closeQuietly('the browser', () => browser.close());
    }
  } finally {
    await closeQuietly('the local review server', () => server.close());
    await rm(STAGING_DIR, { recursive: true, force: true });
  }
}

/**
 * Whether Node was asked to run this file, rather than a test importing it.
 *
 * `node scripts/screenshots.ts` — what `npm run screenshots` runs — is the only entry point. The
 * comparison goes through the real path on both sides, because Node resolves a symlinked checkout
 * before it sets `import.meta.url`; an import of this module therefore builds, serves and captures
 * nothing.
 */
function isEntryPoint(): boolean {
  const invokedPath = process.argv[1];
  if (invokedPath === undefined) {
    return false;
  }
  try {
    return realpathSync(resolve(invokedPath)) === fileURLToPath(import.meta.url);
  } catch {
    /* A path that cannot be resolved is not this file. */
    return false;
  }
}

if (isEntryPoint()) {
  try {
    await main();
  } catch (error) {
    console.error(`screenshots: ${messageOf(error)}`);
    process.exitCode = 1;
  }
}

