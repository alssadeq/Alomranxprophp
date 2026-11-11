<?php
// app/chat.php
// المحادثة من جهة الزائر — نفس lib/chatRoutes.js وصيغة data/conversations.json.
// في هذه المرحلة: الردود الجاهزة والاقتراحات وقائمة الخدمات، والتحويل إلى الفريق
// (يصل للفريق بالبريد مع زر واتساب للعميل). الرد من لوحة التحكم والذكاء الاصطناعي في المرحلة التالية.

declare(strict_types=1);

const CHAT_DEFAULT_UNAVAILABLE = 'نعتذر منك، موظفو خدمة العملاء مشغولون في الوقت الحالي. يمكنك التواصل معنا مباشرة عبر واتساب وسنرد عليك في أقرب وقت، أو ترك رسالتك هنا وسنعود إليك.';
const CHAT_LEGACY_WELCOME = "أهلًا بك في العمران 👋\nكيف يمكننا مساعدتك اليوم؟";
const CHAT_SERVICES_QUESTION = '/(ما|ماهي|ما هي|وش|ايش|إيش)\s*(هي\s*)?خدمات|خدماتكم|^الخدمات\??$|الخدمات المتاحة|what (are )?your services|services\??$/iu';

/* ---------- التخزين ---------- */

function conv_all(): array { $l = read_json('conversations.json', []); return is_list($l) ? $l : []; }

// تعديل محادثة واحدة تحت القفل: $fn تستقبل المحادثة بالمرجع
function conv_mutate(string $id, callable $fn, bool $touch = true): ?array {
    return with_lock('conversations', function () use ($id, $fn, $touch) {
        $all = conv_all();
        foreach ($all as $i => $c) {
            if (($c['id'] ?? '') !== $id) continue;
            $fn($all[$i]);
            if ($touch) $all[$i]['updatedAt'] = now_iso();
            write_json('conversations.json', $all);
            return $all[$i];
        }
        return null;
    });
}

function conv_get(string $id): ?array {
    foreach (conv_all() as $c) if (($c['id'] ?? '') === $id) return $c;
    return null;
}

function conv_add_message(array &$c, array $msg): void {
    $msg['id'] = 'msg_' . rand_hex(7);
    // وقت الرسالة بعد أي علامة استلام/قراءة سُجلت في نفس الجزء من الثانية (حتى لا تظهر «مقروءة» قبل أن تُقرأ)
    $t = js_time(now_iso());
    foreach (['customerReadAt', 'customerDeliveredAt', 'staffReadAt', 'staffDeliveredAt'] as $k) if (!empty($c[$k]) && js_time($c[$k]) >= $t) $t = js_time($c[$k]) + 1;
    $msg['createdAt'] = gmdate('Y-m-d\\TH:i:s', (int)floor($t / 1000)) . sprintf('.%03dZ', (int)$t % 1000);
    foreach ($msg as $k => $v) if ($v === null) unset($msg[$k]);
    $c['messages'][] = $msg;
    if (($msg['sender'] ?? '') === 'customer') $c['unreadForStaff'] = (int)($c['unreadForStaff'] ?? 0) + 1;
}

/* ---------- الإعدادات العامة ---------- */

function chat_hours_open(array $c): bool {
    $wh = $c['workHours'] ?? [];
    if (empty($wh['enabled'])) return true;
    $tz = new DateTimeZone((string)(app_config()['timezone'] ?? 'Asia/Riyadh'));
    $now = new DateTime('now', $tz);
    $day = ((int)$now->format('w') + 6) % 7;
    if (!in_array($day, $wh['days'] ?? [], true)) return false;
    $hh = $now->format('H:i');
    return $hh >= ($wh['start'] ?? '00:00') && $hh < ($wh['end'] ?? '23:59');
}

function public_chat_settings(): array {
    $s = get_settings();
    $c = $s['chat'] ?? [];
    $phone = ($c['phone'] ?? '') ?: (($s['phone'] ?? '') ?: (($s['contactPhone'] ?? '') ?: '+966555592666'));
    $whatsapp = ($c['whatsapp'] ?? '') ?: (($s['whatsapp'] ?? '') ?: (($s['whatsappNumber'] ?? '') ?: $phone));
    $qr = [];
    foreach ($c['quickReplies'] ?? [] as $q) {
        if (!is_array($q) || ($q['enabled'] ?? null) === false) continue;
        $qr[] = ['id' => $q['id'] ?? null, 'text' => $q['text'] ?? null, 'action' => $q['action'] ?? null];
        if (count($qr) >= 8) break;
    }
    return [
        'enabled' => ($c['enabled'] ?? null) !== false, 'aiEnabled' => ($c['aiEnabled'] ?? null) !== false,
        'humanEnabled' => ($c['humanEnabled'] ?? null) !== false, 'whatsappEnabled' => ($c['whatsappEnabled'] ?? null) !== false,
        'callEnabled' => ($c['callEnabled'] ?? null) !== false,
        'assistantName' => ($c['assistantName'] ?? '') ?: 'مساعد العمران', 'assistantImage' => ($c['assistantImage'] ?? '') ?: '',
        'welcomeMessage' => ($c['welcomeMessage'] ?? '') ?: '', 'offlineMessage' => ($c['offlineMessage'] ?? '') ?: '',
        'transferMessage' => ($c['transferMessage'] ?? '') ?: '', 'quickReplies' => $qr,
        'fab' => ($c['fab'] ?? null) ?: (object)[], 'open' => chat_hours_open($c),
        'phone' => preg_replace('/[^0-9+]/', '', str_val($phone)), 'whatsapp' => preg_replace('/[^0-9]/', '', str_val($whatsapp)),
    ];
}

/* ---------- عرض المحادثة للعميل ---------- */

