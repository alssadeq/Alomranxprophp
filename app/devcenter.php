<?php
// app/devcenter.php
// مركز تحكم المطوّر — نفس lib/developerRoutes.js و lib/devStore.js و lib/devSession.js و lib/backup.js.
// جلسة المطوّر مستقلة تماماً عن جلسة لوحة التحكم (كوكي alomran_dev_sid، تُحفظ hash الرموز فقط).

declare(strict_types=1);

const DEV_COOKIE = 'alomran_dev_sid';
const DEV_TTL = 12 * 3600;
define('BACKUPS_DIR', ROOT_DIR . '/backups');
const BACKUP_NAME_RE = '/^backup-(?:(data|media|full|site)-\d{8}-\d{6}-\d{3}\.zip|\d{8}-\d{6}-\d{3}\.tar\.gz)$/';
const BACKUP_TYPES = [
    'data' => ['label' => 'البيانات فقط', 'dirs' => ['data']],
    'media' => ['label' => 'الصور والملفات المرفوعة', 'dirs' => ['data/uploads', 'images']],
    'full' => ['label' => 'نسخة كاملة (بيانات + ملفات)', 'dirs' => ['data', 'images']],
    'site' => ['label' => 'حزمة الموقع للنقل لاستضافة أخرى', 'dirs' => ['.']],
];
const UPDATE_PERMISSIONS = ['view_updates', 'upload_update', 'install_update', 'rollback_update', 'delete_update', 'manage_backups'];
const PHP_UPDATES_NOTE = 'التحديث الآلي غير متاح في نسخة PHP. لتحديث الموقع ارفع ملف النسخة الجديدة واستخرجه في public_html من مدير الملفات (لا يحتوي مجلد data).';

/* ---------- الجلسة ---------- */

