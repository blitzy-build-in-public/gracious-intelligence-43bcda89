/**
 * The shared build-and-serve harness: the only route by which a check obtains a build, and the
 * static file server every browser-reached check loads that build from (AAP 0.13.2, 0.13.3).
 *
 * It builds one named configuration of the site into its own output directory and returns what the
 * child build said, and it serves a built directory on a loopback port so a Playwright suite or a
 * Lighthouse run can load the artefact. Its consumers are `playwright.config.ts`, which backs each
 * of its four browser configurations with it; `tests/lighthouse/run.ts`; `scripts/screenshots.ts`;
 * and `tests/static/*.test.ts`, which build the configurations that are only read as files. Because
 * the interface is shared with files under `src/content`, the shape below is fixed and documented
 * field by field rather than left to each caller to rediscover.
 *
 * The serve half is **test tooling for a static directory**, not product code. Rule W-2 allows a
 * static site only, with no server-side code, database, CMS or sign-in, and nothing here changes
 * that: the server hands a built file's own bytes to a socket, resolves no route and holds no
 * session, store, header, transformation or request logic; it is never imported by anything under
 * `src/`; and nothing it produces can reach `dist/`. It exists because the browser suites must load
 * the artefact that ships, which AAP 0.4.2 and 0.13.3 sanction. The site proper remains a directory
 * of files any static host can serve.
 *
 * What the project rules require of this file, and where each is honoured:
 *
 * - **W-1** — the Figma file is layout and style only, so no template text may reach the output.
 *   This harness writes no content. The one string it introduces is the sample founder biography
 *   the `flags` configuration sets, and it exists only inside a temporary copy that is deleted
 *   afterwards: never in the repository, never in a committed artefact, and never in any build that
 *   a fidelity assertion reads (see `buildFlags`).
 * - **B-1** — no runtime request to a third-party host. Neither mode fetches anything: the build
 *   spawns the project's own script with no network access of its own, and the server binds
 *   `127.0.0.1` only and serves local files byte for byte, adding no snippet, no proxy, no rewrite
 *   and no remote reference. The only hosts anywhere in this file are the plan's own example stubs
 *   in the configuration table.
 * - **B-2** — no secrets, and configuration only from named variables with empty defaults. This
 *   file sets the four documented `PUBLIC_*` names plus the harness-only `LAUNCH_CHECK`, carries no
 *   key, token, password or real host, and never echoes a configured value in a failure message.
 * - **B-3** — WCAG 2.2 AA on every page or screen. The server answers an unknown path with a real
 *   `404` status **and** the built `404.html` body, and returns every built file unmodified, so the
 *   accessibility run measures the artefact that ships rather than a reshaped copy of it.
 * - **B-4** — no invented content and no dead control. This file fabricates no page content: the
 *   `flags` biography is plainly synthetic test text, is not a customer, logo, testimonial,
 *   statistic, certification, award or team member, and is confined to a throwaway build.
 * - **W-2** — static site only; see the paragraph above on the serve half.
 *
 * One deliberate write lands outside `.build/`: the `screens` configuration creates
 * `public/screens/investigate.png` for the duration of its build and removes it again in a `finally`
 * block. That is the plan's own exception to the "everything under `.build/`" rule (AAP 0.13.2,
 * 0.13.7): the mixed state — one screen supplied, two absent — can only be observed by a build that
 * reads a real file from the owner's drop point, and a leftover probe is a defect.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { Stats } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';

/**
 * The seven build configurations AAP 0.13.2 defines: the four a browser loads and the three that
 * are read as files. Each one's environment is fixed in `environmentFor`, so a check always builds
 * the same state whatever the ambient environment happens to hold.
 */
export type ConfigurationName =
  | 'default'
  | 'live'
  | 'mailto'
  | 'screens'
  | 'flags'
  | 'guard'
  | 'invalid';

/** Every configuration name, in the order AAP 0.13.2 lists them, for lookup and for the usage text. */
export const CONFIGURATION_NAMES: readonly ConfigurationName[] = [
  'default',
  'live',
  'mailto',
  'screens',
  'flags',
  'guard',
  'invalid',
];

/**
 * The one output root: every build, every per-configuration directory and every temporary artefact
 * lives under it, and `.gitignore` carries the same line. It is repository-relative, so no caller
 * has to agree with this file about an absolute path.
 */
export const OUT_ROOT: string = '.build';

/**
 * The three image files `npm run assets` writes into `public/`, in the order the guard reports
 * them. They are git-ignored and regenerated by every build, so a path that skipped asset
 * generation has to be caught before the build rather than published as a page whose icons 404.
 */
export const GENERATED_ASSETS: readonly string[] = [
  'public/favicon.svg',
  'public/og-image.png',
  'public/apple-touch-icon.png',
];

/**
 * The one screen PNG the `screens` configuration supplies for the duration of its build. Only this
 * file is written: `compare.png` and `audit.png` stay absent, which is what makes the mixed state
 * observable to the browser suite.
 */
export const SCREENS_PROBE: string = 'public/screens/investigate.png';

