<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Talks to the Express parser microservice.
 *
 * Keeping this in its own class (instead of calling Http:: directly in the
 * controller) means the controller stays thin and the parser URL / error
 * handling lives in one place.
 */
class ParserClient
{
    private string $baseUrl;

    public function __construct()
    {
        // Set PARSER_URL in .env (e.g. http://localhost:3001).
        // Falls back to localhost for local dev without Docker.
        $this->baseUrl = rtrim(config('services.parser.url', 'http://localhost:3001'), '/');
    }

    /**
     * Send a lockfile to the parser and get back the dependency list.
     *
     * @param array $lockfile  Decoded package-lock.json contents.
     * @return array           ['ecosystem' => 'npm', 'count' => n, 'dependencies' => [...]]
     *
     * @throws RuntimeException on network failure or a non-2xx response.
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
}
