/**
 * manifestRouter.js
 *
 * Takes the RAW TEXT of any supported manifest, detects which ecosystem it
 * belongs to, parses it, and returns { ecosystem, dependencies }.
 *
 * Supported:
 *   npm        — package-lock.json, package.json          (JSON)
 *   Packagist  — composer.lock, composer.json             (JSON)
 *   PyPI       — requirements.txt, poetry.lock, Pipfile.lock
 *   RubyGems   — Gemfile.lock
 *   Go         — go.mod, go.sum
 *   crates.io  — Cargo.lock
 *
 * We detect by content shape, not filename, so the frontend can send raw text
 * without telling us the type. An optional `hint` (the filename) is used to
 * disambiguate when shapes are ambiguous.
 */

import { parseNpmLockfile } from './lockfileParser.js';
import { parseComposerLock } from './composerParser.js';
import { parsePython } from './pythonParser.js';
import { parseGemfileLock } from './rubyParser.js';
import { parseGo } from './goParser.js';
import { parseCargoLock } from './rustParser.js';

/**
 * @param {string} text  raw file contents
 * @param {string} [hint] optional filename to help disambiguate
 * @returns {{ecosystem: string, dependencies: {name,version,isDirect}[]}}
 */
export function routeManifest(text, hint = '') {
  const t = (text || '').trim();
  if (!t) throw new Error('Empty manifest');

  const name = (hint || '').toLowerCase();

  // 1) Filename hints first (most reliable when present).
  if (name.endsWith('gemfile.lock')) return ruby(text);
  if (name === 'cargo.lock' || name.endsWith('/cargo.lock')) return rust(text);
  if (name.endsWith('go.mod') || name.endsWith('go.sum')) return go(text);
  if (name.endsWith('requirements.txt') || name.endsWith('poetry.lock') || name.endsWith('pipfile.lock')) return python(text);
  if (name.endsWith('composer.lock') || name.endsWith('composer.json')) return composer(text);
  if (name.endsWith('package-lock.json') || name.endsWith('package.json')) return npm(text);

  // 2) No usable hint — detect by content.

  // TOML-ish lockfiles
  if (/\[\[package\]\]/.test(t)) {
    // Both poetry.lock and Cargo.lock use [[package]]. Distinguish:
    // Cargo blocks have source = "registry+https://github.com/rust-lang/...";
    // poetry blocks have category / python-versions / optional.
    if (/crates\.io|rust-lang|registry\+https/.test(t)) return rust(text);
    if (/category\s*=|python-versions|optional\s*=/.test(t)) return python(text);
    // default TOML [[package]] to rust
    return rust(text);
  }

  // Ruby Gemfile.lock
  if (/^GEM$/m.test(t) && /specs:/.test(t)) return ruby(text);

  // Go
  if (/\bh1:/.test(t) || /^\s*module\s+\S+/m.test(t) || /require\s*\(/.test(t)) return go(text);

  // JSON files (npm / composer / Pipfile.lock)
  if (t.startsWith('{')) {
    let json;
    try { json = JSON.parse(t); } catch { throw new Error('Invalid JSON manifest'); }
    if (json.default || json.develop) return python(text);                 // Pipfile.lock
    if (Array.isArray(json.packages) || json['content-hash'] || isComposerJson(json)) return composer(text);
    // npm: lockfileVersion, packages map, or dependencies/require... 
    return npm(text);
  }

  // requirements.txt (pip freeze) — lines like name==1.2.3
  if (/^[A-Za-z0-9._-]+\s*==/m.test(t)) return python(text);

  throw new Error('Unrecognized manifest format');
}

// --- wrappers (each returns {ecosystem, dependencies}) ---

function npm(text) {
  return { ecosystem: 'npm', dependencies: parseNpmLockfile(JSON.parse(text)) };
}
function composer(text) {
  return { ecosystem: 'Packagist', dependencies: parseComposerLock(JSON.parse(text)) };
}
function python(text) {
  return { ecosystem: 'PyPI', dependencies: parsePython(text) };
}
function ruby(text) {
  return { ecosystem: 'RubyGems', dependencies: parseGemfileLock(text) };
}
function go(text) {
  return { ecosystem: 'Go', dependencies: parseGo(text) };
}
function rust(text) {
  return { ecosystem: 'crates.io', dependencies: parseCargoLock(text) };
}

function isComposerJson(json) {
  const req = json.require && typeof json.require === 'object' && !Array.isArray(json.require);
  const dev = json['require-dev'] && typeof json['require-dev'] === 'object';
  if (!(req || dev)) return false;
  const block = json.require || json['require-dev'] || {};
  return Object.keys(block).some((k) => k.includes('/') && k !== 'php' && !k.startsWith('ext-'));
}
