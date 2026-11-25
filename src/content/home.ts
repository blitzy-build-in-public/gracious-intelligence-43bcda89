// src/content/home.ts — A1, the home page copy (AAP 0.7.2, 0.8.2).
//
// One object, one export: `src/pages/index.astro` imports `home` and maps its fields onto the page
// top, the gap, the four actions, the product-feature diagram, the sovereignty band, the four
// values, the four stage cards, the pilot band and the six questions, in that order (AAP 0.8.4).
// This module is the only source of the strings on `/`; no component holds one. It reads no
// configuration and holds no host, so no configured value, component or fixture can reach the copy
// through it (Rules B-1, B-2), and it is erasable-only TypeScript so Node loads it directly through
// type stripping wherever a build-time script needs it (AAP 0.10.1).
//
// A1 was not available to this build: `tests/fixtures/website-content-specification.md` holds an
// absent-document notice, not the specification's sections A0–A8. Nothing here is therefore
// invented, borrowed from the template or reconstructed from the plan's quotations (Rules W-1,
// B-4); every string A1 owns carries the project's placeholder marker instead, exactly as the
// sibling modules do (AAP 0.7.7), and `scripts/launch-check.ts` refuses to let a live build publish
// that marker (AAP 0.9.5, WT-10). Three kinds of value carry no marker because the plan itself
// fixes them: the panel and wordmark switches, the status labels `global.ts` defines once
// (AAP 0.7.5), and the two internal route targets — a path is structure, not copy (Rule B-1).

import { global } from './global.ts';
import type { HeroCopy, Item, Line, Link, PageMeta } from './global.ts';
import { actions } from './shared/actions.ts';
import { stages } from './shared/stages.ts';
import type { StageCard } from './shared/stages.ts';
import { pilot } from './shared/pilot.ts';
import type { PilotBandCopy } from './shared/pilot.ts';
import { faq } from './shared/faq.ts';
import type { FaqItem } from './shared/faq.ts';

/**
 * One column of the product-feature diagram (AAP 0.4.3, 0.8.1).
 *
 * A column carries exactly one of `items` and `lines`: the outer columns pair a title with a line,
 * while the centre column carries single strings plus the diagram's one caption. The two members
 * are both optional on this interface so a consumer can read either without narrowing, and the
 * exclusivity is a property of the definition below rather than of the type.
 */
export interface DiagramColumn {
  /** The column's heading. The right-hand column's is A1's four-actions heading. */
  title: string;
  /** Title-and-line pairs, for the outer columns. Never set together with `lines`. */
  items?: Item[];
  /** One string per line, for the centre column. Never set together with `items`. */
  lines?: Line[];
  /** The diagram's single caption, carried by the centre column. */
  caption?: string;
}

/**
 * The product-feature block that occupies the template's three-image stack on `/` (AAP 0.8.1).
 *
 * The diagram's text is real text from this object, so it selects, wraps and reads aloud; the block
 * ships no raster (WT-08) and asks for no media file, which is why there is no image field here.
 */
export interface FeatureCopy {
  /** The block's heading. */
  heading: string;
  /** Exactly three columns, in order: left, centre, right. */
  columns: DiagramColumn[];
  /** The block's action: the "How it works" link to the product page (WT-17). */
  action: Link;
  /** The diagram's text alternative, from A8. */
  alt: string;
}

/**
 * The home page's sovereignty band (AAP 0.8.1).
 *
 * Every statement in the band is a claim about the ten sovereignty controls, so the band carries
 * the design-intent status label beside its copy rather than in a section elsewhere on the page: the
 * qualifier travels with the claim (AAP 0.7.5, Rule B-3). The band holds no video and no play
 * control — the template's video slot is filled by `boundary.svg` instead (AAP 0.2.4).
 */
export interface SovereigntyBandCopy {
  /** The band's heading. */
  heading: string;
  /** The band's one-line text. */
  text: string;
  /** The band's three title-and-line pairs. */
  items: Item[];
  /** The design-intent label that qualifies the band's claim. */
  statusLabel: string;
  /** The band's one control, a same-site link from the eight routes. */
  action: Link;
}

/**
 * Every string, link, panel and shared block `/` renders (AAP 0.8.2).
 *
 * The keys mirror A1's own field names, so a reader moves between the document and this object
 * without a mapping table (AAP 0.4.3). Copy that more than one surface shows is imported into the
 * four fields below rather than restated, so one edit reaches every surface and none drifts (A-4).
 */
export interface HomeCopy {
  /** A8's title and description for `/`. */
  meta: PageMeta;
  /** A1's top block: the small mono label, the headline, the paragraph and the hero panel. */
  hero: HeroCopy;
  /**
   * The gap: the bracketed label, the heading and the six text cards.
   *
   * The template draws two card images here; both are closed rather than filled, so a card is an
   * `Item` and nothing else and no media field exists (AAP 0.2.4). A1 may also give this block an
   * intro paragraph or a caption; neither can be established while the document is missing, and an
   * optional field with no source is left out rather than placeheld.
   */
  gap: { label?: string; heading: string; text?: string; caption?: string; items: Item[] };
  /**
   * The four actions, as one heading and the shared array.
   *
   * The heading is used twice on the page — as this section's heading and as the diagram's
   * right-hand column title — so it is stored once in `fourActionsHeading` below (AAP 0.8.2).
   */
  actions: { heading: string; items: Item[] };
  /** The product-feature diagram. */
  feature: FeatureCopy;
  /** The four stage cards, of which only the first is a link (AAP 0.8.1). */
  stages: StageCard[];
  /** The sovereignty band. */
  band: SovereigntyBandCopy;
  /**
   * What Grace means: the heading and the four bracketed value items.
   *
   * Their ordinals are drawn by a CSS counter from each item's position, so no numeral is stored
   * here and the DOM holds the words alone (AAP 0.2.3, 0.6.6).
   */
  grace: { heading: string; items: Item[] };
  /** The pilot band, the shared block rendered on three pages (AAP 0.8.2). */
  pilot: PilotBandCopy;
  /** The six questions, the shared array the contact page shows again (AAP 0.8.2). */
  faq: FaqItem[];
}

