<?php

namespace App\Http\Controllers;

use App\Models\Scan;
use App\Services\OsvClient;
use App\Services\ParserClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class ScanController extends Controller
{
    public function __construct(
        private ParserClient $parser,
        private OsvClient $osv,
    ) {
    }

    /**
     * POST /api/scans
     * Body: { "source_name": "my-app", "lockfile": { ...package-lock.json... } }
     *
     * 1. Parse the lockfile via the Express service.
     * 2. Query OSV for known vulnerabilities across the dependency tree.
     * 3. Store the scan, its dependencies, and any findings.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'lockfile'    => ['required', 'array'],
            'source_name' => ['nullable', 'string', 'max:255'],
        ]);

        $scan = Scan::create([
            'ecosystem'   => 'npm',
            'source_name' => $validated['source_name'] ?? null,
            'status'      => 'pending',
        ]);

        // --- 1. Parse ------------------------------------------------------
        try {
            $result = $this->parser->parseLockfile($validated['lockfile']);
        } catch (RuntimeException $e) {
            $scan->update(['status' => 'failed']);
            return response()->json([
                'message' => 'Parsing failed',
                'error'   => $e->getMessage(),
                'scan_id' => $scan->id,
            ], 502);
        }

        $dependencies = $result['dependencies'] ?? [];

        // --- 2. Vulnerability scan (OSV) -----------------------------------
        // A failure here shouldn't lose the whole scan — we still have the
        // dependency list. Mark the scan done, note vulns weren't checked.
        $findingsByKey = [];
        $osvFailed = false;
        try {
            $findingsByKey = $this->osv->scan(
                array_map(fn ($d) => ['name' => $d['name'], 'version' => $d['version']], $dependencies),
                'npm'
            );
        } catch (RuntimeException $e) {
            $osvFailed = true;
        }

        // --- 3. Persist dependencies + findings ----------------------------
        $vulnerableCount = 0;
        $findingTotal = 0;

        foreach ($dependencies as $dep) {
            $dependency = $scan->dependencies()->create([
                'name'      => $dep['name'],
                'version'   => $dep['version'],
                'is_direct' => $dep['isDirect'] ?? false,
            ]);

            $key = "{$dep['name']}@{$dep['version']}";
            $found = $findingsByKey[$key] ?? [];

            if (!empty($found)) {
                $vulnerableCount++;
            }

            foreach ($found as $f) {
                $dependency->findings()->create([
                    'type'          => 'cve',
                    'vuln_id'       => $f['id'],
                    'severity'      => $f['severity'] ?? 'Unknown',
                    'cvss_score'    => $f['cvss_score'] ?? null,
                    'title'         => $f['summary'] ?? null,
                    'fixed_version' => $f['fixed_version'] ?? null,
                    'url'           => $f['url'] ?? null,
                ]);
                $findingTotal++;
            }
        }

        $directCount = collect($dependencies)->where('isDirect', true)->count();

        $scan->update([
            'status'         => 'done',
            'summary_counts' => [
                'total'           => count($dependencies),
                'direct'          => $directCount,
                'vulnerable'      => $vulnerableCount,
                'findings'        => $findingTotal,
                'osv_checked'     => !$osvFailed,
            ],
        ]);

        return response()->json(
            $scan->load('dependencies.findings'),
            201
        );
    }

    /**
     * GET /api/scans/{scan}
     */
    public function show(Scan $scan): JsonResponse
    {
        return response()->json($scan->load('dependencies.findings'));
    }
}
