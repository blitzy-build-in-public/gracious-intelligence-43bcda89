# Gracious Intelligence website

## What this is

The public marketing site for Gracious Intelligence. It presents the company, its proposed product Site Intelligence — sovereign operational intelligence for manufacturing and supply chains — and that product's ten sovereignty controls, and it collects pilot enquiries. Eight pages plus a page-not-found route: `/`, `/platform`, `/platform/site-intelligence`, `/sovereignty`, `/about`, `/contact`, `/privacy` and `/legal`, with `404.html` alongside them. The build emits static files and nothing else: no server, no serverless function, no database, no session and no sign-in.

Every user-visible string comes from the content specification, version 2, so a copy edit is an edit under `src/content` and no component changes. A purchased Figma template for a different business supplies layout, spacing, type, colour and breakpoint behaviour, and supplies no content of any kind: none of its text, photographs, logos or place names reaches the output, and every template section the specification does not name has been removed rather than filled — the client logo strip, the blog, the testimonials, the map block and the About page's template form. The Site Intelligence platform application is not part of this repository, and no page here imitates it: each product-screen slot shows a screenshot the owner supplies or a panel saying the screen is to follow.

## Requirements

| Requirement | Version this repository pins                               | Why                                                                                                                          |
| ----------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Node.js     | `26.13.1` in `.nvmrc`; `engines: ">=26"` in `package.json` | Astro 7 requires Node 22.23.4 or later, and `lighthouse` carries the tree's strictest floor at 22.19; Node 26 satisfies both |
| npm         | 11.20.0, the version shipped with Node 26                  | runs every script and resolves the committed lockfile                                                                        |
| Chromium    | installed by `npx playwright install chromium`             | the browser suites and the Lighthouse gate drive it                                                                          |

Nothing else is needed: no database, no container, no service and no environment variable set before installing. An empty configuration is the normal state, and a fresh clone builds without one.

## Quick start

```bash
npm ci
npx playwright install chromium
npm run dev
```

`npm ci` installs exactly what `package-lock.json` pins. The browser download is needed only by `npm run test:e2e`, `npm run test:lighthouse` and `npm run screenshots`. `npm run dev` serves the site with hot reload for local editing.

Run `npm run assets` once if `public/favicon.svg`, `public/og-image.png` and `public/apple-touch-icon.png` are absent: the dev server hands out `public/` as it stands and does not run the asset step, so those three links would 404 until a command generates them. The development server does not apply the Content Security Policy; check the policy on a built site with `npm run build` followed by `npm run preview`.

## Scripts

