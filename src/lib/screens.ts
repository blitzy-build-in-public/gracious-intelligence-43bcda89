import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** One of the owner's three product screens, named as its caption names it. */
export type ScreenKey = 'investigate' | 'compare' | 'audit';

/**
 * Published filename of each screen. `public/` is copied verbatim into the build, so a file present
 * at `public/screens/<name>` is served at `/screens/<name>` and one absent leaves that frame to its
 * fallback panel. These names are the fixed contract with the owner's supplied files: they are
 * declared once here and never derived from a caption.
 */
const SCREEN_FILES: Readonly<Record<ScreenKey, string>> = {
  investigate: 'investigate.png',
  compare: 'compare.png',
  audit: 'audit.png',
};

/**
 * Reports, at build time, which of the owner's three product screenshots are present in
 * `public/screens/`. A screen that is absent is a designed state rather than an error — the caller
 * renders that frame's neutral panel and keeps its caption — so this never throws and never
 * rejects, and it answers a fresh record on every call.
 */
export function screensPresent(): Record<ScreenKey, boolean> {
  return {
    investigate: hasScreen('investigate'),
    compare: hasScreen('compare'),
    audit: hasScreen('audit'),
  };
}

/**
 * Whether one screen file exists under `public/screens/`.
 *
 * `process.cwd()` is the project root under `astro build` and under every test-harness build, so it
 * only locates a file in the source tree; it reads no configuration, which is why this module takes
 * no value from `src/lib/env.ts`, the single reader of the configured variables.
 */
function hasScreen(screen: ScreenKey): boolean {
  try {
    return existsSync(resolve(process.cwd(), 'public', 'screens', SCREEN_FILES[screen]));
  } catch {
    // An unreadable folder or an unexpected working directory answers "not supplied": the frame
    // falls back to its panel, which is better than failing a build over an optional asset.
    return false;
  }
}
