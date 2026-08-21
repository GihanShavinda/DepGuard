<?php

namespace App\Http\Controllers;

use App\Jobs\ProcessScan;
use App\Models\Scan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ScanController extends Controller
{
    /**
     * POST /api/scans
     *
     * Creates the scan record, dispatches the heavy work to a background job,
     * and returns IMMEDIATELY with status "processing". The frontend then polls
     * GET /api/scans/{id} until status is "done" or "failed".
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
            'status'      => 'processing',
        ]);

        ProcessScan::dispatch($scan->id, $validated['lockfile']);

        // 202 Accepted: work is queued, not finished.
        return response()->json($scan->load('dependencies.findings'), 202);
    }

    /**
     * GET /api/scans/{scan}
     * Frontend polls this. Returns current status + (when done) full results.
     */
    public function show(Scan $scan): JsonResponse
    {
        return response()->json($scan->load('dependencies.findings'));
    }
}
