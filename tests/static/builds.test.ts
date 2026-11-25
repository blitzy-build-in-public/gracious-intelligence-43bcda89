/**
 * The configuration builds and the launch guard (WT-10, AAP 0.9.2, 0.9.5, 0.13.2).
 *
 * This file drives the three configurations AAP 0.13.2 marks as never reaching a browser — `flags`,
 * `guard` and `invalid` — and it proves the two mechanisms that decide whether a build may exist at
 * all: the launch guard, which refuses while the content specification's marker survives, and the
 * configuration validation that stops a build on a value that is set but invalid rather than falling
 * back to another state. Both are prose in the plan until a command's exit code says so; that is what
 * this file turns them into.
 *
 * Every build goes through `tests/helpers/build.ts`, which owns the seven configurations' environment
 * table and the generated-asset precondition. No Astro invocation is written here, and this file
 * never restates a configuration's environment: an ambient `LAUNCH_CHECK` cannot leak in, because the
 * harness deletes it unless a configuration sets it.
 *
 * What the project rules require of this file, and where each is honoured:
 *
 * - **B-4** — no invented content and no dead control. `TO BE PROVIDED` is the only placeholder the
 *   product carries, and this file proves a live build refuses to publish it. The `flags` copy's
 *   biography is the harness's own plainly synthetic test text, confined to a throwaway build, and it
 *   is asserted to differ from every string the site ships.
 * - **B-2** — configuration only through the four documented names, empty by default, and no secret.
 *   The `invalid` cases prove each value is validated and that the failure names the variable and the
 *   rule, never the value. Only the plan's example hosts appear anywhere in this file.
 * - **B-1** — no third-party runtime request. Nothing here fetches or resolves a foreign origin; the
 *   only commands spawned are the project's own npm scripts.
 * - **W-1** and **W-2** are not asserted here and are not weakened by it: the `flags` configuration
 *   changes only the two conditional fields in a temporary copy, so no design-reference text and no
 *   server-side construct can enter through this file. The one spawned non-build command is the
 *   project's own guard script.
 * - **B-3** — keyboard operation, contrast and axe belong to `tests/e2e/a11y.spec.ts`. Nothing here
 *   asserts anything about the rendered `/about` beyond the presence of the two conditional blocks'
 *   text.
 *
 * Isolation. Each configuration is built into this suite's own directory under `.build/`, named
 * `static-builds-<configuration>`, so no assertion reads `dist/`, another suite's output or an earlier
 * configuration's pages. The `invalid` cases are the one exception the harness imposes: `buildInvalid()`
 * takes no output directory and writes `.build/invalid/<case>` itself, one directory per case, which is
 * still per-case isolation and never another suite's tree.
 *
 * The absent content specification, and what it means for the `flags` assertions. The document was
 * never supplied to this run: `tests/fixtures/website-content-specification.md` carries its
 * absent-document notice, so `loadSpecification()` throws rather than returning a model with no copy in
 * it (AAP 0.7.7), and every content module holds the launch marker in place of the copy. The Why now
 * block's expected strings are therefore taken from the content layer that the flags build actually
 * renders — the specification is cross-checked against them whenever the document is present, and never
 * re-typed here. Copy fidelity itself is `tests/static/output.test.ts`'s WT-15 group, which fails for
 * exactly this reason until the document arrives; this file asserts the block's presence and ordering,
 * which is the half the conditional switch is responsible for.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  build,
  buildInvalid,
  CONFIGURATION_NAMES,
  environmentFor,
  INVALID_CASES,
  outDirFor,
} from '../helpers/build.ts';
import type { BuildResult, ConfigurationName, InvalidCase } from '../helpers/build.ts';
import { FIXTURE_ABSENT_MARKER, loadSpecification, normaliseText } from '../helpers/spec.ts';
import type { Specification } from '../helpers/spec.ts';
import { about } from '../../src/content/about.ts';

/* -------------------------------------------------------------------------------------------------
 * Paths
 * ---------------------------------------------------------------------------------------------- */

/** This file's directory, from which the repository root and every input are resolved. */
const TEST_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));

/** The repository root, taken from this module's own location rather than the working directory. */
const REPOSITORY_ROOT = path.resolve(TEST_DIRECTORY, '..', '..');

/** The one output root every configuration builds under, and the directory `.gitignore` covers. */
const BUILD_OUTPUT_ROOT = path.join(REPOSITORY_ROOT, '.build');

/**
 * This suite's own output directories, one per configuration it drives, named for the suite so none
 * can be mistaken for another check's build (AAP 0.13.2).
 */
const OUTPUT_DIRECTORIES = {
  flags: path.join(BUILD_OUTPUT_ROOT, 'static-builds-flags'),
  guard: path.join(BUILD_OUTPUT_ROOT, 'static-builds-guard'),
  live: path.join(BUILD_OUTPUT_ROOT, 'static-builds-live'),
} as const;

/**
 * Where the harness writes the `invalid` builds: `.build/invalid`, with one directory per case below
 * it. It is the harness's own path and is read from the harness rather than restated here.
 */
const INVALID_OUTPUT_ROOT = outDirFor('invalid');

/** The content layer the launch guard always scans, and the about module the flags copy rewrites. */
const CONTENT_DIRECTORY = path.join(REPOSITORY_ROOT, 'src', 'content');
const ABOUT_CONTENT_FILE = path.join(CONTENT_DIRECTORY, 'about.ts');

/** The harness's own source, which is where the flags biography's literal lives. */
const HARNESS_SOURCE = path.join(TEST_DIRECTORY, '..', 'helpers', 'build.ts');

/* -------------------------------------------------------------------------------------------------
 * The facts this suite asserts against
 * ---------------------------------------------------------------------------------------------- */

/**
 * The one marker the launch guard refuses (AAP 0.9.5). It is matched case-sensitively in the content
 * layer and in the built pages, exactly as the guard matches it.
 */
const MARKER = 'TO BE PROVIDED';

/**
 * The seven configurations AAP 0.13.2 defines, in its order. An incomplete table would silently
 * change what every other suite tests, so the list is asserted rather than assumed.
 */
const EXPECTED_CONFIGURATIONS: readonly ConfigurationName[] = [
  'default',
  'live',
  'mailto',
  'screens',
  'flags',
  'guard',
  'invalid',
];

/**
 * The eight navigable routes the `live` build must emit (AAP 0.4.2), each as its Astro directory
 * page. The 404 is asserted separately, because it is a file rather than a directory page.
 */
const PAGE_PATHS: readonly string[] = [
  '/',
  '/platform',
  '/platform/site-intelligence',
  '/sovereignty',
  '/about',
  '/contact',
  '/privacy',
  '/legal',
];

/** The three image files `npm run assets` writes into `public/` and every build publishes. */
const GENERATED_ASSET_PATHS: readonly string[] = [
  'favicon.svg',
  'og-image.png',
  'apple-touch-icon.png',
];

/** The file names a build emits when it renders a page or one of the two generated text routes. */
const EMITTED_PAGE_FILE_NAMES: ReadonlySet<string> = new Set([
  'index.html',
  'sitemap.xml',
  'robots.txt',
]);

