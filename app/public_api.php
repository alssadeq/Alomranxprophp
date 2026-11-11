<?php
// app/public_api.php
// واجهات الموقع العامة: الإعدادات والأعمال ووسائل التواصل ونموذج التواصل والتقييمات.

declare(strict_types=1);

const CONTACT_PROJECT_TYPES = ['villa' => 'فيلا', 'residential' => 'مبنى سكني', 'commercial' => 'مبنى تجاري', 'factory' => 'مصنع / مستودع', 'other' => 'أخرى'];

function api_settings_public(): void { send_json(public_settings()); }
function api_works_public(): void { send_json(['works' => visible_works()]); }

/* ---------- وسائل التواصل الاجتماعي ---------- */

function sanitize_color($v, string $fb): string {
    $v = trim(str_val($v));
    return preg_match('/^(#[0-9a-f]{3,8}|rgba?\(\s*[0-9 .,%]+\s*\)|hsla?\(\s*[0-9 .%,]+\s*\))$/i', $v) ? $v : $fb;
}
function sanitize_asset_url($v): string {
    return (is_string($v) && preg_match('#^/images/[A-Za-z0-9._/-]+$#', $v)) ? $v : '';
}
// نفس sanitizeCustomSvg في نسخة Node
function sanitize_custom_svg($value): string {
    $svg = trim(str_val($value));
    if ($svg === '' || strlen($svg) > 20000) return '';
    if (!preg_match('/^<svg\b/i', $svg)) return '';
    $svg = preg_replace('/<\/?(script|iframe|object|embed|foreignObject|base|form)\b[^>]*>/i', '', $svg);
    $svg = preg_replace('/\s+on[a-z0-9_-]+\s*=\s*([\'"]).*?\1/is', '', $svg);
    $svg = preg_replace('/\s+(?:href|xlink:href|src)\s*=\s*([\'"])\s*(?:javascript|data|vbscript):.*?\1/is', '', $svg);
    $svg = preg_replace('/url\s*\(\s*([\'"]?)(?:javascript|data|vbscript):.*?\1\s*\)/is', 'none', $svg);
    return (string)$svg;
}

function social_platforms(): array {
    $db = read_json('social_platforms.json', ['items' => []]);
    return is_array($db) ? $db : ['items' => []];
}

function api_public_social(): void {
    $items = array_values(array_filter(social_platforms()['items'] ?? [], fn($p) => is_array($p) && (($p['status'] ?? 'visible') ?: 'visible') === 'visible'));
    usort($items, fn($a, $b) => ($a['order'] ?? 0) <=> ($b['order'] ?? 0));
    $out = array_map(fn($p) => [
        'id' => $p['id'] ?? null, 'name' => $p['name'] ?? '', 'url' => $p['url'] ?? '',
        'iconKey' => ($p['iconKey'] ?? '') ?: 'custom',
        'customSvg' => sanitize_custom_svg($p['customSvg'] ?? ''),
        'iconImageUrl' => sanitize_asset_url($p['iconImageUrl'] ?? ''),
        'shape' => ($p['shape'] ?? '') ?: 'rounded',
        'bgColor' => sanitize_color($p['bgColor'] ?? null, '#14151A'),
        'iconColor' => sanitize_color($p['iconColor'] ?? null, '#ffffff'),
        'shadow' => ($p['shadow'] ?? '') ?: 'medium',
        'borderEnabled' => !empty($p['borderEnabled']),
        'borderColor' => sanitize_color($p['borderColor'] ?? null, '#ffffff'),
        'borderWidth' => ($p['borderWidth'] ?? 0) ?: 2,
        'showHeader' => !empty($p['showHeader']),
        'showFooter' => ($p['showFooter'] ?? null) !== false,
        'showDesktop' => ($p['showDesktop'] ?? null) !== false,
        'showMobile' => ($p['showMobile'] ?? null) !== false,
    ], $items);
    send_json(['items' => $out]);
}

