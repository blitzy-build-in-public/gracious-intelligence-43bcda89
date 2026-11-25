// src/content/shared/actions.ts — A1's four actions, defined once.
//
// A copy module: strings and one exported const, with no markup, no logic and no configured
// value, so it stays identical in every build (Rule B-2). Its single import is a type, erased
// at build time, which keeps the A0 copy object in `global.ts` out of any bundle that needs only
// the shape.

import type { Item } from "../global.ts";

/**
 * The list type of A1's four actions, declared in this file so the module exports its object typed
 * by an interface of its own (AAP 0.8.2, 0.7.2). The `Item` primitive stays defined once in
 * `global.ts`, because every title-and-line pair on the site shares it (AAP 0.4.3).
 *
 * The type is structurally an `Item[]`, so both page modules that import the array and
 * `CategoryRows`' `RowItem[]` prop consume it unchanged (AAP 0.4.3, 0.6.2).
 */
export interface ActionList extends Array<Item> {}

/**
 * The four actions: the one definition of the row section the home page shows and the Site
 * Intelligence page shows again, and of the items the product-feature diagram carries in its
 * right-hand column (AAP 0.4.3, 0.7.2, 0.8.2). Pages import this array; none restates it, so the
 * four cannot drift between the two pages or between the row section and the diagram (A-4).
 *
 * The array holds the items alone. A1's four-actions heading lives in `home.ts`, because the same
 * string also titles the diagram's right-hand column (AAP 0.8.2).
 *
 * Each entry is an `Item` and nothing more: the four actions are rows carrying neither a number nor
 * a status label, unlike the ten sovereignty controls, and the optional fields on `RowItem` are what
 * let `CategoryRows.astro` accept this array unchanged (AAP 0.2.3, 0.6.2). These rows are not links,
 * so nothing here names a target (Rules B-1, B-4).
 *
 * The content specification that supplies each action's title and line is absent from this checkout,
 * so both fields hold the project's placeholder marker until it arrives: no action was invented and
 * none was borrowed from the template (Rules W-1, B-4), while `scripts/launch-check.ts` refuses to
 * let a live build publish the marker (AAP 0.7.7, 0.9.5, WT-10). The array keeps exactly four entries,
 * in A1's order, so the row rhythm and the copy-fidelity comparison hold once the copy replaces it
 * here and nowhere else.
 */
export const actions: ActionList = [
  { title: "TO BE PROVIDED", line: "TO BE PROVIDED" },
  { title: "TO BE PROVIDED", line: "TO BE PROVIDED" },
  { title: "TO BE PROVIDED", line: "TO BE PROVIDED" },
  { title: "TO BE PROVIDED", line: "TO BE PROVIDED" },
];
