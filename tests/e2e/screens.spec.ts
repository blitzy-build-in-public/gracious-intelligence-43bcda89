/**
 * WT-12 — the three product-screen frames on `/platform/site-intelligence` and their two designed
 * states, driven against the real built pages of every browser configuration.
 *
 * The page presents the owner's three screenshots, and none of them has arrived yet. So each frame
 * has exactly two states and the build decides which one it is in: the screenshot when that file was
 * present under `public/screens/` at build time, and otherwise a neutral panel carrying the designed
 * fallback label with the frame's caption still beneath it (AAP 0.7.4, FR-10). The `screens`
 * configuration supplies one probe PNG and leaves the other two absent, which is the only way to
 * observe the mixed state: one frame with its image, two still degraded (AAP 0.13.2).
 *
 * What this file proves, and what it deliberately leaves to its siblings. WT-12 is the whole of its
 * scope: three captioned frames, the fallback panel in the absent state, the supplied image in the
 * supplied state, a panel that is not a control, no image or request from outside the page's own
 * origin, and captions that survive the fallback. Copy fidelity — the exact wording of the fallback
 * label and of the captions — belongs to `tests/static/output.test.ts` (WT-15), so nothing here
 * asserts a string. The label is compared against itself across frames and the captions are asserted
 * present, which is what lets this suite run unchanged while the content layer still carries the
 * project's placeholder marker (AAP 0.7.7, 0.16.2).
 *
 * The two states are branches of the same tests rather than exclusions: `default`, `live` and `mailto`
 * ship no screenshot and assert the degraded strip, and `screens` asserts the one-image strip. Every
 * test asserts something real in whichever configuration it runs under.
 *
 * What the project rules require of this file, and where each is honoured:
 *
 * - **W-1** — the design reference supplies layout only. Nothing here names a template node, frame,
 *   photograph or place, and the one image the suite will accept is an owner-supplied `/screens/`
 *   path: a frame showing anything else is a failure, so no borrowed image could pass as a product
 *   screen.
 * - **B-1** — no runtime request to a third-party host. The origin check below fails on any request
 *   that leaves the page's own origin, which is the complement of the bundled fonts and icons the
 *   site ships, and the image-source check confines the strip to a site-relative `/screens/` path.
 * - **B-2** — no credential and no configuration read. The presence of the probe is derived from
 *   the Playwright project's own name, never from an environment variable and never from the file
 *   system, so neither this file nor the run holds one.
 * - **B-3** — WCAG 2.2 AA. The absent state must stay readable text rather than an empty box, so the
 *   fallback is asserted through the DOM's own text and the frame's caption, and a panel is required
 *   to offer no focus stop and no control of any kind.
 * - **B-4** — no invented content and no dead control. A panel that looked clickable would be a dead
 *   control, so the frames are asserted to contain no anchor, button, link role, tab stop or click
 *   handler; and a missing screenshot may never be silently replaced by a stand-in image.
 * - **W-2** — static site only. Everything asserted here is delivered as a built file; the probe is
 *   written and removed by the build harness, never by this suite, and no route answers at run time.
 *
 * Build and serve are the harness's: `playwright.config.ts` gives each of the four projects its own
 * freshly built directory and its own served port, so this file writes no port, no host and no URL.
 */

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/** The one route that carries the three product-screen frames (AAP 0.4.2, 0.8.4). */
const SCREEN_PATH = '/platform/site-intelligence';

/** The screen the `screens` configuration supplies, named as `tests/helpers/build.ts` names it. */
const PROBE_KEY = 'investigate';

/**
 * Where that screen is published. Derived from the key rather than restated as a second literal, so
 * the probe's name has one source here and the path cannot drift from it: `public/` is copied
 * verbatim into the build, so a file at `public/screens/investigate.png` is served here.
 */
const PROBE_SRC: string = `/screens/${PROBE_KEY}.png`;

/**
 * The four configurations a browser reaches this page in (AAP 0.13.2). Read from the project name
 * rather than hard-coded per test, so one spec covers every state of the strip.
 */
