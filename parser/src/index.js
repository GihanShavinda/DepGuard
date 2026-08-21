/**
 * index.js — DepGuard parser service entry point.
 *   POST /parse       — manifest (any of 6 ecosystems) -> dependency list
 *   POST /heuristics  — Trust Score signals (npm)
 *
 * Accepts both JSON and raw text bodies (text needed for go.mod, Gemfile.lock,
 * Cargo.lock which aren't JSON).
 */

import express from "express";
import parseRoute from "./routes/parse.js";
import heuristicsRoute from "./routes/heuristics.js";

const app = express();
const PORT = process.env.PORT || process.env.PARSER_PORT || 3001;

// Accept JSON and raw text (up to 10mb) — text/plain for non-JSON manifests.
app.use(express.json({ limit: "10mb" }));
app.use(express.text({ limit: "10mb", type: ["text/plain", "text/*"] }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "depguard-parser" });
});

app.use("/", parseRoute);
app.use("/", heuristicsRoute);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(PORT, () => {
  console.log(`depguard-parser listening on port ${PORT}`);
});
