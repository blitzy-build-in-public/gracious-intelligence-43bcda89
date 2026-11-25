/**
 * The launch guard — `npm run launch-check` (AAP 0.9.5, WT-10).
 *
 * The site builds complete while some of its copy is still owed by the owner, so a build that is
 * safe to look at is not yet safe to publish. This guard is the mechanical half of that pair, the
 * `noindex` switch being the other: it fails while the project's marker survives anywhere in the
 * content layer or in a page a build has already emitted, and it fails when the site is marked live
 * without the absolute address a live site's `sitemap.xml`, `og:url` and `robots.txt` are built
 * from. A designed fallback — a state the site renders on purpose, such as the panel that stands in
 * for a screenshot nobody has supplied yet — is not a marker, and this guard never fails on one.
 *
 * Three invocations compose, and the optional argument is what makes the second possible:
 *
 *   node scripts/launch-check.ts          the content layer, plus `dist/` when it exists
 *   node scripts/launch-check.ts <dir>    the content layer, plus that built directory
 *   npm run launch-check -- <dir>         the same, through the package script
 *
 * `npm run build` runs it before `astro build` whenever the site is live, so a live build cannot
 * publish a marker, and the test harness runs it for its `guard` and `live` configurations.
 *
 * It reads only and writes nothing. The site's own configuration is delegated to `src/lib/env.ts`,
 * the single module that validates it, so this guard cannot disagree with the site about whether it
 * is live, and no value of any configuration variable is echoed into a message. `LAUNCH_CHECK` is
 * the one variable read here, and only its exact value `skip` matters: the harness sets it to build
 * the live configuration while the copy is still outstanding. Nothing under `src/` may read it, and
 * no path under `src/` may import this script.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The one marker, matched case-sensitively and declared here and nowhere else in this file. */
const MARKER = 'TO BE PROVIDED';

/** The harness-only variable that opens the gate, and the only value of it that does. */
const BYPASS_VAR = 'LAUNCH_CHECK';
const BYPASS_VALUE = 'skip';

/** Prefix on every line this script prints, so one grep of a build log finds the whole report. */
const PREFIX = 'launch-check:';

/** The content layer this guard always reads, and where `astro build` writes, from the root. */
const CONTENT_DIRECTORY = 'src/content';
const BUILD_DIRECTORY = 'dist';

/**
 * Directory names the tree walk never enters. Both scans start at the content layer or at a build's
 * output, so none of these belongs in either; naming them here keeps a stray argument from turning
 * the guard into a walk of `node_modules`.
 */
const SKIPPED_DIRECTORY_NAMES = new Set(['node_modules', '.git', '.build', 'screenshots']);

/**
 * Extensions never read as text. A raster or a font is not copy, and decoding one would at best
 * waste time and at worst raise a hit inside its bytes.
 */
const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.avif',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
]);

/**
 * This script's own directory and the repository root above it, both taken from the module's URL
 * rather than from the working directory, so the guard reads the same tree whatever directory it is
 * invoked from and needs no path configuration.
 */
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = dirname(SCRIPT_DIRECTORY);

/** What one marker scan found. */
interface ScanResult {
  /** How many files were read. */
  readonly fileCount: number;
  /** One failure line per file that holds the marker, in path order. */
  readonly failures: string[];
}

/** The live check's verdict. */
interface LiveResult {
  /** One failure line when the configuration could not be read or a live site has no address. */
  readonly failures: string[];
  /** Whether the site is live, once the configuration was read; `null` when it could not be. */
  readonly live: boolean | null;
}

/** The `code` an `fs` failure carries, or the empty string for any other throwable. */
function fileSystemErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const { code } = error as { code?: unknown };
    return typeof code === 'string' ? code : '';
  }
  return '';
}

/**
 * Whether `path` is an existing directory. Only a path that is absent reads as `false`: a
 * permission or I/O failure is thrown, because reporting it as missing would tell a maintainer to
 * create something that is already there.
 */
async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch (error) {
    const code = fileSystemErrorCode(error);
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      return false;
    }
    throw error;
  }
}

/** `file` as a failure names it: repository-relative and slash-separated when it lies inside. */
function reportPath(file: string): string {
  const fromRoot = relative(REPOSITORY_ROOT, file);
  const outside = fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot);
  return (fromRoot === '' || outside ? file : fromRoot).split(sep).join('/');
}

/** `1 file` / `15 files`. */
function describeCount(count: number): string {
  return `${count} file${count === 1 ? '' : 's'}`;
}

/** `line 49` for one hit, `lines 49, 50, 52, 53` for several. */
function describeLines(lines: readonly number[]): string {
  return `${lines.length === 1 ? 'line' : 'lines'} ${lines.join(', ')}`;
}

/** Every file under `directory`, recursively, in name order so a report is stable. */
async function listFiles(
  directory: string,
  options: { readonly skipBinary: boolean },
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const ordered = [...entries].sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
  const files: string[] = [];
  for (const entry of ordered) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORY_NAMES.has(entry.name)) {
        files.push(...(await listFiles(join(directory, entry.name), options)));
      }
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (options.skipBinary && BINARY_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      continue;
    }
    files.push(join(directory, entry.name));
  }
  return files;
}