/**
 * How long one build may take. These are real builds of the whole site, including the harness's
 * project copy for `flags`; the bound is generous so a slow host is not a failure, while a build that
 * hangs still surfaces as a timeout naming what it was building.
 */
const BUILD_TIMEOUT_MS = 600_000;

/** The shorter bound for the guard command, which reads files and renders nothing. */
const GUARD_COMMAND_TIMEOUT_MS = 300_000;

/** `npm` for this platform, named once so a spawn failure reports the binary it looked for. */
const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/**
 * The four documented configuration variables and the harness-only bypass. They are listed so the
 * commands this file spawns see a drained environment: a value left in the caller's shell must never
 * change what a configuration proves (AAP 0.9.1, 0.13.2).
 */
const CONFIGURATION_VARIABLES: readonly string[] = [
  'PUBLIC_FORM_ENDPOINT',
  'PUBLIC_CONTACT_EMAIL',
  'PUBLIC_SITE_URL',
  'PUBLIC_SITE_LIVE',
];
const BYPASS_VARIABLE = 'LAUNCH_CHECK';

/**
 * The three variables that have an invalid state (AAP 0.9.2), with the rule terms a failure message
 * must state. `PUBLIC_SITE_LIVE` is deliberately absent: 0.9.2 accepts any value for it, with
 * anything other than exactly `true` meaning not live and only printing a warning, so it has no
 * invalid state to exercise.
 *
 * The terms are the substance of each rule, not a script for the wording: an assertion passes when
 * the message names the variable and states at least one of them, and the message the assertion
 * prints names the shortfall so a vague failure is reported as a defect instead of being accepted.
 */
const RULE_TERMS: ReadonlyMap<string, readonly string[]> = new Map([
  ['PUBLIC_FORM_ENDPOINT', ['absolute', 'url', 'scheme', 'https', 'localhost', '127.0.0.1']],
  ['PUBLIC_CONTACT_EMAIL', ['single', 'address', 'space', 'comma', 'question mark']],
  ['PUBLIC_SITE_URL', ['absolute', 'origin', 'path', 'https', 'localhost', '127.0.0.1']],
]);

/** The local hostnames for which plain `http:` is accepted (AAP 0.9.1). */
const LOCAL_HOSTNAMES: ReadonlySet<string> = new Set(['localhost', '127.0.0.1']);

/** One `local@domain.tld` address, checked here independently of the validator the build uses. */
const EMAIL_PATTERN =
  /^[A-Za-z0-9_%+-]+(?:\.[A-Za-z0-9_%+-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

/**
 * The only hosts this suite may contain: the plan's own example stubs (AAP 0.13.2). Anything else in
 * a case value would be a real host and, if it carried a credential, a secret.
 */
const EXAMPLE_HOSTS: ReadonlySet<string> = new Set(['site.example', 'forms.example', 'localhost', '127.0.0.1']);

/** A hostname-shaped run of labels, used to prove no case value names a host outside the allow list. */
const HOSTNAME_PATTERN = /(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}/gi;

/** The shapes that mark a value as a credential rather than as the harmless example value it should be. */
const SECRET_SHAPE_PATTERN =
  /sk_live_|sk_test_|AKIA|ASIA|ghp_|gho_|ghs_|github_pat_|xox[abp]-|AIza|bearer\s|password|secret|api[_-]?key|token|private key/i;

/* -------------------------------------------------------------------------------------------------
 * Process helpers
 * ---------------------------------------------------------------------------------------------- */

/** What one spawned command produced. A non-zero `status` is a result, never a harness fault. */
interface CommandResult {
  /** The command line, as a failure message reports it. */
  readonly command: string;
  /** The exit status, or `1` when the child was killed without reporting one. */
  readonly status: number;
  /** Everything the child wrote to stdout. */
  readonly stdout: string;
  /** Everything the child wrote to stderr. */
  readonly stderr: string;
}

/**
 * The environment a command this file spawns inherits: the ambient one (so `PATH`, `HOME` and the
 * npm caches work), with the four documented variables emptied and the harness-only bypass removed,
 * so a value exported in the caller's shell cannot change what a check proves.
 */
function drainedEnvironment(overrides: Readonly<Record<string, string>> = {}): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env };
  for (const name of CONFIGURATION_VARIABLES) {
    environment[name] = '';
  }
  delete environment[BYPASS_VARIABLE];
  return Object.assign(environment, overrides);
}

/** Runs one command from the repository root and captures both streams, whatever the exit status. */
function runCommand(
  command: string,
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
): CommandResult {
  const result = spawnSync(command, [...args], {
    cwd: REPOSITORY_ROOT,
    env: environment,
    encoding: 'utf8',
  });
  const rendered = `${command} ${args.join(' ')}`;
  if (result.error !== undefined) {
    throw new Error(`${rendered} could not be started in ${REPOSITORY_ROOT}: ${result.error.message}`);
  }
  return {
    command: rendered,
    status: result.status === null ? 1 : result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

/**
 * Runs one of the project's own package scripts. The script is the entry point rather than the file
 * behind it, because the guard is a package script and the plan's contract is with that command.
 */
function runPackageScript(
  script: string,
  overrides: Readonly<Record<string, string>> = {},
): CommandResult {
  return runCommand(NPM_COMMAND, ['run', script], drainedEnvironment(overrides));
}

/**
 * A command's or a build's two streams as one text, which is what a failure has to be read across:
 * npm forwards a child's stderr differently depending on the script form.
 */
function combinedOutput(result: { readonly stdout: string; readonly stderr: string }): string {
  return `${result.stdout}\n${result.stderr}`;
}

/** The last stretch of a child's output, so a failure quotes what it actually said. */
function outputTail(text: string, limit = 4000): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return '(no output)';
  }
  return trimmed.length <= limit ? trimmed : `…${trimmed.slice(-limit)}`;
}

/** One build, as a failure message names it: the configuration, its exit status and its directory. */
function describeBuild(result: BuildResult): string {
  return `${result.configuration} build in ${path.relative(REPOSITORY_ROOT, result.outDir)} (exit ${result.status})`;
}

/** One build's captured output, prefixed, for a failure message that has to quote the cause. */
function buildOutput(result: BuildResult): string {
  return `stdout:\n${outputTail(result.stdout)}\nstderr:\n${outputTail(result.stderr)}`;
}

/**
 * `git status` for tracked files only, so a build that leaves an untracked artefact under an ignored
 * path is not mistaken for a mutation of the repository while a real edit to a tracked file is.
 */
function gitStatusSnapshot(): string {
  const result = runCommand(
    'git',
    ['status', '--porcelain', '--untracked-files=no'],
    { ...process.env },
  );
  assert.equal(
    result.status,
    0,
    `git status failed in ${REPOSITORY_ROOT} (exit ${result.status}):\n${outputTail(combinedOutput(result))}`,
  );
  return result.stdout;
}

/** A file's SHA-256, so "this file did not change" is a byte comparison rather than a guess. */
function fileHash(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

/* -------------------------------------------------------------------------------------------------
 * Reading what a build emitted
 * ---------------------------------------------------------------------------------------------- */

/** Every regular file under `directory`, recursively, in name order; empty when it holds nothing. */
function filesUnder(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  )) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...filesUnder(entryPath));
      continue;
    }
    if (entry.isFile()) {
      found.push(entryPath);
    }
  }
  return found;
}