| Script            | Runs                                                                                                                           | What it does, and when it fails                                                                                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dev`             | `astro dev`                                                                                                                    | Serves the site with hot reload. Fails when the project cannot be compiled or a configured value is set but invalid.                                                                                                                                     |
| `prebuild`        | `npm run assets`                                                                                                               | npm fires this automatically before `build`; it is not run on its own.                                                                                                                                                                                   |
| `build`           | the launch guard when live, then `astro build`                                                                                 | Writes the static site to `dist/`, with `npm run assets` already run by `prebuild`. Fails when a configured value is set but invalid, when the launch guard fails with `PUBLIC_SITE_LIVE` exactly `true`, or when Astro reports an error.                |
| `preview`         | `astro preview`                                                                                                                | Serves an existing `dist/` on loopback. One preview server per checkout; stop it with `astro preview stop`.                                                                                                                                              |
| `check`           | `astro check`                                                                                                                  | Type-checks the `.astro` and `.ts` sources. Must report 0 errors and 0 warnings.                                                                                                                                                                         |
| `assets`          | `node scripts/gen-assets.ts`                                                                                                   | Writes `public/favicon.svg`, `public/og-image.png` at 1200×630 and `public/apple-touch-icon.png` at 180×180. Fails when the two-probe font check cannot tell the bundled Urbanist from a family that does not exist, or when a render is the wrong size. |
| `launch-check`    | `node scripts/launch-check.ts`                                                                                                 | The launch guard, described below. Fails while its marker survives in `src/content` or in the built pages, and when the site is live with no site address.                                                                                               |
| `screenshots`     | `node scripts/screenshots.ts`                                                                                                  | The design-review capture aid, described below. Fails, having written nothing, when the build or any of the sixteen captures fails.                                                                                                                      |
| `test`            | `assets`, then `test:static`, `test:copy`, `test:content`, `test:e2e`, `test:lighthouse`                                       | The whole gate. Fails when any of the five fails.                                                                                                                                                                                                        |
| `test:static`     | `node --test tests/static/builds.test.ts tests/static/output.test.ts tests/static/residue.test.ts tests/static/source.test.ts` | Builds the `default` and `live` outputs and the three configurations read as files, then asserts over the built HTML, `sitemap.xml`, `robots.txt`, the tracked tree, the two fixtures, and the builds that must fail.                                    |
| `test:copy`       | `node --test tests/static/copy.test.ts`                                                                                        | Asserts that no component or layout holds a user-visible literal.                                                                                                                                                                                        |
| `test:content`    | `node --test tests/static/content.test.ts`                                                                                     | Edits one string in a temporary copy of `src/content`, rebuilds, and asserts the built page changed and no component file did.                                                                                                                           |
| `test:e2e`        | `playwright test`                                                                                                              | The six browser suites across the four browser configurations: layout and keyboard, axe, the form, the Content Security Policy, the link crawl and the product screens.                                                                                  |
| `test:lighthouse` | `node tests/lighthouse/run.ts`                                                                                                 | The four-category Lighthouse gate on `/`, `/sovereignty` and `/contact` against the live build.                                                                                                                                                          |

`build` runs `npm run assets` first, through the `prebuild` hook npm fires before it, and it runs the launch guard before `astro build` whenever `PUBLIC_SITE_LIVE` is exactly `true`. `npm run assets` writes the three image files into `public/`; all three are git-ignored and regenerated by every build, so the source tree keeps no raster while every build still publishes them.

`npm test` runs `npm run assets` once, then the five suites in the order above. Every build a check reads is made by that check: the static suite builds the outputs and the file-only configurations, and each browser pass builds its own configuration immediately before serving it, so no check loads a build an earlier run left behind.

There is no `test:unit`. The only unit-level logic is the form's validation: the keyboard and form suites exercise it through the browser, and the `invalid` configuration exercises the build-time validation through the build.

## Configuration

Four optional public values, all read at build time, all empty by default. None of them is a secret, and the project holds no secret of any kind.

| Value                  | Allowed values                                                                                                                                                       | Default | What depends on it                                                                   |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------ |
| `PUBLIC_FORM_ENDPOINT` | empty, or an absolute URL whose scheme is `https:`; `http:` is accepted only for the hostnames `localhost` and `127.0.0.1`. Example: `https://forms.example/enquiry` | empty   | Selects the contact form's state, and adds that origin to the policy's `connect-src` |
| `PUBLIC_CONTACT_EMAIL` | empty, or exactly one address of the form `local@domain.tld`, with no space, comma or question mark. Example: `hello@site.example`                                   | empty   | The footer, the contact row, and the mailto link the form falls back to              |
| `PUBLIC_SITE_URL`      | empty, or an absolute origin: `https:`, or `http:` for a local host, with no path beyond `/`, no query and no fragment. Example: `https://site.example`              | empty   | `sitemap.xml`, `og:url`, `og:image` and the sitemap line in `robots.txt`             |
| `PUBLIC_SITE_LIVE`     | exactly `true` means live; every other value means not live                                                                                                          | empty   | The robots meta on every page, and the body of `robots.txt`                          |

A value comes from the process environment or, where the environment has none, from a `.env` file at the repository root. `src/lib/env.ts` loads that file itself with Node's own loader, and a value already in the environment outranks it. `.env` is git-ignored and `.env.example` is the only `.env*` file tracked, so a configured value never enters the repository.

Empty is valid for all four. A value that is set but invalid stops the build, naming the variable and the rule it broke and never echoing the value: a silently formless or silently indexable site is worse than a failed build. `PUBLIC_SITE_LIVE` is the exception — it never fails a build. Any value other than exactly `true` means not live, and a value that is present but not exactly `true` prints a warning naming the value it received.

**All four are read at build time and baked into the emitted HTML, `sitemap.xml` and `robots.txt`, so changing any of them requires a rebuild.** A host that sets a new value and re-serves the previous `dist/` changes nothing.

