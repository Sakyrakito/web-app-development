# The official image already ships pdo_sqlite, so no extensions need installing.
FROM php:8.3-cli-alpine

WORKDIR /app
COPY . .
RUN chown www-data:www-data storage
USER www-data

# The built-in server is single-threaded by default; a few workers keep one slow request from blocking the rest.
ENV PHP_CLI_SERVER_WORKERS=4
EXPOSE 8000
CMD ["php", "-S", "0.0.0.0:8000", "router.php"]