const CONFIGURATIONS = ['default', 'live', 'mailto', 'screens'] as const;

/** One of the four browser configurations. */
type Configuration = (typeof CONFIGURATIONS)[number];

/**
 * How the frames were found: the captioned-figure structure the component is built from, or the
 * list fallback. Recorded in the run's annotations so a reviewer can see which one the rendered
 * page satisfied without reading a passing run's log.
 */
type FrameKind = 'figure' | 'list';

/**
 * One frame, read out of the DOM once: everything the assertions below need about its two states.
 *
 * Read as a single snapshot per frame so an assertion can never compare a caption from one render
 * with an image from another, and so a failure can quote the markup it saw.
 */
interface FrameReading {
  /** How many `figcaption` elements the frame carries: exactly one in both states. */
  figcaptions: number;
  /** The frame's caption text, collapsed to single spaces: present whether or not its image is. */
  caption: string;
  /** The frame's text with the caption removed — the fallback label, or empty when it shows a screenshot. */
  label: string;
  /** The image's `src`, or `null` when the frame is degraded to the panel. */
  imageSrc: string | null;
  /** The image's `alt`, collapsed; empty when there is no image. */
  imageAlt: string;
  /** The image's `loading` attribute value, or `null`. */
  imageLoading: string | null;
  /** The image's `width` attribute as a number, or `0` when absent, unparsable or there is no image. */
  imageWidth: number;
  /** The image's `height` attribute as a number, or `0` when absent, unparsable or there is no image. */
  imageHeight: number;
  /** The decoded pixel width of a loaded image: `0` until the file has been fetched and decoded. */
  naturalWidth: number;
  /** The start of the frame's `outerHTML`, so a failure names the markup it saw. */
  html: string;
}

/** What one frame-resolution attempt produced. */
interface FrameResolution {
  /** The three frames, in page order. */
  frames: Locator;
  /** Which documented locator found them. */
  kind: FrameKind;
}

/** The configuration under test, resolved once per test from the Playwright project name. */
let configuration: Configuration;

/** Whether this configuration supplies the probe screenshot, which is the whole of the state bit. */
let probeSupplied: boolean;

/** The three frames of the strip, located before each test. */
let frames: Locator;

/** Which locator found the frames. */
let frameKind: FrameKind;

/** Every URL the page requested during the test, including the document, in request order. */
let requestUrls: string[];

/** Every response the page received from the `/screens/` drop point, in response order. */
let screenResponses: { url: string; status: number }[];

/**
 * The configuration this pass is running under.
 *
 * Named from the Playwright project rather than passed in, because the project name is the contract
 * `playwright.config.ts` publishes to every spec. A name outside the four is a configuration drift
 * that would silently leave a state unasserted, so it fails here instead.
 */
function configurationOf(): Configuration {
  const name = test.info().project.name;
  const found = CONFIGURATIONS.find((candidate: Configuration): boolean => candidate === name);
  if (found === undefined) {
    throw new Error(
      `the Playwright project is named "${name}", which is not one of the four browser configurations playwright.config.ts declares (${CONFIGURATIONS.join(', ')}); a fifth name would leave the product-screen states this suite proves unchecked`,
    );
  }
  return found;
}

/** Whether a frame is in its degraded state: the panel and its label, with no image. */
function isDegraded(reading: FrameReading): boolean {
  return reading.imageSrc === null;
}

/**
 * The frames, tried in the order the component's own contract allows.
 *
 * A captioned image is a `figure` with a `figcaption`, which is the structure `ScreenFrames.astro`
 * emits; a list of captioned items is the fallback for a rendering that wraps each frame in an `li`
 * instead. Exactly three frames are required either way, because the page presents three product
 * screens. No component class is guessed at, so restyling the strip cannot break this suite.
 */
