<?php

namespace App\Http\Controllers;

use App\Models\Scan;
use App\Services\OsvClient;
use App\Services\ParserClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;
use Throwable;

/**
 * DEPLOYMENT NOTE:
 * This is the SYNCHRONOUS controller used for the free-tier live demo. It runs
 * parse -> OSV -> heuristics inline and returns the finished scan. It relies on
 * the optimized services (chunked OSV, capped/parallel heuristics) to stay fast.
 *
 * The async version (ProcessScan job + polling) is kept in the repo under
 * app/Jobs/ and is the recommended pattern for large trees in a real
 * deployment with an always-on queue worker. Free tiers can't run an always-on
 * worker reliably, so the live demo uses this synchronous path.
 */
class ScanController extends Controller
{
    public function __construct(
        private ParserClient $parser,
        private OsvClient $osv,
    ) {
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'lockfile'    => ['required', 'array'],
            'source_name' => ['nullable', 'string', 'max:255'],
        ]);

        $scan = Scan::create([
            'ecosystem'   => 'npm',
            'source_name' => $validated['source_name'] ?? null,
            'status'      => 'processing',
        ]);

        try {
            $result = $this->parser->parseLockfile($validated['lockfile']);
        } catch (RuntimeException $e) {
            $scan->update(['status' => 'failed', 'summary_counts' => ['error' => $e->getMessage()]]);
            return response()->json([
                'message' => 'Parsing failed',
                'error'   => $e->getMessage(),
                'scan_id' => $scan->id,
            ], 502);
        }

        $dependencies = $result['dependencies'] ?? [];
        $depList = array_map(fn ($d) => ['name' => $d['name'], 'version' => $d['version']], $dependencies);
        $heurList = array_map(fn ($d) => [
            'name' => $d['name'], 'version' => $d['version'], 'isDirect' => $d['isDirect'] ?? false,
        ], $dependencies);

        $osvFailed = false;
        $findingsByKey = [];
        try {
            $findingsByKey = $this->osv->scan($depList, 'npm');
        } catch (Throwable) {
            $osvFailed = true;
        }

        $heuristics = [];
        try {
            $heuristics = $this->parser->scoreHeuristics($heurList);
        } catch (Throwable) {
            $heuristics = [];
        }

        $vulnerableCount = 0; $suspiciousCount = 0; $cveTotal = 0; $heuristicTotal = 0;

        foreach ($dependencies as $dep) {
            $dependency = $scan->dependencies()->create([
                'name' => $dep['name'], 'version' => $dep['version'], 'is_direct' => $dep['isDirect'] ?? false,
            ]);
            $key = "{$dep['name']}@{$dep['version']}";

            $cveFindings = $findingsByKey[$key] ?? [];
            if (!empty($cveFindings)) $vulnerableCount++;
            foreach ($cveFindings as $f) {
                $dependency->findings()->create([
                    'type' => 'cve', 'vuln_id' => $f['id'], 'severity' => $f['severity'] ?? 'Unknown',
                    'cvss_score' => $f['cvss_score'] ?? null, 'title' => $f['summary'] ?? null,
                    'fixed_version' => $f['fixed_version'] ?? null, 'url' => $f['url'] ?? null,
                ]);
                $cveTotal++;
            }

            $score = $heuristics[$key] ?? null;
            if ($score) {
                $dependency->update(['trust_score' => $score['score'] ?? null, 'trust_level' => $score['level'] ?? null]);
                if (($score['level'] ?? '') === 'suspicious') $suspiciousCount++;
                foreach ($score['reasons'] ?? [] as $reason) {
                    $dependency->findings()->create([
                        'type' => 'malicious_heuristic', 'vuln_id' => $reason['code'] ?? null,
                        'severity' => $reason['severity'] ?? 'Low', 'title' => $reason['message'] ?? null,
                    ]);
                    $heuristicTotal++;
                }
            }
        }

        $directCount = collect($dependencies)->where('isDirect', true)->count();
        $scan->update([
            'status' => 'done',
            'summary_counts' => [
                'total' => count($dependencies), 'direct' => $directCount,
                'vulnerable' => $vulnerableCount, 'suspicious' => $suspiciousCount,
                'cve_findings' => $cveTotal, 'heuristic_findings' => $heuristicTotal,
                'osv_checked' => !$osvFailed,
            ],
        ]);

        return response()->json($scan->load('dependencies.findings'), 201);
    }

    public function show(Scan $scan): JsonResponse
    {
        return response()->json($scan->load('dependencies.findings'));
    }
}
