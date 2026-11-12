<?php
// app/auth.php
// الجلسات وتسجيل الدخول والمستخدمين والصلاحيات — نفس server.js و lib/security.js.
// كلمات المرور بنفس صيغة scrypt في نسخة Node (salt:hash) فتعمل الحسابات الحالية كما هي.

declare(strict_types=1);

const OWNER_ROLES = ['super_admin', 'owner'];
const PERMISSION_KEYS = ['addWork', 'editWork', 'hideWork', 'deleteWork', 'viewMessages', 'replyMessages', 'manageChat'];
const SESSION_TTL = 12 * 3600;

/* ---------- كلمات المرور (scrypt N=16384 r=8 p=1، طول 64) ---------- */

function scrypt_derive(string $password, string $salt): string {
    if (function_exists('sodium_crypto_pwhash_scryptsalsa208sha256') && strlen($salt) === 32) {
        // opslimit/memlimit يقابلان N=16384, r=8, p=1 في libsodium
        return sodium_crypto_pwhash_scryptsalsa208sha256(64, $password, $salt, 524288, 33554432);
    }
    return scrypt_php($password, $salt, 16384, 8, 1, 64);
}

function hash_password(string $plain): string {
    $salt = rand_hex(16);
    return $salt . ':' . bin2hex(scrypt_derive($plain, $salt));
}

function verify_password(string $plain, $stored): bool {
    if (!is_string($stored) || !str_contains($stored, ':')) return false;
    [$salt, $hex] = explode(':', $stored, 2);
    if (strlen($hex) !== 128 || !ctype_xdigit($hex)) return false;
    try { return hash_equals(strtolower($hex), bin2hex(scrypt_derive($plain, $salt))); }
    catch (Throwable $e) { return false; }
}

// تنفيذ scrypt بلغة PHP فقط — يُستخدم إن لم تتوفر مكتبة sodium على الاستضافة
function scrypt_php(string $password, string $salt, int $N, int $r, int $p, int $dkLen): string {
    $B = hash_pbkdf2('sha256', $password, $salt, 1, $p * 128 * $r, true);
    $out = '';
    for ($i = 0; $i < $p; $i++) $out .= scrypt_romix(substr($B, $i * 128 * $r, 128 * $r), $N, $r);
    return hash_pbkdf2('sha256', $password, $out, 1, $dkLen, true);
}
function scrypt_romix(string $block, int $N, int $r): string {
    $X = array_values(unpack('V*', $block));
    $V = [];
    for ($i = 0; $i < $N; $i++) { $V[$i] = $X; $X = scrypt_blockmix($X, $r); }
    $last = (2 * $r - 1) * 16;
    for ($i = 0; $i < $N; $i++) {
        $j = $X[$last] & ($N - 1);
        $Vj = $V[$j];
        foreach ($X as $k => $v) $X[$k] = $v ^ $Vj[$k];
        $X = scrypt_blockmix($X, $r);
    }
    return pack('V*', ...$X);
}
function scrypt_blockmix(array $B, int $r): array {
    $X = array_slice($B, (2 * $r - 1) * 16, 16);
    $Y = [];
    for ($i = 0; $i < 2 * $r; $i++) {
        for ($k = 0; $k < 16; $k++) $X[$k] ^= $B[$i * 16 + $k];
        $X = salsa20_8($X);
        $Y[$i] = $X;
    }
    $out = [];
    for ($i = 0; $i < $r; $i++) array_push($out, ...$Y[2 * $i]);
    for ($i = 0; $i < $r; $i++) array_push($out, ...$Y[2 * $i + 1]);
    return $out;
}
function salsa20_8(array $in): array {
    $x = $in;
    $R = fn($a, $b) => ((($a << $b) | ($a >> (32 - $b))) & 0xffffffff);
    for ($i = 0; $i < 8; $i += 2) {
        $x[4] ^= $R(($x[0] + $x[12]) & 0xffffffff, 7);  $x[8] ^= $R(($x[4] + $x[0]) & 0xffffffff, 9);
        $x[12] ^= $R(($x[8] + $x[4]) & 0xffffffff, 13); $x[0] ^= $R(($x[12] + $x[8]) & 0xffffffff, 18);
        $x[9] ^= $R(($x[5] + $x[1]) & 0xffffffff, 7);   $x[13] ^= $R(($x[9] + $x[5]) & 0xffffffff, 9);
        $x[1] ^= $R(($x[13] + $x[9]) & 0xffffffff, 13); $x[5] ^= $R(($x[1] + $x[13]) & 0xffffffff, 18);
        $x[14] ^= $R(($x[10] + $x[6]) & 0xffffffff, 7); $x[2] ^= $R(($x[14] + $x[10]) & 0xffffffff, 9);
        $x[6] ^= $R(($x[2] + $x[14]) & 0xffffffff, 13); $x[10] ^= $R(($x[6] + $x[2]) & 0xffffffff, 18);
        $x[3] ^= $R(($x[15] + $x[11]) & 0xffffffff, 7); $x[7] ^= $R(($x[3] + $x[15]) & 0xffffffff, 9);
        $x[11] ^= $R(($x[7] + $x[3]) & 0xffffffff, 13); $x[15] ^= $R(($x[11] + $x[7]) & 0xffffffff, 18);
        $x[1] ^= $R(($x[0] + $x[3]) & 0xffffffff, 7);   $x[2] ^= $R(($x[1] + $x[0]) & 0xffffffff, 9);
        $x[3] ^= $R(($x[2] + $x[1]) & 0xffffffff, 13);  $x[0] ^= $R(($x[3] + $x[2]) & 0xffffffff, 18);
        $x[6] ^= $R(($x[5] + $x[4]) & 0xffffffff, 7);   $x[7] ^= $R(($x[6] + $x[5]) & 0xffffffff, 9);
        $x[4] ^= $R(($x[7] + $x[6]) & 0xffffffff, 13);  $x[5] ^= $R(($x[4] + $x[7]) & 0xffffffff, 18);
        $x[11] ^= $R(($x[10] + $x[9]) & 0xffffffff, 7); $x[8] ^= $R(($x[11] + $x[10]) & 0xffffffff, 9);
        $x[9] ^= $R(($x[8] + $x[11]) & 0xffffffff, 13); $x[10] ^= $R(($x[9] + $x[8]) & 0xffffffff, 18);
        $x[12] ^= $R(($x[15] + $x[14]) & 0xffffffff, 7); $x[13] ^= $R(($x[12] + $x[15]) & 0xffffffff, 9);
        $x[14] ^= $R(($x[13] + $x[12]) & 0xffffffff, 13); $x[15] ^= $R(($x[14] + $x[13]) & 0xffffffff, 18);
    }
    for ($i = 0; $i < 16; $i++) $x[$i] = ($x[$i] + $in[$i]) & 0xffffffff;
    return $x;
}