function chat_is_reply(array $m): bool { return in_array($m['sender'] ?? '', ['ai', 'human'], true); }
function chat_last_at(array $c, callable $pred): string {
    $msgs = $c['messages'] ?? [];
    for ($i = count($msgs) - 1; $i >= 0; $i--) if ($pred($msgs[$i])) return (string)$msgs[$i]['createdAt'];
    return '';
}
function chat_receipt(array $c, array $m, string $lastReply): ?string {
    if (($m['sender'] ?? '') === 'system') return null;
    $fromCustomer = ($m['sender'] ?? '') === 'customer';
    $read = $fromCustomer ? ($c['staffReadAt'] ?? '') : ($c['customerReadAt'] ?? '');
    $del = $fromCustomer ? ($c['staffDeliveredAt'] ?? '') : ($c['customerDeliveredAt'] ?? '');
    if (($read && $read >= $m['createdAt']) || ($fromCustomer && $lastReply >= $m['createdAt'])) return 'read';
    if ($del && $del >= $m['createdAt']) return 'delivered';
    return 'sent';
}

function chat_safe_customer(array $c): array {
    $lastReply = chat_last_at($c, 'chat_is_reply');
    $msgs = [];
    foreach ($c['messages'] ?? [] as $m) {
        $o = ['id' => $m['id'], 'sender' => $m['sender'], 'text' => $m['text'] ?? '', 'createdAt' => $m['createdAt'],
            'kind' => ($m['kind'] ?? '') ?: 'message', 'attachment' => $m['attachment'] ?? null];
        if (isset($m['cta'])) $o['cta'] = $m['cta'];
        if (is_list($m['options'] ?? null)) $o['options'] = $m['options'];
        if (($m['sender'] ?? '') === 'human') $o['staffName'] = $m['staffName'] ?? '';
        if (($m['sender'] ?? '') === 'customer') $o['status'] = chat_receipt($c, $m, $lastReply);
        $msgs[] = $o;
    }
    return [
        'id' => $c['id'], 'status' => $c['status'] ?? 'open', 'mode' => $c['mode'] ?? 'ai', 'serviceName' => $c['serviceName'] ?? '',
        'createdAt' => $c['createdAt'], 'updatedAt' => $c['updatedAt'], 'unreadForStaff' => (int)($c['unreadForStaff'] ?? 0),
        'agent' => !empty($c['humanAssignedTo']) ? ['name' => ($c['humanAssignedName'] ?? '') ?: 'فريق خدمة العملاء', 'online' => staff_online($c['humanAssignedTo'])] : null,
        'messages' => $msgs,
    ];
}

// صاحب المحادثة: من يحمل رمز الوصول الذي أُعطي عند إنشائها (يُحفظ hash الرمز فقط)
function chat_ensure_owner(?array $c): bool {
    if (!$c || empty($c['accessTokenHash'])) return false;
    $token = (string)($_SERVER['HTTP_X_CHAT_TOKEN'] ?? '');
    if ($token === '' || strlen($token) > 200) return false;
    return hash_equals((string)$c['accessTokenHash'], hash('sha256', $token));
}

// استلام/قراءة العميل للرسائل وآخر ظهور
function chat_mark_customer(array &$c, bool $read): bool {
    $now = now_iso();
    $last = chat_last_at($c, 'chat_is_reply');
    $changed = false;
    if (empty($c['customerSeenAt']) || time() - strtotime((string)$c['customerSeenAt']) > 10) { $c['customerSeenAt'] = $now; $changed = true; }
    if ($last && (empty($c['customerDeliveredAt']) || $c['customerDeliveredAt'] < $last)) { $c['customerDeliveredAt'] = $now; $changed = true; }
    if ($read && $last && (empty($c['customerReadAt']) || $c['customerReadAt'] < $last)) { $c['customerReadAt'] = $now; $changed = true; }
    return $changed;
}

function chat_customer_vars(array $c, array $extra = []): array {
    $x = $c['customer'] ?? [];
    return array_merge(['name' => ($x['name'] ?? '') ?: 'زائر', 'phone' => $x['phone'] ?? '', 'email' => $x['email'] ?? ''], $extra);
}

function chat_customer_rows(array $c): array {
    $x = $c['customer'] ?? [];
    return [['الاسم', ($x['name'] ?? '') ?: 'زائر'], ['الجوال', $x['phone'] ?? ''], ['البريد الإلكتروني', $x['email'] ?? '']];
}

/* ---------- الردود التلقائية ---------- */

