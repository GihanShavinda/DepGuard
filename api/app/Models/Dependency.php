<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

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

    public function scan(): BelongsTo
    {
        return $this->belongsTo(Scan::class);
    }

    public function findings(): HasMany
    {
        return $this->hasMany(Finding::class);
    }
}
