<?php
/**
 * GET  /api/admin-stories.php?status=hidden|all[&q=][&offset=][&limit=]  — moderation queue or all stories
 * POST /api/admin-stories.php  {id, action: restore|hide|delete}
 */
declare(strict_types=1);
require __DIR__ . '/admin-bootstrap.php';

$method = require_method('GET', 'POST');
require_admin();
$db = db();

if ($method === 'GET') {
    $status = $_GET['status'] ?? 'hidden';
    if (!in_array($status, ['hidden', 'all'], true)) {
        fail('Неизвестный статус');
    }
    $offset = max(0, int_param($_GET, 'offset', 0));
    $limit  = min(100, max(1, int_param($_GET, 'limit', 30)));
    $query  = trim((string) ($_GET['q'] ?? ''));

    $where  = $status === 'hidden' ? ['s.hidden = 1'] : [];
    $params = [];
    if ($query !== '') {
        // SQLite's LIKE and lower() only fold ASCII case, which misses Cyrillic.
        $db->sqliteCreateFunction('mb_lower', static fn(?string $text): string => mb_strtolower($text ?? ''), 1);
        $where[] = "(mb_lower(s.text) LIKE :pattern ESCAPE '\\' OR mb_lower(p.address) LIKE :pattern ESCAPE '\\')";
        $params[':pattern'] = '%' . addcslashes(mb_strtolower($query), '%_\\') . '%';
    }
    // The queue puts the most-reported stories first; the full list is newest first.
    $order = $status === 'hidden' ? 's.reports DESC, s.created_at DESC' : 's.created_at DESC';

    $listQuery = $db->prepare(
        'SELECT s.id, s.text, s.category, s.likes, s.dislikes, s.reports, s.hidden, s.created_at,
                p.id AS place_id, p.lat, p.lng, p.address
           FROM stories s
           JOIN places p ON p.id = s.place_id'
        . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
        . " ORDER BY $order LIMIT $limit OFFSET $offset"
    );
    $listQuery->execute($params);

    $items = array_map(static fn(array $row): array => [
        'id'         => (int) $row['id'],
        'text'       => $row['text'],
        'category'   => $row['category'],
        'rating'     => (int) $row['likes'] - (int) $row['dislikes'],
        'reports'    => (int) $row['reports'],
        'hidden'     => (bool) $row['hidden'],
        'created_at' => $row['created_at'],
        'place'      => [
            'id'      => (int) $row['place_id'],
            'lat'     => (float) $row['lat'],
            'lng'     => (float) $row['lng'],
            'address' => $row['address'],
        ],
    ], $listQuery->fetchAll());

    json_out([
        'items'        => $items,
        'has_more'     => count($items) === $limit,
        'hidden_total' => (int) $db->query('SELECT COUNT(*) FROM stories WHERE hidden = 1')->fetchColumn(),
    ]);
}

$input     = body();
$id     = int_param($input, 'id') ?? fail('Не указана история');
$action = $input['action'] ?? null;

$db->beginTransaction();
$storyQuery = $db->prepare('SELECT place_id FROM stories WHERE id = ?');
$storyQuery->execute([$id]);
$placeId = $storyQuery->fetchColumn();
if ($placeId === false) {
    $db->rollBack();
    fail('История не найдена', 404);
}

switch ($action) {
    case 'restore':
        // Clearing the report rows too lets visitors report the story again if it relapses.
        $db->prepare('UPDATE stories SET hidden = 0, reports = 0 WHERE id = ?')->execute([$id]);
        $db->prepare('DELETE FROM reports WHERE story_id = ?')->execute([$id]);
        break;
    case 'hide':
        $db->prepare('UPDATE stories SET hidden = 1 WHERE id = ?')->execute([$id]);
        break;
    case 'delete':
        $db->prepare('DELETE FROM stories WHERE id = ?')->execute([$id]);
        // A place with no stories left would still attract new stories posted within SNAP_METERS.
        $db->prepare('DELETE FROM places WHERE id = ? AND NOT EXISTS (SELECT 1 FROM stories WHERE place_id = ?)')
            ->execute([$placeId, $placeId]);
        break;
    default:
        $db->rollBack();
        fail('Неизвестное действие');
}
$db->commit();

json_out(['id' => $id, 'action' => $action]);
