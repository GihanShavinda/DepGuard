<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Talks to the Express parser microservice.
 *   parseManifest()   -> dependency list (+ detected ecosystem)
 *   scoreHeuristics() -> Trust Score signals (npm only)
 */
class ParserClient
{
    private string $baseUrl;

    public function __construct()
    {
        $this->baseUrl = rtrim(config('services.parser.url', 'http://localhost:3001'), '/');
    }

    /**
     * Parse a manifest given its raw text content and (optionally) its filename.
     * The parser auto-detects the ecosystem from content + filename hint.
     *
     * @throws RuntimeException
     */
    public function parseManifest(string $content, ?string $filename = null): array
    {
        try {
            $response = Http::timeout(20)
                ->acceptJson()
                ->post("{$this->baseUrl}/parse", [
                    'content'  => $content,
                    'filename' => $filename,
                ]);
        } catch (\Throwable $e) {
            throw new RuntimeException(
                "Could not reach parser service at {$this->baseUrl}: {$e->getMessage()}"
            );
        }

        if ($response->failed()) {
            $detail = $response->json('detail') ?? $response->json('error') ?? $response->body();
            throw new RuntimeException("Parser returned an error: {$detail}");
        }

        return $response->json();
    }

    /**
     * Backward-compatible: accept an already-decoded array (npm/composer JSON)
     * and forward it as JSON. Kept so older callers still work.
     * @throws RuntimeException
     */
    public function parseLockfile(array $lockfile): array
    {
        return $this->parseManifest(json_encode($lockfile), null);
    }

    /**
     * Trust Score heuristics (npm only). Best-effort; [] on failure.
     */
    public function scoreHeuristics(array $dependencies): array
    {
        try {
            $response = Http::timeout(120)
                ->acceptJson()
                ->post("{$this->baseUrl}/heuristics", ['dependencies' => $dependencies]);
        } catch (\Throwable) {
            return [];
        }
        if ($response->failed()) {
            return [];
        }
        return $response->json('scores', []);
    }
}
