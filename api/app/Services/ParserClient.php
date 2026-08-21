<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Talks to the Express parser microservice.
 *   parseLockfile() -> dependency list
 *   scoreHeuristics() -> Trust Score signals per package
 */
class ParserClient
{
    private string $baseUrl;

    public function __construct()
    {
        $this->baseUrl = rtrim(config('services.parser.url', 'http://localhost:3001'), '/');
    }

    /**
     * @throws RuntimeException
     */
    public function parseLockfile(array $lockfile): array
    {
        try {
            $response = Http::timeout(15)
                ->acceptJson()
                ->post("{$this->baseUrl}/parse", $lockfile);
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
     * Ask the parser to score dependencies for supply-chain risk.
     *
     * @param array $dependencies  each ['name' => ..., 'version' => ...]
     * @return array  map "name@version" => ['score'=>int,'level'=>str,'reasons'=>[...]]
     *                Returns [] on failure (heuristics are best-effort).
     */
    public function scoreHeuristics(array $dependencies): array
    {
        try {
            $response = Http::timeout(60)
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
