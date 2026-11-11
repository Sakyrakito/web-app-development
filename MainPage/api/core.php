<?php
/**
 * Code shared by the public API and the admin API: SQLite connection, schema upgrades,
 * JSON responses and input validation. Starts no session; each side starts its own.
 */
declare(strict_types=1);

const DB_PATH       = __DIR__ . '/../storage/legends.sqlite';
const POST_COOLDOWN = 300;   // seconds between posts from one session
const TEXT_MIN      = 20;
const TEXT_MAX      = 2000;
const SNAP_METERS   = 30;    // a story closer than this snaps to the existing place
const CATEGORIES    = ['rumor', 'horror', 'history', 'omen'];

// Bump after changing schema.sql: existing databases re-run it on their next request.
const SCHEMA_VERSION = 1;

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

set_exception_handler(function (Throwable $e): void {
    error_log('[legends] ' . $e);
    http_response_code(500);
    echo json_encode(['error' => 'Внутренняя ошибка сервера'], JSON_UNESCAPED_UNICODE);
});

function db(): PDO
{
    static $db = null;
    if ($db !== null) {
        return $db;
    }

    $dir = dirname(DB_PATH);
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new RuntimeException("Не удалось создать каталог $dir");
    }
    $fresh = !is_file(DB_PATH);

    $db = new PDO('sqlite:' . DB_PATH, null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $db->exec('PRAGMA foreign_keys = ON');
    $db->exec('PRAGMA journal_mode = WAL');

    if ((int) $db->query('PRAGMA user_version')->fetchColumn() < SCHEMA_VERSION) {
        $db->exec(file_get_contents(__DIR__ . '/schema.sql'));
        $db->exec('PRAGMA user_version = ' . SCHEMA_VERSION);
    }
    if ($fresh) {
        seed($db);
    }
    return $db;
}

function seed(PDO $db): void
{
    if ((int) $db->query('SELECT COUNT(*) FROM places')->fetchColumn() > 0) {
        return;
    }
    $places  = require __DIR__ . '/seed.php';
    $addPlace = $db->prepare('INSERT INTO places (lat, lng, address) VALUES (?, ?, ?)');
    $addStory = $db->prepare(
        "INSERT INTO stories (place_id, text, category, likes, dislikes, author, created_at)
         VALUES (?, ?, ?, ?, ?, 'seed', datetime('now', ?))"
    );

    $db->beginTransaction();
    foreach ($places as [$lat, $lng, $address, $stories]) {
        $addPlace->execute([$lat, $lng, $address]);
        $placeId = (int) $db->lastInsertId();
        foreach ($stories as [$category, $likes, $dislikes, $hoursAgo, $text]) {
            $addStory->execute([$placeId, $text, $category, $likes, $dislikes, "-$hoursAgo hours"]);
        }
    }
    $db->commit();
}

function json_out(mixed $data, int $code = 200): never
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(string $message, int $code = 400, array $extra = []): never
{
    json_out(['error' => $message] + $extra, $code);
}

function require_method(string ...$methods): string
{
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!in_array($method, $methods, true)) {
        header('Allow: ' . implode(', ', $methods));
        fail('Метод не поддерживается', 405);
    }
    return $method;
}

/** POST body. Requiring JSON is the CSRF defence: a plain HTML form on another site can't send it. */
function body(): array
{
    if (!str_starts_with($_SERVER['CONTENT_TYPE'] ?? '', 'application/json')) {
        fail('Ожидается application/json', 415);
    }
    $data = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($data)) {
        fail('Некорректный JSON');
    }
    return $data;
}

function int_param(array $src, string $key, ?int $default = null): ?int
{
    if (!isset($src[$key]) || $src[$key] === '') {
        return $default;
    }
    $value = filter_var($src[$key], FILTER_VALIDATE_INT);
    if ($value === false) {
        fail("Параметр $key должен быть целым числом");
    }
    return $value;
}

function float_param(array $src, string $key, float $min, float $max): ?float
{
    if (!isset($src[$key]) || $src[$key] === '') {
        return null;
    }
    $value = filter_var($src[$key], FILTER_VALIDATE_FLOAT);
    if ($value === false || $value < $min || $value > $max) {
        fail("Параметр $key вне допустимого диапазона");
    }
    return $value;
}

function category_param(array $src): ?string
{
    $category = $src['category'] ?? null;
    if ($category === null || $category === '') {
        return null;
    }
    if (!in_array($category, CATEGORIES, true)) {
        fail('Неизвестная категория');
    }
    return $category;
}

function distance_m(float $lat1, float $lng1, float $lat2, float $lng2): float
{
    $earthRadius = 6371000;
    $dLat = deg2rad($lat2 - $lat1);
    $dLng = deg2rad($lng2 - $lng1);
    $a    = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;
    return 2 * $earthRadius * asin(min(1, sqrt($a)));
}
