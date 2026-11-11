<?php
// app/mail.php
// البريد والإشعارات — نفس lib/mailer.js و lib/mailAccount.js و lib/notify.js و lib/inbox.js.
// بريد الشركة من لوحة التحكم (data/mail_account.json وكلمة مروره مشفّرة بالمفتاح data/.mail-key
// بنفس صيغة نسخة Node)، ثم SMTP من app/config.php، ثم بريد الاستضافة (mail()).

declare(strict_types=1);

/* ============================= حساب بريد الشركة ============================= */

const MAIL_PROVIDERS = [
    'hostinger' => ['label' => 'بريد الدومين على Hostinger (Hostinger Email)', 'host' => 'smtp.hostinger.com', 'port' => 465, 'secure' => true],
    'google' => ['label' => 'Gmail / Google Workspace', 'host' => 'smtp.gmail.com', 'port' => 465, 'secure' => true, 'note' => 'يتطلب «كلمة مرور التطبيقات» (App Password) من إعدادات أمان حساب Google، وليست كلمة المرور العادية.'],
    'microsoft' => ['label' => 'Outlook / Microsoft 365', 'host' => 'smtp.office365.com', 'port' => 587, 'secure' => false],
    'zoho' => ['label' => 'Zoho Mail', 'host' => 'smtp.zoho.com', 'port' => 465, 'secure' => true],
    'custom' => ['label' => 'خادم آخر (إعداد يدوي)', 'host' => '', 'port' => 465, 'secure' => true],
];
const MAIL_EMAIL_RE = '/^[^\s@<>"\']+@[^\s@<>"\']+\.[^\s@<>"\']+$/';
const MAIL_HOST_RE = '/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i';

function mail_key(): string {
    $f = DATA_DIR . '/.mail-key';
    if (is_file($f)) { $k = base64_decode(trim((string)file_get_contents($f)), true); if ($k !== false && strlen($k) === 32) return $k; }
    ensure_data_dir();
    $k = random_bytes(32);
    @file_put_contents($f, base64_encode($k));
    @chmod($f, 0600);
    return $k;
}
function mail_encrypt(string $text): string {
    $iv = random_bytes(12);
    $tag = '';
    $enc = openssl_encrypt($text, 'aes-256-gcm', mail_key(), OPENSSL_RAW_DATA, $iv, $tag, '', 16);
    return implode('.', array_map('base64_encode', [$iv, $tag, (string)$enc]));
}
function mail_decrypt($blob): string {
    $parts = explode('.', str_val($blob));
    if (count($parts) !== 3) return '';
    [$iv, $tag, $enc] = array_map(fn($p) => (string)base64_decode($p), $parts);
    $out = openssl_decrypt($enc, 'aes-256-gcm', mail_key(), OPENSSL_RAW_DATA, $iv, $tag);
    return $out === false ? '' : $out;
}

function mail_account_raw(): array { $a = read_json('mail_account.json', []); return is_array($a) ? obj($a) : []; }
function mail_account(): array {
    $a = mail_account_raw();
    return [
        'enabled' => !empty($a['enabled']), 'provider' => isset(MAIL_PROVIDERS[$a['provider'] ?? '']) ? $a['provider'] : 'hostinger',
        'host' => ($a['host'] ?? '') ?: '', 'port' => (int)($a['port'] ?? 0) ?: 465, 'secure' => ($a['secure'] ?? null) !== false,
        'user' => ($a['user'] ?? '') ?: '', 'pass' => !empty($a['passEnc']) ? mail_decrypt($a['passEnc']) : '',
        'fromEmail' => ($a['fromEmail'] ?? '') ?: '', 'fromName' => ($a['fromName'] ?? '') ?: '',
        'updatedAt' => $a['updatedAt'] ?? null, 'lastTest' => $a['lastTest'] ?? null,
    ];
}
function mail_account_ready(?array $a = null): bool {
    $a = $a ?? mail_account();
    return $a['enabled'] && $a['host'] && $a['fromEmail'] && $a['user'] && $a['pass'];
}
function mail_account_public(): array {
    $a = mail_account();
    $ready = mail_account_ready($a);
    $has = $a['pass'] !== '';
    unset($a['pass']);
    return array_merge($a, ['hasPassword' => $has, 'ready' => $ready]);
}
function mail_account_validate($body): array {
    $b = is_array($body) ? $body : [];
    $cur = mail_account();
    $provider = isset(MAIL_PROVIDERS[$b['provider'] ?? '']) ? $b['provider'] : 'custom';
    $preset = MAIL_PROVIDERS[$provider];
    $fromEmail = strtolower(trim(str_val($b['fromEmail'] ?? '')));
    $host = $provider !== 'custom' ? $preset['host'] : preg_replace(['#^[a-z]+://#', '#[/?\#].*$#', '#:\d+$#', '#\.$#'], '', strtolower(trim(str_val($b['host'] ?? ''))));
    $user = trim(str_val($b['user'] ?? ''));
    if ($user === '' || ($provider !== 'custom' && !preg_match(MAIL_EMAIL_RE, $user))) $user = $fromEmail;
    $out = [
        'enabled' => ($b['enabled'] ?? null) !== false, 'provider' => $provider, 'host' => $host,
        'port' => (int)str_val($b['port'] ?? '') ?: $preset['port'],
        'secure' => array_key_exists('secure', $b) ? (bool)$b['secure'] : $preset['secure'],
        'user' => $user, 'fromEmail' => $fromEmail,
        'fromName' => mb_slice(trim(preg_replace('/[\r\n<>"]/', '', str_val($b['fromName'] ?? ''))), 80),
        'pass' => '', 'usedSavedPass' => false,
    ];
    $pass = trim(str_val($b['pass'] ?? ''));
    if ($pass !== '' && ($provider === 'google' || preg_match('/(^|\.)gmail\.com$/i', $host))) $pass = preg_replace('/\s+/', '', $pass);
    $out['pass'] = $pass !== '' ? $pass : $cur['pass'];
    $out['usedSavedPass'] = $pass === '' && $cur['pass'] !== '';
    if (!preg_match(MAIL_EMAIL_RE, $fromEmail) || strlen($fromEmail) > 254) return ['error' => 'اكتب بريد الشركة بشكل صحيح، مثل info@alomrango.com.'];
    if (!preg_match(MAIL_HOST_RE, $host) || strlen($host) > 253) return ['error' => 'عنوان خادم البريد (SMTP) غير صحيح' . ($host !== '' ? ': «' . mb_slice($host, 60) . '»' : '') . '. مثال صحيح: smtp.gmail.com'];
    if (!($out['port'] >= 1 && $out['port'] <= 65535)) return ['error' => 'رقم المنفذ غير صحيح.'];
    if (strlen($out['user']) > 254) return ['error' => 'اسم المستخدم طويل جداً.'];
    if ($out['enabled'] && $out['pass'] === '') return ['error' => 'اكتب كلمة مرور البريد.'];
    if (strlen($out['pass']) > 500) return ['error' => 'كلمة المرور طويلة جداً.'];
    return ['account' => $out];
}
function mail_account_save(array $a): void {
    $prev = mail_account_raw();
    write_json('mail_account.json', ['enabled' => $a['enabled'], 'provider' => $a['provider'], 'host' => $a['host'], 'port' => $a['port'], 'secure' => $a['secure'],
        'user' => $a['user'], 'fromEmail' => $a['fromEmail'], 'fromName' => $a['fromName'],
        'passEnc' => $a['pass'] !== '' ? mail_encrypt($a['pass']) : '', 'updatedAt' => now_iso(), 'lastTest' => $prev['lastTest'] ?? null]);
}
function mail_account_record_test(bool $ok, string $msg): void {
    $a = mail_account_raw();
    $a['lastTest'] = ['ok' => $ok, 'message' => mb_slice($msg, 300), 'at' => now_iso()];
    write_json('mail_account.json', $a);
}