function chat_site_services(): array {
    $out = [];
    foreach (get_settings()['services'] ?? [] as $s) {
        $t = trim(str_val($s['title']['ar'] ?? '') ?: str_val($s['title']['en'] ?? ''));
        if ($t === '') continue;
        $out[] = ['title' => $t, 'description' => trim(str_val($s['description']['ar'] ?? '') ?: str_val($s['description']['en'] ?? ''))];
    }
    return $out;
}
function chat_services_text(): string {
    $list = array_column(chat_site_services(), 'title');
    return $list ? "نقدم في العمران الذهبية للمقاولات العامة الخدمات التالية:\n" . implode("\n", array_map(fn($t) => '• ' . $t, $list)) . "\n\nاختر الخدمة التي تهمك لمعرفة تفاصيلها:"
        : 'نقدم خدمات المقاولات العامة وإدارة وتنفيذ المشاريع والإشراف الهندسي. هل ترغب في طلب عرض سعر لمشروعك؟';
}
function chat_services_answer(string $custom = ''): array {
    $list = array_slice(array_column(chat_site_services(), 'title'), 0, 10);
    $a = ['text' => trim($custom) ?: chat_services_text()];
    if ($list) $a['options'] = $list;
    return $a;
}
function chat_quick_reply_answer(array $q): ?array {
    $custom = trim(str_val($q['reply'] ?? ''));
    $cta = ['whatsapp' => ['type' => 'whatsapp', 'label' => 'فتح واتساب'], 'call' => ['type' => 'call', 'label' => 'اتصل الآن'], 'service_request' => ['type' => 'brief', 'label' => 'تعبئة نموذج الطلب']];
    $def = [
        'services' => chat_services_text(),
        'service_request' => 'يسعدنا خدمتك! سننقلك الآن إلى نموذج طلب المشروع لتعبئة التفاصيل، وسيتواصل معك فريقنا بعد مراجعته.',
        'whatsapp' => 'تفضل بالتواصل معنا عبر واتساب من الزر أدناه، وسيرد عليك فريقنا في أقرب وقت.',
        'call' => 'يسعدنا اتصالك بنا، اضغط الزر أدناه للاتصال مباشرة بفريق العمران الذهبية.',
    ];
    $action = $q['action'] ?? '';
    if ($action === 'services' || ($action === 'message' && $custom === '' && preg_match(CHAT_SERVICES_QUESTION, str_val($q['text'] ?? '')))) return chat_services_answer($custom);
    $text = $custom ?: ($def[$action] ?? '');
    if ($text === '') return null;
    $a = ['text' => $text];
    if (isset($cta[$action])) $a['cta'] = $cta[$action];
    return $a;
}
function chat_norm_ar(string $t): string {
    $t = mb_strtolower($t, 'UTF-8');
    $t = preg_replace('/[\x{064B}-\x{0652}\x{0640}]/u', '', $t);
    $t = str_replace(['أ', 'إ', 'آ', 'ة', 'ى'], ['ا', 'ا', 'ا', 'ه', 'ي'], $t);
    $t = preg_replace('/[^\p{L}\p{N}]+/u', ' ', $t);
    return ' ' . trim($t) . ' ';
}
function chat_match_canned(string $msg): ?string {
    $text = trim($msg);
    if ($text === '' || mb_len($text) > 60) return null;
    $m = chat_norm_ar($text);
    foreach (get_settings()['chat']['cannedReplies'] ?? [] as $r) {
        if (!is_array($r) || ($r['enabled'] ?? null) === false || empty($r['reply'])) continue;
        foreach ($r['keywords'] ?? [] as $k) {
            $nk = trim(chat_norm_ar(str_val($k)));
            if ($nk !== '' && str_contains($m, ' ' . $nk . ' ')) return (string)$r['reply'];
        }
    }
    return null;
}
function chat_find_quick_reply($id, string $text): ?array {
    $list = get_settings()['chat']['quickReplies'] ?? [];
    foreach ($list as $q) if ($id && ($q['id'] ?? null) === $id) return $q;
    foreach ($list as $q) if ($text !== '' && ($q['text'] ?? null) === $text) return $q;
    return null;
}
function chat_rule_reply(array &$c, string $text): string {
    $t = mb_strtolower($text, 'UTF-8');
    foreach (get_settings()['services'] ?? [] as $i => $s) {
        $name = str_val($s['title']['ar'] ?? '') ?: str_val($s['title']['en'] ?? '');
        if ($name !== '' && str_contains($t, mb_strtolower(mb_substr($name, 0, min(12, mb_len($name))), 'UTF-8'))) {
            $c['serviceId'] = str_val($s['id'] ?? ('svc_' . $i));
            $c['serviceName'] = $name;
            return 'رائع، لدينا خدمة ' . $name . '. هل ترغب في معرفة تفاصيلها؟';
        }
    }
    if (preg_match('/خدمات|ماذا تقدم|الخدمات/u', $t)) return 'لدينا خدمات متعددة في المقاولات والتنفيذ والإشراف. هل ترغب أن أعرض لك الخدمات المتاحة؟';
    if (preg_match('/سعر|اسعار|أسعار|تكلف|كم|باقة|باقات/u', $t)) return 'يمكننا متابعة طلبك وتفاصيل الخدمة عبر واتساب. هل ترغب في إرسال طلبك الآن؟';
    return 'أرغب في التأكد من احتياجك بشكل أفضل. هل ترغب في التحدث مع أحد أعضاء فريقنا؟';
}

// لا يوجد موظف متصل في هذه المرحلة: رسالة اعتذار مع زر واتساب أو اتصال
function chat_send_unavailable(array &$c): void {
    $chat = get_settings()['chat'] ?? [];
    $text = trim(str_val($chat['unavailableMessage'] ?? '')) ?: CHAT_DEFAULT_UNAVAILABLE;
    $cta = ($chat['whatsappEnabled'] ?? null) !== false ? ['type' => 'whatsapp', 'label' => 'التواصل عبر واتساب']
        : (($chat['callEnabled'] ?? null) !== false ? ['type' => 'call', 'label' => 'الاتصال بنا'] : null);
    conv_add_message($c, ['sender' => 'ai', 'text' => $text, 'kind' => 'staff_unavailable', 'cta' => $cta]);
}

function chat_handoff(array &$c, string $reason, string $customerText, bool $notifyCustomer = true): void {
    $c['mode'] = 'human';
    $c['transferAt'] = now_iso();
    $c['handoff'] = ['at' => $c['transferAt'], 'reason' => $reason, 'status' => 'pending'];
    if (!staff_available()) chat_send_unavailable($c);
    elseif ($notifyCustomer) {
        $msg = trim(str_val(ai_instructions()['handoffMessage'] ?? '')) ?: (trim(str_val(get_settings()['chat']['transferMessage'] ?? '')) ?: 'تم تحويل طلبك إلى فريق خدمة العملاء.');
        conv_add_message($c, ['sender' => 'ai', 'text' => $msg, 'kind' => 'transfer']);
    }
    $convId = $c['id'];
    register_shutdown_function(function () use ($convId, $reason, $customerText) {
        if (function_exists('fastcgi_finish_request')) @fastcgi_finish_request();
        elseif (function_exists('litespeed_finish_request')) @litespeed_finish_request();
        try { chat_handoff_followup($convId, $reason, $customerText); } catch (Throwable $e) { log_error('ملخص التحويل: ' . $e->getMessage()); }
    });
}

