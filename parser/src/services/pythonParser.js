/**
 * pythonParser.js
 *
 * Parses Python dependency files into { name, version, isDirect }.
 * Supports:
 *   - requirements.txt   (pip freeze style: "package==1.2.3")
 *   - poetry.lock        (TOML-ish [[package]] blocks)
 *   - Pipfile.lock       (JSON, {"default": {...}, "develop": {...}})
 *
 * OSV ecosystem name: "PyPI".
 */

/**
 * @param {string} text  raw file contents
 * @returns {{name,version,isDirect}[]}
 */
export function parsePython(text) {
  const trimmed = text.trim();

  // Pipfile.lock is JSON
  if (trimmed.startsWith('{')) {
    return parsePipfileLock(trimmed);
  }
  // poetry.lock has [[package]] blocks
  if (trimmed.includes('[[package]]')) {
    return parsePoetryLock(text);
  }
  // otherwise treat as requirements.txt
  return parseRequirementsTxt(text);
}

function parseRequirementsTxt(text) {
  const out = [];
  const seen = new Set();
  for (let line of text.split('\n')) {
    line = line.trim();
    if (!line || line.startsWith('#') || line.startsWith('-')) continue; // comments, -r, -e, flags
    // strip inline comments and environment markers
    line = line.split('#')[0].split(';')[0].trim();
    // match "name==1.2.3" (only pinned versions are useful for scanning)
    const m = line.match(/^([A-Za-z0-9._-]+)\s*==\s*([0-9][0-9A-Za-z.+!-]*)/);
    if (!m) continue;
    const name = normalizePyName(m[1]);
    const version = m[2];
    const key = `${name}@${version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, version, isDirect: true });
  }
  return out;
}

function parsePoetryLock(text) {
  const out = [];
  const seen = new Set();
  // Split into [[package]] blocks, pull name + version from each.
  const blocks = text.split('[[package]]').slice(1);
  for (const block of blocks) {
    const nameM = block.match(/name\s*=\s*"([^"]+)"/);
    const verM = block.match(/version\s*=\s*"([^"]+)"/);
    const catM = block.match(/category\s*=\s*"([^"]+)"/);
    if (!nameM || !verM) continue;
    const name = normalizePyName(nameM[1]);
    const version = verM[1];
    const isDirect = catM ? catM[1] === 'main' : true;
    const key = `${name}@${version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, version, isDirect });
  }
  return out;
}

function parsePipfileLock(jsonText) {
  let data;
  try { data = JSON.parse(jsonText); } catch { throw new Error('Invalid Pipfile.lock JSON'); }
  const out = [];
  const seen = new Set();
  const collect = (block, isDirect) => {
    if (!block || typeof block !== 'object') return;
    for (const [name, meta] of Object.entries(block)) {
      const ver = typeof meta?.version === 'string' ? meta.version.replace(/^==/, '') : null;
      if (!ver) continue;
      const n = normalizePyName(name);
      const key = `${n}@${ver}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ name: n, version: ver, isDirect });
    }
  };
  collect(data.default, true);
  collect(data.develop, false);
  return out;
}

// PyPI treats names case-insensitively and normalizes _ . to -.
function normalizePyName(n) {
  return n.toLowerCase().replace(/[_.]+/g, '-');
}
