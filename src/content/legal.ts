/**
 * The `/legal` page's copy: A7's heading and body with A8's document metadata (AAP 0.7.2,
 * 0.8.2, 0.8.4).
 *
 * This module is a leaf apart from the one type it borrows: it imports the `PageMeta` shape and
 * nothing else, so no component, configured value or test fixture can reach the page's copy
 * through it (Rules B-1, B-2). `src/pages/legal.astro` imports `legal` and maps it to the page's
 * top block and heading; no other module reads it, and neither it nor `privacy.ts` shares a type
 * with the other, because the two pages own separate specification fields.
 */

import type { PageMeta } from "./global.ts";

/**
 * Everything the `/legal` page renders, in the field names the content specification uses for it
 * (AAP 0.4.3).
 *
 * The body is a single string rather than markup: the page renders it as ordinary text, so a
 * legal document cannot arrive as HTML and nothing here needs sanitising. `heading` supplies the
 * page's one `h1`, which keeps the document outline of a text-only page intact (Rule B-3).
 */
export interface LegalCopy {
  /** A8's document title and meta description for `/legal`. */
  meta: PageMeta;
  /** A7's on-page heading: the page's single `h1`. */
  heading: string;
  /** A7's body copy for the page, rendered as plain text. */
  body: string;
}

/**
 * A7's `/legal` copy, with A8's metadata.
 *
 * The content specification that carries this page's heading and body was not available to this
 * build, so all four strings hold the project's placeholder marker rather than invented text.
 * Every field A7 owns is therefore still open, and nothing was written in its place: no terms, no
 * company number, no jurisdiction and no registered address appears here, because inventing any
 * of them is exactly what Rule B-4 and AAP 0.11.2 forbid.
 *
 * The marker is a legitimate state of the default build, and `scripts/launch-check.ts` refuses to
 * let a live build publish it (AAP 0.9.5, WT-10). Supplying the owner's copy means replacing the
 * four markers below; the page, its route and every component stay as they are.
 */
export const legal: LegalCopy = {
  meta: {
    title: "TO BE PROVIDED",
    description: "TO BE PROVIDED",
  },
  heading: "TO BE PROVIDED",
  body: "TO BE PROVIDED",
};
