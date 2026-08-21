<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Talks to the OSV.dev vulnerability database.
 *
 * OSV is free, needs no API key, and is ecosystem-aware (npm, PyPI,
 * Packagist, Maven, ...). We use the two-step pattern OSV recommends:
 *
 *   1. POST /v1/querybatch  — send many {name,version,ecosystem} at once,
 *      get back just the vuln IDs per package (in the SAME order as input).
 *   2. GET  /v1/vulns/{id}  — fetch the full record (severity, summary,
 *      fixed version) ONLY for the packages that actually had hits.
 *
 * This keeps us fast: one batch call for the whole tree, then a handful
 * of detail calls only for the vulnerable minority.
 */
class OsvClient
{
    private string $baseUrl;

    public function __construct()
    {
        $this->baseUrl = rtrim(config('services.osv.url', 'https://api.osv.dev'), '/');
    }

    /**
     * Scan a list of dependencies for known vulnerabilities.
     *
     * @param array $dependencies  Each: ['name' => string, 'version' => string]
     * @param string $ecosystem    OSV ecosystem name, e.g. 'npm', 'Packagist'
     * @return array               Map keyed by "name@version" => array of findings.
     *                             Each finding: [id, summary, severity, cvss_score, fixed_version, url]
     *
     * @throws RuntimeException on network/API failure.
     */
    public function scan(array $dependencies, string $ecosystem = 'npm'): array
    {
        if (empty($dependencies)) {
            return [];
        }

        // --- Step 1: batch query -------------------------------------------
        $queries = array_map(fn ($dep) => [
            'version' => $dep['version'],
            'package' => ['name' => $dep['name'], 'ecosystem' => $ecosystem],
        ], $dependencies);

        try {
            $response = Http::timeout(30)
                ->acceptJson()
                ->post("{$this->baseUrl}/v1/querybatch", ['queries' => $queries]);
        } catch (\Throwable $e) {
            throw new RuntimeException("Could not reach OSV: {$e->getMessage()}");
        }

        if ($response->failed()) {
            throw new RuntimeException("OSV querybatch failed: HTTP {$response->status()}");
        }

        // results come back in the SAME order as our queries array.
        $results = $response->json('results', []);

        // --- Step 2: enrich only the packages that had hits ----------------
        // Collect unique vuln IDs so we never fetch the same record twice.
        $detailCache = [];   // id => detail array
        $findings = [];      // "name@version" => [finding, ...]

        foreach ($results as $i => $result) {
            $vulns = $result['vulns'] ?? [];
            if (empty($vulns)) {
                continue;
            }

            $dep = $dependencies[$i];
            $key = "{$dep['name']}@{$dep['version']}";
            $findings[$key] = [];

            foreach ($vulns as $vuln) {
                $id = $vuln['id'];

                if (!isset($detailCache[$id])) {
                    $detailCache[$id] = $this->fetchVulnDetail($id);
                }

                $findings[$key][] = $this->shapeFinding(
                    $detailCache[$id],
                    $id,
                    $dep['name']
                );
            }
        }

        return $findings;
    }

    /**
     * Fetch one full vulnerability record. Returns [] on failure so a single
     * bad fetch never sinks the whole scan.
     */
    private function fetchVulnDetail(string $id): array
    {
        try {
            $res = Http::timeout(15)->acceptJson()->get("{$this->baseUrl}/v1/vulns/{$id}");
            return $res->successful() ? $res->json() : [];
        } catch (\Throwable) {
            return [];
        }
    }

    /**
     * Reduce a full OSV record down to the fields we store/show.
     */
    private function shapeFinding(array $detail, string $id, string $packageName): array
    {
        return [
            'id'            => $id,
            'summary'       => $detail['summary'] ?? ($detail['details'] ?? null),
            'severity'      => $this->severityLabel($detail),
            'cvss_score'    => $this->cvssScore($detail),
            'fixed_version' => $this->firstFixedVersion($detail, $packageName),
            'url'           => "https://osv.dev/vulnerability/{$id}",
        ];
    }

    /**
     * OSV puts CVSS vectors in a `severity` array. We pull the first numeric
     * score if present; label buckets follow common CVSS v3 bands.
     */
    private function cvssScore(array $detail): ?float
    {
        $sev = $detail['severity'] ?? [];
        foreach ($sev as $entry) {
            // entry looks like ['type' => 'CVSS_V3', 'score' => 'CVSS:3.1/AV:N/...']
            // The score string is a vector, not a number, so we can't always
            // derive a float without a CVSS parser. Many records also expose
            // database_specific severity — fall back to null when unknown.
            if (isset($entry['score']) && is_numeric($entry['score'])) {
                return (float) $entry['score'];
            }
        }
        return null;
    }

    private function severityLabel(array $detail): string
    {
        // Prefer an explicit database_specific severity if provided.
        $label = $detail['database_specific']['severity'] ?? null;
        if (is_string($label) && $label !== '') {
            return ucfirst(strtolower($label));
        }
        return 'Unknown';
    }

    /**
     * Find the first "fixed" version for this package from the affected ranges.
     * Powers the "upgrade to X" remediation hint.
     */
    private function firstFixedVersion(array $detail, string $packageName): ?string
    {
        foreach ($detail['affected'] ?? [] as $affected) {
            $name = $affected['package']['name'] ?? null;
            if ($name !== $packageName) {
                continue;
            }
            foreach ($affected['ranges'] ?? [] as $range) {
                foreach ($range['events'] ?? [] as $event) {
                    if (isset($event['fixed'])) {
                        return $event['fixed'];
                    }
                }
            }
        }
        return null;
    }
}
