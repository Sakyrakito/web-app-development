<?php
/**
 * GET  /api/stories.php?sort=new|hot|top|near[&lat=&lng=][&category=][&offset=][&limit=]  — лента
 * POST /api/stories.php  {text, category?, lat, lng, address?, place_id?}             — новая история
 */
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

$method = require_method('GET', 'POST');
$pdo    = db();

if ($method === 'GET') {
    $sort     = $_GET['sort'] ?? 'new';
    $category = category_param($_GET);
    $limit    = max(1, min(50, int_param($_GET, 'limit', 18)));
    $offset   = max(0, int_param($_GET, 'offset', 0));
    $lat      = float_param($_GET, 'lat', -90, 90);
    $lng      = float_param($_GET, 'lng', -180, 180);

    $params = [':me' => ACTOR];
    $sql    = STORY_SELECT;
    if ($category) {
        $sql .= ' AND s.category = :cat';
        $params[':cat'] = $category;
    }

    switch ($sort) {
        case 'hot':
            // «Обсуждают»: все голоса (и «верю», и «не верю»), делённые на возраст в часах —
            // наверх всплывают свежие спорные истории.
            $sql .= " ORDER BY (s.likes + s.dislikes) * 1.0 / ((julianday('now') - julianday(s.created_at)) * 24 + 2) DESC, s.created_at DESC";
            break;
        case 'top':
            $sql .= ' ORDER BY rating DESC, s.created_at DESC';
            break;
        case 'near':
            if ($lat === null || $lng === null) {
                fail('Для сортировки по близости нужны lat и lng');
            }
            // Квадрат расстояния в «плоской» проекции: для сортировки в пределах города точности хватает,
            // а тригонометрия в SQLite есть не во всех сборках.
            $sql .= ' ORDER BY ((p.lat - :lat) * (p.lat - :lat) + ((p.lng - :lng) * :k) * ((p.lng - :lng) * :k)) ASC, rating DESC';
            $params += [':lat' => $lat, ':lng' => $lng, ':k' => cos(deg2rad($lat))];
            break;
        case 'new':
            $sql .= ' ORDER BY s.created_at DESC, s.id DESC';
            break;
        default:
            fail('Неизвестная сортировка');
    }
    $sql .= " LIMIT $limit OFFSET $offset";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $items = array_map(static function (array $row) use ($lat, $lng) {
        $story = story_out($row);
        if ($lat !== null && $lng !== null) {
            $story['distance'] = (int) round(distance_m($lat, $lng, $story['place']['lat'], $story['place']['lng']));
        }
        return $story;
    }, $stmt->fetchAll());

    json_out(['items' => $items, 'has_more' => count($items) === $limit]);
}

// --- POST: публикация ---
$in       = body();
$text     = trim((string) ($in['text'] ?? ''));
$category = category_param($in);
$lat      = float_param($in, 'lat', -90, 90);
$lng      = float_param($in, 'lng', -180, 180);
$placeId  = int_param($in, 'place_id');
$address  = mb_substr(trim(strip_tags((string) ($in['address'] ?? ''))), 0, 200) ?: null;

$len = mb_strlen($text);
if ($len < TEXT_MIN) {
    fail('История слишком короткая — минимум ' . TEXT_MIN . ' символов');
}
if ($len > TEXT_MAX) {
    fail('История слишком длинная — максимум ' . TEXT_MAX . ' символов');
}
// Анонимность защищает автора, но не должна бить по другим людям: контакты и ссылки не пропускаем.
// Те же проверки дублируются на клиенте (CONTACT_RULES в app.js), чтобы предупредить до отправки.
if (preg_match('/(?<!\d)(?:\+?\d[\s\-()]{0,2}){7,}(?!\d)/u', $text)) {
    fail('Уберите номер телефона: легенды — о местах, а не о конкретных людях');
}
if (preg_match('/[\w.+-]+@[\w-]+\.[a-z]{2,}/iu', $text)) {
    fail('Уберите email: легенды — о местах, а не о конкретных людях');
}
if (preg_match('~https?://|www\.~iu', $text)) {
    fail('Ссылки в историях не публикуются');
}

$stmt = $pdo->prepare("SELECT CAST(strftime('%s', 'now') - strftime('%s', MAX(created_at)) AS INTEGER)
                         FROM stories WHERE author = ?");
$stmt->execute([ACTOR]);
$since = $stmt->fetchColumn();
if ($since !== null && (int) $since < POST_COOLDOWN) {
    fail('Подождите перед следующей публикацией', 429, ['retry_after' => POST_COOLDOWN - (int) $since]);
}

$pdo->beginTransaction();

if ($placeId !== null) {
    $stmt = $pdo->prepare('SELECT id FROM places WHERE id = ?');
    $stmt->execute([$placeId]);
    if (!$stmt->fetchColumn()) {
        $pdo->rollBack();
        fail('Точка не найдена', 404);
    }
} else {
    if ($lat === null || $lng === null) {
        $pdo->rollBack();
        fail('Не указаны координаты');
    }
    // Ищем существующую точку рядом, чтобы истории одного двора собирались в один маркер.
    $dLat = SNAP_METERS / 111320;
    $dLng = $dLat / max(0.01, cos(deg2rad($lat)));
    $stmt = $pdo->prepare('SELECT id, lat, lng FROM places
                            WHERE lat BETWEEN :lat1 AND :lat2 AND lng BETWEEN :lng1 AND :lng2');
    $stmt->execute([':lat1' => $lat - $dLat, ':lat2' => $lat + $dLat, ':lng1' => $lng - $dLng, ':lng2' => $lng + $dLng]);

    $best = null;
    foreach ($stmt->fetchAll() as $p) {
        $d = distance_m($lat, $lng, (float) $p['lat'], (float) $p['lng']);
        if ($d <= SNAP_METERS && ($best === null || $d < $best[1])) {
            $best = [(int) $p['id'], $d];
        }
    }

    if ($best) {
        $placeId = $best[0];
    } else {
        $pdo->prepare('INSERT INTO places (lat, lng, address) VALUES (?, ?, ?)')->execute([$lat, $lng, $address]);
        $placeId = (int) $pdo->lastInsertId();
    }
}

$pdo->prepare('INSERT INTO stories (place_id, text, category, author) VALUES (?, ?, ?, ?)')
    ->execute([$placeId, $text, $category, ACTOR]);
$storyId = (int) $pdo->lastInsertId();
$pdo->commit();

json_out(find_story($storyId), 201);
