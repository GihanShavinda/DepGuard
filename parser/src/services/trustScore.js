/**
 * trustScore.js
 *
 * Blends behavioral signals into a Trust Score (0–100) per package. HIGHER = safer.
 * SIGNALS, NOT PROOF: a low score means "investigate," never "this is malware."
 *
 * PERFORMANCE DESIGN (important for large lockfiles):
 *   A resolved Angular/React tree can have 1000+ packages. We must NOT make a
 *   slow registry call for every one, or the scan takes minutes and the browser
 *   times out. So we split the work:
 *
 *   Phase 1 — cheap, offline, ALL packages: typosquat name check. No network.
 *   Phase 2 — expensive, network, ONLY a shortlist: registry metadata lookups,
 *             run in parallel batches with a hard cap.
 *
 *   The shortlist = packages that already look interesting (typosquat hits) plus
 *   the DIRECT dependencies (the ones the developer actually chose). Deep
 *   transitive packages skip the registry call — they're usually well-known and
 *   checking 1000 of them adds minutes for little value.
 */

import { checkTyposquat } from './typosquat.js';
import { fetchRegistryMeta } from './registryClient.js';

const PENALTY = {
  typosquat: 55,
  installScript: 30,
  veryNew: 20,
  noRepository: 10,
  soloMaintainer: 5,
};

// Caps to keep large scans fast.
const MAX_REGISTRY_LOOKUPS = 150; // never hit the registry more than this many times
const BATCH = 20;                 // parallel lookups per batch

function levelFor(score) {
  if (score >= 80) return 'trusted';
  if (score >= 50) return 'caution';
  return 'suspicious';
}

/** Offline-only scoring: typosquat check. Returns partial result + whether a
 *  registry lookup is worth doing for this package. */
function scoreOffline(dep) {
  const reasons = [];
  let score = 100;

  const typo = checkTyposquat(dep.name);
  if (typo) {
    score -= PENALTY.typosquat;
    reasons.push({
      code: 'typosquat',
      severity: 'High',
      message: `Name closely resembles the popular package "${typo.target}" (edit distance ${typo.distance}). Possible typosquat — confirm you meant "${dep.name}".`,
    });
  }

  return { score, reasons, isTyposquat: !!typo };
}

/** Apply registry-metadata penalties on top of an offline result. */
function applyRegistry(base, meta) {
  let score = base.score;
  const reasons = [...base.reasons];

  if (meta) {
    if (meta.installScripts.length > 0) {
      score -= PENALTY.installScript;
      reasons.push({
        code: 'install_script',
        severity: 'High',
        message: `Declares install hook(s): ${meta.installScripts.join(', ')}. Install scripts run automatically on \`npm install\` and are the most common malware execution vector — review what they do.`,
      });
    }
    if (meta.ageDays != null && meta.ageDays <= 30) {
      score -= PENALTY.veryNew;
      reasons.push({
        code: 'very_new',
        severity: 'Moderate',
        message: `Latest version published ${meta.ageDays} day(s) ago. Very new packages have less community scrutiny.`,
      });
    }
    if (!meta.hasRepository) {
      score -= PENALTY.noRepository;
      reasons.push({
        code: 'no_repository',
        severity: 'Low',
        message: 'No source repository declared — provenance can\'t be inspected.',
      });
    }
    if (meta.maintainerCount === 1) {
      score -= PENALTY.soloMaintainer;
      reasons.push({
        code: 'solo_maintainer',
        severity: 'Low',
        message: 'Single maintainer — higher exposure to account-takeover supply-chain attacks.',
      });
    }
  }

  score = Math.max(0, Math.min(100, score));
  return { score, level: levelFor(score), reasons };
}

/**
 * Score a whole dependency list efficiently.
 * @param {{name,version,isDirect?}[]} dependencies
 * @returns {Promise<Object>} map "name@version" -> {score, level, reasons}
 */
export async function scoreAll(dependencies) {
  // --- Phase 1: offline pass over EVERY package (fast, no network) ---
  const offline = dependencies.map((dep) => ({ dep, base: scoreOffline(dep) }));

  // --- decide who gets a (slow) registry lookup ---
  // Priority: typosquat hits first, then direct deps, capped at MAX_REGISTRY_LOOKUPS.
  const shortlist = [];
  for (const item of offline) {
    if (item.base.isTyposquat) shortlist.push(item);
  }
  for (const item of offline) {
    if (shortlist.length >= MAX_REGISTRY_LOOKUPS) break;
    if (item.base.isTyposquat) continue; // already added
    if (item.dep.isDirect) shortlist.push(item);
  }
  // If still under cap, top up with remaining packages (transitive) until the cap.
  for (const item of offline) {
    if (shortlist.length >= MAX_REGISTRY_LOOKUPS) break;
    if (!shortlist.includes(item)) shortlist.push(item);
  }

  const shortlistSet = new Set(shortlist);
  const metaCache = new Map();

  // --- Phase 2: parallel batched registry lookups for the shortlist ---
  for (let i = 0; i < shortlist.length; i += BATCH) {
    const slice = shortlist.slice(i, i + BATCH);
    await Promise.all(
      slice.map(async (item) => {
        const meta = await fetchRegistryMeta(item.dep.name);
        metaCache.set(item.dep.name, meta);
      })
    );
  }

  // --- combine ---
  const out = {};
  for (const item of offline) {
    let result;
    if (shortlistSet.has(item)) {
      result = applyRegistry(item.base, metaCache.get(item.dep.name) ?? null);
    } else {
      // offline-only result (no registry penalties applied)
      const score = Math.max(0, Math.min(100, item.base.score));
      result = { score, level: levelFor(score), reasons: item.base.reasons };
    }
    if (result.reasons.length > 0) {
      out[`${item.dep.name}@${item.dep.version}`] = result;
    }
  }

  return out;
}

/** Kept for compatibility / single-package scoring (used by tests). */
export async function scoreDependency(dep, metaCache) {
  const base = scoreOffline(dep);
  let meta = metaCache.get(dep.name);
  if (meta === undefined) {
    meta = await fetchRegistryMeta(dep.name);
    metaCache.set(dep.name, meta);
  }
  return applyRegistry(base, meta);
}