/** `directory`-relative, slash-separated paths of everything under it, which is what a report names. */
function relativeFiles(directory: string): string[] {
  return filesUnder(directory).map((file) =>
    path.relative(directory, file).split(path.sep).join('/'),
  );
}

/**
 * The pages and generated text routes a build left under `directory`. A build that failed after
 * rendering would leave a publishable half-site, so this is the list a failing build's assertions
 * require to be empty (AAP 0.9.5).
 */
function emittedPages(directory: string): string[] {
  return relativeFiles(directory).filter((file) =>
    EMITTED_PAGE_FILE_NAMES.has(path.basename(file)),
  );
}

/** The file one route is published as: `/` is `index.html`, `/about` is `about/index.html`. */
function builtPageFile(outDir: string, route: string): string {
  const segments = route.split('/').filter((segment) => segment !== '');
  return path.join(outDir, ...segments, 'index.html');
}

/**
 * The repository-relative paths, slash-separated, of the content modules holding the marker. The
 * guard reports the files it found, and this is the independent list those reports are checked
 * against, so "the guard named a file that holds the marker" cannot pass on a stale or invented path.
 */
function markerFiles(): string[] {
  return filesUnder(CONTENT_DIRECTORY)
    .filter((file) => readFileSync(file, 'utf8').includes(MARKER))
    .map((file) => path.relative(REPOSITORY_ROOT, file).split(path.sep).join('/'));
}

/* -------------------------------------------------------------------------------------------------
 * Visible text
 * ---------------------------------------------------------------------------------------------- */

/** An HTML comment, content included. A comment's content is never copy. */
const HTML_COMMENT_PATTERN = /<!--[\s\S]*?-->/g;

/** A `<script>` or `<style>` element with its content: the islands' code is not text a visitor reads. */
const SCRIPT_OR_STYLE_PATTERN = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;

/** Any remaining tag. Attribute values inside are removed with it; they are not visible text. */
const TAG_PATTERN = /<[^>]*>/g;

/**
 * The text a visitor reads in one document, normalised for comparison: comments, script and style
 * content and every tag removed, then the shared `tests/helpers/spec.ts` normaliser applied, which
 * decodes entities — `&amp;` in `McKinsey &amp; Company` included — folds the two quote styles and
 * collapses whitespace. The same normaliser runs over every expected string, so the two sides cannot
 * disagree about an entity or a whitespace run (AAP 0.7.3).
 */
function visibleText(document: string): string {
  const withoutComments = document.replace(HTML_COMMENT_PATTERN, '');
  const withoutScripts = withoutComments.replace(SCRIPT_OR_STYLE_PATTERN, '');
  return normaliseText(withoutScripts.replace(TAG_PATTERN, ''));
}

/* -------------------------------------------------------------------------------------------------
 * Value validation, checked independently of the validator the build runs
 * ---------------------------------------------------------------------------------------------- */

/** `value` parsed as an absolute URL, or `null` when it is not one. */
function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * Whether `value` is a *valid* setting for `variable` under AAP 0.9.2, decided here rather than by the
 * validator, so "every case carries a genuinely invalid value" is an independent check: an accepted
 * `https:` endpoint, a single address, and an `https:` origin with nothing after it are valid; a local
 * host may use `http:`; an empty value is the documented default and is never an invalid case.
 */
function isValidConfigurationValue(variable: string, value: string): boolean {
  switch (variable) {
    case 'PUBLIC_FORM_ENDPOINT': {
      const url = parseUrl(value);
      if (url === null) return false;
      return url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTNAMES.has(url.hostname));
    }
    case 'PUBLIC_SITE_URL': {
      const url = parseUrl(value);
      if (url === null) return false;
      const schemeAccepted =
        url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTNAMES.has(url.hostname));
      return schemeAccepted && url.pathname === '/' && url.search === '' && url.hash === '';
    }
    case 'PUBLIC_CONTACT_EMAIL':
      return EMAIL_PATTERN.test(value);
    default:
      return assert.fail(
        `${variable} is not a configuration variable with a validated shape; the three are PUBLIC_FORM_ENDPOINT, PUBLIC_CONTACT_EMAIL and PUBLIC_SITE_URL (AAP 0.9.2)`,
      );
  }
}


/* -------------------------------------------------------------------------------------------------
 * Deriving what the flags build must render
 * ---------------------------------------------------------------------------------------------- */

/**
 * The content specification, or `null` when the committed fixture holds no document.
 *
 * `loadSpecification()` throws for a fixture carrying the absent-document notice rather than
 * returning a model with no copy in it (AAP 0.7.7), and that is the state this checkout is in. Only
 * that condition is tolerated here: any other failure — an unreadable file, a document that cannot be
 * parsed — is rethrown, because neither is something a conditional-block assertion may paper over.
 * The document's own copy fidelity is WT-15's group in `tests/static/output.test.ts`.
 */
function specificationOrNull(): Specification | null {
  try {
    return loadSpecification();
  } catch (error) {
    if (error instanceof Error && error.message.includes(FIXTURE_ABSENT_MARKER)) {
      return null;
    }
    throw error;
  }
}

/** A staged `flags` project copy the harness has not deleted yet, and the two fields it rewrote. */
interface StagedFlagsCopy {
  /** The staged project directory under `.build/`. */
  readonly directory: string;
  /** The staged copy's `src/content/about.ts`. */
  readonly aboutFile: string;
  /** The biography the staged copy carries, as its string literal holds it. */
  readonly founderBio: string;
  /** `true` or `false`, as the staged copy writes `sourceConfirmed`. */
  readonly sourceConfirmed: string;
}

