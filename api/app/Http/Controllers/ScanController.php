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
     * Body: { "content": "<raw manifest text>", "filename": "package-lock.json", "source_name": "my-app" }
     *
     * `content` is the raw text of any supported manifest (npm/composer/pypi/
     * rubygems/go/cargo). `filename` helps the parser detect the ecosystem.
     * Legacy: also accepts { "lockfile": {...} } (a decoded npm/composer object).
     *
     * Dispatches the scan to a background job; returns immediately (202).
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'content'     => ['nullable', 'string'],
            'filename'    => ['nullable', 'string', 'max:255'],
            'lockfile'    => ['nullable', 'array'],
            'source_name' => ['nullable', 'string', 'max:255'],
        ]);

        // Normalise input to a raw text string.
        $content = $validated['content'] ?? null;
        if ($content === null && !empty($validated['lockfile'])) {
            $content = json_encode($validated['lockfile']);
        }

        if (!$content) {
            return response()->json([
                'message' => 'Provide "content" (raw manifest text) or "lockfile" (JSON).',
            ], 422);
        }

        $scan = Scan::create([
            'ecosystem'   => 'unknown',
            'source_name' => $validated['source_name'] ?? null,
            'status'      => 'processing',
        ]);

        ProcessScan::dispatch($scan->id, $content, $validated['filename'] ?? null);

        return response()->json($scan->load('dependencies.findings'), 202);
    }

    public function show(Scan $scan): JsonResponse
    {
        return response()->json($scan->load('dependencies.findings'));
    }
}
