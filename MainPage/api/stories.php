<?php
/**
 * GET  /api/stories.php?sort=new|hot|top|near[&lat=&lng=][&category=][&offset=][&limit=]  — feed
 * POST /api/stories.php  {text, category?, lat, lng, address?, place_id?}             — new story
 */
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

$method = require_method('GET', 'POST');
$db    = db();

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
        $sql .= ' AND s.category = :category';
        $params[':category'] = $category;
    }

    switch ($sort) {
        case 'hot':
            // "Hot": all votes (both "believe" and "don't believe") divided by age in hours,
            // so fresh controversial stories rise to the top.
            $sql .= " ORDER BY (s.likes + s.dislikes) * 1.0 / ((julianday('now') - julianday(s.created_at)) * 24 + 2) DESC, s.created_at DESC";
            break;
        case 'top':
            $sql .= ' ORDER BY rating DESC, s.created_at DESC';
            break;
        case 'near':
            if ($lat === null || $lng === null) {
                fail('Для сортировки по близости нужны lat и lng');
            }
            // Squared distance on a flat projection: accurate enough for sorting within one city,
            // and not every SQLite build has trig functions.
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

    $feedQuery = $db->prepare($sql);
    $feedQuery->execute($params);

    $items = array_map(static function (array $row) use ($lat, $lng) {
        $story = story_out($row);
        if ($lat !== null && $lng !== null) {
            $story['distance'] = (int) round(distance_m($lat, $lng, $story['place']['lat'], $story['place']['lng']));
        }
        return $story;
    }, $feedQuery->fetchAll());

    json_out(['items' => $items, 'has_more' => count($items) === $limit]);
}

// --- POST: publish ---
$input       = body();
$text     = trim((string) ($input['text'] ?? ''));
$category = category_param($input);
$lat      = float_param($input, 'lat', -90, 90);
$lng      = float_param($input, 'lng', -180, 180);
$placeId  = int_param($input, 'place_id');
$address  = mb_substr(trim(strip_tags((string) ($input['address'] ?? ''))), 0, 200) ?: null;

$len = mb_strlen($text);
if ($len < TEXT_MIN) {
    fail('История слишком короткая — минимум ' . TEXT_MIN . ' символов');
}
if ($len > TEXT_MAX) {
    fail('История слишком длинная — максимум ' . TEXT_MAX . ' символов');
}
// Anonymity protects the author but must not be used against other people: contacts and links are rejected.
// The same checks run on the client (CONTACT_RULES in assets/js/constants.js) to warn before submitting.
if (preg_match('/(?<!\d)(?:\+?\d[\s\-()]{0,2}){7,}(?!\d)/u', $text)) {
    fail('Уберите номер телефона: легенды — о местах, а не о конкретных людях');
}
if (preg_match('/[\w.+-]+@[\w-]+\.[a-z]{2,}/iu', $text)) {
    fail('Уберите email: легенды — о местах, а не о конкретных людях');
}
if (preg_match('~https?://|www\.~iu', $text)) {
    fail('Ссылки в историях не публикуются');
}

$lastPostQuery = $db->prepare(
    "SELECT CAST(strftime('%s', 'now') - strftime('%s', MAX(created_at)) AS INTEGER)
       FROM stories WHERE author = ?"
);
$lastPostQuery->execute([ACTOR]);
$secondsSinceLastPost = $lastPostQuery->fetchColumn();
if ($secondsSinceLastPost !== null && (int) $secondsSinceLastPost < POST_COOLDOWN) {
    fail('Подождите перед следующей публикацией', 429, ['retry_after' => POST_COOLDOWN - (int) $secondsSinceLastPost]);
}

$db->beginTransaction();

if ($placeId !== null) {
    $placeQuery = $db->prepare('SELECT id FROM places WHERE id = ?');
    $placeQuery->execute([$placeId]);
    if (!$placeQuery->fetchColumn()) {
        $db->rollBack();
        fail('Точка не найдена', 404);
    }
} else {
    if ($lat === null || $lng === null) {
        $db->rollBack();
        fail('Не указаны координаты');
    }
    // Reuse a nearby place so stories about the same courtyard share one marker.
    $latMargin = SNAP_METERS / 111320;   // metres per degree of latitude
    $lngMargin = $latMargin / max(0.01, cos(deg2rad($lat)));
    $nearbyQuery = $db->prepare(
        'SELECT id, lat, lng FROM places
          WHERE lat BETWEEN :lat_min AND :lat_max AND lng BETWEEN :lng_min AND :lng_max'
    );
    $nearbyQuery->execute([
        ':lat_min' => $lat - $latMargin,
        ':lat_max' => $lat + $latMargin,
        ':lng_min' => $lng - $lngMargin,
        ':lng_max' => $lng + $lngMargin,
    ]);

    $nearestId = null;
    $nearestDistance = SNAP_METERS;
    foreach ($nearbyQuery->fetchAll() as $place) {
        $distance = distance_m($lat, $lng, (float) $place['lat'], (float) $place['lng']);
        if ($distance <= $nearestDistance) {
            $nearestId = (int) $place['id'];
            $nearestDistance = $distance;
        }
    }

    if ($nearestId !== null) {
        $placeId = $nearestId;
    } else {
        $db->prepare('INSERT INTO places (lat, lng, address) VALUES (?, ?, ?)')->execute([$lat, $lng, $address]);
        $placeId = (int) $db->lastInsertId();
    }
}

$db->prepare('INSERT INTO stories (place_id, text, category, author) VALUES (?, ?, ?, ?)')
    ->execute([$placeId, $text, $category, ACTOR]);
$storyId = (int) $db->lastInsertId();
$db->commit();

json_out(find_story($storyId), 201);