/**
 * One value that is set but invalid, and the variable and rule it breaks. AAP 0.13.2's `invalid`
 * configuration runs one build per entry, and each build is expected to fail: a value that is set
 * but invalid stops the build rather than falling back to another state (AAP 0.9.2).
 */
export interface InvalidCase {
  /** A short name for the case, used as the report's label and as its output directory. */
  name: string;
  /** The configuration variable the case sets. */
  variable: string;
  /** The rule that value breaks, as the failure message states it. */
  rule: string;
  /** The invalid value itself. It is written into `this` file's table, never echoed into a message. */
  value: string;
}

/**
 * The three variables that have an invalid state, with one case each.
 *
 * `PUBLIC_SITE_LIVE` is deliberately absent: AAP 0.9.2 accepts any value for it, with anything
 * other than exactly `true` meaning not live and only printing a warning, so it has no invalid
 * state to exercise.
 */
export const INVALID_CASES: readonly InvalidCase[] = [
  {
    name: 'form-endpoint',
    variable: 'PUBLIC_FORM_ENDPOINT',
    rule: 'absolute https URL; http accepted only for localhost or 127.0.0.1',
    value: 'not a url',
  },
  {
    name: 'contact-email',
    variable: 'PUBLIC_CONTACT_EMAIL',
    rule: 'exactly one local@domain.tld address, no space, comma or question mark',
    value: 'hello at site.example',
  },
  {
    name: 'site-url',
    variable: 'PUBLIC_SITE_URL',
    rule: 'absolute https origin with no path beyond /',
    value: 'https://site.example/path',
  },
];

/**
 * What one build produced. A non-zero `status` is a legitimate result, not a harness fault: the
 * `guard` and `invalid` configurations exist to prove their builds fail, so callers assert on
 * `ok` rather than catching a throw.
 */
export interface BuildResult {
  /** The configuration this build was asked for. */
  configuration: ConfigurationName;
  /** Absolute path of the directory the build wrote, whether or not it succeeded. */
  outDir: string;
  /** The child build's exit status, or `1` when it was killed by a signal without reporting one. */
  status: number;
  /** `status === 0`. */
  ok: boolean;
  /** Everything the child wrote to stdout. */
  stdout: string;
  /** Everything the child wrote to stderr. */
  stderr: string;
}

/**
 * The four documented build-time values, empty unless a configuration is meant to set them. Every
 * configuration's environment carries all four keys, so a value left in the ambient environment can
 * never change what a configuration proves (AAP 0.9.1, 0.13.2).
 */
const EMPTY_PUBLIC_ENVIRONMENT: Readonly<Record<string, string>> = {
  PUBLIC_FORM_ENDPOINT: '',
  PUBLIC_CONTACT_EMAIL: '',
  PUBLIC_SITE_URL: '',
  PUBLIC_SITE_LIVE: '',
};

/** The harness-only variable the build script reads, and the single value that opens the gate. */
const LAUNCH_CHECK_VARIABLE = 'LAUNCH_CHECK';
const LAUNCH_CHECK_BYPASS = 'skip';

/**
 * The two fields the `flags` configuration rewrites in its temporary copy, and the patterns it
 * matches them with. Both are tolerant of the content module's formatting — optional whitespace
 * around the colon, and an empty string written with single quotes, double quotes or backticks —
 * because a formatting change there must not turn this configuration into a silent no-op.
 */
const SOURCE_CONFIRMED_PATTERN = /(\bsourceConfirmed\s*:\s*)false\b/;
const FOUNDER_BIO_PATTERN = /(\bfounderBio\s*:\s*)(['"`])\2/;

/**
 * The sample biography the `flags` configuration puts in place of the empty `founderBio`. It is
 * test text and nothing else: clearly synthetic, quoting nothing from the specification and nothing
 * from the site's copy, and it exists only inside a temporary copy that is deleted after the build.
 */
const FLAGS_FOUNDER_BIO = 'Biography supplied by the flags configuration for this build only.';

/** `src/content/about.ts`, as every message about the rewrite names it (repository-relative). */
const ABOUT_CONTENT_FILE = 'src/content/about.ts';

/**
 * The directories the `flags` copy never takes: dependencies (symlinked instead), git metadata, this
 * root and the other output directories, and the review screenshots.
 */
const FLAGS_COPY_EXCLUSIONS: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  '.build',
  'dist',
  'screenshots',
]);

/**
 * The MIME types the built site actually emits, mapped by extension. A type the build does not
 * produce has no entry, and the default is the opaque type rather than a guess.
 */
const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/** The type served when an extension has no entry above. */
const DEFAULT_MIME_TYPE = 'application/octet-stream';

/** The host the server binds, and the only one it will ever bind: loopback, never `0.0.0.0`. */
const LOOPBACK_HOST = '127.0.0.1';

/** The lowest and highest port a caller may ask for. */
const MIN_PORT = 1;
const MAX_PORT = 65535;

/**
 * The repository root, resolved from this module's own location rather than from the working
 * directory, so the harness writes to the same `.build/` whatever directory a caller invokes Node
 * from. This file lives at `<root>/tests/helpers/build.ts`, two levels down.
 */
