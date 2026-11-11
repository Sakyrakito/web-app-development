<?php
/**
 * Router for PHP's built-in server (not needed on Apache/Nginx):
 *   php -S localhost:8000 router.php
 * Blocks access to the database and API internals; serves everything else as-is.
 */
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/');
if (preg_match('#^/(storage/|api/(bootstrap|seed)\.php|api/.*\.sql$)#', $path)) {
    http_response_code(404);
    return true;
}
return false;