async function resolveFrames(page: Page): Promise<FrameResolution> {
  const figures = page.locator('main figure').filter({ has: page.locator('figcaption') });
  const figureCount = await figures.count();
  if (figureCount === 3) {
    return { frames: figures, kind: 'figure' };
  }

  const items = page
    .locator('main li')
    .filter({ has: page.locator('img[src^="/screens/"], figcaption') });
  const itemCount = await items.count();
  if (itemCount === 3) {
    return { frames: items, kind: 'list' };
  }

  const head = await page
    .locator('main')
    .evaluate((element: HTMLElement): string => element.outerHTML.slice(0, 600))
    .catch((): string => '(the page carries no <main> element to read)');

  throw new Error(
    `the product-screen frames could not be located on ${SCREEN_PATH} in the "${configurationOf()}" configuration: ${figureCount} "main figure" frame(s) with a figcaption and ${itemCount} captioned "main li" frame(s) were found where the page presents three. src/components/ScreenFrames.astro must emit three captioned frames — a figure with a figcaption per screen — and the page must render all three. The page's main region starts: ${head}`,
  );
}

/**
 * Everything one frame says about itself, read in a single pass over its DOM.
 *
 * The label is the frame's text with the caption's subtree removed, so a degraded frame's label is
 * read without guessing at a class or a tag and without depending on where the label sits. The
 * image fields are `null` or `0` for a degraded frame, which is what makes the two states
 * distinguishable by data rather than by wording.
 */
async function readFrame(frame: Locator): Promise<FrameReading> {
  return frame.evaluate((element: HTMLElement): FrameReading => {
    const collapse = (value: string | null): string => (value ?? '').replace(/\s+/g, ' ').trim();
    const captions = element.querySelectorAll('figcaption');
    const caption = collapse(captions[0]?.textContent ?? '');
    const withoutCaption = element.cloneNode(true) as HTMLElement;
    for (const node of Array.from(withoutCaption.querySelectorAll('figcaption'))) {
      node.remove();
    }
    const image = element.querySelector('img');
    const width = Number.parseInt(image?.getAttribute('width') ?? '', 10);
    const height = Number.parseInt(image?.getAttribute('height') ?? '', 10);
    return {
      figcaptions: captions.length,
      caption,
      label: collapse(withoutCaption.textContent),
      imageSrc: image?.getAttribute('src') ?? null,
      imageAlt: collapse(image?.getAttribute('alt') ?? ''),
      imageLoading: image?.getAttribute('loading') ?? null,
      imageWidth: Number.isNaN(width) ? 0 : width,
      imageHeight: Number.isNaN(height) ? 0 : height,
      naturalWidth: image?.naturalWidth ?? 0,
      html: element.outerHTML.slice(0, 240),
    };
  });
}

/** Every frame of the strip, in page order. */
async function readFrames(): Promise<FrameReading[]> {
  const count = await frames.count();
  const readings: FrameReading[] = [];
  for (let index = 0; index < count; index += 1) {
    readings.push(await readFrame(frames.nth(index)));
  }
  return readings;
}

/**
 * The frame that carries the supplied screenshot, or `-1` when every frame is degraded.
 *
 * At most one frame may reach this state: the harness supplies exactly one probe, so two frames with
 * images would mean the build read a file the configuration never placed there.
 */
function imageFrameIndex(readings: readonly FrameReading[]): number {
  return readings.findIndex((reading: FrameReading): boolean => !isDegraded(reading));
}

/** The indexes of the degraded frames, in page order. */
function degradedIndexes(readings: readonly FrameReading[]): number[] {
  return readings
    .map((reading: FrameReading, index: number): number => (isDegraded(reading) ? index : -1))
    .filter((index: number): boolean => index >= 0);
}

/**
 * A failure's closing context: which configuration, which strip and which frame a problem came from.
 * Every message below ends with it, so a red run names the state to reproduce without a re-run.
 */
function contextFor(index: number, reading: FrameReading): string {
  return `configuration "${configuration}" (${frameKind === 'figure' ? 'main figure' : 'main list'} frames), frame ${index} of 3, markup: ${reading.html}`;
}

/**
 * Reads the page before every test: one navigation, the three frames, and the two recorders the
 * origin and response assertions need. Both recorders are attached before the navigation, so the
 * document request and every file the page loads are captured rather than missed.
 */
