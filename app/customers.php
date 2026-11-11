<?php
// app/customers.php
// قاعدة العملاء — نفس lib/customers.js، وتصدير البيانات — نفس lib/dataExport.js.

declare(strict_types=1);

const CUSTOMER_STATUS = ['new' => 'جديد', 'contacted' => 'تم التواصل', 'interested' => 'مهتم', 'client' => 'عميل', 'inactive' => 'غير مهتم'];
const CUSTOMER_SOURCES = ['chat' => 'المحادثة', 'contact' => 'نموذج التواصل', 'brief' => 'بريف مشروع', 'manual' => 'إضافة يدوية'];
const CUSTOMER_CHANNELS = ['email' => 'بريد إلكتروني', 'whatsapp' => 'واتساب', 'call' => 'اتصال', 'note' => 'ملاحظة'];

function customers_all(): array { $l = read_json('customers.json', []); return is_list($l) ? $l : []; }

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
function normalize_email($raw): string {
    $e = strtolower(trim(str_val($raw)));
    return strlen($e) <= 254 && preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $e) ? $e : '';
}
function c_clean($v, int $max): string { return mb_slice(preg_replace('/\s+/u', ' ', trim(str_val($v))), $max); }

// يضيف العميل أو يدمج البيانات مع سجله (داخل قفل customers). يعيد فهرسه أو null.
function customers_upsert(array &$list, array $d): ?int {
    $p = normalize_phone($d['phone'] ?? '');
    $e = normalize_email($d['email'] ?? '');
    if ($p === '' && $e === '') return null;
    $now = now_iso();
    $ref = $d['ref'] ?? null;
    $at = $ref['at'] ?? $now;
    $idx = null;
    foreach ($list as $i => $c) if (($p !== '' && ($c['phone'] ?? '') === $p) || ($e !== '' && ($c['email'] ?? '') === $e)) { $idx = $i; break; }
    if ($idx !== null && $ref) foreach ($list[$idx]['refs'] ?? [] as $r) if (($r['type'] ?? '') === $ref['type'] && ($r['id'] ?? '') === $ref['id']) return $idx;
    if ($idx === null) {
        $list[] = ['id' => 'cus_' . rand_hex(8), 'name' => c_clean($d['name'] ?? '', 100) ?: 'عميل بدون اسم', 'phone' => $p, 'email' => $e,
            'organization' => c_clean($d['organization'] ?? '', 150), 'status' => 'new', 'notes' => '', 'sources' => [], 'refs' => [], 'contactLog' => [],
            'createdAt' => $at, 'updatedAt' => $now, 'lastActivityAt' => $at, 'lastContactAt' => null];
        $idx = count($list) - 1;
    } else {
        $c = &$list[$idx];
        if (empty($c['phone']) && $p) $c['phone'] = $p;
        if (empty($c['email']) && $e) $c['email'] = $e;
        if (empty($c['organization']) && !empty($d['organization'])) $c['organization'] = c_clean($d['organization'], 150);
        if ((empty($c['name']) || $c['name'] === 'عميل بدون اسم') && !empty($d['name'])) $c['name'] = c_clean($d['name'], 100);
        if ($at < ($c['createdAt'] ?? $at)) $c['createdAt'] = $at;
        $c['updatedAt'] = $now;
        unset($c);
    }
    $c = &$list[$idx];
    if (!empty($d['source']) && !in_array($d['source'], $c['sources'], true)) $c['sources'][] = $d['source'];
    if ($ref) {
        $c['refs'][] = ['type' => $ref['type'], 'id' => $ref['id'], 'label' => c_clean($ref['label'] ?? '', 200), 'at' => $at];
        usort($c['refs'], fn($a, $b) => strcmp((string)$b['at'], (string)$a['at']));
        if ($at > ($c['lastActivityAt'] ?? '')) $c['lastActivityAt'] = $at;
    }
    unset($c);
    return $idx;
}

