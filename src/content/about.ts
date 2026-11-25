// src/content/about.ts — A5's about-page copy, including the two fields that switch a
// conditional block (AAP 0.7.2, 0.8.2).
//
// One object, one export: `src/pages/about.astro` imports `about` and maps its fields onto the
// page top, the Story block, the Vision/Mission pair, the two conditional blocks and the pilot
// call, in that order (AAP 0.8.4). This module is a leaf — it imports types only, reads no
// configuration and holds no host — so neither a component, a configured value nor a fixture
// can reach the copy through it (Rules B-1, B-2).

import type {
  Figure,
  HeroCopy,
  Item,
  Link,
  PageMeta,
  PanelVariant,
} from './global.ts';

/** A5's Story block: one heading and the single Text it supplies, rendered whole. */
export interface StoryCopy {
  /** The Story heading. It carries no separate label: the template's own is not our copy. */
  heading: string;
  /** A5's one Text. The template's second paragraph slot stays empty rather than filled. */
  text: string;
}

/** A5's Why now block: its heading, its three figures and the source line that closes it. */
export interface WhyNowCopy {
  /** The block heading. Rendered only together with the figures and the source line. */
  heading: string;
  /** A5's three figures, the only figures on the page. */
  figures: Figure[];
  /** The attribution below the figures: neither renders without the other (AAP 0.7.4). */
  source: string;
}

/** A5's pilot call, which takes the place of the template's numbered step rows. */
export interface PilotCallCopy {
  /** The call's heading. */
  heading: string;
  /** The call's one text line. */
  text: string;
  /** The enquiry action, a same-site path from the eight routes (Rule B-1, B-4). */
  action: Link;
}

/**
 * Every string, link, figure, image slot and conditional switch `/about` renders.
 *
 * The keys mirror A5's own field names, so a reader can move between the document and this
 * object without a mapping table (AAP 0.4.3).
 */
export interface AboutCopy {
  /** A8's title and description for `/about`. */
  meta: PageMeta;
  /** A5's top block. The About top block draws a display wordmark and a bracketed photo. */
  hero: HeroCopy;
  /** A5's Story: a heading and one Text, and nothing else. */
  story: StoryCopy;
  /** The Vision and Mission pair, in that order, each with its own panel. */
  values: {
    /** The pair's own heading, if A5 supplies one above the two cards. */
    heading?: string;
    /** Two items: the mono card title and the card's body, Vision first. */
    items: Item[];
    /** The two decorative panels, index-aligned with `items` (AAP 0.2.4). */
    media: PanelVariant[];
  };
  /**
   * Whether A5's figures have a confirmed source. Defaults to `false`, so the block is off
   * until the owner confirms one, and the figures can never appear without their attribution
   * (AAP 0.7.4, 0.16.2; Rule B-4). The field is a plain `boolean` rather than the literal
   * `false` so that the confirmed state is representable: the plan's own `flags` configuration
   * builds a temporary copy of the project with this field set to `true` to prove the Why now
   * block and its source line render (AAP 0.13.2), and a literal type would make that edit a
   * type error.
   */
  sourceConfirmed: boolean;
  /** A5's Why now copy, rendered as one unit when `sourceConfirmed` is true. */
  whyNow: WhyNowCopy;
  /**
   * The founder's biography. Defaults to the empty string, so the block stays off until the
   * owner supplies the text and it never ships as invented biography (Rule B-4); a plain
   * `string` rather than the literal `''`, for the same reason as `sourceConfirmed` above —
   * the `flags` configuration sets sample text here to prove the conditional block renders
   * (AAP 0.13.2). A5 gives the block no heading, so no heading exists here (AAP 0.7.6).
   */
  founderBio: string;
  /** A5's pilot call, the last section before the footer. */
  pilotCall: PilotCallCopy;
}

/**
 * A5's about-page copy.
 *
 * The content specification holding A5 was not available to this build, so every string it
 * owns carries the launch guard's placeholder marker instead of invented, borrowed or guessed
 * text (AAP 0.7.7): `scripts/launch-check.ts` refuses to let a live build publish the marker,
 * which keeps the gap visible to the owner instead of shipping it. Three values carry no
 * marker, because the AAP fixes them or gives them a defined default: the two conditional
 * switches below, and the source line's organisation (AAP 0.7.6).
 *
 * Rule B-3 requires the pilot call's action to name its purpose, and its label is the marker
 * while A5's copy is absent, so the link does not yet say what it does; the departure stands
 * because inventing a label would break Rules W-1 and B-4 and the launch guard keeps the marker
 * out of any published build.
 */
export const about: AboutCopy = {
  meta: {
    title: 'TO BE PROVIDED',
    description: 'TO BE PROVIDED',
  },
  hero: {
    heading: 'TO BE PROVIDED',
    text: 'TO BE PROVIDED',
    illustration: 'top',
    wordmark: true,
  },
  story: {
    heading: 'TO BE PROVIDED',
    text: 'TO BE PROVIDED',
  },
  values: {
    items: [
      { title: 'TO BE PROVIDED', line: 'TO BE PROVIDED' },
      { title: 'TO BE PROVIDED', line: 'TO BE PROVIDED' },
    ],
    media: ['vision', 'mission'],
  },
  sourceConfirmed: false,
  whyNow: {
    heading: 'TO BE PROVIDED',
    figures: [
      { value: 'TO BE PROVIDED', label: 'TO BE PROVIDED' },
      { value: 'TO BE PROVIDED', label: 'TO BE PROVIDED' },
      { value: 'TO BE PROVIDED', label: 'TO BE PROVIDED' },
    ],
    source: 'McKinsey & Company',
  },
  founderBio: '',
  pilotCall: {
    heading: 'TO BE PROVIDED',
    text: 'TO BE PROVIDED',
    action: { label: 'TO BE PROVIDED', href: '/contact' },
  },
};
