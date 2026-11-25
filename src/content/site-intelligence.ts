// src/content/site-intelligence.ts — A3, the Site Intelligence page copy (AAP 0.7.2, 0.8.2).
//
// One object, one export: `src/pages/platform/site-intelligence.astro` imports `siteIntelligence`
// and maps its fields, in the page's own order, onto the page top, the four systems as cards, the
// five model items and their caption, the four actions as rows, the detail paragraph, the three
// product-screen frames, the pilot band and stage cards 02–04 (AAP 0.8.4).
//
// A copy module and nothing else: two interfaces, one object, no markup, no logic and no configured
// value, so it reads the same in every build (Rules B-1, B-2). Three of its blocks are imported
// rather than restated — the four actions, the four stages and the pilot band each have one
// definition, so no two pages can drift from one another (AAP 0.4.3, A-4). It names no host and no
// image file: a screen frame carries a key, and `src/lib/screens.ts` decides at build time whether
// that screen's image was supplied, so an absent screenshot degrades to its designed panel instead
// of breaking a build (AAP 0.7.4, WT-08, WT-12).
//
// The content specification that owns A3 and A8 is not present in this checkout, so every string
// those sections supply carries the project's placeholder marker rather than invented, borrowed or
// guessed text (AAP 0.7.7): the template's own copy belongs to another business and no string may
// be reconstructed from the plan (Rule W-1). The marker is the input the owner must supply, not
// copy, and `scripts/launch-check.ts` refuses to let a live build publish it (AAP 0.9.5, WT-10).
// The values the action plan itself fixes — the top block's panel and its product status label, the
// demonstration caption every screen frame carries, and the three screen keys — are set exactly,
// because none of them is a string the specification owns.

import { global } from './global.ts';
import type { HeroCopy, Item, Line, PageMeta } from './global.ts';
import { actions } from './shared/actions.ts';
import { pilot } from './shared/pilot.ts';
import type { PilotBandCopy } from './shared/pilot.ts';
import { stages } from './shared/stages.ts';
import type { StageCard } from './shared/stages.ts';

/**
 * The identity of one of the owner's three product screens, in the order the page presents them.
 *
 * A key and not a path: it names which screenshot a frame shows, while the published filename and
 * the question of whether the file exists at all stay in `src/lib/screens.ts`, the module that owns
 * them. Copy therefore never references a raster (WT-08) and never has to change when a screenshot
 * arrives.
 */
export type ScreenFrameKey = 'investigate' | 'compare' | 'audit';

/**
 * One product-screen frame.
 *
 * The frame has two states and both are designed: the supplied screenshot, and the neutral panel
 * that takes its place while the screenshot has not arrived. Neither is fetched at run time, so a
 * visitor with scripts disabled sees the same frame as any other (AAP 0.8.4). The caption survives
 * the fallback, so a frame whose screenshot is missing still says what it will show.
 */
export interface ScreenFrameCopy {
  /** Which of the three screens this frame presents. */
  key: ScreenFrameKey;
  /**
   * The frame's caption, which renders with the image and stays when the image is replaced by the
   * designed panel.
   *
   * Fixed by the action plan rather than by the specification: every product-screen slot is
   * captioned as a demonstration screen with simulated data, so no reader mistakes a mock for the
   * platform and the site never implies the product exists (AAP 0.1.3, 0.2.4, Rule B-4). A3's own
   * screen names, if it supplies any, join this caption when the specification arrives.
   */
  caption: string;
  /**
   * The frame's text alternative, A8's own words for what that screen shows.
   *
   * It names the screen's content rather than its appearance, so the description is useful and not
   * simply a restatement of the caption (Rule B-3). The specification is absent, so the value
   * carries the placeholder marker until A8's wording replaces it.
   */
  alt: string;
}

/**
 * Every string, item, link and image slot `/platform/site-intelligence` renders.
 *
 * The keys mirror A3's own field names, so a reader can move between the document and this object
 * without a mapping table (AAP 0.4.3). The bracketed eyebrow labels this page shows are drawn in
 * CSS from the words below, and the words themselves are set as the specification writes them: no
 * string here is typed in upper case, bracketed or numbered (AAP 0.6.6).
 */
