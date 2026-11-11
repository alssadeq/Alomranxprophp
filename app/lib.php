<?php
// app/lib.php
// طبقة البيانات المشتركة: قراءة وكتابة ملفات data/*.json بنفس صيغة نسخة Node تماماً،
// حتى يمكن نقل مجلد data بين النسختين دون أي تحويل.

declare(strict_types=1);

const COMPANY = 'العمران الذهبية للمقاولات العامة';
define('ROOT_DIR', dirname(__DIR__));
define('DATA_DIR', ROOT_DIR . '/data');
define('UPLOADS_DIR', DATA_DIR . '/uploads');

/* ---------- JSON ---------- */

function ensure_data_dir(): void {
    if (!is_dir(DATA_DIR)) @mkdir(DATA_DIR, 0700, true);
    // حماية إضافية إن رُفع مجلد data بدون ملف الحماية
    $ht = DATA_DIR . '/.htaccess';
    if (!is_file($ht)) @file_put_contents($ht, "Require all denied\nDeny from all\n");
}

// مصفوفات PHP لا تفرّق بين الكائن الفارغ {} والقائمة الفارغة []، فيُعلَّم الكائن
// الفارغ عند القراءة بمفتاح خاص (EO) ويُعاد إلى {} عند الكتابة، حتى تبقى صيغة
// البيانات مطابقة تماماً لنسخة Node. المفتاح يجعل الكائن الفارغ «غير فارغ» في
// شروط PHP، وهذا مطابق لسلوك JavaScript (الكائن {} قيمة صحيحة).
const EO = '__eo';
const EO_EMPTY = [EO => 1];
const JSON_STRING_RE = '"(?:[^"\\\\]|\\\\.)*"';

function json_decode_keep(string $raw) {
    $raw = preg_replace('/' . JSON_STRING_RE . '(*SKIP)(*F)|\{\s*\}/s', '{"' . EO . '":1}', $raw);
    return json_decode((string)$raw, true);
}

function read_json(string $name, $fallback = []) {
    $file = DATA_DIR . '/' . $name;
    if (!is_file($file)) return $fallback;
    $raw = @file_get_contents($file);
    if ($raw === false || trim($raw) === '') return $fallback;
    $v = json_decode_keep($raw);
    return $v === null ? $fallback : $v;
}

function json_out_str($data, bool $pretty = false): string {
    $flags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE;
    if ($pretty) $flags |= JSON_PRETTY_PRINT;
    $s = (string)json_encode($data, $flags);
    if (str_contains($s, '"' . EO . '"')) {
        $s = preg_replace('/\{\s*"' . EO . '":\s*1\s*\}/', '{}', $s);
        $s = preg_replace('/"' . EO . '":\s*1,\s*/', '', $s);
        $s = preg_replace('/,\s*"' . EO . '":\s*1(?=\s*\})/', '', $s);
    }
    return $s;
}

// مفاتيح كائن دون علامة الكائن الفارغ
function obj(array $a): array { unset($a[EO]); return $a; }
function is_obj($v): bool { return is_array($v) && ($v === [] || isset($v[EO]) || !array_is_list($v)); }

// كتابة ذرية: ملف مؤقت ثم إعادة تسمية
function write_json(string $name, $data): void {
    ensure_data_dir();
    $file = DATA_DIR . '/' . $name;
    $tmp = $file . '.tmp' . bin2hex(random_bytes(3));
    $json = json_out_str($data, true);
    if (@file_put_contents($tmp, $json, LOCK_EX) === false) throw new RuntimeException('تعذر حفظ البيانات.');
    @chmod($tmp, 0600);
    if (!@rename($tmp, $file)) { @unlink($tmp); throw new RuntimeException('تعذر حفظ البيانات.'); }
}

