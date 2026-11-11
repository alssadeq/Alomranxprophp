<?php
// app/mail.php
// إشعارات الطلبات الجديدة للشركة. تقرأ نفس إعدادات الإشعارات المحفوظة من لوحة التحكم
// (settings.notifications): المستلمون وتفعيل كل نوع.
// الإرسال عبر خادم SMTP إن ضُبط في app/config.php، وإلا عبر بريد الاستضافة (mail()).

declare(strict_types=1);

const NOTIFY_EVENTS = [
    'requests.contact' => ['group' => 'requests', 'subject' => 'رسالة تواصل جديدة — {الاسم}'],
    'requests.brief' => ['group' => 'requests', 'subject' => 'طلب مشروع جديد {الرقم} — {الاسم}'],
    'requests.chatService' => ['group' => 'requests', 'subject' => 'طلب خدمة من المحادثة — {الاسم}'],
    'requests.review' => ['group' => 'requests', 'subject' => 'تقييم جديد من {الاسم}'],
    'chat.new' => ['group' => 'chat', 'subject' => 'محادثة جديدة — {الاسم}'],
    'chat.transfer' => ['group' => 'chat', 'subject' => 'طلب التحدث مع موظف — {الاسم}'],
    'chat.message' => ['group' => 'chat', 'subject' => 'رسالة جديدة في المحادثة — {الاسم}'],
];
const NOTIFY_DEFAULT_EVENTS = [
    'chat' => ['chat.new' => true, 'chat.transfer' => true, 'chat.message' => false],
    'requests' => ['requests.contact' => true, 'requests.brief' => true, 'requests.chatService' => true, 'requests.review' => true],
];

function notify_recipients(string $group): array {
    $s = get_settings();
    $n = is_array($s['notifications'] ?? null) ? $s['notifications'] : [];
    $g = is_array($n[$group] ?? null) ? $n[$group] : [];
    if (($g['enabled'] ?? true) === false) return [];
    $list = is_list($g['recipients'] ?? null) && $g['recipients'] ? $g['recipients'] : (is_list($n['recipients'] ?? null) ? $n['recipients'] : []);
    if (!$list && !empty($s['briefs']['notifyEmail'])) $list = [$s['briefs']['notifyEmail']];
    if (!$list) {
        foreach (read_json('users.json', []) as $u) {
            if (is_array($u) && !empty($u['email']) && (($u['role'] ?? '') === 'super_admin' || (empty($u['role']) && !empty($u['isAdmin'])))) { $list = [$u['email']]; break; }
        }
    }
    $cfg = app_config();
    if (!$list && !empty($cfg['notify_email'])) $list = [(string)$cfg['notify_email']];
    return array_values(array_unique(array_filter(array_map('strval', $list), fn($e) => filter_var($e, FILTER_VALIDATE_EMAIL))));
}

function notify_enabled(string $event): bool {
    $meta = NOTIFY_EVENTS[$event] ?? null;
    if (!$meta) return false;
    $s = get_settings();
    $events = $s['notifications'][$meta['group']]['events'] ?? [];
    return (bool)($events[$event] ?? NOTIFY_DEFAULT_EVENTS[$meta['group']][$event] ?? false);
}

// إشعار بسيط للشركة: عنوان + جدول بيانات + نص اختياري + رابط لوحة التحكم
function notify_company(string $event, array $opts): void {
    try {
        if (!notify_enabled($event)) return;
        $to = notify_recipients(NOTIFY_EVENTS[$event]['group']);
        if (!$to) return;
        $vars = $opts['vars'] ?? [];
        $subject = strtr(NOTIFY_EVENTS[$event]['subject'], ['{الاسم}' => str_val($vars['name'] ?? ''), '{الرقم}' => str_val($vars['ref'] ?? '')]);
        if (!empty($opts['subject'])) $subject = $opts['subject'];
        $html = $opts['html'] ?? null;
        $text = $opts['text'] ?? null;
        if ($html === null) {
            $rows = '';
            foreach (($opts['rows'] ?? []) as [$k, $v]) {
                if (str_val($v) === '') continue;
                $rows .= '<tr><td style="padding:8px 10px;border-bottom:1px solid #eee9df;color:#5d6066;background:#faf8f4;width:36%">' . h($k) . '</td><td style="padding:8px 10px;border-bottom:1px solid #eee9df">' . h($v) . '</td></tr>';
            }
            $body = !empty($opts['body']) ? '<p style="background:#faf8f4;padding:10px 12px;border-radius:8px">' . nl2br(h($opts['body'])) . '</p>' : '';
            $link = site_base_url() . '/dashboard';
            $html = '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.8;color:#1a1a1a;max-width:640px;margin:auto">'
                . '<div style="background:#1E2A32;color:#fff;padding:16px 20px;border-radius:12px 12px 0 0"><strong>' . h(COMPANY) . '</strong><br><span style="color:#C9B895;font-size:13px">' . h($opts['title'] ?? $subject) . '</span></div>'
                . '<div style="padding:8px 20px 20px;border:1px solid #eee9df;border-top:0;border-radius:0 0 12px 12px"><table style="width:100%;border-collapse:collapse;font-size:14px">' . $rows . '</table>' . $body
                . '<p style="margin-top:18px"><a href="' . h($link) . '" style="display:inline-block;padding:10px 18px;background:#1E2A32;color:#fff;border-radius:999px;text-decoration:none">' . h($opts['linkLabel'] ?? 'فتح لوحة التحكم') . '</a></p></div></div>';
            $plain = [];
            foreach (($opts['rows'] ?? []) as [$k, $v]) if (str_val($v) !== '') $plain[] = "- $k: " . str_val($v);
            $text = ($opts['title'] ?? $subject) . "\n\n" . implode("\n", $plain) . (!empty($opts['body']) ? "\n\n" . $opts['body'] : '') . "\n\n" . $link;
        }
        send_mail($to, $subject, (string)$text, $html, $opts['replyTo'] ?? null);
    } catch (Throwable $e) {
        log_error('تعذر إرسال إشعار ' . $event . ': ' . $e->getMessage());
    }
}

