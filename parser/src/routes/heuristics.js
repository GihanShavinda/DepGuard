/**
 * routes/heuristics.js
 *
 * POST /heuristics
 * Body: { "dependencies": [{ "name": "...", "version": "..." }, ...] }
 * Returns: { "scores": { "name@version": { score, level, reasons[] }, ... } }
 *
 * Only packages with at least one triggered signal are returned. Anything
 * absent from `scores` is considered clean (Trust Score 100).
 */

import { Router } from 'express';
import { scoreAll } from '../services/trustScore.js';

const router = Router();

router.post('/heuristics', async (req, res) => {
  const deps = req.body?.dependencies;
  if (!Array.isArray(deps)) {
    return res.status(400).json({
      error: 'Body must include a "dependencies" array of {name, version}.',
    });
  }

  try {
    const scores = await scoreAll(deps);
    return res.json({ scores });
  } catch (err) {
    return res.status(500).json({ error: 'Heuristic scoring failed', detail: err.message });
  }
});

export default router;