export interface SiteIntelligenceCopy {
  /**
   * A8's unique title and description for this page. The description is present because A8 gives
   * this page one; on the single route A8 withholds it from, `Meta.astro` emits no tag at all.
   */
  meta: PageMeta;
  /**
   * A3's top block: its heading and one paragraph, over the page-top panel every route uses
   * (`top.svg`, AAP 0.2.4), carrying the product status label that qualifies this page's claims
   * (AAP 0.7.5).
   *
   * It carries no action, because A3's top block draws none, and no wordmark: the top of this page
   * is headed by A3's own heading, and the site wordmark would add a string A3 does not place here.
   */
  hero: HeroCopy;
  /**
   * The first reused block: A3's four systems as cards, each an `Item` whose title and line come
   * straight from the specification's item list (AAP 0.8.2, 0.8.4).
   *
   * The eyebrow label is marked rather than omitted because the block's anatomy draws one; the
   * owner deletes the field if A3 supplies no label for it, and the page then renders without an
   * eyebrow and nothing else changes.
   */
  systems: { label?: string; heading: string; text?: string; items: Item[] };
  /**
   * The second reused block: A3's five model items and their caption.
   *
   * The five items are `Line`s and not `Item`s, because the specification writes each of them as one
   * piece of copy rather than as a title-and-line pair, and `WorkGrid` accepts exactly one of the two
   * shapes (AAP 0.4.3, 0.8.1).
   */
  model: {
    label?: string;
    heading: string;
    text?: string;
    /** The mono caption that closes the block. */
    caption: string;
    /** Exactly five lines, in the specification's order. */
    lines: Line[];
  };
  /**
   * The third reused block: the four actions as rows.
   *
   * The single definition is imported from `shared/actions.ts` and never retyped, so the same four
   * actions read identically here and on the home page (AAP A-4). These rows are not links and carry
   * neither a number nor a status label, which is why the plain `Item` shape is enough (AAP 0.6.2).
   */
  actions: Item[];
  /**
   * A3's detail paragraph: the one place a bare paragraph of the specification's copy is rendered
   * (AAP 0.8.1).
   */
  detail: { label?: string; text: string };
  /** The heading above the three product-screen frames, and the frames themselves. */
  screens: { heading: string; frames: ScreenFrameCopy[] };
  /**
   * The pilot band, imported from `shared/pilot.ts` so the band reads identically on the three pages
   * that show it (AAP A-4). Its action is a same-site link to the contact page, never a form or an
   * endpoint (Rule W-2).
   */
  pilot: PilotBandCopy;
  /**
   * Stage cards 02–04.
   *
   * Selected from the single shared definition rather than retyped: card 01 is the one card that
   * links to this page, so the stage sequence is already presented above it, and a card that leads
   * nowhere renders as a static block with no link affordance (AAP 0.8.4, Rule B-4).
   */
  stages: StageCard[];
}

/**
 * A3's copy for `/platform/site-intelligence`, as the page maps it onto `Hero`, `WorkGrid`,
 * `CategoryRows`, `ProseBlock`, `ScreenFrames`, `PilotBand` and `StageCards` props.
 *
 * The product status label is read from the shell copy rather than restated, so the one string that
 * qualifies every place the product is presented as an offering has a single definition and a copy
 * edit cannot leave one of those places saying something else (AAP 0.7.2, 0.7.5).
 */
export const siteIntelligence: SiteIntelligenceCopy = {
  meta: {
    title: 'TO BE PROVIDED',
    description: 'TO BE PROVIDED',
  },
  hero: {
    heading: 'TO BE PROVIDED',
    text: 'TO BE PROVIDED',
    illustration: 'top',
    statusLabel: global.status.product,
  },
  systems: {
    label: 'TO BE PROVIDED',
    heading: 'TO BE PROVIDED',
    text: 'TO BE PROVIDED',
    items: [
      { title: 'TO BE PROVIDED', line: 'TO BE PROVIDED' },
      { title: 'TO BE PROVIDED', line: 'TO BE PROVIDED' },
      { title: 'TO BE PROVIDED', line: 'TO BE PROVIDED' },
      { title: 'TO BE PROVIDED', line: 'TO BE PROVIDED' },
    ],
  },
  model: {
    label: 'TO BE PROVIDED',
    heading: 'TO BE PROVIDED',
    text: 'TO BE PROVIDED',
    caption: 'TO BE PROVIDED',
    lines: [
      'TO BE PROVIDED',
      'TO BE PROVIDED',
      'TO BE PROVIDED',
      'TO BE PROVIDED',
      'TO BE PROVIDED',
    ],
  },
  actions,
  detail: {
    label: 'TO BE PROVIDED',
    text: 'TO BE PROVIDED',
  },
  screens: {
    heading: 'TO BE PROVIDED',
    frames: [
      {
        key: 'investigate',
        caption: 'Demonstration screen with simulated data',
        alt: 'TO BE PROVIDED',
      },
      {
        key: 'compare',
        caption: 'Demonstration screen with simulated data',
        alt: 'TO BE PROVIDED',
      },
      {
        key: 'audit',
        caption: 'Demonstration screen with simulated data',
        alt: 'TO BE PROVIDED',
      },
    ],
  },
  pilot,
  stages: stages.filter((card: StageCard): boolean => card.href === undefined),
};
