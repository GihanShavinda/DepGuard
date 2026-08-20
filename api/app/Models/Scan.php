<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Scan extends Model
{
    /**
     * Mass-assignable fields.
     */
    protected $fillable = [
        'ecosystem',
        'source_name',
        'status',
        'summary_counts',
    ];

    /**
     * Attribute casting.
     * summary_counts is stored as JSON but used as a PHP array.
     */
    protected $casts = [
        'summary_counts' => 'array',
    ];

    /**
     * A scan has many dependencies.
     */
    public function dependencies(): HasMany
    {
        return $this->hasMany(Dependency::class);
    }
}
