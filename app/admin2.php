<?php
// app/admin2.php
// لوحة التحكم: التقييمات وبريد الشركة والإشعارات وطلبات المشاريع والجرس — نفس server.js.

declare(strict_types=1);

const REVIEW_MESSAGE_DEFAULT = "مرحباً {الاسم} 👋\nنشكرك على ثقتك بالعمران الذهبية للمقاولات العامة في تنفيذ {المشروع}.\n\nرأيك يهمنا ويساعدنا على تقديم خدمة أفضل دائماً، ويسعدنا أن تشاركنا تقييمك لتجربتك معنا (لن يستغرق أكثر من دقيقة):\n{الرابط}\n\nمع خالص التقدير،\nفريق العمران الذهبية للمقاولات العامة";
const REVIEW_EMAIL_DEFAULTS = [
    'senderName' => '', 'replyTo' => '',
    'subject' => '{الاسم}، رأيك يهمنا — قيّم تجربتك مع العمران الذهبية',
    'heading' => 'مرحباً {الاسم} 👋',
    'body' => "نشكرك على ثقتك بالعمران الذهبية للمقاولات العامة في تنفيذ {المشروع}.\n\nرأيك يهمنا ويساعدنا على تقديم خدمة أفضل دائماً، ويسعدنا أن تشاركنا تقييمك لتجربتك معنا. لن يستغرق ذلك أكثر من دقيقة.\n\nمع خالص التقدير،\nفريق العمران الذهبية",
    'button' => 'قيّم تجربتك الآن', 'buttonColor' => '#1E2A32',
    'footer' => 'العمران الذهبية للمقاولات العامة — العمران… ثقة وإتقان',
    'showImage' => true, 'showStars' => true,
];
const REVIEW_EMAIL_LIMITS = ['senderName' => 80, 'replyTo' => 254, 'subject' => 200, 'heading' => 150, 'body' => 3000, 'button' => 60, 'footer' => 200];

/* ---------- طلبات التقييم ---------- */

function reviews_list_all(): array { $l = read_json('reviews.json', []); return is_list($l) ? $l : []; }
function review_get(string $id): ?array { foreach (reviews_list_all() as $r) if (($r['id'] ?? '') === $id) return $r; return null; }
function reviews_mutate(string $id, callable $fn): ?array {
    return with_lock('reviews', function () use ($id, $fn) {
        $l = reviews_list_all();
        foreach ($l as $i => $r) if (($r['id'] ?? '') === $id) { $fn($l[$i]); write_json('reviews.json', $l); return $l[$i]; }
        return null;
    });
}

function review_invite_full(array $s): array {
    $c = review_invite_settings($s);
    $raw = is_array($s['reviewInvite'] ?? null) ? $s['reviewInvite'] : [];
    $t = is_array($raw['message'] ?? null) ? (str_val($raw['message']['ar'] ?? '') ?: str_val($raw['message']['en'] ?? '')) : '';
    $c['message'] = trim($t ?: REVIEW_MESSAGE_DEFAULT);
    return $c;
}
function review_link(array $r): string { return site_base_url() . '/review/' . $r['token']; }
function review_view(array $r, array $testimonials, ?array $cfg = null): array {
    $cfg = $cfg ?? review_invite_full(get_settings());
    $t = null;
    foreach ($testimonials as $x) if (($x['reviewId'] ?? null) === $r['id']) $t = $x;
    $published = $t && ($t['visible'] ?? null) !== false;
    $status = empty($r['review']) ? 'invited' : ($published ? 'approved' : (($r['status'] ?? '') === 'pending' ? 'pending' : 'hidden'));
    $msg = strtr($cfg['message'], ['{الاسم}' => ($r['name'] ?? '') ?: 'عميلنا العزيز', '{المشروع}' => ($r['project'] ?? '') ?: 'مشروعك', '{الرابط}' => review_link($r)]);
    return array_merge($r, ['status' => $status, 'published' => (bool)$published, 'link' => review_link($r), 'message' => $msg]);
}

