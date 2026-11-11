<?php
/**
 * Router for PHP's built-in server (not needed on Apache/Nginx):
 *   php -S localhost:8000 router.php
 * Blocks access to the database and API internals; serves everything else as-is.
 */
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) ?? '/');
if (preg_match('#^/(storage/|api/(bootstrap|admin-bootstrap|core|seed)\.php|api/.*\.sql$)#', $path)) {
    http_response_code(404);
    return true;
}
if ($path === '/admin' || $path === '/admin/') {
    header('Location: /admin.html', true, 301);
    return true;
}
return false;