function repositoryRoot(): string {
  return fileURLToPath(new URL('../..', import.meta.url));
}

/** The absolute path of a repository-relative one, such as `OUT_ROOT` or a generated asset. */
function fromRepositoryRoot(...segments: readonly string[]): string {
  return resolve(repositoryRoot(), ...segments);
}

/** `path` as a report names it: repository-relative and slash-separated when it lies inside. */
function displayPath(path: string): string {
  const root = repositoryRoot();
  const candidate = resolve(path);
  const fromRoot = relative(root, candidate);
  const outside = fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot);
  if (fromRoot === '' || outside) {
    return candidate;
  }
  return fromRoot.split(sep).join('/');
}

/** A `path`'s `stat`, or `null` when it holds nothing. A permission or I/O failure is thrown. */
async function statOrNull(path: string): Promise<Stats | null> {
  try {
    return await stat(path);
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return null;
    }
    throw error;
  }
}

/**
 * Whether `value` is one of the seven configuration names, narrowing it for the compiler and for
 * the caller. An unknown name is a harness fault, reported with the seven names it could have been.
 */
function isConfigurationName(value: string): value is ConfigurationName {
  return (CONFIGURATION_NAMES as readonly string[]).includes(value);
}

/** Throws a harness fault naming the value that is not a configuration and the seven that are. */
function assertConfigurationName(value: string): asserts value is ConfigurationName {
  if (!isConfigurationName(value)) {
    throw new Error(
      `"${value}" is not a build configuration; the seven configurations are ${CONFIGURATION_NAMES.join(', ')}`,
    );
  }
}

/**
 * The environment overrides for one configuration — only the differences from the ambient
 * environment, which is what `childEnvironment` merges them into.
 *
 * Every configuration carries all four documented `PUBLIC_*` keys, explicitly empty where it sets
 * none, so an ambient value cannot leak into a configuration that is meant to prove the empty
 * state. `LAUNCH_CHECK` appears in exactly one entry, `live`, where AAP 0.13.2 requires it: the
 * live build has to pass the launch guard while the owner's copy is still outstanding. Every other
 * configuration omits the key, and `childEnvironment` deletes it from the ambient environment, so
 * `guard` fails the way WT-10 requires however the caller's shell is set up.
 *
 * `screens` and `flags` take the `default` environment exactly, because they change the project
 * tree rather than the configuration: one supplies a screen PNG for the length of its build, the
 * other builds a temporary copy whose conditional blocks are switched on. `invalid` is likewise the
 * `default` environment — the base each of `INVALID_CASES` perturbs by one bad value.
 */
export function environmentFor(configuration: ConfigurationName): Record<string, string> {
  switch (configuration) {
    case 'default':
    case 'screens':
    case 'flags':
    case 'invalid':
      return { ...EMPTY_PUBLIC_ENVIRONMENT };
    case 'mailto':
      return { ...EMPTY_PUBLIC_ENVIRONMENT, PUBLIC_CONTACT_EMAIL: 'hello@site.example' };
    case 'live':
      return {
        ...EMPTY_PUBLIC_ENVIRONMENT,
        [LAUNCH_CHECK_VARIABLE]: LAUNCH_CHECK_BYPASS,
        PUBLIC_SITE_LIVE: 'true',
        PUBLIC_SITE_URL: 'https://site.example',
        PUBLIC_FORM_ENDPOINT: 'https://forms.example/enquiry',
        PUBLIC_CONTACT_EMAIL: 'hello@site.example',
      };
    case 'guard':
      return {
        ...EMPTY_PUBLIC_ENVIRONMENT,
        PUBLIC_SITE_LIVE: 'true',
        PUBLIC_SITE_URL: 'https://site.example',
      };
  }
}

/**
 * The default output directory of one configuration: `<repo>/.build/<configuration>`. Each
 * configuration gets its own directory under the one output root, so no check consumes another
 * check's build.
 */
export function outDirFor(configuration: ConfigurationName): string {
  assertConfigurationName(configuration);
  return fromRepositoryRoot(OUT_ROOT, configuration);
}

/** The output directory a caller asked for, or the configuration's own default. */
function resolveOutDir(
  configuration: ConfigurationName,
  options: { readonly outDir?: string },
): string {
  return options.outDir === undefined ? outDirFor(configuration) : resolve(options.outDir);
}

/**
 * The generated-asset guard (AAP 0.4.2). `npm run assets` writes the favicon, the social image and
 * the apple-touch-icon into `public/`, where the build copies them into the published output; a
 * path that skipped generation would publish pages whose icons 404, so it fails here, loudly,
 * naming the first file that is missing and the command that writes it.
 *
 * Throws rather than returning a verdict because there is nothing useful a caller could do with a
 * missing asset except run the same command.
 */
export function assertGeneratedAssets(projectRoot: string = repositoryRoot()): void {
  for (const asset of GENERATED_ASSETS) {
    if (!existsSync(resolve(projectRoot, asset))) {
      throw new Error(
        `${asset} is missing from ${displayPath(projectRoot)}: every build needs the three image files npm run assets writes, so run \`npm run assets\` before building (npm run build does it through its prebuild step)`,
      );
    }
  }
}