// ملخص المحادثة للفريق (بالذكاء الاصطناعي إن توفر) ثم إشعار البريد والجرس
function chat_handoff_followup(string $convId, string $reason, string $customerText): void {
    $c = conv_get($convId);
    if (!$c) return;
    $fields = ['summary' => '', 'request' => $customerText];
    try { $fields = ai_summarize_for_handoff(chat_ai_history($c), $c['customer'] ?? null); } catch (Throwable $e) {}
    $labels = [['نوع المشروع', $fields['projectType'] ?? ''], ['المدينة', $fields['city'] ?? ''], ['المساحة', $fields['area'] ?? ''], ['الميزانية', $fields['budget'] ?? ''], ['الموعد المتوقع', $fields['timeline'] ?? ''], ['طلب العميل', $fields['request'] ?? '']];
    $fresh = conv_mutate($convId, function (&$x) use ($fields, $labels) {
        $x['handoff'] = array_merge(is_array($x['handoff'] ?? null) ? $x['handoff'] : [], $fields, ['status' => 'sent']);
        $parts = array_merge([$fields['summary'] ?? ''], array_map(fn($l) => $l[0] . ': ' . $l[1], array_filter($labels, fn($l) => str_val($l[1]) !== '')));
        $x['aiSummary'] = mb_slice(implode(' | ', array_filter($parts, fn($p) => $p !== '')), 1500);
        if (!empty($fields['projectType']) && empty($x['serviceName'])) $x['serviceName'] = $fields['projectType'];
    }) ?? $c;
    $why = ['human' => 'طلب العميل التحدث مع موظف', 'ai' => 'حوّل المساعد الذكي الطلب إلى الفريق', 'failure' => 'تعذر الرد الآلي مؤقتاً'][$reason] ?? 'تحويل إلى موظف';
    notify_company('chat.transfer', ['vars' => chat_customer_vars($fresh, ['message' => ($fields['request'] ?? '') ?: $customerText, 'project' => $fields['projectType'] ?? '']),
        'title' => 'طلب التحدث مع موظف — ' . $why, 'rows' => array_merge(chat_customer_rows($fresh), [['ملخص المحادثة', $fields['summary'] ?? '']], $labels),
        'linkPath' => '/dashboard', 'linkLabel' => 'فتح مركز المحادثات', 'replyTo' => ($fresh['customer']['email'] ?? '') ?: null]);
}

// سجل المحادثة للوكيل: رسائل العميل والردود فقط
function chat_ai_history(array $c): array {
    $out = [];
    foreach ($c['messages'] ?? [] as $m) {
        if (empty($m['text']) || !in_array(($m['kind'] ?? '') ?: 'message', ['message', 'welcome', 'transfer_request', 'service_request'], true)) continue;
        $out[] = ['role' => $m['sender'] === 'customer' ? 'user' : 'assistant', 'text' => $m['text']];
    }
    return array_slice($out, -16);
}

function chat_maybe_remind_unavailable(array &$c): void {
    if (($c['mode'] ?? '') !== 'human' || staff_available() || (!empty($c['humanAssignedTo']) && staff_online($c['humanAssignedTo']))) return;
    $last = chat_last_at($c, fn($m) => ($m['kind'] ?? '') === 'staff_unavailable');
    if (!$last || time() - strtotime($last) > 600) chat_send_unavailable($c);
}

/* ---------- المسارات ---------- */

function api_chat_settings(): void { send_json(public_chat_settings()); }

function api_chat_create(): void {
    rate_limit('chat_create', 15, 600, 'تم تجاوز عدد المحادثات الجديدة مؤقتاً.');
    $settings = get_settings()['chat'] ?? [];
    if (($settings['enabled'] ?? null) === false) send_json(['error' => 'المحادثة غير متاحة حالياً.'], 403);
    $b = json_body();
    $src = is_array($b['customer'] ?? null) ? $b['customer'] : [];
    $name = preg_replace('/\s+/u', ' ', trim(str_val($src['name'] ?? '')));
    $phone = preg_replace('/[\s()-]/', '', trim(ar_digits(str_val($src['phone'] ?? ''))));
    $email = strtolower(trim(str_val($src['email'] ?? '')));
    if (mb_len($name) < 2 || mb_len($name) > 80) send_json(['error' => 'يرجى إدخال الاسم (حرفان على الأقل).'], 400);
    if (!preg_match('/^\+[1-9][0-9]{7,14}$/', $phone)) send_json(['error' => 'يرجى إدخال رقم جوال صحيح.'], 400);
    if ($email !== '' && (strlen($email) > 254 || !preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $email))) send_json(['error' => 'البريد الإلكتروني غير صحيح.'], 400);
    $customer = ['name' => $name, 'phone' => $phone, 'email' => $email];

    $token = b64url(random_bytes(32));
    $now = now_iso();
    $visitor = mb_slice(str_val($b['visitorId'] ?? '') ?: (rand_hex(4) . '-' . rand_hex(2) . '-' . rand_hex(2) . '-' . rand_hex(2) . '-' . rand_hex(6)), 100);
    $c = ['id' => 'conv_' . rand_hex(8), 'userId' => null, 'visitorId' => $visitor, 'accessTokenHash' => hash('sha256', $token),
        'locale' => ($b['locale'] ?? '') === 'en' ? 'en' : 'ar', 'status' => 'open', 'mode' => 'ai', 'humanAssignedTo' => null,
        'customer' => $customer, 'serviceId' => null, 'serviceName' => '', 'projectId' => null, 'orderId' => null, 'messages' => [],
        'createdAt' => $now, 'updatedAt' => $now, 'unreadForStaff' => 0, 'aiSummary' => ''];
    $greeting = 'مرحباً ' . $name . ' في العمران الذهبية للمقاولات العامة';
    $aiWelcome = (($settings['aiEnabled'] ?? null) !== false && ai_runnable_agents()) ? trim(str_val(ai_instructions()['welcomeMessage'] ?? '')) : '';
    $extra = str_replace("\r\n", "\n", $aiWelcome !== '' ? $aiWelcome : trim(str_val($settings['welcomeMessage'] ?? '')));
    if ($extra === CHAT_LEGACY_WELCOME) $extra = '';
    conv_add_message($c, ['sender' => 'ai', 'text' => $extra !== '' ? $greeting . "\n" . $extra : $greeting, 'kind' => 'welcome']);
    with_lock('conversations', function () use ($c) {
        $all = conv_all();
        array_unshift($all, $c);
        write_json('conversations.json', $all);
    });
    record_customer(['name' => $name, 'phone' => $phone, 'email' => $email, 'source' => 'chat', 'ref' => ['type' => 'chat', 'id' => $c['id'], 'label' => 'محادثة', 'at' => $c['createdAt']]]);
    respond_then(fn() => send_json(['conversation' => chat_safe_customer($c), 'accessToken' => $token, 'settings' => public_chat_settings()], 201), function () use ($customer) {
        notify_company('chat.new', ['vars' => $customer, 'title' => 'محادثة جديدة', 'linkPath' => '/dashboard',
            'rows' => [['الاسم', $customer['name']], ['الجوال', $customer['phone']], ['البريد الإلكتروني', $customer['email']]],
            'linkLabel' => 'فتح مركز المحادثات', 'replyTo' => $customer['email'] ?: null]);
    });
}