test.beforeEach(async ({ page }): Promise<void> => {
  configuration = configurationOf();
  probeSupplied = configuration === 'screens';
  requestUrls = [];
  screenResponses = [];

  page.on('request', (request): void => {
    requestUrls.push(request.url());
  });
  page.on('response', (response): void => {
    if (new URL(response.url()).pathname.startsWith('/screens/')) {
      screenResponses.push({ url: response.url(), status: response.status() });
    }
  });

  await page.goto(SCREEN_PATH);

  const resolution = await resolveFrames(page);
  frames = resolution.frames;
  frameKind = resolution.kind;
  test.info().annotations.push({ type: 'frame-locator', description: frameKind });
});

test('WT-12 default/live/mailto/screens — the page renders exactly three captioned product-screen frames', async (): Promise<void> => {
  const readings = await readFrames();
  const problems: string[] = [];

  if (readings.length !== 3) {
    problems.push(
      `the strip carries ${readings.length} frame(s) where the page presents three product screens, one per screen — configuration "${configuration}"`,
    );
  }

  readings.forEach((reading: FrameReading, index: number): void => {
    if (reading.figcaptions !== 1) {
      problems.push(
        `frame ${index} carries ${reading.figcaptions} caption element(s) where every frame is captioned exactly once — ${contextFor(index, reading)}`,
      );
    }

    const showsImage = reading.imageSrc !== null;
    const showsPanel = reading.label !== '';
    if (showsImage === showsPanel) {
      problems.push(
        `frame ${index} shows ${showsImage ? 'an image and the fallback label together' : 'neither an image nor a fallback label'} where a frame is in exactly one of its two designed states — ${contextFor(index, reading)}`,
      );
    }

    if (reading.imageSrc !== null && !reading.imageSrc.startsWith('/screens/')) {
      problems.push(
        `frame ${index} shows the image "${reading.imageSrc}", which is not a site-relative /screens/ path; only an owner-supplied screenshot may fill a frame (WT-08, rule W-1) — ${contextFor(index, reading)}`,
      );
    }
  });

  expect(
    problems,
    `the product-screen strip is not three captioned frames in one designed state each (WT-12, AAP 0.7.4):\n${problems.map((entry: string): string => `  - ${entry}`).join('\n')}`,
  ).toEqual([]);
});

test('WT-12 absent state (default, live, mailto) and its mixed counterpart (screens) — every unsupplied frame degrades to the designed panel and keeps its caption', async ({ page }): Promise<void> => {
  const readings = await readFrames();
  const expected = probeSupplied ? 2 : 3;
  const degraded = degradedIndexes(readings);
  const problems: string[] = [];

  if (degraded.length !== expected) {
    problems.push(
      `${degraded.length} frame(s) are degraded where this configuration leaves ${expected} without a screenshot — configuration "${configuration}" ${probeSupplied ? `supplies only the "${PROBE_KEY}" screen` : 'publishes no screen under public/screens/'}`,
    );
  }

  for (const index of degraded) {
    const reading = readings[index];
    if (reading.label === '') {
      problems.push(
        `frame ${index} is degraded but shows no fallback label, so the slot renders an empty box instead of the site's honest fallback. The label is content copy and arrives from src/content/site-intelligence.ts (screens.fallbackLabel) — ${contextFor(index, reading)} (rule B-4)`,
      );
    }
  }

  const labels = new Set(
    degraded
      .map((index: number): string => readings[index].label)
      .filter((label: string): boolean => label !== ''),
  );
  if (labels.size > 1) {
    problems.push(
      `the ${degraded.length} degraded frame(s) show ${labels.size} different labels (${[...labels].map((label: string): string => `"${label}"`).join(', ')}); one designed fallback is supplied for the whole strip in src/content/site-intelligence.ts, so two labels mean one frame is saying something the others are not — configuration "${configuration}"`,
    );
  }
  if (degraded.length > 0 && labels.size === 0) {
    problems.push(
      `none of the ${degraded.length} degraded frame(s) shows a fallback label at all — configuration "${configuration}". The label is screens.fallbackLabel in src/content/site-intelligence.ts and an absent one leaves an empty box (rule B-4)`,
    );
  }

  // The page ships no raster of its own, so an image here would be a stand-in for a screenshot that
  // does not exist — the one thing the degraded state may never do (rules B-4, W-1).
  const images = await page.locator('main img').count();
  const expectedImages = probeSupplied ? 1 : 0;
  if (images !== expectedImages) {
    problems.push(
      `the page's main region carries ${images} <img> element(s) where this configuration publishes ${expectedImages} screenshot(s); a frame whose PNG is absent degrades to the panel rather than pointing at a file that is not there or at anything drawn in its place — configuration "${configuration}"`,
    );
  }

  expect(
    problems,
    `the degraded product-screen frames are not in their designed state (WT-12, AAP 0.7.4):\n${problems.map((entry: string): string => `  - ${entry}`).join('\n')}`,
  ).toEqual([]);
});

