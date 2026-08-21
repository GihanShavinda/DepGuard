/**
 * rustParser.js
 *
 * Parses Rust's Cargo.lock into { name, version, isDirect }.
 * OSV ecosystem name: "crates.io".
 *
 * Cargo.lock is TOML with repeated [[package]] blocks:
 *
 *   [[package]]
 *   name = "serde"
 *   version = "1.0.152"
 *   source = "registry+https://github.com/rust-lang/crates.io-index"
 *
 * Cargo.lock doesn't cleanly mark direct vs transitive (that's in Cargo.toml),
 * so we mark all as direct = true. Packages with no "source" are usually the
 * local workspace crates themselves — we skip those (not registry packages).
 */

export function parseCargoLock(text) {
  const out = [];
  const seen = new Set();

  const blocks = text.split('[[package]]').slice(1);
  for (const block of blocks) {
    const nameM = block.match(/name\s*=\s*"([^"]+)"/);
    const verM = block.match(/version\s*=\s*"([^"]+)"/);
    const hasSource = /source\s*=\s*"/.test(block);
    if (!nameM || !verM) continue;
    // Skip local/workspace crates (no source = not from crates.io).
    if (!hasSource) continue;
    const name = nameM[1];
    const version = verM[1];
    const key = `${name}@${version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, version, isDirect: true });
  }

  if (out.length === 0) {
    throw new Error('Unrecognized Cargo.lock: no registry packages found');
  }
  return out;
}