function api_chat_get(string $id): void {
    $c = conv_get($id);
    if (!$c) send_json(['error' => 'المحادثة غير موجودة.'], 404);
    if (!chat_ensure_owner($c)) send_json(['error' => 'غير مصرح.'], 403);
    $read = ($_GET['read'] ?? '') === '1';
    $tmp = $c;
    if (chat_mark_customer($tmp, $read)) {
        $c = conv_mutate($id, function (&$x) use ($read) { chat_mark_customer($x, $read); }, false) ?? $c;
    }
    send_json(['conversation' => chat_safe_customer($c)]);
}

function api_chat_message(): void {
    $b = json_body();
    $convId = str_val($b['conversationId'] ?? '');
    rate_limit('chat_send', 60, 600, 'تم تجاوز عدد الرسائل مؤقتاً. حاول بعد قليل.', $convId ?: 'new');
    $c = $convId !== '' ? conv_get($convId) : null;
    if (!$c || !chat_ensure_owner($c)) send_json(['error' => 'المحادثة غير مصرح بها.'], 403);
    $msg = trim(str_val($b['text'] ?? ''));
    if (mb_len($msg) > 2000) send_json(['error' => 'الرسالة طويلة جداً.'], 400);
    $action = str_val($b['action'] ?? '');
    $quickReplyId = $b['quickReplyId'] ?? null;
    $serviceOption = str_val($b['serviceOption'] ?? '');
    $extra = [];
    $notify = null;

    $updated = conv_mutate($c['id'], function (&$c) use ($msg, $action, $quickReplyId, $serviceOption, &$extra, &$notify) {
        chat_mark_customer($c, true);
        $name = ($c['customer']['name'] ?? '') ?: 'زائر';
        $email = ($c['customer']['email'] ?? '') ?: null;
        if ($action === 'human') {
            conv_add_message($c, ['sender' => 'customer', 'text' => $msg ?: 'أرغب في التحدث مع موظف', 'kind' => 'transfer_request']);
            if (($c['mode'] ?? '') !== 'human') chat_handoff($c, 'human', $msg);
            $extra = ['transfer' => true];
            return;
        }
        $qr = chat_find_quick_reply($quickReplyId, $msg);
        $auto = ($qr && ($qr['action'] ?? '') !== 'human') ? chat_quick_reply_answer($qr) : null;
        $picked = null;
        if ($serviceOption !== '') foreach (chat_site_services() as $s) if ($s['title'] === $serviceOption) $picked = $s;
        if ($picked) {
            $c['serviceName'] = $picked['title'];
            $auto = ['text' => str_replace("\n\n\n", "\n\n", $picked['title'] . "\n" . $picked['description'] . "\n\nهل ترغب في طلب عرض سعر لهذه الخدمة؟ يمكنك إرسال تفاصيل مشروعك والمخططات عبر نموذج الطلب."), 'cta' => ['type' => 'brief', 'label' => 'طلب عرض سعر']];
        } elseif (!$auto && $action === '' && preg_match(CHAT_SERVICES_QUESTION, $msg)) {
            $auto = chat_services_answer();
        } elseif (!$auto && $action === '') {
            $canned = chat_match_canned($msg);
            if ($canned !== null) $auto = ['text' => $canned];
        }
        $addAuto = function () use (&$c, $auto) {
            if ($auto) conv_add_message($c, ['sender' => 'ai', 'text' => $auto['text'], 'kind' => 'quick_reply', 'cta' => $auto['cta'] ?? null, 'options' => $auto['options'] ?? null]);
        };
        if ($action === 'service_request') {
            conv_add_message($c, ['sender' => 'customer', 'text' => $msg ?: 'أريد طلب خدمة', 'kind' => 'service_request']);
            $addAuto();
            $rows = chat_customer_rows($c);
            $rows[] = ['الخدمة', ($c['serviceName'] ?? '') ?: $msg];
            $notify = ['requests.chatService', ['vars' => chat_customer_vars($c, ['project' => ($c['serviceName'] ?? '') ?: $msg, 'message' => $msg]), 'title' => 'طلب خدمة جديد من المحادثة', 'rows' => $rows, 'linkPath' => '/dashboard', 'linkLabel' => 'فتح مركز المحادثات', 'replyTo' => $email]];
            $extra = ['channel' => 'whatsapp', 'serviceRequest' => true];
            return;
        }
        if ($action === 'whatsapp' || $action === 'call') {
            conv_add_message($c, ['sender' => 'customer', 'text' => $msg ?: $action, 'kind' => $action === 'whatsapp' ? 'whatsapp_click' : 'call_click']);
            $addAuto();
            $extra = ['channel' => $action];
            return;
        }
        conv_add_message($c, ['sender' => 'customer', 'text' => $msg, 'kind' => 'message']);
        $notify = ['chat.message', ['throttleKey' => $c['id'], 'vars' => chat_customer_vars($c, ['message' => $msg]), 'title' => 'رسالة جديدة من زائر', 'rows' => chat_customer_rows($c), 'body' => $msg, 'linkPath' => '/dashboard', 'linkLabel' => 'فتح مركز المحادثات', 'replyTo' => $email]];
        if ($auto && ($c['mode'] ?? '') !== 'human') { $addAuto(); return; }
        if (($c['mode'] ?? '') === 'human') { chat_maybe_remind_unavailable($c); $extra = ['human' => true]; return; }
        if ((get_settings()['chat']['aiEnabled'] ?? null) === false) { $extra = ['human' => true]; return; }
        $extra = ['__ai' => true];
    });
    if (!empty($extra['__ai'])) {
        // الرد الآلي: وكلاء الذكاء الاصطناعي، أو الردود التقليدية إن لم يُفعَّل أي وكيل
        $settings = get_settings();
        $history = chat_ai_history($updated);
        $r = ai_route(fn($agent) => ai_build_system_prompt($settings, $updated['customer'] ?? null, $agent), $history);
        $extra = [];
        $updated = conv_mutate($updated['id'], function (&$c) use ($r, $msg, &$extra) {
            if ($r['result']) {
                $out = ai_extract_handoff($r['result']['text']);
                if ($out['text'] !== '') conv_add_message($c, ['sender' => 'ai', 'text' => $out['text'], 'kind' => 'message']);
                if ($out['handoff']) { chat_handoff($c, 'ai', $msg); $extra = ['transfer' => true]; }
            } elseif ($r['attempted'] === 0) {
                conv_add_message($c, ['sender' => 'ai', 'text' => chat_rule_reply($c, $msg), 'kind' => 'message']);
            } else {
                conv_add_message($c, ['sender' => 'ai', 'text' => str_val(ai_instructions()['failureMessage'] ?? ''), 'kind' => 'message']);
                chat_handoff($c, 'failure', $msg, false);
                $extra = ['transfer' => true];
            }
        });
    }
    if (!$updated) send_json(['error' => 'المحادثة غير مصرح بها.'], 403);
    respond_then(fn() => send_json(['conversation' => chat_safe_customer($updated)] + $extra), function () use ($notify) {
        if ($notify) notify_company($notify[0], $notify[1]);
    });
}