test('WT-12 supplied state (screens) and its negative control (default, live, mailto) — a supplied screenshot takes its own frame and leaves the other two degraded', async (): Promise<void> => {
  const readings = await readFrames();
  const suppliedIndex = imageFrameIndex(readings);

  if (!probeSupplied) {
    /*
     * The negative control for the supplied half below. This configuration publishes no screenshot,
     * so the assertions here are what keep the supplied branch from being the only thing proved: no
     * frame may show an image, and the probe's own frame must be degraded.
     */
    const problems: string[] = [];
    if (suppliedIndex !== -1) {
      problems.push(
        `frame ${suppliedIndex} shows the image "${readings[suppliedIndex].imageSrc ?? ''}" although no screenshot is published under public/screens/; the "${PROBE_KEY}" frame must degrade to its panel — ${contextFor(suppliedIndex, readings[suppliedIndex])}`,
      );
    }
    readings.forEach((reading: FrameReading, index: number): void => {
      if (reading.imageSrc !== null) {
        problems.push(
          `frame ${index} shows an image where this configuration publishes none — ${contextFor(index, reading)} (rules B-4, WT-08)`,
        );
      }
    });
    expect(
      problems,
      `the product-screen frames show an image although no screenshot exists in this configuration (WT-12):\n${problems.map((entry: string): string => `  - ${entry}`).join('\n')}`,
    ).toEqual([]);
    return;
  }

  const supplied = suppliedIndex >= 0 ? readings[suppliedIndex] : undefined;
  const problems: string[] = [];
  const imageFrames = readings.filter((reading: FrameReading): boolean => reading.imageSrc !== null);

  if (suppliedIndex < 0 || imageFrames.length !== 1 || supplied === undefined) {
    problems.push(
      `${imageFrames.length} frame(s) show a screenshot where exactly one is supplied; the harness writes only public/screens/${PROBE_KEY}.png for this configuration — configuration "${configuration}"`,
    );
  } else {
    if (supplied.imageSrc !== PROBE_SRC) {
      problems.push(
        `frame ${suppliedIndex} shows "${supplied.imageSrc}" where the one screenshot this configuration publishes is ${PROBE_SRC} — ${contextFor(suppliedIndex, supplied)}`,
      );
    }
    if (supplied.imageAlt === '') {
      problems.push(
        `frame ${suppliedIndex} shows its screenshot with no text alternative; a supplied screenshot is informative, so it ships with the description src/content/site-intelligence.ts holds for it — ${contextFor(suppliedIndex, supplied)} (rule B-3)`,
      );
    }
    if (supplied.imageLoading !== 'lazy') {
      problems.push(
        `frame ${suppliedIndex} loads its screenshot with loading="${supplied.imageLoading ?? '(absent)'}" where the strip's images are deferred — ${contextFor(suppliedIndex, supplied)}`,
      );
    }
    if (supplied.imageWidth <= 0 || supplied.imageHeight <= 0) {
      problems.push(
        `frame ${suppliedIndex} reserves its box with width ${supplied.imageWidth} and height ${supplied.imageHeight}; both dimensions are declared so the slot holds its space before the file decodes — ${contextFor(suppliedIndex, supplied)}`,
      );
    }
    if (supplied.label !== '') {
      problems.push(
        `frame ${suppliedIndex} shows the fallback label as well as its screenshot ("${supplied.label}"); the label belongs to the degraded state alone — ${contextFor(suppliedIndex, supplied)}`,
      );
    }
  }

  expect(
    problems,
    `the supplied product screen does not take its own frame and leave the other two degraded (WT-12, AAP 0.7.4):\n${problems.map((entry: string): string => `  - ${entry}`).join('\n')}`,
  ).toEqual([]);

  /*
   * The file itself: the strip defers its images, so the request is made when the frame is reached.
   * Scrolling to the image and waiting for the response proves the published path resolves — a frame
   * whose src 404s would still look correct in the markup alone.
   */
  const image = frames.nth(suppliedIndex).locator('img').first();
  await image.scrollIntoViewIfNeeded();
  await expect
    .poll((): number => screenResponses.length, {
      message: `the browser never requested the supplied screenshot ${PROBE_SRC} in the "${configuration}" configuration, so the frame's published path could not be observed resolving`,
      timeout: 15_000,
    })
    .toBeGreaterThan(0);

  const response = screenResponses.find(
    (entry: { url: string; status: number }): boolean =>
      new URL(entry.url).pathname === PROBE_SRC,
  );
  expect(
    response?.status,
    `the response for the supplied screenshot ${PROBE_SRC} was ${response === undefined ? 'never received' : String(response.status)} where the frame's own file must be served; the image is published from public/screens/ by the build rather than supplied by any route (rule W-2) — configuration "${configuration}"`,
  ).toBe(200);

  const afterLoad = await readFrames();
  expect(
    afterLoad[suppliedIndex].naturalWidth,
    `the supplied screenshot ${PROBE_SRC} never decoded in the "${configuration}" configuration (naturalWidth ${afterLoad[suppliedIndex].naturalWidth}); the frame points at a file the page could not render — ${contextFor(suppliedIndex, afterLoad[suppliedIndex])}`,
  ).toBeGreaterThan(0);

  const stillDegraded = degradedIndexes(afterLoad);
  expect(
    stillDegraded.length,
    `${stillDegraded.length} frame(s) are degraded once the supplied screenshot has loaded where the other two frames must stay on their panel — configuration "${configuration}"`,
  ).toBe(2);
});