function dev_sessions(): array { return obj(read_json('dev_sessions.json', [])); }
function dev_session_id(): ?string {
    $t = (string)($_COOKIE[DEV_COOKIE] ?? '');
    if ($t === '' || strlen($t) > 200) return null;
    $e = dev_sessions()[hash('sha256', $t)] ?? null;
    if (!$e || (int)$e['expiresAt'] < time()) return null;
    return (string)$e['developerId'];
}
function dev_session_create(string $devId): void {
    $t = rand_hex(32);
    with_lock('dev_sessions', function () use ($t, $devId) {
        $s = dev_sessions();
        foreach ($s as $k => $e) if ((int)($e['expiresAt'] ?? 0) < time()) unset($s[$k]);
        $s[hash('sha256', $t)] = ['developerId' => $devId, 'expiresAt' => time() + DEV_TTL];
        write_json('dev_sessions.json', $s);
    });
    setcookie(DEV_COOKIE, $t, ['expires' => time() + DEV_TTL, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax', 'secure' => is_https()]);
}
function dev_session_destroy(?string $devId = null): void {
    $t = (string)($_COOKIE[DEV_COOKIE] ?? '');
    with_lock('dev_sessions', function () use ($t, $devId) {
        $s = dev_sessions();
        if ($t !== '') unset($s[hash('sha256', $t)]);
        if ($devId) foreach ($s as $k => $e) if (($e['developerId'] ?? '') === $devId) unset($s[$k]);
        write_json('dev_sessions.json', $s ?: (object)[]);
    });
}
function dev_clear_cookie(): void { setcookie(DEV_COOKIE, '', ['expires' => time() - 3600, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax', 'secure' => is_https()]); }

function find_developer(string $id): ?array { foreach (get_developers() as $d) if (($d['id'] ?? '') === $id) return $d; return null; }
function require_developer(): array {
    $id = dev_session_id();
    if (!$id) send_json(['error' => 'يجب تسجيل الدخول كمطوّر أولاً.'], 401);
    $d = find_developer($id);
    if (!$d) send_json(['error' => 'حساب المطوّر لم يعد موجوداً.'], 401);
    return $d;
}
function dev_has_permission(array $d, string $p): bool { return !empty($d['isSuperDeveloper']) || (is_list($d['permissions'] ?? null) && in_array($p, $d['permissions'], true)); }
function require_dev_permission(string $p): array { $d = require_developer(); if (!dev_has_permission($d, $p)) send_json(['error' => "لا تملك صلاحية $p."], 403); return $d; }
function public_developer(array $d): array { return ['id' => $d['id'], 'username' => $d['username'], 'isSuperDeveloper' => !empty($d['isSuperDeveloper']), 'createdAt' => $d['createdAt'] ?? null]; }

function log_dev_action(?array $dev, string $action, string $details = ''): void {
    try {
        with_lock('dev_audit', function () use ($dev, $action, $details) {
            $l = read_json('developer_audit_log.json', []);
            if (!is_list($l)) $l = [];
            array_unshift($l, ['id' => js_id('daudit_'), 'developerId' => $dev['id'] ?? null, 'username' => $dev['username'] ?? 'غير معروف', 'action' => $action, 'details' => $details, 'timestamp' => now_iso()]);
            write_json('developer_audit_log.json', array_slice($l, 0, 500));
        });
    } catch (Throwable $e) {}
}

/* ---------- وضع الصيانة ---------- */

function get_maintenance(): array {
    $m = read_json('maintenance.json', null);
    if (!is_array($m)) return ['enabled' => false, 'message' => ['ar' => 'الموقع تحت الصيانة حالياً، سنعود قريباً.', 'en' => 'The site is under maintenance. We will be back soon.'], 'updatedAt' => null, 'updatedBy' => null];
    return $m;
}
function maintenance_gate(string $path): void {
    $m = get_maintenance();
    if (empty($m['enabled'])) return;
    $allowed = ['/login', '/setup', '/dashboard', '/forgot-password', '/reset-password', '/developer-login', '/developer-setup', '/developer-center'];
    foreach ($allowed as $p) if ($path === $p || $path === "$p.html") return;
    if (in_array($path, ['/api/login', '/api/logout', '/api/session', '/api/setup', '/api/password/forgot', '/api/password/reset'], true)) return;
    foreach (['/api/developer/', '/css/', '/js/', '/fonts/', '/images/'] as $p) if (str_starts_with($path, $p)) return;
    // المسؤول المسجّل دخوله يرى الموقع كاملاً (نفس سلوك نسخة Node)
    if (session_user_id()) return;
    if (dev_session_id()) return;
    if (str_starts_with($path, '/api/')) send_json(['error' => 'الموقع تحت الصيانة حالياً.', 'maintenance' => true, 'message' => $m['message'] ?? (object)[]], 503);
    header('Retry-After: 3600');
    $ar = h($m['message']['ar'] ?? 'الموقع تحت الصيانة حالياً، سنعود قريباً.');
    $en = h($m['message']['en'] ?? 'The site is under maintenance. We will be back soon.');
    send_html('<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>الموقع تحت الصيانة</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#1E2A32;
       font-family: system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif;padding:24px;}
  .card{width:100%;max-width:420px;background:#fff;border-radius:14px;
        box-shadow:0 10px 30px rgba(24,32,38,.25);padding:36px 28px;text-align:center;}
  .card strong{display:block;font-size:20px;color:#1E2A32;margin-bottom:4px;}
  .card span{font-size:12.5px;color:#5d6066;}
  h1{font-size:20px;margin:22px 0 10px;color:#1A1A1A;}
  p{font-size:14.5px;color:#5d6066;line-height:1.8;margin:0 0 6px;}
  p.en{direction:ltr;font-size:13px;color:#8a8d92;margin-top:14px;}
</style>
</head>
<body>
  <div class="card">
    <strong>العمران</strong>
    <span>الذهبية للمقاولات العامة</span>
    <h1>الموقع تحت الصيانة حالياً</h1>
    <p>' . $ar . '</p>
    <p class="en">' . $en . '</p>
  </div>
</body>
</html>', 503);
}

/* ---------- الإعداد والدخول ---------- */

function api_dev_setup(): void {
    rate_limit('dev_setup', 5, 1800, 'تم تجاوز عدد محاولات التهيئة. حاول لاحقاً.');
    $viaGrant = setup_grant_valid('developer', $_SERVER['HTTP_X_SETUP_GRANT'] ?? '');
    if (!$viaGrant && !bootstrap_matches(bootstrap_from_request(), bootstrap_token())) {
        send_json(['error' => 'رمز التهيئة غير صحيح أو مفقود. تجده في ملف data/bootstrap-token.txt من مدير الملفات في الاستضافة (أو في app/config.php إن ضبطته هناك).', 'needsToken' => true], 403);
    }
    if (get_developers()) send_json(['error' => 'تم إعداد حساب المطوّر مسبقاً. الرجاء تسجيل الدخول.'], 403);
    $b = json_body();
    $username = str_val($b['username'] ?? '');
    $password = str_val($b['password'] ?? '');
    $norm = mb_strtolower(trim($username), 'UTF-8');
    foreach (get_users() as $u) if (mb_strtolower((string)$u['username'], 'UTF-8') === $norm) send_json(['error' => 'اسم المستخدم مستخدم بالفعل في حساب المسؤول/المستخدم. اختر اسماً مختلفاً.'], 409);
    foreach (get_users() as $u) if (verify_password($password, $u['passwordHash'] ?? '')) send_json(['error' => 'كلمة المرور مستخدمة بالفعل في حساب المسؤول/المستخدم. يجب أن تكون كلمة مرور المطوّر مختلفة.'], 409);
    if ($username === '' || $password === '') send_json(['error' => 'اسم المستخدم وكلمة المرور مطلوبان.'], 400);
    if (mb_len($username) > 100 || mb_len($password) > 128) send_json(['error' => 'بيانات الإعداد تتجاوز الحد المسموح.'], 400);
    if (mb_len($password) < 12) send_json(['error' => 'كلمة المرور يجب ألا تقل عن 12 حرفاً.'], 400);
    $dev = ['id' => 'dev_' . base_convert((string)(int)(microtime(true) * 1000), 10, 36), 'username' => trim($username), 'passwordHash' => hash_password($password), 'isSuperDeveloper' => true, 'createdAt' => now_iso()];
    $ok = with_lock('developers', function () use ($dev) { if (get_developers()) return false; write_json('developers.json', [$dev]); return true; });
    if (!$ok) send_json(['error' => 'تم إعداد حساب المطوّر مسبقاً. الرجاء تسجيل الدخول.'], 403);
    if ($viaGrant) setup_grant_consume('developer');
    dev_session_create($dev['id']);
    log_dev_action($dev, 'setup', 'إنشاء حساب المطوّر الأول');
    send_json(['ok' => true, 'developer' => public_developer($dev)], 201);
}

function api_dev_login(): void {
    $b = json_body();
    $username = str_val($b['username'] ?? '');
    $password = str_val($b['password'] ?? '');
    rate_limit('dev_login', 10, 900, 'تم تجاوز عدد محاولات الدخول. حاول لاحقاً.', mb_slice(mb_strtolower(trim($username), 'UTF-8'), 100));
    if ($username === '' || $password === '') send_json(['error' => 'يرجى إدخال اسم المستخدم وكلمة المرور.'], 400);
    if (mb_len($username) > 100 || mb_len($password) > 128) send_json(['error' => 'بيانات الدخول تتجاوز الحد المسموح.'], 400);
    $dev = null;
    foreach (get_developers() as $d) if (mb_strtolower((string)$d['username'], 'UTF-8') === mb_strtolower($username, 'UTF-8')) $dev = $d;
    if (!$dev || !verify_password($password, $dev['passwordHash'] ?? '')) {
        log_security_event('failed_developer_login', $username);
        send_json(['error' => 'اسم المستخدم أو كلمة المرور غير صحيحة.'], 401);
    }
    dev_session_create($dev['id']);
    log_dev_action($dev, 'login');
    send_json(['ok' => true, 'developer' => public_developer($dev)]);
}

function api_dev_logout(): void { $d = require_developer(); log_dev_action($d, 'logout'); dev_session_destroy(); dev_clear_cookie(); send_json(['ok' => true]); }
function api_dev_session(): void { send_json(['developer' => public_developer(require_developer())]); }

function api_dev_password(): void {
    $d = require_developer();
    rate_limit('dev_password', 5, 900, 'تم تجاوز عدد محاولات تغيير كلمة مرور المطوّر. حاول لاحقاً.', $d['id']);
    $b = json_body();
    $cur = str_val($b['currentPassword'] ?? '');
    $new = str_val($b['newPassword'] ?? '');
    if ($cur === '' || $new === '') send_json(['error' => 'يرجى إدخال كلمة المرور الحالية والجديدة.'], 400);
    if (mb_len($new) < 12 || mb_len($new) > 128 || mb_len($cur) > 128) send_json(['error' => 'طول كلمة المرور غير مسموح.'], 400);
    if (!verify_password($cur, $d['passwordHash'] ?? '')) send_json(['error' => 'كلمة المرور الحالية غير صحيحة.'], 401);
    foreach (get_users() as $u) if (verify_password($new, $u['passwordHash'] ?? '')) send_json(['error' => 'كلمة المرور الجديدة مستخدمة بالفعل في حساب لوحة التحكم. اختر كلمة مرور مختلفة.'], 409);
    foreach (get_developers() as $x) if ($x['id'] !== $d['id'] && verify_password($new, $x['passwordHash'] ?? '')) send_json(['error' => 'كلمة المرور الجديدة مستخدمة بالفعل لحساب مطوّر آخر. اختر كلمة مرور مختلفة.'], 409);
    $hash = hash_password($new);
    with_lock('developers', function () use ($d, $hash) {
        $l = get_developers();
        foreach ($l as $i => $x) if ($x['id'] === $d['id']) $l[$i]['passwordHash'] = $hash;
        write_json('developers.json', $l);
    });
    dev_session_destroy($d['id']);
    dev_session_create($d['id']);
    log_dev_action($d, 'password_change', 'تغيير كلمة مرور المطوّر');
    send_json(['ok' => true]);
}

function api_dev_reset_setup(): void {
    $d = require_developer();
    if (empty($d['isSuperDeveloper'])) send_json(['error' => 'المطوّر الرئيسي فقط يستطيع إعادة تعيين الإعدادات.'], 403);
    log_dev_action($d, 'reset_setup', 'تم إعادة تعيين إعدادات المطورين');
    with_lock('developers', fn() => write_json('developers.json', []));
    with_lock('dev_sessions', fn() => write_json('dev_sessions.json', (object)[]));
    dev_clear_cookie();
    send_json(['ok' => true, 'setupGrant' => setup_grant_create('developer'), 'message' => 'تم إعادة تعيين الإعدادات. سيتم نقلك إلى صفحة الإعداد.']);
}

/* ---------- وكلاء الذكاء الاصطناعي ---------- */

function api_dev_ai(string $sub, string $method): void {
    $d = require_developer();
    $b = json_body();
    $fail = fn(Throwable $e, string $fb) => send_json(['error' => $e->getMessage() ?: $fb], 400);
    if ($sub === '' && $method === 'GET') send_json(ai_public_state());
    $isTest = $sub === 'preview' || preg_match('#/(test|models)$#', $sub);
    if ($isTest) rate_limit('ai_test', 20, 600, 'تم تجاوز عدد اختبارات الاتصال مؤقتاً.');
    else rate_limit('ai_agent', 60, 600, 'تم تجاوز عدد عمليات إعداد وكلاء الذكاء الاصطناعي مؤقتاً.');
    try {
        if ($sub === 'default' && $method === 'PUT') {
            $v = str_val($b['defaultAgent'] ?? '');
            if (!in_array($v, array_merge(['automatic'], AI_AGENT_IDS), true)) throw new RuntimeException('قيمة الوكيل الافتراضي غير صالحة.');
            $st = ai_mutate(function (&$s) use ($v) { $s['defaultAgent'] = $v; });
            log_dev_action($d, 'ai_default_agent', 'الوكيل الافتراضي: ' . $v);
            send_json(array_merge(['ok' => true], $st));
        }
        if ($sub === 'instructions' && $method === 'PUT') {
            $st = ai_mutate(function (&$s) use ($b) { foreach (array_keys(ai_default_instructions()) as $k) if (array_key_exists($k, $b)) $s['instructions'][$k] = mb_slice(str_replace("\r\n", "\n", js_str($b[$k])), 8000); });
            log_dev_action($d, 'ai_instructions', 'تعديل تعليمات وكيل خدمة العملاء');
            send_json(array_merge(['ok' => true], $st));
        }
        if ($sub === 'instructions/reset' && $method === 'POST') {
            $st = ai_mutate(function (&$s) { $s['instructions'] = ai_default_instructions(); });
            log_dev_action($d, 'ai_instructions', 'استعادة التعليمات الافتراضية');
            send_json(array_merge(['ok' => true], $st));
        }
        if ($sub === 'preview' && $method === 'POST') {
            $msg = mb_slice(trim(str_val($b['message'] ?? '')), 1000);
            if ($msg === '') send_json(['error' => 'اكتب رسالة للتجربة.'], 400);
            $settings = get_settings();
            $r = ai_route(fn($agent) => ai_build_system_prompt($settings, ['name' => 'عميل تجريبي'], $agent), [['role' => 'user', 'text' => $msg]]);
            if (!$r['attempted']) send_json(['ok' => false, 'error' => 'لا يوجد وكيل مفعّل. سيعمل الموقع بالردود التقليدية.']);
            if (!$r['result']) send_json(['ok' => false, 'error' => 'فشلت كل الوكلاء المفعّلة؛ سيرى العميل رسالة الاعتذار ويُحوّل لموظف.']);
            $out = ai_extract_handoff($r['result']['text']);
            send_json(['ok' => true, 'agentId' => $r['result']['agentId'], 'reply' => $out['text'], 'handoff' => $out['handoff']]);
        }
        if (preg_match('#^([a-z]+)$#', $sub, $m) && $method === 'PUT') {
            $st = ai_update_agent($m[1], $b);
            $changed = implode('، ', array_filter(array_map(fn($k) => $k === 'apiKey' ? (trim(js_str($b['apiKey'])) !== '' ? 'apiKey(تحديث)' : '') : $k, array_keys($b))));
            log_dev_action($d, 'ai_agent_update', $m[1] . ': ' . $changed);
            send_json(array_merge(['ok' => true], $st));
        }
        if (preg_match('#^([a-z]+)/key$#', $sub, $m) && $method === 'DELETE') {
            if (!in_array($m[1], AI_AGENT_IDS, true)) throw new RuntimeException('وكيل غير معروف.');
            $st = ai_mutate(function (&$s) use ($m) { $s['agents'][$m[1]] = array_merge($s['agents'][$m[1]], ['keyCipher' => '', 'keyHint' => '', 'enabled' => false, 'status' => ['state' => 'unknown', 'at' => null, 'message' => ''], 'updatedAt' => now_iso()]); });
            log_dev_action($d, 'ai_agent_key_removed', $m[1]);
            send_json(array_merge(['ok' => true], $st));
        }
        if (preg_match('#^([a-z]+)/test$#', $sub, $m) && $method === 'POST') send_json(ai_test_agent($m[1]));
        if (preg_match('#^([a-z]+)/models$#', $sub, $m) && $method === 'POST') send_json(['ok' => true, 'models' => ai_list_models($m[1])]);
    } catch (Throwable $e) { $fail($e, 'تعذر تنفيذ العملية.'); }
    send_json(['error' => 'غير موجود.'], 404);
}

/* ---------- الحالة والمعلومات والسجلات ---------- */

function app_version(): string { return trim((string)@file_get_contents(ROOT_DIR . '/VERSION')) ?: '0.0.0'; }

function api_dev_system_health(): void {
    require_developer();
    $ok = true;
    foreach (glob(DATA_DIR . '/*.json') ?: [] as $f) { $raw = (string)file_get_contents($f); if (trim($raw) !== '' && json_decode($raw) === null && json_last_error() !== JSON_ERROR_NONE) $ok = false; }
    $start = (int)@filemtime(ROOT_DIR . '/index.php');
    send_json(['status' => 'up', 'uptimeSeconds' => max(0, time() - $start), 'nodeVersion' => 'PHP ' . PHP_VERSION, 'pid' => getmypid(),
        'memory' => ['rssMB' => round(memory_get_peak_usage(true) / 1048576, 1), 'heapUsedMB' => round(memory_get_usage() / 1048576, 1), 'heapTotalMB' => round(memory_get_usage(true) / 1048576, 1)],
        'dataFiles' => $ok ? 'ok' : 'error', 'port' => (int)($_SERVER['SERVER_PORT'] ?? 0), 'environment' => 'production',
        'database' => 'file-based (JSON) — لا يوجد اتصال شبكي لفحصه', 'queue' => 'غير مستخدم في هذا المشروع', 'cache' => 'غير مستخدم في هذا المشروع']);
}
function api_dev_system_info(): void {
    require_developer();
    $ext = array_map(fn($e) => ['name' => $e, 'version' => phpversion($e) ?: ''], array_values(array_intersect(['curl', 'openssl', 'sodium', 'zip', 'mbstring', 'json', 'intl'], get_loaded_extensions())));
    send_json(['appName' => 'alomran-website-php', 'appVersion' => app_version(), 'nodeVersion' => 'PHP ' . PHP_VERSION, 'requiredNodeVersion' => 'PHP >= 8.1',
        'dependencies' => $ext, 'gitCommit' => 'غير متاح', 'environment' => 'production']);
}
function api_dev_database_center(): void {
    require_developer();
    $out = [];
    foreach (glob(DATA_DIR . '/*.json') ?: [] as $f) {
        $raw = (string)file_get_contents($f);
        $v = json_decode($raw === '' ? 'null' : $raw, true);
        $valid = !($v === null && json_last_error() !== JSON_ERROR_NONE);
        $count = is_array($v) ? count($v) : null;
        $out[] = ['file' => basename($f), 'sizeBytes' => filesize($f), 'lastModified' => gmdate('Y-m-d\TH:i:s.000\Z', filemtime($f)), 'valid' => $valid, 'recordCount' => $count];
    }
    send_json(['files' => $out]);
}
function dev_list(string $file, string $key): void { require_developer(); $l = read_json($file, []); send_json([$key => array_slice(is_list($l) ? $l : [], 0, 200)]); }
function api_dev_performance(): void { require_developer(); send_json(['routes' => [], 'note' => 'مراقبة الأداء اللحظية غير متاحة على الاستضافة المشتركة.']); }

function api_dev_feature_flags(string $method): void {
    $d = require_developer();
    if ($method === 'GET') send_json(['flags' => read_json('feature_flags.json', []) ?: (object)[]]);
    $b = json_body();
    $key = $b['key'] ?? null;
    if (!is_string($key) || $key === '') send_json(['error' => 'مفتاح الميزة (key) مطلوب.'], 400);
    $flags = with_lock('feature_flags', function () use ($key, $b, $d) {
        $f = obj(read_json('feature_flags.json', []));
        $f[$key] = ['enabled' => !empty($b['enabled']), 'updatedAt' => now_iso(), 'updatedBy' => $d['username']];
        write_json('feature_flags.json', $f);
        return $f;
    });
    log_dev_action($d, 'feature_flag_update', $key . ' = ' . (!empty($b['enabled']) ? 'true' : 'false'));
    send_json(['ok' => true, 'flags' => $flags]);
}

function api_dev_maintenance(string $method): void {
    $d = require_developer();
    if ($method === 'GET') send_json(get_maintenance());
    $b = json_body();
    $cur = get_maintenance();
    $m = ['enabled' => !empty($b['enabled']), 'message' => ['ar' => (($b['message']['ar'] ?? '') ?: $cur['message']['ar']), 'en' => (($b['message']['en'] ?? '') ?: $cur['message']['en'])],
        'updatedAt' => now_iso(), 'updatedBy' => $d['username']];
    write_json('maintenance.json', $m);
    log_dev_action($d, 'maintenance_toggle', 'enabled=' . ($m['enabled'] ? 'true' : 'false'));
    send_json(['ok' => true, 'maintenance' => $m]);
}

/* ---------- النسخ الاحتياطي ---------- */

function backups_ensure(): void {
    if (!is_dir(BACKUPS_DIR)) @mkdir(BACKUPS_DIR, 0700, true);
    if (!is_file(BACKUPS_DIR . '/.htaccess')) @file_put_contents(BACKUPS_DIR . '/.htaccess', "Require all denied\nDeny from all\n");
}
function backup_excluded(string $type, string $rel): bool {
    if (in_array($rel, ['data/php-sessions', 'data/password_resets.json', 'data/dev_sessions.json', 'data/ratelimit.json'], true) || str_ends_with($rel, '.tmp') || str_ends_with($rel, '.log') || str_contains($rel, '.tmp')) return true;
    if (str_starts_with(basename($rel), '.lock-')) return true;
    if ($type === 'data' && $rel === 'data/uploads') return true;
    return $type === 'site' && in_array($rel, ['backups', '.git', 'data/php-sessions'], true);
}
function backup_collect(string $type, string $dir, array &$out): void {
    $base = $dir === '.' ? ROOT_DIR : ROOT_DIR . '/' . $dir;
    if (!file_exists($base)) return;
    if (is_file($base)) { $out[] = $dir; return; }
    $it = new RecursiveIteratorIterator(new RecursiveCallbackFilterIterator(new RecursiveDirectoryIterator($base, FilesystemIterator::SKIP_DOTS),
        function ($f) use ($type) { $rel = ltrim(substr($f->getPathname(), strlen(ROOT_DIR)), '/'); return !$f->isLink() && !backup_excluded($type, $rel); }));
    foreach ($it as $f) if ($f->isFile()) $out[] = ltrim(substr($f->getPathname(), strlen(ROOT_DIR)), '/');
}
function backup_create(string $by, string $type): array {
    if (!class_exists('ZipArchive')) throw new RuntimeException('مكتبة ZIP غير متاحة في PHP على الاستضافة.');
    backups_ensure();
    $t = microtime(true);
    $name = 'backup-' . $type . '-' . date('Ymd-His', (int)$t) . '-' . sprintf('%03d', (int)(($t - floor($t)) * 1000)) . '.zip';
    $files = [];
    foreach (BACKUP_TYPES[$type]['dirs'] as $dir) backup_collect($type, $dir, $files);
    $files = array_values(array_unique($files));
    if (!$files) throw new RuntimeException('لا توجد ملفات لنسخها في هذا النوع.');
    $path = BACKUPS_DIR . '/' . $name;
    $zip = new ZipArchive();
    if ($zip->open($path . '.partial', ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) throw new RuntimeException('تعذر إنشاء ملف ZIP.');
    foreach ($files as $rel) $zip->addFile(ROOT_DIR . '/' . $rel, $rel);
    if ($type === 'site') $zip->addFromString('MIGRATION-README.md', "# نقل موقع العمران (نسخة PHP)\n\nأُنشئت هذه الحزمة بتاريخ " . now_iso() . ($by ? " بواسطة $by" : '') . " (الإصدار " . app_version() . ").\n\n1. ارفع الحزمة إلى public_html في الاستضافة الجديدة واستخرجها.\n2. اختر PHP 8.2 أو أحدث.\n3. افتح الموقع وسجّل الدخول بحساباتك الحالية.\n");
    if (!$zip->close()) { @unlink($path . '.partial'); throw new RuntimeException('تعذر حفظ ملف ZIP.'); }
    rename($path . '.partial', $path);
    $check = new ZipArchive();
    if ($check->open($path, ZipArchive::CHECKCONS) !== true) { @unlink($path); throw new RuntimeException('فشل التحقق من سلامة النسخة الاحتياطية بعد إنشائها.'); }
    $n = $check->numFiles;
    $check->close();
    return ['name' => $name, 'type' => $type, 'size' => filesize($path), 'files' => $n, 'createdAt' => gmdate('Y-m-d\TH:i:s.000\Z', filemtime($path)), 'createdBy' => $by ?: null, 'verified' => true];
}
function backup_path(string $name): ?string {
    if (!preg_match(BACKUP_NAME_RE, $name)) return null;
    $p = BACKUPS_DIR . '/' . $name;
    return is_file($p) ? $p : null;
}

function api_dev_backups(string $method, string $name = ''): void {
    $d = require_dev_permission('manage_backups');
    if ($name === '' && $method === 'GET') {
        backups_ensure();
        $list = [];
        foreach (scandir(BACKUPS_DIR) ?: [] as $f) {
            if (!preg_match(BACKUP_NAME_RE, $f, $m)) continue;
            $type = ($m[1] ?? '') ?: 'data';
            $list[] = ['name' => $f, 'type' => $type, 'typeLabel' => BACKUP_TYPES[$type]['label'], 'size' => filesize(BACKUPS_DIR . "/$f"), 'createdAt' => gmdate('Y-m-d\TH:i:s.000\Z', filemtime(BACKUPS_DIR . "/$f"))];
        }
        usort($list, fn($a, $b) => strcmp($b['createdAt'], $a['createdAt']));
        send_json(['backups' => $list, 'types' => array_map(fn($k) => ['id' => $k, 'label' => BACKUP_TYPES[$k]['label']], array_keys(BACKUP_TYPES))]);
    }
    if ($name === '' && $method === 'POST') {
        $type = str_val(json_body()['type'] ?? '') ?: 'data';
        if (!isset(BACKUP_TYPES[$type])) send_json(['error' => 'نوع النسخة غير معروف.'], 400);
        @set_time_limit(300);
        try { $r = backup_create($d['username'], $type); }
        catch (Throwable $e) { log_error('فشل إنشاء نسخة احتياطية: ' . $e->getMessage()); send_json(['error' => 'تعذر إنشاء نسخة احتياطية. راجع سجل الأخطاء.'], 500); }
        log_dev_action($d, 'backup_create', $r['name'] . ' (' . $r['files'] . ' ملف)');
        send_json(['ok' => true, 'backup' => $r], 201);
    }
    if (preg_match('#^(.+)/download$#', $name, $m) && $method === 'GET') {
        $p = backup_path($m[1]);
        if (!$p) send_json(['error' => 'النسخة الاحتياطية غير موجودة.'], 404);
        log_dev_action($d, 'backup_download', $m[1]);
        header('Content-Type: application/zip');
        header('Content-Disposition: attachment; filename="' . $m[1] . '"');
        header('Content-Length: ' . filesize($p));
        header('Cache-Control: no-store');
        readfile($p);
        exit;
    }
    if ($method === 'DELETE') {
        $p = backup_path($name);
        if (!$p) send_json(['error' => 'النسخة الاحتياطية غير موجودة أو اسمها غير صالح.'], 404);
        unlink($p);
        log_dev_action($d, 'backup_delete', $name);
        send_json(['ok' => true]);
    }
    send_json(['error' => 'غير موجود.'], 404);
}

/* ---------- التصدير ---------- */

function export_datasets(): array {
    return [
        'works' => ['label' => 'الأعمال والمشاريع', 'load' => fn() => get_works()],
        'messages' => ['label' => 'رسائل التواصل', 'load' => fn() => get_messages()],
        'users' => ['label' => 'المستخدمون (بدون كلمات المرور)', 'load' => fn() => array_map(function ($u) { unset($u['passwordHash']); return $u; }, get_users())],
        'conversations' => ['label' => 'المحادثات', 'load' => fn() => array_map(function ($c) { unset($c['accessTokenHash']); return $c; }, conv_all()),
            'rows' => fn($list) => array_merge([], ...array_map(fn($c) => array_map(fn($m) => ['conversationId' => $c['id'], 'status' => $c['status'], 'mode' => $c['mode'],
                'customerName' => $c['customer']['name'] ?? '', 'customerPhone' => $c['customer']['phone'] ?? '', 'serviceName' => $c['serviceName'] ?? '', 'sender' => $m['sender'],
                'kind' => $m['kind'] ?? '', 'text' => $m['text'] ?? '', 'attachment' => $m['attachment']['url'] ?? '', 'createdAt' => $m['createdAt']], $c['messages'] ?? []), $list))],
        'briefs' => ['label' => 'بريفات المشاريع', 'load' => fn() => array_map('brief_public', briefs_all())],
        'customers' => ['label' => 'قاعدة العملاء', 'load' => fn() => customers_export_rows()],
        'activity' => ['label' => 'سجل النشاط', 'load' => fn() => read_json('activity_log.json', [])],
        'settings' => ['label' => 'إعدادات الموقع', 'load' => fn() => get_settings(), 'jsonOnly' => true],
    ];
}

function api_dev_exports(string $dataset): void {
    $d = require_dev_permission('manage_backups');
    $sets = export_datasets();
    if ($dataset === '') send_json(['datasets' => array_map(fn($k) => ['id' => $k, 'label' => $sets[$k]['label'], 'formats' => !empty($sets[$k]['jsonOnly']) ? ['json'] : ['json', 'csv']], array_keys($sets))]);
    $format = ($_GET['format'] ?? '') === 'csv' ? 'csv' : 'json';
    $stamp = gmdate('Y-m-d');
    if ($dataset === 'all') {
        if ($format !== 'json') send_json(['error' => 'مجموعة البيانات أو الصيغة غير مدعومة.'], 404);
        $all = ['exportedAt' => now_iso()];
        foreach ($sets as $k => $s) $all[$k] = $s['load']();
        [$body, $type, $file] = [json_out_str($all, true), 'application/json; charset=utf-8', "alomran-all-$stamp.json"];
    } else {
        $s = $sets[$dataset] ?? null;
        if (!$s || ($format === 'csv' && !empty($s['jsonOnly']))) send_json(['error' => 'مجموعة البيانات أو الصيغة غير مدعومة.'], 404);
        $data = $s['load']();
        if ($format === 'json') [$body, $type, $file] = [json_out_str($data, true), 'application/json; charset=utf-8', "alomran-$dataset-$stamp.json"];
        else [$body, $type, $file] = [to_csv(isset($s['rows']) ? $s['rows']($data) : (is_list($data) ? $data : [$data])), 'text/csv; charset=utf-8', "alomran-$dataset-$stamp.csv"];
    }
    log_dev_action($d, 'data_export', "$dataset.$format");
    header('Content-Type: ' . $type);
    header('Cache-Control: no-store');
    header('Content-Disposition: attachment; filename="' . $file . '"');
    echo $body;
    exit;
}

/* ---------- التحديثات (غير متاحة في نسخة PHP) ---------- */

function api_dev_updates(string $sub, string $method): void {
    $d = require_developer();
    if ($sub === 'updates/dashboard') {
        send_json(['ok' => true, 'dashboard' => ['currentVersion' => app_version(), 'lastUpdate' => null, 'pending' => 0, 'installed' => 0, 'failed' => 0, 'rolledBack' => 0, 'scheduled' => 0, 'note' => PHP_UPDATES_NOTE],
            'settings' => ['retentionCount' => 5, 'autoRollbackOnHealthFailure' => false, 'maintenanceDuringUpdate' => true, 'requireSignedUpdates' => false, 'signingKeyConfigured' => false],
            'permissions' => array_values(array_filter(UPDATE_PERMISSIONS, fn($p) => dev_has_permission($d, $p)))]);
    }
    if ($sub === 'updates/history') send_json(['updates' => [], 'dashboard' => ['currentVersion' => app_version(), 'note' => PHP_UPDATES_NOTE]]);
    if ($sub === 'updates/report' && $method === 'GET') send_json(['report' => read_json('update_report.json', null)]);
    if ($sub === 'version-check' && $method === 'GET') send_json(['ok' => true, 'status' => ['currentVersion' => app_version(), 'checkUrl' => '', 'autoCheckEnabled' => false, 'intervalHours' => 24, 'lastCheckedAt' => null, 'lastResult' => null, 'note' => PHP_UPDATES_NOTE]]);
    send_json(['error' => PHP_UPDATES_NOTE], 400);
}

/* ---------- الموجّه ---------- */

function route_developer(string $path, string $method): void {
    $sub = substr($path, strlen('/api/developer/'));
    $sub = rtrim($sub, '/');
    $is = fn($p, $m) => $sub === $p && $method === $m;
    if ($is('setup', 'POST')) api_dev_setup();
    if ($is('login', 'POST')) api_dev_login();
    if ($is('logout', 'POST')) api_dev_logout();
    if ($is('session', 'GET')) api_dev_session();
    if ($is('password', 'PATCH')) api_dev_password();
    if ($is('reset-setup', 'POST')) api_dev_reset_setup();
    if ($sub === 'ai-agents' || str_starts_with($sub, 'ai-agents/')) api_dev_ai(ltrim(substr($sub, strlen('ai-agents')), '/'), $method);
    if ($is('system-health', 'GET')) api_dev_system_health();
    if ($is('system-info', 'GET')) api_dev_system_info();
    if ($is('database-center', 'GET')) api_dev_database_center();
    if ($is('security-events', 'GET')) dev_list('security_events.json', 'events');
    if ($is('error-log', 'GET')) dev_list('error_log.json', 'errors');
    if ($is('audit-log', 'GET')) dev_list('developer_audit_log.json', 'entries');
    if ($is('performance', 'GET')) api_dev_performance();
    if ($sub === 'feature-flags') api_dev_feature_flags($method);
    if ($sub === 'maintenance') api_dev_maintenance($method);
    if ($sub === 'backups' || str_starts_with($sub, 'backups/')) api_dev_backups($method, ltrim(substr($sub, strlen('backups')), '/'));
    if ($sub === 'exports' || str_starts_with($sub, 'exports/')) api_dev_exports(ltrim(substr($sub, strlen('exports')), '/'));
    if (str_starts_with($sub, 'updates/') || str_starts_with($sub, 'version-check')) api_dev_updates($sub, $method);
    send_json(['error' => 'غير موجود.'], 404);
}
