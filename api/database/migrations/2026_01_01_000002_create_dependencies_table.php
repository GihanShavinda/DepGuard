<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('dependencies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('scan_id')
                  ->constrained()
                  ->cascadeOnDelete();          // delete deps when scan is deleted
            $table->string('name');
            $table->string('version');
            $table->boolean('is_direct')->default(false);
            $table->timestamps();

            $table->index(['name', 'version']);  // speeds up future lookups
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('dependencies');
    }
};