/** The `founderBio` literal of an `about.ts`, matched tolerantly around the colon and its quotes. */
const FOUNDER_BIO_LITERAL = /founderBio\s*:\s*(['"`])((?:(?!\1).)*)\1/;

/** The `sourceConfirmed` literal of an `about.ts`. */
const SOURCE_CONFIRMED_LITERAL = /sourceConfirmed\s*:\s*(true|false)/;

/**
 * The `flags` project copies still on disk, oldest first. The harness deletes its copy in a `finally`
 * block, so this is normally empty; it is read anyway, because a surviving copy is the most direct
 * evidence of what the build was handed.
 */
function stagedFlagsCopies(): StagedFlagsCopy[] {
  if (!existsSync(BUILD_OUTPUT_ROOT)) {
    return [];
  }
  const copies: StagedFlagsCopy[] = [];
  const directories = readdirSync(BUILD_OUTPUT_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('flags-project-'))
    .map((entry) => path.join(BUILD_OUTPUT_ROOT, entry.name))
    .sort((left, right) => statSync(left).mtimeMs - statSync(right).mtimeMs);
  for (const directory of directories) {
    const aboutFile = path.join(directory, 'src', 'content', 'about.ts');
    if (!existsSync(aboutFile)) {
      continue;
    }
    const source = readFileSync(aboutFile, 'utf8');
    copies.push({
      directory,
      aboutFile,
      founderBio: FOUNDER_BIO_LITERAL.exec(source)?.[2] ?? '',
      sourceConfirmed: SOURCE_CONFIRMED_LITERAL.exec(source)?.[1] ?? '',
    });
  }
  return copies;
}

/** The biography the flags configuration supplies, and where it was read from. */
interface FlagsBiography {
  /** The non-empty biography text the flags copy carries. */
  readonly bio: string;
  /** How a message names where it came from. */
  readonly origin: string;
  /** The surviving staged copy it was read from, or `null` when the harness had already deleted it. */
  readonly staged: StagedFlagsCopy | null;
}

/**
 * The biography the `flags` configuration writes into its copy, read from the two places it exists.
 *
 * First a staged copy under `.build/flags-project-*`, if one survived. Otherwise the harness's own
 * `FLAGS_FOUNDER_BIO` literal, read out of `tests/helpers/build.ts`: the harness deletes its copy in a
 * `finally` block, so the literal it rewrites that copy with is the same text by construction, and
 * deriving it there keeps this assertion true if the harness's sample text ever changes. Neither
 * location is re-typed here, and a biography that can be read from neither fails rather than being
 * dropped.
 */
function flagsBiography(): FlagsBiography {
  const surviving = stagedFlagsCopies().filter((copy) => copy.founderBio.trim() !== '').at(-1) ?? null;
  if (surviving !== null) {
    return {
      bio: surviving.founderBio,
      origin: `the staged copy ${path.relative(REPOSITORY_ROOT, surviving.aboutFile)}`,
      staged: surviving,
    };
  }
  const harnessSource = readFileSync(HARNESS_SOURCE, 'utf8');
  const bio = /const FLAGS_FOUNDER_BIO\s*=\s*'([^']*)'/.exec(harnessSource)?.[1] ?? '';
  assert.notEqual(
    bio.trim(),
    '',
    `the flags biography could not be read from either place it exists: no staged copy under ${path.relative(REPOSITORY_ROOT, BUILD_OUTPUT_ROOT)}/flags-project-* carries a non-empty founderBio (the harness deletes its copy when the build ends), and ${path.relative(REPOSITORY_ROOT, HARNESS_SOURCE)} holds no non-empty FLAGS_FOUNDER_BIO literal. Without the text the founder-block assertion cannot be made.`,
  );
  return { bio, origin: `the FLAGS_FOUNDER_BIO literal in ${path.relative(REPOSITORY_ROOT, HARNESS_SOURCE)}`, staged: null };
}

/** The non-empty values of one configuration's environment that look like a URL or an address. */
function configuredAddresses(configuration: ConfigurationName): string[] {
  return Object.values(environmentFor(configuration)).filter(
    (value) =>
      typeof value === 'string' && value !== '' && (value.includes('://') || value.includes('@')),
  );
}

/**
 * The line of a build's output that speaks about `variable`, or `null` when nothing does. The command
 * echo lines npm prints are skipped, so the match is the child's own report.
 */
function messageLineAbout(output: string, variable: string): string | null {
  for (const raw of output.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('>')) {
      continue;
    }
    if (line.includes(variable)) {
      return line;
    }
  }
  return null;
}

/* -------------------------------------------------------------------------------------------------
 * Phase 1 — the configuration table
 * ---------------------------------------------------------------------------------------------- */

describe('the configuration table AAP 0.13.2 defines', () => {
  it('names every one of the seven configurations', () => {
    const actual = new Set<string>(CONFIGURATION_NAMES);
    const expected = new Set<string>(EXPECTED_CONFIGURATIONS);
    const missing = [...expected].filter((name) => !actual.has(name));
    const unexpected = [...actual].filter((name) => !expected.has(name));
    assert.deepEqual(
      missing,
      [],
      `the harness's configuration table is missing ${missing.join(', ')}; AAP 0.13.2 defines ${EXPECTED_CONFIGURATIONS.join(', ')} and every suite's build depends on this list`,
    );
    assert.deepEqual(
      unexpected,
      [],
      `the harness's configuration table carries ${unexpected.join(', ')}, which AAP 0.13.2 does not define`,
    );
    assert.equal(
      CONFIGURATION_NAMES.length,
      EXPECTED_CONFIGURATIONS.length,
      `the harness names ${CONFIGURATION_NAMES.length} configurations where AAP 0.13.2 defines ${EXPECTED_CONFIGURATIONS.length}: ${CONFIGURATION_NAMES.join(', ')}`,
    );
  });

  it('gives an invalid case to exactly the three variables that have an invalid state', () => {
    const variables = INVALID_CASES.map((invalidCase) => invalidCase.variable);
    const actual = new Set(variables);
    assert.equal(
      actual.size,
      variables.length,
      `two invalid cases set the same variable (${variables.join(', ')}), so one of the three variables that has an invalid state is left unexercised`,
    );
    const expected = new Set(RULE_TERMS.keys());
    const missing = [...expected].filter((variable) => !actual.has(variable));
    const unexpected = [...actual].filter((variable) => !expected.has(variable));
    assert.deepEqual(
      missing,
      [],
      `no invalid case sets ${missing.join(', ')}, so a value that should stop the build would fall back instead; AAP 0.9.2 validates PUBLIC_FORM_ENDPOINT, PUBLIC_CONTACT_EMAIL and PUBLIC_SITE_URL`,
    );
    assert.deepEqual(
      unexpected,
      [],
      `${unexpected.join(', ')} is not a variable with an invalid state; AAP 0.9.2 gives PUBLIC_SITE_LIVE a defined non-live fallback and a warning instead of a failure`,
    );
    assert.ok(
      !actual.has('PUBLIC_SITE_LIVE'),
      'PUBLIC_SITE_LIVE must have no invalid case: AAP 0.9.2 accepts any value for it, with anything other than exactly "true" meaning not live',
    );
  });

  for (const invalidCase of INVALID_CASES) {
    it(`carries a genuinely invalid value and a stated rule for ${invalidCase.variable} (${invalidCase.name})`, () => {
      assert.match(
        invalidCase.name,
        /^[a-z0-9][a-z0-9-]*$/,
        `the case name "${invalidCase.name}" is used as an output directory name, so it must be a lower-case slug; it would otherwise name a path outside ${path.relative(REPOSITORY_ROOT, INVALID_OUTPUT_ROOT)}`,
      );
      assert.notEqual(
        invalidCase.value.trim(),
        '',
        `${invalidCase.name} sets ${invalidCase.variable} to an empty value, which is the documented default and therefore valid; an invalid case has to be set but invalid (AAP 0.9.2)`,
      );
      assert.equal(
        isValidConfigurationValue(invalidCase.variable, invalidCase.value),
        false,
        `${invalidCase.name} sets ${invalidCase.variable} to a value this suite reads as valid, so the build would be expected to succeed and the case would prove nothing: AAP 0.9.2 accepts an https URL, a single local@domain.tld address, and an https origin with nothing after it`,
      );
      assert.equal(
        typeof invalidCase.rule,
        'string',
        `${invalidCase.name} carries no rule description, so a failure it provokes could not say what was broken`,
      );
      const rule = invalidCase.rule.trim();
      assert.ok(
        rule.length >= 10 && rule.includes(' ') && !rule.includes('\n'),
        `${invalidCase.name}'s rule description ("${invalidCase.rule}") is not a readable single line a maintainer could act on`,
      );
      assert.ok(
        !SECRET_SHAPE_PATTERN.test(invalidCase.value),
        `${invalidCase.name}'s value looks like a credential rather than the harmless example this suite may contain; no secret belongs in a test value (rule B-2)`,
      );
      const hosts = invalidCase.value.match(HOSTNAME_PATTERN) ?? [];
      const foreignHosts = hosts.filter((host) => !EXAMPLE_HOSTS.has(host.toLowerCase()));
      assert.deepEqual(
        foreignHosts,
        [],
        `${invalidCase.name} names ${foreignHosts.join(', ')}, which is not one of the plan's example hosts (${[...EXAMPLE_HOSTS].join(', ')}); a real host has no place in a test value (rules B-2, B-1)`,
      );
    });
  }

  it('writes the invalid builds into this checkout, one directory per case', () => {
    assert.equal(
      INVALID_OUTPUT_ROOT,
      path.join(BUILD_OUTPUT_ROOT, 'invalid'),
      `the harness resolves its output root to ${INVALID_OUTPUT_ROOT}, which is not this checkout's ${path.join(BUILD_OUTPUT_ROOT, 'invalid')}; every assertion about an invalid build's output directory would then read another tree`,
    );
    const names = INVALID_CASES.map((invalidCase) => invalidCase.name);
    assert.equal(
      new Set(names).size,
      names.length,
      `two invalid cases share a directory name in ${names.join(', ')}; the harness builds one directory per case, so one case would overwrite another's output`,
    );
  });
});

