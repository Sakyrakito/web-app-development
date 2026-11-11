<?php
/**
 * POST /api/vote.php  {story_id, value: 1 | -1}
 * Repeating the same vote removes it; the opposite value switches it.
 */
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

require_method('POST');
$input      = body();
$storyId = int_param($input, 'story_id') ?? fail('Не указана история');
$value   = int_param($input, 'value');
if ($value !== 1 && $value !== -1) {
    fail('value должен быть 1 или -1');
}

$db  = db();
$authorQuery = $db->prepare('SELECT author FROM stories WHERE id = ? AND hidden = 0');
$authorQuery->execute([$storyId]);
$author = $authorQuery->fetchColumn();
if ($author === false) {
    fail('История не найдена', 404);
}
if ($author === ACTOR) {
    fail('Нельзя голосовать за собственную историю', 403);
}

$db->beginTransaction();

$voteQuery = $db->prepare('SELECT value FROM votes WHERE story_id = ? AND actor = ?');
$voteQuery->execute([$storyId, ACTOR]);
$previousVote = (int) ($voteQuery->fetchColumn() ?: 0);
$newVote = $previousVote === $value ? 0 : $value;

if ($newVote === 0) {
    $db->prepare('DELETE FROM votes WHERE story_id = ? AND actor = ?')->execute([$storyId, ACTOR]);
} else {
    $db->prepare('INSERT INTO votes (story_id, actor, value) VALUES (?, ?, ?)
                   ON CONFLICT (story_id, actor) DO UPDATE SET value = excluded.value')
        ->execute([$storyId, ACTOR, $newVote]);
}

// Apply deltas instead of recounting so the seed data's initial counts are preserved.
$db->prepare('UPDATE stories SET likes = likes + :likes_delta, dislikes = dislikes + :dislikes_delta WHERE id = :id')
    ->execute([
        ':likes_delta'    => (int) ($newVote === 1) - (int) ($previousVote === 1),
        ':dislikes_delta' => (int) ($newVote === -1) - (int) ($previousVote === -1),
        ':id'             => $storyId,
    ]);
$db->commit();

$story = find_story($storyId);
json_out([
    'id'       => $story['id'],
    'likes'    => $story['likes'],
    'dislikes' => $story['dislikes'],
    'rating'   => $story['rating'],
    'my_vote'  => $story['my_vote'],
]);
