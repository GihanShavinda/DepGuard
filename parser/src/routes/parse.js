/**
 * routes/parse.js
 *
 * POST /parse
 * Body: the raw contents of a package-lock.json (as JSON).
 * Returns: { ecosystem, count, dependencies: [{name, version, isDirect}] }
 *
 * The route is thin on purpose: it only handles HTTP concerns
 * (read body, validate, call the service, shape the response, handle errors).
 * All real logic lives in services/lockfileParser.js.
 */

import { Router } from "express";
import { parseNpmLockfile } from "../services/lockfileParser.js";

const router = Router();

router.post("/parse", (req, res) => {
  const lock = req.body;

  // Basic validation — did we actually get a lockfile-shaped object?
  if (!lock || typeof lock !== "object" || Array.isArray(lock)) {
    return res.status(400).json({
      error: "Request body must be the JSON contents of a package-lock.json",
    });
  }

  try {
    const dependencies = parseNpmLockfile(lock);
    return res.json({
      ecosystem: "npm",
      count: dependencies.length,
      dependencies,
    });
  } catch (err) {
    // A parse failure is the client's bad input, not a server fault → 422.
    return res.status(422).json({
      error: "Could not parse lockfile",
      detail: err.message,
    });
  }
});

export default router;