function encode_header(string $s): string { return '=?UTF-8?B?' . base64_encode($s) . '?='; }

function send_mail(array $to, string $subject, string $text, string $html, ?string $replyTo = null): bool {
    $cfg = app_config();
    $host = preg_replace('/[^A-Za-z0-9.-]/', '', (string)($_SERVER['HTTP_HOST'] ?? 'localhost'));
    $host = preg_replace('/^www\./', '', $host);
    $fromEmail = (string)($cfg['mail_from'] ?? ('noreply@' . $host));
    $fromName = (string)($cfg['mail_from_name'] ?? COMPANY);
    if ($replyTo && !filter_var($replyTo, FILTER_VALIDATE_EMAIL)) $replyTo = null;

    $boundary = 'b_' . rand_hex(12);
    $headers = [
        'MIME-Version: 1.0',
        'From: ' . encode_header($fromName) . ' <' . $fromEmail . '>',
        'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
    ];
    if ($replyTo) $headers[] = 'Reply-To: ' . $replyTo;
    $body = "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($text))
        . "--$boundary\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($html))
        . "--$boundary--\r\n";

    if (!empty($cfg['smtp_host'])) return smtp_send($cfg, $fromEmail, $to, encode_header($subject), $headers, $body);
    $ok = @mail(implode(', ', $to), encode_header($subject), $body, implode("\r\n", $headers), '-f' . $fromEmail);
    if (!$ok) log_error('فشل إرسال البريد عبر mail() إلى ' . implode(', ', $to));
    return $ok;
}

// عميل SMTP مختصر (STARTTLS على 587 أو SSL على 465) لبريد الشركة
function smtp_send(array $cfg, string $from, array $to, string $subject, array $headers, string $body): bool {
    $host = (string)$cfg['smtp_host'];
    $port = (int)($cfg['smtp_port'] ?? 587);
    $secure = $port === 465;
    $fp = @stream_socket_client(($secure ? 'ssl://' : 'tcp://') . $host . ':' . $port, $errno, $errstr, 15);
    if (!$fp) { log_error("SMTP: تعذر الاتصال بـ $host:$port ($errstr)"); return false; }
    stream_set_timeout($fp, 15);
    $read = function () use ($fp) { $out = ''; while (($line = fgets($fp, 515)) !== false) { $out .= $line; if (isset($line[3]) && $line[3] === ' ') break; } return $out; };
    $cmd = function (string $c, array $ok) use ($fp, $read) { if ($c !== '') fwrite($fp, $c . "\r\n"); $r = $read(); if (!in_array((int)substr($r, 0, 3), $ok, true)) throw new RuntimeException(trim($r)); return $r; };
    try {
        $cmd('', [220]);
        $ehlo = 'EHLO ' . (preg_replace('/[^A-Za-z0-9.-]/', '', (string)($_SERVER['HTTP_HOST'] ?? 'localhost')) ?: 'localhost');
        $cmd($ehlo, [250]);
        if (!$secure) {
            $cmd('STARTTLS', [220]);
            if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT)) throw new RuntimeException('STARTTLS failed');
            $cmd($ehlo, [250]);
        }
        if (!empty($cfg['smtp_user'])) {
            $cmd('AUTH LOGIN', [334]);
            $cmd(base64_encode((string)$cfg['smtp_user']), [334]);
            $cmd(base64_encode(preg_replace('/\s+/', '', (string)($cfg['smtp_pass'] ?? ''))), [235]);
        }
        $cmd('MAIL FROM:<' . $from . '>', [250]);
        foreach ($to as $r) $cmd('RCPT TO:<' . $r . '>', [250, 251]);
        $cmd('DATA', [354]);
        $msg = 'To: ' . implode(', ', $to) . "\r\nSubject: $subject\r\nDate: " . date('r') . "\r\n" . implode("\r\n", $headers) . "\r\n\r\n" . $body;
        $msg = preg_replace('/^\./m', '..', str_replace(["\r\n", "\n"], ["\n", "\r\n"], $msg));
        $cmd($msg . "\r\n.", [250]);
        $cmd('QUIT', [221]);
        fclose($fp);
        return true;
    } catch (Throwable $e) {
        @fclose($fp);
        log_error('SMTP: ' . $e->getMessage());
        return false;
    }
}

// سجل الأخطاء بنفس ملف نسخة Node (data/error_log.json) ليظهر لاحقاً في مركز المطوّر
function log_error(string $message): void {
    try {
        with_lock('error_log', function () use ($message) {
            $list = read_json('error_log.json', []);
            if (!is_list($list)) $list = [];
            array_unshift($list, ['id' => 'err_' . base_convert((string)(int)(microtime(true)*1000), 10, 36) . substr(rand_hex(2), 0, 4), 'message' => mb_slice($message, 1000), 'stack' => '', 'path' => request_path(), 'method' => $_SERVER['REQUEST_METHOD'] ?? '', 'timestamp' => now_iso()]);
            write_json('error_log.json', array_slice($list, 0, 300));
        });
    } catch (Throwable $e) { /* تجاهل */ }
}
