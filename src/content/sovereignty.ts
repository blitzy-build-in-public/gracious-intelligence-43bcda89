// src/content/sovereignty.ts — A4's sovereignty-page copy (AAP 0.7.2, 0.8.2, 0.12.1).
//
// One object, one export: `src/pages/sovereignty.astro` imports `sovereignty` and maps its fields
// onto the page top, the ten controls, the ten questions, the limits statement and the pilot band,
// in that order (AAP 0.8.4). This module is a copy layer and nothing else — no markup, no style, no
// logic, no configured value and no host — so no component, configured value or test fixture can
// reach the page's copy through it (Rules W-1, B-1, B-2). It reads no configuration, so its strings
// cannot vary by environment.
//
// The module imports exactly one value, the pilot band, because the band renders on three pages
// from a single definition (AAP A-4, 0.7.2). Everything else it needs is a type, erased at build
// time. Nothing here is a construct that type stripping cannot erase, so Node loads the module
// directly when a build-time check reads it (AAP 0.12.2).

import type { HeroCopy, PageMeta, RowItem } from "./global.ts";
import { global } from "./global.ts";
import { pilot } from "./shared/pilot.ts";
import type { PilotBandCopy } from "./shared/pilot.ts";
import type { FaqItem } from "./shared/faq.ts";

/**
 * Every string `/sovereignty` renders, in the order the page composes it (AAP 0.8.4).
 *
 * The keys mirror A4's own field names, so a reader can move between the content specification and
 * this object without a mapping table (AAP 0.4.3). The page order is the block order below: the top
 * block, the ten controls, the ten questions, the limits statement and the pilot band.
 */
export interface SovereigntyCopy {
  /**
   * A8's unique title and description for `/sovereignty`. The description is present rather than
   * omitted because A8 withholds it from the 404 alone; `Meta.astro` emits the tag only when a page
   * carries one, so leaving the field off here would misreport the specification (AAP 0.4.3, 0.8.1).
   */
  meta: PageMeta;
  /**
   * A4's top block: its heading, its text, the `top` panel every inner page's page top carries
   * (AAP 0.2.4) and the page's own status label, which qualifies the sovereignty claims below it.
   *
   * The label is `Design intent, checked at each deployment`, the one string A4's top block adds to
   * the global status labels (AAP 0.7.5, 0.11.1). It is stated here rather than derived from
   * `global.status.sovereignty` because it is a longer, page-specific claim, not the A0 label.
   */
  hero: HeroCopy;
  /**
   * The ten sovereignty controls, in A4's order, as ten `RowItem`s.
   *
   * One row type serves both row sections of the site (AAP 0.4.3, 0.8.2): these ten rows carry
   * both a `number` and a `statusLabel`, while the four actions on the home page carry neither.
   * Each row's status label is the A0 `Design intent` string, imported from `global.ts` rather
   * than restated, so an edit there reaches every place the claim is qualified and no copy of it
   * can drift (AAP 0.7.2, 0.7.5).
   *
   * The `number` values are A4's ordinals, which are absent from this build, so each holds the
   * project's placeholder marker: no ordinal was invented in their place (AAP 0.7.7), and
   * `scripts/launch-check.ts` refuses to publish the marker (AAP 0.9.5, WT-10). A4's own ordinal
   * replaces the marker when the specification arrives and needs no interface change, because
   * `number` is optional on `RowItem` (AAP 0.4.3).
   */
  controls: RowItem[];
  /**
   * A4's ten questions and answers.
   *
   * These are this page's own ten, not the site's shared six-question block: the module imports the
   * `FaqItem` type only and never the `faq` array, so the two blocks cannot be confused or merged
   * (AAP 0.8.2).
   */
  faq: FaqItem[];
  /**
   * A4's limits statement — the plain statement of what the controls do not cover, set above the
   * pilot band and rendered as body text rather than as decoration (AAP 0.8.1, Rule B-3).
   */
  limits: string;
  /**
   * The pilot band, imported from `shared/pilot.ts`: the home page, the Site Intelligence page and
   * this page render one band from one definition, so `Day 1`, `Day 20`, `Day 90` and the enquiry
   * link exist in that module alone (AAP A-4, 0.6.2, 0.7.2).
   */
  pilot: PilotBandCopy;
}