function api_chat_attachment(): void {
    $id = (string)($_SERVER['HTTP_X_CHAT_CONVERSATION'] ?? '');
    rate_limit('chat_send', 60, 600, 'تم تجاوز عدد الرسائل مؤقتاً. حاول بعد قليل.', $id ?: 'new');
    $c = $id !== '' ? conv_get($id) : null;
    if (!$c || !chat_ensure_owner($c)) send_json(['error' => 'غير مصرح.'], 403);
    $f = uploaded_files('file')[0] ?? null;
    if (!$f) send_json(['error' => 'لم يتم إرفاق ملف.'], 400);
    if ($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE || $f['size'] > 10 * 1024 * 1024) send_json(['error' => 'حجم الملف يتجاوز 10MB.'], 400);
    if ($f['error'] !== UPLOAD_ERR_OK || !is_upload($f['tmp'])) send_json(['error' => 'تعذر رفع الملف.'], 400);
    $ok = in_array($f['type'], ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], true) && preg_match('/\.(jpe?g|png|webp|pdf)$/i', (string)$f['name']);
    if (!$ok) send_json(['error' => 'نوع الملف غير مسموح.'], 400);
    $ext = strtolower('.' . pathinfo((string)$f['name'], PATHINFO_EXTENSION));
    $sigExt = $ext === '.jpeg' ? '.jpg' : $ext;
    if (!brief_check_signature($f['tmp'], $sigExt)) send_json(['error' => 'نوع الملف غير مسموح.'], 400);
    $dir = UPLOADS_DIR . '/chat';
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    $uuid = sprintf('%s-%s-4%s-%s%s-%s', rand_hex(4), rand_hex(2), substr(rand_hex(2), 1), dechex(8 + random_int(0, 3)), substr(rand_hex(2), 1), rand_hex(6));
    $final = $uuid . $ext;
    if (!move_upload($f['tmp'], $dir . '/' . $final)) send_json(['error' => 'تعذر رفع الملف.'], 400);
    $updated = conv_mutate($c['id'], function (&$c) use ($final, $f) {
        chat_mark_customer($c, true);
        conv_add_message($c, ['sender' => 'customer', 'text' => 'مرفق', 'kind' => 'attachment',
            'attachment' => ['url' => '/images/chat/' . $final, 'name' => (string)$f['name'], 'type' => (string)$f['type'], 'size' => (int)$f['size']]]);
    });
    send_json(['conversation' => chat_safe_customer($updated)], 201);
}

/* ============================= الرد من فريق خدمة العملاء (لوحة التحكم) ============================= */
// الحضور يُحفظ في data/staff_presence.json (بديل الذاكرة في Node): الموظف «متصل» 90 ثانية بعد آخر طلب.

const STAFF_ONLINE_SEC = 90;
const CUSTOMER_ONLINE_SEC = 30;

function staff_name(array $u): string { return mb_slice(str_val($u['username'] ?? '') ?: 'موظف', 60); }
function can_view_chats(?array $u): bool { return $u && (!empty($u['isAdmin']) || !empty($u['permissions']['manageChat']) || !empty($u['permissions']['viewMessages']) || !empty($u['permissions']['replyMessages'])); }
function can_reply_chats(?array $u): bool { return $u && (!empty($u['isAdmin']) || !empty($u['permissions']['manageChat']) || !empty($u['permissions']['replyMessages'])); }

