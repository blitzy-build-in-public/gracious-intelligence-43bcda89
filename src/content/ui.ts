// src/content/ui.ts — A8's interface labels: the chrome copy that lives outside the
// global shell.
//
// Every user-visible string reaches a component as a prop, so `SkipLink.astro`,
// `MobileMenu.astro` and `Header.astro` carry none of these words themselves. This module
// is a leaf: it imports nothing, reads no configuration, and holds no URL.

/**
 * The interface labels A8 supplies for the site's chrome.
 *
 * Consumers map these onto their own props: `skipLink` is `SkipLink.astro`'s `label`, and
 * `menuOpen` / `menuClose` are `MobileMenu.astro`'s and `Header.astro`'s
 * `labels.open` / `labels.close`.
 */
export interface UiCopy {
  /** The skip link's label: the first focusable element on every page, targeting `#main`. */
  skipLink: string;
  /** The menu trigger's label while the menu is closed. */
  menuOpen: string;
  /** The menu trigger's label while the menu is open. */
  menuClose: string;
}

/**
 * A8's interface labels.
 *
 * The content specification was unreadable when this module was written and no label may
 * be invented, so all three values hold the launch guard's placeholder marker, which
 * `scripts/launch-check.ts` refuses to publish. That keeps a string which is not the
 * descriptive accessible name Rule B-3 requires off the live site until A8's own wording
 * replaces it here; no component changes when it does.
 */
export const ui: UiCopy = {
  skipLink: "TO BE PROVIDED",
  menuOpen: "TO BE PROVIDED",
  menuClose: "TO BE PROVIDED",
};
