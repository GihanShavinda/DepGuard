# DepGuard Laravel API — Docker image for Render (or any container host)
FROM php:8.2-cli

# System deps + PHP extensions Laravel needs
RUN apt-get update && apt-get install -y \
    git unzip libzip-dev libsqlite3-dev \
    && docker-php-ext-install pdo pdo_sqlite zip \
    && rm -rf /var/lib/apt/lists/*

# Composer
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app

# Install PHP deps first (better caching)
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-interaction --prefer-dist --optimize-autoloader

# App source
COPY . .
RUN composer dump-autoload --optimize

# Ensure the SQLite database file + storage dirs exist and are writable.
# NOTE: Render's free filesystem is EPHEMERAL — scan history resets on restart.
# That's fine for a demo. For persistence, switch to Render's free PostgreSQL.
RUN mkdir -p database storage/framework/{cache,sessions,views} bootstrap/cache \
    && touch database/database.sqlite \
    && chmod -R 777 storage bootstrap/cache database

# Render provides $PORT. Laravel's dev server is fine for a demo API.
# (A production-hardened setup would use nginx + php-fpm — noted in the README.)
CMD php artisan config:clear \
    && php artisan migrate --force \
    && php artisan serve --host 0.0.0.0 --port ${PORT:-8000}
