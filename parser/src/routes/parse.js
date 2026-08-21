/**
 * routes/parse.js
 *
 * POST /parse
 * Accepts EITHER:
 *   - Content-Type: text/plain  → the raw manifest text (any ecosystem)
 *   - Content-Type: application/json with { "content": "<raw text>", "filename": "..." }
 *   - Content-Type: application/json with a raw JSON manifest (legacy: npm/composer)
 *
 * Returns: { ecosystem, count, dependencies: [{name, version, isDirect}] }
 */

import { Router } from 'express';
import { routeManifest } from '../services/manifestRouter.js';

const router = Router();

router.post('/parse', (req, res) => {
  let text = '';
  let hint = '';

  const body = req.body;

  if (typeof body === 'string') {
    // raw text/plain body
    text = body;
  } else if (body && typeof body === 'object') {
    if (typeof body.content === 'string') {
      // { content, filename } wrapper
      text = body.content;
      hint = body.filename || '';
    } else {
      // legacy: a raw JSON manifest object (npm/composer) — re-stringify
      text = JSON.stringify(body);
    }
  }

  if (!text.trim()) {
    return res.status(400).json({ error: 'Request must include manifest content (text or JSON).' });
  }

  try {
    const { ecosystem, dependencies } = routeManifest(text, hint);
    return res.json({ ecosystem, count: dependencies.length, dependencies });
  } catch (err) {
    return res.status(422).json({ error: 'Could not parse manifest', detail: err.message });
  }
});

export default router;