function staff_presence(): array { return obj(read_json('staff_presence.json', [])); }
function touch_staff(array $u): void {
    $p = staff_presence();
    $cur = $p[$u['id']] ?? null;
    if ($cur && time() - (int)$cur['at'] < 10 && ($cur['name'] ?? '') === staff_name($u)) return;
    with_lock('staff_presence', function () use ($u) {
        $p = staff_presence();
        foreach ($p as $id => $s) if (time() - (int)($s['at'] ?? 0) > 86400) unset($p[$id]);
        $p[$u['id']] = ['at' => time(), 'name' => staff_name($u), 'canReply' => can_reply_chats($u)];
        write_json('staff_presence.json', $p);
    });
}
function staff_online(?string $id): bool { if (!$id) return false; $s = staff_presence()[$id] ?? null; return $s && time() - (int)$s['at'] < STAFF_ONLINE_SEC; }
function online_staff(): array {
    $out = [];
    foreach (staff_presence() as $id => $s) if (time() - (int)($s['at'] ?? 0) < STAFF_ONLINE_SEC) $out[] = ['id' => (string)$id, 'name' => $s['name'], 'canReply' => !empty($s['canReply'])];
    return $out;
}
function staff_available(): bool { foreach (online_staff() as $s) if ($s['canReply']) return true; return false; }
function customer_online(array $c): bool { return !empty($c['customerSeenAt']) && time() - strtotime((string)$c['customerSeenAt']) < CUSTOMER_ONLINE_SEC; }

function require_chat_view(): array { $u = require_login(); if (!can_view_chats($u)) send_json(['error' => 'لا تملك صلاحية عرض المحادثات.'], 403); touch_staff($u); return $u; }
function require_chat_reply(): array { $u = require_login(); if (!can_reply_chats($u)) send_json(['error' => 'لا تملك صلاحية الرد على المحادثات.'], 403); touch_staff($u); return $u; }

function locked_by_other(array $c, array $u): bool { return !empty($c['humanAssignedTo']) && $c['humanAssignedTo'] !== $u['id'] && staff_online($c['humanAssignedTo']); }
function staff_meta(array $c, array $u): array {
    $id = $c['humanAssignedTo'] ?? null;
    return ['customerOnline' => customer_online($c), 'customerSeenAt' => $c['customerSeenAt'] ?? null,
        'assignee' => $id ? ['id' => $id, 'name' => ($c['humanAssignedName'] ?? '') ?: (staff_presence()[$id]['name'] ?? 'موظف'), 'online' => staff_online($id), 'me' => $id === $u['id']] : null,
        'canReply' => can_reply_chats($u) && !locked_by_other($c, $u)];
}
function staff_conv(array $c): array {
    $lastReply = chat_last_at($c, 'chat_is_reply');
    unset($c['accessTokenHash']);
    $c['messages'] = array_map(function ($m) use ($c, $lastReply) { $s = chat_receipt($c, $m, $lastReply); if ($s !== null) $m['status'] = $s; return $m; }, $c['messages']);
    return $c;
}
function mark_staff_read(array &$c): void {
    $last = chat_last_at($c, fn($m) => $m['sender'] === 'customer');
    if (!$last || (!empty($c['staffReadAt']) && $c['staffReadAt'] >= $last)) return;
    $c['staffReadAt'] = now_iso();
    $c['staffDeliveredAt'] = $c['staffReadAt'];
}
function chat_assign(array &$c, array $u): void {
    $prev = $c['humanAssignedTo'] ?? null;
    $c['mode'] = 'human';
    $c['humanAssignedTo'] = $u['id'];
    $c['humanAssignedName'] = staff_name($u);
    $c['assignedAt'] = now_iso();
    if ($prev !== $u['id']) conv_add_message($c, ['sender' => 'system', 'text' => 'انضم ' . staff_name($u) . ' من فريق خدمة العملاء إلى المحادثة.', 'kind' => 'staff_joined']);
}
function conv_or_404(string $id): array { $c = conv_get($id); if (!$c) send_json(['error' => 'المحادثة غير موجودة.'], 404); return $c; }

function api_chat_admin_list(): void {
    $me = require_chat_view();
    $all = with_lock('conversations', function () {
        $all = conv_all();
        $now = now_iso();
        $changed = false;
        foreach ($all as $i => $c) {
            $last = chat_last_at($c, fn($m) => $m['sender'] === 'customer');
            if ($last && (empty($c['staffDeliveredAt']) || $c['staffDeliveredAt'] < $last)) { $all[$i]['staffDeliveredAt'] = $now; $changed = true; }
        }
        if ($changed) write_json('conversations.json', $all);
        return $all;
    });
    usort($all, fn($a, $b) => strtotime((string)$b['updatedAt']) <=> strtotime((string)$a['updatedAt']));
    $convs = array_map(function ($c) use ($me) {
        $last = end($c['messages']) ?: null;
        return array_merge(['id' => $c['id'], 'status' => $c['status'], 'mode' => $c['mode'], 'serviceName' => $c['serviceName'] ?? '', 'createdAt' => $c['createdAt'], 'updatedAt' => $c['updatedAt'],
            'unreadForStaff' => (int)($c['unreadForStaff'] ?? 0), 'customer' => $c['customer'], 'aiSummary' => $c['aiSummary'] ?? '', 'transferAt' => $c['transferAt'] ?? null,
            'lastMessage' => $last ? ['sender' => $last['sender'], 'text' => mb_slice(str_val($last['text'] ?? ''), 120), 'createdAt' => $last['createdAt'], 'status' => chat_receipt($c, $last, chat_last_at($c, 'chat_is_reply'))] : null],
            staff_meta($c, $me));
    }, $all);
    send_json(['me' => ['id' => $me['id'], 'name' => staff_name($me), 'canReply' => can_reply_chats($me), 'isAdmin' => !empty($me['isAdmin'])], 'onlineStaff' => online_staff(), 'conversations' => $convs]);
}