/** What one child process produced, before it is wrapped in a `BuildResult`. */
interface ChildRun {
  status: number;
  stdout: string;
  stderr: string;
}

/** The npm executable for this platform; the name a spawn failure has to report. */
const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/** A throwable as a message, so a failure is always one readable sentence. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Empties one configuration's output directory and recreates it, so a page left by an earlier build
 * of a different configuration can never be tested.
 *
 * Only the caller's directory is removed. `node --test` runs suites in parallel with different
 * `--out-dir` values, so clearing `.build/` wholesale would race with a sibling build.
 */
async function prepareOutDir(outDir: string, configuration: ConfigurationName): Promise<void> {
  try {
    await rm(outDir, { recursive: true, force: true });
    await mkdir(outDir, { recursive: true });
  } catch (error) {
    throw new Error(
      `the ${configuration} build's output directory ${displayPath(outDir)} could not be prepared: ${messageOf(error)}`,
    );
  }
}

/**
 * Runs the project's documented build command — `npm run build -- --outDir <dir>` — and captures
 * what it printed.
 *
 * The package script is the entry point rather than the Astro CLI, and that is a requirement rather
 * than a convenience: the launch guard lives in the `build` script (AAP 0.9.5), so the `guard`
 * configuration can only fail the way WT-10 requires when the script is what runs. The script's
 * `prebuild` step then regenerates the three image files through `npm run assets`, so every
 * configuration's output carries them.
 *
 * A non-zero exit is returned, not thrown: the `guard` and `invalid` configurations exist to prove
 * their builds fail. Only a spawn that could not start is a harness fault.
 */
function invokeBuild(
  projectRoot: string,
  outDir: string,
  environment: NodeJS.ProcessEnv,
): Promise<ChildRun> {
  const args = ['run', 'build', '--', '--outDir', outDir];
  return new Promise<ChildRun>((resolveRun, rejectRun) => {
    const child = spawn(NPM_COMMAND, args, {
      cwd: projectRoot,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });
    child.on('error', (error: NodeJS.ErrnoException) => {
      rejectRun(
        new Error(
          error.code === 'ENOENT'
            ? `the ${NPM_COMMAND} binary could not be found on PATH, so the build in ${displayPath(projectRoot)} cannot start`
            : `\`npm run build\` could not be started in ${displayPath(projectRoot)}: ${messageOf(error)}`,
        ),
      );
    });
    child.on('close', (code) => {
      resolveRun({ status: code === null ? 1 : code, stdout, stderr });
    });
  });
}

/**
 * One build: guard the generated assets, clear the output directory, run the build, report it.
 *
 * `detail` is appended to the configuration in the one summary line, so a run inside a larger set —
 * the three `invalid` builds — says which case it was.
 */
async function runBuild(
  configuration: ConfigurationName,
  projectRoot: string,
  outDir: string,
  overrides: Record<string, string>,
  detail?: string,
): Promise<BuildResult> {
  assertGeneratedAssets(projectRoot);
  await prepareOutDir(outDir, configuration);
  const { status, stdout, stderr } = await invokeBuild(
    projectRoot,
    outDir,
    childEnvironment(overrides),
  );
  const label = detail === undefined ? configuration : `${configuration} [${detail}]`;
  console.log(`built ${label} -> ${outDir} (exit ${status})`);
  return { configuration, outDir, status, ok: status === 0, stdout, stderr };
}

/**
 * The child environment: the ambient environment (so `PATH`, `HOME` and the npm caches are
 * inherited), then the configuration's overrides on top, with `LAUNCH_CHECK` removed unless the
 * overrides set it. Dropping the ambient key is what keeps a shell that exported
 * `LAUNCH_CHECK=skip` from turning the `guard` configuration into a passing build.
 */
function childEnvironment(overrides: Record<string, string>): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env, ...overrides };
  if (!Object.hasOwn(overrides, LAUNCH_CHECK_VARIABLE)) {
    delete environment[LAUNCH_CHECK_VARIABLE];
  }
  return environment;
}

/** The eight bytes every PNG starts with. */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The CRC-32 table, built once on first use; PNG's chunk checksum is the standard IEEE one. */
let crcTable: Uint32Array | null = null;

/** The CRC-32 lookup table, computed on first use and reused afterwards. */
function crcTableValues(): Uint32Array {
  if (crcTable !== null) {
    return crcTable;
  }
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  crcTable = table;
  return table;
}

/** The CRC-32 of `bytes`, as a PNG chunk stores it. */
function crc32(bytes: Buffer): number {
  const table = crcTableValues();
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ (table[(crc ^ byte) & 0xff] ?? 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** One PNG chunk: its length, its type and data, and the CRC over both. */
function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, checksum]);
}

/**
 * A decodable 1x1 PNG, built here from Node's own `zlib` rather than from the rasteriser: the probe
 * only has to be a file the build reads as a screen, and a hand-built PNG keeps this harness free
 * of an image dependency and byte-identical on every run. The pixel is the page ground, so a
 * reviewer who opens the built page sees something rather than a transparent square.
 */
