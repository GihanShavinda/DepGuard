# DepGuard — Web Dashboard (Angular)

The frontend for DepGuard. Paste a `package-lock.json`, run an inspection, and
see a graded report of known vulnerabilities.

Built with Angular 19 (standalone components, signals). Runs on Node 20+.

## Setup

```powershell
cd web
npm install
```

## Run

Make sure the backend is up first (in separate terminals):

- Parser service: `npm start` in `parser/`  (port 3001)
- Laravel API:    `php artisan serve` in `api/`  (port 8000)

Then start the dashboard:

```powershell
npm start
```

Open http://localhost:4200. Paste a lockfile (or use `parser/test/fixtures/modern-lock.json`)
and click **Run inspection**.

## IMPORTANT: enable CORS on the API (one-time)

The browser blocks the dashboard (localhost:4200) from calling the API
(localhost:8000) unless Laravel allows it. Copy the provided CORS config into
your API:

1. Copy `cors.php` (in this bundle's `_extras/` folder) to `api/config/cors.php`.
2. In `api/`, run: `php artisan config:clear`
3. Restart `php artisan serve`.

Without this you'll see the scan fail with a network/CORS error in the browser
console even though the API itself works via curl.

## Where the API URL is configured

`src/environments/environment.ts` → `apiUrl`. Defaults to
`http://localhost:8000/api`. Change it if your API runs elsewhere.

## Structure

```
src/app/
  app.component.ts       state + grade logic (signals)
  app.component.html     intake form + report view
  app.component.scss     the "diagnostic report" styling
  services/scan.service.ts   HTTP calls to the API
  models/scan.model.ts       response types
  app.config.ts          provides HttpClient
src/environments/
  environment.ts         API base URL
```

## What it shows

- An overall letter grade (A–F) derived from the worst severity found.
- Each vulnerable package with its findings: severity badge, CVE/GHSA id
  (links to osv.dev), CVSS score, and a remediation hint ("upgrade to X").
- Direct vs transitive tags, and a count of packages that came back clean.
```