`LAUNCH_CHECK` is not part of this surface. It is read only by `scripts/launch-check.ts` and the build script that calls it, its only meaningful value is `skip`, it is deliberately absent from `.env.example`, and nothing under `src/` reads it.

## What the configuration selects

The form's three states are chosen by the endpoint and the contact address together.

| `PUBLIC_FORM_ENDPOINT` | `PUBLIC_CONTACT_EMAIL` | What `/contact` renders                                                                                       | What the footer and the contact row render |
| ---------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| set                    | either                 | The form: six fields, the consent checkbox, a hidden honeypot and the submit button; it posts to the endpoint | The address when set, nothing when not     |
| empty                  | set                    | No form; a mailto link to the address                                                                         | The address                                |
| empty                  | empty                  | No form; a line saying contact details are to follow                                                          | Nothing                                    |

Where the endpoint is set, submitting posts a multipart form body — every named field plus a hidden honeypot — with `Accept: application/json`. Any 2xx answer is success and the response body is never read, so a JSON reply and an empty one are treated alike. A non-2xx answer, a network error and a request still unanswered after 15 seconds are one indistinguishable failure: the error text appears, the entered values are kept and the button is re-enabled. The endpoint must therefore accept a cross-origin multipart post and allow the site's origin by CORS.

Indexability depends on the live flag alone.

| `PUBLIC_SITE_LIVE`                            | Effect                                                                                                                                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| exactly `true`                                | No page carries `noindex` except the 404, which always carries `noindex, nofollow`; `robots.txt` allows everything and names the sitemap; `npm run build` runs the launch guard first |
| anything else, including empty, `TRUE` or `1` | Every page, the 404 included, carries `noindex, nofollow`; `robots.txt` disallows everything; a non-empty value other than `true` prints a warning                                    |

The site address fills the three places that need an absolute origin.

| `PUBLIC_SITE_URL` | Effect                                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| set               | `sitemap.xml` lists the eight pages; `og:url` and `og:image` are emitted; `robots.txt` names the sitemap                                                                                               |
| empty             | `sitemap.xml` is a valid `<urlset>` with no entries; `og:url` and `og:image` are omitted rather than emitted with a guessed host; the remaining Open Graph fields and `twitter:card` are still emitted |

The default build has all four values empty, and it is the state most checks run against: no endpoint, no address, no site address, not live. It renders the complete site, non-indexable, with the form in its third state.

## The launch guard

Some of the copy is the owner's to supply, so the honest default is a complete but non-indexable site, plus a mechanical block on the one step that would publish a placeholder.

`npm run launch-check` scans `src/content` always, and a built directory — `dist` when it exists and no argument is given, or the directory named as its argument. It looks for one marker, `TO BE PROVIDED`, case-sensitively, and for nothing else. The designed fallbacks are not markers and never fail it: the panel that stands in for an unsupplied product screen, and the line that stands in when no contact address is configured.

It fails in two situations. The marker survives in a content file or in a built page. Or the site is marked live while `PUBLIC_SITE_URL` is empty, because a live site's `sitemap.xml`, `og:url`, `og:image` and robots sitemap line are all built from that address. Each offending file is reported on its own line with the line numbers the marker sits on, prefixed `launch-check:`, so one run lists the whole job.

Three invocation points compose. `npm run launch-check` runs it on its own, before or after a build. `npm run build` runs it before `astro build` whenever `PUBLIC_SITE_LIVE` is exactly `true`, so a live build cannot publish a placeholder. And `npm test` covers both paths: the `guard` configuration asserts that a live build fails on the marker, and the `live` configuration builds with the bypass so the rest of the gate can run.

`LAUNCH_CHECK=skip` is the bypass, and it exists for the test harness alone. It suppresses the two marker scans and prints a line saying that it did, and it never suppresses the live check. Nothing under `src/` reads it, so no configuration of the running site can open the gate.

With the content as it stands, `npm run launch-check` fails: the content layer carries the marker wherever the specification supplies no string for a field, including the two page bodies the specification leaves to the owner. That is the guard working as designed, and a live build stays blocked until those strings arrive.

## Build and deploy

```bash
npm ci
npm test
npm run build
```