function onePixelPng(): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  const scanline = Buffer.from([0x00, 0x1d, 0x0e, 0x03, 0xff]);
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(scanline)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Runs `work` with the `screens` probe in place and removes it again whatever happens.
 *
 * Only `investigate.png` is written: `compare.png` and `audit.png` stay absent, so the build
 * renders one supplied frame and two fallbacks — the mixed state the browser suite asserts. The
 * removal is in a `finally`, so the probe cannot survive a successful build, a failed one or a
 * throw; a leftover probe would be a defect the next static run reports (AAP 0.13.7).
 */
async function withScreensProbe<T>(work: () => Promise<T>): Promise<T> {
  const probePath = fromRepositoryRoot(SCREENS_PROBE);
  await mkdir(dirname(probePath), { recursive: true });
  await writeFile(probePath, onePixelPng());
  try {
    return await work();
  } finally {
    await rm(probePath, { force: true });
  }
}

/**
 * Copies the project into `destination`, skipping the excluded names at every level.
 *
 * The walk is written out rather than delegated to `fs.cp`, because the copy lives under
 * `.build/` — inside the very tree being copied — and `fs.cp` refuses a source that would contain
 * its own destination. Skipping `.build` here keeps the destination out of the walk, so the copy
 * cannot recurse into itself. A regular file and a real directory are copied as they are; a symlink
 * to a file is copied by content (`copyFile` follows it), and a symlink to a directory is left
 * behind, which is what keeps a cyclic link from becoming an endless walk.
 */
async function copyProjectTree(source: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    if (FLAGS_COPY_EXCLUSIONS.has(entry.name)) {
      continue;
    }
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyProjectTree(from, to);
      continue;
    }
    if (entry.isFile()) {
      await copyFile(from, to);
      continue;
    }
    if (entry.isSymbolicLink()) {
      const target = await statOrNull(from);
      if (target !== null && target.isFile()) {
        await copyFile(from, to);
      }
    }
  }
}

/**
 * Switches the two conditional fields on in the copy's `about.ts`, and nothing else.
 *
 * Both patterns are matched tolerantly and both are required: if either field is absent the copy is
 * not the file this configuration knows how to switch, and a silent no-op would let the `flags`
 * build pass while proving nothing. The rewrite must also change the file — asserted here rather
 * than assumed — for the same reason.
 */
async function rewriteFlagsCopy(aboutPath: string): Promise<void> {
  const original = await readFile(aboutPath, 'utf8');
  if (!SOURCE_CONFIRMED_PATTERN.test(original)) {
    throw new Error(
      `the flags configuration cannot find the field it switches on: ${ABOUT_CONTENT_FILE} holds no \`sourceConfirmed: false\`, so the Why now block could not be proved to render; the field is expected as \`sourceConfirmed: false\``,
    );
  }
  const confirmed = original.replace(
    SOURCE_CONFIRMED_PATTERN,
    (_match: string, prefix: string) => `${prefix}true`,
  );
  if (!FOUNDER_BIO_PATTERN.test(original)) {
    throw new Error(
      `the flags configuration cannot find the field it fills: ${ABOUT_CONTENT_FILE} holds no empty \`founderBio\` string literal, so the founder block could not be proved to render; the field is expected as \`founderBio: ''\`, \`founderBio: ""\` or \`founderBio: \`\`\``,
    );
  }
  const rewritten = confirmed.replace(
    FOUNDER_BIO_PATTERN,
    (_match: string, prefix: string, quote: string) => `${prefix}${quote}${FLAGS_FOUNDER_BIO}${quote}`,
  );
  if (rewritten === original) {
    throw new Error(
      `the flags rewrite of ${ABOUT_CONTENT_FILE} left the file unchanged, so the conditional blocks would not be exercised`,
    );
  }
  await writeFile(aboutPath, rewritten, 'utf8');
}

/**
 * The `flags` configuration: `default`'s environment, built from a temporary copy of the project
 * whose two conditional fields are switched on.
 *
 * The repository is never the thing that changes. The copy lives under `.build/`, takes the project
 * through the explicit walk in `copyProjectTree` (an `fs.cp` of a tree into its own subdirectory is
 * refused) with node_modules symlinked in, is rewritten, built into the repository's own
 * `.build/flags`, and is deleted in a `finally`. The repository's `src/content/about.ts` is read
 * before and after and compared byte for byte, so an accidental edit anywhere in this path fails the
 * build rather than leaving a changed content file behind for the next commit to pick up.
 */
async function buildFlags(options: { readonly outDir?: string }): Promise<BuildResult> {
  const root = repositoryRoot();
  const aboutPath = join(root, ABOUT_CONTENT_FILE);
  const before = await readFile(aboutPath);
  const outputRoot = fromRepositoryRoot(OUT_ROOT);
  await mkdir(outputRoot, { recursive: true });
  const copyRoot = await mkdtemp(join(outputRoot, 'flags-project-'));
  try {
    await copyProjectTree(root, copyRoot);
    await symlink(join(root, 'node_modules'), join(copyRoot, 'node_modules'), 'dir');
    await rewriteFlagsCopy(join(copyRoot, ABOUT_CONTENT_FILE));
    return await runBuild(
      'flags',
      copyRoot,
      resolveOutDir('flags', options),
      environmentFor('flags'),
    );
  } finally {
    await rm(copyRoot, { recursive: true, force: true });
    if (!before.equals(await readFile(aboutPath))) {
      throw new Error(
        `${ABOUT_CONTENT_FILE} changed while the flags configuration built; that configuration may only edit its own temporary copy, so restore the file before committing`,
      );
    }
  }
}

