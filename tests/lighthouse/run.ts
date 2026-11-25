/**
 * `npm run test:lighthouse` — the four-category quality gate (AAP 0.8.1, 0.13.1 WT-18, 0.13.4).
 *
 * It measures three pages of the **live** build — `/`, `/sovereignty` and `/contact` — three times
 * each, and fails unless the median of the three runs clears 95 in performance, accessibility, best
 * practices and SEO. Those are the four categories the request thresholds and the three pages it
 * names: the page set is not narrowed, the floor is not moved and no audit is switched off, because
 * a gate that can be talked out of a score is not a gate (AAP 0.13.5).
 *
 * **Why the live build.** The default configuration ships `noindex, nofollow` on every page, which
 * fails the SEO category's crawlability audit by design: that withheld site is correct, and it is
 * simply not the state this criterion measures. The four `PUBLIC_*` values and the harness-only
 * `LAUNCH_CHECK=skip` that make a build live belong to `tests/helpers/build.ts`, so this file sets
 * none of them and reads none of them; the artefact measured here is byte-identical to the `live`
 * artefact `tests/e2e` loads.
 *
 * **Why Lighthouse's own defaults.** AAP 0.13.4 fixes "default mobile form factor and throttling",
 * which is exactly what `lighthouse:default` applies when no preset, form factor, throttling,
 * throttling method or screen emulation is overridden — simulated mobileSlow4G throttling on a
 * Moto G-sized viewport. The flags below therefore carry a port, an output format and a log level
 * and nothing else, and there is no Lighthouse config file that could drift from them.
 *
 * **Why three runs and their median.** A single mobile run on a shared host moves by a point or two
 * between attempts. The median of three is the value one noisy run cannot move, which is why 0.13.4
 * fixes it; a mean would let one bad run drag a good page under the floor.
 *
 * What the project rules require of this file, and where each is honoured:
 *
 * - **W-1** — the Figma file is layout and style only. The only pages measured are the project's own
 *   specification routes, and the only strings in this file are route paths, category ids, port
 *   numbers and the harness's own messages: no Figma key, node, frame, template string or place name
 *   appears, and no expectation is copied from a captured baseline.
 * - **B-1** — no runtime request to a third-party host. Every request here goes to `127.0.0.1`: the
 *   served build on `SITE_PORT` and Chrome's DevTools endpoint on `DEVTOOLS_PORT`. Nothing is fetched
 *   from a hosted service and no remote configuration is loaded. Chrome's own update and
 *   safe-browsing chatter is browser chrome rather than site traffic, so no flag suppresses it and no
 *   assertion is relaxed for it.
 * - **B-2** — no secret, and no configuration read. This file reads no environment variable at all
 *   and redeclares none of the four `PUBLIC_*` values; it prints loopback URLs and ports only, never
 *   a configured value.
 * - **B-3** — WCAG 2.2 AA. The axe gate lives in `tests/e2e/a11y.spec.ts`; this file contributes the
 *   Accessibility category at 95 or better, which is why no `onlyCategories`, `skipAudits`,
 *   `blockedUrlPatterns` or custom config is ever passed: `lighthouse:default` decides what runs.
 * - **B-4** — nothing invented. There is no expected-score baseline, no per-page exception list and
 *   no "known failure" allowlist here: a page that misses the floor fails the command the aggregate
 *   `npm test` runs.
 * - **W-2** — static site only. This file starts no application server: the one server it uses is
 *   `tests/helpers/build.ts`'s static file server over an already-built directory, and no API route,
 *   database or sign-in is involved.
 *
 * The order is build -> serve -> preflight -> Chrome -> measure -> report. The preflight runs before
 * any score is taken, so a missing page, a missing `sitemap.xml` or `robots.txt` or a page without a
 * unique title and description is reported as that defect rather than as a mysterious audit loss.
 */

import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { OUT_ROOT, build, serve } from '../helpers/build.ts';
import type { BuildResult, ConfigurationName } from '../helpers/build.ts';

/** The one configuration WT-18 measures: the indexable, form-bearing site the harness builds. */
const CONFIGURATION: ConfigurationName = 'live';

/** The three routes WT-18 names, in the order the summary line prints them. */
const PAGES: readonly string[] = ['/', '/sovereignty', '/contact'];

/** The four Lighthouse categories WT-18 thresholds, by the ids the report keys them with. */
type CategoryId = 'performance' | 'accessibility' | 'best-practices' | 'seo';

/** The four categories, in the order the summary line prints them. */
const CATEGORIES: readonly CategoryId[] = ['performance', 'accessibility', 'best-practices', 'seo'];