/** The 1-based numbers of the lines in `file` that hold the marker, in file order. */
async function markerLines(file: string): Promise<number[]> {
  const contents = await readFile(file, 'utf8');
  const lines: number[] = [];
  contents.split('\n').forEach((line, index) => {
    if (line.includes(MARKER)) {
      lines.push(index + 1);
    }
  });
  return lines;
}

/**
 * Scans one directory tree for the marker. Every file that holds it becomes one failure line naming
 * the file and every line the marker sits on, so a single run tells a maintainer the whole job
 * rather than its first hit.
 */
async function scanForMarker(
  directory: string,
  options: { readonly skipBinary: boolean },
): Promise<ScanResult> {
  const files = await listFiles(directory, options);
  const failures: string[] = [];
  for (const file of files) {
    const lines = await markerLines(file);
    if (lines.length > 0) {
      failures.push(`${reportPath(file)} still holds ${MARKER} at ${describeLines(lines)}`);
    }
  }
  return { fileCount: files.length, failures };
}

/**
 * The live check, which protects the sitemap and the metadata rather than the copy, so
 * `LAUNCH_CHECK` never suppresses it.
 *
 * Both answers come from `src/lib/env.ts` because it is the one module that validates the four
 * configuration values: a second reader here could disagree with the site about whether it is live,
 * and `env.ts`'s own failures already name the variable and the rule they broke without echoing the
 * value. The import is dynamic so that a configuration module which cannot be loaded or evaluated
 * is reported as one line like every other failure, instead of as a stack trace.
 */
async function checkLive(): Promise<LiveResult> {
  let live: boolean;
  let siteUrl: string | null;
  try {
    const env = await import('../src/lib/env.ts');
    live = env.isLive();
    siteUrl = env.getSiteUrl();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { failures: [message], live: null };
  }
  if (live && (siteUrl === null || siteUrl === '')) {
    return {
      failures: [
        'PUBLIC_SITE_URL is empty but the site is live: a live build needs the absolute address that sitemap.xml, og:url, og:image and the robots.txt sitemap line are built from, so set PUBLIC_SITE_URL or stop marking the site live, then rebuild',
      ],
      live,
    };
  }
  return { failures: [], live };
}

/**
 * Runs the checks this invocation calls for and prints their outcome: every failure first, or one
 * summary line when all pass. Returns the exit code.
 *
 * `LAUNCH_CHECK=skip` suppresses both marker scans — the content layer, and so the built output and
 * its optional directory argument with them — and nothing else. The gate is opened loudly, in one
 * line, because a reader of the build log has to be able to see that it was opened and why.
 */
async function main(): Promise<number> {
  const bypassed = process.env[BYPASS_VAR] === BYPASS_VALUE;
  const failures: string[] = [];
  const scanned: string[] = [];

  if (bypassed) {
    console.log(`${PREFIX} marker scan skipped because ${BYPASS_VAR}=${BYPASS_VALUE}.`);
  } else {
    const contentDirectory = join(REPOSITORY_ROOT, CONTENT_DIRECTORY);
    if (await isDirectory(contentDirectory)) {
      const content = await scanForMarker(contentDirectory, { skipBinary: false });
      failures.push(...content.failures);
      scanned.push(`${CONTENT_DIRECTORY} (${describeCount(content.fileCount)})`);
    } else {
      failures.push(
        `${CONTENT_DIRECTORY} is missing or is not a directory, so the marker scan has nothing to read; the repository is incomplete until the content layer is restored`,
      );
    }

    const argument = process.argv[2];
    const builtDirectory =
      argument === undefined ? join(REPOSITORY_ROOT, BUILD_DIRECTORY) : resolve(argument);
    const builtExists = await isDirectory(builtDirectory);
    if (argument !== undefined && !builtExists) {
      failures.push(
        `${argument} does not exist or is not a directory, so the built-output scan cannot run; pass the directory a build wrote, or omit the argument to scan ${BUILD_DIRECTORY} when it exists`,
      );
    } else if (builtExists) {
      const built = await scanForMarker(builtDirectory, { skipBinary: true });
      failures.push(...built.failures);
      scanned.push(`${reportPath(builtDirectory)} (${describeCount(built.fileCount)})`);
    } else {
      scanned.push(`${BUILD_DIRECTORY} does not exist, so the built output was not scanned`);
    }
  }

  const live = await checkLive();
  failures.push(...live.failures);

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`${PREFIX} ${failure}`);
    }
    const count = `${failures.length} failure${failures.length === 1 ? '' : 's'}`;
    console.error(`${PREFIX} ${count}; the site must not be published yet.`);
    return 1;
  }

  const liveSummary =
    live.live === true
      ? 'the site is live and PUBLIC_SITE_URL is set'
      : 'the site is not live, so no site address is required';
  console.log(
    bypassed
      ? `${PREFIX} live check passed: ${liveSummary}.`
      : `${PREFIX} marker scan passed: ${scanned.join('; ')}. live check passed: ${liveSummary}.`,
  );
  return 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${PREFIX} ${message}`);
  process.exitCode = 1;
}