/* -------------------------------------------------------------------------------------------------
 * Phase 2 — WT-10, first clause: the guard on its own
 * ---------------------------------------------------------------------------------------------- */

describe('WT-10: the launch guard fails on its own while the marker remains in the content layer', () => {
  /*
   * This is AAP 0.9.5's first invocation point — `npm run launch-check` as the command the project
   * ships, scanning `src/content` and `dist/` when it exists — and the mechanism its third invocation
   * point composes, since `npm test` and a live `npm run build` both run the same script. The bypass
   * has to work here for the harness to build the `live` configuration at all, which is why the two
   * runs are asserted together rather than one of them being taken on trust.
   *
   * Both runs happen once, in a hook, with the tracked working tree snapshotted either side of them,
   * so the assertions below read one observed pair of results.
   */
  let guardRun: CommandResult;
  let bypassRun: CommandResult;
  let trackedBefore = '';
  let trackedAfter = '';

  before(() => {
    trackedBefore = gitStatusSnapshot();
    guardRun = runPackageScript('launch-check');
    bypassRun = runPackageScript('launch-check', { [BYPASS_VARIABLE]: 'skip' });
    trackedAfter = gitStatusSnapshot();
  }, { timeout: GUARD_COMMAND_TIMEOUT_MS });

  it('exits non-zero while a content module still holds the marker, naming it and the file', () => {
    const output = combinedOutput(guardRun);
    assert.notEqual(
      guardRun.status,
      0,
      `\`npm run launch-check\` exited 0 while the content layer still holds ${MARKER}, so a live build could publish the placeholder (WT-10, rule B-4).\n${outputTail(output)}`,
    );
    assert.ok(
      output.includes(MARKER),
      `the guard failed (exit ${guardRun.status}) without naming ${MARKER}, so its failure does not tell a maintainer what to replace.\n${outputTail(output)}`,
    );
    const holding = markerFiles();
    assert.ok(
      holding.length > 0,
      `no file under ${path.relative(REPOSITORY_ROOT, CONTENT_DIRECTORY)} holds ${MARKER}, so this clause cannot be exercised: the guard's marker scan has nothing to find and the rest of this suite's expectations are stale`,
    );
    const named = holding.filter((file) => output.includes(file));
    assert.ok(
      named.length > 0,
      `the guard named no file that actually holds ${MARKER}; the modules holding it are ${holding.join(', ')}.\n${outputTail(output)}`,
    );
  });

  it('exits zero when the harness-only bypass is set', () => {
    const output = combinedOutput(bypassRun);
    assert.equal(
      bypassRun.status,
      0,
      `\`${BYPASS_VARIABLE}=skip npm run launch-check\` exited ${bypassRun.status}; AAP 0.9.5's bypass has to suppress the marker scans, or the harness cannot build the live configuration while the owner's copy is outstanding.\n${outputTail(output)}`,
    );
    assert.match(
      output,
      /skip/i,
      `the bypassed run passed without saying that it skipped the marker scan, so a reader of the log could not tell a clean site from an opened gate.\n${outputTail(output)}`,
    );
    assert.ok(
      !output.includes(MARKER),
      `the bypassed run still reported ${MARKER}, so the gate was not fully opened.\n${outputTail(output)}`,
    );
    assert.ok(
      !/\d+ failures?;/.test(output),
      `the bypassed run reported failures as well as skipping, which means the bypass suppresses less than AAP 0.9.5 describes.\n${outputTail(output)}`,
    );
  });

  it('changes no tracked file', () => {
    assert.equal(
      trackedAfter,
      trackedBefore,
      `the guard modified the tracked working tree: before ${JSON.stringify(trackedBefore)} and after ${JSON.stringify(trackedAfter)}; it reads and writes nothing, and a scan that edited a file would hide its own finding`,
    );
  });
});

/* -------------------------------------------------------------------------------------------------
 * Phase 3 — WT-10, second clause: the guard build fails and emits nothing
 * ---------------------------------------------------------------------------------------------- */

describe('WT-10: the guard build fails and leaves nothing publishable', () => {
  /*
   * The `guard` configuration is `live` with the bypass removed (AAP 0.13.2), so the build script runs
   * the guard before `astro build`. What has to hold is more than a non-zero exit: a build that failed
   * after rendering would leave a complete, publishable half-site in its output directory, which is why
   * the last test below requires that directory to be empty.
   */
  let guard: BuildResult;

  before(async () => {
    guard = await build('guard', { outDir: OUTPUT_DIRECTORIES.guard });
  }, { timeout: BUILD_TIMEOUT_MS });

  it('exits non-zero', () => {
    assert.equal(
      guard.configuration,
      'guard',
      `the harness built the ${guard.configuration} configuration where this group asked for guard`,
    );
    assert.equal(
      guard.outDir,
      OUTPUT_DIRECTORIES.guard,
      `the guard build wrote to ${guard.outDir} instead of this suite's own ${OUTPUT_DIRECTORIES.guard}, so its output could be another configuration's`,
    );
    assert.equal(
      guard.ok,
      false,
      `the guard build succeeded (${describeBuild(guard)}) where WT-10 requires it to fail: the site is marked live, the guard runs before the build, and the content layer still holds ${MARKER}.\n${buildOutput(guard)}`,
    );
    assert.notEqual(
      guard.status,
      0,
      `the guard build reported ok with exit status ${guard.status}, which contradicts its own ok=false verdict`,
    );
  });

  it('names the marker and a file that holds it', () => {
    const output = combinedOutput(guard);
    assert.ok(
      output.includes(MARKER),
      `the guard build failed without naming ${MARKER}, so its message does not say what must be replaced (AAP 0.9.5).\n${buildOutput(guard)}`,
    );
    const holding = markerFiles();
    const named = holding.filter((file) => output.includes(file));
    assert.ok(
      named.length > 0,
      `the guard build's message names no content module that holds ${MARKER}; the modules holding it are ${holding.join(', ')}.\n${buildOutput(guard)}`,
    );
  });

  it('echoes no configuration value', () => {
    const output = combinedOutput(guard);
    const addresses = configuredAddresses('guard');
    assert.ok(
      addresses.length > 0,
      'the guard configuration sets no address value at all, so this assertion would pass without testing anything: the guard is meant to run with a site address set and the marker still present',
    );
    const echoed = addresses.filter((address) => output.includes(address));
    assert.deepEqual(
      echoed,
      [],
      `the guard build echoed ${echoed.join(', ')} from its own configuration; AAP 0.9.2 requires a failure to name the variable and the rule and never the value it holds.\n${buildOutput(guard)}`,
    );
  });

  it('emits no page, so nothing publishable survives the failure', () => {
    const pages = emittedPages(OUTPUT_DIRECTORIES.guard);
    assert.deepEqual(
      pages,
      [],
      `the guard build left ${pages.join(', ')} in ${path.relative(REPOSITORY_ROOT, OUTPUT_DIRECTORIES.guard)}: a build that fails after rendering leaves a publishable half-site, which is the state the guard exists to prevent (WT-10, AAP 0.9.5).\n${buildOutput(guard)}`,
    );
    const files = relativeFiles(OUTPUT_DIRECTORIES.guard);
    assert.deepEqual(
      files,
      [],
      `the guard build wrote ${files.join(', ')} into ${path.relative(REPOSITORY_ROOT, OUTPUT_DIRECTORIES.guard)} before failing; a guard that stops the build has to stop it before anything is emitted.\n${buildOutput(guard)}`,
    );
  });
});

