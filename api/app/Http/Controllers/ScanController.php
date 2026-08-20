<?php

namespace App\Http\Controllers;

use App\Models\Scan;
use App\Services\ParserClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use RuntimeException;

class ScanController extends Controller
{
    public function __construct(private ParserClient $parser)
    {
    }

    /**
     * POST /api/scans
     * Body: { "source_name": "my-app", "lockfile": { ...package-lock.json... } }
     *
     * Parses the lockfile via the Express service, stores the scan and its
     * dependencies, and returns the created scan.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'lockfile'    => ['required', 'array'],
            'source_name' => ['nullable', 'string', 'max:255'],
        ]);

        // Create the scan record up front (status pending).
        $scan = Scan::create([
            'ecosystem'   => 'npm',
            'source_name' => $validated['source_name'] ?? null,
            'status'      => 'pending',
        ]);

        try {
            $result = $this->parser->parseLockfile($validated['lockfile']);
        } catch (RuntimeException $e) {
            $scan->update(['status' => 'failed']);
            return response()->json([
                'message' => 'Parsing failed',
                'error'   => $e->getMessage(),
                'scan_id' => $scan->id,
            ], 502); // Bad Gateway — upstream (parser) problem
        }

        $dependencies = $result['dependencies'] ?? [];

        // Persist each dependency.
        foreach ($dependencies as $dep) {
            $scan->dependencies()->create([
                'name'      => $dep['name'],
                'version'   => $dep['version'],
                'is_direct' => $dep['isDirect'] ?? false,
            ]);
        }

        $directCount = collect($dependencies)->where('isDirect', true)->count();

        $scan->update([
            'status'         => 'done',
            'summary_counts' => [
                'total'  => count($dependencies),
                'direct' => $directCount,
            ],
        ]);

        return response()->json(
            $scan->load('dependencies'),
            201
        );
    }

    /**
     * GET /api/scans/{scan}
     * Returns a scan with its dependencies.
     */
    public function show(Scan $scan): JsonResponse
    {
        return response()->json($scan->load('dependencies'));
    }
}
