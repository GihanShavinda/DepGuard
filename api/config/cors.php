<?php

// Copy this to api/config/cors.php
//
// Laravel 11/12 already applies the HandleCors middleware to routes.
// This config allows your Angular dev server (localhost:4200) to call the API.

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    // The Angular dev server origin. Add your deployed frontend origin here too.
    'allowed_origins' => [
        'http://localhost:4200',
        'http://127.0.0.1:4200',
    ],

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    // We're not using cookie auth yet (that comes with Sanctum in Phase 2),
    // so credentials can stay false for now.
    'supports_credentials' => false,
];