Publish the contents of `dist/` to any static host. `dist/` holds the eight page directories, `404.html`, `sitemap.xml`, `robots.txt`, `favicon.svg`, `og-image.png`, `apple-touch-icon.png`, `fonts/`, the `screens/` directory the owner's product screenshots publish into, and the hashed stylesheet and script files under `/_astro/`. Publish that directory, never the repository root: `dist/` is the artefact, and the source tree, the tests, the scripts, the licence texts and every `.env` file stay out of it.

Hosting is static only. There is no adapter, no serverless function, no database and no session, and the only outbound request the site makes is the browser's post of the enquiry form to `PUBLIC_FORM_ENDPOINT`.

Set the four values in the build environment, or in `.env`, before `npm run build`; they are baked in at build time. A live deploy needs `PUBLIC_SITE_LIVE=true` and `PUBLIC_SITE_URL`, and with both set the build refuses to complete while the launch guard's marker survives.

The repository carries no CI workflow, deploy key or environment matrix, because the request names no host, runner, registry or container platform; a workflow file would have to invent the infrastructure it targets. The owner's existing pipeline supplies the trigger and runs `npm ci`, `npm test` and `npm run build` in that order.

## Where things live

| Path                   | What lives there                                                                                                                                                                                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/content`          | Every user-visible string, typed: one module per page — `home.ts`, `platform.ts`, `site-intelligence.ts`, `sovereignty.ts`, `about.ts`, `contact.ts`, `privacy.ts`, `legal.ts`, `not-found.ts` — plus `global.ts` for the shell, the navigation and the status labels, and `ui.ts` for the skip link and the menu labels.                                |
| `src/content/shared`   | The four blocks used on more than one page: `stages.ts`, `actions.ts`, `pilot.ts`, `faq.ts`. Each page module imports them, so one edit reaches every surface and no two surfaces can drift.                                                                                                                                                             |
| `src/styles/theme.css` | The only definition of every design token — colour, spacing, radii, the type scale, the two focus rings, the reduced-motion block — and the two `@font-face` declarations.                                                                                                                                                                               |
| `src/lib/env.ts`       | The only reader of `process.env`. Validates the four configured values and throws on one that is set but invalid.                                                                                                                                                                                                                                        |
| `src/lib/form.ts`      | The form's validation and submission logic, including the 15-second abort.                                                                                                                                                                                                                                                                               |
| `src/lib/screens.ts`   | The build-time presence check for the three product screens.                                                                                                                                                                                                                                                                                             |
| `src/layouts`          | `BaseLayout.astro`, the one page shell: the document head, the skip link, the header, the main region and the footer, for all nine routes.                                                                                                                                                                                                               |
| `src/pages`            | The routes — `index.astro`, `platform.astro`, `platform/site-intelligence.astro`, `sovereignty.astro`, `about.astro`, `contact.astro`, `privacy.astro`, `legal.astro` and `404.astro` — plus the two generated text routes, `sitemap.xml.ts` and `robots.txt.ts`. Page frontmatter is the only place a content module is imported and mapped onto props. |
| `src/components`       | Copy-free presentation. Every component takes its text as props; a component holds no string of its own.                                                                                                                                                                                                                                                 |
| `src/illustrations`    | The nine decorative panels under `panels/` — one motif, linked nodes inside a drawn boundary — plus `favicon.svg` and `og-template.svg`. Authored SVG, not derived from the design reference; no raster enters this directory.                                                                                                                           |
| `src/fonts`            | TTF copies of the two families, used only where the build host's rasteriser cannot draw the woff2 files the pages load — as on this one. Read by `scripts/gen-assets.ts` alone and never published, so a checkout whose rasteriser can draw woff2 does without it.                                                                                       |
| `scripts`              | Build tooling: `gen-assets.ts`, `launch-check.ts`, `screenshots.ts` and the rasteriser's `fonts.conf`. No page or component code.                                                                                                                                                                                                                        |
| `tests`                | The six static checks under `static/`, the six browser suites under `e2e/`, the Lighthouse gate under `lighthouse/`, the build-and-serve harness and the specification reader under `helpers/`, and the fixtures under `fixtures/` — including the committed copy of the content specification the fidelity check reads.                                 |
| `public`               | Copied verbatim into the build: `fonts/` with the two woff2 files, `screens/` as the owner's drop point for the three product screenshots, and the three generated images.                                                                                                                                                                               |
| `licenses/fonts`       | The two OFL texts, outside `public/` and `src/`, so neither is published.                                                                                                                                                                                                                                                                                |

Two edit surfaces cover almost all maintenance. A copy edit touches `src/content` and needs a rebuild. A colour, spacing, radius or type edit touches `src/styles/theme.css` and needs a rebuild. A layout change touches a page or a component, and a behaviour change touches `src/lib` or the island that uses it.

## Fonts and licences

The site sets its text in two families, both served from this repository and neither fetched from a third party at run time.

| Family     | File                                      | Format                                            | Licence                   |
| ---------- | ----------------------------------------- | ------------------------------------------------- | ------------------------- |
| Urbanist   | `public/fonts/urbanist-latin-var.woff2`   | variable woff2, weight axis 100–900, Latin subset | SIL Open Font License 1.1 |
| Geist Mono | `public/fonts/geist-mono-latin-var.woff2` | variable woff2, weight axis 100–900, Latin subset | SIL Open Font License 1.1 |

Each is declared once in `src/styles/theme.css` with `font-display: swap` and a Latin `unicode-range`, so one file serves every weight and a font that fails to load degrades in weight and rhythm rather than in layout. Both licences permit self-hosting, and serving the files counts as distribution, so the copyright notice and the licence text travel with them in `licenses/fonts/`. That directory sits outside `public/` and `src/` because `public/` is copied verbatim into the published output and a licence text is not site content.

The icons are Phosphor glyphs from `@phosphor-icons/core`, installed from npm under that package's own MIT licence and inlined as SVG at build time; no icon is exported from the design reference and no icon font is loaded. Nothing else is fetched at run time: there is no content delivery network, no hosted font, no analytics, no tracking, no map, no video and no CAPTCHA, and the Content Security Policy makes a request to a foreign origin fail loudly rather than succeed quietly.

## Tests and configurations

Seven build configurations exist, each built into its own directory under the git-ignored `.build/` root, so no check consumes another check's build.

| Configuration | Environment                                                                                                                                                                                                                     | What runs against it                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `default`     | all four values empty, `LAUNCH_CHECK` unset                                                                                                                                                                                     | The assertions over the default output, the layout and keyboard suite, axe, the CSP, the crawl, and the degraded product screens |
| `live`        | `LAUNCH_CHECK=skip`, `PUBLIC_SITE_LIVE=true`, `PUBLIC_SITE_URL=https://site.example`, `PUBLIC_FORM_ENDPOINT=https://forms.example/enquiry`, `PUBLIC_CONTACT_EMAIL=hello@site.example`, all of them example values to substitute | The indexability and sitemap assertions, the form against a stubbed endpoint, axe, the CSP and Lighthouse                        |
| `mailto`      | the endpoint empty, `PUBLIC_CONTACT_EMAIL` set to an example address                                                                                                                                                            | The form's mailto state                                                                                                          |
| `screens`     | the `default` environment, plus one generated probe PNG at `public/screens/investigate.png` for the length of its build                                                                                                         | One frame with its image and two still degraded                                                                                  |
| `flags`       | the `default` environment, built from a temporary copy whose conditional blocks are switched on                                                                                                                                 | The Why now block and the founder block; files only                                                                              |
| `guard`       | the live flag and the site address set, `LAUNCH_CHECK` unset                                                                                                                                                                    | The build must fail on the marker; files only                                                                                    |
| `invalid`     | the `default` environment with one bad value per build, one build per variable that has an invalid state                                                                                                                        | Each build must fail and name the variable and the rule; files only                                                              |