/**
 * A1's four-actions heading, stored once because the home page uses it twice: it titles the four
 * action rows and the product-feature diagram's right-hand column, whose items are those same four
 * actions (AAP 0.8.2). One string, two places, so a copy edit cannot leave the diagram describing
 * the rows differently from the rows themselves.
 */
const fourActionsHeading = 'TO BE PROVIDED';

/**
 * A1's home-page copy.
 *
 * Every string A1 owns carries the placeholder marker, because the document that supplies them was
 * not available to this build (AAP 0.7.7): no claim was invented and no template string was
 * borrowed, and the launch guard keeps the marker out of a published build so the gap stays visible
 * to the owner instead of shipping (AAP 0.9.5, WT-10). The block names the plan uses — "The gap",
 * "What Grace means" — are the plan's own identifiers for A1's sections and not established copy,
 * so those headings carry the marker too rather than being assumed.
 */
export const home: HomeCopy = {
  meta: {
    title: 'TO BE PROVIDED',
    description: 'TO BE PROVIDED',
  },
  hero: {
    label: 'TO BE PROVIDED',
    heading: 'TO BE PROVIDED',
    text: 'TO BE PROVIDED',
    // The full-bleed band and the small slot beside the mono label both take the hero panel, which
    // scales to either size without a second file (AAP 0.2.4). A panel name, never a path (WT-08).
    illustration: 'hero',
    // The wordmark above the headline is the fit-sized one, and the headline alone is the `h1`
    // (AAP 0.2.2, 0.8.1).
    wordmark: true,
  },
  gap: {
    label: 'TO BE PROVIDED',
    heading: 'TO BE PROVIDED',
    items: [
      { title: 'TO BE PROVIDED', line: 'TO BE PROVIDED' },
      { title: 'TO BE PROVIDED', line: 'TO BE PROVIDED' },
      { title: 'TO BE PROVIDED', line: 'TO BE PROVIDED' },
      { title: 'TO BE PROVIDED', line: 'TO BE PROVIDED' },
      { title: 'TO BE PROVIDED', line: 'TO BE PROVIDED' },
      { title: 'TO BE PROVIDED', line: 'TO BE PROVIDED' },
    ],
  },
  actions: {
    heading: fourActionsHeading,
    // The one definition, imported: the Site Intelligence page and the diagram's right-hand column
    // show the same four actions, and none of them restates the array (A-4).
    items: actions,
  },
  feature: {
    heading: 'TO BE PROVIDED',
    columns: [
      {
        title: 'TO BE PROVIDED',
        items: [
          { title: 'TO BE PROVIDED', line: 'TO BE PROVIDED' },
          { title: 'TO BE PROVIDED', line: 'TO BE PROVIDED' },
          { title: 'TO BE PROVIDED', line: 'TO BE PROVIDED' },
          { title: 'TO BE PROVIDED', line: 'TO BE PROVIDED' },
        ],
      },
      {
        title: 'TO BE PROVIDED',
        lines: [
          'TO BE PROVIDED',
          'TO BE PROVIDED',
          'TO BE PROVIDED',
          'TO BE PROVIDED',
          'TO BE PROVIDED',
        ],
        caption: 'TO BE PROVIDED',
      },
      {
        title: fourActionsHeading,
        items: actions,
      },
    ],
    // A1's "How it works" link is fixed by the plan, and it is the route the reachability check
    // walks from `/` to reach the product page (AAP 0.8.1, WT-17).
    action: { label: 'How it works', href: '/platform/site-intelligence' },
    alt: 'TO BE PROVIDED',
  },
  stages: stages,
  band: {
    heading: 'TO BE PROVIDED',
    text: 'TO BE PROVIDED',
    items: [
      { title: 'TO BE PROVIDED', line: 'TO BE PROVIDED' },
      { title: 'TO BE PROVIDED', line: 'TO BE PROVIDED' },
      { title: 'TO BE PROVIDED', line: 'TO BE PROVIDED' },
    ],
    // Imported rather than restated: the shell copy owns the design-intent label, and the ten
    // control rows on `/sovereignty` show the same words, so the two can never disagree
    // (AAP 0.7.2, 0.7.5).
    statusLabel: global.status.sovereignty,
    // The band's control leads to the page that sets the controls out in full; the label A1 gives
    // it is not available, so the target is the structural part and the label carries the marker.
    // Rule B-3 requires the band's control to name its purpose, and its label is the marker while
    // A1's copy is absent, so the link does not yet say what it does; the departure stands because
    // inventing a label would break Rules W-1 and B-4 and the launch guard keeps the marker out of
    // any published build.
    action: { label: 'TO BE PROVIDED', href: '/sovereignty' },
  },
  grace: {
    heading: 'TO BE PROVIDED',
    items: [
      { title: 'TO BE PROVIDED', line: 'TO BE PROVIDED' },
      { title: 'TO BE PROVIDED', line: 'TO BE PROVIDED' },
      { title: 'TO BE PROVIDED', line: 'TO BE PROVIDED' },
      { title: 'TO BE PROVIDED', line: 'TO BE PROVIDED' },
    ],
  },
  // The pilot band's heading, its three steps and its button label live in `shared/pilot.ts`, the
  // one place they are written, so the band is imported here rather than restated (AAP A-4, 0.8.2).
  pilot: pilot,
  faq: faq,
};
