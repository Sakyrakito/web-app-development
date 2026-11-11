<?php
/**
 * Bootstrap for the admin API: the shared core plus a separate admin session.
 *
 * The admin cookie has its own name, so it never mixes with the anonymous visitor session
 * used by the public API; it is scoped to the API directory, not the whole site.
 */
declare(strict_types=1);
require __DIR__ . '/core.php';

const ADMIN_IDLE_TIMEOUT = 2 * 60 * 60;

session_name('legends_admin');
session_set_cookie_params([
    'lifetime' => 0,
    'path'     => rtrim(dirname($_SERVER['SCRIPT_NAME']), '/') . '/',
    'secure'   => ($_SERVER['HTTPS'] ?? 'off') !== 'off',
    'httponly' => true,
    'samesite' => 'Strict',
]);
session_start();

/** Configured credentials, or null when the admin panel is disabled. */
function admin_credentials(): ?array
{
    $login = (string) getenv('ADMIN_LOGIN');
    $hash  = (string) getenv('ADMIN_PASSWORD_HASH');
    return $login !== '' && $hash !== '' ? ['login' => $login, 'hash' => $hash] : null;
}

function is_admin(): bool
{
    return admin_credentials() !== null
        && !empty($_SESSION['admin'])
        && time() - ($_SESSION['seen'] ?? 0) < ADMIN_IDLE_TIMEOUT;
}

/** Reject the request unless an admin is logged in; refreshes the idle timer and releases the session lock. */
function require_admin(): void
{
    if (!is_admin()) {
        $_SESSION = [];
        session_write_close();
        fail('Требуется вход администратора', 401);
    }
    $_SESSION['seen'] = time();
    session_write_close();
}