/** The short names the summary and failure lines use, so one page fits on one line. */
const CATEGORY_LABELS: Readonly<Record<CategoryId, string>> = {
  performance: 'perf',
  accessibility: 'a11y',
  'best-practices': 'bp',
  seo: 'seo',
};

/** The floor WT-18 states, in the whole-number unit a report and a failure message speak in. */
const SCORE_FLOOR = 95;

/**
 * The same floor in the unit a Lighthouse category score arrives in — a fraction from 0 to 1.
 *
 * Scores are compared against this unrounded value and rounded only for display, so a page scoring
 * 0.949 prints "95" and still fails: the audit is not a rounding game.
 */
const SCORE_FLOOR_FRACTION = SCORE_FLOOR / 100;

/** How many times each page is measured. The median of three is what AAP 0.13.4 fixes. */
const RUNS_PER_PAGE = 3;

/**
 * The two loopback ports this command owns.
 *
 * They must not be 4321-4324: those belong to `playwright.config.ts`'s four browser configurations
 * (strided by ten per checkout index), and `scripts/screenshots.ts` holds 4399. Both are fixed
 * rather than ephemeral because the DevTools port has to be handed to Lighthouse before Chrome
 * starts, and a port the kernel picked could not be announced in advance. Neither sits in the
 * kernel's ephemeral range, which starts at 32768, so no outgoing connection can already hold them.
 */
const SITE_PORT = 4400;
const DEVTOOLS_PORT = 4401;

/** The only host this command contacts, in both roles: loopback, never `0.0.0.0`, never a name. */
const HOST = '127.0.0.1';

/** The repository root, resolved from this module's location so any working directory works. */
const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

/**
 * Where this command's own output lands: the harness's git-ignored output root, never the tracked
 * tree. It holds the Chrome profile for the length of a run and, on a failure, the JSON reports of
 * the runs behind it.
 */
const REPORT_DIR = join(REPOSITORY_ROOT, OUT_ROOT, 'lighthouse');

/**
 * Chrome's profile directory for this run. It is removed in a `finally`, because a profile left
 * behind would grow by a fresh profile on every run.
 */
const PROFILE_DIR = join(REPORT_DIR, 'chrome-profile');

/** How long Chrome has to answer on its DevTools port before the run gives up, naming the port. */
const CHROME_READY_TIMEOUT_MS = 30_000;

/** One DevTools readiness probe's own timeout, and the pause between probes. */
const DEVTOOLS_PROBE_TIMEOUT_MS = 2_000;
const DEVTOOLS_POLL_INTERVAL_MS = 100;

/** How long Chrome gets to exit after `SIGTERM` before it is killed outright. */
const CHROME_EXIT_GRACE_MS = 5_000;

/** How much of Chrome's stderr a failure message quotes: its tail, where the reason is. */
const STDERR_TAIL_CHARS = 4_000;

/** How long one preflight request may take before the served build is treated as unusable. */
const PREFLIGHT_TIMEOUT_MS = 15_000;

/**
 * How long one Lighthouse measurement may take. A simulated-throttling mobile run of a text-only
 * page takes seconds; this bound exists so a wedged run fails with the page and the run index in the
 * message instead of hanging the suite, and a run that hits it is a failure rather than a skip.
 */
const PER_RUN_TIMEOUT_MS = 180_000;

/** The paths the preflight proves exist, because WT-18 requires both files in the built output. */
const SITEMAP_PATH = '/sitemap.xml';
const ROBOTS_PATH = '/robots.txt';

/** A document's `<title>` content, whatever attributes the tag carries. */
const TITLE_PATTERN = /<title[^>]*>([\s\S]*?)<\/title>/i;

/** Every `<meta>` tag, so the description is found whatever order its attributes are written in. */
const META_TAG_PATTERN = /<meta\b[^>]*>/gi;