/* ---------- الجلسات ---------- */

function is_https(): bool {
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https' || ($_SERVER['SERVER_PORT'] ?? '') == '443';
}

function session_boot(bool $create = false): bool {
    if (session_status() === PHP_SESSION_ACTIVE) return true;
    $name = 'alomran_sid';
    if (!$create && empty($_COOKIE[$name])) return false;
    $dir = DATA_DIR . '/php-sessions';
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    session_save_path($dir);
    session_name($name);
    ini_set('session.gc_maxlifetime', (string)SESSION_TTL);
    ini_set('session.use_strict_mode', '1');
    ini_set('session.gc_probability', '1');
    ini_set('session.gc_divisor', '100');
    session_set_cookie_params(['lifetime' => SESSION_TTL, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax', 'secure' => is_https()]);
    session_start();
    // انتهاء الجلسة بعد 12 ساعة من آخر نشاط
    if (!empty($_SESSION['_at']) && time() - (int)$_SESSION['_at'] > SESSION_TTL) { $_SESSION = []; }
    $_SESSION['_at'] = time();
    return true;
}

function session_user_id(): ?string {
    if (!session_boot()) return null;
    return isset($_SESSION['userId']) ? (string)$_SESSION['userId'] : null;
}

// سجل الجلسات المفتوحة لكل مستخدم، لإنهائها فوراً عند الإيقاف أو تغيير كلمة المرور
function session_registry_update(callable $fn): void {
    with_lock('session_registry', function () use ($fn) {
        $reg = read_json('session_registry.json', []);
        if (!is_array($reg)) $reg = [];
        $reg = $fn(obj($reg));
        write_json('session_registry.json', $reg ?: (object)[]);
    });
}
function session_login(string $userId, string $key = 'userId'): void {
    session_boot(true);
    session_regenerate_id(true);
    $_SESSION[$key] = $userId;
    $sid = session_id();
    session_registry_update(function ($reg) use ($userId, $sid) {
        $list = array_values(array_filter($reg[$userId] ?? [], fn($s) => is_file(DATA_DIR . '/php-sessions/sess_' . $s)));
        $list[] = $sid;
        $reg[$userId] = array_slice(array_values(array_unique($list)), -20);
        return $reg;
    });
}
function session_logout(): void {
    if (!session_boot()) return;
    $uid = $_SESSION['userId'] ?? null;
    $sid = session_id();
    $_SESSION = [];
    session_destroy();
    setcookie(session_name(), '', ['expires' => time() - 3600, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax', 'secure' => is_https()]);
    if ($uid) session_registry_update(function ($reg) use ($uid, $sid) {
        $reg[$uid] = array_values(array_diff($reg[$uid] ?? [], [$sid]));
        if (!$reg[$uid]) unset($reg[$uid]);
        return $reg;
    });
}
function destroy_user_sessions(string $userId): void {
    $current = session_status() === PHP_SESSION_ACTIVE ? session_id() : '';
    session_registry_update(function ($reg) use ($userId, $current) {
        foreach ($reg[$userId] ?? [] as $sid) {
            if ($sid === $current) continue;
            if (preg_match('/^[A-Za-z0-9,-]+$/', $sid)) @unlink(DATA_DIR . '/php-sessions/sess_' . $sid);
        }
        unset($reg[$userId]);
        return $reg;
    });
}

/* ---------- المستخدمون ---------- */

function get_users(): array { $u = read_json('users.json', []); return is_list($u) ? $u : []; }
function save_users(array $users): void { write_json('users.json', array_values($users)); }
function find_user(string $id): ?array { foreach (get_users() as $u) if (($u['id'] ?? '') === $id) return $u; return null; }
function find_user_by_username($username): ?array {
    $n = mb_strtolower(trim(str_val($username)), 'UTF-8');
    foreach (get_users() as $u) if (mb_strtolower((string)($u['username'] ?? ''), 'UTF-8') === mb_strtolower(str_val($username), 'UTF-8')) return $u;
    return null;
}
function get_developers(): array { $d = read_json('developers.json', []); return is_list($d) ? $d : []; }

function role_of(?array $u): ?string {
    if (!$u) return null;
    if (!empty($u['role'])) return (string)$u['role'];
    return !empty($u['isAdmin']) ? 'super_admin' : 'editor';
}
function is_owner(?array $u): bool { return in_array(role_of($u), OWNER_ROLES, true); }

function public_user(array $u): array {
    return ['id' => $u['id'], 'username' => $u['username'], 'email' => ($u['email'] ?? '') ?: '', 'role' => role_of($u),
        'isAdmin' => $u['isAdmin'] ?? null, 'suspended' => $u['suspended'] ?? null, 'permissions' => $u['permissions'] ?? null, 'createdAt' => $u['createdAt'] ?? null];
}

/* ---------- الحماية ---------- */

$GLOBALS['CURRENT_USER'] = null;
function current_user(): ?array { return $GLOBALS['CURRENT_USER']; }

function require_login(): array {
    $id = session_user_id();
    if (!$id) send_json(['error' => 'يجب تسجيل الدخول أولاً.'], 401);
    $u = find_user($id);
    if (!$u) { session_logout(); send_json(['error' => 'الحساب لم يعد موجوداً.'], 401); }
    if (!empty($u['suspended'])) { session_logout(); send_json(['error' => 'تم إيقاف هذا الحساب مؤقتاً من قبل المسؤول.'], 403); }
    return $GLOBALS['CURRENT_USER'] = $u;
}
function require_admin(): array {
    $u = require_login();
    if (empty($u['isAdmin'])) send_json(['error' => 'هذا الإجراء متاح للمسؤول فقط.'], 403);
    return $u;
}
function has_permission(array $u, string $p): bool { return !empty($u['isAdmin']) || !empty($u['permissions'][$p]); }
function require_permission(string $p): array {
    $u = require_login();
    if (!has_permission($u, $p)) send_json(['error' => 'لا تملك صلاحية تنفيذ هذا الإجراء.'], 403);
    return $u;
}

// حماية CSRF لطلبات التعديل: نفس منطق Node (Origin/Referer من نفس الموقع)
function csrf_check(string $path, string $method): void {
    if (!in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true) || !str_starts_with($path, '/api/')) return;
    $exempt = ['/api/login', '/api/setup', '/api/contact', '/api/logout', '/api/developer/login', '/api/developer/setup', '/api/developer/logout'];
    if (in_array($path, $exempt, true)) return;
    $origin = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
    $referer = (string)($_SERVER['HTTP_REFERER'] ?? '');
    if ($origin === '' && $referer === '') {
        if (($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') send_json(['error' => 'طلب غير مسموح به من هذا المصدر.'], 403);
        return;
    }
    $host = (string)($_SERVER['HTTP_HOST'] ?? '');
    $ok = false;
    foreach (['https', 'http'] as $proto) {
        $base = $proto . '://' . $host;
        if ($origin === $base || ($referer !== '' && str_starts_with($referer, $base . '/'))) $ok = true;
    }
    if (!$ok) send_json(['error' => 'طلب غير مسموح به من هذا المصدر.'], 403);
}

/* ---------- السجلات ---------- */

function log_activity(string $action, string $entity, string $label): void {
    try {
        $u = current_user();
        with_lock('activity_log', function () use ($u, $action, $entity, $label) {
            $list = read_json('activity_log.json', []);
            if (!is_list($list)) $list = [];
            array_unshift($list, ['id' => 'log_' . rand_hex(6), 'userId' => $u['id'] ?? null, 'username' => $u['username'] ?? 'غير معروف',
                'action' => $action, 'entity' => $entity, 'label' => $label, 'timestamp' => now_iso()]);
            write_json('activity_log.json', array_slice($list, 0, 500));
        });
    } catch (Throwable $e) { /* لا يوقف العملية */ }
}

function js_id(string $prefix): string { return $prefix . base_convert((string)(int)(microtime(true) * 1000), 10, 36) . substr(base_convert(rand_hex(4), 16, 36), 0, 4); }

function log_security_event(string $type, $username): void {
    try {
        with_lock('security_events', function () use ($type, $username) {
            $list = read_json('security_events.json', []);
            if (!is_list($list)) $list = [];
            array_unshift($list, ['id' => js_id('sec_'), 'type' => $type, 'username' => $username !== '' ? str_val($username) : null, 'ip' => client_ip() ?: null, 'timestamp' => now_iso()]);
            write_json('security_events.json', array_slice($list, 0, 500));
        });
    } catch (Throwable $e) {}
}

/* ---------- رمز التهيئة لإنشاء الحساب الأول ---------- */
// يُحفظ في data/bootstrap-token.txt (يُقرأ من مدير الملفات في الاستضافة) أو يُضبط في app/config.php

function bootstrap_token(): string {
    $cfg = trim((string)(app_config()['bootstrap_token'] ?? ''));
    if ($cfg !== '') return $cfg;
    $f = DATA_DIR . '/bootstrap-token.txt';
    $t = is_file($f) ? trim((string)file_get_contents($f)) : '';
    if (!preg_match('/^[A-Za-z0-9_-]{24,}$/', $t)) {
        $t = b64url(random_bytes(24));
        @file_put_contents($f, $t);
        @chmod($f, 0600);
    }
    return $t;
}
function bootstrap_matches(string $input, string $token): bool {
    if ($token === '') return false;
    $text = preg_replace('/[\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2066}-\x{2069}\x{FEFF}]/u', '', $input);
    preg_match_all('/[A-Za-z0-9_-]{24,}/', $text, $m);
    $ok = false;
    foreach (array_merge([trim($text)], $m[0]) as $c) if ($c !== '' && hash_equals(hash('sha256', $token), hash('sha256', $c))) $ok = true;
    return $ok;
}
function bootstrap_from_request(): string {
    $h = (string)($_SERVER['HTTP_X_BOOTSTRAP_TOKEN'] ?? '');
    $b = json_body()['bootstrapToken'] ?? '';
    return mb_slice($h !== '' ? $h : (is_string($b) ? $b : ''), 2000);
}

// إذن إعداد لمرة واحدة بعد «إعادة التعيين» (30 دقيقة)
function setup_grant_create(string $kind): string {
    $t = b64url(random_bytes(32));
    with_lock('setup_grants', function () use ($kind, $t) {
        $g = obj(read_json('setup_grants.json', []));
        $g[$kind] = ['hash' => hash('sha256', $t), 'expiresAt' => time() + 1800];
        write_json('setup_grants.json', $g);
    });
    return $t;
}
function setup_grant_valid(string $kind, $token): bool {
    $token = trim(str_val($token));
    if ($token === '' || strlen($token) > 200) return false;
    $g = obj(read_json('setup_grants.json', []))[$kind] ?? null;
    return $g && time() <= (int)$g['expiresAt'] && hash_equals((string)$g['hash'], hash('sha256', $token));
}
function setup_grant_consume(string $kind): void {
    with_lock('setup_grants', function () use ($kind) {
        $g = obj(read_json('setup_grants.json', []));
        unset($g[$kind]);
        write_json('setup_grants.json', $g ?: (object)[]);
    });
}

function password_used_by_developer(string $pw): bool {
    foreach (get_developers() as $d) if (verify_password($pw, $d['passwordHash'] ?? '')) return true;
    return false;
}

const EMAIL_SIMPLE_RE = '/^[^\s@]+@[^\s@]+\.[^\s@]+$/';

/* ---------- المسارات ---------- */

function api_setup(): void {
    rate_limit('setup', 5, 1800, 'تم تجاوز عدد محاولات التهيئة. حاول لاحقاً.');
    $viaGrant = setup_grant_valid('admin', $_SERVER['HTTP_X_SETUP_GRANT'] ?? '');
    if (!$viaGrant && !bootstrap_matches(bootstrap_from_request(), bootstrap_token())) {
        send_json(['error' => 'رمز التهيئة غير صحيح أو مفقود. تجده في ملف data/bootstrap-token.txt من مدير الملفات في الاستضافة (أو في app/config.php إن ضبطته هناك).', 'needsToken' => true], 403);
    }
    if (get_users()) send_json(['error' => 'تم إعداد النظام مسبقاً. الرجاء تسجيل الدخول.'], 403);
    $b = json_body();
    $username = str_val($b['username'] ?? '');
    $password = str_val($b['password'] ?? '');
    $norm = mb_strtolower(trim($username), 'UTF-8');
    foreach (get_developers() as $d) if (mb_strtolower((string)$d['username'], 'UTF-8') === $norm) send_json(['error' => 'اسم المستخدم مستخدم بالفعل في حساب المطوّر. اختر اسماً مختلفاً.'], 409);
    if (password_used_by_developer($password)) send_json(['error' => 'كلمة المرور مستخدمة بالفعل لحساب المطوّر. يجب أن تكون كلمة مرور المسؤول مختلفة.'], 409);
    if ($username === '' || $password === '') send_json(['error' => 'اسم المستخدم وكلمة المرور مطلوبان.'], 400);
    if (mb_len($username) > 100 || mb_len($password) > 128) send_json(['error' => 'بيانات الإعداد تتجاوز الحد المسموح.'], 400);
    if (mb_len($password) < 12) send_json(['error' => 'كلمة المرور يجب ألا تقل عن 12 حرفاً.'], 400);
    $email = strtolower(trim(str_val($b['email'] ?? '')));
    if (!preg_match(EMAIL_SIMPLE_RE, $email) || strlen($email) > 254) send_json(['error' => 'يرجى إدخال بريد إلكتروني صحيح.'], 400);
    $admin = [
        'id' => 'u_admin_' . base_convert((string)(int)(microtime(true) * 1000), 10, 36),
        'username' => trim($username), 'email' => $email, 'passwordHash' => hash_password($password),
        'role' => 'super_admin', 'isAdmin' => true, 'suspended' => false,
        'permissions' => array_fill_keys(PERMISSION_KEYS, true), 'createdAt' => now_iso(), 'createdBy' => 'setup',
    ];
    $ok = with_lock('users', function () use ($admin) {
        if (get_users()) return false;
        save_users([$admin]);
        return true;
    });
    if (!$ok) send_json(['error' => 'تم إعداد النظام مسبقاً. الرجاء تسجيل الدخول.'], 403);
    if ($viaGrant) setup_grant_consume('admin');
    @unlink(DATA_DIR . '/bootstrap-token.txt');
    session_login($admin['id']);
    send_json(['ok' => true, 'user' => public_user($admin), 'message' => 'تم إنشاء الحساب بنجاح.'], 201);
}

function api_login(): void {
    $b = json_body();
    $username = str_val($b['username'] ?? '');
    $password = str_val($b['password'] ?? '');
    rate_limit('login', 10, 900, 'تم تجاوز عدد محاولات الدخول. حاول لاحقاً.', mb_slice(mb_strtolower(trim($username), 'UTF-8'), 100));
    if ($username === '' || $password === '') send_json(['error' => 'يرجى إدخال اسم المستخدم وكلمة المرور.'], 400);
    if (mb_len($username) > 100 || mb_len($password) > 128) send_json(['error' => 'بيانات الدخول تتجاوز الحد المسموح.'], 400);
    $u = find_user_by_username($username);
    if (!$u || !verify_password($password, $u['passwordHash'] ?? '')) {
        log_security_event('failed_login', $username);
        send_json(['error' => 'اسم المستخدم أو كلمة المرور غير صحيحة.'], 401);
    }
    if (!empty($u['suspended'])) send_json(['error' => 'هذا الحساب موقوف مؤقتاً. تواصل مع المسؤول.'], 403);
    session_login($u['id']);
    send_json(['ok' => true, 'user' => public_user($u)]);
}

function api_logout(): void { session_logout(); send_json(['ok' => true]); }
function api_session(): void { send_json(['user' => public_user(require_login())]); }

function api_users_list(): void { require_admin(); send_json(['users' => array_map('public_user', get_users())]); }

function api_users_create(): void {
    $me = require_admin();
    $b = json_body();
    $username = str_val($b['username'] ?? '');
    $password = str_val($b['password'] ?? '');
    if ($username === '' || $password === '') send_json(['error' => 'اسم المستخدم وكلمة المرور مطلوبان.'], 400);
    if (mb_len($password) < 12) send_json(['error' => 'كلمة المرور يجب ألا تقل عن 12 حرفاً.'], 400);
    $users = get_users();
    $norm = mb_strtolower(trim($username), 'UTF-8');
    foreach ($users as $u) if (mb_strtolower((string)$u['username'], 'UTF-8') === $norm) send_json(['error' => 'اسم المستخدم مستخدم بالفعل.'], 409);
    foreach (get_developers() as $d) if (mb_strtolower((string)$d['username'], 'UTF-8') === $norm) send_json(['error' => 'اسم المستخدم مستخدم بالفعل في حساب المطوّر.'], 409);
    if (password_used_by_developer($password)) send_json(['error' => 'كلمة المرور مستخدمة بالفعل لحساب المطوّر. اختر كلمة مرور مختلفة.'], 409);
    $email = strtolower(trim(str_val($b['email'] ?? '')));
    if ($email === '' || strlen($email) > 254 || !preg_match(EMAIL_SIMPLE_RE, $email)) send_json(['error' => 'يرجى إدخال بريد إلكتروني صحيح لكل مستخدم.'], 400);
    foreach ($users as $u) if (!empty($u['email']) && strtolower((string)$u['email']) === $email) send_json(['error' => 'هذا البريد الإلكتروني مستخدم بالفعل.'], 409);
    $role = trim(str_val($b['role'] ?? '')) ?: 'editor';
    if (!in_array($role, ['super_admin', 'owner', 'editor', 'viewer'], true)) send_json(['error' => 'دور غير صحيح.'], 400);
    if (in_array($role, OWNER_ROLES, true) && role_of($me) !== 'super_admin') send_json(['error' => 'المالك الرئيسي فقط يستطيع إضافة مالكين.'], 403);
    $isOwner = in_array($role, OWNER_ROLES, true);
    $perms = [];
    foreach (PERMISSION_KEYS as $k) $perms[$k] = $isOwner || ($role !== 'viewer' && !empty($b['permissions'][$k]));
    $new = ['id' => 'u_' . rand_hex(6), 'username' => trim($username), 'email' => $email, 'passwordHash' => hash_password($password),
        'role' => $role, 'isAdmin' => $isOwner, 'suspended' => false, 'permissions' => $perms, 'createdAt' => now_iso(), 'createdBy' => $me['id']];
    try {
        with_lock('users', function () use ($new) { $u = get_users(); $u[] = $new; save_users($u); });
    } catch (Throwable $e) {
        log_error('تعذر حفظ المستخدم الجديد: ' . $e->getMessage());
        send_json(['error' => 'تعذر حفظ المستخدم. تحقق من صلاحية الكتابة لمجلد data ثم أعد المحاولة.'], 500);
    }
    log_activity('create', 'user', $new['username']);
    send_json(['ok' => true, 'user' => public_user($new), 'message' => 'تم إنشاء المستخدم بنجاح.'], 201);
}

// تعديل مستخدم تحت القفل: $fn تعيد رسالة خطأ [status, msg] أو null
function users_mutate(string $id, callable $fn): array {
    return with_lock('users', function () use ($id, $fn) {
        $users = get_users();
        foreach ($users as $i => $u) {
            if (($u['id'] ?? '') !== $id) continue;
            $err = $fn($users[$i]);
            if ($err) send_json(['error' => $err[1]], $err[0]);
            save_users($users);
            return $users[$i];
        }
        send_json(['error' => 'المستخدم غير موجود.'], 404);
    });
}

function api_users_permissions(string $id): void {
    require_admin();
    $p = json_body()['permissions'] ?? null;
    $u = users_mutate($id, function (&$u) use ($p) {
        if (!empty($u['isAdmin'])) return [400, 'لا يمكن تعديل صلاحيات حساب المسؤول.'];
        if (!is_array($p)) return [400, 'بيانات الصلاحيات غير صحيحة.'];
        $u['permissions'] = [];
        foreach (PERMISSION_KEYS as $k) $u['permissions'][$k] = !empty($p[$k]);
        return null;
    });
    log_activity('update', 'user', 'صلاحيات: ' . $u['username']);
    send_json(['ok' => true, 'user' => public_user($u)]);
}

function api_users_suspend(string $id): void {
    $me = require_admin();
    $s = json_body()['suspended'] ?? null;
    if (!is_bool($s)) send_json(['error' => 'قيمة suspended يجب أن تكون true أو false.'], 400);
    $u = users_mutate($id, function (&$u) use ($s, $me) {
        if ($u['id'] === $me['id']) return [400, 'لا يمكنك إيقاف حسابك الخاص.'];
        if (role_of($u) === 'super_admin') return [403, 'لا يمكن إيقاف حساب المالك الرئيسي.'];
        if (is_owner($u) && role_of($me) !== 'super_admin') return [403, 'المالك الرئيسي فقط يستطيع إيقاف حساب مالك.'];
        $u['suspended'] = $s;
        return null;
    });
    log_activity($s ? 'suspend' : 'reactivate', 'user', $u['username']);
    if ($s) destroy_user_sessions($u['id']);
    send_json(['ok' => true, 'user' => public_user($u)]);
}

function api_users_me_password(): void {
    $me = require_login();
    rate_limit('password_change', 5, 900, 'تم تجاوز عدد محاولات تغيير كلمة المرور. حاول لاحقاً.', $me['id']);
    $b = json_body();
    $cur = str_val($b['currentPassword'] ?? '');
    $new = str_val($b['newPassword'] ?? '');
    if ($cur === '' || $new === '') send_json(['error' => 'يرجى إدخال كلمة المرور الحالية والجديدة.'], 400);
    if (mb_len($new) < 12 || mb_len($new) > 128 || mb_len($cur) > 128) send_json(['error' => 'طول كلمة المرور غير مسموح.'], 400);
    if (!verify_password($cur, $me['passwordHash'] ?? '')) send_json(['error' => 'كلمة المرور الحالية غير صحيحة.'], 401);
    if (password_used_by_developer($new)) send_json(['error' => 'كلمة المرور الجديدة مستخدمة بالفعل لحساب المطوّر. اختر كلمة مرور مختلفة.'], 409);
    foreach (get_users() as $u) if ($u['id'] !== $me['id'] && verify_password($new, $u['passwordHash'] ?? '')) send_json(['error' => 'كلمة المرور الجديدة مستخدمة بالفعل لحساب آخر. اختر كلمة مرور مختلفة.'], 409);
    $hash = hash_password($new);
    users_mutate($me['id'], function (&$u) use ($hash) { $u['passwordHash'] = $hash; return null; });
    password_resets_clear($me['id']);
    send_json(['ok' => true]);
}

function api_user_profile(): void {
    $me = require_login();
    $b = json_body();
    $u = users_mutate($me['id'], function (&$u) use ($b) {
        $users = get_users();
        if (array_key_exists('email', $b)) {
            $e = strtolower(trim(str_val($b['email'])));
            if (strlen($e) > 254 || !preg_match(EMAIL_SIMPLE_RE, $e)) return [400, 'البريد الإلكتروني غير صحيح.'];
            foreach ($users as $x) if ($x['id'] !== $u['id'] && !empty($x['email']) && strtolower((string)$x['email']) === $e) return [409, 'هذا البريد الإلكتروني مستخدم بالفعل.'];
            $u['email'] = $e;
        }
        if (array_key_exists('username', $b)) {
            $n = trim(str_val($b['username']));
            if (mb_len($n) < 3 || mb_len($n) > 100) return [400, 'اسم المستخدم يجب أن يكون بين 3 و100 حرف.'];
            $lower = mb_strtolower($n, 'UTF-8');
            foreach ($users as $x) if ($x['id'] !== $u['id'] && mb_strtolower((string)$x['username'], 'UTF-8') === $lower) return [409, 'اسم المستخدم مستخدم بالفعل.'];
            foreach (get_developers() as $d) if (mb_strtolower((string)$d['username'], 'UTF-8') === $lower) return [409, 'اسم المستخدم مستخدم بالفعل في حساب المطوّر.'];
            $u['username'] = $n;
        }
        return null;
    });
    $GLOBALS['CURRENT_USER'] = $u;
    log_activity('update', 'user_profile', $u['username']);
    send_json(['ok' => true, 'user' => public_user($u), 'message' => 'تم تحديث البيانات بنجاح.']);
}

function api_users_delete(string $id): void {
    $me = require_admin();
    $users = get_users();
    $target = null;
    foreach ($users as $u) if ($u['id'] === $id) $target = $u;
    if (!$target) send_json(['error' => 'المستخدم غير موجود.'], 404);
    $self = $target['id'] === $me['id'];
    if (!$self && !is_owner($me)) send_json(['error' => 'ليس لديك صلاحية حذف المستخدمين.'], 403);
    if (!$self && role_of($target) === 'super_admin') send_json(['error' => 'لا يمكن حذف حساب المالك الرئيسي.'], 403);
    if (!$self && is_owner($target) && role_of($me) !== 'super_admin') send_json(['error' => 'المالك الرئيسي فقط يستطيع حذف حساب مالك.'], 403);
    if (role_of($target) === 'super_admin' && count(array_filter($users, fn($u) => role_of($u) === 'super_admin')) <= 1) {
        send_json(['error' => 'لا يمكن حذف آخر مالك رئيسي في النظام. استخدم "إعادة تعيين لوحة التحكم" بدلاً من ذلك.'], 400);
    }
    with_lock('users', function () use ($id) { save_users(array_filter(get_users(), fn($u) => $u['id'] !== $id)); });
    log_activity('delete', 'user', $target['username']);
    destroy_user_sessions($target['id']);
    if ($self) session_logout();
    send_json(['ok' => true, 'self' => $self, 'message' => 'تم حذف المستخدم بنجاح.']);
}

function api_users_reset_password(string $id): void {
    $me = require_admin();
    $new = str_val(json_body()['newPassword'] ?? '');
    $target = find_user($id);
    if (!$target) send_json(['error' => 'المستخدم غير موجود.'], 404);
    if (!is_owner($me)) send_json(['error' => 'ليس لديك صلاحية استعادة كلمات المرور.'], 403);
    if ($target['id'] === $me['id']) send_json(['error' => 'لتغيير كلمة مرورك استخدم نموذج تغيير كلمة المرور.'], 400);
    if (role_of($target) === 'super_admin' || (is_owner($target) && role_of($me) !== 'super_admin')) send_json(['error' => 'لا يمكنك تغيير كلمة مرور هذا الحساب.'], 403);
    if ($new === '' || mb_len($new) < 12 || mb_len($new) > 128) send_json(['error' => 'كلمة المرور يجب أن تكون بين 12 و128 حرفاً.'], 400);
    $hash = hash_password($new);
    users_mutate($id, function (&$u) use ($hash) { $u['passwordHash'] = $hash; return null; });
    log_activity('reset_password', 'user', $target['username']);
    password_resets_clear($id);
    destroy_user_sessions($id);
    send_json(['ok' => true, 'message' => 'تم تعيين كلمة المرور الجديدة وتسجيل خروج المستخدم من كل الأجهزة.']);
}

function api_admin_reset_setup(): void {
    $me = require_admin();
    if (role_of($me) !== 'super_admin') send_json(['error' => 'المالك الرئيسي فقط يستطيع إعادة تعيين لوحة التحكم.'], 403);
    $users = get_users();
    log_activity('admin_action', 'reset_setup', 'تم إعادة تعيين لوحة تحكم الإدارة');
    with_lock('users', fn() => save_users([]));
    with_lock('messages', fn() => write_json('messages.json', []));
    foreach ($users as $u) destroy_user_sessions($u['id']);
    session_logout();
    send_json(['ok' => true, 'setupGrant' => setup_grant_create('admin'), 'message' => 'تم إعادة تعيين لوحة التحكم بنجاح. سيتم إعادة توجيهك إلى صفحة الإعداد.']);
}

/* ---------- استعادة كلمة المرور بالبريد ---------- */

function password_resets_live(): array {
    $l = read_json('password_resets.json', []);
    if (!is_list($l)) return [];
    return array_values(array_filter($l, fn($e) => strtotime((string)($e['expiresAt'] ?? '')) > time()));
}
function password_resets_clear(string $userId): void {
    with_lock('password_resets', fn() => write_json('password_resets.json', array_values(array_filter(password_resets_live(), fn($e) => $e['userId'] !== $userId))));
}

function api_password_forgot(): void {
    rate_limit('forgot_password', 5, 900, 'تم تجاوز عدد طلبات استعادة كلمة المرور. حاول لاحقاً.');
    $email = strtolower(trim(str_val(json_body()['email'] ?? '')));
    if ($email === '' || strlen($email) > 254 || !preg_match(EMAIL_SIMPLE_RE, $email)) send_json(['error' => 'يرجى إدخال بريد إلكتروني صحيح.'], 400);
    respond_then(fn() => send_json(['ok' => true, 'message' => 'إذا كان البريد مسجلاً لدينا فستصلك رسالة برابط تعيين كلمة مرور جديدة خلال دقائق.']), function () use ($email) {
        $user = null;
        foreach (get_users() as $u) if (!empty($u['email']) && strtolower((string)$u['email']) === $email) $user = $u;
        if (!$user || !empty($user['suspended'])) return;
        // رابط الاستعادة يُبنى من العنوان الرسمي فقط وليس من ترويسة Host
        $base = rtrim((string)(getenv('APP_BASE_URL') ?: (app_config()['base_url'] ?? '')), '/');
        if ($base === '') { log_error('استعادة كلمة المرور: اضبط base_url في app/config.php لإرسال رابط الاستعادة.'); return; }
        $token = b64url(random_bytes(32));
        with_lock('password_resets', function () use ($user, $token) {
            $l = array_values(array_filter(password_resets_live(), fn($e) => $e['userId'] !== $user['id']));
            $l[] = ['tokenHash' => hash('sha256', $token), 'userId' => $user['id'], 'expiresAt' => gmdate('Y-m-d\TH:i:s.000\Z', time() + 1800)];
            write_json('password_resets.json', $l);
        });
        $link = $base . '/reset-password#token=' . rawurlencode($token);
        $name = (string)$user['username'];
        send_mail([$user['email']], 'استعادة كلمة المرور — لوحة تحكم العمران',
            "مرحباً $name،\n\nطلبت استعادة كلمة المرور لحسابك. افتح الرابط التالي لتعيين كلمة مرور جديدة (صالح لمدة 30 دقيقة ولمرة واحدة):\n\n$link\n\nإذا لم تطلب ذلك فتجاهل هذه الرسالة، ولن يتغير شيء في حسابك.",
            '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.8"><p>مرحباً ' . h($name) . '،</p><p>طلبت استعادة كلمة المرور لحسابك في لوحة تحكم العمران.</p>'
            . '<p><a href="' . h($link) . '" style="display:inline-block;padding:10px 18px;background:#1c2a35;color:#fff;border-radius:8px;text-decoration:none">تعيين كلمة مرور جديدة</a></p>'
            . '<p style="color:#666;font-size:13px">الرابط صالح لمدة 30 دقيقة ولمرة واحدة فقط. إذا لم تطلب ذلك فتجاهل هذه الرسالة.</p></div>');
    });
}

function api_password_reset(): void {
    rate_limit('reset_password', 10, 900, 'تم تجاوز عدد محاولات تعيين كلمة المرور. حاول لاحقاً.');
    $b = json_body();
    $new = str_val($b['newPassword'] ?? '');
    $token = str_val($b['token'] ?? '');
    if ($new === '' || mb_len($new) < 12 || mb_len($new) > 128) send_json(['error' => 'كلمة المرور يجب أن تكون بين 12 و128 حرفاً.'], 400);
    if (password_used_by_developer($new)) send_json(['error' => 'كلمة المرور مستخدمة بالفعل لحساب المطوّر. اختر كلمة مرور مختلفة.'], 409);
    $invalid = fn() => send_json(['error' => 'رابط الاستعادة غير صالح أو منتهي الصلاحية. اطلب رابطاً جديداً.'], 400);
    if ($token === '' || strlen($token) > 200) $invalid();
    $userId = with_lock('password_resets', function () use ($token) {
        $l = password_resets_live();
        $h = hash('sha256', $token);
        foreach ($l as $e) if (hash_equals((string)$e['tokenHash'], $h)) {
            write_json('password_resets.json', array_values(array_filter($l, fn($x) => $x['userId'] !== $e['userId'])));
            return $e['userId'];
        }
        return null;
    });
    if (!$userId) $invalid();
    $u = find_user($userId);
    if (!$u || !empty($u['suspended'])) $invalid();
    $hash = hash_password($new);
    users_mutate($userId, function (&$x) use ($hash) { $x['passwordHash'] = $hash; return null; });
    destroy_user_sessions($userId);
    $GLOBALS['CURRENT_USER'] = $u;
    log_activity('reset_password', 'user', $u['username'] . ' (عبر البريد)');
    send_json(['ok' => true, 'message' => 'تم تعيين كلمة المرور الجديدة. يمكنك تسجيل الدخول الآن.']);
}

/* ---------- حماية صفحات الإدارة ---------- */

function guard_admin_page(string $name): void {
    $hasUsers = (bool)get_users();
    if ($name === 'login' && !$hasUsers) redirect('/setup');
    if ($name === 'setup' && $hasUsers) redirect('/login');
    // رمز التهيئة يُنشأ عند فتح صفحة الإعداد ليجده المالك في data/bootstrap-token.txt
    if ($name === 'setup' || ($name === 'developer-setup' && !get_developers())) bootstrap_token();
    if ($name === 'dashboard') {
        $id = session_user_id();
        $u = $id ? find_user($id) : null;
        if (!$u || !empty($u['suspended'])) { if ($id) session_logout(); redirect('/login'); }
    }
    $hasDevs = (bool)get_developers();
    if ($name === 'developer-login' && !$hasDevs) redirect('/developer-setup');
    if ($name === 'developer-setup' && $hasDevs) redirect('/developer-login');
    if ($name === 'developer-center' && !dev_session_id()) redirect('/developer-login');
}

function redirect(string $to): void {
    header('Location: ' . $to, true, 302);
    exit;
}
