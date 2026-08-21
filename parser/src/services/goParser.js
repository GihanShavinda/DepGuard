/**
 * goParser.js
 *
 * Parses Go dependency files into { name, version, isDirect }.
 * OSV ecosystem name: "Go".
 *
 * Supports:
 *   - go.mod : the require(...) block, e.g.  require github.com/foo/bar v1.2.3
 *              direct deps are those NOT marked "// indirect".
 *   - go.sum : lines "module version hash" — the fully resolved set.
 *
 * go.mod is preferred (has the direct/indirect distinction). go.sum lists
 * every module (including multiple hash lines per version) so we de-dupe.
 * Go versions look like "v1.2.3" — OSV's Go ecosystem expects the leading "v".
 */

export function parseGo(text) {
  if (text.includes('go.sum') || /\bh1:/.test(text)) {
    // Heuristic: go.sum lines contain "h1:" hashes.
    return parseGoSum(text);
  }
  if (/^\s*module\s+/m.test(text) || /require\s*\(/.test(text) || /^\s*require\s+/m.test(text)) {
    return parseGoMod(text);
  }
  // fall back to go.sum style
  return parseGoSum(text);
}

function parseGoMod(text) {
  const out = [];
  const seen = new Set();
  const lines = text.split('\n');
  let inRequireBlock = false;

  const addLine = (line) => {
    // "github.com/foo/bar v1.2.3 // indirect"
    const m = line.match(/^\s*([^\s]+)\s+(v[0-9][^\s]*)(\s+\/\/\s*indirect)?/);
    if (!m) return;
    const name = m[1];
    const version = m[2];
    const isDirect = !m[3]; // no "// indirect" comment => direct
    const key = `${name}@${version}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name, version, isDirect });
  };

  for (let raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (/require\s*\(/.test(line)) { inRequireBlock = true; continue; }
    if (inRequireBlock) {
      if (line.trim() === ')') { inRequireBlock = false; continue; }
      addLine(line);
    } else if (/^\s*require\s+/.test(line)) {
      // single-line require: "require github.com/foo/bar v1.2.3"
      addLine(line.replace(/^\s*require\s+/, ''));
    }
  }
  return out;
}

function parseGoSum(text) {
  const out = [];
  const seen = new Set();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    // "module version h1:hash="  or  "module version/go.mod h1:hash="
    const m = line.match(/^([^\s]+)\s+(v[0-9][^\s]*?)(?:\/go\.mod)?\s+h1:/);
    if (!m) continue;
    const name = m[1];
    const version = m[2];
    const key = `${name}@${version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // go.sum doesn't distinguish direct/indirect; treat all as (unknown) direct.
    out.push({ name, version, isDirect: true });
  }
  if (out.length === 0) throw new Error('Unrecognized Go file: no modules found');
  return out;
}
