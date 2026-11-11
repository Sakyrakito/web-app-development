<?php
/**
 * GET  /api/admin-settings.php                         — {report_threshold}
 * POST /api/admin-settings.php  {report_threshold}     — reports that hide a story automatically
 *
 * A new threshold applies from the next report on; already hidden or visible stories are not re-evaluated.
 */
declare(strict_types=1);
require __DIR__ . '/admin-bootstrap.php';

$method = require_method('GET', 'POST');
require_admin();
$db = db();

if ($method === 'POST') {
    $threshold = int_param(body(), 'report_threshold');
    if ($threshold === null || $threshold < 1 || $threshold > 1000) {
        fail('Порог жалоб должен быть от 1 до 1000');
    }
    $db->prepare("INSERT INTO settings (key, value) VALUES ('report_threshold', ?)
                   ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        ->execute([(string) $threshold]);
}

json_out([
    'report_threshold' => (int) $db->query("SELECT value FROM settings WHERE key = 'report_threshold'")->fetchColumn(),
]);