/**
 * Folds the three `invalid` builds into the single result `build('invalid')` can return. The status
 * is the first failing child's, so `ok` is false whenever any case failed, and both streams carry
 * every case's output in case order, so nothing a failing build said is lost.
 */
function foldInvalidBuilds(results: readonly BuildResult[], outDir: string): BuildResult {
  if (results.length === 0) {
    throw new Error('the invalid configuration has no cases to build, so nothing would be proved');
  }
  const failure = results.find((result) => !result.ok);
  const status = failure === undefined ? 0 : failure.status;
  return {
    configuration: 'invalid',
    outDir,
    status,
    ok: status === 0,
    stdout: results.map((result) => result.stdout).join(''),
    stderr: results.map((result) => result.stderr).join(''),
  };
}

/**
 * Every `invalid` case, one build each, into `.build/invalid/<case>` (AAP 0.13.2). Each build is
 * meant to fail: a value that is set but invalid stops the build instead of falling back to another
 * state (AAP 0.9.2). The results are returned rather than judged, so a caller can assert both that
 * every build failed and which variable each one named.
 */
export async function buildInvalid(): Promise<BuildResult[]> {
  assertGeneratedAssets();
  const results: BuildResult[] = [];
  for (const invalidCase of INVALID_CASES) {
    const overrides = {
      ...environmentFor('invalid'),
      [invalidCase.variable]: invalidCase.value,
    };
    results.push(
      await runBuild(
        'invalid',
        repositoryRoot(),
        fromRepositoryRoot(OUT_ROOT, 'invalid', invalidCase.name),
        overrides,
        `${invalidCase.name}: ${invalidCase.variable}`,
      ),
    );
  }
  return results;
}

/**
 * Builds one configuration and returns what the build said.
 *
 * Two configurations build something other than the repository's own pages: `screens` supplies the
 * one screen PNG for the length of its build, and `flags` builds a temporary copy. `invalid` is a
 * set of three builds and its single result is their fold; the separate `buildInvalid` returns the
 * three individually for a caller that wants to assert on each.
 */
export async function build(
  configuration: ConfigurationName,
  options: { outDir?: string } = {},
): Promise<BuildResult> {
  assertConfigurationName(configuration);
  assertGeneratedAssets();
  switch (configuration) {
    case 'screens':
      return withScreensProbe(() =>
        runBuild(
          configuration,
          repositoryRoot(),
          resolveOutDir(configuration, options),
          environmentFor(configuration),
        ),
      );
    case 'flags':
      return buildFlags(options);
    case 'invalid':
      return foldInvalidBuilds(await buildInvalid(), resolveOutDir(configuration, options));
    case 'default':
    case 'live':
    case 'mailto':
    case 'guard':
      return runBuild(
        configuration,
        repositoryRoot(),
        resolveOutDir(configuration, options),
        environmentFor(configuration),
      );
  }
}


/** The MIME type for one file, from its extension, or the opaque default for an unknown one. */
function mimeTypeFor(file: string): string {
  return MIME_TYPES[extname(file).toLowerCase()] ?? DEFAULT_MIME_TYPE;
}

/** The path portion of a request target, with any query string and fragment removed. */
function requestPathname(requestUrl: string): string {
  const withoutFragment = requestUrl.split('#')[0] ?? '/';
  const withoutQuery = withoutFragment.split('?')[0] ?? '/';
  return withoutQuery === '' ? '/' : withoutQuery;
}

/**
 * The file a request names inside the served directory, or `null` when it names nothing servable.
 *
 * Two rules make this safe and predictable. A path that resolves outside the served directory is
 * refused, so `--path-as-is /../etc/passwd` reaches the 404 page rather than a file above the root;
 * and a directory resolves to its own `index.html`, which is why `/`, `/platform` and `/platform/`
 * all find `platform/index.html` in an Astro build.
 */
async function resolveRequestPath(root: string, requestUrl: string): Promise<string | null> {
  let decoded: string;
  try {
    decoded = decodeURIComponent(requestPathname(requestUrl));
  } catch {
    return null;
  }
  if (decoded.includes('\u0000')) {
    return null;
  }
  const requested = decoded.startsWith('/') ? decoded.slice(1) : decoded;
  const candidate = resolve(root, requested);
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
    return null;
  }
  const found = await statOrNull(candidate);
  if (found === null) {
    return null;
  }
  if (found.isDirectory()) {
    const indexPath = join(candidate, 'index.html');
    const index = await statOrNull(indexPath);
    return index !== null && index.isFile() ? indexPath : null;
  }
  return found.isFile() ? candidate : null;
}