function api_public_social_click(): void {
    rate_limit('social_click', 120, 600, 'تم تجاوز عدد النقرات المسجلة مؤقتاً. حاول لاحقاً.');
    $id = (int)str_val(json_body()['id'] ?? '');
    if (!$id) send_json(['error' => 'missing id'], 422);
    $exists = false;
    foreach (social_platforms()['items'] ?? [] as $p) if (is_array($p) && (int)($p['id'] ?? 0) === $id) $exists = true;
    if (!$exists) send_json(['error' => 'platform not found'], 404);
    $count = with_lock('social_clicks', function () use ($id) {
        $db = read_json('social_clicks.json', ['clicks' => [], 'lastClick' => []]);
        $clicks = is_array($db['clicks'] ?? null) ? $db['clicks'] : [];
        $last = is_array($db['lastClick'] ?? null) ? $db['lastClick'] : [];
        $clicks[(string)$id] = (int)($clicks[(string)$id] ?? 0) + 1;
        $last[(string)$id] = now_iso();
        // كائنات JSON حتى لو كانت المفاتيح أرقاماً متتالية
        write_json('social_clicks.json', ['clicks' => (object)$clicks, 'lastClick' => (object)$last] + array_diff_key($db, ['clicks' => 1, 'lastClick' => 1]));
        return $clicks[(string)$id];
    });
    send_json(['ok' => true, 'clicks' => $count]);
}

/* ---------- نموذج التواصل ---------- */

function api_contact(): void {
    rate_limit('contact', 20, 600, 'تم تجاوز عدد محاولات الإرسال. حاول لاحقاً.');
    $b = json_body();
    $name = trim(str_val($b['name'] ?? ''));
    $phone = trim(str_val($b['phone'] ?? ''));
    $projectType = trim(str_val($b['projectType'] ?? ''));
    $message = trim(str_val($b['message'] ?? ''));
    if ($name === '' || $phone === '') send_json(['error' => 'الاسم ورقم الجوال مطلوبان.'], 400);
    if (mb_len($name) > 120 || mb_len($phone) > 40 || mb_len($projectType) > 120 || mb_len($message) > 5000) {
        send_json(['error' => 'البيانات المرسلة تتجاوز الحدود المسموحة.'], 400);
    }
    $msg = [
        'id' => 'm_' . rand_hex(6), 'name' => $name, 'phone' => $phone, 'projectType' => $projectType,
        'message' => $message, 'read' => false, 'createdAt' => now_iso(),
    ];
    with_lock('messages', function () use ($msg) {
        $list = read_json('messages.json', []);
        if (!is_list($list)) $list = [];
        if (count($list) >= 5000) $list = array_slice($list, 0, 4999);
        array_unshift($list, $msg);
        write_json('messages.json', $list);
    });
    $label = CONTACT_PROJECT_TYPES[$projectType] ?? $projectType;
    record_customer(['name' => $name, 'phone' => $phone, 'source' => 'contact', 'ref' => ['type' => 'contact', 'id' => $msg['id'], 'label' => 'طلب تواصل: ' . ($label ?: 'عام'), 'at' => $msg['createdAt']]]);
    respond_then(fn() => send_json(['ok' => true, 'messageRecord' => $msg], 201), function () use ($msg, $label) {
        notify_company('requests.contact', [
            'vars' => ['name' => $msg['name']], 'title' => 'رسالة جديدة من نموذج التواصل',
            'rows' => [['الاسم', $msg['name']], ['الجوال', $msg['phone']], ['نوع المشروع', $label]],
            'body' => $msg['message'], 'linkLabel' => 'عرض الرسائل في لوحة التحكم',
        ]);
    });
}

// يُرسل الرد للمتصفح أولاً ثم يكمل العمل (مثل إرسال البريد) دون أن ينتظر العميل
function respond_then(callable $respond, callable $after): void {
    register_shutdown_function(function () use ($after) {
        if (function_exists('fastcgi_finish_request')) @fastcgi_finish_request();
        elseif (function_exists('litespeed_finish_request')) @litespeed_finish_request();
        try { $after(); } catch (Throwable $e) { log_error($e->getMessage()); }
    });
    $respond();
}

