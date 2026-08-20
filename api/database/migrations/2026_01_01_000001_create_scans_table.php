<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('scans', function (Blueprint $table) {
            $table->id();
            $table->string('ecosystem')->default('npm');   // npm, composer, ...
            $table->string('source_name')->nullable();      // e.g. filename shown to user
            $table->string('status')->default('pending');   // pending | done | failed
            $table->json('summary_counts')->nullable();     // {"total": 42, "direct": 12}
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('scans');
    }
};