function record_customer(array $data): void {
    try {
        with_lock('customers', function () use ($data) {
            $list = customers_all();
            customers_upsert($list, $data);
            write_json('customers.json', $list);
        });
    } catch (Throwable $e) { log_error('تعذر العميل: ' . $e->getMessage()); }
}

// مزامنة من المصادر الحالية (مثل بدء خادم Node) — مرة عند أول تشغيل بعد رفع البيانات
function customers_sync_once(): void {
    $marker = DATA_DIR . '/.customers-synced';
    if (is_file($marker)) return;
    @file_put_contents($marker, now_iso());
    try {
        with_lock('customers', function () {
            $list = customers_all();
            foreach (read_json('messages.json', []) as $m) {
                if (!is_array($m)) continue;
                customers_upsert($list, ['name' => $m['name'] ?? '', 'phone' => $m['phone'] ?? '', 'source' => 'contact', 'ref' => ['type' => 'contact', 'id' => $m['id'] ?? '', 'label' => !empty($m['projectType']) ? 'طلب تواصل: ' . $m['projectType'] : 'طلب تواصل', 'at' => $m['createdAt'] ?? now_iso()]]);
            }
            foreach (conv_all() as $c) {
                if (empty($c['customer']['phone']) && empty($c['customer']['email'])) continue;
                customers_upsert($list, ['name' => $c['customer']['name'] ?? '', 'phone' => $c['customer']['phone'] ?? '', 'email' => $c['customer']['email'] ?? '', 'source' => 'chat', 'ref' => ['type' => 'chat', 'id' => $c['id'], 'label' => !empty($c['serviceName']) ? 'محادثة: ' . $c['serviceName'] : 'محادثة', 'at' => $c['createdAt']]]);
            }
            foreach (briefs_all() as $b) {
                customers_upsert($list, ['name' => $b['client']['name'] ?? '', 'phone' => $b['client']['phone'] ?? '', 'email' => $b['client']['email'] ?? '', 'organization' => $b['client']['organization'] ?? '', 'source' => 'brief',
                    'ref' => ['type' => 'brief', 'id' => $b['id'], 'label' => 'بريف ' . $b['ref'] . ': ' . brief_label('projectType', $b['project']['projectType'] ?? ''), 'at' => $b['createdAt']]]);
            }
            write_json('customers.json', $list);
        });
    } catch (Throwable $e) { log_error('تعذرت مزامنة قاعدة العملاء: ' . $e->getMessage()); }
}

function customer_summary(array $c): array {
    return ['id' => $c['id'], 'name' => $c['name'], 'phone' => $c['phone'], 'email' => $c['email'], 'organization' => $c['organization'] ?? '', 'status' => $c['status'],
        'sources' => $c['sources'], 'refsCount' => count($c['refs'] ?? []), 'contactsCount' => count($c['contactLog'] ?? []),
        'createdAt' => $c['createdAt'], 'lastActivityAt' => $c['lastActivityAt'], 'lastContactAt' => $c['lastContactAt'] ?? null];
}
function customer_get(string $id): ?array { foreach (customers_all() as $c) if ($c['id'] === $id) return $c; return null; }

function customers_mutate(string $id, callable $fn) {
    return with_lock('customers', function () use ($id, $fn) {
        $list = customers_all();
        foreach ($list as $i => $c) {
            if ($c['id'] !== $id) continue;
            $err = $fn($list[$i], $list);
            if (is_array($err) && isset($err['error'])) send_json(['error' => $err['error']], $err['status']);
            write_json('customers.json', $list);
            return $list[$i];
        }
        send_json(['error' => 'العميل غير موجود.'], 404);
    });
}