/** One attribute of a tag, in double or single quotes. Unquoted attributes are not emitted. */
const ATTRIBUTE_PATTERN = /([a-zA-Z_:][-\w:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/**
 * The three flags this command passes, and no others.
 *
 * `port` points Lighthouse at the browser started below, `output: 'json'` is what yields the machine-
 * readable report a score is read from, and `logLevel: 'error'` keeps a run's own chatter out of a
 * CI log. Deliberately absent: every setting that would replace Lighthouse's default mobile form
 * factor and throttling (AAP 0.13.4), and every setting that would narrow or silence an audit
 * (AAP 0.13.5).
 */
interface LighthouseFlags {
  readonly port: number;
  readonly output: 'json';
  readonly logLevel: 'error';
}

/** One category's entry in a Lighthouse report; `score` is a fraction, or `null` when unscored. */
interface LighthouseCategoryResult {
  readonly score?: number | null;
}

/** A navigation failure Lighthouse reports instead of scores: the page was never audited. */
interface LighthouseRuntimeError {
  readonly code?: string;
  readonly message?: string;
}

/**
 * The parts of a Lighthouse report this file reads.
 *
 * Declared here rather than imported from the `lighthouse` package, so a change in that package's
 * published types cannot break this gate's compilation, and so the shape that matters — four scored
 * categories and an optional runtime error — is stated where it is relied on.
 */
interface LighthouseResult {
  readonly categories?: Readonly<Record<string, LighthouseCategoryResult | undefined>>;
  readonly runtimeError?: LighthouseRuntimeError;
}

/** What one Lighthouse call resolves to: the report object, and the serialised form when asked for. */
interface LighthouseRunResult {
  readonly lhr?: LighthouseResult;
  readonly report?: string | readonly string[] | null;
}

/** The callable Lighthouse exports, reduced to the call this file makes. */
type LighthouseRunner = (
  url: string,
  flags: LighthouseFlags,
) => Promise<LighthouseRunResult | null | undefined>;

/** The four scores one run produced, plus the JSON report kept in case that page later fails. */
interface RunOutcome {
  readonly scores: Readonly<Record<CategoryId, number>>;
  readonly reportJson: string | null;
}

/** One page/category result: the three run scores and their median. */
interface Measurement {
  readonly page: string;
  readonly category: CategoryId;
  readonly runs: readonly number[];
  readonly median: number;
}

/** One page's four measurements and the reports behind them. */
interface PageMeasurement {
  readonly page: string;
  readonly rows: readonly Measurement[];
  readonly reports: readonly (string | null)[];
}

/** One measured page as the preflight saw it: the metadata WT-18 requires present and distinct. */
interface PageMetadata {
  readonly page: string;
  readonly title: string;
  readonly description: string;
}

/** The Chrome process this command starts and must stop. */
interface ChromeHandle {
  readonly child: ChildProcess;
  /** The tail of what Chrome wrote to stderr, which is where a startup failure says why. */
  stderrTail(): string;
  /** The spawn error, when the process could not be created at all. */
  spawnError(): string | null;
}

/** A throwable as a message, so a failure is always one readable sentence. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A path as a failure message names it: repository-relative when it lies inside the checkout. */
function displayPath(path: string): string {
  const relativePath = relative(REPOSITORY_ROOT, path);
  return relativePath === '' || relativePath.startsWith('..') ? path : relativePath;
}

/** A category score as a report speaks of it: the whole-number percentage, for display only. */
function displayScore(score: number): string {
  return String(Math.round(score * 100));
}

/** The file stem a page's failure report carries: `/` is `home`, `/a/b` is `a-b`. */
function pageSlug(page: string): string {
  return page === '/' ? 'home' : page.replace(/^\/+/, '').replaceAll('/', '-');
}

/** Resolves after `ms` milliseconds, for the DevTools readiness poll's pause between probes. */
function delay(ms: number): Promise<void> {
  return new Promise<void>((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}

/**
 * Rejects with `label`'s message if `work` has not settled within `ms`.
 *
 * A bound rather than a retry: a run that overruns is reported as a failure for that page and run
 * index, and is never re-attempted into a pass (AAP 0.13.5). The pending work is left to settle on
 * its own — shutting Chrome down is what makes it settle — and its rejection is handled here, so a
 * late failure cannot surface as an unhandled rejection.
 */
function deadline<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolveWork, rejectWork) => {
    const timer = setTimeout(() => {
      rejectWork(
        new Error(
          `${label} did not finish within ${ms} ms, so that page could not be measured; a run that times out fails the gate and is never skipped`,
        ),
      );
    }, ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolveWork(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        rejectWork(error instanceof Error ? error : new Error(messageOf(error)));
      },
    );
  });
}

/**
 * The middle of three scores: the value one noisy run cannot move (AAP 0.13.4).
 *
 * Sorted ascending and indexed at the midpoint rather than averaged, and never rounded here — the
 * comparison in `report` needs the fraction the audit produced.
 */
function medianOf(scores: readonly number[]): number {
  const sorted = [...scores].sort((left, right) => left - right);
  const middle = sorted.at(Math.floor(sorted.length / 2));
  if (middle === undefined) {
    throw new Error(
      `a median was taken of ${sorted.length} run scores, so no page could have been measured; ${RUNS_PER_PAGE} runs are required per page`,
    );
  }
  return middle;
}

/** Resolves once the process has exited, or reports `false` when it is still alive at `ms`. */
function waitForExit(child: ChildProcess, ms: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(true);
  }
  return new Promise<boolean>((resolveExit) => {
    let timer: ReturnType<typeof setTimeout>;
    const onExit = (): void => {
      clearTimeout(timer);
      resolveExit(true);
    };
    child.once('exit', onExit);
    timer = setTimeout(() => {
      child.off('exit', onExit);
      resolveExit(false);
    }, ms);
  });
}

