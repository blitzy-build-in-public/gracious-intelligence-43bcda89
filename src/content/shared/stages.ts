/**
 * One of the four stage cards that describe the product's stages.
 *
 * `href` is the card's link affordance: a card that carries it renders as a link,
 * and a card that omits it renders as a static block. Only the first stage has a
 * page of its own, so only the first card carries `href` and the other three are
 * never presented as controls that lead nowhere.
 */

// Card 01's status label is the product status label, which the shell copy defines once. It is
// imported here rather than restated, because the same words qualify every place the product is
// presented as an offering (AAP 0.7.2, 0.7.5): a copy edit in `global.ts` must not leave one of
// those places saying something else.
import { global } from "../global.ts";
import type { PanelVariant } from "../global.ts";

export interface StageCard {
  /** The ordinal the card shows, exactly as the content specification writes it. */
  number: string;
  /** The stage's name. */
  name: string;
  /** One line describing the stage. */
  line: string;
  /** The status qualifying the stage's claim, conveyed as words and never by colour. */
  statusLabel: string;
  /**
   * The illustration the card shows, from the nine authored panels (AAP 0.2.4).
   *
   * The card owns its panel rather than taking one from its position in a set, because a page may
   * present a subset of the stages: `/platform/site-intelligence` shows cards 02–04, and a
   * position-based mapping would hand card 02 the first panel. Optional so a card added before its
   * artwork exists still renders; `StageCards` then falls back to the panel its position names.
   */
  panel?: PanelVariant;
  /** Target of the card's link. Omitted entirely on a card that is not a link. */
  href?: string;
}

/**
 * The four stage cards, in the order the content specification sets out, defined
 * once and imported by every page that shows them.
 *
 * The specification that supplies each card's number, name and line is not present
 * in this checkout, so those fields carry the project's placeholder marker until it
 * arrives: nothing was invented in their place, and the launch guard keeps the
 * marker out of a published build. The status labels are fixed copy and carry no
 * marker.
 *
 * Rule B-3 requires card 01's link to name its purpose, and until A1's copy arrives
 * that card's number, name and line are the marker, so the link does not yet say
 * where it leads; the departure stands because inventing a label would break Rules
 * W-1 and B-4 and the launch guard keeps the marker out of any published build.
 */
export const stages: StageCard[] = [
  {
    number: "TO BE PROVIDED",
    name: "TO BE PROVIDED",
    line: "TO BE PROVIDED",
    statusLabel: global.status.product,
    panel: "stage-01",
    href: "/platform/site-intelligence",
  },
  {
    number: "TO BE PROVIDED",
    name: "TO BE PROVIDED",
    line: "TO BE PROVIDED",
    statusLabel: "Design-partner stage, not started",
    panel: "stage-02",
  },
  {
    number: "TO BE PROVIDED",
    name: "TO BE PROVIDED",
    line: "TO BE PROVIDED",
    statusLabel: "Bounded research",
    panel: "stage-03",
  },
  {
    number: "TO BE PROVIDED",
    name: "TO BE PROVIDED",
    line: "TO BE PROVIDED",
    statusLabel: "Proposed. Transfer is not yet demonstrated",
    panel: "stage-04",
  },
];