Four configurations reach a browser — `default`, `live`, `mailto` and `screens` — and each is a Playwright project served from its own fresh build on its own loopback port, so a pass never loads a stale artefact. The other three are read as files by the static checks.

The gate is split the same way. `npm run test:static`, `npm run test:copy` and `npm run test:content` need no browser. `npm run test:e2e` and `npm run test:lighthouse` do, and each builds the configuration it tests immediately before serving it.

## Accessibility and performance

The target is WCAG 2.2 level AA, met rather than aspired to.

- axe-core runs on every page, the 404 included, at 390 px and at 1440 px, and the suite fails on any serious or critical violation. Run it with `npm run test:e2e`.
- Every interactive element is reachable and operable by keyboard, with a visible focus indicator. The menu, the accordions and the form are each exercised by keyboard in the browser suite. The accordions are native `details` and `summary` elements, so their answers stay readable without script, and the menu's closed state is a plain list of the navigation links.
- Focus is drawn as two rings, defined once in `src/styles/theme.css`: Chocolate on the Cream ground, and Cream on the two dark bands.
- Text contrast is at least 4.5 to 1 wherever text appears. The decoration colours carry no text and no control border on the Cream ground, and the palette admits no pairing that fails.
- `prefers-reduced-motion: reduce` stops every transition and animation.
- Every target is at least 24 by 24 CSS pixels, each page has one `h1` and semantic landmarks, and the layout reflows at 320 CSS px without horizontal scroll.
- Lighthouse, on mobile with throttling, must score at least 95 in Performance, Accessibility, Best Practices and SEO on `/`, `/sovereignty` and `/contact`, taking the median of three runs per page. Run it with `npm run test:lighthouse`.