/** One attribute of a tag, as a name-to-value map with the names lower-cased. */
function attributesOf(tag: string): ReadonlyMap<string, string> {
  const attributes = new Map<string, string>();
  for (const match of tag.matchAll(ATTRIBUTE_PATTERN)) {
    const name = match.at(1)?.toLowerCase();
    if (name === undefined || attributes.has(name)) {
      continue;
    }
    attributes.set(name, match.at(2) ?? match.at(3) ?? '');
  }
  return attributes;
}

/** A document's `<title>`, whitespace-normalised, or `null` when it carries none or an empty one. */
function extractTitle(html: string): string | null {
  const title = TITLE_PATTERN.exec(html)?.at(1)?.trim().replace(/\s+/g, ' ');
  return title === undefined || title === '' ? null : title;
}

/**
 * A document's `<meta name="description">` content, whitespace-normalised, or `null` when absent.
 *
 * The tag is found by name rather than by position or attribute order, because both are the build's
 * choice rather than this file's.
 */
function extractMetaDescription(html: string): string | null {
  for (const match of html.matchAll(META_TAG_PATTERN)) {
    const attributes = attributesOf(match.at(0) ?? '');
    if (attributes.get('name')?.toLowerCase() !== 'description') {
      continue;
    }
    const content = (attributes.get('content') ?? '').trim().replace(/\s+/g, ' ');
    return content === '' ? null : content;
  }
  return null;
}

/**
 * The `live` build, through the harness: the only route by which any check obtains one (AAP 0.13.2).
 *
 * A build that reports success while writing no `index.html` is a failure here too, because scoring
 * an empty directory would report on a page that does not exist. The harness's own output is relayed
 * before the failure, since a build error is only readable in the build's own words.
 */
async function requireLiveBuild(): Promise<BuildResult> {
  const result = await build(CONFIGURATION);
  if (!result.ok) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(
      `the ${CONFIGURATION} build failed (exit ${result.status}), so there is nothing to measure; the build's own output is above`,
    );
  }
  if (!existsSync(join(result.outDir, 'index.html'))) {
    throw new Error(
      `the ${CONFIGURATION} build reported success but wrote no index.html into ${displayPath(result.outDir)}, so the home page could not be measured`,
    );
  }
  return result;
}

/** Serves the build this run just made, failing with the port and directory it could not bind. */
async function startServer(dir: string): Promise<Awaited<ReturnType<typeof serve>>> {
  try {
    return await serve(dir, SITE_PORT);
  } catch (error) {
    throw new Error(
      `the ${CONFIGURATION} build could not be served on ${HOST}:${SITE_PORT} while serving ${displayPath(dir)}: ${messageOf(error)}`,
    );
  }
}

