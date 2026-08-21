/**
 * registryClient.js
 *
 * Fetches package metadata from the public npm registry so we can reason
 * about a package's maturity and behavior:
 *   - when its latest version was published (brand-new = riskier)
 *   - whether it declares a source repository (none = opaque)
 *   - the number of maintainers (sudden solo maintainer can be a takeover)
 *   - whether the latest version declares pre/postinstall scripts
 *
 * The registry has no auth and permissive rate limits. We fetch one package
 * at a time but cache within a single scan run to avoid duplicate calls.
 */

const REGISTRY = 'https://registry.npmjs.org';

/**
 * @param {string} name
 * @returns {Promise<null | {
 *   latestVersion: string,
 *   publishedAt: string | null,   // ISO date of latest version
 *   ageDays: number | null,
 *   hasRepository: boolean,
 *   maintainerCount: number,
 *   installScripts: string[]      // names of pre/postinstall style hooks
 * }>}
 */
export async function fetchRegistryMeta(name) {
  let data;
  try {
    const res = await fetch(`${REGISTRY}/${encodeURIComponent(name)}`, {
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return null;
    data = await res.json();
  } catch {
    return null;
  }

  const latestVersion = data['dist-tags']?.latest ?? null;
  const timeMap = data.time ?? {};
  const publishedAt = latestVersion ? (timeMap[latestVersion] ?? null) : null;

  let ageDays = null;
  if (publishedAt) {
    const ms = Date.now() - new Date(publishedAt).getTime();
    ageDays = Math.floor(ms / (1000 * 60 * 60 * 24));
  }

  const versionMeta = latestVersion ? (data.versions?.[latestVersion] ?? {}) : {};
  const repo = versionMeta.repository ?? data.repository ?? null;
  const hasRepository = !!(repo && (typeof repo === 'string' || repo.url));

  const maintainers = data.maintainers ?? [];
  const maintainerCount = Array.isArray(maintainers) ? maintainers.length : 0;

  // Detect lifecycle install hooks on the latest version.
  const scripts = versionMeta.scripts ?? {};
  const HOOK_KEYS = ['preinstall', 'install', 'postinstall'];
  const installScripts = HOOK_KEYS.filter((k) => typeof scripts[k] === 'string' && scripts[k].trim() !== '');

  return {
    latestVersion,
    publishedAt,
    ageDays,
    hasRepository,
    maintainerCount,
    installScripts,
  };
}