The layout is designed at 390 px and 1440 px, works from 360 px to 1920 px, and the 390 px layout simply narrows at 320 px. No threshold is relaxed to make a run pass: a missed threshold is fixed in the product.

## Design review screenshots

```bash
npm run screenshots
```

The command builds the site in its `default` configuration, serves that build on loopback, and writes sixteen full-page PNGs into the git-ignored `screenshots/` folder: the eight pages at 390 px and at 1440 px, named by page and width, from `home-390.png` and `home-1440.png` to `legal-390.png` and `legal-1440.png`. The page-not-found route is not among them; its appearance is covered by the browser suite and by axe at both widths.

It is a review aid, not a gate: it is not part of `npm test`, so it cannot fail the suite. All sixteen files are written or none: a build failure, a page that cannot be loaded or a capture that cannot be written names the page and the width that failed, leaves `screenshots/` as it was and exits non-zero. Both `screenshots/` and `.build/` are git-ignored, so no review PNG can be committed.

Compare each pair against the design reference at the same two widths — 390 for the mobile frames and 1440 for the desktop frames — for section order, grid, spacing rhythm, type step and component shape. The reference frames are not readable at test time, so this comparison is a human step at review; the automated checks cover structure, tokens, copy and behaviour instead.

## How to add the product screens

Drop the three PNGs into `public/screens/`, keeping these names:

| File                             | Frame on `/platform/site-intelligence` |
| -------------------------------- | -------------------------------------- |
| `public/screens/investigate.png` | The first screen                       |
| `public/screens/compare.png`     | The second screen                      |
| `public/screens/audit.png`       | The third screen                       |

Each file is published at `/screens/<name>` because `public/` is copied verbatim into the build. Until a file is present, that frame renders a neutral panel labelled `Screen to follow`, keeps its caption, and offers no link, button or focus stop; a missing screenshot is never replaced by a stand-in image.

Presence is decided at build time by `src/lib/screens.ts`, so only a rebuild picks a new file up. Adding, replacing or removing one of these files changes nothing until `npm run build` runs again, and the frames may be filled one at a time — the mixed state of one supplied screenshot and two fallbacks is a supported state, and the `screens` configuration tests it.

## Copy to be provided

Eight inputs are the owner's to supply. Until each arrives, the site carries the specification's own placeholder or a designed fallback, never an invented substitute: no string is written to fill a gap, and no plausible-looking address, figure or policy stands in for one.

