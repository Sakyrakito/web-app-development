<?php
/**
 * Общий bootstrap для всех эндпоинтов API:
 * анонимная сессия, подключение к SQLite, JSON-хелперы, выборка историй.
 */
declare(strict_types=1);

const DB_PATH       = __DIR__ . '/../storage/legends.sqlite';
const POST_COOLDOWN = 300;   // секунд между публикациями с одной сессии
const TEXT_MIN      = 20;
const TEXT_MAX      = 2000;
const SNAP_METERS   = 30;    // история ближе этого расстояния прилипает к существующей точке
const CATEGORIES    = ['rumor', 'horror', 'history', 'omen'];

ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

set_exception_handler(function (Throwable $e): void {
    error_log('[legends] ' . $e);
    http_response_code(500);
    echo json_encode(['error' => 'Внутренняя ошибка сервера'], JSON_UNESCAPED_UNICODE);
});

session_name('legends_sid');
session_set_cookie_params([
    'lifetime' => 60 * 60 * 24 * 365,
    'path'     => '/',
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();
// В БД храним не сам id сессии, а его хеш — утечка базы не даст угнать сессии.
define('ACTOR', hash('sha256', session_id()));
session_write_close();

function db(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }

    $dir = dirname(DB_PATH);
    if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new RuntimeException("Не удалось создать каталог $dir");
    }
    $fresh = !is_file(DB_PATH);

    $pdo = new PDO('sqlite:' . DB_PATH, null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('PRAGMA journal_mode = WAL');

    if ($fresh) {
        $pdo->exec(file_get_contents(__DIR__ . '/schema.sql'));
        seed($pdo);
    }
    return $pdo;
}

function seed(PDO $pdo): void
{
    if ((int) $pdo->query('SELECT COUNT(*) FROM places')->fetchColumn() > 0) {
        return;
    }
    $places  = require __DIR__ . '/seed.php';
    $addPlace = $pdo->prepare('INSERT INTO places (lat, lng, address) VALUES (?, ?, ?)');
    $addStory = $pdo->prepare(
        "INSERT INTO stories (place_id, text, category, likes, dislikes, author, created_at)
         VALUES (?, ?, ?, ?, ?, 'seed', datetime('now', ?))"
    );

    $pdo->beginTransaction();
    foreach ($places as [$lat, $lng, $address, $stories]) {
        $addPlace->execute([$lat, $lng, $address]);
        $placeId = (int) $pdo->lastInsertId();
        foreach ($stories as [$category, $likes, $dislikes, $hoursAgo, $text]) {
            $addStory->execute([$placeId, $text, $category, $likes, $dislikes, "-$hoursAgo hours"]);
        }
    }
    $pdo->commit();
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

/** Тело POST-запроса. Требуем JSON — обычная HTML-форма с чужого сайта так не отправит (защита от CSRF). */
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
    $r    = 6371000;
    $dLat = deg2rad($lat2 - $lat1);
    $dLng = deg2rad($lng2 - $lng1);
    $a    = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLng / 2) ** 2;
    return 2 * $r * asin(min(1, sqrt($a)));
}

/** Базовая выборка видимых историй вместе с точкой и состоянием текущей сессии. */
const STORY_SELECT = <<<SQL
    SELECT s.id, s.text, s.category, s.likes, s.dislikes,
           (s.likes - s.dislikes) AS rating, s.created_at,
           p.id AS place_id, p.lat, p.lng, p.address,
           COALESCE(v.value, 0)          AS my_vote,
           (s.author = :me)              AS mine,
           (r.story_id IS NOT NULL)      AS reported
      FROM stories s
      JOIN places p       ON p.id = s.place_id
 LEFT JOIN votes v        ON v.story_id = s.id AND v.actor = :me
 LEFT JOIN reports r      ON r.story_id = s.id AND r.actor = :me
     WHERE s.hidden = 0
SQL;

function story_out(array $r): array
{
    return [
        'id'         => (int) $r['id'],
        'text'       => $r['text'],
        'category'   => $r['category'],
        'likes'      => (int) $r['likes'],
        'dislikes'   => (int) $r['dislikes'],
        'rating'     => (int) $r['rating'],
        'created_at' => $r['created_at'],
        'my_vote'    => (int) $r['my_vote'],
        'mine'       => (bool) $r['mine'],
        'reported'   => (bool) $r['reported'],
        'place'      => [
            'id'      => (int) $r['place_id'],
            'lat'     => (float) $r['lat'],
            'lng'     => (float) $r['lng'],
            'address' => $r['address'],
        ],
    ];
}

function find_story(int $id): ?array
{
    $stmt = db()->prepare(STORY_SELECT . ' AND s.id = :id');
    $stmt->execute([':me' => ACTOR, ':id' => $id]);
    $row = $stmt->fetch();
    return $row ? story_out($row) : null;
}
