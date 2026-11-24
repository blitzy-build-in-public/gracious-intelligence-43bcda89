/**
 * A0 shell copy and the single definition site of the content primitives that every page
 * module, the page shell and `scripts/gen-assets.ts` consume (AAP 0.4.3, 0.7.2, 0.8.2).
 *
 * This module is a leaf: it imports nothing, so no component, configured value or fixture can
 * reach the copy through it (Rules B-1, B-2). It is also erasable-only TypeScript, because Node
 * loads it directly through type stripping when the asset script reads the social-image strings
 * (AAP 0.4.2, 0.10.1) — hence no construct below that type stripping cannot erase.
 */

/**
 * A link whose `label` is its visible text and whose `href` is a same-site path from the eight
 * routes of AAP 0.4.2 — never a host, a scheme or a foreign origin (Rule B-1).
 */
export interface Link {
  label: string;
  href: string;
}

/**
 * A title-and-line pair: the two-part shape a specification item becomes once it is split on
 * " / " (AAP 0.7.3).
 */
export interface Item {
  title: string;
  line: string;
}

/**
 * A figure and its caption, the unit the conditional statistics block on `/about` renders
 * together with its source line (AAP 0.7.4, 0.8.1).
 */
export interface Figure {
  value: string;
  label: string;
}

/**
 * A page's document metadata from A8. `title` is required on every page; `description` is
 * absent where A8 gives the page none, and `Meta.astro` then emits no description tag rather
 * than an empty or invented one (AAP 0.4.3, 0.8.1).
 */
export interface PageMeta {
  title: string;
  description?: string;
}

/**
 * The one row type for both row sections (AAP 0.4.3): the ten sovereignty controls carry a
 * `number` and a `statusLabel`, the four actions carry neither. No second row type exists.
 */
export interface RowItem extends Item {
  number?: string;
  statusLabel?: string;
}

/**
 * A single string the specification writes as one piece of copy, where no title/line split
 * applies (AAP 0.4.3).
 */
export type Line = string;

/**
 * The nine decorative panels authored for this project, one per file under
 * `src/illustrations/panels/` (AAP 0.2.4, 0.8.1).
 */
export type PanelVariant =
  | 'top'
  | 'hero'
  | 'boundary'
  | 'stage-01'
  | 'stage-02'
  | 'stage-03'
  | 'stage-04'
  | 'vision'
  | 'mission';

/**
 * A page top's copy. The members mirror `Hero.astro`'s props member for member, so a page maps
 * its `hero` field straight through (AAP 0.8.1); only `heading` is required, because the hero
 * renders a different subset on a legal page than on the home page.
 */
export interface HeroCopy {
  label?: string;
  heading: string;
  text?: string;
  action?: Link;
  illustration?: PanelVariant | null;
  statusLabel?: string;
  wordmark?: boolean;
}

/**
 * The footer's own copy from A0. The navigation links and the configured contact address reach
 * `Footer.astro` as separate props, because neither is content: one is defined here once for the
 * header too, the other comes from configuration only (AAP 0.7.2, 0.8.1).
 */
export interface FooterCopy {
  line: string;
  links: Link[];
  notice: string;
}

/**
 * A0's global shell copy, the two status labels that qualify every claim (AAP 0.7.5), and the
 * two strings the 1200x630 social image renders (AAP 0.4.2).
 */
export interface GlobalCopy {
  wordmark: string;
  nav: Link[];
  headerAction: Link;
  status: { product: string; sovereignty: string };
  footer: FooterCopy;
  socialImage: { title: string; text: string };
}

/**
 * The one definition of the shell copy (AAP 0.4.3, A-4): the five navigation links declared
 * here are what the header, the menu and the footer display, so no later module may copy them.
 *
 * A0 and A8 are the only sources for these strings (AAP 0.7.1). Neither is present in this
 * checkout, so every string they own carries the plan's placeholder marker instead of invented,
 * borrowed or guessed text (AAP 0.7.7) — the marker is the plan's, not copy, and
 * `scripts/launch-check.ts` refuses to let a live build publish it (AAP 0.9.5, WT-10). The
 * strings the AAP itself fixes are set exactly: the wordmark, the header call to action (FR-3,
 * AAP 0.6.2) and the two status labels (AAP 0.7.5).
 */
export const global: GlobalCopy = {
  wordmark: 'Gracious Intelligence',
  nav: [
    { label: 'TO BE PROVIDED', href: '/' },
    { label: 'TO BE PROVIDED', href: '/platform' },
    { label: 'TO BE PROVIDED', href: '/sovereignty' },
    { label: 'TO BE PROVIDED', href: '/about' },
    { label: 'TO BE PROVIDED', href: '/contact' },
  ],
  headerAction: { label: 'Request a pilot', href: '/contact' },
  status: {
    product: 'Proposed product, in discovery',
    sovereignty: 'Design intent',
  },
  footer: {
    line: 'TO BE PROVIDED',
    links: [
      { label: 'TO BE PROVIDED', href: '/privacy' },
      { label: 'TO BE PROVIDED', href: '/legal' },
    ],
    notice: 'TO BE PROVIDED',
  },
  socialImage: {
    title: 'TO BE PROVIDED',
    text: 'TO BE PROVIDED',
  },
};
