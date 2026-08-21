/**
 * composerParser.js
 *
 * Parses a PHP `composer.lock` into a flat dependency list, mirroring the
 * shape the npm parser returns: { name, version, isDirect }.
 *
 * composer.lock structure:
 *   {
 *     "packages":     [ { "name": "vendor/pkg", "version": "1.2.3", ... }, ... ],  // prod
 *     "packages-dev": [ { "name": "...", "version": "..." }, ... ]                 // dev
 *   }
 *
 * Everything in composer.lock is already a resolved, exact version — good.
 * Composer versions sometimes carry a leading "v" (e.g. "v1.2.3"); OSV wants
 * the bare semver, so we strip it.
 *
 * "isDirect" isn't explicitly marked in composer.lock the way it is in an npm
 * tree, so we treat prod `packages` as the primary set. (A more precise
 * direct/transitive split would require reading composer.json too; we keep it
 * simple and honest here.)
 */

export function parseComposerLock(lock) {
  if (!lock || typeof lock !== 'object') {
    throw new Error('Invalid composer file: not an object');
  }

  // composer.json (has "require"/"require-dev" objects of name -> constraint).
  // Direct deps only, constraints stripped to a best-effort concrete version.
  if (isComposerJson(lock)) {
    return parseComposerJson(lock);
  }

  if (!Array.isArray(lock.packages) && !Array.isArray(lock['packages-dev'])) {
    throw new Error("Unrecognized composer file: expected 'packages' array or 'require' object");
  }

  const out = [];
  const seen = new Set();

  const collect = (arr, isDirect) => {
    if (!Array.isArray(arr)) return;
    for (const pkg of arr) {
      if (!pkg || !pkg.name || !pkg.version) continue;
      const name = pkg.name;
      const version = cleanVersion(pkg.version);
      if (!version) continue;
      const key = `${name}@${version}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, version, isDirect });
    }
  };

  collect(lock.packages, true);        // production deps
  collect(lock['packages-dev'], false); // dev deps

  return out;
}

/** "v1.2.3" -> "1.2.3"; leaves already-bare versions alone. */
function cleanVersion(v) {
  if (typeof v !== 'string') return null;
  const m = v.match(/(\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.-]+)?)/);
  return m ? m[1] : null;
}

/**
 * composer.json has "require" / "require-dev" as OBJECTS mapping
 * "vendor/pkg" -> version constraint string ("^11.0"). composer.lock uses
 * "packages" arrays instead. This distinguishes them.
 */
function isComposerJson(obj) {
  const reqIsObj = obj.require && typeof obj.require === 'object' && !Array.isArray(obj.require);
  const devIsObj = obj['require-dev'] && typeof obj['require-dev'] === 'object' && !Array.isArray(obj['require-dev']);
  // Must NOT be a lock (no packages array)
  const notLock = !Array.isArray(obj.packages) && !Array.isArray(obj['packages-dev']);
  return (reqIsObj || devIsObj) && notLock;
}

/**
 * Parse composer.json. Direct deps only; strip constraint operators to a
 * best-effort concrete version. Skips the "php" platform requirement and
 * any "ext-*" / "lib-*" platform packages (not real Packagist packages).
 */
function parseComposerJson(pkg) {
  const out = [];
  const seen = new Set();
  const collect = (block, isDirect) => {
    if (!block || typeof block !== 'object') return;
    for (const [name, constraint] of Object.entries(block)) {
      // skip platform requirements: php, ext-*, lib-*, composer-*
      if (name === 'php' || name.startsWith('ext-') || name.startsWith('lib-') || name.startsWith('composer')) continue;
      // must be a real vendor/package name
      if (!name.includes('/')) continue;
      const version = cleanVersion(constraint);
      if (!version) continue;
      const key = `${name}@${version}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, version, isDirect });
    }
  };
  collect(pkg.require, true);
  collect(pkg['require-dev'], false);
  return out;
}