/** One request to the served build, with a timeout and a message naming the URL that failed. */
async function request(url: string): Promise<Response> {
  try {
    return await fetch(url, {
      redirect: 'error',
      signal: AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`${url} could not be fetched from the served build: ${messageOf(error)}`);
  }
}

/**
 * One measured page as the served build answers it, or a failure naming the page and the defect.
 *
 * The content type is checked as well as the status, because the harness's server answers an unknown
 * path with a real 404 status — a page that had silently become a 404 fallback would otherwise be
 * measured as though it were the page WT-18 names.
 */
async function readPageMetadata(origin: string, page: string): Promise<PageMetadata> {
  const url = `${origin}${page}`;
  const response = await request(url);
  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
  const html = await response.text();
  if (response.status !== 200) {
    throw new Error(
      `${url} answered ${response.status} rather than 200, so the ${CONFIGURATION} build has no page to measure at ${page}`,
    );
  }
  if (!contentType.includes('text/html')) {
    throw new Error(
      `${url} was served as ${contentType === '' ? 'an unknown content type' : contentType} rather than HTML, so Lighthouse would be measuring something other than the page`,
    );
  }
  const title = extractTitle(html);
  if (title === null) {
    throw new Error(
      `${page}: the served page carries no title, and WT-18 requires a unique title and description on every measured page`,
    );
  }
  const description = extractMetaDescription(html);
  if (description === null) {
    throw new Error(
      `${page}: the served page carries no meta description, and WT-18 requires a unique title and description on every measured page`,
    );
  }
  return { page, title, description };
}

/** Proves the build answers for every measured page, ships both text routes, and is unambiguous. */
async function preflight(origin: string): Promise<void> {
  const metadata: PageMetadata[] = [];
  for (const page of PAGES) {
    metadata.push(await readPageMetadata(origin, page));
  }
  for (const path of [SITEMAP_PATH, ROBOTS_PATH]) {
    const url = `${origin}${path}`;
    const response = await request(url);
    await response.arrayBuffer();
    if (response.status !== 200) {
      throw new Error(
        `${url} answered ${response.status} rather than 200, and WT-18 requires ${path} to exist in the built output`,
      );
    }
  }
  assertDistinct(metadata, 'title');
  assertDistinct(metadata, 'description');
}

/**
 * Fails when two measured pages carry the same title, or the same description.
 *
 * WT-18 requires each page to be uniquely titled and described, and a duplicate is a copy defect a
 * score cannot show: both pages still pass their own audits while competing for one search result.
 * The comparison ignores case and runs of whitespace, so two pages cannot differ only cosmetically.
 */
function assertDistinct(metadata: readonly PageMetadata[], field: 'title' | 'description'): void {
  const seen = new Map<string, string>();
  for (const pageMetadata of metadata) {
    const key = pageMetadata[field].trim().replace(/\s+/g, ' ').toLowerCase();
    const previous = seen.get(key);
    if (previous !== undefined) {
      throw new Error(
        `${pageMetadata.page} and ${previous} share the same ${field}, and WT-18 requires each page a unique ${field}: "${pageMetadata[field]}"`,
      );
    }
    seen.set(key, pageMetadata.page);
  }
}

/**
 * Chromium's executable, as Playwright installed it.
 *
 * Lighthouse drives a browser but never launches one, so the browser is Playwright's own: the same
 * binary `tests/e2e` runs, which keeps the gate and the behaviour suite on one engine (AAP 0.4.1).
 */
function chromiumExecutable(): string {
  let executablePath: string;
  try {
    executablePath = chromium.executablePath();
  } catch (error) {
    throw new Error(
      `Chromium's executable path could not be resolved, so Lighthouse has no browser to drive: ${messageOf(error)}\nremedy: run \`npx playwright install chromium\`.`,
    );
  }
  if (!existsSync(executablePath)) {
    throw new Error(
      `Chromium is not installed at ${executablePath}, so Lighthouse has no browser to drive.\nremedy: run \`npx playwright install chromium\`.`,
    );
  }
  return executablePath;
}

/** Empties and recreates the profile directory Chrome is given, so no earlier run's profile is reused. */
async function prepareChromeProfile(): Promise<void> {
  await rm(PROFILE_DIR, { recursive: true, force: true });
  await mkdir(PROFILE_DIR, { recursive: true });
}

/**
 * The flags Chrome is started with — the minimum this command needs, and nothing that would change
 * what is measured.
 *
 * `--user-data-dir` is mandatory rather than tidy: Chrome 136 and later ignore
 * `--remote-debugging-port` when the browser would use its default profile, so without a profile of
 * its own the DevTools endpoint never appears.
 *
 * `--no-sandbox` is required by the host this gate runs on, which runs as root: without it Chrome
 * exits with "Running as root without --no-sandbox is not supported" and no page is ever measured.
 * It is the setup instructions' own allowance for the container, and it matches the browser
 * `tests/e2e` drives, because Playwright launches Chromium with its sandbox disabled by default. It
 * changes only process isolation: no window size, device-scale factor or user-agent is passed,
 * since each of those would fight the mobile emulation Lighthouse applies itself.
 */
function chromeArguments(): readonly string[] {
  return [
    '--headless=new',
    '--no-sandbox',
    `--remote-debugging-port=${DEVTOOLS_PORT}`,
    `--user-data-dir=${PROFILE_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ];
}

/**
 * Starts Chrome and returns the handle that has to be stopped.
 *
 * Chrome's stderr is kept — the tail of it is where a startup failure explains itself — and its
 * stdout is drained so a full pipe cannot stall the browser. The `error` listener is attached here
 * rather than left to the readiness poll, because an unhandled `error` event would end the process
 * with a stack trace instead of a message naming the browser.
 */
function spawnChrome(executablePath: string): ChromeHandle {
  const child = spawn(executablePath, chromeArguments(), { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  let spawnError: string | null = null;
  child.stdout?.setEncoding('utf8');
  child.stderr?.setEncoding('utf8');
  child.stdout?.on('data', () => {
    /* Drained and discarded: the DevTools banner reads the same on every run. */
  });
  child.stderr?.on('data', (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-STDERR_TAIL_CHARS);
  });
  child.on('error', (error: Error) => {
    spawnError = messageOf(error);
  });
  return { child, stderrTail: () => stderr, spawnError: () => spawnError };
}

/** What Chrome said, for a failure message: its stderr tail, when it wrote one. */
function chromeStderr(handle: ChromeHandle): string {
  const tail = handle.stderrTail().trim();
  return tail === '' ? '' : `; Chrome said: ${tail}`;
}

/**
 * Waits for Chrome's DevTools endpoint to answer, bounded by `CHROME_READY_TIMEOUT_MS`.
 *
 * A browser that exited, or that could not be created at all, fails immediately rather than waiting
 * out the timeout, and every failure here names the port it waited on.
 */
async function waitForDevTools(handle: ChromeHandle): Promise<void> {
  const endpoint = `http://${HOST}:${DEVTOOLS_PORT}/json/version`;
  const giveUpAt = Date.now() + CHROME_READY_TIMEOUT_MS;
  while (Date.now() < giveUpAt) {
    const spawnError = handle.spawnError();
    if (spawnError !== null) {
      throw new Error(
        `Chrome could not be started for the Lighthouse run, so nothing can be measured: ${spawnError}`,
      );
    }
    const exitCode = handle.child.exitCode;
    if (exitCode !== null) {
      throw new Error(
        `Chrome exited with code ${exitCode} before its DevTools endpoint answered on ${HOST}:${DEVTOOLS_PORT}, so no page could be measured${chromeStderr(handle)}`,
      );
    }
    try {
      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(DEVTOOLS_PROBE_TIMEOUT_MS),
      });
      const body = await response.text();
      if (response.ok && body.length > 0) {
        return;
      }
    } catch {
      /* Not listening yet: the next poll asks again until the deadline. */
    }
    await delay(DEVTOOLS_POLL_INTERVAL_MS);
  }
  throw new Error(
    `Chrome did not answer on ${HOST}:${DEVTOOLS_PORT} within ${CHROME_READY_TIMEOUT_MS} ms, so no page could be measured${chromeStderr(handle)}`,
  );
}