/* ============================= الإرسال ============================= */

// SMTP من app/config.php (بديل متغيرات SMTP_* في نسخة Node)
function config_smtp(): ?array {
    $c = app_config();
    if (empty($c['smtp_host']) || empty($c['mail_from'])) return null;
    $port = (int)($c['smtp_port'] ?? 465);
    return ['host' => (string)$c['smtp_host'], 'port' => $port, 'secure' => isset($c['smtp_secure']) ? (bool)$c['smtp_secure'] : $port === 465,
        'user' => (string)($c['smtp_user'] ?? ''), 'pass' => (string)($c['smtp_pass'] ?? ''), 'fromEmail' => (string)$c['mail_from'], 'fromName' => (string)($c['mail_from_name'] ?? '')];
}
// بريد الاستضافة (mail()) يُستخدم إن لم يُضبط غيره، ويمكن إيقافه من config.php
function php_mail_enabled(): bool { return (app_config()['php_mail'] ?? true) !== false && function_exists('mail'); }
function mail_env_configured(): bool { return config_smtp() !== null || php_mail_enabled(); }
function mail_configured(): bool { return mail_account_ready() || mail_env_configured(); }
function mail_source(): string { return mail_account_ready() ? 'dashboard' : (mail_env_configured() ? 'env' : 'none'); }
function host_domain(): string {
    $base = parse_url(site_base_url(), PHP_URL_HOST) ?: (string)($_SERVER['HTTP_HOST'] ?? 'localhost');
    return preg_replace('/^www\./', '', preg_replace('/[^A-Za-z0-9.-]/', '', $base)) ?: 'localhost';
}
function mail_sender_address(): string {
    $a = mail_account();
    if (mail_account_ready($a)) return $a['fromEmail'];
    $c = config_smtp();
    if ($c) return $c['fromEmail'];
    return php_mail_enabled() ? (string)(app_config()['mail_from'] ?? ('noreply@' . host_domain())) : '';
}
function notify_sender(): array {
    $s = get_settings();
    return is_array($s['notifications']['sender'] ?? null) ? obj($s['notifications']['sender']) : [];
}
function encode_header(string $s): string { return '=?UTF-8?B?' . base64_encode($s) . '?='; }
function escape_html($s): string { return str_replace(['&', '<', '>', '"', "'"], ['&amp;', '&lt;', '&gt;', '&quot;', '&#39;'], str_val($s)); }

// $to: مصفوفة أو نص مفصول بفواصل. يرمي استثناء عند الفشل (مثل nodemailer).
function send_mail_or_throw($to, string $subject, string $text, string $html, ?string $replyTo = null, ?string $fromName = null): void {
    $list = is_array($to) ? $to : preg_split('/\s*,\s*/', (string)$to);
    $list = array_values(array_filter(array_map('trim', $list), fn($e) => preg_match(MAIL_EMAIL_RE, $e)));
    if (!$list) throw new RuntimeException('لا يوجد مستلم صحيح.');
    $sender = notify_sender();
    $acc = mail_account();
    $transport = mail_account_ready($acc) ? $acc : config_smtp();
    $address = mail_sender_address();
    $name = trim(preg_replace('/[\r\n<>"]/', '', (string)($fromName ?: (($sender['name'] ?? '') ?: ($transport['fromName'] ?? '') ?: COMPANY))));
    $replyTo = $replyTo ?: (($sender['replyTo'] ?? '') ?: null);
    if ($replyTo && !preg_match(MAIL_EMAIL_RE, $replyTo)) $replyTo = null;
    [$headers, $body] = mime_message($name, $address, $replyTo, $text, $html);
    if ($transport) { smtp_deliver($transport, $address, $list, $subject, $headers, $body); return; }
    if (!php_mail_enabled()) throw new RuntimeException('إرسال البريد غير مفعّل على الخادم (إعدادات SMTP غير مضبوطة).');
    if (!@mail(implode(', ', $list), encode_header(preg_replace('/[\r\n]+/', ' ', $subject)), $body, implode("\r\n", $headers), '-f' . $address)) {
        throw new RuntimeException('رفض خادم الاستضافة إرسال الرسالة (mail).');
    }
}
// نسخة لا ترمي استثناء: تسجل الخطأ وتعيد false
function send_mail($to, string $subject, string $text, string $html, ?string $replyTo = null): bool {
    try { send_mail_or_throw($to, $subject, $text, $html, $replyTo); return true; }
    catch (Throwable $e) { log_error('فشل إرسال البريد: ' . $e->getMessage()); return false; }
}

