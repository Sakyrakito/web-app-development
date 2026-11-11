<?php
/**
 * POST /api/report.php  {story_id}
 * One report per story per session. Once the threshold is reached, the story is hidden pending moderation.
 */
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

require_method('POST');
$input      = body();
$storyId = int_param($input, 'story_id') ?? fail('Не указана история');

$db  = db();
$storyQuery = $db->prepare('SELECT id FROM stories WHERE id = ? AND hidden = 0');
$storyQuery->execute([$storyId]);
if (!$storyQuery->fetchColumn()) {
    fail('История не найдена', 404);
}

$db->beginTransaction();

$addReport = $db->prepare('INSERT OR IGNORE INTO reports (story_id, actor) VALUES (?, ?)');
$addReport->execute([$storyId, ACTOR]);
if ($addReport->rowCount() === 0) {
    $db->rollBack();
    fail('Вы уже пожаловались на эту историю', 409);
}

$threshold = (int) ($db->query("SELECT value FROM settings WHERE key = 'report_threshold'")->fetchColumn() ?: 5);
$countReport = $db->prepare(
    'UPDATE stories
        SET reports = reports + 1,
            hidden  = CASE WHEN reports + 1 >= :threshold THEN 1 ELSE hidden END
      WHERE id = :id'
);
// execute([...]) would bind :threshold as text, and SQLite orders every integer below every text value.
$countReport->bindValue(':threshold', $threshold, PDO::PARAM_INT);
$countReport->bindValue(':id', $storyId, PDO::PARAM_INT);
$countReport->execute();

$hiddenQuery = $db->prepare('SELECT hidden FROM stories WHERE id = ?');
$hiddenQuery->execute([$storyId]);
$hidden = (bool) $hiddenQuery->fetchColumn();
$db->commit();

json_out(['id' => $storyId, 'reported' => true, 'hidden' => $hidden]);