/**
 * A4's copy for `/sovereignty`.
 *
 * The content specification holding A4 was not available to this build: it was searched for in the
 * repository, in the git history, in the task's attachment directory and across the host, and it is
 * absent, as is the research document whose appendix reproduces it. No string may be reconstructed
 * from the build prompt, from the plan's quotations or from the template, so every value A4 owns
 * carries the project's placeholder marker verbatim instead of invented, borrowed or guessed copy
 * (AAP 0.7.7; Rules W-1, B-4). The marker is the owner's input, not copy: `scripts/launch-check.ts`
 * refuses to let a live build publish it (AAP 0.9.5, WT-10), so this page builds complete, renders
 * honestly, and cannot be published until A4's text arrives. Replacing a marker with real copy
 * needs no change to any component.
 *
 * Five values carry no marker, because the plan itself fixes them and none is copy A4 owns: the
 * top status label (AAP 0.7.5), the ten row status labels (the A0 label in `global.ts`), the `top`
 * panel (AAP 0.2.4), the wordmark switch the page-top hero sets (AAP 0.2.2, 0.8.1) and the pilot
 * band (imported). The counts are fixed too — ten controls, ten questions — so the page's structure
 * survives the copy edit: exactly one marker is replaced per field, and WT-14 keeps asserting ten
 * controls, each with its status label, plus the limits statement, so the added numbers change
 * nothing it measures.
 */
export const sovereignty: SovereigntyCopy = {
  meta: {
    title: "TO BE PROVIDED",
    description: "TO BE PROVIDED",
  },
  hero: {
    heading: "TO BE PROVIDED",
    text: "TO BE PROVIDED",
    illustration: "top",
    statusLabel: "Design intent, checked at each deployment",
    wordmark: true,
  },
  controls: [
    {
      number: "TO BE PROVIDED",
      title: "TO BE PROVIDED",
      line: "TO BE PROVIDED",
      statusLabel: global.status.sovereignty,
    },
    {
      number: "TO BE PROVIDED",
      title: "TO BE PROVIDED",
      line: "TO BE PROVIDED",
      statusLabel: global.status.sovereignty,
    },
    {
      number: "TO BE PROVIDED",
      title: "TO BE PROVIDED",
      line: "TO BE PROVIDED",
      statusLabel: global.status.sovereignty,
    },
    {
      number: "TO BE PROVIDED",
      title: "TO BE PROVIDED",
      line: "TO BE PROVIDED",
      statusLabel: global.status.sovereignty,
    },
    {
      number: "TO BE PROVIDED",
      title: "TO BE PROVIDED",
      line: "TO BE PROVIDED",
      statusLabel: global.status.sovereignty,
    },
    {
      number: "TO BE PROVIDED",
      title: "TO BE PROVIDED",
      line: "TO BE PROVIDED",
      statusLabel: global.status.sovereignty,
    },
    {
      number: "TO BE PROVIDED",
      title: "TO BE PROVIDED",
      line: "TO BE PROVIDED",
      statusLabel: global.status.sovereignty,
    },
    {
      number: "TO BE PROVIDED",
      title: "TO BE PROVIDED",
      line: "TO BE PROVIDED",
      statusLabel: global.status.sovereignty,
    },
    {
      number: "TO BE PROVIDED",
      title: "TO BE PROVIDED",
      line: "TO BE PROVIDED",
      statusLabel: global.status.sovereignty,
    },
    {
      number: "TO BE PROVIDED",
      title: "TO BE PROVIDED",
      line: "TO BE PROVIDED",
      statusLabel: global.status.sovereignty,
    },
  ],
  faq: [
    { question: "TO BE PROVIDED", answer: "TO BE PROVIDED" },
    { question: "TO BE PROVIDED", answer: "TO BE PROVIDED" },
    { question: "TO BE PROVIDED", answer: "TO BE PROVIDED" },
    { question: "TO BE PROVIDED", answer: "TO BE PROVIDED" },
    { question: "TO BE PROVIDED", answer: "TO BE PROVIDED" },
    { question: "TO BE PROVIDED", answer: "TO BE PROVIDED" },
    { question: "TO BE PROVIDED", answer: "TO BE PROVIDED" },
    { question: "TO BE PROVIDED", answer: "TO BE PROVIDED" },
    { question: "TO BE PROVIDED", answer: "TO BE PROVIDED" },
    { question: "TO BE PROVIDED", answer: "TO BE PROVIDED" },
  ],
  limits: "TO BE PROVIDED",
  pilot,
};