function mime_message(string $name, string $address, ?string $replyTo, string $text, string $html): array {
    $boundary = 'b_' . rand_hex(12);
    $headers = ['MIME-Version: 1.0', 'From: ' . ($name !== '' ? encode_header($name) . ' ' : '') . '<' . $address . '>',
        'Content-Type: multipart/alternative; boundary="' . $boundary . '"', 'Message-ID: <' . rand_hex(12) . '@' . (explode('@', $address)[1] ?? 'localhost') . '>'];
    if ($replyTo) $headers[] = 'Reply-To: ' . $replyTo;
    $body = "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($text))
        . "--$boundary\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($html))
        . "--$boundary--\r\n";
    return [$headers, $body];
}

// عميل SMTP: SSL مباشر (secure) أو STARTTLS. $to فارغ = تحقق من الاتصال والدخول فقط.
function smtp_deliver(array $t, string $from, array $to, string $subject, array $headers, string $body): void {
    $host = (string)$t['host'];
    $port = (int)$t['port'];
    $secure = !empty($t['secure']);
    $ctx = stream_context_create(['ssl' => ['SNI_enabled' => true, 'peer_name' => $host]]);
    $fp = @stream_socket_client(($secure ? 'ssl://' : 'tcp://') . $host . ':' . $port, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
    if (!$fp) throw new RuntimeException(($errno === 0 && $errstr === '' ? 'ENOTFOUND ' : 'ECONNREFUSED ') . "تعذر الاتصال بـ $host:$port ($errstr)");
    stream_set_timeout($fp, 20);
    $read = function () use ($fp) {
        $out = '';
        while (($line = fgets($fp, 1024)) !== false) { $out .= $line; if (strlen($line) < 4 || $line[3] === ' ') break; }
        if ($out === '' && stream_get_meta_data($fp)['timed_out']) throw new RuntimeException('ETIMEDOUT timeout');
        return $out;
    };
    $cmd = function (string $c, array $ok) use ($fp, $read) {
        if ($c !== '') fwrite($fp, $c . "\r\n");
        $r = $read();
        if (!in_array((int)substr($r, 0, 3), $ok, true)) throw new RuntimeException(trim($r) ?: 'لا يوجد رد من الخادم');
        return $r;
    };
    try {
        $cmd('', [220]);
        $ehlo = 'EHLO ' . host_domain();
        $caps = $cmd($ehlo, [250]);
        if (!$secure) {
            if (stripos($caps, 'STARTTLS') === false) throw new RuntimeException('الخادم لا يدعم STARTTLS');
            $cmd('STARTTLS', [220]);
            if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT)) throw new RuntimeException('STARTTLS failed');
            $cmd($ehlo, [250]);
        }
        if (($t['user'] ?? '') !== '') {
            $cmd('AUTH LOGIN', [334]);
            $cmd(base64_encode((string)$t['user']), [334]);
            $cmd(base64_encode((string)$t['pass']), [235]);
        }
        if ($to) {
            $cmd('MAIL FROM:<' . $from . '>', [250]);
            foreach ($to as $r) $cmd('RCPT TO:<' . $r . '>', [250, 251]);
            $cmd('DATA', [354]);
            $msg = 'To: ' . implode(', ', $to) . "\r\nSubject: " . encode_header(preg_replace('/[\r\n]+/', ' ', $subject)) . "\r\nDate: " . date('r') . "\r\n" . implode("\r\n", $headers) . "\r\n\r\n" . $body;
            $msg = preg_replace('/^\./m', '..', str_replace(["\r\n", "\n"], ["\n", "\r\n"], $msg));
            $cmd($msg . "\r\n.", [250]);
        }
        try { $cmd('QUIT', [221]); } catch (Throwable $e) {}
    } finally { @fclose($fp); }
}

// اختبار حساب: اتصال ودخول ثم إرسال رسالة تجريبية
function mail_test_account(array $a, string $to, string $subject, string $text, string $html): void {
    [$headers, $body] = mime_message($a['fromName'], $a['fromEmail'], null, $text, $html);
    smtp_deliver($a, $a['fromEmail'], [], '', [], '');
    smtp_deliver($a, $a['fromEmail'], [$to], $subject, $headers, $body);
}

/* ============================= إشعارات لوحة التحكم (الجرس) ============================= */

const INBOX_TYPES = [
    'chat.new' => ['label' => 'محادثة جديدة', 'tab' => 'chat', 'audience' => 'staff'],
    'chat.transfer' => ['label' => 'طلب التحدث مع موظف', 'tab' => 'chat', 'audience' => 'staff'],
    'chat.message' => ['label' => 'رسالة جديدة في المحادثة', 'tab' => 'chat', 'audience' => 'staff'],
    'requests.contact' => ['label' => 'رسالة تواصل جديدة', 'tab' => 'messages', 'audience' => 'admin'],
    'requests.brief' => ['label' => 'طلب مشروع جديد', 'tab' => 'briefs', 'audience' => 'staff'],
    'requests.chatService' => ['label' => 'طلب خدمة من المحادثة', 'tab' => 'chat', 'audience' => 'staff'],
    'requests.review' => ['label' => 'تقييم جديد من عميل', 'tab' => 'reviews', 'audience' => 'admin'],
];

// مهلة بين إشعارين لرسائل نفس المحادثة (تُحفظ في ملف لأن PHP لا يحتفظ بالذاكرة بين الطلبات)
function throttle_hit(string $key, int $seconds): bool {
    return with_lock('throttle', function () use ($key, $seconds) {
        $db = obj(read_json('throttle.json', []));
        $now = time();
        foreach ($db as $k => $t) if ($now - (int)$t > 3600) unset($db[$k]);
        if (isset($db[$key]) && $now - (int)$db[$key] < $seconds) return true;
        $db[$key] = $now;
        write_json('throttle.json', $db ?: (object)[]);
        return false;
    });
}

