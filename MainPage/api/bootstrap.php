<?php
/**
 * Bootstrap for the public API: the shared core plus the anonymous visitor session and story queries.
 */
declare(strict_types=1);
require __DIR__ . '/core.php';

session_name('legends_sid');
session_set_cookie_params([
    'lifetime' => 60 * 60 * 24 * 365,
    'path'     => '/',
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();
// Store a hash of the session id, not the id itself, so a leaked database can't be used to hijack sessions.
define('ACTOR', hash('sha256', session_id()));
session_write_close();

/** Base query for visible stories with their place and the current session's vote/report state. */
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

function story_out(array $row): array
{
    return [
        'id'         => (int) $row['id'],
        'text'       => $row['text'],
        'category'   => $row['category'],
        'likes'      => (int) $row['likes'],
        'dislikes'   => (int) $row['dislikes'],
        'rating'     => (int) $row['rating'],
        'created_at' => $row['created_at'],
        'my_vote'    => (int) $row['my_vote'],
        'mine'       => (bool) $row['mine'],
        'reported'   => (bool) $row['reported'],
        'place'      => [
            'id'      => (int) $row['place_id'],
            'lat'     => (float) $row['lat'],
            'lng'     => (float) $row['lng'],
            'address' => $row['address'],
        ],
    ];
}

function find_story(int $id): ?array
{
    $storyQuery = db()->prepare(STORY_SELECT . ' AND s.id = :id');
    $storyQuery->execute([':me' => ACTOR, ':id' => $id]);
    $row = $storyQuery->fetch();
    return $row ? story_out($row) : null;
}