function customers_add_contact(string $id, array $o): array {
    return customers_mutate($id, function (&$c) use ($o) {
        $at = now_iso();
        array_unshift($c['contactLog'], ['id' => 'ct_' . rand_hex(6), 'channel' => $o['channel'], 'subject' => c_clean($o['subject'] ?? '', 200),
            'body' => mb_slice(str_val($o['body'] ?? ''), 5000), 'by' => $o['by'], 'byName' => $o['byName'], 'at' => $at, 'result' => ($o['result'] ?? '') ?: 'ok']);
        $c['contactLog'] = array_slice($c['contactLog'], 0, 500);
        if (($o['result'] ?? '') !== 'failed' && $o['channel'] !== 'note') {
            $c['lastContactAt'] = $at;
            if ($c['status'] === 'new') $c['status'] = 'contacted';
        }
        $c['lastActivityAt'] = $at;
        $c['updatedAt'] = $at;
        return null;
    });
}

function customers_report(?string $from, ?string $to): array {
    $all = customers_all();
    $in = fn($iso) => (!$from || $iso >= $from) && (!$to || $iso <= $to);
    $created = array_values(array_filter($all, fn($c) => $in($c['createdAt'])));
    $okContact = fn($l) => $l['channel'] !== 'note' && ($l['result'] ?? '') !== 'failed';
    $contacts = [];
    $refs = [];
    $contactedIds = [];
    foreach ($all as $c) {
        foreach ($c['contactLog'] ?? [] as $l) if ($okContact($l) && $in($l['at'])) { $contacts[] = $l; $contactedIds[$c['id']] = 1; }
        foreach ($c['refs'] ?? [] as $r) if ($in($r['at'])) $refs[] = $r;
    }
    $services = [];
    foreach ($refs as $r) if (preg_match('/^(?:بريف [^:]+|طلب تواصل|محادثة): (.+)$/u', (string)($r['label'] ?? ''), $m)) $services[$m[1]] = ($services[$m[1]] ?? 0) + 1;
    arsort($services);
    $end = $to ? new DateTime($to) : new DateTime('now', new DateTimeZone('UTC'));
    $months = [];
    for ($i = 11; $i >= 0; $i--) {
        $d = new DateTime(sprintf('%04d-%02d-01', (int)$end->format('Y'), (int)$end->format('n')), new DateTimeZone('UTC'));
        $d->modify("-$i month");
        $months[] = $d->format('Y-m');
    }
    $monthly = [];
    foreach ($all as $c) { $k = substr((string)$c['createdAt'], 0, 7); $monthly[$k] = ($monthly[$k] ?? 0) + 1; }
    $byStatus = [];
    foreach ($created as $c) $byStatus[$c['status']] = ($byStatus[$c['status']] ?? 0) + 1;
    $top = [];
    foreach (array_slice($services, 0, 8, true) as $label => $value) $top[] = ['label' => (string)$label, 'value' => $value];
    return [
        'from' => $from, 'to' => $to,
        'totals' => ['customers' => count($all), 'newInRange' => count($created), 'contactedInRange' => count($contactedIds),
            'neverContacted' => count(array_filter($all, fn($c) => empty($c['lastContactAt']))), 'clients' => count(array_filter($all, fn($c) => $c['status'] === 'client')),
            'contactsInRange' => count($contacts)],
        'byStatus' => array_map(fn($k) => ['key' => $k, 'label' => CUSTOMER_STATUS[$k], 'value' => $byStatus[$k] ?? 0], array_keys(CUSTOMER_STATUS)),
        'bySource' => array_map(fn($k) => ['key' => $k, 'label' => CUSTOMER_SOURCES[$k], 'value' => count(array_filter($created, fn($c) => in_array($k, $c['sources'], true)))], array_keys(CUSTOMER_SOURCES)),
        'byChannel' => array_map(fn($k) => ['key' => $k, 'label' => CUSTOMER_CHANNELS[$k], 'value' => count(array_filter($contacts, fn($l) => $l['channel'] === $k))], ['email', 'whatsapp', 'call']),
        'monthly' => array_map(fn($m) => ['key' => $m, 'value' => $monthly[$m] ?? 0], $months),
        'topServices' => $top,
    ];
}