function inbox_add(string $type, array $o): void {
    $def = INBOX_TYPES[$type] ?? null;
    if (!$def) return;
    if ($type === 'chat.message' && !empty($o['throttleKey']) && throttle_hit('inbox:' . $o['throttleKey'], 120)) return;
    $name = str_val($o['name'] ?? '');
    $item = ['id' => base_convert((string)(int)(microtime(true) * 1000), 10, 36) . rand_hex(3), 'type' => $type,
        'title' => mb_slice($def['label'] . ($name !== '' ? ' — ' . $name : ''), 160), 'text' => mb_slice(str_val($o['text'] ?? ''), 300),
        'tab' => $def['tab'], 'audience' => $def['audience'], 'at' => now_iso()];
    with_lock('inbox', function () use ($item) {
        $l = read_json('inbox.json', []);
        if (!is_list($l)) $l = [];
        array_unshift($l, $item);
        write_json('inbox.json', array_slice($l, 0, 300));
    });
}
function inbox_can_see(array $u, array $i): bool { return !empty($u['isAdmin']) || (($i['audience'] ?? '') === 'staff' && !empty($u['permissions']['viewMessages'])); }
function inbox_list_for(array $u, int $limit = 30): array {
    $reads = obj(read_json('inbox_reads.json', []));
    $r = $reads[$u['id']] ?? [];
    $upTo = (string)($r['upTo'] ?? '');
    $ids = array_flip($r['ids'] ?? []);
    $isRead = fn($i) => ($upTo !== '' && $i['at'] <= $upTo) || isset($ids[$i['id']]);
    $l = read_json('inbox.json', []);
    $visible = array_values(array_filter(is_list($l) ? $l : [], fn($i) => is_array($i) && inbox_can_see($u, $i)));
    return [
        'items' => array_map(fn($i) => array_merge($i, ['read' => $isRead($i)]), array_slice($visible, 0, $limit)),
        'unread' => count(array_filter($visible, fn($i) => !$isRead($i))),
        'latestId' => $visible[0]['id'] ?? null,
    ];
}
function inbox_mark_read(array $u, ?string $id, bool $all): void {
    with_lock('inbox_reads', function () use ($u, $id, $all) {
        $reads = obj(read_json('inbox_reads.json', []));
        $r = $reads[$u['id']] ?? ['upTo' => '', 'ids' => []];
        if ($all) { $l = read_json('inbox.json', []); $reads[$u['id']] = ['upTo' => $l[0]['at'] ?? now_iso(), 'ids' => []]; }
        elseif ($id) $reads[$u['id']] = ['upTo' => ($r['upTo'] ?? '') ?: '', 'ids' => array_slice(array_values(array_unique(array_merge([$id], $r['ids'] ?? []))), 0, 300)];
        write_json('inbox_reads.json', $reads ?: (object)[]);
    });
}

/* ============================= إشعارات البريد (notify.js) ============================= */

const NOTIFY_EVENTS = [
    'chat.new' => ['group' => 'chat', 'label' => 'محادثة جديدة', 'subject' => 'محادثة جديدة — {الاسم}', 'intro' => 'بدأ {الاسم} محادثة جديدة في الموقع.'],
    'chat.transfer' => ['group' => 'chat', 'label' => 'طلب التحدث مع موظف', 'subject' => 'عميل يطلب التحدث مع موظف — {الاسم}', 'intro' => 'طلب {الاسم} في المحادثة التحويل إلى أحد أعضاء الفريق.'],
    'chat.message' => ['group' => 'chat', 'label' => 'رسائل الزوار الجديدة', 'subject' => 'رسالة جديدة في المحادثة — {الاسم}', 'intro' => 'أرسل {الاسم} رسالة جديدة في المحادثة.'],
    'requests.contact' => ['group' => 'requests', 'label' => 'رسائل نموذج التواصل', 'subject' => 'رسالة تواصل جديدة — {الاسم}', 'intro' => 'وصلت رسالة جديدة من نموذج التواصل.'],
    'requests.brief' => ['group' => 'requests', 'label' => 'طلبات المشاريع (البريف)', 'subject' => 'طلب مشروع جديد {الرقم} — {الاسم}', 'intro' => 'وصل طلب مشروع جديد من {الاسم}.'],
    'requests.chatService' => ['group' => 'requests', 'label' => 'طلبات الخدمة من المحادثة', 'subject' => 'طلب خدمة من المحادثة — {الاسم}', 'intro' => 'طلب {الاسم} خدمة عبر المحادثة.'],
    'requests.review' => ['group' => 'requests', 'label' => 'تقييمات العملاء الجديدة', 'subject' => 'تقييم جديد من {الاسم}', 'intro' => 'أرسل {الاسم} تقييماً جديداً عبر رابط التقييم، وهو بانتظار موافقتك.'],
];
const NOTIFY_DEFAULTS = [
    'sender' => ['name' => '', 'replyTo' => ''],
    'chat' => ['enabled' => true, 'events' => ['chat.new' => true, 'chat.transfer' => true, 'chat.message' => false]],
    'requests' => ['enabled' => true, 'events' => ['requests.contact' => true, 'requests.brief' => true, 'requests.chatService' => true, 'requests.review' => true]],
    'digest' => ['enabled' => false, 'frequency' => 'daily', 'weekday' => 0, 'hour' => 8],
    'reminders' => ['enabled' => false, 'afterHours' => 24, 'hour' => 9, 'customers' => true, 'chats' => true, 'briefs' => true],
];
const NOTIFY_PLACEHOLDERS = ['{الاسم}' => 'name', '{الجوال}' => 'phone', '{البريد}' => 'email', '{الرقم}' => 'ref', '{المشروع}' => 'project', '{الرسالة}' => 'message'];

