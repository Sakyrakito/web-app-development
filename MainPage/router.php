<?php
/**
 * Роутер для встроенного сервера PHP (на Apache/Nginx не нужен):
 *   php -S localhost:8000 router.php
 * Закрывает доступ к базе и служебным файлам API, остальное отдаёт как есть.
 */
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/');
if (preg_match('#^/(storage/|api/(bootstrap|seed)\.php|api/.*\.sql$)#', $path)) {
    http_response_code(404);
    return true;
}
return false;