| Input                          | Surface and field                                                                               | What ships instead                                                                                                 |
| ------------------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| The `/privacy` body copy       | `/privacy`, the body beneath its heading                                                        | The launch guard's marker, so a live build cannot publish the page                                                 |
| The `/legal` body copy         | `/legal`, the same region                                                                       | The marker, blocked the same way                                                                                   |
| A founder biography            | `/about`, the founder block — `founderBio` in `src/content/about.ts`                            | Nothing. The block renders only when that string is non-empty, and it has no heading and leaves no gap without one |
| The `sourceConfirmed` decision | `/about`, the Why now block — `sourceConfirmed` in `src/content/about.ts`                       | Nothing. The block is off by default, and its three figures never appear without their source line                 |
| The form endpoint              | `/contact`, `PUBLIC_FORM_ENDPOINT`, and the policy's `connect-src` origin                       | The fallback form state, or the mailto state when a contact address is set. No request is ever made                |
| The contact email              | `PUBLIC_CONTACT_EMAIL`; the footer, the contact row, the mailto link and the form's error state | The address appears nowhere, and the fallback line shows instead                                                   |
| The site address               | `PUBLIC_SITE_URL`; `sitemap.xml`, `og:url`, `og:image` and the robots sitemap line              | A valid empty sitemap, both Open Graph URL fields omitted, and robots without a sitemap line                       |
| The three product screenshots  | `/platform/site-intelligence`, `public/screens/`                                                | Three neutral panels reading `Screen to follow`, each keeping its caption                                          |

While the first two are absent, `npm run launch-check` fails and a live build cannot complete. That is the gap made mechanical rather than a defect.

## Copy differences found

Precedence, highest first: the project rules govern how the work is done; the build prompt governs scope, stack, structure and behaviour; the content specification, version 2, is the only source of copy, page structure and template mapping; the research document is background and contributes no copy; the design reference contributes layout, spacing, type, colour, component shape and breakpoints and nothing else.

Five differences are recorded, each resolved against the source that outranks the other.

- **The build prompt's quotations are a convenience.** Where the prompt quotes copy, the specification wins and no prompt-quoted string is used as a source. No textual difference was found between the prompt's quoted labels and the specification's, so nothing is outstanding.
- **The research document's working name for the product is superseded.** The document uses an earlier name of its own; the specification states the product is Site Intelligence. The specification wins, and the earlier name is blocked as a whole word on the site and appears nowhere in this repository, having been added to the fixture that the banned-word check reads.
- **The specification attachment and the research document's reproduction of it are byte-identical in content.** The standalone attachment is therefore the source, and the reproduction adds nothing. One copy is committed at `tests/fixtures/website-content-specification.md`, which is what the fidelity check reads; if that copy is itself a placeholder recording that the document was absent from the environment that built this repository, the check fails with that message instead of reconstructing the document.
- **The research document's platform-application prompt, roadmap and review sections are not inputs.** Nothing in them becomes copy, a dependency, a type size or a test; the type scale comes from the design reference's own style page.
- **The research document's vendor shortlist never reaches a page.** Its eleven names are extracted into `tests/fixtures/vendor-names.json`, which must hold fifteen entries — those eleven and the four banned phrases — and the site's visible text is checked against them as whole words. A shortfall in that fixture is reported as a defect rather than closed by inventing a name, and no competitor is named anywhere on the site.

## Dependencies

Ten packages, each pinned to an exact version. No range, no `latest`, no placeholder.

| Package                | Version  | Scope       | Why it is here                                                                                     |
| ---------------------- | -------- | ----------- | -------------------------------------------------------------------------------------------------- |
| `astro`                | `7.4.13` | runtime     | Static generation, file-based routes, islands, and the built-in hash-based Content Security Policy |
| `@phosphor-icons/core` | `2.1.1`  | runtime     | The icon source, inlined as SVG at build time                                                      |
| `tailwindcss`          | `4.3.5`  | runtime     | Utility generation and the `@theme` token layer                                                    |
| `@tailwindcss/vite`    | `4.3.5`  | development | The Vite plugin that compiles the theme; released in lockstep with `tailwindcss`                   |
| `typescript`           | `6.0.3`  | development | Type checking of the content and component contracts                                               |
| `@astrojs/check`       | `0.9.12` | development | `astro check`                                                                                      |
| `sharp`                | `0.35.5` | development | Rasterises the social image and the apple-touch-icon at build time                                 |
| `@playwright/test`     | `1.65.1` | development | The browser suites                                                                                 |
| `@axe-core/playwright` | `4.14.0` | development | The accessibility gate, inside the same runner                                                     |
| `lighthouse`           | `13.6.0` | development | The four-category quality gate                                                                     |

TypeScript is pinned to 6.0.3 and not to 7 because `@astrojs/check` peers `^5.0.0 || ^6.0.0`; installing 7 leaves an unmet peer dependency and is the likeliest way to break the install.