/* ---------- قاعدة العملاء (نفس lib/customers.js) ---------- */

function normalize_phone($raw): string {
    $s = preg_replace('/[\s()\-.]/', '', trim(ar_digits(str_val($raw))));
    if ($s === '') return '';
    if (str_starts_with($s, '00')) $s = '+' . substr($s, 2);
    if (str_starts_with($s, '+')) return preg_match('/^\+[1-9]\d{6,14}$/', $s) ? $s : '';
    if (preg_match('/^05\d{8}$/', $s)) return '+966' . substr($s, 1);
    if (preg_match('/^5\d{8}$/', $s)) return '+966' . $s;
    if (preg_match('/^9665\d{8}$/', $s)) return '+' . $s;
    return preg_match('/^\d{7,15}$/', $s) ? $s : '';
}

function record_customer(array $data): void {
    try {
        with_lock('customers', function () use ($data) {
            $list = read_json('customers.json', []);
            if (!is_list($list)) $list = [];
            $p = normalize_phone($data['phone'] ?? '');
            $e = strtolower(trim(str_val($data['email'] ?? '')));
            if (strlen($e) > 254 || !preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $e)) $e = '';
            if ($p === '' && $e === '') return;
            $now = now_iso();
            $ref = $data['ref'] ?? null;
            $at = $ref['at'] ?? $now;
            $idx = null;
            foreach ($list as $i => $c) {
                if (($p !== '' && ($c['phone'] ?? '') === $p) || ($e !== '' && ($c['email'] ?? '') === $e)) { $idx = $i; break; }
            }
            $clean = fn($v, $n) => mb_slice(trim(preg_replace('/\s+/u', ' ', str_val($v))), $n);
            if ($idx === null) {
                $list[] = ['id' => 'cus_' . rand_hex(8), 'name' => $clean($data['name'] ?? '', 100) ?: 'عميل بدون اسم', 'phone' => $p, 'email' => $e,
                    'organization' => '', 'status' => 'new', 'notes' => '', 'sources' => [], 'refs' => [], 'contactLog' => [],
                    'createdAt' => $at, 'updatedAt' => $now, 'lastActivityAt' => $at, 'lastContactAt' => null];
                $idx = count($list) - 1;
            } else {
                $c = &$list[$idx];
                foreach ($c['refs'] ?? [] as $r) if ($ref && ($r['type'] ?? '') === $ref['type'] && ($r['id'] ?? '') === $ref['id']) return;
                if (empty($c['phone']) && $p) $c['phone'] = $p;
                if (empty($c['email']) && $e) $c['email'] = $e;
                if ((empty($c['name']) || $c['name'] === 'عميل بدون اسم') && !empty($data['name'])) $c['name'] = $clean($data['name'], 100);
                if ($at < ($c['createdAt'] ?? $at)) $c['createdAt'] = $at;
                $c['updatedAt'] = $now;
                unset($c);
            }
            $c = &$list[$idx];
            if (!is_list($c['sources'] ?? null)) $c['sources'] = [];
            if (!empty($data['source']) && !in_array($data['source'], $c['sources'], true)) $c['sources'][] = $data['source'];
            if ($ref) {
                $c['refs'][] = ['type' => $ref['type'], 'id' => $ref['id'], 'label' => $clean($ref['label'] ?? '', 200), 'at' => $at];
                usort($c['refs'], fn($a, $b) => strcmp((string)$b['at'], (string)$a['at']));
                if ($at > ($c['lastActivityAt'] ?? '')) $c['lastActivityAt'] = $at;
            }
            unset($c);
            write_json('customers.json', $list);
        });
    } catch (Throwable $e) { log_error('تعذر تسجيل العميل: ' . $e->getMessage()); }
}