function clean_review_email($src, bool $forSave = false): array {
    $b = is_array($src) ? $src : [];
    $out = [];
    foreach (REVIEW_EMAIL_LIMITS as $k => $n) {
        $v = mb_slice(trim(str_replace("\r\n", "\n", ($b[$k] ?? null) === null ? '' : js_str($b[$k]))), $n);
        if ($k === 'senderName' || $k === 'subject') $v = trim(preg_replace('/[\r\n<>"]+/', ' ', $v));
        if ($k === 'replyTo') $v = strtolower($v);
        $out[$k] = $forSave ? $v : ($v !== '' ? $v : ($k === 'replyTo' ? '' : REVIEW_EMAIL_DEFAULTS[$k]));
    }
    $color = trim(str_val($b['buttonColor'] ?? ''));
    $out['buttonColor'] = preg_match('/^#[0-9a-f]{6}$/i', $color) ? $color : ($forSave ? '' : REVIEW_EMAIL_DEFAULTS['buttonColor']);
    $out['showImage'] = !array_key_exists('showImage', $b) ? true : ($b['showImage'] !== false);
    $out['showStars'] = !array_key_exists('showStars', $b) ? true : ($b['showStars'] !== false);
    return $out;
}

function render_review_email(array $r, array $e): array {
    $cfg = review_invite_settings(get_settings());
    $base = site_base_url();
    $link = review_link($r);
    $fill = fn($t) => strtr((string)$t, ['{الاسم}' => ($r['name'] ?? '') ?: 'عميلنا العزيز', '{المشروع}' => ($r['project'] ?? '') ?: 'مشروعك', '{الرابط}' => $link]);
    $subject = preg_replace('/[\r\n]+/', ' ', $fill($e['subject']));
    $heading = $fill($e['heading']);
    $bodyText = $fill($e['body']);
    $bodyHtml = str_replace("\n", '<br>', implode('<a href="' . escape_html($link) . '" style="color:#9a7a2c;word-break:break-all" dir="ltr">' . escape_html($link) . '</a>', array_map('escape_html', explode("\0", $fill(str_replace('{الرابط}', "\0", $e['body']))))));
    $btn = preg_match('/^#[0-9a-f]{6}$/i', $e['buttonColor']) ? $e['buttonColor'] : REVIEW_EMAIL_DEFAULTS['buttonColor'];
    $n = hexdec(substr($btn, 1));
    $lum = (0.299 * ($n >> 16) + 0.587 * (($n >> 8) & 255) + 0.114 * ($n & 255)) / 255;
    $btnText = $lum > 0.6 ? '#1E2A32' : '#ffffff';
    $img = $base . ($cfg['image'] ?: REVIEW_DEFAULTS['image']);
    $html = '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' . escape_html($subject) . '</title></head>
<body style="margin:0;background:#f4f1ea">
<div dir="rtl" style="background:#f4f1ea;padding:24px 12px;font-family:Tahoma,Arial,sans-serif">
  <div style="max-width:600px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e8e1d4">
    ' . ($e['showImage'] ? '<a href="' . escape_html($link) . '"><img src="' . escape_html($img) . '" alt="' . escape_html($cfg['title']) . '" width="600" style="display:block;width:100%;height:auto;border:0"></a>' : '') . '
    <div style="padding:24px 26px;color:#1a1a1a;line-height:1.9;font-size:15px;text-align:right">
      ' . ($heading !== '' ? '<h1 style="margin:0 0 12px;color:#1E2A32;font-size:22px">' . escape_html($heading) . '</h1>' : '') . '
      <p style="margin:0 0 16px">' . $bodyHtml . '</p>
      ' . ($e['showStars'] ? '<p style="text-align:center;margin:22px 0 8px;font-size:28px;letter-spacing:4px;color:#D4A537">★★★★★</p>' : '') . '
      <p style="text-align:center;margin:' . ($e['showStars'] ? '0' : '22px') . ' 0 22px"><a href="' . escape_html($link) . '" style="display:inline-block;background:' . $btn . ';color:' . $btnText . ';text-decoration:none;font-weight:700;padding:13px 32px;border-radius:999px">' . escape_html($fill($e['button'])) . '</a></p>
      <p style="color:#7c7f85;font-size:12px;margin:0">إذا لم يعمل الزر، انسخ هذا الرابط في المتصفح:<br><span dir="ltr" style="word-break:break-all">' . escape_html($link) . '</span></p>
    </div>
    ' . ($e['footer'] !== '' ? '<div style="background:#1E2A32;color:#C9B895;text-align:center;font-size:12.5px;padding:12px 16px">' . escape_html($fill($e['footer'])) . '</div>' : '') . '
  </div>
</div></body></html>';
    $text = implode("\n\n", array_filter([$heading, $bodyText, $fill($e['button']) . ': ' . $link, $e['footer'] !== '' ? $fill($e['footer']) : ''], fn($x) => $x !== ''));
    return ['subject' => $subject, 'html' => $html, 'text' => $text];
}
const SAMPLE_REVIEW = ['name' => 'عميلنا العزيز', 'project' => 'فيلا سكنية – حي النرجس', 'token' => 'example-link'];

