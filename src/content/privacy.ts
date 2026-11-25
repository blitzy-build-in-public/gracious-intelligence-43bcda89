// src/content/privacy.ts — A7: the copy `/privacy` renders (AAP 0.7.2, 0.8.2, 0.12.1).
//
// One module per page, so a copy edit changes this file and no component: `src/pages/privacy.astro`
// imports `privacy` and maps it onto `Hero` and `SectionHeading`, which carry no strings of their
// own (AAP 0.4.3, 0.7.2). The module is a leaf, like `global.ts`: its only import is a type, so no
// component, configured value or test fixture can reach this page's copy through it (Rules B-1,
// B-2). It is also erasable-only TypeScript, so Node can load it directly through type stripping.

import type { PageMeta } from './global.ts';

/**
 * The copy `/privacy` renders: the document metadata a search engine or link preview reads, the
 * heading that is the page's single `h1`, and the body beneath it.
 */
export interface PrivacyCopy {
  /**
   * A8's metadata for `/privacy`. The page title lives in `title` and the meta description in
   * `description`; there is no separate display title, because A7 gives the page one heading and
   * duplicating it here would let the document title and the visible heading drift apart.
   *
   * `description` is present rather than omitted: A8 gives every page a description and withholds
   * one from the 404 alone, so leaving the field off would misreport the specification (AAP 0.4.3).
   */
  meta: PageMeta;
  /** A7's on-page heading: the page's single `h1`, which is what Rule B-3 requires. */
  heading: string;
  /**
   * A7's body copy, carried as one string because the specification writes it as one piece.
   *
   * The owner supplies this text; until then it holds the launch guard's marker, which
   * `scripts/launch-check.ts` refuses to let a live build publish, so an invented privacy policy
   * cannot ship in its place (AAP 0.9.5, WT-10; Rule B-4).
   */
  body: string;
}

/**
 * A7's copy for `/privacy`.
 *
 * The content specification holding A7's heading and body, and A8's title and description for this
 * page, was not available to this build, and no string may be reconstructed from the build prompt
 * or invented to fill the gap (AAP 0.7.7; Rule B-4). Every value therefore holds the project's
 * placeholder marker verbatim — the one marker `scripts/launch-check.ts` blocks — so this page
 * builds complete, renders honestly, and cannot be published until the owner supplies its text.
 * Replacing a marker with real copy needs no change to any component.
 */
export const privacy: PrivacyCopy = {
  meta: {
    title: 'TO BE PROVIDED',
    description: 'TO BE PROVIDED',
  },
  heading: 'TO BE PROVIDED',
  body: 'TO BE PROVIDED',
};
