/**
 * A2 copy for `/platform` (AAP 0.7.2, 0.8.2).
 *
 * The page this module serves is A2's own: a top block, the four stage cards at the larger card
 * size with only the first card linked, and an enquiry block carrying a single action (AAP 0.8.4).
 * Its keys mirror A2's field names, so a reader can move between the document and this module
 * without a mapping table (AAP 0.4.3), and the stage block is imported rather than copied, so one
 * edit reaches every page that shows it (A-4).
 *
 * The content specification holding A2's copy is not present in this repository, so each string it
 * owns carries the project's placeholder marker rather than invented, borrowed or guessed text
 * (AAP 0.7.7). The marker is the input the owner must supply, not copy:
 * `scripts/launch-check.ts` refuses to let a live build publish it (AAP 0.9.5, WT-10). The two
 * values the action plan itself fixes — the top block's panel and the enquiry action's target —
 * are set exactly, because neither is a string the specification owns.
 *
 * Rule B-3 requires the enquiry action to name its purpose, and its label is the marker while
 * A2's copy is absent, so the button does not yet say what it does; the departure stands because
 * inventing a label would break Rules W-1 and B-4 and the launch guard keeps the marker out of
 * any published build.
 */
import type { HeroCopy, Link, PageMeta } from "./global.ts";
import { stages } from "./shared/stages.ts";
import type { StageCard } from "./shared/stages.ts";

/**
 * Everything `/platform` renders, in the order the page composes it (AAP 0.8.4).
 *
 * The module carries copy and nothing else: the card size, the enquiry block's panel and the
 * page's own metadata tags are page- or component-level props, and no configured value reaches
 * this file (Rules B-1, B-2).
 */
export interface PlatformCopy {
  /**
   * A8's unique title and description for `/platform`. The description is present because A8 gives
   * this page one; on the route A8 withholds it from, `Meta.astro` emits no tag at all.
   */
  meta: PageMeta;
  /**
   * A2's top block: its heading, one paragraph and the `top` panel. It carries no action, because
   * A2's only action belongs to the enquiry block, and no status label, because the product status
   * that qualifies this page's claims travels on stage card 01 (AAP 0.7.5).
   */
  hero: HeroCopy;
  /**
   * The four stage cards, in the specification's order — the single definition imported from
   * `shared/stages.ts`, never a copy of it. Only card 01 carries an `href`, so no card is presented
   * as a control that leads nowhere (Rule B-4).
   */
  stages: StageCard[];
  /**
   * The enquiry block: its heading and its one action. There is no form here and no field label,
   * because the site has exactly one form, on `/contact` (Rule W-2).
   */
  enquiry: { heading: string; action: Link };
}

/**
 * A2's copy, as the page maps it onto `Hero`, `StageCards` and `Button` props.
 *
 * The action's target is a route rather than copy, so it is stated here: `/contact` is the site's
 * only enquiry form (AAP 0.8.4) and every link in the output must resolve, which Rule B-4 and the
 * reachability check require. Its label is A2's, so it carries the marker with the rest.
 */
export const platform: PlatformCopy = {
  meta: {
    title: "TO BE PROVIDED",
    description: "TO BE PROVIDED",
  },
  hero: {
    heading: "TO BE PROVIDED",
    text: "TO BE PROVIDED",
    illustration: "top",
  },
  stages,
  enquiry: {
    heading: "TO BE PROVIDED",
    action: { label: "TO BE PROVIDED", href: "/contact" },
  },
};