test('WT-12 default/live/mailto/screens — a frame showing the fallback panel is not a control', async (): Promise<void> => {
  const readings = await readFrames();
  const panelIndexes = degradedIndexes(readings);
  const expected = probeSupplied ? 2 : 3;
  const problems: string[] = [];

  // Non-vacuity: the loop below must always have panels to inspect.
  if (panelIndexes.length !== expected) {
    problems.push(
      `${panelIndexes.length} frame(s) carry the fallback panel where this configuration leaves ${expected} without a screenshot — configuration "${configuration}"`,
    );
  }

  for (const index of panelIndexes) {
    const offenders = await frames.nth(index).evaluate((element: HTMLElement): string[] => {
      const selector = 'a, button, [role="link"], [tabindex], [onclick]';
      const found = Array.from(element.querySelectorAll(selector));
      if (element.hasAttribute('onclick') || element.matches(selector)) {
        found.push(element);
      }
      return found.map((node: Element): string => node.outerHTML.slice(0, 120));
    });

    for (const offender of offenders) {
      problems.push(
        `frame ${index} shows the fallback panel and carries a control or a focus stop: ${offender} — a slot that looks operable and does nothing is a dead control (rule B-4) — ${contextFor(index, readings[index])}`,
      );
    }
  }

  expect(
    problems,
    `a degraded product-screen frame presents something operable (WT-12, rule B-4):\n${problems.map((entry: string): string => `  - ${entry}`).join('\n')}`,
  ).toEqual([]);
});

