/**
 * index.js — DepGuard parser service entry point.
 *   POST /parse       — lockfile/package.json -> dependency list
 *   POST /heuristics  — Trust Score signals
 *
 * Listens on $PORT (cloud platforms set this) falling back to PARSER_PORT then 3001.
 */

import express from "express";
import parseRoute from "./routes/parse.js";
import heuristicsRoute from "./routes/heuristics.js";

const app = express();
const PORT = process.env.PORT || process.env.PARSER_PORT || 3001;

app.use(express.json({ limit: "10mb" }));

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
