<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('findings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('dependency_id')
                  ->constrained()
                  ->cascadeOnDelete();
            $table->string('type')->default('cve'); // cve | malicious_heuristic
            $table->string('vuln_id')->nullable();   // GHSA-... / CVE-...
            $table->string('severity')->nullable();  // Critical/High/.../Unknown
            $table->float('cvss_score')->nullable();
            $table->text('title')->nullable();
            $table->string('fixed_version')->nullable();
            $table->string('url')->nullable();
            $table->timestamps();

            $table->index(['dependency_id', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('findings');
    }
};
