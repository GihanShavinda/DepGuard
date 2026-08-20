<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Dependency extends Model
{
    protected $fillable = [
        'scan_id',
        'name',
        'version',
        'is_direct',
    ];

    protected $casts = [
        'is_direct' => 'boolean',
    ];

    /**
     * Each dependency belongs to one scan.
     */
    public function scan(): BelongsTo
    {
        return $this->belongsTo(Scan::class);
    }
}