test('WT-12 default/live/mailto/screens — the page loads no image and makes no request from outside its own origin', async ({ page }): Promise<void> => {
  const problems: string[] = [];

  /*
   * Every image in the document, not only those inside the strip: the site ships no raster of its
   * own (WT-08), so the only image a page may carry is an owner-supplied `/screens/` file, and the
   * count is asserted first so the loop below can never pass over an empty list.
   */
  const sources = await page
    .locator('img')
    .evaluateAll((nodes: Element[]): string[] =>
      nodes.map((node: Element): string => node.getAttribute('src') ?? ''),
    );

  const expectedImages = probeSupplied ? 1 : 0;
  if (sources.length !== expectedImages) {
    problems.push(
      `the document carries ${sources.length} <img> element(s) where this configuration publishes ${expectedImages} screenshot(s) — configuration "${configuration}"`,
    );
  }

  sources.forEach((source: string, index: number): void => {
    if (!source.startsWith('/screens/')) {
      problems.push(
        `image ${index} loads "${source}", which is not an owner-supplied site-relative /screens/ path; the site ships no raster of its own, so a product screen can never be a borrowed or generated image (WT-08, rules W-1 and B-4)`,
      );
    }
    if (source.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(source)) {
      problems.push(
        `image ${index} names the origin "${source}"; a frame's image is a file this site publishes, so no request may leave the page's own origin for it (rule B-1)`,
      );
    }
  });

  /*
   * The complement of the image check: what the page actually asked for. Fonts and icons are
   * bundled, so every request belongs to the site's own origin — a foreign one would mean a CDN, a
   * hosted font or an embedded third-party asset had entered the page (rule B-1).
   *
   * A lazily loaded screenshot is requested only once its frame is reached, so the image's own
   * address is covered by the source check above rather than by this list.
   */
  if (requestUrls.length === 0) {
    problems.push(
      `the page recorded no requests at all in the "${configuration}" configuration, so nothing about its origins was observed`,
    );
  }

  const origin = new URL(page.url()).origin;
  const foreign = requestUrls.filter((url: string): boolean => new URL(url).origin !== origin);
  if (foreign.length > 0) {
    problems.push(
      `the page requested ${foreign.length} URL(s) outside its own origin: ${foreign.join(', ')}; fonts, icons and images are bundled in the repository, so a third-party request is a rule B-1 violation — configuration "${configuration}"`,
    );
  }

  expect(
    problems,
    `the product-screen page reaches outside its own origin (WT-12, rule B-1):\n${problems.map((entry: string): string => `  - ${entry}`).join('\n')}`,
  ).toEqual([]);
});

test('WT-12 default/live/mailto/screens — every frame keeps its caption in both states', async (): Promise<void> => {
  const readings = await readFrames();
  const suppliedIndex = imageFrameIndex(readings);
  const problems: string[] = [];

  if (readings.length !== 3) {
    problems.push(
      `the strip carries ${readings.length} captionable frame(s) where the page presents three product screens — configuration "${configuration}"`,
    );
  }

  readings.forEach((reading: FrameReading, index: number): void => {
    if (reading.caption === '') {
      problems.push(
        `frame ${index} shows no caption; the caption is content copy from src/content/site-intelligence.ts (screens.frames[].caption) and is the half of the frame that survives the fallback, so a frame without one says nothing about the screen it reserves — ${contextFor(index, reading)} (AAP 0.7.4)`,
      );
    }
  });

  /*
   * The one regression WT-12 exists to catch, stated for the state this configuration is in: the
   * frame showing a screenshot must keep its caption beside the image, and the frames left on their
   * panel must keep theirs too. Which state applies is the configuration's, so both branches assert.
   */
  if (probeSupplied && suppliedIndex < 0) {
    problems.push(
      `no frame shows the supplied screenshot in the "${configuration}" configuration, so the caption-with-image state could not be observed at all`,
    );
  }

  expect(
    problems,
    `a product-screen frame lost its caption (WT-12, AAP 0.7.4):\n${problems.map((entry: string): string => `  - ${entry}`).join('\n')}`,
  ).toEqual([]);
});
