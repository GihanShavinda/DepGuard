/**
 * typosquat.js
 *
 * Flags dependency names that are suspiciously close to a popular package —
 * the classic typosquatting attack (e.g. "loadsh" impersonating "lodash",
 * "expres" for "express"). An attacker publishes the lookalike hoping you
 * mistype or misremember the real one.
 *
 * Method: edit distance (Levenshtein) against a bundled list of popular
 * names. A distance of 1–2 on a name that ISN'T itself in the list is the
 * red flag. Exact matches (the legit package) score 0 and are ignored.
 */

import { distance } from 'fastest-levenshtein';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const POPULAR = require('../../data/popular-packages.json');
const POPULAR_SET = new Set(POPULAR);

/**
 * @param {string} name  dependency name
 * @returns {null | { target: string, distance: number }}
 *          null if fine; otherwise the popular name it resembles.
 */
export function checkTyposquat(name) {
  // If the name IS a known-popular package, it's legitimate — never flag it.
  if (POPULAR_SET.has(name)) return null;

  // Ignore scoped internal-ish names for this particular check; a scope
  // (@org/pkg) is a different attack class (dependency confusion).
  const bare = name.startsWith('@') ? name.split('/').pop() : name;

  let best = null;
  for (const popular of POPULAR) {
    const d = distance(bare, popular);
    // Distance 1–2 and lengths similar enough to be a plausible typo.
    if (d >= 1 && d <= 2 && Math.abs(bare.length - popular.length) <= 2) {
      if (!best || d < best.distance) {
        best = { target: popular, distance: d };
      }
    }
  }

  // Distance 1 is a strong signal; distance 2 only if the name is long
  // enough that a 2-char difference isn't just coincidence on a short word.
  if (best) {
    if (best.distance === 1) return best;
    if (best.distance === 2 && bare.length >= 6) return best;
  }
  return null;
}
