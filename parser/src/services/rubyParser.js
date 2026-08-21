/**
 * rubyParser.js
 *
 * Parses Ruby's Gemfile.lock into { name, version, isDirect }.
 * OSV ecosystem name: "RubyGems".
 *
 * Gemfile.lock structure (relevant part):
 *
 *   GEM
 *     remote: https://rubygems.org/
 *     specs:
 *       actionpack (7.0.4)
 *         actionview (= 7.0.4)
 *       nokogiri (1.13.9)
 *
 *   DEPENDENCIES
 *     rails
 *     rspec
 *
 * The "specs:" section under GEM lists every resolved gem with its exact
 * version (indented 4 spaces = a gem; 6 spaces = that gem's sub-deps, which
 * we skip). The DEPENDENCIES section lists the direct ones.
 */

export function parseGemfileLock(text) {
  const lines = text.split('\n');
  const out = [];
  const seen = new Set();

  // 1) collect direct dep names from the DEPENDENCIES section
  const directNames = new Set();
  let inDeps = false;
  for (const line of lines) {
    if (/^DEPENDENCIES\s*$/.test(line)) { inDeps = true; continue; }
    if (inDeps) {
      if (/^\S/.test(line)) { inDeps = false; continue; } // next top-level section
      const m = line.trim().match(/^([A-Za-z0-9._-]+)/);
      if (m) directNames.add(m[1].toLowerCase());
    }
  }

  // 2) collect resolved gems from GEM > specs:
  let inSpecs = false;
  for (const line of lines) {
    if (/^\s{2}specs:\s*$/.test(line)) { inSpecs = true; continue; }
    if (inSpecs) {
      // a top-level section (no indent) ends the specs block
      if (/^\S/.test(line)) { inSpecs = false; continue; }
      // a gem line is indented exactly 4 spaces: "    name (1.2.3)"
      const m = line.match(/^ {4}([A-Za-z0-9._-]+) \(([^()]+)\)\s*$/);
      if (!m) continue; // 6-space lines (sub-deps) and blanks are skipped
      const name = m[1];
      // version may include platform e.g. "1.2.3-x86_64"; take the semver head
      const version = (m[2].match(/^[0-9][0-9A-Za-z.]*/) || [m[2]])[0];
      const key = `${name}@${version}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name, version, isDirect: directNames.has(name.toLowerCase()) });
    }
  }

  if (out.length === 0) {
    throw new Error("Unrecognized Gemfile.lock: no GEM specs found");
  }
  return out;
}