function notify_config(): array {
    $s = get_settings();
    $n = is_array($s['notifications'] ?? null) ? $s['notifications'] : [];
    $group = function ($name) use ($n) {
        $g = is_array($n[$name] ?? null) ? $n[$name] : [];
        return ['enabled' => array_key_exists('enabled', $g) && $g['enabled'] !== null ? $g['enabled'] : NOTIFY_DEFAULTS[$name]['enabled'],
            'recipients' => is_list($g['recipients'] ?? null) ? $g['recipients'] : [],
            'events' => array_merge(NOTIFY_DEFAULTS[$name]['events'], is_array($g['events'] ?? null) ? obj($g['events']) : [])];
    };
    $cfg = [
        'sender' => array_merge(NOTIFY_DEFAULTS['sender'], is_array($n['sender'] ?? null) ? obj($n['sender']) : []),
        'recipients' => is_list($n['recipients'] ?? null) ? $n['recipients'] : [],
        'chat' => $group('chat'), 'requests' => $group('requests'),
        'templates' => is_array($n['templates'] ?? null) ? $n['templates'] : (object)[],
        'digest' => array_merge(NOTIFY_DEFAULTS['digest'], is_array($n['digest'] ?? null) ? obj($n['digest']) : []),
        'reminders' => array_merge(NOTIFY_DEFAULTS['reminders'], is_array($n['reminders'] ?? null) ? obj($n['reminders']) : []),
    ];
    if (!$cfg['recipients'] && !empty($s['briefs']['notifyEmail'])) $cfg['recipients'] = [$s['briefs']['notifyEmail']];
    return $cfg;
}
function owner_emails(): array {
    foreach (read_json('users.json', []) as $u) {
        if (is_array($u) && !empty($u['email']) && (($u['role'] ?? '') === 'super_admin' || (empty($u['role']) && !empty($u['isAdmin'])))) return [$u['email']];
    }
    $c = trim((string)(app_config()['notify_email'] ?? ''));
    return $c !== '' ? [$c] : [];
}
function effective_recipients(?array $cfg = null, ?string $group = null): array {
    $cfg = $cfg ?? notify_config();
    if ($group && !empty($cfg[$group]['recipients'])) return $cfg[$group]['recipients'];
    if ($cfg['recipients']) return $cfg['recipients'];
    return owner_emails();
}
function notify_recipients(string $group): array { return effective_recipients(null, $group); }

function notify_parse_emails($value, string $label): array {
    $raw = is_list($value) ? $value : preg_split('/[\s,;،]+/u', str_val($value));
    $list = array_values(array_unique(array_filter(array_map(fn($e) => strtolower(trim(js_str($e))), $raw), fn($e) => $e !== '')));
    foreach ($list as $e) if (strlen($e) > 254 || !preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $e)) return ['error' => "البريد غير صحيح في $label: $e"];
    if (count($list) > 5) return ['error' => "الحد الأقصى 5 عناوين في $label."];
    return ['list' => $list];
}
function notify_int($v, int $min, int $max, int $fb): int {
    return (is_int($v) || (is_float($v) && floor($v) == $v) || (is_string($v) && preg_match('/^\s*-?\d+\s*$/', $v))) && (int)$v >= $min && (int)$v <= $max ? (int)$v : $fb;
}
function notify_validate($body): array {
    $b = is_array($body) ? $body : [];
    $g = notify_parse_emails($b['recipients'] ?? '', 'المستلمين العامين');
    if (isset($g['error'])) return $g;
    $out = ['recipients' => $g['list']];
    foreach (['chat', 'requests'] as $name) {
        $x = is_array($b[$name] ?? null) ? $b[$name] : [];
        $rec = notify_parse_emails($x['recipients'] ?? '', $name === 'chat' ? 'مستلمي إشعارات المحادثة' : 'مستلمي إشعارات الطلبات');
        if (isset($rec['error'])) return $rec;
        $events = [];
        foreach (NOTIFY_DEFAULTS[$name]['events'] as $k => $def) $events[$k] = is_array($x['events'] ?? null) ? !empty($x['events'][$k]) : $def;
        $out[$name] = ['enabled' => !empty($x['enabled']), 'recipients' => $rec['list'], 'events' => $events];
    }
    $sender = is_array($b['sender'] ?? null) ? $b['sender'] : [];
    $replyTo = strtolower(trim(str_val($sender['replyTo'] ?? '')));
    if ($replyTo !== '' && (strlen($replyTo) > 254 || !preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $replyTo))) return ['error' => 'عنوان الرد غير صحيح.'];
    $out['sender'] = ['name' => mb_slice(trim(preg_replace('/[\r\n<>"]/', '', str_val($sender['name'] ?? ''))), 80), 'replyTo' => $replyTo];
    $tpl = [];
    foreach (array_keys(NOTIFY_EVENTS) as $k) {
        $t = is_array($b['templates'][$k] ?? null) ? $b['templates'][$k] : [];
        $subject = mb_slice(trim(preg_replace('/[\r\n]+/', ' ', str_val($t['subject'] ?? ''))), 200);
        $intro = mb_slice(trim(str_replace("\r\n", "\n", str_val($t['intro'] ?? ''))), 1000);
        if ($subject !== '' || $intro !== '') $tpl[$k] = ['subject' => $subject, 'intro' => $intro];
    }
    $out['templates'] = $tpl ?: (object)[];
    $d = is_array($b['digest'] ?? null) ? $b['digest'] : [];
    $out['digest'] = ['enabled' => !empty($d['enabled']), 'frequency' => ($d['frequency'] ?? '') === 'weekly' ? 'weekly' : 'daily',
        'weekday' => notify_int($d['weekday'] ?? null, 0, 6, 0), 'hour' => notify_int($d['hour'] ?? null, 0, 23, 8)];
    $r = is_array($b['reminders'] ?? null) ? $b['reminders'] : [];
    $out['reminders'] = ['enabled' => !empty($r['enabled']), 'afterHours' => notify_int($r['afterHours'] ?? null, 1, 720, 24), 'hour' => notify_int($r['hour'] ?? null, 0, 23, 9),
        'customers' => ($r['customers'] ?? null) !== false, 'chats' => ($r['chats'] ?? null) !== false, 'briefs' => ($r['briefs'] ?? null) !== false];
    return ['config' => $out];
}
function notify_enabled(string $event, ?array $cfg = null): bool {
    $def = NOTIFY_EVENTS[$event] ?? null;
    if (!$def) return false;
    $cfg = $cfg ?? notify_config();
    $g = $cfg[$def['group']];
    return !empty($g['enabled']) && !empty($g['events'][$event]);
}
function notify_fill(string $tpl, array $vars): string {
    return preg_replace_callback('/\{(الاسم|الجوال|البريد|الرقم|المشروع|الرسالة)\}/u', function ($m) use ($vars) {
        $v = $vars[NOTIFY_PLACEHOLDERS[$m[0]]] ?? null;
        return ($v === null || $v === '') ? '—' : str_val($v);
    }, $tpl);
}
function notify_base_url(): string { return rtrim((string)(getenv('APP_BASE_URL') ?: (app_config()['base_url'] ?? '')), '/') ?: site_base_url(); }

