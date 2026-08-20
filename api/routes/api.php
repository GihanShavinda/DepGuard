<?php

use App\Http\Controllers\ScanController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
| These routes are loaded with the /api prefix.
| So POST /api/scans maps to ScanController@store.
*/

Route::post('/scans', [ScanController::class, 'store']);
Route::get('/scans/{scan}', [ScanController::class, 'show']);