// قفل عام لعمليات القراءة-التعديل-الكتابة حتى لا تتداخل الطلبات المتزامنة
function with_lock(string $key, callable $fn) {
    ensure_data_dir();
    $fh = fopen(DATA_DIR . '/.lock-' . preg_replace('/[^a-z0-9_-]/i', '', $key), 'c');
    if ($fh) flock($fh, LOCK_EX);
    try { return $fn(); }
    finally { if ($fh) { flock($fh, LOCK_UN); fclose($fh); } }
}

function now_iso(): string {
    $t = microtime(true);
    return gmdate('Y-m-d\TH:i:s', (int)$t) . sprintf('.%03dZ', (int)(($t - floor($t)) * 1000));
}

function rand_hex(int $bytes): string { return bin2hex(random_bytes($bytes)); }
function b64url(string $bin): string { return rtrim(strtr(base64_encode($bin), '+/', '-_'), '='); }

function is_list($v): bool { return is_array($v) && array_is_list($v); }
function is_assoc($v): bool { return is_array($v) && ($v === [] || !array_is_list($v)); }

function str_val($v): string {
    if ($v === null) return '';
    if (is_bool($v)) return $v ? 'true' : 'false';
    if (is_scalar($v)) return (string)$v;
    return '';
}
function mb_slice(string $s, int $n): string { return mb_substr($s, 0, $n, 'UTF-8'); }
function mb_len(string $s): int { return mb_strlen($s, 'UTF-8'); }
function ar_digits(string $s): string {
    return strtr($s, ['٠'=>'0','١'=>'1','٢'=>'2','٣'=>'3','٤'=>'4','٥'=>'5','٦'=>'6','٧'=>'7','٨'=>'8','٩'=>'9']);
}
function h($v): string { return htmlspecialchars(str_val($v), ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
// مثل attr() في Node: & و " و <
function attr($v): string { return str_replace(['&', '"', '<'], ['&amp;', '&quot;', '&lt;'], str_val($v)); }
function json_for_script($v): string {
    return str_replace(['<', "\u{2028}", "\u{2029}"], ['\\u003c', '\\u2028', '\\u2029'], json_out_str($v));
}

/* ---------- القيم الافتراضية (مصدرها نسخة Node: lib/siteDefaults.js وغيرها) ---------- */

function defaults(): array {
    static $d = null;
    if ($d === null) $d = json_decode((string)file_get_contents(__DIR__ . '/defaults.json'), true);
    return $d;
}

function is_blank_field($f): bool {
    if (!is_array($f)) return true;
    return trim(str_val($f['ar'] ?? '')) === '' && trim(str_val($f['en'] ?? '')) === '';
}

function fill_content_defaults($content): array {
    $c = is_array($content) ? $content : [];
    $d = defaults()['content'];
    foreach (['heroTitle', 'heroSubtitle', 'mission', 'vision'] as $k) {
        if (is_blank_field($c[$k] ?? null)) $c[$k] = $d[$k];
    }
    if (is_blank_field($c['footerTagline'] ?? null) || (is_array($c['footerTagline'] ?? null) && ($c['footerTagline']['ar'] ?? null) === defaults()['legacyFooterTaglineAr'])) {
        $c['footerTagline'] = $d['footerTagline'];
    }
    $story = $c['aboutStory'] ?? null;
    $allBlank = true;
    if (is_list($story)) foreach ($story as $s) if (!is_blank_field($s)) { $allBlank = false; break; }
    if (!is_list($story) || $allBlank) $c['aboutStory'] = $d['aboutStory'];
    if (!is_list($c['values'] ?? null) || !count($c['values'])) $c['values'] = $d['values'];
    foreach ($d['values'] as $i => $def) {
        if (empty($c['values'][$i])) $c['values'][$i] = $def;
        if (is_blank_field($c['values'][$i]['title'] ?? null)) $c['values'][$i]['title'] = $def['title'];
        if (is_blank_field($c['values'][$i]['description'] ?? null)) $c['values'][$i]['description'] = $def['description'];
    }
    if (!is_list($c['timeline'] ?? null) || !count($c['timeline'])) $c['timeline'] = $d['timeline'];
    if (!is_list($c['certifications'] ?? null) || !count($c['certifications'])) $c['certifications'] = $d['certifications'];
    return $c;
}

const LEGACY_NAMES = [
    ['العمران العقارية للمقاولات العامة', 'العمران الذهبية للمقاولات العامة'],
    ['العمران العقارية للمقاولات', 'العمران الذهبية للمقاولات العامة'],
    ['العمران العقارية', 'العمران الذهبية'],
    ['Alomran Real Estate General Contracting', 'Alomran Al-Dhahabiya General Contracting'],
    ['Alomran Real Estate Contracting', 'Alomran Al-Dhahabiya General Contracting'],
    ['Alomran Real Estate', 'Alomran Al-Dhahabiya'],
];
function rename_legacy_company($v) {
    if (is_string($v)) { foreach (LEGACY_NAMES as [$from, $to]) $v = str_replace($from, $to, $v); return $v; }
    if (is_array($v)) { foreach ($v as $k => $x) $v[$k] = rename_legacy_company($x); }
    return $v;
}
function has_legacy_company_name($v): bool {
    $j = json_out_str($v ?? []);
    return str_contains($j, 'العمران العقارية') || str_contains($j, 'Alomran Real Estate');
}

function normalize_font($raw): ?array {
    if (!is_array($raw)) return null;
    if (($raw['source'] ?? '') === 'custom') {
        $value = preg_replace('/\s+/u', ' ', trim(str_val($raw['value'] ?? '')));
        return preg_match('/^[A-Za-z0-9\x{0600}-\x{06FF}][A-Za-z0-9\x{0600}-\x{06FF} \-]{0,59}$/u', $value) ? ['source' => 'custom', 'value' => $value] : null;
    }
    $value = trim(str_val($raw['value'] ?? ''));
    return in_array($value, defaults()['fontIds'], true) ? ['source' => 'preset', 'value' => $value] : null;
}

function fill_typography($typo): array {
    $t = is_array($typo) ? $typo : [];
    if (!is_array($t['fontSizes'] ?? null)) $t['fontSizes'] = ['h1' => '', 'h2' => '', 'body' => ''];
    foreach (defaults()['sizeKeys'] as $k) if (!array_key_exists($k, $t['fontSizes'])) $t['fontSizes'][$k] = '';
    $legacy = normalize_font($t['activeFont'] ?? null);
    $fonts = is_array($t['fonts'] ?? null) ? $t['fonts'] : [];
    $hadRoles = false;
    foreach (defaults()['fontRoles'] as $r) if (!empty($fonts[$r])) $hadRoles = true;
    $t['fonts'] = [];
    foreach (defaults()['fontRoles'] as $r) {
        $t['fonts'][$r] = normalize_font($fonts[$r] ?? null) ?? ((!$hadRoles && $legacy) ? $legacy : defaults()['defaultFonts'][$r]);
    }
    unset($t['activeFont']);
    return $t;
}

const DEFAULT_CHAT_FAB = ['style' => 'pill', 'label' => 'تواصل معنا', 'icon' => 'chat', 'size' => 58, 'color' => '#1E2A32', 'shadow' => true, 'radius' => 999, 'position' => 'left', 'offsetX' => 22, 'offsetY' => 22, 'animation' => 'soft', 'speed' => 2];
const DEFAULT_OFFLINE = 'نحن غير متاحين حاليًا، لكن يمكنك ترك رسالتك وسيتواصل معك فريقنا في أقرب وقت.';
const DEFAULT_TRANSFER = 'سأحوّل المحادثة إلى أحد أعضاء فريقنا لمساعدتك.';
const DEFAULT_WORK_HOURS = ['enabled' => true, 'days' => [0, 1, 2, 3, 4], 'start' => '08:00', 'end' => '17:00'];

const PAGE_SECTION_KEYS = [
    'home' => ['banners', 'hero', 'about', 'services', 'stats', 'process', 'projects', 'whyUs', 'testimonials', 'cta', 'contact'],
    'about' => ['pageHero', 'story', 'missionVision', 'values', 'expertise', 'timeline', 'team', 'certifications', 'licenses', 'awards', 'partners', 'cta'],
    'projects' => ['pageHero', 'grid', 'cta'],
];

function default_section_config($order): array {
    return [
        'visible' => true, 'order' => $order,
        'title' => ['ar' => '', 'en' => ''], 'subtitle' => ['ar' => '', 'en' => ''], 'content' => ['ar' => '', 'en' => ''],
        'bgMode' => 'color', 'bgColor' => '', 'bgImage' => '', 'boxColor' => '', 'textColor' => '',
        'imageMode' => 'upload', 'image' => '', 'hoverEffect' => false,
    ];
}

function truthy_not_false($v): bool { return $v !== false; }

// نفس getSettings() في lib/store.js
function get_settings(): array {
    $s = read_json('settings.json', []);
    if (!is_array($s) || is_list($s) && $s) $s = [];
    $d = defaults();

    if (empty($s['projectLogo'])) $s['projectLogo'] = ['image' => '', 'visible' => true];
    if (empty($s['bannerLogo'])) $s['bannerLogo'] = ['image' => '', 'visible' => true];
    if (!is_bool($s['bannerTextVisible'] ?? null)) $s['bannerTextVisible'] = true;
    if (!is_list($s['banners'] ?? null)) $s['banners'] = [];

    $isLegacyStats = is_array($s['stats'] ?? null) && (function () use ($s, $d) {
        foreach ($d['legacyStats'] as $k => $v) if (str_val($s['stats'][$k] ?? '') !== $v) return false;
        return true;
    })();
    if (empty($s['stats']) || $isLegacyStats) $s['stats'] = $d['stats'];
    if (!is_list($s['services'] ?? null) || !count($s['services'])) $s['services'] = $d['services'];

    $team = $s['team'] ?? null;
    $isLegacyTeam = is_list($team) && count($team) === count($d['legacyTeamNames']) && (function () use ($team, $d) {
        foreach ($team as $i => $m) if (!is_array($m) || ($m['name']['ar'] ?? null) !== $d['legacyTeamNames'][$i]) return false;
        return true;
    })();
    if (!is_list($team) || !count($team) || $isLegacyTeam) $s['team'] = $d['team'];

    if (empty($s['welcomeMessage'])) {
        $s['welcomeMessage'] = [
            'enabled' => false,
            'title' => ['ar' => 'أهلاً بك في العمران الذهبية', 'en' => 'Welcome to Alomran Al-Dhahabiya'],
            'message' => ['ar' => 'نبني بثقة.. من الفكرة إلى التسليم.', 'en' => 'We build with trust.. from concept to handover.'],
            'buttonText' => ['ar' => 'استعرض الموقع', 'en' => 'Browse the site'],
            'durationSeconds' => 6,
        ];
    }
    if (!is_int($s['welcomeMessage']['durationSeconds'] ?? null) && !is_float($s['welcomeMessage']['durationSeconds'] ?? null)) $s['welcomeMessage']['durationSeconds'] = 6;
    if (empty($s['fab'])) $s['fab'] = ['enabled' => true, 'showWhatsapp' => true, 'showCall' => true];

    $c = is_array($s['chat'] ?? null) ? $s['chat'] : null;
    if ($c === null) {
        $s['chat'] = [
            'enabled' => true, 'aiEnabled' => true, 'humanEnabled' => true, 'whatsappEnabled' => true, 'callEnabled' => true,
            'assistantName' => 'مساعد العمران', 'assistantImage' => '', 'welcomeMessage' => '',
            'offlineMessage' => DEFAULT_OFFLINE, 'transferMessage' => DEFAULT_TRANSFER, 'unavailableMessage' => '',
            'cannedReplies' => $d['cannedReplies'], 'workHours' => DEFAULT_WORK_HOURS,
            'showOn' => ['all'], 'devices' => ['desktop', 'tablet', 'mobile'], 'fab' => DEFAULT_CHAT_FAB,
            'quickReplies' => [
                ['id' => 'qr_services', 'text' => 'ما هي خدماتكم؟', 'action' => 'services', 'enabled' => true],
                ['id' => 'qr_request', 'text' => 'أريد طلب خدمة', 'action' => 'service_request', 'enabled' => true],
                ['id' => 'qr_human', 'text' => 'أريد التحدث مع موظف', 'action' => 'human', 'enabled' => true],
                ['id' => 'qr_whatsapp', 'text' => 'واتساب', 'action' => 'whatsapp', 'enabled' => true],
                ['id' => 'qr_call', 'text' => 'الاتصال بنا', 'action' => 'call', 'enabled' => true],
            ],
            'transferAfterMinutes' => 2, 'phone' => '+966555592666', 'whatsapp' => '966555592666',
        ];
    } else {
        $qr = [];
        foreach ((is_list($c['quickReplies'] ?? null) ? $c['quickReplies'] : []) as $q) {
            if (is_array($q) && ($q['id'] ?? '') === 'qr_services' && (empty($q['action']) || $q['action'] === 'message') && empty($q['reply'])) $q['action'] = 'services';
            $qr[] = $q;
        }
        $tam = (float)($c['transferAfterMinutes'] ?? 0);
        $s['chat'] = [
            'enabled' => ($c['enabled'] ?? null) !== false, 'aiEnabled' => ($c['aiEnabled'] ?? null) !== false,
            'humanEnabled' => ($c['humanEnabled'] ?? null) !== false, 'whatsappEnabled' => ($c['whatsappEnabled'] ?? null) !== false,
            'callEnabled' => ($c['callEnabled'] ?? null) !== false, 'assistantName' => ($c['assistantName'] ?? '') ?: 'مساعد العمران',
            'assistantImage' => ($c['assistantImage'] ?? '') ?: '', 'welcomeMessage' => ($c['welcomeMessage'] ?? '') ?: '',
            'offlineMessage' => ($c['offlineMessage'] ?? '') ?: DEFAULT_OFFLINE,
            'transferMessage' => ($c['transferMessage'] ?? '') ?: DEFAULT_TRANSFER,
            'unavailableMessage' => ($c['unavailableMessage'] ?? '') ?: '',
            'cannedReplies' => is_list($c['cannedReplies'] ?? null) ? $c['cannedReplies'] : $d['cannedReplies'],
            'workHours' => ($c['workHours'] ?? null) ?: DEFAULT_WORK_HOURS,
            'showOn' => is_list($c['showOn'] ?? null) ? $c['showOn'] : ['all'],
            'devices' => is_list($c['devices'] ?? null) ? $c['devices'] : ['desktop', 'tablet', 'mobile'],
            'fab' => ($c['fab'] ?? null) ?: DEFAULT_CHAT_FAB,
            'quickReplies' => $qr, 'transferAfterMinutes' => $tam ?: 2,
            'phone' => ($c['phone'] ?? '') ?: '+966555592666', 'whatsapp' => ($c['whatsapp'] ?? '') ?: '966555592666',
        ];
    }

    $s['typography'] = fill_typography($s['typography'] ?? null);

    if (!is_array($s['pageSections'] ?? null)) $s['pageSections'] = [];
    foreach (PAGE_SECTION_KEYS as $page => $keys) {
        if (!is_array($s['pageSections'][$page] ?? null)) $s['pageSections'][$page] = [];
        $existing = false;
        foreach ($keys as $k) if (!empty($s['pageSections'][$page][$k])) $existing = true;
        foreach ($keys as $i => $key) {
            if (empty($s['pageSections'][$page][$key])) {
                $prevKey = $keys[$i - 1] ?? null;
                $prev = $prevKey ? ($s['pageSections'][$page][$prevKey] ?? null) : null;
                $order = ($existing && is_array($prev) && is_numeric($prev['order'] ?? null) && !is_string($prev['order'])) ? $prev['order'] + 0.5 : $i;
                $s['pageSections'][$page][$key] = default_section_config($order);
            }
            if (!array_key_exists('visible', $s['pageSections'][$page][$key])) $s['pageSections'][$page][$key]['visible'] = true;
            if (!array_key_exists('order', $s['pageSections'][$page][$key])) $s['pageSections'][$page][$key]['order'] = $i;
        }
    }
    $s['content'] = fill_content_defaults($s['content'] ?? null);
    foreach (['content', 'welcomeMessage', 'services', 'team', 'pageSections', 'banners'] as $k) {
        if (!empty($s[$k]) && has_legacy_company_name($s[$k])) $s[$k] = rename_legacy_company($s[$k]);
    }
    return $s;
}

// الإعدادات التي تُرسل للمتصفح: بدون إعدادات الإشعارات وبريد التقييمات
function public_settings(?array $s = null): array {
    $s = $s ?? get_settings();
    unset($s['notifications'], $s['reviewEmail'], $s['reviewInvite']);
    if (is_array($s['briefs'] ?? null)) unset($s['briefs']['notifyEmail']);
    return $s;
}

/* ---------- الأعمال ---------- */

// أعمال افتراضية عند أول تشغيل (نفس lib/defaultWorks.js)
function ensure_default_works(): void {
    $marker = DATA_DIR . '/.works-seeded';
    if (is_file($marker)) return;
    with_lock('works', function () use ($marker) {
        if (is_file($marker)) return;
        $works = read_json('works.json', []);
        $now = now_iso();
        if (!is_list($works) || !count($works)) {
            $out = [];
            foreach (defaults()['works'] as $i => $w) {
                $out[] = array_merge(['id' => 'w_default_' . ($i + 1)], $w, ['visible' => true, 'pinned' => $i < 6, 'order' => $i + 1, 'createdAt' => $now]);
            }
            write_json('works.json', $out);
            @file_put_contents($marker, $now);
        } else {
            @file_put_contents($marker, 'skipped ' . $now);
        }
    });
}

function get_works(): array {
    $w = read_json('works.json', []);
    return is_list($w) ? $w : [];
}

function visible_works(): array {
    $works = array_values(array_filter(get_works(), fn($w) => is_array($w) && !empty($w['visible'])));
    usort($works, fn($a, $b) => ($a['order'] ?? 0) <=> ($b['order'] ?? 0));
    return $works;
}

/* ---------- الطلب والرد ---------- */

function request_path(): string {
    $uri = $_SERVER['REQUEST_URI'] ?? '/';
    $p = parse_url($uri, PHP_URL_PATH) ?: '/';
    return rawurldecode($p);
}

function client_ip(): string { return (string)($_SERVER['REMOTE_ADDR'] ?? ''); }

function site_base_url(): string {
    $env = getenv('APP_BASE_URL');
    if ($env) return rtrim($env, '/');
    $cfg = app_config();
    if (!empty($cfg['base_url'])) return rtrim((string)$cfg['base_url'], '/');
    $host = preg_replace('/[^A-Za-z0-9.:-]/', '', (string)($_SERVER['HTTP_HOST'] ?? ''));
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https' || ($_SERVER['SERVER_PORT'] ?? '') == '443';
    return $host ? ($https ? 'https' : 'http') . '://' . $host : '';
}

// إعدادات اختيارية في app/config.php (لا تُرفع إلى GitHub)
function app_config(): array {
    static $cfg = null;
    if ($cfg === null) {
        $f = __DIR__ . '/config.php';
        $cfg = is_file($f) ? (array)(include $f) : [];
    }
    return $cfg;
}

function json_body(): array {
    static $body = null;
    if ($body !== null) return $body;
    $raw = file_get_contents('php://input', false, null, 0, 300 * 1024);
    $v = json_decode((string)$raw, true);
    return $body = is_array($v) ? $v : [];
}

function send_json($data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_out_str($data);
    exit;
}

function send_html(string $html, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: text/html; charset=utf-8');
    echo $html;
    exit;
}

/* ---------- تحديد عدد الطلبات (بديل express-rate-limit) ---------- */

function rate_limit(string $bucket, int $max, int $windowSec, string $message, string $extraKey = ''): void {
    $key = $bucket . ':' . client_ip() . ($extraKey !== '' ? ':' . $extraKey : '');
    $blocked = with_lock('ratelimit', function () use ($key, $max, $windowSec) {
        $db = read_json('ratelimit.json', []);
        if (!is_array($db)) $db = [];
        $now = time();
        foreach ($db as $k => $v) if (!is_array($v) || ($v[1] ?? 0) < $now) unset($db[$k]);
        $e = $db[$key] ?? [0, $now + $windowSec];
        $e[0]++;
        $db[$key] = $e;
        write_json('ratelimit.json', $db);
        return $e[0] > $max;
    });
    if ($blocked) send_json(['error' => $message], 429);
}

/* ---------- رفع الملفات بطلبات PUT ---------- */
// PHP لا يقرأ multipart/form-data إلا في طلبات POST، ولوحة التحكم ترفع الصور بطلبات PUT.
// هذا المحلل يملأ $_POST و $_FILES لطلبات PUT/PATCH/DELETE بنفس الشكل.

$GLOBALS['MANUAL_UPLOADS'] = [];

function parse_multipart_non_post(): void {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $type = (string)($_SERVER['CONTENT_TYPE'] ?? '');
    if ($method === 'POST' || $method === 'GET' || !preg_match('/^multipart\/form-data;.*boundary=("?)([^";]+)\1/i', $type, $m)) return;
    $len = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($len > 120 * 1024 * 1024) return;
    $raw = (string)file_get_contents('php://input');
    $boundary = '--' . $m[2];
    $parts = explode($boundary, $raw);
    unset($raw);
    foreach ($parts as $part) {
        if ($part === '' || str_starts_with($part, '--')) continue;
        $part = preg_replace('/^\r\n/', '', $part, 1);
        $pos = strpos($part, "\r\n\r\n");
        if ($pos === false) continue;
        $head = substr($part, 0, $pos);
        $body = substr($part, $pos + 4);
        if (str_ends_with($body, "\r\n")) $body = substr($body, 0, -2);
        if (!preg_match('/name="([^"]*)"/i', $head, $nm)) continue;
        $name = $nm[1];
        if (preg_match('/filename="([^"]*)"/i', $head, $fn)) {
            $ctype = preg_match('/Content-Type:\s*([^\r\n]+)/i', $head, $ct) ? trim($ct[1]) : 'application/octet-stream';
            $tmp = tempnam(sys_get_temp_dir(), 'upl');
            file_put_contents($tmp, $body);
            $GLOBALS['MANUAL_UPLOADS'][$tmp] = true;
            register_shutdown_function(fn() => is_file($tmp) && @unlink($tmp));
            $entry = ['name' => $fn[1], 'type' => $ctype, 'tmp_name' => $tmp, 'error' => $fn[1] === '' && $body === '' ? UPLOAD_ERR_NO_FILE : UPLOAD_ERR_OK, 'size' => strlen($body)];
            if (str_ends_with($name, '[]')) {
                $k = substr($name, 0, -2);
                foreach ($entry as $f => $v) $_FILES[$k][$f][] = $v;
            } else $_FILES[$name] = $entry;
        } else {
            if (str_ends_with($name, '[]')) $_POST[substr($name, 0, -2)][] = $body;
            else $_POST[$name] = $body;
        }
    }
}
function is_upload(string $tmp): bool { return isset($GLOBALS['MANUAL_UPLOADS'][$tmp]) ? is_file($tmp) : is_uploaded_file($tmp); }
function move_upload(string $tmp, string $dest): bool {
    if (isset($GLOBALS['MANUAL_UPLOADS'][$tmp])) { $ok = @rename($tmp, $dest) || (@copy($tmp, $dest) && @unlink($tmp)); return $ok; }
    return move_uploaded_file($tmp, $dest);
}