function notify_render(array $o): array {
    $base = notify_base_url();
    $link = $base && !empty($o['linkPath']) ? $base . $o['linkPath'] : '';
    $cell = 'padding:8px 10px;border-bottom:1px solid #eee9df;text-align:right;vertical-align:top;font-size:14px';
    $rows = array_values(array_filter($o['rows'] ?? [], fn($r) => str_val($r[1] ?? '') !== ''));
    $table = implode('', array_map(fn($r) => '<tr><td style="' . $cell . ';width:34%;color:#5d6066;background:#faf8f4">' . escape_html($r[0]) . '</td><td style="' . $cell . '">' . escape_html($r[1]) . '</td></tr>', $rows));
    $label = $o['linkLabel'] ?? 'فتح لوحة التحكم';
    $html = '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.8;color:#1a1a1a;max-width:680px;margin:auto">
    <div style="background:#1E2A32;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0"><strong style="font-size:17px">' . escape_html($o['title'] ?? '') . '</strong><br><span style="color:#C9B895;font-size:12.5px">' . escape_html(COMPANY) . '</span></div>
    <div style="padding:6px 20px 20px;border:1px solid #eee9df;border-top:0;border-radius:0 0 12px 12px">
      ' . (!empty($o['intro']) ? '<p>' . str_replace("\n", '<br>', escape_html($o['intro'])) . '</p>' : '') . '
      ' . ($table ? '<table style="width:100%;border-collapse:collapse;margin:10px 0">' . $table . '</table>' : '') . '
      ' . (!empty($o['body']) ? '<p style="background:#faf8f4;padding:10px 12px;border-radius:8px;font-size:14px">' . str_replace("\n", '<br>', escape_html($o['body'])) . '</p>' : '') . '
      ' . ($o['htmlBlock'] ?? '') . '
      ' . ($link ? '<p style="margin:20px 0 6px"><a href="' . escape_html($link) . '" style="display:inline-block;padding:10px 18px;background:#1E2A32;color:#fff;border-radius:999px;text-decoration:none;font-weight:700">' . escape_html($label) . '</a></p>' : '') . '
      <p style="color:#7c7f85;font-size:12px;margin-top:18px">إشعار آلي من لوحة تحكم ' . escape_html(COMPANY) . '. يمكن تعديله أو إيقافه من لوحة التحكم ← الإشعارات.</p>
    </div></div>';
    $parts = array_merge([$o['title'] ?? '', $o['intro'] ?? ''], array_map(fn($r) => $r[0] . ': ' . str_val($r[1]), $rows), [$o['body'] ?? '', $link ? "\n" . $label . ': ' . $link : '']);
    return ['html' => $html, 'text' => implode("\n", array_filter($parts, fn($x) => $x !== ''))];
}

// إشعار حدث: يُسجَّل دائماً في جرس لوحة التحكم، ويُرسل بالبريد إن كان مفعّلاً
function notify_company(string $event, array $o): bool {
    $vars = $o['vars'] ?? [];
    try {
        $who = implode(' · ', array_filter([str_val($vars['name'] ?? ''), str_val($vars['phone'] ?? '')]));
        $detail = implode(' — ', array_filter([str_val($vars['ref'] ?? ''), str_val($vars['project'] ?? '')]));
        $msg = str_val($vars['message'] ?? '');
        inbox_add($event, ['name' => $vars['name'] ?? '', 'text' => implode(' | ', array_filter([$detail, $msg, ($detail === '' && $msg === '') ? $who : ''])), 'throttleKey' => $o['throttleKey'] ?? null]);
    } catch (Throwable $e) {}
    try {
        $cfg = notify_config();
        $def = NOTIFY_EVENTS[$event] ?? null;
        if (!$def || !notify_enabled($event, $cfg) || !mail_configured()) return false;
        if ($event === 'chat.message' && !empty($o['throttleKey']) && throttle_hit('mail:' . $o['throttleKey'], 600)) return false;
        $to = effective_recipients($cfg, $def['group']);
        if (!$to) return false;
        $tpl = is_array($cfg['templates'][$event] ?? null) ? $cfg['templates'][$event] : [];
        $subject = notify_fill(($tpl['subject'] ?? '') ?: $def['subject'], $vars) ?: ($o['subject'] ?? '');
        $intro = !empty($tpl['intro']) ? notify_fill($tpl['intro'], $vars) : ($o['intro'] ?? notify_fill($def['intro'], $vars));
        $r = isset($o['html']) ? ['html' => $o['html'], 'text' => $o['text'] ?? ''] : notify_render(['title' => ($o['title'] ?? '') ?: $def['label'], 'intro' => $intro, 'rows' => $o['rows'] ?? [], 'body' => $o['body'] ?? '', 'linkPath' => $o['linkPath'] ?? '/dashboard', 'linkLabel' => $o['linkLabel'] ?? null]);
        send_mail_or_throw($to, $subject, $r['text'], $r['html'], $o['replyTo'] ?? null);
        return true;
    } catch (Throwable $e) {
        log_error("فشل إرسال إشعار $event: " . $e->getMessage());
        return false;
    }
}

function notify_send_test(): array {
    if (!mail_configured()) throw new RuntimeException('إرسال البريد غير مفعّل على الخادم (إعدادات SMTP غير مضبوطة).');
    $cfg = notify_config();
    $to = array_values(array_unique(array_merge(effective_recipients($cfg), $cfg['chat']['recipients'], $cfg['requests']['recipients'])));
    if (!$to) throw new RuntimeException('لا يوجد بريد لاستلام الإشعارات. أضف عنواناً أولاً.');
    $r = notify_render(['title' => 'رسالة تجريبية', 'intro' => 'إذا وصلتك هذه الرسالة فإشعارات البريد الإلكتروني تعمل بشكل صحيح.', 'linkPath' => '/dashboard']);
    send_mail_or_throw($to, 'رسالة تجريبية — إشعارات ' . COMPANY, $r['text'], $r['html']);
    return $to;
}

/* ---------- التقرير الدوري والتذكيرات ---------- */

