<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('dependencies', function (Blueprint $table) {
            $table->unsignedTinyInteger('trust_score')->nullable()->after('is_direct');
            $table->string('trust_level')->nullable()->after('trust_score'); // trusted|caution|suspicious
        });
    }

    public function down(): void
    {
        Schema::table('dependencies', function (Blueprint $table) {
            $table->dropColumn(['trust_score', 'trust_level']);
        });
    }
};