function customers_export_rows(): array {
    return array_map(fn($c) => ['id' => $c['id'], 'name' => $c['name'], 'phone' => $c['phone'], 'email' => $c['email'], 'organization' => $c['organization'] ?? '',
        'status' => CUSTOMER_STATUS[$c['status']] ?? $c['status'], 'sources' => implode(' | ', array_map(fn($s) => CUSTOMER_SOURCES[$s] ?? $s, $c['sources'])),
        'requests' => count($c['refs'] ?? []), 'contacts' => count($c['contactLog'] ?? []), 'notes' => $c['notes'] ?? '',
        'createdAt' => $c['createdAt'], 'lastActivityAt' => $c['lastActivityAt'], 'lastContactAt' => ($c['lastContactAt'] ?? '') ?: ''], customers_all());
}

/* ---------- CSV ---------- */

function csv_flatten($obj, string $prefix = '', array $out = []): array {
    foreach (is_array($obj) ? obj($obj) : [] as $k => $v) {
        $key = $prefix !== '' ? "$prefix.$k" : (string)$k;
        if (is_array($v) && is_obj($v) && $v !== []) $out = csv_flatten($v, $key, $out);
        elseif (is_array($v)) {
            $scalar = true;
            foreach ($v as $x) if (is_array($x)) $scalar = false;
            $out[$key] = $scalar ? implode(' | ', array_map(fn($x) => $x === null ? '' : js_str($x), $v)) : json_out_str($v);
        } else $out[$key] = $v;
    }
    return $out;
}
function csv_cell($v): string {
    $s = $v === null ? '' : js_str($v);
    if (preg_match('/^[=+\-@\t\r]/', $s)) $s = "'" . $s;
    return preg_match('/[",\r\n]/', $s) ? '"' . str_replace('"', '""', $s) . '"' : $s;
}
function to_csv(array $rows): string {
    $flat = array_map(fn($r) => csv_flatten($r), $rows);
    $headers = [];
    foreach ($flat as $r) foreach (array_keys($r) as $k) if (!in_array($k, $headers, true)) $headers[] = $k;
    $lines = [implode(',', array_map('csv_cell', $headers))];
    foreach ($flat as $r) $lines[] = implode(',', array_map(fn($h) => csv_cell($r[$h] ?? null), $headers));
    return "\u{FEFF}" . implode("\r\n", $lines) . "\r\n";
}

/* ---------- المسارات ---------- */

function api_customers_list(): void {
    require_permission('viewMessages');
    $l = customers_all();
    usort($l, fn($a, $b) => strcmp((string)$b['lastActivityAt'], (string)$a['lastActivityAt']));
    send_json(['customers' => array_map('customer_summary', $l), 'options' => ['status' => CUSTOMER_STATUS, 'sources' => CUSTOMER_SOURCES, 'channels' => CUSTOMER_CHANNELS]]);
}

function api_customers_report(): void {
    require_permission('viewMessages');
    $day = fn($v, $end) => preg_match('/^\d{4}-\d{2}-\d{2}$/', str_val($v)) ? $v . 'T' . ($end ? '23:59:59.999' : '00:00:00.000') . 'Z' : null;
    send_json(customers_report($day($_GET['from'] ?? '', false), $day($_GET['to'] ?? '', true)));
}

function api_customers_export(): void {
    require_admin();
    log_activity('export', 'customers', 'تصدير قاعدة العملاء');
    header('Content-Type: text/csv; charset=utf-8');
    header('Cache-Control: no-store');
    header('Content-Disposition: attachment; filename="alomran-customers-' . gmdate('Y-m-d') . '.csv"');
    echo to_csv(customers_export_rows());
    exit;
}