function notify_state(): array { return obj(read_json('notify_state.json', [])); }
function riyadh_now(): array { $t = time() + 3 * 3600; return ['date' => gmdate('Y-m-d', $t), 'hour' => (int)gmdate('G', $t), 'weekday' => (int)gmdate('w', $t)]; }
function age_text($iso): string { $h = intdiv(time() - (int)strtotime((string)$iso), 3600); return $h < 24 ? "منذ $h ساعة" : 'منذ ' . intdiv($h, 24) . ' يوم'; }
function fmt_date_medium($iso): string {
    try { $d = new DateTime((string)$iso); $d->setTimezone(new DateTimeZone('Asia/Riyadh')); $h = (int)$d->format('G');
        return (int)$d->format('j') . ' ' . AR_MONTHS[(int)$d->format('n')] . ' ' . $d->format('Y') . '، ' . (($h % 12) ?: 12) . ':' . $d->format('i') . ' ' . ($h < 12 ? 'ص' : 'م'); }
    catch (Throwable $e) { return (string)$iso; }
}
function table_html(array $headers, array $rows): string {
    $th = 'padding:7px 8px;background:#1E2A32;color:#fff;font-size:12.5px;text-align:right';
    $td = 'padding:7px 8px;border-bottom:1px solid #eee9df;font-size:13px;text-align:right;vertical-align:top';
    $out = '<table style="width:100%;border-collapse:collapse;margin:8px 0 16px"><tr>' . implode('', array_map(fn($h) => '<th style="' . $th . '">' . escape_html($h) . '</th>', $headers)) . '</tr>';
    foreach ($rows as $r) {
        $out .= '<tr>' . implode('', array_map(fn($c) => is_array($c) && isset($c['link']) ? '<td style="' . $td . '"><a href="' . escape_html($c['link']) . '" style="color:#1E2A32">' . escape_html($c['text']) . '</a></td>' : '<td style="' . $td . '">' . escape_html($c ?? '') . '</td>', $r)) . '</tr>';
    }
    return $out . '</table>';
}

function notify_build_digest(array $cfg): ?array {
    $days = $cfg['digest']['frequency'] === 'weekly' ? 7 : 1;
    $since = gmdate('Y-m-d\TH:i:s.000\Z', time() - $days * 86400);
    $all = briefs_all();
    $received = array_values(array_filter($all, fn($b) => ($b['createdAt'] ?? '') >= $since));
    $pending = array_values(array_filter($all, fn($b) => ($b['status'] ?? '') === 'new'));
    if (!$received && !$pending) return null;
    $base = notify_base_url();
    $row = fn($b) => [$base ? ['text' => $b['ref'], 'link' => $base . '/brief/' . $b['id']] : $b['ref'], $b['client']['name'] ?? '', brief_label('projectType', $b['project']['projectType'] ?? ''),
        ($b['project']['location'] ?? '') ?: ($b['client']['city'] ?? ''), brief_label('status', $b['status'] ?? ''), fmt_date_medium($b['createdAt'] ?? '')];
    $headers = ['الرقم', 'العميل', 'نوع المشروع', 'الموقع', 'الحالة', 'التاريخ'];
    $byStatus = [];
    foreach ($received as $b) { $k = brief_label('status', $b['status'] ?? ''); $byStatus[$k] = ($byStatus[$k] ?? 0) + 1; }
    $period = $days === 7 ? 'آخر 7 أيام' : 'آخر 24 ساعة';
    $block = ($received ? '<h3 style="font-size:15px;color:#1E2A32;margin:16px 0 4px">الطلبات المستلمة (' . count($received) . ')</h3>' . table_html($headers, array_map($row, $received)) : '<p>لم تصل طلبات جديدة في هذه الفترة.</p>')
        . ($pending ? '<h3 style="font-size:15px;color:#b42318;margin:16px 0 4px">طلبات بحالة «جديد» لم تُراجع بعد (' . count($pending) . ')</h3>' . table_html($headers, array_map($row, $pending)) : '');
    $rows = [['الفترة', $period], ['طلبات مستلمة', (string)count($received)]];
    foreach ($byStatus as $k => $v) $rows[] = ['— ' . $k, (string)$v];
    $rows[] = ['بانتظار المراجعة', (string)count($pending)];
    $r = notify_render(['title' => 'تقرير طلبات المشاريع — ' . $period, 'intro' => 'ملخص طلبات المشاريع (البريف) الواردة عبر الموقع.', 'rows' => $rows, 'htmlBlock' => $block, 'linkPath' => '/dashboard', 'linkLabel' => 'فتح طلبات المشاريع']);
    return ['subject' => "تقرير طلبات المشاريع ($period): " . count($received) . ' طلب جديد', 'html' => $r['html'],
        'text' => $r['text'] . "\n\n" . implode("\n", array_map(fn($b) => $b['ref'] . ' — ' . ($b['client']['name'] ?? ''), $received)),
        'counts' => ['received' => count($received), 'pending' => count($pending)]];
}

function notify_build_reminders(array $cfg): ?array {
    $r = $cfg['reminders'];
    $cutoff = gmdate('Y-m-d\TH:i:s.000\Z', time() - (int)$r['afterHours'] * 3600);
    $base = notify_base_url();
    $sections = [];
    $total = 0;
    if (!empty($r['customers'])) {
        $list = array_values(array_filter(customers_all(), fn($c) => ($c['status'] ?? '') === 'new' && empty($c['lastContactAt']) && ($c['createdAt'] ?? '') <= $cutoff));
        if ($list) {
            $total += count($list);
            $sections[] = '<h3 style="font-size:15px;color:#1E2A32;margin:16px 0 4px">عملاء بانتظار الرد (' . count($list) . ')</h3>'
                . table_html(['العميل', 'الجوال', 'البريد', 'المصدر', 'منذ'], array_map(fn($c) => [$c['name'], $c['phone'], $c['email'], implode('، ', array_map(fn($s) => CUSTOMER_SOURCES[$s] ?? $s, $c['sources'] ?? [])), age_text($c['createdAt'])], $list));
        }
    }
    if (!empty($r['chats'])) {
        $list = array_values(array_filter(conv_all(), function ($c) use ($cutoff) {
            $m = end($c['messages']);
            return ($c['status'] ?? '') !== 'closed' && ($c['mode'] ?? '') === 'human' && $m && $m['sender'] === 'customer' && $m['createdAt'] <= $cutoff;
        }));
        if ($list) {
            $total += count($list);
            $sections[] = '<h3 style="font-size:15px;color:#1E2A32;margin:16px 0 4px">محادثات بانتظار رد موظف (' . count($list) . ')</h3>'
                . table_html(['الزائر', 'الجوال', 'آخر رسالة', 'منذ'], array_map(function ($c) { $m = end($c['messages']); return [($c['customer']['name'] ?? '') ?: 'زائر', $c['customer']['phone'] ?? '', mb_slice(str_val($m['text'] ?? ''), 120), age_text($m['createdAt'])]; }, $list));
        }
    }
    if (!empty($r['briefs'])) {
        $list = array_values(array_filter(briefs_all(), fn($b) => ($b['status'] ?? '') === 'new' && ($b['createdAt'] ?? '') <= $cutoff));
        if ($list) {
            $total += count($list);
            $sections[] = '<h3 style="font-size:15px;color:#1E2A32;margin:16px 0 4px">طلبات مشاريع لم تُراجع (' . count($list) . ')</h3>'
                . table_html(['الرقم', 'العميل', 'نوع المشروع', 'منذ'], array_map(fn($b) => [$base ? ['text' => $b['ref'], 'link' => $base . '/brief/' . $b['id']] : $b['ref'], $b['client']['name'] ?? '', brief_label('projectType', $b['project']['projectType'] ?? ''), age_text($b['createdAt'])], $list));
        }
    }
    if (!$total) return null;
    $x = notify_render(['title' => 'تذكير بالمتابعة', 'intro' => 'هذه العناصر تنتظر المتابعة منذ أكثر من ' . $r['afterHours'] . ' ساعة.', 'htmlBlock' => implode('', $sections), 'linkPath' => '/dashboard']);
    return ['subject' => "تذكير: $total عنصر بانتظار المتابعة — " . COMPANY, 'html' => $x['html'], 'text' => $x['text'] . "\n\nعدد العناصر: $total", 'counts' => ['total' => $total]];
}