function api_reviews_list(): void {
    $me = require_admin();
    $s = get_settings();
    $t = $s['testimonials'] ?? [];
    $cfg = review_invite_full($s);
    $raw = is_array($s['reviewInvite'] ?? null) ? $s['reviewInvite'] : [];
    $list = reviews_list_all();
    usort($list, fn($a, $b) => strcmp((string)($b['createdAt'] ?? ''), (string)($a['createdAt'] ?? '')));
    send_json([
        'reviews' => array_map(fn($r) => review_view($r, $t, $cfg), $list),
        'criteria' => REVIEW_CRITERIA, 'mailConfigured' => mail_configured(),
        'testimonialsVisible' => ($s['testimonialsVisible'] ?? null) !== false,
        'invite' => ['image' => $cfg['image'], 'title' => str_val($raw['title']['ar'] ?? ''), 'description' => str_val($raw['description']['ar'] ?? ''), 'message' => str_val($raw['message']['ar'] ?? '')],
        'defaults' => array_merge(REVIEW_DEFAULTS, ['message' => REVIEW_MESSAGE_DEFAULT]),
        'email' => clean_review_email($s['reviewEmail'] ?? null, true), 'emailDefaults' => REVIEW_EMAIL_DEFAULTS,
        'senderAddress' => mail_sender_address(), 'mailSource' => mail_source(), 'accountName' => mail_account()['fromName'] ?: '',
        'userEmail' => ($me['email'] ?? '') ?: '',
    ]);
}

function api_reviews_create(): void {
    $me = require_admin();
    $b = json_body();
    $inv = [
        'id' => 'rv_' . rand_hex(6), 'token' => b64url(random_bytes(18)),
        'name' => review_clean($b['name'] ?? '', 80), 'email' => strtolower(review_clean($b['email'] ?? '', 254)),
        'phone' => preg_replace('/[^\d+]/', '', review_clean($b['phone'] ?? '', 30)), 'project' => review_clean($b['project'] ?? '', 120),
        'createdAt' => now_iso(), 'createdBy' => $me['username'] ?? '', 'sentAt' => null, 'sentVia' => [], 'openedAt' => null, 'submittedAt' => null,
        'status' => 'invited', 'review' => null,
    ];
    if ($inv['name'] === '') send_json(['error' => 'اكتب اسم العميل.'], 400);
    if ($inv['email'] !== '' && !preg_match(MAIL_EMAIL_RE, $inv['email'])) send_json(['error' => 'البريد الإلكتروني غير صحيح.'], 400);
    with_lock('reviews', function () use ($inv) { $l = reviews_list_all(); array_unshift($l, $inv); write_json('reviews.json', array_slice($l, 0, 2000)); });
    send_json(['review' => review_view($inv, get_settings()['testimonials'] ?? [])], 201);
}

function review_mark_sent(string $id, string $via): ?array {
    return reviews_mutate($id, function (&$r) use ($via) {
        $r['sentAt'] = now_iso();
        $r['sentVia'] = array_values(array_unique(array_merge($r['sentVia'] ?? [], [$via])));
    });
}

function api_reviews_sent(string $id): void {
    require_admin();
    $b = json_body();
    $via = in_array($b['via'] ?? '', ['copy', 'whatsapp', 'email'], true) ? $b['via'] : 'copy';
    $phone = substr(preg_replace('/[^\d+]/', '', str_val($b['phone'] ?? '')), 0, 20);
    if ($phone !== '') reviews_mutate($id, function (&$r) use ($phone) { $r['phone'] = $phone; });
    $r = review_mark_sent($id, $via);
    if (!$r) send_json(['error' => 'طلب التقييم غير موجود.'], 404);
    send_json(['review' => review_view($r, get_settings()['testimonials'] ?? [])]);
}

