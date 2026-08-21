<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Finding extends Model
{
    protected $fillable = [
        'dependency_id',
        'type',           // 'cve' now; 'malicious_heuristic' comes in Phase 3
        'vuln_id',        // e.g. GHSA-... or CVE-...
        'severity',
        'cvss_score',
        'title',
        'fixed_version',
        'url',
    ];

    protected $casts = [
        'cvss_score' => 'float',
    ];

    public function dependency(): BelongsTo
    {
        return $this->belongsTo(Dependency::class);
    }
}
