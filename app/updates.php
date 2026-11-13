<?php
// app/updates.php
// مركز التحديثات في نسخة PHP: رفع ملف الموقع ZIP (كما يُرسل، مثل Alomranxprophp-2.2.0.zip)
// من مركز تحكم المطوّر، ثم فحصه ومعاينة الملفات المتغيرة، ثم تثبيته مع Snapshot للملفات
// المستبدلة يمكن الرجوع إليها (Rollback). لا يلمس التحديث مجلد data أبداً، ولا يستبدل app/config.php.

declare(strict_types=1);

define('UPDATES_DIR', ROOT_DIR . '/updates');
const UPDATE_MAX_PACKAGE = 40 * 1024 * 1024;
const UPDATE_MAX_TOTAL = 120 * 1024 * 1024;
const UPDATE_MAX_ENTRIES = 2000;
const UPDATE_FORBIDDEN_ROOTS = ['data', 'backups', 'updates', '.git', 'node_modules'];
const UPDATE_RELEASE_TYPES = ['Major', 'Minor', 'Patch', 'Security', 'Bug Fix', 'Feature', 'Design', 'Content'];

function updates_ensure(): void {
    foreach ([UPDATES_DIR, UPDATES_DIR . '/incoming', UPDATES_DIR . '/snapshots'] as $d) if (!is_dir($d)) @mkdir($d, 0700, true);
    if (!is_file(UPDATES_DIR . '/.htaccess')) @file_put_contents(UPDATES_DIR . '/.htaccess', "Require all denied\nDeny from all\n");
}
function update_history(): array { $h = read_json('update_history.json', []); return is_list($h) ? $h : []; }
function update_settings(): array {
    return array_merge(['retentionCount' => 5, 'autoRollbackOnHealthFailure' => true, 'maintenanceDuringUpdate' => false, 'requireSignedUpdates' => false], obj(read_json('update_settings.json', [])));
}
function semver(string $v): ?array { return preg_match('/^v?(\d+)\.(\d+)\.(\d+)/', trim($v), $m) ? [(int)$m[1], (int)$m[2], (int)$m[3]] : null; }
function semver_cmp(string $a, string $b): int { $x = semver($a) ?? [0, 0, 0]; $y = semver($b) ?? [0, 0, 0]; return $x <=> $y; }
function plain_version(string $v): string { $s = semver($v); return $s ? implode('.', $s) : $v; }
function update_get(string $id): ?array { foreach (update_history() as $u) if (($u['id'] ?? '') === $id) return $u; return null; }
function update_save(array $rec): void {
    with_lock('update_history', function () use ($rec) {
        $h = update_history();
        $found = false;
        foreach ($h as $i => $u) if ($u['id'] === $rec['id']) { $h[$i] = $rec; $found = true; }
        if (!$found) array_unshift($h, $rec);
        write_json('update_history.json', array_slice($h, 0, 200));
    });
}
function update_package_path(string $id): string { return UPDATES_DIR . '/incoming/update-' . $id . '.zip'; }
function update_snapshot_path(string $id): string { return UPDATES_DIR . '/snapshots/snapshot-' . $id . '.zip'; }

