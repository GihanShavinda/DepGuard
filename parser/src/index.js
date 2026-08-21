/**
 * index.js — DepGuard parser service entry point.
 *
 * Two jobs:
 *   POST /parse       — turn a JS lockfile into a flat dependency list
 *   POST /heuristics  — score dependencies for supply-chain risk (Trust Score)
 */

import express from "express";
import parseRoute from "./routes/parse.js";
import heuristicsRoute from "./routes/heuristics.js";

const app = express();
const PORT = process.env.PARSER_PORT || 3001;

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
