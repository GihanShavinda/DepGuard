<?php

// Production-ready CORS. Origins come from the FRONTEND_URL env var so you can
// point it at your Vercel domain without editing code. Comma-separate multiple.
//
// Example on Render (Laravel service env):
//   FRONTEND_URL=https://depguard.vercel.app,http://localhost:4200

$origins = array_filter(array_map('trim', explode(',', env('FRONTEND_URL', 'http://localhost:4200'))));

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],
    'allowed_methods' => ['*'],
    'allowed_origins' => $origins,
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => false,
];
