import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { assertValidEnv, getFormEndpoint } from './src/lib/env.ts';

/*
 * The build's single configuration point (AAP 0.10.3). It does seven things and nothing else:
 * static files only with nothing executing per request, the two CSP directives Astro does not
 * derive, Vite's asset inlining switched off, the Tailwind plugin, the Markdown highlighter
 * switched off, the configuration check that runs at module load, and the build telemetry
 * opt-out.
 */

/*
 * Astro records an anonymous build-time event for every command that evaluates this config. The
 * build reaches the package registry and the two font releases and nothing else (AAP 0.4.5), so
 * the event is switched off here, in the repository, rather than left to each machine's own
 * global telemetry preference.
 */
process.env.ASTRO_TELEMETRY_DISABLED = '1';

/*
 * Validation runs at module load, so every command that reads this config — dev, build, check,
 * preview — stops on a value that is set but invalid, naming the variable and the rule it broke.
 * Empty is the valid default for all four values, so a clone with no environment builds normally.
 */
assertValidEnv();

/*
 * The endpoint's origin, not its path: a policy source names a scheme and host, so whatever path
 * and query the configured address carries are dropped and only the origin reaches `connect-src`.
 * `null` means the variable is empty, which leaves the form in its mailto or fallback state.
 */
const formEndpoint = getFormEndpoint();
const connectSrc =
  formEndpoint === null
    ? "connect-src 'self'"
    : `connect-src 'self' ${new URL(formEndpoint).origin}`;

export default defineConfig({
  /* Static files only: nothing runs per request, and there is no session or data store (W-2). */
  output: 'static',

  security: {
    csp: {
      /*
       * Only the directives Astro does not emit itself. It derives `script-src` and `style-src`
       * from the hashes of the inline scripts and styles each page actually uses, so neither is
       * set here, and the policy admits no inline-source relaxation, no eval allowance, no
       * wildcard and no `data:` source (rules B-1, WT-19). The policy is emitted for static output
       * as one <meta> per page and is not applied in `astro dev`; it is verified with build plus
       * preview.
       */
      directives: ["default-src 'self'", connectSrc],
    },
  },

  markdown: {
    /*
     * Shiki highlights with inline `style` attributes, and a hash-only policy covers inline
     * <style> elements but not attributes; the site has no Markdown, so the highlighter is
     * switched off rather than tolerated as a style source.
     */
    syntaxHighlight: false,
  },

  vite: {
    plugins: [tailwindcss()],
    build: {
      /*
       * Vite base64-inlines assets under 4 KiB as `data:` URIs, which the policy names no source
       * for; keeping the limit at zero is what makes every emitted asset a file at its own path.
       */
      assetsInlineLimit: 0,
    },
  },
});
