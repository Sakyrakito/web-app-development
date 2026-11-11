# The official image already ships pdo_sqlite, so no extensions need installing.
FROM php:8.3-cli-alpine

WORKDIR /app
COPY . .
# Sessions live on their own volume, outside the served directory, so redeploys keep visitors' and admins' sessions.
RUN chown www-data:www-data storage \
 && mkdir -p /var/lib/php/sessions && chown www-data:www-data /var/lib/php/sessions
USER www-data

# The built-in server is single-threaded by default; a few workers keep one slow request from blocking the rest.
ENV PHP_CLI_SERVER_WORKERS=4
EXPOSE 8000
CMD ["php", "-d", "session.save_path=/var/lib/php/sessions", "-S", "0.0.0.0:8000", "router.php"]