// قراءة الحزمة: يعيد [ZipArchive, prefix, entries(path=>index), version]
function update_open_package(string $file): array {
    if (!class_exists('ZipArchive')) throw new RuntimeException('مكتبة ZIP غير متاحة في PHP على الاستضافة.');
    $zip = new ZipArchive();
    if ($zip->open($file) !== true) throw new RuntimeException('الملف ليس ZIP صالحاً.');
    if ($zip->numFiles > UPDATE_MAX_ENTRIES) throw new RuntimeException('الحزمة تحتوي على عدد ملفات أكبر من المسموح.');
    $names = [];
    $total = 0;
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $st = $zip->statIndex($i);
        $n = str_replace('\\', '/', (string)$st['name']);
        if ($n === '' || str_ends_with($n, '/')) continue;
        if (str_starts_with($n, '/') || preg_match('#(^|/)\.\.(/|$)#', $n) || preg_match('/^[A-Za-z]:/', $n)) throw new RuntimeException('الحزمة تحتوي على مسار ملف غير آمن: ' . $n);
        if (str_starts_with($n, '__MACOSX/') || basename($n) === '.DS_Store') continue;
        // الرموز الرمزية مرفوضة
        if ($zip->getExternalAttributesIndex($i, $op, $attr) && $op === ZipArchive::OPSYS_UNIX && (($attr >> 16) & 0170000) === 0120000) throw new RuntimeException('الرموز الرمزية غير مسموحة داخل الحزمة.');
        $total += (int)$st['size'];
        $names[$n] = $i;
    }
    if ($total > UPDATE_MAX_TOTAL) throw new RuntimeException('الحجم غير المضغوط للحزمة كبير جداً.');
    // الملفات في جذر الحزمة، أو داخل مجلد واحد (عند ضغط المجلد نفسه)
    $prefix = '';
    if (!isset($names['index.php'])) {
        foreach (array_keys($names) as $n) if (preg_match('#^([^/]+/)index\.php$#', $n, $m)) { $prefix = $m[1]; break; }
        if ($prefix === '') throw new RuntimeException('هذا ليس ملف موقع العمران: لا يحتوي index.php.');
    }
    $entries = [];
    foreach ($names as $n => $i) {
        if ($prefix !== '' && !str_starts_with($n, $prefix)) continue;
        $rel = substr($n, strlen($prefix));
        $first = explode('/', $rel)[0];
        if (in_array($first, UPDATE_FORBIDDEN_ROOTS, true)) continue; // لا يمس البيانات أو النسخ أبداً
        $entries[$rel] = $i;
    }
    if (!isset($entries['index.php'], $entries['app/lib.php'])) throw new RuntimeException('هذا ليس ملف موقع العمران: تنقصه ملفات أساسية (app/lib.php).');
    $version = isset($entries['VERSION']) ? trim((string)$zip->getFromIndex($entries['VERSION'])) : '';
    return [$zip, $entries, $version];
}

// الملفات التي سيغيّرها التحديث مقارنة بالموقع الحالي
function update_inspect(array $rec): array {
    $file = update_package_path($rec['id']);
    if (!is_file($file)) throw new RuntimeException('حزمة التحديث غير موجودة.');
    [$zip, $entries, $version] = update_open_package($file);
    $added = [];
    $modified = [];
    $bytes = 0;
    foreach ($entries as $rel => $i) {
        if ($rel === 'app/config.php' && is_file(ROOT_DIR . '/app/config.php')) continue; // إعدادات الموقع الحالية تبقى كما هي
        $target = ROOT_DIR . '/' . $rel;
        $content = (string)$zip->getFromIndex($i);
        if (!is_file($target)) { $added[] = $rel; $bytes += strlen($content); }
        elseif (sha1_file($target) !== sha1($content)) { $modified[] = $rel; $bytes += strlen($content); }
    }
    $zip->close();
    $current = app_version();
    $target = $version !== '' ? $version : ($rec['manifest']['version'] ?? '');
    $risk = fn($p) => ($p === 'index.php' || str_starts_with($p, 'app/') || $p === '.htaccess') ? 'HIGH' : 'MEDIUM';
    $all = array_merge($added, $modified);
    $overall = !$all ? 'NONE' : (count(array_filter($all, fn($p) => $risk($p) === 'HIGH')) ? 'HIGH' : 'MEDIUM');
    $free = @disk_free_space(ROOT_DIR);
    $checks = [
        'version' => $target !== '' && semver($target) !== null && semver_cmp($target, $current) > 0,
        'compatibility' => PHP_VERSION_ID >= 80100,
        'storage' => $free === false || $free > $bytes * 3 + 5 * 1024 * 1024,
        'permissions' => is_writable(ROOT_DIR) && is_writable(ROOT_DIR . '/app'),
        'dependencies' => class_exists('ZipArchive'),
        'manifest' => true,
        'signature' => true,
        'backup' => true,
        'migrations' => true,
    ];
    return [
        'currentVersion' => plain_version($current), 'targetVersion' => plain_version($target),
        'changes' => array_merge(array_map(fn($p) => ['path' => $p, 'action' => 'add', 'risk' => $risk($p)], $added), array_map(fn($p) => ['path' => $p, 'action' => 'modify', 'risk' => $risk($p)], $modified)),
        'diff' => ['added' => $added, 'modified' => $modified, 'deleted' => []],
        'fileCount' => count($all), 'totalBytes' => $bytes, 'noOp' => !$all, 'needsRestart' => false,
        'migrations' => [], 'migrationDataFiles' => [], 'overallRisk' => $overall,
        'signature' => ['present' => false, 'verified' => false, 'required' => false, 'reason' => 'لا يوجد توقيع.'],
        'checks' => $checks,
        'checkErrors' => array_values(array_filter([
            $checks['version'] ? '' : ($target === '' ? 'لم يُعرف رقم إصدار الحزمة.' : "الإصدار $target ليس أحدث من الإصدار الحالي " . plain_version($current) . '.'),
            $checks['storage'] ? '' : 'لا توجد مساحة كافية على الاستضافة.',
            $checks['permissions'] ? '' : 'لا توجد صلاحية كتابة على ملفات الموقع.',
        ])),
    ];
}

