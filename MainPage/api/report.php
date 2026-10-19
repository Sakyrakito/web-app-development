<?php
/**
 * POST /api/report.php  {story_id}
 * Одна жалоба на историю с сессии. При достижении порога история скрывается до модерации.
 */
declare(strict_types=1);
require __DIR__ . '/bootstrap.php';

require_method('POST');
$in = body();
$storyId = int_param($in, 'story_id') ?? fail('Не указана история');

$pdo  = db();
$stmt = $pdo->prepare('SELECT id FROM stories WHERE id = ? AND hidden = 0');
$stmt->execute([$storyId]);
if (!$stmt->fetchColumn()) {
    fail('История не найдена', 404);
}

$pdo->beginTransaction();

$stmt = $pdo->prepare('INSERT OR IGNORE INTO reports (story_id, actor) VALUES (?, ?)');
$stmt->execute([$storyId, ACTOR]);
if ($stmt->rowCount() === 0) {
    $pdo->rollBack();
    fail('Вы уже пожаловались на эту историю', 409);
}

$threshold = (int) ($pdo->query("SELECT value FROM settings WHERE key = 'report_threshold'")->fetchColumn() ?: 5);
$pdo->prepare('UPDATE stories SET reports = reports + 1,
                                  hidden  = CASE WHEN reports + 1 >= :t THEN 1 ELSE hidden END
                WHERE id = :id')
    ->execute([':t' => $threshold, ':id' => $storyId]);

$stmt = $pdo->prepare('SELECT hidden FROM stories WHERE id = ?');
$stmt->execute([$storyId]);
$hidden = (bool) $stmt->fetchColumn();
$pdo->commit();

json_out(['id' => $storyId, 'reported' => true, 'hidden' => $hidden]);
