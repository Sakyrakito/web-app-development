<?php
/**
 * GET /api/places.php[?category=horror]  — places for map markers (aggregated over visible stories)
 * GET /api/places.php?id=12              — one place with its stories
 */
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

require_method('GET');
$db = db();

$id = int_param($_GET, 'id');
if ($id !== null) {
    $placeQuery = $db->prepare('SELECT id, lat, lng, address FROM places WHERE id = ?');
    $placeQuery->execute([$id]);
    $place = $placeQuery->fetch();
    if (!$place) {
        fail('Точка не найдена', 404);
    }

    $storiesQuery = $db->prepare(STORY_SELECT . ' AND s.place_id = :place_id ORDER BY rating DESC, s.created_at DESC');
    $storiesQuery->execute([':me' => ACTOR, ':place_id' => $id]);

    json_out([
        'place' => [
            'id'      => (int) $place['id'],
            'lat'     => (float) $place['lat'],
            'lng'     => (float) $place['lng'],
            'address' => $place['address'],
        ],
        'stories' => array_map('story_out', $storiesQuery->fetchAll()),
    ]);
}

$category = category_param($_GET);
$sql = "SELECT p.id, p.lat, p.lng, p.address,
               COUNT(s.id)                     AS stories,
               SUM(s.likes - s.dislikes)       AS rating,
               SUM(s.category = 'rumor')       AS rumor,
               SUM(s.category = 'horror')      AS horror,
               SUM(s.category = 'history')     AS history,
               SUM(s.category = 'omen')        AS omen,
               MAX(s.created_at)               AS last_at
          FROM places p
          JOIN stories s ON s.place_id = p.id AND s.hidden = 0"
     . ($category ? ' AND s.category = :category' : '')
     . ' GROUP BY p.id ORDER BY rating DESC LIMIT 2000';

$placesQuery = $db->prepare($sql);
$placesQuery->execute($category ? [':category' => $category] : []);

json_out(array_map(static fn(array $row) => [
    'id'      => (int) $row['id'],
    'lat'     => (float) $row['lat'],
    'lng'     => (float) $row['lng'],
    'address' => $row['address'],
    'stories' => (int) $row['stories'],
    'rating'  => (int) $row['rating'],
    'mix'     => [
        'rumor'   => (int) $row['rumor'],
        'horror'  => (int) $row['horror'],
        'history' => (int) $row['history'],
        'omen'    => (int) $row['omen'],
    ],
    'last_at' => $row['last_at'],
], $placesQuery->fetchAll()));