/* ---------- المسارات ---------- */

function api_updates_upload(): void {
    $d = require_dev_permission('upload_update');
    rate_limit('update_upload', 10, 1800, 'تم تجاوز عدد محاولات رفع حزم التحديث. حاول لاحقاً.', $d['id']);
    updates_ensure();
    if (empty($_FILES) && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) send_json(['error' => 'حجم الملف أكبر من المسموح في إعدادات الاستضافة (upload_max_filesize).'], 400);
    $f = uploaded_files('package')[0] ?? null;
    if (!$f) send_json(['error' => 'اختر ملف الموقع ZIP.'], 400);
    if (in_array($f['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) || $f['size'] > UPDATE_MAX_PACKAGE) send_json(['error' => 'حجم الملف يتجاوز 40MB.'], 400);
    if ($f['error'] !== UPLOAD_ERR_OK || !is_upload($f['tmp'])) send_json(['error' => 'تعذر رفع الملف.'], 400);
    if (!preg_match('/\.zip$/i', (string)$f['name'])) send_json(['error' => 'يجب رفع ملف ZIP فقط.'], 400);
    $id = gmdate('YmdHis') . '-' . rand_hex(4);
    $dest = update_package_path($id);
    if (!move_upload($f['tmp'], $dest)) send_json(['error' => 'تعذر حفظ الملف على الاستضافة.'], 500);
    try { [$zip, $entries, $version] = update_open_package($dest); $zip->close(); }
    catch (RuntimeException $e) { @unlink($dest); send_json(['error' => $e->getMessage()], 400); }
    $formVersion = trim(str_val($_POST['version'] ?? ''));
    $v = $version !== '' ? $version : $formVersion;
    if ($v === '' || !semver($v)) { @unlink($dest); send_json(['error' => 'لم أجد رقم الإصدار داخل الحزمة (ملف VERSION). اكتب رقم الإصدار في النموذج.'], 400); }
    $type = in_array($_POST['releaseType'] ?? '', UPDATE_RELEASE_TYPES, true) ? $_POST['releaseType'] : 'Patch';
    $rec = ['id' => $id, 'status' => 'READY', 'uploadedAt' => now_iso(), 'uploadedBy' => $d['username'], 'originalName' => mb_slice((string)$f['name'], 160),
        'manifest' => ['title' => mb_slice(trim(str_val($_POST['name'] ?? '')), 160) ?: ('تحديث الموقع ' . plain_version($v)), 'version' => plain_version($v), 'fullVersion' => $v,
            'description' => mb_slice(trim(str_val($_POST['description'] ?? '')), 3000), 'releaseType' => $type,
            'releaseNotes' => mb_slice(trim(str_val($_POST['releaseNotes'] ?? '')), 8000), 'requirements' => mb_slice(trim(str_val($_POST['requirements'] ?? '')), 3000),
            'requiresRestart' => false, 'requiresMigration' => false, 'mandatory' => ($_POST['mandatory'] ?? '') === 'true'],
        'snapshot' => false, 'appliedAt' => null, 'appliedBy' => null, 'scheduledAt' => null];
    $rec['preview'] = update_inspect($rec);
    $rec['overallRisk'] = $rec['preview']['overallRisk'];
    $rec['title'] = $rec['manifest']['title'];
    $rec['version'] = $rec['manifest']['version'];
    $rec['releaseType'] = $type;
    $rec['mandatory'] = $rec['manifest']['mandatory'];
    update_save($rec);
    log_dev_action($d, 'update_upload', $rec['title'] . ' v' . $rec['version']);
    send_json(['ok' => true, 'update' => $rec], 201);
}

function update_apply(string $id, string $by): array {
    @set_time_limit(300);
    $rec = update_get($id);
    if (!$rec) throw new RuntimeException('التحديث غير موجود.');
    if (!in_array($rec['status'], ['READY', 'SCHEDULED'], true)) throw new RuntimeException('لا يمكن تثبيت تحديث بحالة: ' . $rec['status']);
    $p = update_inspect($rec);
    if ($p['noOp']) throw new RuntimeException('لا توجد ملفات متغيرة في هذه الحزمة؛ الموقع مطابق لها بالفعل.');
    foreach ($p['checks'] as $ok) if (!$ok) throw new RuntimeException('فشل فحص ما قبل التثبيت: ' . implode(' ', $p['checkErrors']));
    updates_ensure();
    // 1) Snapshot: نسخة من الملفات التي ستُستبدل، وقائمة الملفات الجديدة (لحذفها عند Rollback)
    $snap = new ZipArchive();
    if ($snap->open(update_snapshot_path($id), ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) throw new RuntimeException('تعذر إنشاء Snapshot.');
    foreach ($p['diff']['modified'] as $rel) $snap->addFile(ROOT_DIR . '/' . $rel, 'files/' . $rel);
    $snap->addFromString('added.json', json_encode($p['diff']['added'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    $snap->addFromString('version.txt', app_version());
    if (!$snap->close()) throw new RuntimeException('تعذر حفظ Snapshot.');
    $rec['status'] = 'APPLYING';
    update_save($rec);
    // 2) تثبيت الملفات (كتابة كل ملف في ملف مؤقت ثم استبداله)
    [$zip, $entries] = update_open_package(update_package_path($id));
    $written = [];
    $error = null;
    foreach (array_merge($p['diff']['added'], $p['diff']['modified']) as $rel) {
        $target = ROOT_DIR . '/' . $rel;
        $content = $zip->getFromIndex($entries[$rel]);
        $dir = dirname($target);
        if (!is_dir($dir) && !@mkdir($dir, 0755, true)) { $error = "تعذر إنشاء المجلد $rel"; break; }
        $tmp = $target . '.upd-' . rand_hex(3);
        if (@file_put_contents($tmp, $content) === false || !@rename($tmp, $target)) { @unlink($tmp); $error = "تعذر كتابة الملف $rel"; break; }
        $written[] = $rel;
        // 3) التحقق: الملف المكتوب يطابق الحزمة
        if (sha1_file($target) !== sha1((string)$content)) { $error = "الملف $rel لم يُكتب بشكل صحيح"; break; }
    }
    $zip->close();
    if (function_exists('opcache_reset')) @opcache_reset();
    if ($error) {
        $rolled = update_settings()['autoRollbackOnHealthFailure'] !== false;
        if ($rolled) update_restore_snapshot($id);
        $rec['status'] = 'FAILED_APPLY';
        $rec['error'] = $error . ($rolled ? ' — تمت استعادة الملفات السابقة تلقائياً.' : '');
        update_save($rec);
        log_error('فشل تطبيق تحديث: ' . $rec['error']);
        throw new RuntimeException($rec['error']);
    }
    $rec['status'] = 'APPLIED';
    $rec['appliedAt'] = now_iso();
    $rec['appliedBy'] = $by;
    $rec['snapshot'] = true;
    $rec['previousVersion'] = plain_version($p['currentVersion']);
    $rec['preview'] = $p;
    unset($rec['error']);
    update_save($rec);
    update_prune_snapshots();
    @unlink(update_package_path($id)); // الحزمة لم تعد مطلوبة بعد التثبيت (الـ Snapshot يكفي للرجوع)
    return $rec;
}

function update_restore_snapshot(string $id): void {
    $snap = new ZipArchive();
    if ($snap->open(update_snapshot_path($id)) !== true) throw new RuntimeException('Snapshot غير موجود؛ لا يمكن الرجوع.');
    for ($i = 0; $i < $snap->numFiles; $i++) {
        $n = (string)$snap->getNameIndex($i);
        if (!str_starts_with($n, 'files/')) continue;
        $rel = substr($n, 6);
        if ($rel === '' || str_contains($rel, '..')) continue;
        $target = ROOT_DIR . '/' . $rel;
        if (!is_dir(dirname($target))) @mkdir(dirname($target), 0755, true);
        $tmp = $target . '.rb-' . rand_hex(3);
        file_put_contents($tmp, $snap->getFromIndex($i));
        rename($tmp, $target);
    }
    $added = json_decode((string)$snap->getFromName('added.json'), true) ?: [];
    foreach ($added as $rel) if (is_string($rel) && !str_contains($rel, '..') && !in_array(explode('/', $rel)[0], UPDATE_FORBIDDEN_ROOTS, true)) @unlink(ROOT_DIR . '/' . $rel);
    $snap->close();
    if (function_exists('opcache_reset')) @opcache_reset();
}

function update_prune_snapshots(): void {
    $keep = max(1, (int)update_settings()['retentionCount']);
    $h = update_history();
    $withSnap = array_values(array_filter($h, fn($u) => !empty($u['snapshot'])));
    foreach (array_slice($withSnap, $keep) as $u) {
        @unlink(update_snapshot_path($u['id']));
        $u['snapshot'] = false;
        update_save($u);
    }
}

function update_dashboard(): array {
    $h = update_history();
    $applied = array_values(array_filter($h, fn($u) => $u['status'] === 'APPLIED'));
    $pending = count(array_filter($h, fn($u) => in_array($u['status'], ['READY', 'SCHEDULED'], true)));
    $last = $h[0] ?? null;
    return ['currentVersion' => plain_version(app_version()), 'availableUpdates' => $pending, 'lastInstalledVersion' => $applied[0]['version'] ?? null,
        'scheduledUpdates' => count(array_filter($h, fn($u) => $u['status'] === 'SCHEDULED')), 'status' => $pending ? 'UPDATES_AVAILABLE' : ($applied ? 'UP_TO_DATE' : 'READY'),
        'lastUpdate' => $applied[0]['appliedAt'] ?? null, 'lastStatus' => $last['status'] ?? null];
}

// التحديثات المجدولة: تُثبَّت مع أول زيارة بعد موعدها
function updates_tick(): void {
    if (!is_file(DATA_DIR . '/update_history.json')) return;
    foreach (update_history() as $u) {
        if (($u['status'] ?? '') !== 'SCHEDULED' || empty($u['scheduledAt']) || strtotime((string)$u['scheduledAt']) > time()) continue;
        try { update_apply($u['id'], 'جدولة: ' . ($u['scheduledBy'] ?? '')); log_dev_action(null, 'update_apply_scheduled', $u['title'] . ' v' . $u['version']); }
        catch (Throwable $e) { log_error('فشل تطبيق تحديث مجدول: ' . $e->getMessage()); }
    }
}

function api_dev_updates(string $sub, string $method): void {
    $d = require_developer();
    $perm = fn($p) => dev_has_permission($d, $p) || send_json(['error' => "لا تملك صلاحية $p."], 403);
    if ($sub === 'updates/dashboard') { $perm('view_updates'); send_json(['ok' => true, 'dashboard' => update_dashboard(), 'settings' => update_settings(), 'permissions' => array_values(array_filter(UPDATE_PERMISSIONS, fn($p) => dev_has_permission($d, $p)))]); }
    if ($sub === 'updates/history') { $perm('view_updates'); send_json(['updates' => update_history(), 'dashboard' => update_dashboard()]); }
    if ($sub === 'updates/settings') {
        if ($method === 'GET') { $perm('view_updates'); send_json(['settings' => update_settings()]); }
        $perm('install_update');
        $b = json_body();
        $s = update_settings();
        if (array_key_exists('retentionCount', $b)) $s['retentionCount'] = max(1, min(50, (int)$b['retentionCount']));
        foreach (['autoRollbackOnHealthFailure', 'maintenanceDuringUpdate'] as $k) if (array_key_exists($k, $b)) $s[$k] = (bool)$b[$k];
        write_json('update_settings.json', $s);
        log_dev_action($d, 'update_settings', json_out_str($s));
        send_json(['ok' => true, 'settings' => $s]);
    }
    if ($sub === 'updates/upload' && $method === 'POST') { $perm('upload_update'); api_updates_upload(); }
    if ($sub === 'updates/report') send_json(['report' => null]);
    if ($sub === 'updates/check') send_json(['error' => 'فحص حزم npm خاص بنسخة Node.js؛ نسخة PHP لا تستخدم حزماً خارجية.'], 400);
    if (str_starts_with($sub, 'version-check')) {
        if ($method === 'GET') send_json(['ok' => true, 'status' => ['currentVersion' => plain_version(app_version()), 'checkUrl' => '', 'autoCheckEnabled' => false, 'intervalHours' => 24, 'lastCheckedAt' => null, 'lastResult' => null, 'updateAvailable' => false]]);
        send_json(['error' => 'الفحص التلقائي لإصدار جديد غير مستخدم. ارفع ملف التحديث مباشرة من «إنشاء تحديث جديد».'], 400);
    }
    if (preg_match('#^updates/packages/([A-Za-z0-9-]{8,40})(?:/([a-z-]+))?$#', $sub, $m)) {
        $id = $m[1];
        $action = $m[2] ?? '';
        $rec = update_get($id);
        if (!$rec) send_json(['error' => 'التحديث غير موجود.'], 404);
        try {
            if ($action === '' && $method === 'GET') {
                $perm('view_updates');
                if (in_array($rec['status'], ['READY', 'SCHEDULED'], true)) $rec['preview'] = update_inspect($rec);
                send_json(['update' => $rec]);
            }
            if ($action === 'apply' && $method === 'POST') {
                $perm('install_update');
                rate_limit('update_apply', 10, 3600, 'تم تجاوز عدد عمليات تطبيق التحديثات. حاول لاحقاً.', $d['id']);
                $r = update_apply($id, $d['username']);
                log_dev_action($d, 'update_apply', $r['title'] . ' v' . $r['version']);
                send_json(['ok' => true, 'update' => $r]);
            }
            if ($action === 'rollback' && $method === 'POST') {
                $perm('rollback_update');
                if (empty($rec['snapshot']) || $rec['status'] !== 'APPLIED') throw new RuntimeException('لا يوجد Snapshot لهذا التحديث للرجوع إليه.');
                // الرجوع مسموح لآخر تحديث مثبّت فقط حتى لا تختلط الإصدارات
                foreach (update_history() as $u) { if ($u['status'] === 'APPLIED') { if ($u['id'] !== $id) throw new RuntimeException('يمكن الرجوع عن آخر تحديث مثبّت فقط.'); break; } }
                update_restore_snapshot($id);
                $rec['status'] = 'ROLLED_BACK';
                $rec['rolledBackAt'] = now_iso();
                $rec['rolledBackBy'] = $d['username'];
                $rec['snapshot'] = false;
                @unlink(update_snapshot_path($id));
                update_save($rec);
                log_dev_action($d, 'update_rollback', $rec['title'] . ' v' . $rec['version']);
                send_json(['ok' => true, 'update' => $rec]);
            }
            if ($action === 'schedule' && $method === 'POST') {
                $perm('install_update');
                if ($rec['status'] !== 'READY') throw new RuntimeException('يمكن جدولة تحديث جاهز فقط.');
                $t = strtotime(str_val(json_body()['scheduledAt'] ?? ''));
                if (!$t || $t < time()) throw new RuntimeException('موعد الجدولة غير صحيح أو في الماضي.');
                $rec['status'] = 'SCHEDULED';
                $rec['scheduledAt'] = gmdate('Y-m-d\TH:i:s.000\Z', $t);
                $rec['scheduledBy'] = $d['username'];
                update_save($rec);
                log_dev_action($d, 'update_schedule', $rec['title'] . ' at ' . $rec['scheduledAt']);
                send_json(['ok' => true, 'update' => $rec]);
            }
            if ($action === 'cancel-schedule' && $method === 'POST') {
                $perm('install_update');
                if ($rec['status'] !== 'SCHEDULED') throw new RuntimeException('التحديث غير مجدول.');
                $rec['status'] = 'READY';
                $rec['scheduledAt'] = null;
                update_save($rec);
                send_json(['ok' => true, 'update' => $rec]);
            }
            if ($action === '' && $method === 'DELETE') {
                $perm('delete_update');
                if (!in_array($rec['status'], ['READY', 'SCHEDULED', 'FAILED_APPLY', 'ROLLED_BACK'], true)) throw new RuntimeException('لا يمكن حذف تحديث مثبّت؛ استخدم Rollback أولاً.');
                @unlink(update_package_path($id));
                with_lock('update_history', fn() => write_json('update_history.json', array_values(array_filter(update_history(), fn($u) => $u['id'] !== $id))));
                log_dev_action($d, 'update_delete', $rec['title'] . ' v' . $rec['version']);
                send_json(['ok' => true]);
            }
        } catch (RuntimeException $e) { send_json(['error' => $e->getMessage()], 400); }
    }
    send_json(['error' => 'غير موجود.'], 404);
}
