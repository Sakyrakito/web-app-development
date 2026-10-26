<?php
/**
 * POST /api/vote.php  {story_id, value: 1 | -1}
 * Повторный голос с тем же значением снимает голос, противоположный — переключает.
 */
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

require_method('POST');
$in      = body();
$storyId = int_param($in, 'story_id') ?? fail('Не указана история');
$value   = int_param($in, 'value');
if ($value !== 1 && $value !== -1) {
    fail('value должен быть 1 или -1');
}

$pdo  = db();
$stmt = $pdo->prepare('SELECT author FROM stories WHERE id = ? AND hidden = 0');
$stmt->execute([$storyId]);
$author = $stmt->fetchColumn();
if ($author === false) {
    fail('История не найдена', 404);
}
if ($author === ACTOR) {
    fail('Нельзя голосовать за собственную историю', 403);
}

$pdo->beginTransaction();

$stmt = $pdo->prepare('SELECT value FROM votes WHERE story_id = ? AND actor = ?');
$stmt->execute([$storyId, ACTOR]);
$old = (int) ($stmt->fetchColumn() ?: 0);
$new = $old === $value ? 0 : $value;

if ($new === 0) {
    $pdo->prepare('DELETE FROM votes WHERE story_id = ? AND actor = ?')->execute([$storyId, ACTOR]);
} else {
    $pdo->prepare('INSERT INTO votes (story_id, actor, value) VALUES (?, ?, ?)
                   ON CONFLICT (story_id, actor) DO UPDATE SET value = excluded.value')
        ->execute([$storyId, ACTOR, $new]);
}

// Счётчики меняем дельтой, а не пересчётом: так сохраняются стартовые значения демо-данных.
$pdo->prepare('UPDATE stories SET likes = likes + :dl, dislikes = dislikes + :dd WHERE id = :id')
    ->execute([
        ':dl' => (int) ($new === 1) - (int) ($old === 1),
        ':dd' => (int) ($new === -1) - (int) ($old === -1),
        ':id' => $storyId,
    ]);
$pdo->commit();

$story = find_story($storyId);
json_out([
    'id'       => $story['id'],
    'likes'    => $story['likes'],
    'dislikes' => $story['dislikes'],
    'rating'   => $story['rating'],
    'my_vote'  => $story['my_vote'],
]);