function api_customers_get(string $id): void {
    require_permission('viewMessages');
    $c = customer_get($id);
    if (!$c) send_json(['error' => 'العميل غير موجود.'], 404);
    $messages = read_json('messages.json', []);
    $req = [];
    foreach ($c['refs'] as $r) {
        $item = $r;
        if ($r['type'] === 'contact') { foreach ($messages as $m) if (($m['id'] ?? '') === $r['id']) $item['text'] = $m['message'] ?? ''; }
        elseif ($r['type'] === 'chat') {
            $conv = conv_get((string)$r['id']);
            if ($conv) $item['text'] = implode(' • ', array_map(fn($m) => $m['text'] ?? '', array_slice(array_values(array_filter($conv['messages'], fn($m) => $m['sender'] === 'customer')), -3)));
        } elseif ($r['type'] === 'brief') $item['link'] = '/brief/' . rawurlencode((string)$r['id']);
        $req[] = $item;
    }
    send_json(['customer' => array_merge($c, ['requests' => $req]), 'mailConfigured' => mail_configured()]);
}

function api_customers_create(): void {
    require_permission('replyMessages');
    $b = json_body();
    $p = normalize_phone($b['phone'] ?? '');
    $e = normalize_email($b['email'] ?? '');
    $n = c_clean($b['name'] ?? '', 100);
    if (mb_len($n) < 2) send_json(['error' => 'يرجى إدخال اسم العميل.'], 400);
    if (!empty($b['phone']) && !$p) send_json(['error' => 'رقم الجوال غير صحيح.'], 400);
    if (!empty($b['email']) && !$e) send_json(['error' => 'البريد الإلكتروني غير صحيح.'], 400);
    if (!$p && !$e) send_json(['error' => 'يرجى إدخال رقم جوال أو بريد إلكتروني.'], 400);
    $c = with_lock('customers', function () use ($b, $p, $e, $n) {
        $list = customers_all();
        foreach ($list as $x) if (($p && $x['phone'] === $p) || ($e && $x['email'] === $e)) send_json(['error' => 'هذا العميل مسجّل مسبقاً.', 'existingId' => $x['id']], 409);
        $i = customers_upsert($list, ['name' => $n, 'phone' => $p, 'email' => $e, 'organization' => $b['organization'] ?? '', 'source' => 'manual', 'ref' => null]);
        if (!empty($b['notes'])) $list[$i]['notes'] = mb_slice(trim(js_str($b['notes'])), 5000);
        write_json('customers.json', $list);
        return $list[$i];
    });
    log_activity('create', 'customer', $c['name']);
    send_json(['ok' => true, 'customer' => $c], 201);
}

function api_customers_update(string $id): void {
    require_permission('replyMessages');
    $f = json_body();
    $c = customers_mutate($id, function (&$c, $list) use ($f) {
        if (array_key_exists('name', $f)) { $n = c_clean($f['name'], 100); if (mb_len($n) < 2) return ['error' => 'الاسم قصير جداً.', 'status' => 400]; $c['name'] = $n; }
        if (array_key_exists('phone', $f)) {
            $p = $f['phone'] === '' ? '' : normalize_phone($f['phone']);
            if ($f['phone'] !== '' && !$p) return ['error' => 'رقم الجوال غير صحيح. استخدم الصيغة الدولية مثل +966555555555.', 'status' => 400];
            foreach ($list as $x) if ($p && $x['id'] !== $c['id'] && $x['phone'] === $p) return ['error' => 'رقم الجوال مسجّل لعميل آخر.', 'status' => 409];
            $c['phone'] = $p;
        }
        if (array_key_exists('email', $f)) {
            $e = $f['email'] === '' ? '' : normalize_email($f['email']);
            if ($f['email'] !== '' && !$e) return ['error' => 'البريد الإلكتروني غير صحيح.', 'status' => 400];
            foreach ($list as $x) if ($e && $x['id'] !== $c['id'] && $x['email'] === $e) return ['error' => 'البريد الإلكتروني مسجّل لعميل آخر.', 'status' => 409];
            $c['email'] = $e;
        }
        if (!$c['phone'] && !$c['email']) return ['error' => 'يجب أن يبقى للعميل رقم جوال أو بريد إلكتروني.', 'status' => 400];
        if (array_key_exists('organization', $f)) $c['organization'] = c_clean($f['organization'], 150);
        if (array_key_exists('status', $f)) { if (!isset(CUSTOMER_STATUS[str_val($f['status'])])) return ['error' => 'حالة غير صحيحة.', 'status' => 400]; $c['status'] = $f['status']; }
        if (array_key_exists('notes', $f)) $c['notes'] = mb_slice(trim(str_replace("\r\n", "\n", str_val($f['notes']))), 5000);
        $c['updatedAt'] = now_iso();
        return null;
    });
    log_activity('update', 'customer', $c['name']);
    send_json(['ok' => true, 'customer' => $c]);
}