/** Starts Chrome, waits for it, and stops it again if it never becomes ready. */
async function startChrome(): Promise<ChromeHandle> {
  const executablePath = chromiumExecutable();
  await prepareChromeProfile();
  const handle = spawnChrome(executablePath);
  try {
    await waitForDevTools(handle);
  } catch (error) {
    await stopChrome(handle);
    throw error;
  }
  return handle;
}

/**
 * Stops Chrome and removes the profile directory.
 *
 * Lighthouse closes only the page it opened and then disconnects, leaving the browser it drove
 * running, so stopping it is this file's job: `SIGTERM` first, which a headless browser honours by
 * shutting itself and its children down, then `SIGKILL` after a grace period. Profile removal is
 * inside the `finally` of the caller as well, so a run that failed before Chrome existed leaves none.
 */
async function stopChrome(handle: ChromeHandle): Promise<void> {
  try {
    if (handle.child.exitCode === null && handle.child.signalCode === null) {
      handle.child.kill('SIGTERM');
      if (!(await waitForExit(handle.child, CHROME_EXIT_GRACE_MS))) {
        handle.child.kill('SIGKILL');
        await waitForExit(handle.child, CHROME_EXIT_GRACE_MS);
      }
    }
  } finally {
    try {
      await rm(PROFILE_DIR, { recursive: true, force: true });
    } catch {
      /* A profile that cannot be removed must not mask the run's own result. */
    }
  }
}

/** One candidate value as the Lighthouse callable, or `null` when it is not a function. */
function asRunner(candidate: unknown): LighthouseRunner | null {
  if (typeof candidate !== 'function') {
    return null;
  }
  /* The one assertion in this file: a function is all this command requires of the package, and the
   * report it resolves to is read through the interfaces above. */
  return candidate as LighthouseRunner;
}

