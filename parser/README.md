# DepGuard — Parser Service (Express)

Turns a JS lockfile into a flat, de-duplicated dependency list. Laravel calls
this over HTTP. Later it will also host the heuristic Trust Score signals.

## Requirements

- Node.js **20+** (uses native `fetch`, ES modules)

## Setup

```bash
npm install
```

## Run

```bash
npm start          # starts on PARSER_PORT (default 3001)
# or, auto-reload while developing:
npm run dev
```

## Endpoints

| Method | Path      | Purpose                                        |
|--------|-----------|------------------------------------------------|
| GET    | `/health` | Liveness check                                 |
| POST   | `/parse`  | Body = package-lock.json JSON → dependency list |

### Try it

With the server running:

```bash
# health
curl -s http://localhost:3001/health

# parse a modern (v3) lockfile
curl -s -X POST http://localhost:3001/parse \
  -H "Content-Type: application/json" \
  -d @test/fixtures/modern-lock.json

# parse a legacy (v1) lockfile
curl -s -X POST http://localhost:3001/parse \
  -H "Content-Type: application/json" \
  -d @test/fixtures/legacy-lock.json
```

Expected response shape:

```json
{
  "ecosystem": "npm",
  "count": 4,
  "dependencies": [
    { "name": "express", "version": "4.19.2", "isDirect": true },
    { "name": "cookie",  "version": "0.6.0",  "isDirect": false }
  ]
}
```

## Why the lockfile, not package.json?

`package.json` only lists direct dependencies as version *ranges*. The lockfile
pins the exact versions of the **entire transitive tree** — which is what
matters for a vulnerability scan, since most vulnerable packages sit deep in the
tree, not in your direct deps. The parser supports both modern (lockfileVersion
2/3, flat `packages` map) and legacy (lockfileVersion 1, nested `dependencies`)
formats.

## Structure

```
src/
  index.js               Express app + health check
  routes/
    parse.js             POST /parse — HTTP layer only
  services/
    lockfileParser.js    the real logic (parse + de-dupe)
test/
  fixtures/              sample lockfiles for manual testing
```