/* -------------------------------------------------------------------------------------------------
 * Phase 4 — WT-10, third clause: the bypassed live build succeeds
 * ---------------------------------------------------------------------------------------------- */

describe('WT-10: the bypassed live build succeeds and publishes a complete site', () => {
  /*
   * `live` is the bypass proof because the plan's seven configurations contain exactly one that is
   * live and bypassed (AAP 0.13.2): AAP 0.9.5's bypass exists only so the harness can build that
   * combination while `/privacy` and `/legal` still hold the owner's placeholders. "Succeeds" is
   * asserted as a complete site rather than as a zero exit code — eight page directories, the 404,
   * both generated text routes and the three generated images — because a green exit with a missing
   * page would be the more dangerous result.
   */
  let live: BuildResult;

  before(async () => {
    live = await build('live', { outDir: OUTPUT_DIRECTORIES.live });
  }, { timeout: BUILD_TIMEOUT_MS });

  it('exits zero', () => {
    assert.equal(
      live.outDir,
      OUTPUT_DIRECTORIES.live,
      `the live build wrote to ${live.outDir} instead of this suite's own ${OUTPUT_DIRECTORIES.live}`,
    );
    assert.equal(
      live.ok,
      true,
      `the bypassed live build failed (${describeBuild(live)}); with ${BYPASS_VARIABLE}=skip the guard must let it through, or no live configuration can be tested (AAP 0.9.5).\n${buildOutput(live)}`,
    );
    assert.equal(live.status, 0, `the live build reported ok with exit status ${live.status}`);
  });

  it('carries the eight pages, the 404 and both generated text routes', () => {
    const missing: string[] = [];
    for (const route of PAGE_PATHS) {
      const file = builtPageFile(OUTPUT_DIRECTORIES.live, route);
      if (!existsSync(file)) {
        missing.push(`${route} (${path.relative(REPOSITORY_ROOT, file)})`);
      }
    }
    for (const name of ['404.html', 'sitemap.xml', 'robots.txt']) {
      const file = path.join(OUTPUT_DIRECTORIES.live, name);
      if (!existsSync(file)) {
        missing.push(`${name} (${path.relative(REPOSITORY_ROOT, file)})`);
      }
    }
    assert.deepEqual(
      missing,
      [],
      `the bypassed live build is missing ${missing.join(', ')}; WT-01 and AAP 0.4.2 require the eight pages plus the 404, the sitemap and robots.txt from every build.\n${buildOutput(live)}`,
    );
  });

  it('carries the three generated image files at the published root', () => {
    const missing = GENERATED_ASSET_PATHS.filter(
      (name) => !existsSync(path.join(OUTPUT_DIRECTORIES.live, name)),
    ).map((name) => path.relative(REPOSITORY_ROOT, path.join(OUTPUT_DIRECTORIES.live, name)));
    assert.deepEqual(
      missing,
      [],
      `the bypassed live build is missing ${missing.join(', ')}; the generated assets are configuration-independent, so every build's output has to carry them (AAP 0.4.2).\n${buildOutput(live)}`,
    );
  });
});

/* -------------------------------------------------------------------------------------------------
 * Phase 5 — AAP 0.9.2: every invalid value stops the build
 * ---------------------------------------------------------------------------------------------- */

