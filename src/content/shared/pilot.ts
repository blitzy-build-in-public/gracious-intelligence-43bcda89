/**
 * The pilot band's copy (AAP 0.4.3, 0.6.2, 0.8.2): the shared block rendered on the home page,
 * the Site Intelligence page and the sovereignty page.
 *
 * A copy module and nothing else — one type, one definition, no markup, styles or logic. It
 * reads no configuration and holds no address beyond the same-site contact route, so the band's
 * copy and its one control cannot vary by environment (Rules B-1, B-2). Its only import is a
 * type import and it uses no construct that type stripping cannot erase, so Node loads it
 * directly wherever a build-time script needs the band's copy.
 */

import type { Item, Link } from "../global.ts";

/**
 * The pilot band's copy.
 *
 * One object renders the band on `/`, `/platform/site-intelligence` and `/sovereignty`; there is
 * no per-page variant and no second copy, so an edit here reaches all three pages and none of
 * them drifts from another (AAP A-4, 0.7.2). The three step titles are fixed by the plan and
 * run in ascending order, so the steps carry their own sequence when read aloud and no numeral
 * beyond those titles appears in the band (AAP 0.6.2, Rule B-3). The action is an internal link
 * to the contact page, never a form, a request or an endpoint: the enquiry leaves the site only
 * through the form on that page (Rule W-2).
 */
export interface PilotBandCopy {
  /** The band's heading. */
  heading: string;
  /** Exactly three steps, titled `Day 1`, `Day 20` and `Day 90`, in that order. */
  steps: Item[];
  /** The band's one control: a link to the contact page. */
  action: Link;
}

/**
 * The one definition of the pilot band (AAP A-4), imported by each page that shows it rather
 * than restated there.
 *
 * The content specification that supplies the heading, the three step lines and the button label
 * was not available to this build, so those fields hold the project's placeholder marker instead
 * of invented, borrowed or guessed text (AAP 0.7.7): the template's own promotional-band copy
 * belongs to another business and no string may be reconstructed from the plan. The launch guard
 * keeps the marker out of a published build (AAP 0.9.5, WT-10), so the gap stays visible to the
 * owner instead of shipping.
 *
 * Rule B-3 requires the band's control to name its purpose, and its label is the marker while
 * A1's copy is absent, so the button does not yet say what it does; the departure stands because
 * inventing a label would break Rules W-1 and B-4 and the launch guard keeps the marker out of
 * any published build.
 */
export const pilot: PilotBandCopy = {
  heading: "TO BE PROVIDED",
  steps: [
    { title: "Day 1", line: "TO BE PROVIDED" },
    { title: "Day 20", line: "TO BE PROVIDED" },
    { title: "Day 90", line: "TO BE PROVIDED" },
  ],
  action: { label: "TO BE PROVIDED", href: "/contact" },
};
