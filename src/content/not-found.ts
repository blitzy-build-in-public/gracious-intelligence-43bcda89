// src/content/not-found.ts — A8's page-not-found copy: the only strings the 404 route renders.
//
// The module is a leaf in the copy layer. It imports two types from `./global.ts` and nothing
// else, so no component, configured value or fixture can reach this copy through it (Rules B-1,
// B-2), and it is erasable-only TypeScript like every content module, because Node loads the
// copy layer directly through type stripping.

import type { Link, PageMeta } from "./global.ts";

/**
 * The page-not-found copy: the four fields the 404 route maps onto `Hero` and `Button` (AAP
 * 0.8.4). The keys mirror A8's field names, so a reader can move between the document and this
 * module without a mapping table (AAP 0.4.3).
 */
export interface NotFoundCopy {
  /**
   * A8's title for the 404. It carries no `description`, because A8 gives the page-not-found
   * copy a title, a heading, a text and a link and no description: `Meta.astro` emits the tag
   * only when one exists, so the 404 has none at all rather than an empty or invented one (AAP
   * 0.4.3, WT-15). Adding one here would publish a claim A8 does not make.
   */
  meta: PageMeta;
  /** The page-not-found heading, which the route renders as the page's single `h1` (Rule B-3). */
  heading: string;
  /** The page-not-found text, the page's one paragraph beneath that heading. */
  text: string;
  /**
   * The way back: one same-site link to the home route, which exists, so the page holds no dead
   * control (Rules B-1, B-4). It is the page's only link — the route is absent from the
   * navigation, the sitemap and every crawler by design (AAP 0.4.2), so nothing here may add a
   * second one, a suggestion list or an indexability switch.
   */
  action: Link;
}

/**
 * A8's page-not-found copy.
 *
 * A8 was not available to this build: the content specification the copy comes from was absent
 * from the checkout and from every location searched for it, and no string may be reconstructed
 * from the build prompt or invented in its place (AAP 0.7.7). Every A8-derived string and the
 * link's label therefore hold the project's placeholder marker, which `scripts/launch-check.ts`
 * refuses to publish (AAP 0.9.5, WT-10), so the gap stays visible to the owner and a live build
 * cannot ship it. Replacing them with A8's own wording changes this module and no component.
 *
 * The link target is fixed by the route set rather than by the document, so `href` is `/` in
 * every configuration.
 */
export const notFound: NotFoundCopy = {
  meta: { title: "TO BE PROVIDED" },
  heading: "TO BE PROVIDED",
  text: "TO BE PROVIDED",
  action: { label: "TO BE PROVIDED", href: "/" },
};