function api_reviews_email(string $id): void {
    $me = require_admin();
    rate_limit('customer_email', 30, 600, 'تم تجاوز عدد الرسائل المرسلة للعملاء مؤقتاً. حاول بعد قليل.', $me['id']);
    $r = review_get($id);
    if (!$r) send_json(['error' => 'طلب التقييم غير موجود.'], 404);
    if (!mail_configured()) send_json(['error' => 'لم يُضبط بريد الشركة للإرسال بعد. اضبطه من بطاقة «بريد الشركة للإرسال» في هذا التبويب.', 'code' => 'mail_not_configured'], 400);
    $new = strtolower(trim(str_val(json_body()['email'] ?? '')));
    if ($new !== '') {
        if (!preg_match(MAIL_EMAIL_RE, $new) || strlen($new) > 254) send_json(['error' => 'البريد الإلكتروني غير صحيح.'], 400);
        $r = reviews_mutate($id, function (&$x) use ($new) { $x['email'] = $new; });
    }
    if (empty($r['email'])) send_json(['error' => 'اكتب بريد العميل الإلكتروني.', 'code' => 'email_required'], 400);
    $e = clean_review_email(get_settings()['reviewEmail'] ?? null);
    $m = render_review_email($r, $e);
    try { send_mail_or_throw([$r['email']], $m['subject'], $m['text'], $m['html'], $e['replyTo'] ?: null, $e['senderName'] ?: null); }
    catch (Throwable $ex) { send_json(['error' => 'تعذر إرسال البريد: ' . $ex->getMessage()], 502); }
    $u = review_mark_sent($id, 'email');
    send_json(['review' => review_view($u, get_settings()['testimonials'] ?? [])]);
}

function api_reviews_email_settings(): void {
    require_admin();
    $e = clean_review_email(json_body(), true);
    if ($e['replyTo'] !== '' && !preg_match(MAIL_EMAIL_RE, $e['replyTo'])) send_json(['error' => 'عنوان الرد غير صحيح.'], 400);
    settings_mutate(function (&$s) use ($e) { $s['reviewEmail'] = $e; });
    send_json(['ok' => true, 'email' => $e]);
}
function api_reviews_email_preview(): void {
    require_admin();
    $m = render_review_email(SAMPLE_REVIEW, clean_review_email(json_body()));
    send_json(['subject' => $m['subject'], 'html' => $m['html']]);
}
function api_reviews_email_test(): void {
    $me = require_admin();
    rate_limit('customer_email', 30, 600, 'تم تجاوز عدد الرسائل المرسلة للعملاء مؤقتاً. حاول بعد قليل.', $me['id']);
    if (!mail_configured()) send_json(['error' => 'لم يُضبط بريد الشركة للإرسال بعد. اضبطه من بطاقة «بريد الشركة للإرسال».'], 400);
    $b = json_body();
    $to = strtolower(trim(str_val(($b['to'] ?? '') ?: ($me['email'] ?? ''))));
    if (!preg_match(MAIL_EMAIL_RE, $to)) send_json(['error' => 'اكتب بريداً صحيحاً لاستلام الرسالة التجريبية.'], 400);
    $e = clean_review_email($b['email'] ?? null);
    $m = render_review_email(SAMPLE_REVIEW, $e);
    try { send_mail_or_throw([$to], '[تجربة] ' . $m['subject'], $m['text'], $m['html'], $e['replyTo'] ?: null, $e['senderName'] ?: null); }
    catch (Throwable $ex) { send_json(['error' => 'تعذر إرسال البريد: ' . $ex->getMessage()], 502); }
    send_json(['ok' => true, 'to' => $to]);
}