function api_chat_admin_get(string $id): void {
    $me = require_chat_view();
    conv_or_404($id);
    $c = conv_mutate($id, function (&$c) use ($me) {
        if (!empty($c['unreadForStaff']) && (empty($c['humanAssignedTo']) || $c['humanAssignedTo'] === $me['id'])) $c['unreadForStaff'] = 0;
        mark_staff_read($c);
    }, false);
    send_json(array_merge(['conversation' => staff_conv($c)], staff_meta($c, $me)));
}

function api_chat_admin_claim(string $id): void {
    $me = require_chat_reply();
    $c = conv_or_404($id);
    if (locked_by_other($c, $me) && !(!empty(json_body()['force']) && !empty($me['isAdmin']))) {
        send_json(['error' => 'يرد على هذه المحادثة الآن: ' . (($c['humanAssignedName'] ?? '') ?: 'موظف آخر') . '.', 'assignee' => staff_meta($c, $me)['assignee']], 409);
    }
    $c = conv_mutate($id, function (&$c) use ($me) { chat_assign($c, $me); });
    send_json(array_merge(['conversation' => staff_conv($c)], staff_meta($c, $me)));
}

function api_chat_admin_release(string $id): void {
    $me = require_chat_reply();
    $c = conv_or_404($id);
    if (!empty($c['humanAssignedTo']) && $c['humanAssignedTo'] !== $me['id'] && empty($me['isAdmin']) && staff_online($c['humanAssignedTo'])) send_json(['error' => 'لا يمكنك تحرير محادثة يتولاها موظف آخر.'], 409);
    $toAi = (json_body()['toAi'] ?? null) === true;
    $c = conv_mutate($id, function (&$c) use ($toAi) {
        $c['humanAssignedTo'] = null;
        $c['humanAssignedName'] = '';
        if ($toAi) $c['mode'] = 'ai';
        conv_add_message($c, ['sender' => 'system', 'text' => $toAi ? 'عادت المحادثة إلى المساعد الذكي، ويمكنك طلب موظف في أي وقت.' : 'سيتابع معك أحد أعضاء فريق خدمة العملاء قريباً.', 'kind' => $toAi ? 'mode_change' : 'staff_left']);
    });
    send_json(array_merge(['conversation' => staff_conv($c)], staff_meta($c, $me)));
}

function api_chat_admin_reply(string $id): void {
    $me = require_chat_reply();
    rate_limit('chat_send', 60, 600, 'تم تجاوز عدد الرسائل مؤقتاً. حاول بعد قليل.', $id);
    $c = conv_or_404($id);
    $text = trim(str_val(json_body()['text'] ?? ''));
    if ($text === '' || mb_len($text) > 3000) send_json(['error' => 'الرسالة غير صالحة.'], 400);
    if (locked_by_other($c, $me)) send_json(['error' => 'يرد على هذه المحادثة الآن: ' . (($c['humanAssignedName'] ?? '') ?: 'موظف آخر') . '.', 'assignee' => staff_meta($c, $me)['assignee']], 409);
    $c = conv_mutate($id, function (&$c) use ($me, $text) {
        if (($c['humanAssignedTo'] ?? null) !== $me['id']) chat_assign($c, $me);
        mark_staff_read($c);
        conv_add_message($c, ['sender' => 'human', 'text' => $text, 'staffId' => $me['id'], 'staffName' => staff_name($me)]);
        $c['unreadForStaff'] = 0;
        $c['status'] = 'open';
    });
    send_json(array_merge(['conversation' => staff_conv($c)], staff_meta($c, $me)));
}

function api_chat_admin_close(string $id): void {
    $me = require_chat_reply();
    $c = conv_or_404($id);
    if (locked_by_other($c, $me) && empty($me['isAdmin'])) send_json(['error' => 'يتولى هذه المحادثة موظف آخر.'], 409);
    conv_mutate($id, function (&$c) { $c['status'] = 'closed'; $c['humanAssignedTo'] = null; $c['humanAssignedName'] = ''; });
    send_json(['ok' => true]);
}

function api_chat_admin_presence(): void { require_chat_view(); send_json(['ok' => true]); }

function api_chat_admin_analytics(): void {
    require_chat_view();
    $a = conv_all();
    $replies = 0; $ms = 0; $wa = 0; $calls = 0; $sr = 0;
    foreach ($a as $c) {
        $m = $c['messages'];
        for ($i = 1; $i < count($m); $i++) if ($m[$i - 1]['sender'] === 'customer' && $m[$i]['sender'] === 'ai') { $replies++; $ms += (int)round((js_time($m[$i]['createdAt']) - js_time($m[$i - 1]['createdAt']))); }
        foreach ($m as $x) { $k = $x['kind'] ?? ''; if ($k === 'whatsapp_click') $wa++; if ($k === 'call_click') $calls++; if ($k === 'service_request') $sr++; }
    }
    $since = (microtime(true) - 86400) * 1000;
    send_json(['total' => count($a), 'ai' => count(array_filter($a, fn($c) => $c['mode'] === 'ai' || array_filter($c['messages'], fn($m) => $m['sender'] === 'ai'))),
        'human' => count(array_filter($a, fn($c) => $c['mode'] === 'human')), 'transferred' => count(array_filter($a, fn($c) => !empty($c['transferAt']))),
        'open' => count(array_filter($a, fn($c) => $c['status'] === 'open')), 'unread' => array_sum(array_map(fn($c) => (int)($c['unreadForStaff'] ?? 0), $a)),
        'serviceRequests' => $sr, 'whatsappClicks' => $wa, 'callClicks' => $calls, 'avgResponseMs' => $replies ? (int)round($ms / $replies) : 0,
        'last24h' => count(array_filter($a, fn($c) => js_time($c['createdAt']) > $since))]);
}
// وقت ISO بالمللي ثانية
function js_time($iso): float {
    $s = (string)$iso;
    $ms = preg_match('/\.(\d{1,3})/', $s, $m) ? (int)str_pad($m[1], 3, '0') : 0;
    return (float)strtotime($s) * 1000 + $ms;
}
