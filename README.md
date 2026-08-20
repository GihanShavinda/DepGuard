# DepGuard

Supply-chain dependency scanner. Detects known vulnerabilities (via the [OSV](https://osv.dev) database) **and** flags suspicious / potentially malicious packages through behavioral heuristics — typosquatting, install-script hooks, and package immaturity — catching threats that have no CVE filed yet.

> Most scanners only look up known CVEs. The dangerous packages (xz, the steady wave of malicious npm/PyPI uploads) don't have CVEs *yet*. DepGuard adds a behavioral layer on top of the CVE lookup to surface those too.

**Stack:** Angular · Laravel · Express · Docker

---

## Architecture

Three services under one roof, talking over HTTP only:

| Service  | Tech    | Responsibility                                              |
|----------|---------|------------------------------------------------------------|
| `web/`   | Angular | Dashboard — submit a manifest, view graded results         |
| `api/`   | Laravel | The brain — auth, queue, database, orchestration, OSV calls |
| `parser/`| Express | Parses JS lockfiles + runs the heuristic Trust Score signals |

```
Angular (web)  ──HTTP──▶  Laravel (api)  ──HTTP──▶  Express (parser)
                              │
                              └──HTTP──▶  OSV API (osv.dev)
```

*(diagram to be replaced with a proper image later)*

---

## Trust Score (the differentiator)

Each dependency gets a 0–100 Trust Score blending:

- **Known CVEs** — severity/CVSS from OSV.
- **Typosquatting** — string distance vs. a list of popular package names.
- **Install-script hooks** — `pre/postinstall` scripts are how most npm malware executes.
- **Package immaturity** — very new, very low adoption, no repo link, recent maintainer change.

> Heuristic signals are **"suspicious, investigate"** — not proof of malware. The UI and reports frame them that way.

---

## Status

🚧 In development.

- [x] Step 1 — Root scaffold
- [ ] Step 2 — Parser service (`/parse`)
- [ ] Step 3 — Laravel API skeleton + DB
- [ ] Step 4 — OSV integration (spine works end to end)
- [ ] Step 5 — Angular skeleton + first screen
- [ ] Phase 2 — Queue, auth, caching
- [ ] Phase 3 — Trust Score + second ecosystem (Composer)
- [ ] Phase 4 — Polish, deploy, present

---

## Running locally

```bash
cp .env.example .env
docker compose up --build
```

*(services are wired into `docker-compose.yml` as they're built)*
