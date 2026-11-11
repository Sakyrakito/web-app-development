<?php
/**
 * GET    /api/admin-session.php                     — {configured, admin}
 * POST   /api/admin-session.php  {login, password}  — log in
 * DELETE /api/admin-session.php                     — log out
 */
declare(strict_types=1);
require __DIR__ . '/admin-bootstrap.php';

const LOGIN_MAX_FAILURES = 5;
const LOGIN_WINDOW       = 15 * 60;

$method = require_method('GET', 'POST', 'DELETE');

if ($method === 'GET') {
    $admin = is_admin();
    session_write_close();
    json_out(['configured' => admin_credentials() !== null, 'admin' => $admin]);
}

if ($method === 'DELETE') {
    $_SESSION = [];
    session_destroy();
    json_out(['admin' => false]);
}

$credentials = admin_credentials();
if ($credentials === null) {
    fail('Вход отключён: не заданы ADMIN_LOGIN и ADMIN_PASSWORD_HASH', 503);
}

$db = db();
// Keyed by REMOTE_ADDR: behind a reverse proxy every client shares one address,
// so read the proxy's forwarded-for header there instead.
$ip  = $_SERVER['REMOTE_ADDR'] ?? '';
$now = time();

$failuresQuery = $db->prepare('SELECT COUNT(*), MIN(at) FROM login_failures WHERE ip = ? AND at > ?');
$failuresQuery->execute([$ip, $now - LOGIN_WINDOW]);
[$failures, $oldest] = $failuresQuery->fetch(PDO::FETCH_NUM);
if ((int) $failures >= LOGIN_MAX_FAILURES) {
    fail('Слишком много попыток входа. Попробуйте позже.', 429, ['retry_after' => (int) $oldest + LOGIN_WINDOW - $now]);
}

$input       = body();
$login    = (string) ($input['login'] ?? '');
$password = (string) ($input['password'] ?? '');

// Always run password_verify so a wrong login takes as long as a wrong password.
$passwordOk = password_verify($password, $credentials['hash']);
if (!hash_equals($credentials['login'], $login) || !$passwordOk) {
    $db->prepare('DELETE FROM login_failures WHERE at <= ?')->execute([$now - LOGIN_WINDOW]);
    $db->prepare('INSERT INTO login_failures (ip, at) VALUES (?, ?)')->execute([$ip, $now]);
    fail('Неверный логин или пароль', 401);
}

$db->prepare('DELETE FROM login_failures WHERE ip = ?')->execute([$ip]);
session_regenerate_id(true);
$_SESSION = ['admin' => true, 'seen' => $now];
json_out(['admin' => true]);