function api_reviews_approve(string $id): void {
    require_admin();
    $r = review_get($id);
    if (!$r || empty($r['review'])) send_json(['error' => 'لا يوجد تقييم لهذا الطلب بعد.'], 404);
    if (empty($r['review']['consent'])) send_json(['error' => 'العميل لم يوافق على نشر تقييمه، فيبقى للاطلاع الداخلي فقط.'], 400);
    $s = settings_mutate(function (&$s) use ($r) {
        $list = $s['testimonials'] ?? [];
        $found = false;
        foreach ($list as $i => $t) if (($t['reviewId'] ?? null) === $r['id']) { $list[$i]['visible'] = true; $found = true; }
        if (!$found) {
            if (count($list) >= 30) return [400, 'وصلت آراء العملاء للحد الأقصى (30). احذف رأياً قديماً من محرر الآراء أولاً.'];
            $en = ($r['review']['lang'] ?? '') === 'en';
            $bi = fn($v) => $en ? ['ar' => '', 'en' => $v] : ['ar' => $v, 'en' => ''];
            array_unshift($list, ['id' => 'ts_' . $r['id'], 'reviewId' => $r['id'], 'source' => 'review', 'name' => $bi($r['review']['name']),
                'role' => $bi(($r['review']['role'] ?? '') ?: ($r['project'] ?? '')), 'text' => $bi($r['review']['text']), 'rating' => $r['review']['rating'], 'visible' => true]);
        }
        $s['testimonials'] = $list;
        return null;
    });
    $u = reviews_mutate($id, function (&$x) { $x['status'] = 'approved'; });
    send_json(['review' => review_view($u, $s['testimonials']), 'testimonials' => $s['testimonials']]);
}

function api_reviews_hide(string $id): void {
    require_admin();
    $r = review_get($id);
    if (!$r || empty($r['review'])) send_json(['error' => 'لا يوجد تقييم لهذا الطلب بعد.'], 404);
    $s = get_settings();
    $has = false;
    foreach ($s['testimonials'] ?? [] as $t) if (($t['reviewId'] ?? null) === $id) $has = true;
    if ($has) $s = settings_mutate(function (&$s) use ($id) { foreach ($s['testimonials'] as $i => $t) if (($t['reviewId'] ?? null) === $id) $s['testimonials'][$i]['visible'] = false; });
    $u = reviews_mutate($id, function (&$x) { $x['status'] = 'hidden'; });
    send_json(['review' => review_view($u, $s['testimonials'] ?? []), 'testimonials' => $s['testimonials'] ?? []]);
}

function api_reviews_delete(string $id): void {
    require_admin();
    $r = with_lock('reviews', function () use ($id) {
        $l = reviews_list_all();
        foreach ($l as $i => $r) if (($r['id'] ?? '') === $id) { array_splice($l, $i, 1); write_json('reviews.json', $l); return $r; }
        return null;
    });
    if (!$r) send_json(['error' => 'طلب التقييم غير موجود.'], 404);
    $s = get_settings();
    $before = count($s['testimonials'] ?? []);
    $after = array_values(array_filter($s['testimonials'] ?? [], fn($t) => ($t['reviewId'] ?? null) !== $id));
    if (count($after) !== $before) $s = settings_mutate(function (&$s) use ($id) { $s['testimonials'] = array_values(array_filter($s['testimonials'] ?? [], fn($t) => ($t['reviewId'] ?? null) !== $id)); });
    send_json(['ok' => true, 'testimonials' => $s['testimonials'] ?? []]);
}

function api_reviews_settings(): void {
    require_admin();
    $b = json_body();
    $clip = fn($v, $n) => ['ar' => mb_slice(trim(str_replace("\r\n", "\n", str_val($v))), $n), 'en' => ''];
    settings_mutate(function (&$s) use ($b, $clip) {
        $c = is_array($s['reviewInvite'] ?? null) ? obj($s['reviewInvite']) : [];
        $c['title'] = $clip($b['title'] ?? '', 120);
        $c['description'] = $clip($b['description'] ?? '', 300);
        $c['message'] = $clip($b['message'] ?? '', 1500);
        $s['reviewInvite'] = $c;
    });
    send_json(['ok' => true]);
}
function api_reviews_settings_image(bool $delete): void {
    require_admin();
    $url = $delete ? '' : receive_image();
    if (!$delete && !$url) send_json(['error' => 'لم يتم إرفاق صورة.'], 400);
    $old = '';
    settings_mutate(function (&$s) use ($url, &$old) {
        $c = is_array($s['reviewInvite'] ?? null) ? obj($s['reviewInvite']) : [];
        $old = str_val($c['image'] ?? '');
        $c['image'] = $url;
        $s['reviewInvite'] = $c;
    });
    drop_replaced_images([$old]);
    send_json($delete ? ['ok' => true] : ['ok' => true, 'image' => $url]);
}

