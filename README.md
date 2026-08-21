# DepGuard

**A supply-chain dependency scanner that catches threats before they get a CVE.**

DepGuard detects known vulnerabilities (via the [OSV](https://osv.dev) database) **and** flags suspicious / potentially malicious packages through behavioral heuristics — typosquatting, install-script hooks, and package immaturity — catching threats that have no CVE filed yet.

> Most scanners only look up known CVEs. But the dangerous packages — the xz backdoor, the steady wave of malicious npm/PyPI uploads — don't have CVEs *yet*. A CVE-lookup tool is blind to them by definition. DepGuard adds a behavioral layer on top of the CVE lookup to surface those too.

Scans **six ecosystems** — npm, PHP, Python, Ruby, Go, and Rust — auto-detecting each from the manifest.

**Stack:** Angular · Laravel · Express · OSV · Docker

---

## Architecture

Three services under one roof, communicating over HTTP only:

| Service   | Tech    | Responsibility                                                |
|-----------|---------|---------------------------------------------------------------|
| `web/`    | Angular | Dashboard — submit a manifest, view the graded, filterable report |
| `api/`    | Laravel | The brain — database, queue, orchestration, scan logic, OSV calls |
| `parser/` | Express | Parses lockfiles for all six ecosystems + runs Trust Score signals |

```
Angular (web)  ──HTTP──▶  Laravel (api)  ──HTTP──▶  Express (parser)
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
         OSV API (osv.dev)            npm registry
        (known CVEs)                 (package metadata)
```

**Scan flow:** a manifest is submitted → Laravel creates a scan and dispatches a background job → the Express parser resolves the dependency tree → Laravel queries OSV for CVEs and (for npm) requests Trust Score signals → results are stored → the dashboard polls until the scan is done and renders the report.

---

## Supported ecosystems

| Ecosystem | Files accepted                              | OSV name    |
|-----------|---------------------------------------------|-------------|
| npm       | `package-lock.json`, `package.json`         | npm         |
| PHP       | `composer.lock`, `composer.json`            | Packagist   |
| Python    | `requirements.txt`, `poetry.lock`, `Pipfile.lock` | PyPI  |
| Ruby      | `Gemfile.lock`                              | RubyGems    |
| Go        | `go.mod`, `go.sum`                          | Go          |
| Rust      | `Cargo.lock`                                | crates.io   |

> **Prefer the lockfile.** Lockfiles (`package-lock.json`, `composer.lock`, `Gemfile.lock`, `go.sum`, `Cargo.lock`, `poetry.lock`) pin the exact versions of the entire transitive tree — the accurate basis for a security scan. Plain manifests give direct dependencies only.

---

## Trust Score (the differentiator)

Every package gets a **0–100 Trust Score** from signals that don't require a CVE to exist:

- **Typosquatting** — edit distance vs. a list of popular package names (`loadsh` → `lodash`).
- **Install-script hooks** — `pre`/`postinstall` scripts are how most npm malware executes.
- **Package immaturity** — very new, very low adoption, no source repository, single maintainer.

The score starts at 100 and subtracts weighted penalties, so every number is explainable.

> Heuristic signals are **"suspicious, investigate"** — not proof of malware. The UI and reports frame them that way. CVE scanning covers all six ecosystems; the Trust Score heuristics are scoped to npm, where their data source (the npm registry) is valid.

---

## Features

- Full **transitive dependency tree** resolution (npm lockfile v1/v2/v3, and the other five formats).
- **Known-CVE scanning** via OSV with severity, CVSS, and remediation (“upgrade to 4.17.21”). OSV calls are **chunked** to scale to large trees.
- **Trust Score** behavioral risk scoring, with registry lookups run in **parallel batches and capped** so a 1,000+ package tree scores in under a second.
- **Async job processing**: large scans run as a queued background job with a polling API — the right pattern for work too slow for a single request.
- A graded **A–F report** with a severity chart, **filters** (by type and severity), **JSON export**, and copy-ready upgrade commands per ecosystem.
- A dark, HUD-inspired interface tuned to read as a professional security tool.

---

## Status

- [x] Parser service (npm lockfile → dependency tree)
- [x] Laravel API + database
- [x] OSV integration (real CVE scanning)
- [x] Angular dashboard (graded report)
- [x] Trust Score behavioral heuristics
- [x] Performance optimization (parallel/capped lookups, chunked OSV)
- [x] Async background jobs + polling API
- [x] Dashboard features (severity chart, filters, export)
- [x] Multi-ecosystem: npm, PHP, Python, Ruby, Go, Rust
- [x] Cyber / HUD interface
- [ ] Public deployment (live URL)

---

## Running locally

Requires **Node 20+**, **PHP 8.2+**, and **Composer**. Each service runs in its own terminal.

```bash
# 1. Parser (Express)
cd parser && npm install && npm start          # → http://localhost:3001

# 2. API (Laravel)
cd api && composer install
cp .env.example .env && php artisan key:generate
php artisan migrate
php artisan serve                              # → http://localhost:8000

# 3. Queue worker (required for async scans)
cd api && php artisan queue:work --timeout=600

# 4. Dashboard (Angular)
cd web && npm install && npm start             # → http://localhost:4200
```

Open <http://localhost:4200>, paste a lockfile from any supported ecosystem, and run an inspection.

> **Note:** the queue worker (terminal 3) must be running, or scans stay stuck on “processing.” Set `QUEUE_CONNECTION=database` in `api/.env` and run `php artisan queue:table && php artisan migrate` once to create the jobs table.

---

## Key engineering decisions

- **Lockfile over manifest** — resolves the full transitive tree, because vulnerable code usually hides deep in the tree, not in direct dependencies.
- **Polyglot microservice split** — JavaScript ecosystem parsing lives in Node; Laravel owns orchestration and security logic. Each service is independently replaceable.
- **Explainable Trust Score** — weighted penalties, no opaque ML; every number is defensible.
- **Async by design** — a queued background job with a polling API permanently solves timeouts on large trees.
- **Honest scoping** — CVE scanning everywhere; behavioral heuristics only where their data source is valid, rather than faked across ecosystems.

---

*Vulnerability data from [OSV.dev](https://osv.dev). Built with Angular, Laravel, and Express.*