/**
 * Lighthouse's callable, resolved at runtime.
 *
 * The import shape is inspected rather than assumed: an ES module namespace carries the callable as
 * `default`, while an interop shape can hand it back bare, so both are accepted. A package that
 * cannot be imported at all fails with the pinned version in the message, because the fix is an
 * install rather than a code change.
 */
async function loadLighthouse(): Promise<LighthouseRunner> {
  let imported: unknown;
  try {
    imported = await import('lighthouse');
  } catch (error) {
    throw new Error(
      `the lighthouse package could not be imported, so nothing can be measured: ${messageOf(error)}\nremedy: run \`npm install\`; it is pinned at 13.6.0 in devDependencies.`,
    );
  }
  const direct = asRunner(imported);
  if (direct !== null) {
    return direct;
  }
  if (typeof imported === 'object' && imported !== null && 'default' in imported) {
    const fallback = asRunner(imported.default);
    if (fallback !== null) {
      return fallback;
    }
  }
  throw new Error(
    `the lighthouse package resolved to ${typeof imported} without a callable export, so nothing can be measured; it is pinned at 13.6.0 in devDependencies.`,
  );
}

/** The whole measurement: every page, three sequential runs each, on one server and one browser. */
async function measureAll(origin: string): Promise<readonly PageMeasurement[]> {
  const runner = await loadLighthouse();
  const pages: PageMeasurement[] = [];
  for (const page of PAGES) {
    pages.push(await measurePage(runner, origin, page));
  }
  return pages;
}

/** One page measured `RUNS_PER_PAGE` times, its four medians taken, and its reports kept. */
async function measurePage(
  runner: LighthouseRunner,
  origin: string,
  page: string,
): Promise<PageMeasurement> {
  const outcomes: RunOutcome[] = [];
  for (let run = 1; run <= RUNS_PER_PAGE; run += 1) {
    outcomes.push(await measureOnce(runner, `${origin}${page}`, page, run));
  }
  const rows: Measurement[] = CATEGORIES.map((category) => {
    const runs = outcomes.map((outcome) => outcome.scores[category]);
    return { page, category, runs, median: medianOf(runs) };
  });
  return { page, rows, reports: outcomes.map((outcome) => outcome.reportJson) };
}

/** One run of one page: the four scores it produced, or a failure naming the page and run index. */
async function measureOnce(
  runner: LighthouseRunner,
  url: string,
  page: string,
  run: number,
): Promise<RunOutcome> {
  const flags: LighthouseFlags = { port: DEVTOOLS_PORT, output: 'json', logLevel: 'error' };
  const result = await deadline(
    runner(url, flags),
    PER_RUN_TIMEOUT_MS,
    `${page} run ${run} of ${RUNS_PER_PAGE}`,
  );
  if (result === null || result === undefined) {
    throw new Error(
      `${page} run ${run} of ${RUNS_PER_PAGE}: lighthouse produced no result, so the page was not measured`,
    );
  }
  const lhr = result.lhr;
  if (lhr === undefined) {
    throw new Error(
      `${page} run ${run} of ${RUNS_PER_PAGE}: lighthouse produced no report object, so the page was not measured`,
    );
  }
  if (lhr.runtimeError !== undefined) {
    throw new Error(
      `${page} run ${run} of ${RUNS_PER_PAGE}: the page could not be audited — ${describeRuntimeError(lhr.runtimeError)}`,
    );
  }
  return { scores: scoresOf(lhr, page, run), reportJson: reportJsonOf(result) };
}

/** A Lighthouse runtime error as one readable clause: its code, then its message. */
function describeRuntimeError(error: LighthouseRuntimeError): string {
  const code = error.code === undefined || error.code === '' ? 'no code' : error.code;
  const message = error.message === undefined || error.message === '' ? 'no message' : error.message;
  return `${code} (${message})`;
}

/**
 * The four category scores from one report.
 *
 * A category the report does not carry, or carries with a `null` score, fails the page: an unscored
 * category is a measurement that did not happen, and counting it as a pass would be the invented
 * result rule B-4 forbids. The record is assembled from `CATEGORIES`, so the ids read are the ids
 * the report is thresholded on.
 */
function scoresOf(
  lhr: LighthouseResult,
  page: string,
  run: number,
): Readonly<Record<CategoryId, number>> {
  const entries = CATEGORIES.map((category) => {
    const score = lhr.categories?.[category]?.score;
    if (score === undefined || score === null) {
      throw new Error(
        `${page} run ${run} of ${RUNS_PER_PAGE}: the ${category} category is missing from the Lighthouse report, so that page has no score to threshold`,
      );
    }
    return [category, score] as const;
  });
  return Object.fromEntries(entries) as Record<CategoryId, number>;
}