/* ---------- بريد الشركة ---------- */

function api_mail_account_get(): void {
    require_admin();
    send_json(['account' => mail_account_public(), 'providers' => MAIL_PROVIDERS, 'source' => mail_source(), 'envConfigured' => mail_env_configured()]);
}
function api_mail_account_put(): void {
    require_admin();
    $out = mail_account_validate(json_body());
    if (isset($out['error'])) send_json(['error' => $out['error']], 400);
    mail_account_save($out['account']);
    log_activity('update', 'settings', 'بريد الشركة للإرسال');
    send_json(['account' => mail_account_public(), 'source' => mail_source()]);
}
function api_mail_account_test(): void {
    $me = require_admin();
    rate_limit('customer_email', 30, 600, 'تم تجاوز عدد الرسائل المرسلة للعملاء مؤقتاً. حاول بعد قليل.', $me['id']);
    $b = json_body();
    $out = mail_account_validate(array_merge($b, ['enabled' => true]));
    if (isset($out['error'])) send_json(['error' => $out['error']], 400);
    $a = $out['account'];
    $to = strtolower(trim(str_val(($b['to'] ?? '') ?: (($me['email'] ?? '') ?: $a['fromEmail']))));
    if (!preg_match(MAIL_EMAIL_RE, $to)) send_json(['error' => 'اكتب بريداً صحيحاً لاستلام الرسالة التجريبية.'], 400);
    $same = mail_account()['fromEmail'] === $a['fromEmail'];
    try {
        mail_test_account($a, $to, 'رسالة تجريبية من لوحة تحكم العمران ✅',
            'تم ضبط بريد الشركة ' . $a['fromEmail'] . ' بنجاح، وسترسل دعوات التقييم ورسائل الموقع منه.',
            '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.9;color:#1a1a1a"><h2 style="color:#1E2A32;margin:0 0 8px">تم ضبط بريد الشركة بنجاح ✅</h2><p>هذه رسالة تجريبية من لوحة تحكم العمران الذهبية. ستُرسل دعوات التقييم ورسائل الموقع من <b dir="ltr">' . escape_html($a['fromEmail']) . '</b>.</p></div>');
    } catch (Throwable $e) {
        $raw = $e->getMessage();
        $hint = preg_match('/auth|535|534|login|credentials|password/i', $raw) ? 'تعذر تسجيل الدخول: تأكد من البريد وكلمة المرور (في Gmail استخدم «كلمة مرور التطبيقات»).'
            : (preg_match('/ENOTFOUND|EAI_AGAIN|getaddrinfo|php_network/i', $raw) ? 'عنوان خادم البريد غير موجود. تأكد من اسم الخادم.'
            : (preg_match('/ETIMEDOUT|ECONNREFUSED|ECONNRESET|timeout|timed out/i', $raw) ? 'تعذر الاتصال بخادم البريد. تأكد من المنفذ ونوع التشفير (465 مع SSL أو 587 مع STARTTLS).' : 'تعذر الإرسال.'));
        if ($same) mail_account_record_test(false, $hint);
        $details = ['اسم الدخول المستخدم: ' . $a['user'], $a['usedSavedPass'] ? 'استُخدمت كلمة المرور المحفوظة سابقاً لأن الحقل فارغ' : 'طول كلمة المرور المُدخلة: ' . mb_len($a['pass']) . ' حرفاً'];
        send_json(['error' => $hint . "\n" . implode(' · ', $details) . "\n(" . mb_slice($raw, 160) . ')'], 400);
    }
    if ($same) mail_account_record_test(true, 'تم الإرسال إلى ' . $to);
    send_json(['ok' => true, 'to' => $to]);
}

/* ---------- الإشعارات والجرس ---------- */

