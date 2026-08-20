/**
 * lockfileParser.js
 *
 * Turns an npm `package-lock.json` into a flat, de-duplicated list of
 * { name, version, isDirect } for the FULLY RESOLVED dependency tree.
 *
 * Why the lockfile and not package.json?
 *   package.json lists ranges ("^4.17.0") and only *direct* deps.
 *   The lockfile pins EXACT versions of the entire transitive tree —
 *   which is what actually matters for a security scan. A vulnerable
 *   package is usually somewhere deep in the transitive tree, not in
 *   your direct dependencies.
 *
 * npm lockfiles come in two shapes:
 *   - lockfileVersion 2/3 → top-level "packages" map (modern, preferred)
 *   - lockfileVersion 1   → nested "dependencies" tree (legacy)
 * We support both.
 */

/**
 * Parse a package-lock.json (already JSON-parsed into an object).
 * @param {object} lock - parsed package-lock.json contents
 * @returns {{name: string, version: string, isDirect: boolean}[]}
 */
export function parseNpmLockfile(lock) {
  if (!lock || typeof lock !== "object") {
    throw new Error("Invalid lockfile: not an object");
  }

  // Modern format (lockfileVersion 2 or 3): flat "packages" map.
  if (lock.packages && typeof lock.packages === "object") {
    return parseModernPackages(lock.packages);
  }

  // Legacy format (lockfileVersion 1): nested "dependencies" tree.
  if (lock.dependencies && typeof lock.dependencies === "object") {
    return dedupe(parseLegacyDependencies(lock.dependencies));
  }

  throw new Error(
    "Unrecognized lockfile shape: expected a 'packages' or 'dependencies' key"
  );
}

/**
 * Modern lockfile (v2/v3). Keys look like:
 *   ""                                  → the root project itself (skip)
 *   "node_modules/lodash"               → a dependency
 *   "node_modules/a/node_modules/b"     → a nested dependency
 */
function parseModernPackages(packages) {
  const out = [];

  for (const [path, meta] of Object.entries(packages)) {
    // "" is the root project — not a dependency, skip it.
    if (path === "") continue;
    // Only care about entries under node_modules.
    if (!path.includes("node_modules/")) continue;
    if (!meta || !meta.version) continue;

    // The package name is everything after the LAST "node_modules/".
    const name = path.slice(path.lastIndexOf("node_modules/") + "node_modules/".length);

    // A dependency is "direct" if it lives at the top level:
    // exactly "node_modules/<name>" with no further nesting.
    const isDirect = path === `node_modules/${name}`;

    out.push({ name, version: meta.version, isDirect });
  }

  return dedupe(out);
}

/**
 * Legacy lockfile (v1). Recursively walk the nested "dependencies" tree.
 * @param {object} deps
 * @param {boolean} isTopLevel
 */
function parseLegacyDependencies(deps, isTopLevel = true) {
  const out = [];

  for (const [name, meta] of Object.entries(deps)) {
    if (!meta || !meta.version) continue;

    out.push({ name, version: meta.version, isDirect: isTopLevel });

    // Nested dependencies of this package are transitive (not direct).
    if (meta.dependencies && typeof meta.dependencies === "object") {
      out.push(...parseLegacyDependencies(meta.dependencies, false));
    }
  }

  return out;
}

/**
 * De-duplicate by name@version. If the same package+version appears both
 * as direct and transitive, keep it marked direct (direct wins).
 */
function dedupe(list) {
  const map = new Map();

  for (const item of list) {
    const key = `${item.name}@${item.version}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, item);
    } else if (item.isDirect && !existing.isDirect) {
      map.set(key, item); // upgrade to direct
    }
  }

  return [...map.values()];
}
