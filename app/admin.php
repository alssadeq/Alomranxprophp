<?php
// app/admin.php
// واجهات لوحة التحكم: الأعمال، إعدادات الموقع (البانرات والشعار والأقسام والمحتوى...)،
// وسائل التواصل، الرسائل، السجل، النظرة العامة — نفس server.js.

declare(strict_types=1);

const MAX_PINNED = 6;
const MAX_BANNERS = 5;
const UPLOAD_NAME_RE = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp|ico|svg)$/i';
const IMAGE_MIME_EXT = ['image/jpeg' => '.jpg', 'image/png' => '.png', 'image/webp' => '.webp', 'image/x-icon' => '.ico', 'image/svg+xml' => '.svg'];

/* ---------- أدوات مشتركة ---------- */

// String() في JavaScript
function js_str($v): string {
    if ($v === null) return 'null';
    if (is_bool($v)) return $v ? 'true' : 'false';
    if (is_float($v) && floor($v) == $v && abs($v) < 1e15) return (string)(int)$v;
    if (is_scalar($v)) return (string)$v;
    if (is_list($v)) return implode(',', array_map(fn($x) => $x === null ? '' : js_str($x), $v));
    return '[object Object]';
}

// normalizeBilingual في server.js
function bi($value, $fallback = null): array {
    $fb = is_array($fallback) ? $fallback : ['ar' => '', 'en' => ''];
    if ($value === null) return $fallback === null ? ['ar' => '', 'en' => ''] : $fb;
    if (is_string($value)) return ['ar' => $value, 'en' => str_val($fb['en'] ?? '') ];
    $o = is_array($value) ? $value : [];
    return [
        'ar' => array_key_exists('ar', $o) ? js_str($o['ar']) : str_val($fb['ar'] ?? ''),
        'en' => array_key_exists('en', $o) ? js_str($o['en']) : str_val($fb['en'] ?? ''),
    ];
}
function bi_has(array $b): bool { return ($b['ar'] ?? '') !== '' || ($b['en'] ?? '') !== ''; }

function sanitize_asset_url_admin($url): string {
    $url = trim(str_val($url));
    if ($url === '' || preg_match('/^(javascript|data|vbscript|file|blob):/i', $url)) return '';
    if (preg_match('#^/images/[A-Za-z0-9._-]+$#i', $url)) return $url;
    if (preg_match('#^https?://#i', $url)) return $url;
    return '';
}
function sanitize_asset_list($images): array {
    if (!is_list($images)) return [];
    return array_slice(array_values(array_filter(array_map('sanitize_asset_url_admin', $images))), 0, 100);
}

function body_has(array $b, string $k): bool { return array_key_exists($k, $b); }

/* ---------- رفع الصور (lib/upload.js) ---------- */

function uuid4(): string {
    $b = random_bytes(16);
    $b[6] = chr(ord($b[6]) & 0x0f | 0x40);
    $b[8] = chr(ord($b[8]) & 0x3f | 0x80);
    $h = bin2hex($b);
    return substr($h, 0, 8) . '-' . substr($h, 8, 4) . '-' . substr($h, 12, 4) . '-' . substr($h, 16, 4) . '-' . substr($h, 20);
}

function validate_image_file(string $path, string $mime, int $size): void {
    if ($size < 1) throw new RuntimeException('الملف فارغ.');
    $head = (string)file_get_contents($path, false, null, 0, 32);
    if ($mime === 'image/png' && substr($head, 0, 8) !== "\x89PNG\r\n\x1a\n") throw new RuntimeException('ملف PNG غير صالح.');
    if ($mime === 'image/jpeg' && substr($head, 0, 3) !== "\xFF\xD8\xFF") throw new RuntimeException('ملف JPEG غير صالح.');
    if ($mime === 'image/webp' && !(substr($head, 0, 4) === 'RIFF' && substr($head, 8, 4) === 'WEBP')) throw new RuntimeException('ملف WEBP غير صالح.');
    if ($mime === 'image/x-icon' && !($head[0] === "\0" && $head[1] === "\0" && ($head[2] === "\1" || $head[2] === "\2"))) throw new RuntimeException('ملف ICO غير صالح.');
    if ($mime === 'image/svg+xml') {
        if ($size > 2 * 1024 * 1024) throw new RuntimeException('ملف SVG كبير جداً.');
        $text = (string)file_get_contents($path);
        if (!preg_match('/<svg\b/i', $text)) throw new RuntimeException('ملف SVG غير صالح.');
        if (preg_match('/<script\b|on[a-z]+\s*=|javascript:|<foreignObject\b/i', $text)) throw new RuntimeException('ملف SVG يحتوي على محتوى غير آمن.');
    }
}