/** Sends the built `404.html` with a real 404 status, or a plain-text line when there is none. */
async function sendNotFound(root: string, method: string, response: ServerResponse): Promise<void> {
  const page = await readFile(join(root, '404.html')).catch(() => null);
  const body = page ?? Buffer.from('Not Found\n', 'utf8');
  response.writeHead(404, {
    'Content-Type': page === null ? MIME_TYPES['.txt'] ?? DEFAULT_MIME_TYPE : MIME_TYPES['.html'] ?? DEFAULT_MIME_TYPE,
    'Content-Length': String(body.length),
  });
  if (method === 'HEAD') {
    response.end();
    return;
  }
  response.end(body);
}

/**
 * Answers one request from the served directory: `GET` and `HEAD` only, an existing file or a
 * directory's `index.html`, and the built 404 page with a 404 status for anything else. Files are
 * sent exactly as built — nothing is injected, rewritten or reshaped — so a browser check measures
 * the artefact that ships.
 */
async function respond(root: string, request: IncomingMessage, response: ServerResponse): Promise<void> {
  const method = (request.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    const body = Buffer.from('Method Not Allowed\n', 'utf8');
    response.writeHead(405, {
      Allow: 'GET, HEAD',
      'Content-Type': MIME_TYPES['.txt'] ?? DEFAULT_MIME_TYPE,
      'Content-Length': String(body.length),
    });
    response.end(body);
    return;
  }
  const file = await resolveRequestPath(root, request.url ?? '/');
  if (file === null) {
    await sendNotFound(root, method, response);
    return;
  }
  const body = await readFile(file);
  response.writeHead(200, {
    'Content-Type': mimeTypeFor(file),
    'Content-Length': String(body.length),
  });
  if (method === 'HEAD') {
    response.end();
    return;
  }
  response.end(body);
}

/** Resolves once the server is listening on the loopback host, or rejects naming the port. */
function listenOnLoopback(server: Server, port: number): Promise<void> {
  return new Promise<void>((resolveListening, rejectListening) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.off('listening', onListening);
      rejectListening(
        error.code === 'EADDRINUSE'
          ? new Error(
              `port ${port} is already in use, so nothing can be served on it; stop whatever holds it or choose another port`,
            )
          : new Error(`serving on port ${port} failed: ${messageOf(error)}`),
      );
    };
    const onListening = () => {
      server.off('error', onError);
      resolveListening();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, LOOPBACK_HOST);
  });
}

/** Closes the server, resolving once its socket is closed and its port is free again. */
function closeServer(server: Server): Promise<void> {
  return new Promise<void>((resolveClosed, rejectClosed) => {
    server.close((error) => {
      if (error === undefined) {
        resolveClosed();
        return;
      }
      rejectClosed(error);
    });
    server.closeIdleConnections();
  });
}

/**
 * Serves a built directory on `127.0.0.1:<port>` and returns once it is listening.
 *
 * Loopback only, deliberately: this is a test tool for a static artefact, so it must never be
 * reachable from outside the machine, and it fetches nothing. `close()` resolves only after the
 * socket is closed, which is what lets a fresh `serve` bind the same port immediately afterwards.
 */
export async function serve(
  dir: string,
  port: number,
): Promise<{ url: string; port: number; close(): Promise<void> }> {
  const root = resolve(dir);
  const rootStat = await statOrNull(root);
  if (rootStat === null || !rootStat.isDirectory()) {
    throw new Error(
      `cannot serve ${displayPath(root)}: it does not exist, or it is not a directory; build a configuration first, or pass the directory a build wrote`,
    );
  }
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new Error(
      `cannot serve on port ${port}: a port must be a whole number from ${MIN_PORT} to ${MAX_PORT}`,
    );
  }
  const server = createServer((request, response) => {
    void respond(root, request, response).catch((error: unknown) => {
      if (response.headersSent) {
        response.end();
        return;
      }
      const body = Buffer.from('Internal Server Error\n', 'utf8');
      response.writeHead(500, {
        'Content-Type': MIME_TYPES['.txt'] ?? DEFAULT_MIME_TYPE,
        'Content-Length': String(body.length),
      });
      response.end(body);
      console.error(`serving ${displayPath(root)}: ${messageOf(error)}`);
    });
  });
  await listenOnLoopback(server, port);
  const url = `http://${LOOPBACK_HOST}:${port}`;
  console.log(`serving ${displayPath(root)} on ${url}`);
  return { url, port, close: () => closeServer(server) };
}

/** What a command line asked for: one configuration built, or one directory served. */
type CliRequest =
  | { mode: 'build'; configuration: ConfigurationName; outDir?: string }
  | { mode: 'serve'; dir: string; port: number };

/** A command line this harness cannot act on: reported with the usage text and exit code 2. */
class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

/** The usage text, printed for every bad invocation; it names all seven configurations. */
const USAGE = [
  'build harness — usage:',
  '  node tests/helpers/build.ts <configuration> [--out-dir <dir>]',
  `      build one configuration into <dir>, by default ${OUT_ROOT}/<configuration>;`,
  `      <configuration> is one of: ${CONFIGURATION_NAMES.join(', ')}`,
  `      the invalid configuration reports one failing build per INVALID_CASES entry`,
  '  node tests/helpers/build.ts --serve <dir> --port <port>',
  `      serve a built directory on ${LOOPBACK_HOST} until interrupted`,
].join('\n');

