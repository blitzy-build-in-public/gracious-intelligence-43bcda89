/**
 * The browser suite's runner (AAP 0.10.3, 0.13.2, 0.13.3).
 *
 * Seven build configurations exist for this project, and exactly four of them reach a browser:
 * `default`, `live`, `mailto` and `screens`. Each one is a Playwright project of the same name,
 * served from its own fresh build on its own port, so a single run exercises every state without
 * one pass's build ever answering another pass's request. The other three — `flags`, `guard` and
 * `invalid` — are read as files by `tests/static/*.test.ts` and never start a browser.
 *
 * The four project names are the contract with `tests/e2e/*.spec.ts`, which read
 * `test.info().project.name` to decide whether a case applies to the pass they are running in. They
 * are typed against the harness's own `ConfigurationName`, so renaming one on either side is a type
 * error rather than a silently skipped spec.
 *
 * Serving. `astro preview` serves `dist/` and nothing else — `astro preview --help` offers no
 * output-directory option, and one preview per checkout is enforced — so the four directories are
 * served by the build harness's own `--serve <dir> --port <port>` mode (AAP 0.13.2). Each project's
 * command is build-then-serve in one shell, so the bytes a spec loads are always that project's
 * build of this run; `reuseExistingServer` is false everywhere, because reusing a server would
 * reintroduce exactly the stale build AAP 0.13.2 forbids. The harness owns each configuration's
 * environment (`environmentFor`), so no `env` is passed here: a second copy of those values could
 * drift from the one the static suite asserts on.
 *
 * Rules honoured here. W-2 — static hosting only: the command serves a built directory, starts no
 * application server and opens no session. B-1 — nothing here fetches anything: every origin this
 * file names is loopback, and the `live` pass's endpoint is stubbed by the spec that needs it, never
 * contacted. B-2 — nothing here is or names a credential: the only non-loopback hosts anywhere in
 * the runs are the plan's own `site.example` and `forms.example` example values, and they arrive
 * through the build harness rather than this file. B-3 — a real Chromium against a real server,
 * which the axe, keyboard and visible-focus checks require. B-4 — the crawl that proves every link
 * resolves runs here, on the same pass as everything else.
 */

import process from 'node:process';
import { defineConfig } from '@playwright/test';
import type { ConfigurationName } from './tests/helpers/build.ts';

/**
 * The four configurations AAP 0.13.2 builds for the browser. Taking the union from the harness's
 * `ConfigurationName` keeps this list and the harness's own seven in agreement.
 */
export type BrowserConfiguration = Extract<
  ConfigurationName,
  'default' | 'live' | 'mailto' | 'screens'
>;

/** The four project names, in the order AAP 0.13.2 lists them, which is also the port order below. */
export const BROWSER_CONFIGURATIONS: readonly BrowserConfiguration[] = [
  'default',
  'live',
  'mailto',
  'screens',
];

/**
 * The port of the first configuration — 4321 for `default`, then 4322, 4323 and 4324 — which is the
 * numbering AAP 0.13.2 fixes, and the reason `baseURL` is a loopback origin rather than a setting.
 *
 * The shared build host runs many checkouts of this repository at once, each of which has to own its
 * ports, so the base strides by ten for the checkout index the host passes in `CLONE_INDEX` (clone 7
 * serves 4391-4394). An environment that passes no index — CI, a developer machine, the single
 * integration run — gets the AAP's 4321-4324 exactly, and a malformed index falls back to the same
 * base rather than failing a run over a host hint.
 */
const PORT_STRIDE = 10;
const DEFAULT_BASE_PORT = 4321;

/** The four ports' starting point for this checkout. */
const FIRST_PORT = ((): number => {
  const rawIndex = process.env.CLONE_INDEX;
  if (rawIndex === undefined || rawIndex.trim() === '') {
    return DEFAULT_BASE_PORT;
  }
  const cloneIndex = Number.parseInt(rawIndex, 10);
  return Number.isInteger(cloneIndex) && cloneIndex >= 0
    ? DEFAULT_BASE_PORT + PORT_STRIDE * cloneIndex
    : DEFAULT_BASE_PORT;
})();

/** The build-and-serve harness every project's server runs, and the one route to a build. */
const BUILD_HARNESS = 'tests/helpers/build.ts';

/** The harness's own output root; this file's `outputDir` sits inside it so `git status` stays clean. */
const OUT_ROOT = '.build';

/** A build-then-serve step runs a full static build behind the generated-asset guard, so it gets minutes. */
const WEB_SERVER_TIMEOUT_MS = 180_000;

/** The port one configuration is served on. */
export function portFor(configuration: BrowserConfiguration): number {
  return FIRST_PORT + BROWSER_CONFIGURATIONS.indexOf(configuration);
}

/** The loopback origin one configuration's project loads, and the only shape of origin this file names. */
export function originFor(configuration: BrowserConfiguration): string {
  return `http://localhost:${portFor(configuration)}`;
}

/**
 * One project's server: build that configuration into its own directory, then serve that directory
 * on that project's port. Both halves are the harness's documented command lines, so there is no
 * second build path and no second server to keep in step with it.
 */
function commandFor(configuration: BrowserConfiguration): string {
  const outDir = `${OUT_ROOT}/${configuration}`;
  return [
    `node ${BUILD_HARNESS} ${configuration} --out-dir ${outDir}`,
    `node ${BUILD_HARNESS} --serve ${outDir} --port ${portFor(configuration)}`,
  ].join(' && ');
}

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',

  /* Traces and failure screenshots land under the git-ignored build root, never in the source tree. */
  outputDir: `${OUT_ROOT}/playwright`,

  fullyParallel: true,

  /* No retries: AAP 0.13.5 forbids letting a retry mask a defect, and these passes are deterministic. */
  retries: 0,

  /* Two workers on CI keeps a small runner from thrashing; elsewhere Playwright's own default applies. */
  workers: process.env.CI ? 2 : undefined,

  /* The list reporter only: nothing may write a report outside a git-ignored directory. */
  reporter: [['list']],

  /*
   * The form pass holds a request open for the whole 15-second abort window before asserting the
   * error state, and the accessibility pass injects axe into a page before it reports; a 30-second
   * default leaves too little headroom for those on a shared host.
   */
  timeout: 60_000,

  /* An assertion that has not settled in 10 seconds is a defect, not a slow machine. */
  expect: { timeout: 10_000 },

  use: {
    /* AAP 0.4.1 specifies Chromium alone, and axe, keyboard and focus checks need a real engine. */
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },

  /*
   * One project per configuration, each pointed at its own server. The specs read
   * `test.info().project.name`, so these names are load-bearing: `default` is the empty-configuration
   * site (no form, no screens, `connect-src 'self'` alone), `live` is the indexable site with the
   * form and the configured address, `mailto` is the address without a form endpoint, and `screens`
   * is the default site plus one supplied product screen.
   */
  projects: BROWSER_CONFIGURATIONS.map((configuration) => ({
    name: configuration,
    use: { baseURL: originFor(configuration) },
  })),

  /*
   * Four servers for the four projects. Readiness is the project's own port, which the harness binds
   * only after that project's build has finished, so a spec can never load a directory mid-build.
   */
  webServer: BROWSER_CONFIGURATIONS.map((configuration) => ({
    name: configuration,
    command: commandFor(configuration),
    port: portFor(configuration),
    reuseExistingServer: false,
    timeout: WEB_SERVER_TIMEOUT_MS,
  })),
});
