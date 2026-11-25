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
import { global } from '../global.ts';

export interface StageCard {
  /** The ordinal the card shows, exactly as the content specification writes it. */
  number: string;
  /** The stage's name. */
  name: string;
  /** One line describing the stage. */
  line: string;
  /** The status qualifying the stage's claim, conveyed as words and never by colour. */
  statusLabel: string;
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
 */
export const stages: StageCard[] = [
  {
    number: 'TO BE PROVIDED',
    name: 'TO BE PROVIDED',
    line: 'TO BE PROVIDED',
    statusLabel: global.status.product,
    href: '/platform/site-intelligence',
  },
  {
    number: 'TO BE PROVIDED',
    name: 'TO BE PROVIDED',
    line: 'TO BE PROVIDED',
    statusLabel: 'Design-partner stage, not started',
  },
  {
    number: 'TO BE PROVIDED',
    name: 'TO BE PROVIDED',
    line: 'TO BE PROVIDED',
    statusLabel: 'Bounded research',
  },
  {
    number: 'TO BE PROVIDED',
    name: 'TO BE PROVIDED',
    line: 'TO BE PROVIDED',
    statusLabel: 'Proposed. Transfer is not yet demonstrated',
  },
];