/** The three flags the command line accepts, and the only ones. */
const VALUE_FLAGS: ReadonlySet<string> = new Set(['--out-dir', '--serve', '--port']);

/**
 * Reads the command line, or throws a `UsageError` naming what is wrong with it: no argument, an
 * unknown configuration or option, a flag repeated, a flag whose value is missing or looks like
 * another flag, and a `--serve` without its `--port` or the other way round.
 */
function parseArguments(argv: readonly string[]): CliRequest {
  if (argv.length === 0) {
    throw new UsageError('no argument was given');
  }
  const seen = new Set<string>();
  let configuration: string | null = null;
  let outDir: string | null = null;
  let serveDir: string | null = null;
  let portText: string | null = null;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] ?? '';
    if (VALUE_FLAGS.has(argument)) {
      if (seen.has(argument)) {
        throw new UsageError(`${argument} was given more than once`);
      }
      seen.add(argument);
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new UsageError(`${argument} needs a value`);
      }
      index += 1;
      if (argument === '--out-dir') {
        outDir = value;
      } else if (argument === '--serve') {
        serveDir = value;
      } else {
        portText = value;
      }
      continue;
    }
    if (argument.startsWith('-')) {
      throw new UsageError(`${argument} is not an option this harness knows`);
    }
    if (configuration !== null) {
      throw new UsageError(
        `more than one configuration was given: "${configuration}" and "${argument}"`,
      );
    }
    configuration = argument;
  }
  if (serveDir !== null || portText !== null) {
    if (configuration !== null || outDir !== null) {
      throw new UsageError('--serve serves a directory, so it takes no configuration and no --out-dir');
    }
    if (serveDir === null) {
      throw new UsageError('--port was given without --serve');
    }
    if (portText === null) {
      throw new UsageError('--serve was given without --port');
    }
    const port = Number(portText);
    if (!/^\d+$/.test(portText) || port < MIN_PORT || port > MAX_PORT) {
      throw new UsageError(
        `--port needs a whole number from ${MIN_PORT} to ${MAX_PORT}, not "${portText}"`,
      );
    }
    return { mode: 'serve', dir: serveDir, port };
  }
  if (configuration === null) {
    throw new UsageError('no configuration was given');
  }
  if (!isConfigurationName(configuration)) {
    throw new UsageError(
      `"${configuration}" is not a build configuration; the seven are ${CONFIGURATION_NAMES.join(', ')}`,
    );
  }
  if (configuration === 'invalid' && outDir !== null) {
    throw new UsageError(
      `the invalid configuration writes one directory per case under ${OUT_ROOT}/invalid, so --out-dir does not apply to it`,
    );
  }
  return outDir === null
    ? { mode: 'build', configuration }
    : { mode: 'build', configuration, outDir };
}

/**
 * Runs one command line and returns its exit code: `0` when the build succeeded (or every invalid
 * build failed, which is what that configuration proves), `1` when a build failed as its
 * configuration intends or not, and `2` for a usage or harness fault.
 */
async function runCli(argv: readonly string[]): Promise<number> {
  let request: CliRequest;
  try {
    request = parseArguments(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) {
      throw error;
    }
    console.error(`build harness: ${error.message}\n\n${USAGE}`);
    return 2;
  }

  if (request.mode === 'serve') {
    try {
      const served = await serve(request.dir, request.port);
      await new Promise<void>((resolveStop) => {
        process.once('SIGINT', resolveStop);
        process.once('SIGTERM', resolveStop);
      });
      await served.close();
      return 0;
    } catch (error) {
      console.error(`build harness: ${messageOf(error)}`);
      return 2;
    }
  }

  if (request.configuration === 'invalid') {
    try {
      const results = await buildInvalid();
      const succeeded = results.filter((result) => result.ok);
      for (const result of succeeded) {
        console.error(
          `build harness: an invalid build into ${result.outDir} succeeded, so the configuration validation is not doing its job`,
        );
        if (result.stderr.trim() !== '') {
          process.stderr.write(result.stderr);
        }
      }
      return succeeded.length === 0 ? 0 : 1;
    } catch (error) {
      console.error(`build harness: ${messageOf(error)}`);
      return 2;
    }
  }

  try {
    const result = await build(
      request.configuration,
      request.outDir === undefined ? {} : { outDir: request.outDir },
    );
    if (result.ok) {
      return 0;
    }
    if (result.stderr.trim() !== '') {
      process.stderr.write(result.stderr);
    }
    return 1;
  } catch (error) {
    console.error(`build harness: ${messageOf(error)}`);
    return 2;
  }
}

/* The command-line entry point: run only when this file is what Node was asked to execute, so a
 * suite that imports the exports above never builds anything by accident. */
const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(resolve(invokedPath)).href) {
  try {
    process.exitCode = await runCli(process.argv.slice(2));
  } catch (error) {
    console.error(`build harness: ${messageOf(error)}`);
    process.exitCode = 2;
  }
}