describe('AAP 0.9.2: every invalid value stops the build before it renders', () => {
  /*
   * One build per case (AAP 0.13.2: "one bad value per run"), each into its own directory, so one
   * failure cannot mask another. The harness owns the environment table and the invalid values; this
   * group asserts what the plan promises about the result: a non-zero exit, a message naming the
   * variable and the rule, no value echoed, and no page emitted.
   */
  let invalidResults: readonly BuildResult[] = [];
  let byVariable: ReadonlyMap<string, BuildResult> = new Map();

  before(async () => {
    invalidResults = await buildInvalid();
    const collected = new Map<string, BuildResult>();
    for (const [index, result] of invalidResults.entries()) {
      const invalidCase = INVALID_CASES[index];
      if (invalidCase !== undefined) {
        collected.set(invalidCase.variable, result);
      }
    }
    byVariable = collected;
  }, { timeout: BUILD_TIMEOUT_MS });

  /** The result for one case, or a failure naming the case the harness never built. */
  function resultFor(invalidCase: InvalidCase): BuildResult {
    const result = byVariable.get(invalidCase.variable);
    assert.ok(
      result !== undefined,
      `the harness built ${invalidResults.length} invalid case(s) and none of them sets ${invalidCase.variable}, so the ${invalidCase.name} case was never exercised (AAP 0.13.2)`,
    );
    return result;
  }

  it('builds one case per invalid value the harness declares', () => {
    assert.equal(
      invalidResults.length,
      INVALID_CASES.length,
      `the harness ran ${invalidResults.length} invalid builds for ${INVALID_CASES.length} cases; each case needs its own build so one failure cannot mask another (AAP 0.13.2)`,
    );
  });

  for (const invalidCase of INVALID_CASES) {
    describe(`${invalidCase.variable} (${invalidCase.name})`, () => {
      it('stops the build with a non-zero exit, in its own output directory', () => {
        const result = resultFor(invalidCase);
        assert.equal(
          result.outDir,
          path.join(INVALID_OUTPUT_ROOT, invalidCase.name),
          `the ${invalidCase.name} build wrote to ${result.outDir} rather than its own directory under ${path.relative(REPOSITORY_ROOT, INVALID_OUTPUT_ROOT)}, so its output could be another case's`,
        );
        assert.equal(
          result.ok,
          false,
          `setting ${invalidCase.variable} to a value that breaks "${invalidCase.rule}" let the build succeed (${describeBuild(result)}); AAP 0.9.2 stops the build on a value that is set but invalid rather than falling back to another state.\n${buildOutput(result)}`,
        );
        assert.notEqual(
          result.status,
          0,
          `the ${invalidCase.name} build reported ok with exit status ${result.status}, which contradicts its own ok=false verdict`,
        );
      });

      it('names the variable and states the rule it broke', () => {
        const result = resultFor(invalidCase);
        const output = combinedOutput(result);
        const message = messageLineAbout(output, invalidCase.variable);
        assert.ok(
          message !== null,
          `the ${invalidCase.name} build failed without naming ${invalidCase.variable} anywhere in its output, so a maintainer is told nothing about what to fix (AAP 0.9.2).\n${buildOutput(result)}`,
        );
        const terms = RULE_TERMS.get(invalidCase.variable) ?? [];
        const lower = message.toLowerCase();
        const stated = terms.filter((term) => lower.includes(term));
        assert.ok(
          stated.length > 0,
          `the ${invalidCase.variable} failure states none of the rule's terms (${terms.join(', ')}) and so does not say what was broken; AAP 0.9.2 requires the failure to name the variable and the rule it broke. It said: "${message}"`,
        );
      });

      /*
       * The "no stack trace" half is scoped to the validator's own message line, deliberately. Astro
       * appends its own config-load diagnostic, frames included, after that line, and that output is
       * the framework's rather than the product's: it reaches no page, which the last test in this
       * group proves by finding nothing emitted at all. AAP 0.9.2's requirement is that the failure
       * names the variable and the rule and never the value, and that no stack trace reaches a page.
       */
      it('never echoes the offending value and states no stack trace of its own', () => {
        const result = resultFor(invalidCase);
        const output = combinedOutput(result);
        const collapsed = output.replace(/\s+/g, ' ');
        assert.ok(
          !output.includes(invalidCase.value) && !collapsed.includes(invalidCase.value),
          `the ${invalidCase.name} failure echoes the offending ${invalidCase.variable} value; AAP 0.9.2 requires the message to name the variable and the rule and never the value, which may hold anything the operator typed.\n${buildOutput(result)}`,
        );
        const message = messageLineAbout(output, invalidCase.variable);
        assert.ok(
          message !== null,
          `the ${invalidCase.name} build named ${invalidCase.variable} nowhere, so there is no validator message to inspect.\n${buildOutput(result)}`,
        );
        assert.ok(
          !/\bat\s+[\w$.]+\s*\(/.test(message) && !/\bError:/.test(message),
          `the ${invalidCase.variable} failure's own message carries a stack frame ("${message}"); AAP 0.9.2 keeps a stack trace or status detail from ever reaching a reader of the site. A diagnostic the framework appends after that line is the framework's and reaches no page, which the next test proves by finding no page at all`,
        );
      });

      it('emits no page', () => {
        const result = resultFor(invalidCase);
        const pages = emittedPages(result.outDir);
        assert.deepEqual(
          pages,
          [],
          `the ${invalidCase.name} build left ${pages.join(', ')} in ${path.relative(REPOSITORY_ROOT, result.outDir)} despite failing; AAP 0.9.2 stops the build before any page is rendered, so no half-built site may be left behind.\n${buildOutput(result)}`,
        );
      });
    });
  }
});

describe('AAP 0.9.2: PUBLIC_SITE_LIVE has a non-live fallback and never fails a build', () => {
  /*
   * The one variable of the four with no invalid state. The harness exposes no environment override on
   * `build()`, and AAP 0.13.2 defines exactly seven configurations, so this rule is proved against the
   * validator that owns it — `src/lib/env.ts` — rather than by inventing an eighth configuration for
   * it: a value that is set but not exactly `true` must not throw, must read as not live, and must
   * warn, naming the variable.
   */
  it('accepts a value that is not exactly true as not live, and warns instead of failing', async () => {
    assert.ok(
      !INVALID_CASES.some((invalidCase) => invalidCase.variable === 'PUBLIC_SITE_LIVE'),
      'PUBLIC_SITE_LIVE has no invalid state: AAP 0.9.2 accepts any value for it, so an invalid case would assert a build failure the plan does not define',
    );

    const saved = new Map(CONFIGURATION_VARIABLES.map((name) => [name, process.env[name]]));
    const warnings: string[] = [];
    const originalWarn = console.warn;
    try {
      for (const name of CONFIGURATION_VARIABLES) {
        process.env[name] = '';
      }
      process.env.PUBLIC_SITE_LIVE = 'TRUE';
      console.warn = ((...data: unknown[]) => {
        warnings.push(data.map((entry) => String(entry)).join(' '));
      }) as typeof console.warn;
      const env = await import('../../src/lib/env.ts');
      assert.doesNotThrow(
        () => env.assertValidEnv(),
        'a PUBLIC_SITE_LIVE value of "TRUE" stopped the build; AAP 0.9.2 accepts any value for it, with anything other than exactly "true" only meaning the site is not live',
      );
      assert.equal(
        env.isLive(),
        false,
        'PUBLIC_SITE_LIVE="TRUE" read as live; AAP 0.9.2 makes only the exact value "true" live, so a misconfigured deployment must not become indexable',
      );
    } finally {
      console.warn = originalWarn;
      for (const [name, value] of saved) {
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
    }
    assert.ok(
      warnings.some((warning) => warning.includes('PUBLIC_SITE_LIVE')),
      `a PUBLIC_SITE_LIVE value of "TRUE" produced no warning naming the variable (warnings: ${JSON.stringify(warnings)}); AAP 0.9.2 requires the build to print one, so an operator can see why the site is not live`,
    );
  });
});

/* -------------------------------------------------------------------------------------------------
 * Phase 6 — the flags configuration: both conditional blocks render
 * ---------------------------------------------------------------------------------------------- */

describe('AAP 0.13.2: the flags configuration renders both conditional blocks on /about', () => {
  /*
   * The `flags` configuration builds a temporary copy of the project whose `src/content/about.ts` has
   * `sourceConfirmed: true` and a non-empty `founderBio`, so the two blocks AAP 0.7.4 makes conditional
   * can be observed ON (AAP 0.13.2). The absence of both blocks in the `default` build is
   * `tests/static/output.test.ts`'s, asserted on its own default build; this file asserts the present
   * half only, because it must not consume another suite's output.
   *
   * Where the expected strings come from. The Why now heading, figures and source line come from the
   * content layer that the flags copy carries, and are cross-checked against A5 of the content
   * specification whenever the document is present — never re-typed here. The biography comes from the
   * staged copy or, once the harness has deleted it, from the harness's own `FLAGS_FOUNDER_BIO`
   * literal. With the specification absent from this run every Why now string is the launch marker, so
   * the source line is the anchor that makes the assertion meaningful: it is the one string in the
   * block A5 fixes independently — the single permitted mention of another organisation (AAP 0.7.6) —
   * and it cannot appear on the page unless `sourceConfirmed` was true when the block rendered.
   */
  let flagsBuild: BuildResult | null = null;
  let aboutHashBefore = '';
  let aboutHashAfter = '';
  let trackedBefore = '';
  let trackedAfter = '';

  before(async () => {
    aboutHashBefore = fileHash(ABOUT_CONTENT_FILE);
    trackedBefore = gitStatusSnapshot();
    flagsBuild = await build('flags', { outDir: OUTPUT_DIRECTORIES.flags });
    aboutHashAfter = fileHash(ABOUT_CONTENT_FILE);
    trackedAfter = gitStatusSnapshot();
  }, { timeout: BUILD_TIMEOUT_MS });

  /** The flags build's result, or a failure naming the hook that never ran. */
  function flagsResult(): BuildResult {
    assert.ok(flagsBuild !== null, 'the flags build did not run, so nothing about the conditional blocks can be asserted');
    return flagsBuild;
  }

  /** The flags build's `/about` page as visible text, or a failure quoting what the build said. */
  function flagsAboutText(): string {
    const result = flagsResult();
    const file = builtPageFile(result.outDir, '/about');
    if (!existsSync(file)) {
      assert.fail(
        `the flags build emitted no ${path.relative(REPOSITORY_ROOT, file)} (${describeBuild(result)}), so neither conditional block can be read.\n${buildOutput(result)}`,
      );
    }
    return visibleText(readFileSync(file, 'utf8'));
  }

  it('builds successfully from a temporary copy of the project', () => {
    const result = flagsResult();
    assert.equal(
      result.outDir,
      OUTPUT_DIRECTORIES.flags,
      `the flags build wrote to ${result.outDir} instead of this suite's own ${OUTPUT_DIRECTORIES.flags}`,
    );
    assert.equal(
      result.ok,
      true,
      `the flags build failed (${describeBuild(result)}); it rewrites only the two conditional fields in a temporary copy, so a failure means the copy or the build, not the site.\n${buildOutput(result)}`,
    );
  });

  it('renders the Why now heading, its figures and its source line as one ordered block', () => {
    const page = flagsAboutText();
    const whyNow = about.whyNow;

    const heading = normaliseText(whyNow.heading);
    const source = normaliseText(whyNow.source);
    const figures = whyNow.figures.map((figure) => ({
      value: normaliseText(figure.value),
      label: normaliseText(figure.label),
    }));

    assert.notEqual(heading, '', 'the content layer carries no Why now heading, so the block cannot render at all (WhyNow suppresses itself without one)');
    assert.notEqual(source, '', 'the content layer carries no Why now source line, so the figures could never render with their attribution (AAP 0.7.4)');
    assert.ok(
      figures.length > 0,
      'the content layer carries no Why now figures, so the block cannot render: WhyNow suppresses itself rather than emitting a heading and an attribution around nothing (AAP 0.7.4, rule B-4)',
    );

    const specification = specificationOrNull();
    if (specification !== null) {
      const a5 = normaliseText(specification.byId.A5.copy.join(' '));
      for (const expected of [heading, source, ...figures.flatMap((figure) => [figure.value, figure.label])]) {
        if (expected === '') {
          continue;
        }
        assert.ok(
          a5.includes(expected),
          `A5 of the content specification does not carry "${expected}", which the content layer renders into the Why now block; the copy has to come from the document rather than from the content module alone (AAP 0.7.1, 0.7.3)`,
        );
      }
    }

    const sourceAt = page.indexOf(source);
    assert.ok(
      sourceAt >= 0,
      `the flags build's /about page does not carry the Why now source line "${whyNow.source}", so the block did not render with sourceConfirmed switched on (AAP 0.7.4, 0.13.2)`,
    );
    const headingAt = page.indexOf(heading);
    assert.ok(
      headingAt >= 0 && headingAt < sourceAt,
      `the Why now heading does not precede its source line on the /about page (heading at ${headingAt}, source at ${sourceAt}); the figures, their heading and their attribution render as one unit or not at all (AAP 0.7.4)`,
    );
    for (const [index, figure] of figures.entries()) {
      for (const part of [figure.value, figure.label]) {
        if (part === '') {
          continue;
        }
        const at = page.lastIndexOf(part, sourceAt);
        assert.ok(
          at >= 0,
          `figure ${index + 1}'s "${part}" does not appear before the Why now source line on the /about page, so the figures and their attribution did not render together (AAP 0.7.4)`,
        );
      }
    }
  });

  it('renders the founder biography the flags copy supplies', () => {
    const page = flagsAboutText();
    const { bio, origin, staged } = flagsBiography();
    assert.notEqual(bio.trim(), '', `the biography read from ${origin} is empty, so the founder block could not render and this assertion would prove nothing`);
    assert.ok(
      page.includes(normaliseText(bio)),
      `the /about page does not carry the biography the flags copy supplies ("${bio}", read from ${origin}); the founder block renders only when about.founderBio is non-empty (AAP 0.7.4)`,
    );
    if (staged !== null) {
      assert.equal(
        normaliseText(staged.founderBio),
        normaliseText(bio),
        `the surviving staged copy at ${path.relative(REPOSITORY_ROOT, staged.aboutFile)} carries a different biography from the one asserted`,
      );
      assert.equal(
        staged.sourceConfirmed,
        'true',
        `the surviving staged copy at ${path.relative(REPOSITORY_ROOT, staged.aboutFile)} still writes sourceConfirmed: ${staged.sourceConfirmed}, so the Why now switch was never turned on`,
      );
    }
  });

  it('differs from the repository’s own conditional fields, so both blocks were switched on', () => {
    assert.equal(
      about.sourceConfirmed,
      false,
      'the repository’s own about.sourceConfirmed is not false, so the flags build would prove nothing about the switch: the default has to be off until the owner confirms a source (AAP 0.7.4, 0.16.2)',
    );
    assert.equal(
      about.founderBio.trim(),
      '',
      'the repository’s own about.founderBio is not empty, so the founder block would render by default and the flags build would prove nothing about its switch (AAP 0.7.4)',
    );
    const { bio, origin } = flagsBiography();
    assert.notEqual(
      normaliseText(bio),
      normaliseText(about.founderBio),
      `the biography asserted (${origin}) is the repository's own empty founderBio, so the flags copy was not switched on`,
    );
    const leaking = filesUnder(CONTENT_DIRECTORY)
      .filter((file) => readFileSync(file, 'utf8').includes(bio))
      .map((file) => path.relative(REPOSITORY_ROOT, file).split(path.sep).join('/'));
    assert.deepEqual(
      leaking,
      [],
      `the harness's sample biography appears in ${leaking.join(', ')}; it is test text for a throwaway build and no site copy may carry it (rules B-4, W-1)`,
    );
  });

  it('leaves the repository’s about content and tracked working tree untouched', () => {
    assert.equal(
      aboutHashAfter,
      aboutHashBefore,
      `the flags build changed ${path.relative(REPOSITORY_ROOT, ABOUT_CONTENT_FILE)} in the repository (SHA-256 ${aboutHashBefore} before, ${aboutHashAfter} after); that configuration may only edit its own temporary copy (AAP 0.12.1)`,
    );
    assert.equal(
      trackedAfter,
      trackedBefore,
      `the flags build modified the tracked working tree: before ${JSON.stringify(trackedBefore)} and after ${JSON.stringify(trackedAfter)}; the repository is never the thing that changes (AAP 0.12.1)`,
    );
  });
});
