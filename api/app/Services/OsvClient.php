<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Talks to OSV.dev. Two-step pattern:
 *   1. POST /v1/querybatch  — many packages at once, returns vuln IDs per package
 *   2. GET  /v1/vulns/{id}  — full record only for the packages that had hits
 *
 * CHUNKING: OSV's batch endpoint accepts up to 1000 queries, but large trees
 * are more reliable (and kinder to the API) split into chunks. We send
 * CHUNK_SIZE packages per batch request and merge the results in order.
 */
class OsvClient
{
    private string $baseUrl;

    private const CHUNK_SIZE = 200;

    public function __construct()
    {
        $this->baseUrl = rtrim(config('services.osv.url', 'https://api.osv.dev'), '/');
    }

    /**
     * @param array $dependencies  each ['name'=>..., 'version'=>...]
     * @return array  "name@version" => [finding, ...]
     * @throws RuntimeException on network/API failure of the batch step.
     */
    public function scan(array $dependencies, string $ecosystem = 'npm'): array
    {
        if (empty($dependencies)) {
            return [];
        }

        $detailCache = [];   // vuln id => detail
        $findings = [];      // name@version => [finding,...]

        foreach (array_chunk($dependencies, self::CHUNK_SIZE) as $chunk) {
            $queries = array_map(fn ($dep) => [
                'version' => $dep['version'],
                'package' => ['name' => $dep['name'], 'ecosystem' => $ecosystem],
            ], $chunk);

            try {
                $response = Http::timeout(60)
                    ->acceptJson()
                    ->post("{$this->baseUrl}/v1/querybatch", ['queries' => $queries]);
            } catch (\Throwable $e) {
                throw new RuntimeException("Could not reach OSV: {$e->getMessage()}");
            }

            if ($response->failed()) {
                throw new RuntimeException("OSV querybatch failed: HTTP {$response->status()}");
            }

            $results = $response->json('results', []);

            foreach ($results as $i => $result) {
                $vulns = $result['vulns'] ?? [];
                if (empty($vulns)) {
                    continue;
                }
                $dep = $chunk[$i];
                $key = "{$dep['name']}@{$dep['version']}";
                $findings[$key] = [];

                foreach ($vulns as $vuln) {
                    $id = $vuln['id'];
                    if (!isset($detailCache[$id])) {
                        $detailCache[$id] = $this->fetchVulnDetail($id);
                    }
                    $findings[$key][] = $this->shapeFinding($detailCache[$id], $id, $dep['name']);
                }
            }
        }

        return $findings;
    }

    private function fetchVulnDetail(string $id): array
    {
        try {
            $res = Http::timeout(15)->acceptJson()->get("{$this->baseUrl}/v1/vulns/{$id}");
            return $res->successful() ? $res->json() : [];
        } catch (\Throwable) {
            return [];
        }
    }

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

    private function cvssScore(array $detail): ?float
    {
        foreach ($detail['severity'] ?? [] as $entry) {
            if (isset($entry['score']) && is_numeric($entry['score'])) {
                return (float) $entry['score'];
            }
        }
        return null;
    }

    private function severityLabel(array $detail): string
    {
        $label = $detail['database_specific']['severity'] ?? null;
        if (is_string($label) && $label !== '') {
            return ucfirst(strtolower($label));
        }
        return 'Unknown';
    }

    private function firstFixedVersion(array $detail, string $packageName): ?string
    {
        foreach ($detail['affected'] ?? [] as $affected) {
            if (($affected['package']['name'] ?? null) !== $packageName) {
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