function api_customers_delete(string $id): void {
    require_admin();
    $c = with_lock('customers', function () use ($id) {
        $list = customers_all();
        foreach ($list as $i => $c) if ($c['id'] === $id) { array_splice($list, $i, 1); write_json('customers.json', $list); return $c; }
        send_json(['error' => 'العميل غير موجود.'], 404);
    });
    log_activity('delete', 'customer', $c['name']);
    send_json(['ok' => true]);
}

function api_customers_contact(string $id): void {
    $staff = require_permission('replyMessages');
    rate_limit('customer_email', 30, 600, 'تم تجاوز عدد الرسائل المرسلة للعملاء مؤقتاً. حاول بعد قليل.', $staff['id']);
    $c = customer_get($id);
    if (!$c) send_json(['error' => 'العميل غير موجود.'], 404);
    $b = json_body();
    $channel = str_val($b['channel'] ?? '');
    if (!in_array($channel, ['email', 'whatsapp', 'call', 'note'], true)) send_json(['error' => 'قناة التواصل غير صحيحة.'], 400);
    $subject = mb_slice(trim(str_val($b['subject'] ?? '')), 200);
    $body = mb_slice(trim(str_replace("\r\n", "\n", str_val($b['body'] ?? ''))), 5000);
    $entry = ['channel' => $channel, 'subject' => $subject, 'body' => $body, 'by' => $staff['id'], 'byName' => $staff['username']];
    if ($channel === 'email') {
        if (empty($c['email'])) send_json(['error' => 'لا يوجد بريد إلكتروني لهذا العميل.'], 400);
        if ($subject === '' || $body === '') send_json(['error' => 'يرجى كتابة عنوان الرسالة ونصها.'], 400);
        if (!mail_configured()) send_json(['error' => 'إرسال البريد غير مفعّل على الخادم (إعدادات SMTP غير مضبوطة).'], 503);
        $html = '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.9;color:#1a1a1a;max-width:640px">
      <p>' . str_replace("\n", '<br>', escape_html($body)) . '</p>
      <hr style="border:0;border-top:1px solid #eee9df;margin:20px 0">
      <p style="color:#5d6066;font-size:13px">' . escape_html($staff['username']) . '<br><strong style="color:#1E2A32">' . COMPANY . '</strong></p></div>';
        try { send_mail_or_throw([$c['email']], $subject, "$body\n\n—\n{$staff['username']}\n" . COMPANY, $html, ($staff['email'] ?? '') ?: null); }
        catch (Throwable $e) {
            customers_add_contact($c['id'], array_merge($entry, ['result' => 'failed']));
            log_error('فشل إرسال بريد للعميل ' . $c['id'] . ': ' . $e->getMessage());
            send_json(['error' => 'تعذر إرسال البريد. راجع إعدادات SMTP في سجل الأخطاء.'], 502);
        }
    } elseif ($channel === 'note' && $body === '') send_json(['error' => 'يرجى كتابة نص الملاحظة.'], 400);
    $updated = customers_add_contact($c['id'], $entry);
    log_activity('contact', 'customer', $c['name'] . ' (' . CUSTOMER_CHANNELS[$channel] . ')');
    send_json(['ok' => true, 'customer' => $updated]);
}