function notify_send_digest(bool $force = false): array {
    $cfg = notify_config();
    if (!mail_configured()) throw new RuntimeException('إرسال البريد غير مفعّل على الخادم (إعدادات SMTP غير مضبوطة).');
    $m = notify_build_digest($cfg);
    if (!$m) return ['sent' => false, 'message' => 'لا توجد طلبات مستلمة أو بانتظار المراجعة في هذه الفترة، لذلك لم يُرسل التقرير.'];
    $to = effective_recipients($cfg, 'requests');
    if (!$to) throw new RuntimeException('لا يوجد بريد لاستلام التقرير.');
    send_mail_or_throw($to, $m['subject'], $m['text'], $m['html']);
    return ['sent' => true, 'to' => $to, 'counts' => $m['counts'], 'forced' => $force];
}
function notify_send_reminders(): array {
    $cfg = notify_config();
    if (!mail_configured()) throw new RuntimeException('إرسال البريد غير مفعّل على الخادم (إعدادات SMTP غير مضبوطة).');
    $m = notify_build_reminders($cfg);
    if (!$m) return ['sent' => false, 'message' => 'لا يوجد ما ينتظر المتابعة منذ أكثر من ' . $cfg['reminders']['afterHours'] . ' ساعة.'];
    $to = effective_recipients($cfg);
    if (!$to) throw new RuntimeException('لا يوجد بريد لاستلام التذكير.');
    send_mail_or_throw($to, $m['subject'], $m['text'], $m['html']);
    return ['sent' => true, 'to' => $to, 'counts' => $m['counts']];
}

// بديل المؤقت في Node: يُفحص بعد الطلبات مرة كل 5 دقائق على الأكثر
function notify_tick(): void {
    $flag = DATA_DIR . '/.notify-tick';
    if (is_file($flag) && time() - (int)@filemtime($flag) < 300) return;
    @touch($flag);
    try {
        $cfg = notify_config();
        if (!mail_configured() || (!$cfg['digest']['enabled'] && !$cfg['reminders']['enabled'])) return;
        $t = riyadh_now();
        $state = notify_state();
        if ($cfg['digest']['enabled'] && $t['hour'] >= $cfg['digest']['hour'] && ($state['digestDate'] ?? '') !== $t['date']
            && ($cfg['digest']['frequency'] === 'daily' || $t['weekday'] === (int)$cfg['digest']['weekday'])) {
            $state['digestDate'] = $t['date'];
            write_json('notify_state.json', $state);
            try { notify_send_digest(); } catch (Throwable $e) { log_error('فشل إرسال تقرير الطلبات الدوري: ' . $e->getMessage()); }
        }
        if ($cfg['reminders']['enabled'] && $t['hour'] >= $cfg['reminders']['hour'] && ($state['reminderDate'] ?? '') !== $t['date']) {
            $state['reminderDate'] = $t['date'];
            write_json('notify_state.json', $state);
            try { notify_send_reminders(); } catch (Throwable $e) { log_error('فشل إرسال التذكير اليومي: ' . $e->getMessage()); }
        }
    } catch (Throwable $e) { log_error('الإشعارات المجدولة: ' . $e->getMessage()); }
}

function notify_public_config(): array {
    $cfg = notify_config();
    $events = [];
    foreach (NOTIFY_EVENTS as $k => $e) $events[$k] = ['group' => $e['group'], 'label' => $e['label'], 'subject' => $e['subject'], 'intro' => $e['intro']];
    return array_merge($cfg, [
        'effectiveRecipients' => effective_recipients($cfg), 'eventDefs' => $events, 'placeholders' => array_keys(NOTIFY_PLACEHOLDERS),
        'mailConfigured' => mail_configured(), 'linksConfigured' => notify_base_url() !== '', 'senderAddress' => mail_sender_address(),
        'state' => notify_state() ?: (object)[],
    ]);
}

/* ============================= سجل الأخطاء ============================= */

function log_error(string $message, string $stack = ''): void {
    try {
        with_lock('error_log', function () use ($message, $stack) {
            $list = read_json('error_log.json', []);
            if (!is_list($list)) $list = [];
            array_unshift($list, ['id' => 'err_' . base_convert((string)(int)(microtime(true) * 1000), 10, 36) . substr(base_convert(rand_hex(3), 16, 36), 0, 4),
                'message' => mb_slice($message, 2000), 'stack' => mb_slice($stack, 4000), 'path' => request_path(), 'method' => $_SERVER['REQUEST_METHOD'] ?? '', 'timestamp' => now_iso()]);
            write_json('error_log.json', array_slice($list, 0, 300));
        });
    } catch (Throwable $e) { /* تجاهل */ }
}
