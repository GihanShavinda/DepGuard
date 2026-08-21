<?php

namespace App\Jobs;

use App\Models\Scan;
use App\Services\OsvClient;
use App\Services\ParserClient;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use RuntimeException;
use Throwable;

/**
 * Runs a dependency scan in the background: parse -> OSV -> heuristics -> store.
 *
 * The HTTP request that creates the scan returns immediately with status
 * "processing"; this job does the slow work so the browser never waits on a
 * long request. The frontend polls GET /api/scans/{id} for the result.
 */
class ProcessScan implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    // Give the job plenty of time; a big tree hits OSV + registry.
    public int $timeout = 600;
    public int $tries = 1;

    public function __construct(
        public int $scanId,
        public string $content,
        public ?string $filename = null,
    ) {
    }

    public function handle(ParserClient $parser, OsvClient $osv): void
    {
        $scan = Scan::find($this->scanId);
        if (!$scan) {
            return;
        }

        // --- 1. Parse ---
        try {
            $result = $parser->parseManifest($this->content, $this->filename);
        } catch (RuntimeException $e) {
            $scan->update(['status' => 'failed', 'summary_counts' => ['error' => $e->getMessage()]]);
            return;
        }

        $dependencies = $result['dependencies'] ?? [];
        $ecosystem = $result['ecosystem'] ?? 'npm';
        $depList = array_map(
            fn ($d) => ['name' => $d['name'], 'version' => $d['version']],
            $dependencies
        );
        $heurList = array_map(
            fn ($d) => [
                'name'     => $d['name'],
                'version'  => $d['version'],
                'isDirect' => $d['isDirect'] ?? false,
            ],
            $dependencies
        );

        // --- 2. OSV (chunked inside the client) ---
        $osvFailed = false;
        $findingsByKey = [];
        try {
            $findingsByKey = $osv->scan($depList, $ecosystem);
        } catch (Throwable) {
            $osvFailed = true;
        }

        // --- 3. Heuristics (best-effort) ---
        // Trust Score heuristics rely on the npm registry, so they only
        // apply to npm packages. For Packagist (PHP), we still get full CVE
        // scanning via OSV; heuristics are simply skipped (honest scoping).
        $heuristics = [];
        if ($ecosystem === 'npm') {
            try {
                $heuristics = $parser->scoreHeuristics($heurList);
            } catch (Throwable) {
                $heuristics = [];
            }
        }

        // --- 4. Persist ---
        $vulnerableCount = 0;
        $suspiciousCount = 0;
        $cveTotal = 0;
        $heuristicTotal = 0;

        foreach ($dependencies as $dep) {
            $dependency = $scan->dependencies()->create([
                'name'      => $dep['name'],
                'version'   => $dep['version'],
                'is_direct' => $dep['isDirect'] ?? false,
            ]);

            $key = "{$dep['name']}@{$dep['version']}";

            $cveFindings = $findingsByKey[$key] ?? [];
            if (!empty($cveFindings)) {
                $vulnerableCount++;
            }
            foreach ($cveFindings as $f) {
                $dependency->findings()->create([
                    'type'          => 'cve',
                    'vuln_id'       => $f['id'],
                    'severity'      => $f['severity'] ?? 'Unknown',
                    'cvss_score'    => $f['cvss_score'] ?? null,
                    'title'         => $f['summary'] ?? null,
                    'fixed_version' => $f['fixed_version'] ?? null,
                    'url'           => $f['url'] ?? null,
                ]);
                $cveTotal++;
            }

            $score = $heuristics[$key] ?? null;
            if ($score) {
                $dependency->update([
                    'trust_score' => $score['score'] ?? null,
                    'trust_level' => $score['level'] ?? null,
                ]);
                if (($score['level'] ?? '') === 'suspicious') {
                    $suspiciousCount++;
                }
                foreach ($score['reasons'] ?? [] as $reason) {
                    $dependency->findings()->create([
                        'type'     => 'malicious_heuristic',
                        'vuln_id'  => $reason['code'] ?? null,
                        'severity' => $reason['severity'] ?? 'Low',
                        'title'    => $reason['message'] ?? null,
                    ]);
                    $heuristicTotal++;
                }
            }
        }

        $directCount = collect($dependencies)->where('isDirect', true)->count();

        $scan->update([
            'status'         => 'done',
            'ecosystem'      => $ecosystem,
            'summary_counts' => [
                'total'              => count($dependencies),
                'direct'             => $directCount,
                'vulnerable'         => $vulnerableCount,
                'suspicious'         => $suspiciousCount,
                'cve_findings'       => $cveTotal,
                'heuristic_findings' => $heuristicTotal,
                'osv_checked'        => !$osvFailed,
            ],
        ]);
    }

    /** If the job blows up entirely, mark the scan failed. */
    public function failed(?Throwable $e): void
    {
        $scan = Scan::find($this->scanId);
        if ($scan) {
            $scan->update([
                'status' => 'failed',
                'summary_counts' => ['error' => $e?->getMessage() ?? 'Scan job failed'],
            ]);
        }
    }
}
