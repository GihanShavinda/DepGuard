/**
 * index.js — DepGuard parser service entry point.
 *
 * A small Express service with one job (for now): turn a JS lockfile
 * into a flat dependency list. Laravel calls this over HTTP.
 */

import express from "express";
import parseRoute from "./routes/parse.js";

const app = express();
const PORT = process.env.PARSER_PORT || 3001;

// Lockfiles can be large — allow a generous JSON body limit.
app.use(express.json({ limit: "10mb" }));

// Health check — handy for Docker and for a quick "is it up?" curl.
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "depguard-parser" });
});

// Feature routes.
app.use("/", parseRoute);

// 404 fallback.
app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.listen(PORT, () => {
  console.log(`depguard-parser listening on port ${PORT}`);
});
