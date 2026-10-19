<?php
/**
 * GET /api/places.php[?category=horror] - точки для маркеров карты (агрегаты по видимым историям)
 * GET /api/places.php?id=12 - одна точка со списком её историй
 */
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

require_method('GET');
$pdo = db();

$id = int_param($_GET, 'id');
if ($id !== null) {
    $stmt = $pdo->prepare('SELECT id, lat, lng, address FROM places WHERE id = ?');
    $stmt->execute([$id]);
    $place = $stmt->fetch();
    if (!$place) {
        fail('Точка не найдена', 404);
    }

    $stmt = $pdo->prepare(STORY_SELECT . ' AND s.place_id = :pid ORDER BY rating DESC, s.created_at DESC');
    $stmt->execute([':me' => ACTOR, ':pid' => $id]);

    json_out([
        'place' => [
            'id' => (int) $place['id'],
            'lat' => (float) $place['lat'],
            'lng' => (float) $place['lng'],
            'address' => $place['address'],
        ],
        'stories' => array_map('story_out', $stmt->fetchAll()),
    ]);
}

$category = category_param($_GET);
$sql = "SELECT p.id, p.lat, p.lng, p.address,
               COUNT(s.id) AS stories,
               SUM(s.likes - s.dislikes) AS rating,
               SUM(s.category = 'rumor') AS rumor,
               SUM(s.category = 'horror') AS horror,
               SUM(s.category = 'history') AS history,
               SUM(s.category = 'omen') AS omen,
               MAX(s.created_at) AS last_at
          FROM places p
          JOIN stories s ON s.place_id = p.id AND s.hidden = 0"
     . ($category ? ' AND s.category = :cat' : '')
     . ' GROUP BY p.id ORDER BY rating DESC LIMIT 2000';

$stmt = $pdo->prepare($sql);
$stmt->execute($category ? [':cat' => $category] : []);

json_out(array_map(static fn(array $r) => [
    'id' => (int) $r['id'],
    'lat' => (float) $r['lat'],
    'lng' => (float) $r['lng'],
    'address' => $r['address'],
    'stories' => (int) $r['stories'],
    'rating' => (int) $r['rating'],
    'mix' => [
        'rumor' => (int) $r['rumor'],
        'horror' => (int) $r['horror'],
        'history' => (int) $r['history'],
        'omen' => (int) $r['omen'],
    ],
    'last_at' => $r['last_at'],
], $stmt->fetchAll()));