/** The serialised report behind a run, kept only so a failing page can be diagnosed. */
function reportJsonOf(result: LighthouseRunResult): string | null {
  if (typeof result.report === 'string') {
    return result.report;
  }
  return result.lhr === undefined ? null : JSON.stringify(result.lhr);
}

/**
 * The verdict: one summary line when every median clears the floor, one line per failing pair when
 * any does not, and the exit code the aggregate `npm test` turns into a failing run.
 *
 * Both halves are compared on the unrounded fraction (`SCORE_FLOOR_FRACTION`) and rounded only for
 * the text, so the printed number is the evidence rather than the decision.
 */
async function reportAll(pages: readonly PageMeasurement[]): Promise<number> {
  const summary: string[] = [];
  const failures: string[] = [];
  const failingPages = new Set<string>();
  for (const pageMeasurement of pages) {
    summary.push(
      `${pageMeasurement.page} ${pageMeasurement.rows
        .map((row) => `${CATEGORY_LABELS[row.category]} ${displayScore(row.median)}`)
        .join(' / ')}`,
    );
    for (const row of pageMeasurement.rows) {
      if (row.median < SCORE_FLOOR_FRACTION) {
        failingPages.add(row.page);
        failures.push(
          `FAIL ${row.page} ${row.category} — runs ${row.runs.map(displayScore).join(', ')} — median ${displayScore(row.median)} < ${SCORE_FLOOR} (floor ${SCORE_FLOOR})`,
        );
      }
    }
  }
  if (failures.length === 0) {
    console.log(
      `lighthouse ${CONFIGURATION}: ${PAGES.length} pages × ${CATEGORIES.length} categories ≥ ${SCORE_FLOOR} (medians: ${summary.join('; ')})`,
    );
    return 0;
  }
  for (const failure of failures) {
    console.error(failure);
  }
  await writeDiagnostics(pages.filter((pageMeasurement) => failingPages.has(pageMeasurement.page)));
  return 1;
}

/**
 * Writes the JSON report of each run behind a failing page, under the git-ignored output root.
 *
 * Diagnosis only: nothing is read back from these files, and they land nowhere near the tracked tree
 * — never in `tests/`, `src/`, `scripts/` or the repository root.
 */
async function writeDiagnostics(failingPages: readonly PageMeasurement[]): Promise<void> {
  if (failingPages.length === 0) {
    return;
  }
  await mkdir(REPORT_DIR, { recursive: true });
  const written: string[] = [];
  for (const pageMeasurement of failingPages) {
    const slug = pageSlug(pageMeasurement.page);
    for (const [index, json] of pageMeasurement.reports.entries()) {
      if (json === null) {
        continue;
      }
      const name = `${slug}-run${index + 1}.report.json`;
      await writeFile(join(REPORT_DIR, name), json, 'utf8');
      written.push(name);
    }
  }
  if (written.length > 0) {
    console.error(
      `lighthouse: wrote ${written.length} JSON report(s) for the failing pages to ${displayPath(REPORT_DIR)}`,
    );
  }
}

/**
 * The whole command, in the order the gate depends on.
 *
 * The nesting is the cleanup contract: Chrome is stopped before the server it was loading from is
 * closed, both happen whatever the outcome, and the harness's build directory is left in place
 * because it is the `live` artefact `tests/e2e` loads too.
 */
async function main(): Promise<number> {
  const built = await requireLiveBuild();
  const server = await startServer(built.outDir);
  try {
    await preflight(server.url);
    const chrome = await startChrome();
    try {
      return await reportAll(await measureAll(server.url));
    } finally {
      await stopChrome(chrome);
    }
  } finally {
    try {
      await server.close();
    } catch (error) {
      console.error(`lighthouse: the preview server on ${HOST}:${SITE_PORT} could not be closed: ${messageOf(error)}`);
    }
  }
}

/**
 * Whether Node was asked to run this file, rather than something importing it.
 *
 * `node tests/lighthouse/run.ts` — what `npm run test:lighthouse` runs — is the only entry point. The
 * comparison goes through the real path on both sides, because Node resolves a symlinked checkout
 * before it sets `import.meta.url`; an import of this module therefore measures nothing.
 */
function isEntryPoint(): boolean {
  const invokedPath = process.argv.at(1);
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
    process.exitCode = await main();
  } catch (error) {
    console.error(`lighthouse: ${messageOf(error)}`);
    process.exitCode = 1;
  }
}