// يرفع الصور ويعيد روابطها /images/<uuid>.<ext>. أي خطأ يعيد 400 برسالته.
function receive_images(string $field, bool $multiple): array {
    rate_limit('upload', 30, 600, 'تم تجاوز عدد عمليات الرفع المسموحة مؤقتاً.');
    if (empty($_FILES) && empty($_POST) && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) send_json(['error' => 'حجم الملف كبير جداً.'], 400);
    $files = uploaded_files($field);
    if (!$multiple && count($files) > 1) $files = [$files[0]];
    if ($multiple && count($files) > 100) send_json(['error' => 'عدد الملفات أكبر من المسموح.'], 400);
    foreach ($files as $f) {
        if (in_array($f['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) || $f['size'] > 8 * 1024 * 1024) send_json(['error' => 'File too large'], 400);
        if ($f['error'] !== UPLOAD_ERR_OK || !is_upload($f['tmp'])) send_json(['error' => 'تعذر رفع الملف.'], 400);
        if (!isset(IMAGE_MIME_EXT[$f['type']])) send_json(['error' => 'صيغة الملف غير مدعومة. الصيغ المسموحة: JPG, PNG, WEBP, ICO, SVG'], 400);
        try { validate_image_file($f['tmp'], $f['type'], (int)$f['size']); }
        catch (RuntimeException $e) { send_json(['error' => $e->getMessage()], 400); }
    }
    if (!is_dir(UPLOADS_DIR)) @mkdir(UPLOADS_DIR, 0755, true);
    $urls = [];
    foreach ($files as $f) {
        $name = uuid4() . IMAGE_MIME_EXT[$f['type']];
        if (!move_upload($f['tmp'], UPLOADS_DIR . '/' . $name)) {
            foreach ($urls as $u) @unlink(UPLOADS_DIR . '/' . basename($u));
            send_json(['error' => 'تعذر حفظ الصورة. تحقق من صلاحية الكتابة لمجلد data.'], 500);
        }
        @chmod(UPLOADS_DIR . '/' . $name, 0644);
        $urls[] = '/images/' . $name;
    }
    return $urls;
}
function receive_image(): ?string { return receive_images('image', false)[0] ?? null; }

// حذف الصور المستبدلة إن لم يعد يشير إليها أي مكان في البيانات
function remove_replaced_images(array $urls, string $usedText): void {
    foreach (array_unique(array_filter(array_map('str_val', $urls))) as $url) {
        if (!preg_match('#^/images/([^/?\#]+)$#', $url, $m) || !preg_match(UPLOAD_NAME_RE, $m[1]) || str_contains($usedText, $url)) continue;
        @unlink(UPLOADS_DIR . '/' . $m[1]);
        @unlink(ROOT_DIR . '/images/' . $m[1]);
    }
}
function drop_replaced_images(array $urls): void {
    try {
        $used = json_out_str(get_settings()) . json_out_str(get_works()) . json_out_str(social_platforms());
        remove_replaced_images($urls, $used);
    } catch (Throwable $e) { log_error('[images] cleanup failed: ' . $e->getMessage()); }
}

/* ---------- تعديل الإعدادات تحت القفل ---------- */

// $fn تستقبل الإعدادات بالمرجع، وتعيد [status, error] لإيقاف الحفظ
function settings_mutate(callable $fn): array {
    return with_lock('settings', function () use ($fn) {
        $s = get_settings();
        $err = $fn($s);
        if (is_array($err) && isset($err[1])) send_json(['error' => $err[1]], $err[0]);
        write_json('settings.json', $s);
        return $s;
    });
}

/* ---------- الأعمال ---------- */

function works_mutate(callable $fn) {
    return with_lock('works', function () use ($fn) {
        $works = get_works();
        $out = $fn($works);
        write_json('works.json', array_values($works));
        return $out;
    });
}
function work_index(array $works, string $id): int {
    foreach ($works as $i => $w) if (($w['id'] ?? '') === $id) return $i;
    send_json(['error' => 'العمل غير موجود.'], 404);
}
function work_label(array $w): string { return str_val($w['title']['ar'] ?? '') ?: str_val($w['title']['en'] ?? ''); }

function api_works_list(): void {
    $u = require_login();
    $all = get_works();
    usort($all, fn($a, $b) => ($a['order'] ?? 0) <=> ($b['order'] ?? 0));
    $canHidden = !empty($u['isAdmin']) || !empty($u['permissions']['hideWork']);
    send_json(['works' => $canHidden ? $all : array_values(array_filter($all, fn($w) => !empty($w['visible'])))]);
}

function api_works_create(): void {
    require_permission('addWork');
    $b = json_body();
    $title = bi($b['title'] ?? null);
    $city = bi($b['city'] ?? null);
    $category = $b['category'] ?? null;
    if ($title['ar'] === '' || $city['ar'] === '' || !$category) send_json(['error' => 'الاسم والمدينة والتصنيف حقول مطلوبة (على الأقل بالعربي).'], 400);
    $work = works_mutate(function (&$works) use ($b, $title, $city, $category) {
        $max = 0;
        foreach ($works as $w) $max = max($max, $w['order'] ?? 0);
        $new = ['id' => 'w_' . rand_hex(6), 'title' => $title, 'city' => $city, 'category' => $category,
            'meta' => bi($b['meta'] ?? null), 'area' => bi($b['area'] ?? null), 'description' => bi($b['description'] ?? null),
            'images' => sanitize_asset_list($b['images'] ?? null), 'visible' => true, 'pinned' => false,
            'order' => $works ? $max + 1 : 1, 'createdAt' => now_iso()];
        $works[] = $new;
        return $new;
    });
    log_activity('create', 'work', work_label($work));
    send_json(['ok' => true, 'work' => $work], 201);
}

function api_works_update(string $id): void {
    require_permission('editWork');
    $b = json_body();
    if (body_has($b, 'images') && !is_list($b['images'])) {
        if (!is_array($b['images'])) send_json(['error' => 'قائمة الصور غير صحيحة.'], 400);
    }
    [$work, $old] = works_mutate(function (&$works) use ($id, $b) {
        $i = work_index($works, $id);
        $w = &$works[$i];
        foreach (['title', 'city', 'meta', 'area', 'description'] as $k) if (body_has($b, $k)) $w[$k] = bi($b[$k], $w[$k] ?? null);
        if (body_has($b, 'category')) $w['category'] = $b['category'];
        $old = $w['images'] ?? [];
        if (body_has($b, 'images')) {
            if (!is_list($b['images'])) send_json(['error' => 'قائمة الصور غير صحيحة.'], 400);
            $w['images'] = sanitize_asset_list($b['images']);
        }
        return [$w, $old];
    });
    drop_replaced_images($old);
    log_activity('update', 'work', work_label($work));
    send_json(['ok' => true, 'work' => $work]);
}

function api_works_visibility(string $id): void {
    require_permission('hideWork');
    $v = json_body()['visible'] ?? null;
    if (!is_bool($v)) send_json(['error' => 'قيمة visible يجب أن تكون true أو false.'], 400);
    $work = works_mutate(function (&$works) use ($id, $v) { $i = work_index($works, $id); $works[$i]['visible'] = $v; return $works[$i]; });
    log_activity('update', 'work', ($v ? 'إظهار' : 'إخفاء') . ': ' . work_label($work));
    send_json(['ok' => true, 'work' => $work]);
}

function api_works_pin(string $id): void {
    require_permission('editWork');
    $p = json_body()['pinned'] ?? null;
    if (!is_bool($p)) send_json(['error' => 'قيمة pinned يجب أن تكون true أو false.'], 400);
    $work = works_mutate(function (&$works) use ($id, $p) {
        $i = work_index($works, $id);
        if ($p && empty($works[$i]['pinned']) && count(array_filter($works, fn($w) => !empty($w['pinned']))) >= MAX_PINNED) {
            send_json(['error' => 'لا يمكن تثبيت أكثر من ' . MAX_PINNED . ' أعمال في الصفحة الرئيسية. ألغِ تثبيت عمل آخر أولاً.'], 409);
        }
        $works[$i]['pinned'] = $p;
        return $works[$i];
    });
    log_activity('update', 'work', ($p ? 'تثبيت' : 'إلغاء تثبيت') . ': ' . work_label($work));
    send_json(['ok' => true, 'work' => $work]);
}

function api_works_delete(string $id): void {
    require_permission('deleteWork');
    $removed = works_mutate(function (&$works) use ($id) { $i = work_index($works, $id); $r = $works[$i]; array_splice($works, $i, 1); return $r; });
    drop_replaced_images($removed['images'] ?? []);
    log_activity('delete', 'work', work_label($removed));
    send_json(['ok' => true]);
}

function api_works_images(string $id): void {
    require_permission('editWork');
    $urls = receive_images('images', true);
    if (!$urls) send_json(['error' => 'لم يتم إرفاق أي صور.'], 400);
    [$work, $old] = works_mutate(function (&$works) use ($id, $urls) {
        $i = null;
        foreach ($works as $k => $w) if (($w['id'] ?? '') === $id) $i = $k;
        if ($i === null) { remove_replaced_images($urls, ''); send_json(['error' => 'العمل غير موجود.'], 404); }
        $old = $works[$i]['images'] ?? [];
        $works[$i]['images'] = $urls;
        return [$works[$i], $old];
    });
    drop_replaced_images($old);
    send_json(['ok' => true, 'work' => $work]);
}

/* ---------- الإعدادات ---------- */

function api_settings_full(): void { require_admin(); send_json(get_settings()); }

function api_banner_delete(string $slot): void {
    require_admin();
    $n = (int)$slot;
    if (!($n >= 1 && $n <= MAX_BANNERS)) send_json(['error' => 'رقم البانر غير صحيح.'], 400);
    $old = null;
    settings_mutate(function (&$s) use ($n, &$old) {
        $old = $s['banners'][$n - 1] ?? null;
        if ($old) $s['banners'][$n - 1] = ['image' => '', 'title' => ['ar' => '', 'en' => ''], 'link' => ''];
    });
    if ($old) drop_replaced_images([$old['image'] ?? '']);
    send_json(['ok' => true]);
}

function api_banner_put(string $slot): void {
    require_admin();
    $url = receive_image();
    $n = (int)$slot;
    if (!($n >= 1 && $n <= MAX_BANNERS)) { if ($url) remove_replaced_images([$url], ''); send_json(['error' => 'رقم البانر يجب أن يكون من 1 إلى ' . MAX_BANNERS . '.'], 400); }
    $idx = $n - 1;
    $oldImage = null;
    $s = settings_mutate(function (&$s) use ($idx, $url, &$oldImage) {
        if (empty($s['banners'][$idx])) $s['banners'][$idx] = ['image' => '', 'title' => ['ar' => '', 'en' => '']];
        if (empty($s['banners'][$idx]['title'])) $s['banners'][$idx]['title'] = ['ar' => '', 'en' => ''];
        $oldImage = $s['banners'][$idx]['image'] ?? '';
        if ($url) $s['banners'][$idx]['image'] = $url;
        if (isset($_POST['titleAr'])) $s['banners'][$idx]['title']['ar'] = (string)$_POST['titleAr'];
        if (isset($_POST['titleEn'])) $s['banners'][$idx]['title']['en'] = (string)$_POST['titleEn'];
        if (isset($_POST['link'])) {
            $l = trim((string)$_POST['link']);
            if ($l !== '' && !(preg_match('#^https?://[^\s"\'<>]+$#i', $l) || preg_match('#^/[^\s"\'<>]*$#', $l))) {
                if ($url) remove_replaced_images([$url], '');
                return [400, 'رابط البانر يجب أن يبدأ بـ https:// أو يكون صفحة داخلية تبدأ بـ /'];
            }
            $s['banners'][$idx]['link'] = mb_slice($l, 600);
        }
        for ($i = 0; $i < $idx; $i++) if (empty($s['banners'][$i])) $s['banners'][$i] = ['image' => '', 'title' => ['ar' => '', 'en' => '']];
        ksort($s['banners']);
        $s['banners'] = array_values($s['banners']);
        return null;
    });
    if ($url) drop_replaced_images([$oldImage]);
    send_json(['ok' => true, 'banner' => $s['banners'][$idx]]);
}

// رفع صورة لحقل في الإعدادات: الشعار، الأيقونة، خلفيات الصفحات
function settings_image_field(string $field): void {
    require_admin();
    $url = receive_image();
    if (!$url) send_json(['error' => 'لم يتم إرفاق صورة.'], 400);
    $old = '';
    settings_mutate(function (&$s) use ($field, $url, &$old) {
        $old = str_val($s[$field] ?? '');
        $s[$field] = $url;
    });
    drop_replaced_images([$old]);
    send_json(['ok' => true, $field => $url]);
}

function api_settings_background(string $key): void {
    $map = ['about' => 'aboutHeroBg', 'projects' => 'projectsHeroBg'];
    require_admin();
    if (!isset($map[$key])) send_json(['error' => 'مفتاح الخلفية غير صحيح.'], 400);
    settings_image_field($map[$key]);
}

function api_settings_share(): void {
    require_admin();
    $b = json_body();
    $clip = function ($v, $n) { $x = bi($v); return ['ar' => mb_slice(trim($x['ar']), $n), 'en' => mb_slice(trim($x['en']), $n)]; };
    $s = settings_mutate(function (&$s) use ($b, $clip) {
        $share = is_array($s['share'] ?? null) ? obj($s['share']) : [];
        $share['title'] = $clip($b['title'] ?? null, 120);
        $share['description'] = $clip($b['description'] ?? null, 300);
        $s['share'] = $share;
    });
    send_json(['ok' => true, 'share' => $s['share']]);
}
function api_settings_share_image(bool $delete): void {
    require_admin();
    $url = $delete ? '' : receive_image();
    if (!$delete && !$url) send_json(['error' => 'لم يتم إرفاق صورة.'], 400);
    $old = '';
    $s = settings_mutate(function (&$s) use ($url, &$old) {
        $share = is_array($s['share'] ?? null) ? obj($s['share']) : [];
        $old = str_val($share['image'] ?? '');
        $share['image'] = $url;
        $s['share'] = $share;
    });
    drop_replaced_images([$old]);
    send_json(['ok' => true, 'share' => $s['share']]);
}

function api_settings_logo_toggle(string $key): void {
    require_admin();
    $url = receive_image();
    $old = '';
    $s = settings_mutate(function (&$s) use ($key, $url, &$old) {
        $old = str_val($s[$key]['image'] ?? '');
        if ($url) $s[$key]['image'] = $url;
        if (isset($_POST['visible'])) $s[$key]['visible'] = $_POST['visible'] === 'true';
        $s[$key] = obj($s[$key]);
    });
    if ($url) drop_replaced_images([$old]);
    send_json(['ok' => true, $key => $s[$key]]);
}

function api_settings_login_button(): void {
    require_admin();
    $b = json_body();
    if (!is_bool($b['desktop'] ?? null) || !is_bool($b['mobile'] ?? null)) send_json(['error' => 'أرسل desktop و mobile بقيمة true أو false.'], 400);
    $s = settings_mutate(function (&$s) use ($b) { $s['loginButton'] = ['desktop' => $b['desktop'], 'mobile' => $b['mobile']]; });
    send_json(['ok' => true, 'loginButton' => $s['loginButton']]);
}

function api_settings_banner_text(): void {
    require_admin();
    $v = json_body()['visible'] ?? null;
    if (!is_bool($v)) send_json(['error' => 'قيمة visible يجب أن تكون true أو false.'], 400);
    $s = settings_mutate(function (&$s) use ($v) { $s['bannerTextVisible'] = $v; });
    send_json(['ok' => true, 'bannerTextVisible' => $s['bannerTextVisible']]);
}

function api_settings_stats(): void {
    require_admin();
    $st = json_body()['stats'] ?? null;
    if (!is_array($st)) send_json(['error' => 'أرسل بيانات الإحصاءات.'], 400);
    $s = settings_mutate(function (&$s) use ($st) {
        $out = [];
        foreach (['yearsExperience', 'projectsDone', 'clientSatisfaction', 'citiesServed'] as $k) {
            $out[$k] = js_str(array_key_exists($k, $st) && $st[$k] !== null ? $st[$k] : ($s['stats'][$k] ?? null));
        }
        $s['stats'] = $out;
    });
    send_json(['ok' => true, 'stats' => $s['stats']]);
}

function api_settings_services(): void {
    require_admin();
    $list = json_body()['services'] ?? null;
    if (!is_list($list) || !count($list)) send_json(['error' => 'أرسل قائمة الخدمات (خدمة واحدة على الأقل).'], 400);
    $s = settings_mutate(function (&$s) use ($list) {
        $out = [];
        foreach (array_slice($list, 0, 12) as $x) {
            $t = ['title' => bi(is_array($x) ? ($x['title'] ?? null) : null), 'description' => bi(is_array($x) ? ($x['description'] ?? null) : null)];
            if (bi_has($t['title'])) $out[] = $t;
        }
        if (!$out) return [400, 'يجب أن تحتوي كل خدمة على عنوان على الأقل بلغة واحدة.'];
        $s['services'] = $out;
        return null;
    });
    send_json(['ok' => true, 'services' => $s['services']]);
}

/* ---------- الشهادات والتراخيص والتكريم والشركاء ---------- */

const SHOWCASE_KINDS = ['licenses' => 'licenses', 'awards' => 'awards', 'partners' => 'partners'];
const SHOWCASE_MAX_IMAGES = 12;
function showcase_all_images($it): array {
    if (!is_array($it)) return [];
    return array_values(array_filter(array_merge([$it['image'] ?? null], is_list($it['gallery'] ?? null) ? $it['gallery'] : [])));
}
function showcase_link($v): string {
    $l = trim(str_val($v));
    return (preg_match('#^https?://[^\s"\'<>]+$#i', $l) || preg_match('#^/[^\s"\'<>]*$#', $l)) ? mb_slice($l, 600) : '';
}

function api_showcase_put(string $kind): void {
    require_admin();
    $key = SHOWCASE_KINDS[$kind] ?? null;
    if (!$key) send_json(['error' => 'قائمة غير معروفة.'], 400);
    $items = json_body()['items'] ?? null;
    if (!is_list($items)) send_json(['error' => 'أرسل قائمة العناصر.'], 400);
    $prev = [];
    $s = settings_mutate(function (&$s) use ($key, $items, &$prev) {
        $prev = is_list($s[$key] ?? null) ? $s[$key] : [];
        $byId = [];
        foreach ($prev as $it) if (is_array($it) && isset($it['id'])) $byId[$it['id']] = $it;
        $next = [];
        foreach (array_slice($items, 0, 60) as $i => $t) {
            $t = is_array($t) ? $t : [];
            $id = mb_slice(preg_replace('/[^\w-]/', '', str_val($t['id'] ?? '')), 60) ?: ('sc_' . (int)(microtime(true) * 1000) . '_' . $i);
            $old = $byId[$id] ?? null;
            $row = ['id' => $id, 'title' => bi($t['title'] ?? null), 'description' => bi($t['description'] ?? null), 'link' => showcase_link($t['link'] ?? null)];
            if ($key === 'awards') { $row['type'] = ($t['type'] ?? '') === 'thanks' ? 'thanks' : 'award'; $row['project'] = bi($t['project'] ?? null); }
            $current = showcase_all_images($old);
            if (!is_list($t['images'] ?? null)) { $row['image'] = $current[0] ?? ''; $row['gallery'] = array_slice($current, 1); }
            else {
                $list = array_slice(array_values(array_filter(array_unique(array_map('js_str', $t['images'])), fn($u) => in_array($u, $current, true))), 0, SHOWCASE_MAX_IMAGES);
                $row['image'] = $list[0] ?? '';
                $row['gallery'] = array_slice($list, 1);
            }
            $row['visible'] = !(($t['visible'] ?? null) === false);
            if (bi_has($row['title'])) $next[] = $row;
        }
        $s[$key] = $next;
    });
    $kept = [];
    foreach ($s[$key] as $it) foreach (showcase_all_images($it) as $u) $kept[$u] = 1;
    $drop = [];
    foreach ($prev as $it) foreach (showcase_all_images($it) as $u) if (!isset($kept[$u])) $drop[] = $u;
    drop_replaced_images($drop);
    send_json(['ok' => true, 'items' => $s[$key]]);
}

function api_showcase_images(string $kind, string $id): void {
    require_admin();
    $key = SHOWCASE_KINDS[$kind] ?? null;
    if (!$key) send_json(['error' => 'قائمة غير معروفة.'], 400);
    $files = receive_images('images', true);
    if (!$files) send_json(['error' => 'لم يتم إرفاق صور.'], 400);
    $item = null;
    $skipped = 0;
    settings_mutate(function (&$s) use ($key, $id, $files, &$item, &$skipped) {
        foreach ($s[$key] ?? [] as $i => $it) {
            if (($it['id'] ?? '') !== $id) continue;
            $all = array_merge(showcase_all_images($it), $files);
            $kept = array_slice($all, 0, SHOWCASE_MAX_IMAGES);
            remove_replaced_images(array_slice($all, SHOWCASE_MAX_IMAGES), '');
            $s[$key][$i]['image'] = $kept[0] ?? '';
            $s[$key][$i]['gallery'] = array_slice($kept, 1);
            $item = $s[$key][$i];
            $skipped = count($all) - count($kept);
            return null;
        }
        remove_replaced_images($files, '');
        return [404, 'العنصر غير موجود. احفظ القائمة أولاً.'];
    });
    send_json(['ok' => true, 'item' => $item, 'skipped' => $skipped]);
}

function api_showcase_image(string $kind, string $id): void {
    require_admin();
    $key = SHOWCASE_KINDS[$kind] ?? null;
    if (!$key) send_json(['error' => 'قائمة غير معروفة.'], 400);
    $url = receive_image();
    if (!$url) send_json(['error' => 'لم يتم إرفاق صورة.'], 400);
    $item = null;
    $old = '';
    settings_mutate(function (&$s) use ($key, $id, $url, &$item, &$old) {
        foreach ($s[$key] ?? [] as $i => $it) {
            if (($it['id'] ?? '') !== $id) continue;
            $old = str_val($it['image'] ?? '');
            $s[$key][$i]['image'] = $url;
            $item = $s[$key][$i];
            return null;
        }
        remove_replaced_images([$url], '');
        return [404, 'العنصر غير موجود. احفظ القائمة أولاً.'];
    });
    drop_replaced_images([$old]);
    send_json(['ok' => true, 'item' => $item]);
}

function api_settings_testimonials(): void {
    require_admin();
    $b = json_body();
    $list = $b['testimonials'] ?? null;
    if (!is_list($list)) send_json(['error' => 'أرسل قائمة آراء العملاء.'], 400);
    $reviewIds = [];
    foreach (read_json('reviews.json', []) as $r) if (is_array($r)) $reviewIds[(string)($r['id'] ?? '')] = 1;
    $s = settings_mutate(function (&$s) use ($b, $list, $reviewIds) {
        $out = [];
        foreach (array_slice($list, 0, 30) as $i => $t) {
            $t = is_array($t) ? $t : [];
            $row = [
                'id' => mb_slice(preg_replace('/[^\w-]/', '', str_val($t['id'] ?? '') ?: ('ts_' . (int)(microtime(true) * 1000) . '_' . $i)), 60),
                'name' => bi($t['name'] ?? null), 'role' => bi($t['role'] ?? null), 'text' => bi($t['text'] ?? null),
                'rating' => max(1, min(5, (int)str_val($t['rating'] ?? '') ?: 5)),
                'visible' => !(($t['visible'] ?? null) === false),
            ];
            if (!empty($t['reviewId']) && isset($reviewIds[js_str($t['reviewId'])])) { $row['reviewId'] = js_str($t['reviewId']); $row['source'] = 'review'; }
            if (bi_has($row['name']) && bi_has($row['text'])) $out[] = $row;
        }
        $s['testimonials'] = $out;
        if (body_has($b, 'visible')) $s['testimonialsVisible'] = (bool)$b['visible'];
    });
    send_json(['ok' => true, 'testimonials' => $s['testimonials'], 'visible' => ($s['testimonialsVisible'] ?? null) !== false]);
}

function api_settings_team(): void {
    require_admin();
    $team = json_body()['team'] ?? null;
    if (!is_list($team)) send_json(['error' => 'أرسل قائمة فريق العمل.'], 400);
    $s = settings_mutate(function (&$s) use ($team) {
        $out = [];
        foreach (array_slice($team, 0, 12) as $m) {
            $m = is_array($m) ? $m : [];
            $row = ['name' => bi($m['name'] ?? null), 'role' => bi($m['role'] ?? null)];
            if (bi_has($row['name'])) $out[] = $row;
        }
        $s['team'] = $out;
    });
    send_json(['ok' => true, 'team' => $s['team']]);
}

function api_settings_chat(): void {
    require_admin();
    $b = json_body();
    $s = settings_mutate(function (&$s) use ($b) {
        $c = is_array($s['chat'] ?? null) ? $s['chat'] : [];
        foreach (['enabled', 'aiEnabled', 'humanEnabled', 'whatsappEnabled', 'callEnabled'] as $k) if (body_has($b, $k)) $c[$k] = (bool)$b[$k];
        foreach (['assistantName', 'welcomeMessage', 'offlineMessage', 'transferMessage', 'unavailableMessage'] as $k) if (body_has($b, $k)) $c[$k] = mb_slice(js_str($b[$k]), 2000);
        if (body_has($b, 'phone')) $c['phone'] = substr(preg_replace('/[^0-9+]/', '', js_str($b['phone'])), 0, 20);
        if (body_has($b, 'whatsapp')) $c['whatsapp'] = substr(preg_replace('/[^0-9]/', '', js_str($b['whatsapp'])), 0, 20);
        if (is_list($b['quickReplies'] ?? null)) {
            $qr = [];
            foreach (array_slice($b['quickReplies'], 0, 12) as $i => $q) {
                $q = is_array($q) ? $q : [];
                $row = ['id' => mb_slice(str_val($q['id'] ?? '') ?: ('qr_' . (int)(microtime(true) * 1000) . '_' . $i), 80),
                    'text' => mb_slice(trim(str_val($q['text'] ?? '')), 120),
                    'action' => in_array($q['action'] ?? '', ['message', 'services', 'service_request', 'human', 'whatsapp', 'call'], true) ? $q['action'] : 'message',
                    'reply' => mb_slice(trim(str_val($q['reply'] ?? '')), 1000), 'enabled' => ($q['enabled'] ?? null) !== false];
                if ($row['text'] !== '') $qr[] = $row;
            }
            $c['quickReplies'] = $qr;
        }
        if (is_list($b['cannedReplies'] ?? null)) {
            $cr = [];
            foreach (array_slice($b['cannedReplies'], 0, 40) as $i => $r) {
                $r = is_array($r) ? $r : [];
                $kw = is_list($r['keywords'] ?? null) ? $r['keywords'] : preg_split('/[,،\n]/u', str_val($r['keywords'] ?? ''));
                $kw = array_map(fn($k) => mb_slice($k, 60), array_slice(array_values(array_filter(array_map(fn($k) => trim(js_str($k)), $kw), fn($k) => $k !== '')), 0, 20));
                $row = ['id' => mb_slice(str_val($r['id'] ?? '') ?: ('cr_' . (int)(microtime(true) * 1000) . '_' . $i), 80), 'keywords' => $kw,
                    'reply' => mb_slice(trim(str_val($r['reply'] ?? '')), 1000), 'enabled' => !(($r['enabled'] ?? null) === false)];
                if ($kw && $row['reply'] !== '') $cr[] = $row;
            }
            $c['cannedReplies'] = $cr;
        }
        if (is_array($b['fab'] ?? null) && !is_list($b['fab'])) {
            $f = $b['fab'];
            $old = is_array($c['fab'] ?? null) ? obj($c['fab']) : [];
            $num = fn($v, $def) => is_numeric($v) && (float)$v != 0 ? (float)$v : $def;
            $clampI = fn($v) => floor($v) == $v ? (int)$v : $v;
            $c['fab'] = array_merge($old, [
                'style' => in_array($f['style'] ?? '', ['circle', 'rounded', 'pill', 'icon'], true) ? $f['style'] : (($old['style'] ?? '') ?: 'pill'),
                'label' => mb_slice(str_val($f['label'] ?? '') ?: (($old['label'] ?? '') ?: 'تواصل معنا'), 80),
                'size' => $clampI(max(44, min(90, $num($f['size'] ?? null, 58)))),
                'color' => preg_match('/^#[0-9a-f]{6}$/i', str_val($f['color'] ?? '')) ? $f['color'] : (($old['color'] ?? '') ?: '#1E2A32'),
                'radius' => $clampI(max(0, min(999, $num($f['radius'] ?? null, 999)))),
                'position' => ($f['position'] ?? '') === 'right' ? 'right' : 'left',
                'offsetX' => $clampI(max(8, min(80, $num($f['offsetX'] ?? null, 22)))),
                'offsetY' => $clampI(max(8, min(80, $num($f['offsetY'] ?? null, 22)))),
                'animation' => in_array($f['animation'] ?? '', ['none', 'soft'], true) ? $f['animation'] : 'soft',
                'shadow' => ($f['shadow'] ?? null) !== false,
            ]);
        }
        $s['chat'] = $c;
    });
    send_json(['ok' => true, 'chat' => $s['chat']]);
}

function api_settings_typography(): void {
    require_admin();
    $b = json_body();
    $s = settings_mutate(function (&$s) use ($b) {
        $fonts = $b['fonts'] ?? null;
        if (is_array($fonts)) {
            foreach (defaults()['fontRoles'] as $role) {
                if (!array_key_exists($role, $fonts)) continue;
                $font = normalize_font($fonts[$role]);
                if (!$font) return [400, (($fonts[$role]['source'] ?? '') === 'custom') ? 'اسم الخط المخصص غير صالح (حروف وأرقام ومسافات فقط).' : 'خط غير معروف من القائمة.'];
                $s['typography']['fonts'][$role] = $font;
            }
        }
        $sizes = $b['fontSizes'] ?? null;
        if (is_array($sizes)) {
            foreach (defaults()['sizeKeys'] as $k) {
                if (!array_key_exists($k, $sizes)) continue;
                $n = (int)str_val($sizes[$k]);
                $s['typography']['fontSizes'][$k] = preg_match('/^\s*[+-]?\d/', js_str($sizes[$k])) && $n >= 10 ? (string)min($n, 200) : '';
            }
        }
        return null;
    });
    send_json(['ok' => true, 'typography' => $s['typography']]);
}

function api_sections_put(string $page): void {
    require_admin();
    if (!isset(PAGE_SECTION_KEYS[$page])) send_json(['error' => 'صفحة غير معروفة.'], 400);
    $b = json_body();
    foreach ($b as $key => $in) {
        if (in_array($key, PAGE_SECTION_KEYS[$page], true) && is_array($in) && ($in['imageMode'] ?? '') === 'url' && array_key_exists('image', $in) && !sanitize_asset_url_admin($in['image'])) {
            send_json(['error' => 'رابط الصورة غير مسموح. استخدم رابط HTTP(S) صالحاً أو صورة مرفوعة.'], 400);
        }
    }
    $s = settings_mutate(function (&$s) use ($page, $b) {
        foreach ($b as $key => $in) {
            if (!in_array($key, PAGE_SECTION_KEYS[$page], true)) continue;
            $in = is_array($in) ? $in : [];
            $x = &$s['pageSections'][$page][$key];
            foreach (['title', 'subtitle', 'content'] as $k) if (array_key_exists($k, $in)) $x[$k] = bi($in[$k], $x[$k] ?? null);
            if (in_array($in['bgMode'] ?? null, ['color', 'image'], true)) $x['bgMode'] = $in['bgMode'];
            foreach (['bgColor', 'boxColor', 'textColor'] as $k) if (array_key_exists($k, $in)) $x[$k] = js_str($in[$k]);
            if (in_array($in['imageMode'] ?? null, ['upload', 'url'], true)) $x['imageMode'] = $in['imageMode'];
            if (($in['imageMode'] ?? null) === 'url' && array_key_exists('image', $in)) $x['image'] = sanitize_asset_url_admin($in['image']);
            if (array_key_exists('hoverEffect', $in)) $x['hoverEffect'] = (bool)$in['hoverEffect'];
            if (array_key_exists('visible', $in)) $x['visible'] = (bool)$in['visible'];
            unset($x);
        }
    });
    send_json(['ok' => true, 'sections' => $s['pageSections'][$page]]);
}

function api_sections_image(string $page, string $key, bool $bg): void {
    require_admin();
    if (!isset(PAGE_SECTION_KEYS[$page]) || !in_array($key, PAGE_SECTION_KEYS[$page], true)) send_json(['error' => 'قسم غير معروف.'], 400);
    $url = receive_image();
    if (!$url) send_json(['error' => 'لم يتم إرفاق صورة.'], 400);
    $old = '';
    settings_mutate(function (&$s) use ($page, $key, $url, $bg, &$old) {
        $x = &$s['pageSections'][$page][$key];
        if ($bg) { $old = str_val($x['bgImage'] ?? ''); $x['bgImage'] = $url; $x['bgMode'] = 'image'; }
        else { $old = str_val($x['image'] ?? ''); $x['image'] = $url; $x['imageMode'] = 'upload'; }
    });
    drop_replaced_images([$old]);
    send_json(['ok' => true, $bg ? 'bgImage' : 'image' => $url]);
}

function api_sections_reorder(string $page): void {
    require_admin();
    if (!isset(PAGE_SECTION_KEYS[$page])) send_json(['error' => 'صفحة غير معروفة.'], 400);
    $order = json_body()['order'] ?? null;
    $valid = is_list($order);
    if ($valid) foreach ($order as $k) if (!is_string($k) || !in_array($k, PAGE_SECTION_KEYS[$page], true)) $valid = false;
    if (!$valid) send_json(['error' => 'أرسل ترتيباً صحيحاً يشمل كل أقسام هذه الصفحة.'], 400);
    $s = settings_mutate(function (&$s) use ($page, $order) { foreach ($order as $i => $k) $s['pageSections'][$page][$k]['order'] = $i; });
    send_json(['ok' => true, 'sections' => $s['pageSections'][$page]]);
}

function api_settings_welcome(): void {
    require_admin();
    $b = json_body();
    $s = settings_mutate(function (&$s) use ($b) {
        $w = &$s['welcomeMessage'];
        if (body_has($b, 'enabled')) $w['enabled'] = (bool)$b['enabled'];
        foreach (['title', 'message', 'buttonText'] as $k) if (body_has($b, $k)) $w[$k] = bi($b[$k], $w[$k] ?? null);
        if (body_has($b, 'durationSeconds')) {
            $raw = js_str($b['durationSeconds']);
            $n = (int)$raw;
            $w['durationSeconds'] = (preg_match('/^\s*[+-]?\d/', $raw) && $n > 0) ? min($n, 60) : 6;
        }
        unset($w);
    });
    send_json(['ok' => true, 'welcomeMessage' => $s['welcomeMessage']]);
}

function api_settings_content(): void {
    require_admin();
    $b = json_body();
    $s = settings_mutate(function (&$s) use ($b) {
        $c = &$s['content'];
        foreach (['heroTitle', 'heroSubtitle', 'mission', 'vision', 'footerTagline'] as $k) if (body_has($b, $k)) $c[$k] = bi($b[$k], $c[$k] ?? null);
        if (is_list($b['aboutStory'] ?? null)) $c['aboutStory'] = array_map(fn($p) => bi($p), array_slice($b['aboutStory'], 0, 6));
        if (is_list($b['values'] ?? null)) {
            $vals = [];
            foreach (array_slice($b['values'], 0, 4) as $i => $v) {
                $v = is_array($v) ? $v : [];
                $vals[] = ['title' => bi($v['title'] ?? null, $c['values'][$i]['title'] ?? null), 'description' => bi($v['description'] ?? null, $c['values'][$i]['description'] ?? null)];
            }
            $c['values'] = $vals;
        }
        if (is_list($b['timeline'] ?? null)) {
            $tl = [];
            foreach (array_slice($b['timeline'], 0, 20) as $t) {
                $t = is_array($t) ? $t : [];
                $row = ['year' => trim(str_val($t['year'] ?? '') === '' ? '' : js_str($t['year'])), 'title' => bi($t['title'] ?? null), 'description' => bi($t['description'] ?? null)];
                if ($row['year'] !== '' || bi_has($row['title'])) $tl[] = $row;
            }
            $c['timeline'] = $tl;
        }
        if (is_list($b['certifications'] ?? null)) $c['certifications'] = array_values(array_filter(array_map(fn($x) => bi($x), array_slice($b['certifications'], 0, 20)), 'bi_has'));
        if (body_has($b, 'mapUrl')) {
            $u = trim(str_val($b['mapUrl']));
            if ($u !== '' && (!preg_match('#^https://[^\s"\'<>]+$#i', $u) || mb_len($u) > 800)) return [400, 'رابط الخريطة يجب أن يبدأ بـ https://'];
            $c['mapUrl'] = $u;
        }
        if (body_has($b, 'mapCoords')) {
            $v = trim(str_val($b['mapCoords']));
            $ok = preg_match('/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/', $v, $m);
            if ($v !== '' && (!$ok || abs((float)$m[1]) > 90 || abs((float)$m[2]) > 180)) return [400, 'الإحداثيات يجب أن تكون بالشكل: 21.5093, 39.1708'];
            $c['mapCoords'] = $ok ? js_num($m[1]) . ', ' . js_num($m[2]) : '';
        }
        unset($c);
        return null;
    });
    send_json(['ok' => true, 'content' => $s['content']]);
}
function js_num(string $n): string { $f = (float)$n; return floor($f) == $f ? (string)(int)$f : rtrim(rtrim(sprintf('%.15F', $f), '0'), '.'); }

/* ---------- الرسائل والسجل والنظرة العامة ---------- */

function get_messages(): array { $m = read_json('messages.json', []); return is_list($m) ? $m : []; }

function api_messages_list(): void { require_admin(); send_json(get_messages()); }

function api_messages_read(string $id): void {
    require_admin();
    $read = !empty(json_body()['read']);
    $msg = with_lock('messages', function () use ($id, $read) {
        $l = get_messages();
        foreach ($l as $i => $m) if (($m['id'] ?? '') === $id) { $l[$i]['read'] = $read; write_json('messages.json', $l); return $l[$i]; }
        send_json(['error' => 'الرسالة غير موجودة.'], 404);
    });
    send_json(['ok' => true, 'messageRecord' => $msg]);
}

function api_messages_delete(string $id): void {
    require_admin();
    $name = with_lock('messages', function () use ($id) {
        $l = get_messages();
        foreach ($l as $i => $m) if (($m['id'] ?? '') === $id) { array_splice($l, $i, 1); write_json('messages.json', $l); return $m['name'] ?? ''; }
        send_json(['error' => 'الرسالة غير موجودة.'], 404);
    });
    log_activity('delete', 'message', (string)$name);
    send_json(['ok' => true]);
}

function api_activity_log(): void { require_admin(); $l = read_json('activity_log.json', []); send_json(is_list($l) ? $l : []); }

function api_overview(): void {
    $u = require_login();
    $works = get_works();
    $s = get_settings();
    $messages = get_messages();
    $admin = !empty($u['isAdmin']);
    $recent = $works;
    usort($recent, fn($a, $b) => strtotime((string)($b['createdAt'] ?? '')) <=> strtotime((string)($a['createdAt'] ?? '')));
    send_json([
        'counts' => [
            'works' => count($works), 'services' => count($s['services'] ?? []),
            'banners' => count(array_filter($s['banners'] ?? [], fn($b) => is_array($b) && !empty($b['image']))),
            'messages' => $admin ? count($messages) : 0,
            'unreadMessages' => $admin ? count(array_filter($messages, fn($m) => empty($m['read']))) : 0,
            'users' => count(get_users()),
        ],
        'recentWorks' => array_map(fn($w) => ['id' => $w['id'] ?? null, 'title' => $w['title'] ?? null, 'city' => $w['city'] ?? null, 'category' => $w['category'] ?? null, 'createdAt' => $w['createdAt'] ?? null], array_slice($recent, 0, 5)),
        'recentMessages' => $admin ? array_slice($messages, 0, 5) : [],
    ]);
}

/* ---------- إدارة وسائل التواصل ---------- */

const SOCIAL_SHAPES = ['circle', 'square', 'rounded'];
const SOCIAL_SHADOWS = ['none', 'light', 'medium', 'strong'];
const SOCIAL_STATUSES = ['visible', 'hidden', 'disabled'];

function social_db(): array {
    $db = read_json('social_platforms.json', null);
    $items = is_array($db) && is_list($db['items'] ?? null) ? $db['items'] : [];
    $max = 0;
    foreach ($items as $it) $max = max($max, (int)($it['id'] ?? 0));
    $next = (is_array($db) && is_int($db['nextId'] ?? null) && $db['nextId'] > $max) ? $db['nextId'] : $max + 1;
    return array_merge(is_array($db) && !is_list($db) ? obj($db) : [], ['nextId' => $next, 'items' => $items]);
}
function social_mutate(callable $fn) {
    return with_lock('social', function () use ($fn) {
        $db = social_db();
        $out = $fn($db);
        write_json('social_platforms.json', $db);
        return $out;
    });
}
function social_clicks(): array {
    $db = read_json('social_clicks.json', null);
    $o = fn($v) => is_array($v) && !is_list($v) ? obj($v) : [];
    return ['clicks' => $o($db['clicks'] ?? null), 'lastClick' => $o($db['lastClick'] ?? null)];
}
function sanitize_social_url($url): string {
    $url = trim(str_val($url));
    if (preg_match('/^\s*(javascript|data|vbscript):/i', $url)) return '';
    if ($url !== '' && !preg_match('#^(https?://|mailto:|tel:)#i', $url)) $url = 'https://' . ltrim($url, '/');
    return $url;
}
function social_index(array $db, $id): int {
    foreach ($db['items'] as $i => $p) if ((int)($p['id'] ?? 0) === (int)$id) return $i;
    send_json(['error' => 'المنصة غير موجودة.'], 404);
}

function api_social_list(): void {
    require_admin();
    $db = social_db();
    $c = social_clicks();
    $items = array_map(fn($p) => array_merge($p, ['clicks' => $c['clicks'][(string)$p['id']] ?? 0, 'lastClick' => $c['lastClick'][(string)$p['id']] ?? null]), $db['items']);
    usort($items, fn($a, $b) => ($a['order'] ?? 0) <=> ($b['order'] ?? 0));
    send_json(['items' => $items]);
}

function api_social_create(): void {
    require_admin();
    $b = json_body();
    $name = trim(str_val($b['name'] ?? ''));
    if ($name === '') send_json(['error' => 'اسم المنصة مطلوب.'], 422);
    $item = social_mutate(function (&$db) use ($b, $name) {
        $id = $db['nextId'];
        $db['nextId'] = $id + 1;
        $max = 0;
        foreach ($db['items'] as $it) $max = max($max, $it['order'] ?? 0);
        $now = now_iso();
        $new = ['id' => $id, 'name' => $name, 'url' => sanitize_social_url($b['url'] ?? ''), 'iconKey' => str_val($b['iconKey'] ?? '') ?: 'custom',
            'customSvg' => sanitize_custom_svg($b['customSvg'] ?? ''), 'iconImageUrl' => sanitize_asset_url_admin($b['iconImageUrl'] ?? ''),
            'shape' => in_array($b['shape'] ?? '', SOCIAL_SHAPES, true) ? $b['shape'] : 'rounded',
            'bgColor' => sanitize_color($b['bgColor'] ?? null, '#ffffff'), 'iconColor' => sanitize_color($b['iconColor'] ?? null, '#14151a'),
            'shadow' => in_array($b['shadow'] ?? '', SOCIAL_SHADOWS, true) ? $b['shadow'] : 'medium',
            'borderEnabled' => !empty($b['borderEnabled']), 'borderColor' => sanitize_color($b['borderColor'] ?? null, '#ffffff'),
            'borderWidth' => max(0, min(8, (int)str_val($b['borderWidth'] ?? '') ?: 2)),
            'status' => in_array($b['status'] ?? '', SOCIAL_STATUSES, true) ? $b['status'] : 'visible', 'order' => $max + 1,
            'showHeader' => !empty($b['showHeader']), 'showFooter' => body_has($b, 'showFooter') ? (bool)$b['showFooter'] : true,
            'showDesktop' => body_has($b, 'showDesktop') ? (bool)$b['showDesktop'] : true, 'showMobile' => body_has($b, 'showMobile') ? (bool)$b['showMobile'] : true,
            'createdAt' => $now, 'updatedAt' => $now];
        $db['items'][] = $new;
        return $new;
    });
    log_activity('create', 'social', $item['name']);
    send_json(['id' => $item['id'], 'item' => $item], 201);
}

function api_social_update(string $id): void {
    require_admin();
    $b = json_body();
    [$p, $oldIcon] = social_mutate(function (&$db) use ($id, $b) {
        $i = social_index($db, $id);
        $p = &$db['items'][$i];
        $oldIcon = $p['iconImageUrl'] ?? '';
        if (body_has($b, 'name')) $p['name'] = trim(js_str($b['name']));
        if (body_has($b, 'url')) $p['url'] = sanitize_social_url($b['url']);
        if (body_has($b, 'iconKey')) $p['iconKey'] = js_str($b['iconKey']);
        if (body_has($b, 'customSvg')) $p['customSvg'] = sanitize_custom_svg($b['customSvg']);
        if (body_has($b, 'iconImageUrl')) $p['iconImageUrl'] = sanitize_asset_url_admin($b['iconImageUrl']);
        if (in_array($b['shape'] ?? null, SOCIAL_SHAPES, true)) $p['shape'] = $b['shape'];
        if (body_has($b, 'bgColor')) $p['bgColor'] = sanitize_color($b['bgColor'], '#ffffff');
        if (body_has($b, 'iconColor')) $p['iconColor'] = sanitize_color($b['iconColor'], '#14151a');
        if (in_array($b['shadow'] ?? null, SOCIAL_SHADOWS, true)) $p['shadow'] = $b['shadow'];
        if (body_has($b, 'borderEnabled')) $p['borderEnabled'] = (bool)$b['borderEnabled'];
        if (body_has($b, 'borderColor')) $p['borderColor'] = sanitize_color($b['borderColor'], '#ffffff');
        if (body_has($b, 'borderWidth')) $p['borderWidth'] = max(0, min(8, (int)str_val($b['borderWidth'])));
        if (in_array($b['status'] ?? null, SOCIAL_STATUSES, true)) $p['status'] = $b['status'];
        foreach (['showHeader', 'showFooter', 'showDesktop', 'showMobile'] as $k) if (body_has($b, $k)) $p[$k] = (bool)$b[$k];
        $p['updatedAt'] = now_iso();
        $out = [$p, $oldIcon];
        unset($p);
        return $out;
    });
    drop_replaced_images([$oldIcon]);
    log_activity('update', 'social', (string)$p['name']);
    send_json(['ok' => true, 'item' => $p]);
}

function api_social_delete(string $id): void {
    require_admin();
    $target = social_mutate(function (&$db) use ($id) {
        $i = social_index($db, $id);
        $t = $db['items'][$i];
        array_splice($db['items'], $i, 1);
        return $t;
    });
    drop_replaced_images([str_val($target['iconImageUrl'] ?? '')]);
    log_activity('delete', 'social', (string)($target['name'] ?? $id));
    send_json(['ok' => true]);
}

function api_social_duplicate(string $id): void {
    require_admin();
    $copy = social_mutate(function (&$db) use ($id) {
        $i = social_index($db, $id);
        $newId = $db['nextId'];
        $db['nextId'] = $newId + 1;
        $max = 0;
        foreach ($db['items'] as $it) $max = max($max, $it['order'] ?? 0);
        $now = now_iso();
        $copy = array_merge($db['items'][$i], ['id' => $newId, 'name' => $db['items'][$i]['name'] . ' (نسخة)', 'order' => $max + 1, 'createdAt' => $now, 'updatedAt' => $now]);
        $db['items'][] = $copy;
        return $copy;
    });
    send_json(['id' => $copy['id'], 'item' => $copy], 201);
}

function api_social_reorder(): void {
    require_admin();
    $ids = json_body()['ids'] ?? null;
    if (!is_list($ids) || !$ids) send_json(['error' => 'missing ids'], 422);
    social_mutate(function (&$db) use ($ids) {
        $pos = [];
        foreach ($ids as $i => $id) $pos[(int)str_val($id)] = $i;
        foreach ($db['items'] as $k => $p) if (isset($pos[(int)$p['id']])) $db['items'][$k]['order'] = $pos[(int)$p['id']];
    });
    send_json(['ok' => true]);
}

function api_social_upload_icon(): void {
    require_admin();
    $url = receive_image();
    if (!$url) send_json(['error' => 'لم يتم إرفاق صورة.'], 400);
    send_json(['ok' => true, 'iconImageUrl' => $url]);
}

function api_social_export(): void {
    require_admin();
    header('Content-Disposition: attachment; filename="social-platforms-export.json"');
    send_json(social_db());
}

function api_social_import(): void {
    require_admin();
    $b = json_body();
    $items = $b['items'] ?? null;
    if (!is_list($items)) send_json(['error' => 'ملف غير صالح.'], 422);
    $max = 0;
    foreach ($items as $it) $max = max($max, (int)str_val(is_array($it) ? ($it['id'] ?? '') : ''));
    $db = ['items' => $items, 'nextId' => max($max + 1, (int)str_val($b['nextId'] ?? '') ?: 1)];
    with_lock('social', fn() => write_json('social_platforms.json', $db));
    send_json(['ok' => true, 'count' => count($items)]);
}