Two packages are also pulled in transitively and must resolve to one copy: `tailwindcss`, declared here and pinned to the same version by its plugin, and `sharp`, declared here at a version Astro's own optional range accepts. `vite` is a transitive dependency of Astro and a peer of the plugin, so it must exist once too. `npm ls tailwindcss sharp vite` proves it.

`@astrojs/sitemap` is deliberately not installed, a departure from the dependency table of the build request that the request requires to be recorded. The integration requires the `site` option and writes no file without it, so it cannot produce the valid empty `sitemap.xml` this site must emit when the site address is unknown. `src/pages/sitemap.xml.ts` and `src/pages/robots.txt.ts` are the single mechanism instead, and they derive their content from the same configuration the pages use.

## Audit exceptions

`npm audit --omit=dev` must report no high or critical finding. Where such a finding has no fixed release, the run does not swap packages: the package, the advisory identifier and the absence of a fix are recorded in this section, and the check then passes provided every remaining finding appears here. A finding that has a fix is resolved by the pinned version, or it is a defect.

No exception is recorded.

## Known deviations

**The 4 px grid.** Two off-grid values of the design reference snap to the spacing scale: its 50 px page inset becomes 48 px and its 138 px hero gap becomes 136 px, so the content column is 1344 px rather than 1340, a 2 px difference invisible at both design widths. Its 0.6 px and 0.4 px strokes become 1 px, because a sub-pixel border does not render consistently across browsers. No other value is snapped.

**The rasteriser's font resolution.** `sharp` exposes no font-file option for SVG input, so `scripts/gen-assets.ts` pins `FONTCONFIG_FILE` to `scripts/fonts.conf`, whose only font directory is `src/fonts`, and loads `sharp` with a dynamic import after pinning it, because fontconfig reads that variable once per process. A two-probe check renders the bundled Urbanist and a family that does not exist, and fails the build when the two outputs are identical, so the social image cannot ship in a fallback face. The TTF copies this needs live in `src/fonts`, are read by that script alone, and are never published.

**The header's breakpoint.** The navigation collapses to the menu trigger at 900 px. The design reference declares no breakpoint values at all — only the 1440 px and 390 px artboards — so 900 px is this project's own choice: the width at which the five navigation items stop fitting beside the wordmark and the call to action without wrapping. It is one value in `src/styles/theme.css`.

**The mirrored palette.** The design reference sets a dark page with light ink. This site sets a Cream ground with Chocolate, Taupe and Coffee Bean ink, and mirrors the reference's single band that contrasts with its page into the Chocolate pilot band. Every pairing the reference draws meets the contrast requirement, so this is a decision about the ground rather than a contrast fix. The consequence is that the two decoration colours carry no text and no control border on Cream, while Khaki keeps its reference role as secondary ink on the Chocolate band.

**One type substitution.** The design reference sets one 10 px slot in a third family; that slot takes the mono caption pair instead, at 12 px on desktop and 10 px on mobile, and the third family is never bundled. Every other type value is the reference's own, and a slot whose copy does not fit steps down to the next smaller step of its own scale rather than taking an invented size.

## Not built

- **The Site Intelligence platform application.** It is not part of this repository, and no page imitates it.
- **Blog, careers, pricing, customer logos, testimonials, investor information and competitor comparison.** All are out of scope; two of them appear in the design reference and are deleted rather than filled.
- **A content management system, sign-in, accounts, an admin area, site search, RSS, internationalisation and a dark theme.** None is asked for, and a CMS or a sign-in would breach the static-only rule.
- **Analytics, tracking, a tag manager, a cookie banner, a chat widget and a newsletter signup.** Each would be a third-party request at run time, which the rules forbid, and none is asked for.
- **Any server, API route, serverless function, database or enquiry store.** The site is static, and an enquiry leaves through the owner's endpoint; nothing is kept here.
- **An embedded map, embedded video, third-party CAPTCHA, remote fonts or remote icons.** Each is a third-party request at run time, and the design reference's map block is removed with its raster.
- **Automated deployment pipelines, workflow files and container definitions.** The request names no host, runner or platform, so such a file would invent its own target; deploying `dist/` is documented above instead.
- **A unit-test script.** The only unit-level logic is the form's validation, which the browser suites and the invalid-configuration builds cover.