function api_notifications_get(): void { require_admin(); send_json(notify_public_config()); }
function api_notifications_put(): void {
    require_admin();
    $r = notify_validate(json_body());
    if (isset($r['error'])) send_json(['error' => $r['error']], 400);
    settings_mutate(function (&$s) use ($r) { $s['notifications'] = $r['config']; if (is_array($s['briefs'] ?? null)) unset($s['briefs']['notifyEmail']); });
    log_activity('update', 'settings', 'إشعارات البريد الإلكتروني');
    send_json(array_merge(['ok' => true], notify_public_config()));
}
function api_notifications_action(string $what): void {
    require_admin();
    rate_limit('notify_test', 5, 600, 'تم تجاوز عدد الرسائل التجريبية. حاول بعد قليل.');
    try {
        if ($what === 'test') { $to = notify_send_test(); send_json(['ok' => true, 'message' => 'أُرسلت رسالة تجريبية إلى: ' . implode('، ', $to)]); }
        if ($what === 'digest-now') send_json(array_merge(['ok' => true], notify_send_digest(true)));
        send_json(array_merge(['ok' => true], notify_send_reminders()));
    } catch (RuntimeException $e) { send_json(['error' => $e->getMessage()], 400); }
}

function api_inbox(): void { $u = require_login(); send_json(inbox_list_for($u)); }
function api_inbox_read(): void {
    $u = require_login();
    $b = json_body();
    inbox_mark_read($u, is_string($b['id'] ?? null) ? mb_slice($b['id'], 40) : null, ($b['all'] ?? null) === true);
    send_json(array_merge(['ok' => true], inbox_list_for($u)));
}

/* ---------- طلبات المشاريع (البريف) ---------- */

function brief_public(array $b): array { unset($b['tokenHash'], $b['ip']); $b['files'] = $b['files'] ?? []; return $b; }

function api_briefs_list(): void {
    require_permission('viewMessages');
    send_json(['briefs' => array_map('brief_public', briefs_all()), 'options' => BRIEF_OPTIONS, 'legacy' => BRIEF_LEGACY]);
}
function api_briefs_update(string $id): void {
    require_permission('replyMessages');
    $body = json_body();
    $b = with_lock('briefs', function () use ($id, $body) {
        $all = briefs_all();
        foreach ($all as $i => $b) {
            if ($b['id'] !== $id) continue;
            if (array_key_exists('status', $body) && $body['status'] !== null) {
                $st = str_val($body['status']);
                if (!isset(BRIEF_OPTIONS['status'][$st])) send_json(['error' => 'حالة غير صحيحة.'], 400);
                if ($st !== $b['status']) $all[$i]['statusHistory'] = array_slice(array_merge($b['statusHistory'] ?? [], [['from' => $b['status'], 'to' => $st, 'at' => now_iso()]]), -50);
                $all[$i]['status'] = $st;
            }
            if (array_key_exists('notes', $body) && $body['notes'] !== null) $all[$i]['notes'] = b_long($body['notes'], 5000);
            $all[$i]['updatedAt'] = now_iso();
            write_json('briefs.json', $all);
            return brief_public($all[$i]);
        }
        send_json(['error' => 'البريف غير موجود.'], 404);
    });
    log_activity('update', 'brief', $b['ref'] . (!empty($body['status']) ? ' ← ' . brief_label('status', $b['status']) : ''));
    send_json(['ok' => true, 'brief' => $b]);
}
function api_briefs_delete(string $id): void {
    require_admin();
    $b = with_lock('briefs', function () use ($id) {
        $all = briefs_all();
        foreach ($all as $i => $b) if ($b['id'] === $id) { array_splice($all, $i, 1); write_json('briefs.json', $all); return $b; }
        send_json(['error' => 'البريف غير موجود.'], 404);
    });
    foreach ($b['files'] ?? [] as $f) @unlink(brief_files_dir() . '/' . $f['id'] . $f['ext']);
    log_activity('delete', 'brief', $b['ref']);
    send_json(['ok' => true]);
}

// هل صاحب الجلسة موظف يرى البريفات (لفتح التقرير دون رمز)
function is_brief_staff(): bool {
    $id = session_user_id();
    $u = $id ? find_user($id) : null;
    return $u && empty($u['suspended']) && (!empty($u['isAdmin']) || !empty($u['permissions']['viewMessages']));
}
