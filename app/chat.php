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
    $msg['createdAt'] = now_iso();
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
        'agent' => !empty($c['humanAssignedTo']) ? ['name' => ($c['humanAssignedName'] ?? '') ?: 'فريق خدمة العملاء', 'online' => false] : null,
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

function chat_handoff(array &$c, string $reason, string $customerText): void {
    $c['mode'] = 'human';
    $c['transferAt'] = now_iso();
    $c['handoff'] = ['at' => $c['transferAt'], 'reason' => $reason, 'status' => 'sent', 'summary' => '', 'request' => $customerText];
    chat_send_unavailable($c);
    $rows = chat_customer_rows($c);
    $rows[] = ['طلب العميل', $customerText];
    $why = ['human' => 'طلب العميل التحدث مع موظف', 'failure' => 'تعذر الرد الآلي مؤقتاً'][$reason] ?? 'تحويل إلى موظف';
    $email = $c['customer']['email'] ?? '';
    $name = ($c['customer']['name'] ?? '') ?: 'زائر';
    register_shutdown_function(fn() => notify_company('chat.transfer', ['vars' => ['name' => $name], 'title' => 'طلب التحدث مع موظف — ' . $why, 'rows' => $rows, 'linkLabel' => 'فتح مركز المحادثات', 'replyTo' => $email ?: null]));
}

function chat_maybe_remind_unavailable(array &$c): void {
    if (($c['mode'] ?? '') !== 'human') return;
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
    $extra = str_replace("\r\n", "\n", trim(str_val($settings['welcomeMessage'] ?? '')));
    if ($extra === CHAT_LEGACY_WELCOME) $extra = '';
    conv_add_message($c, ['sender' => 'ai', 'text' => $extra !== '' ? $greeting . "\n" . $extra : $greeting, 'kind' => 'welcome']);
    with_lock('conversations', function () use ($c) {
        $all = conv_all();
        array_unshift($all, $c);
        write_json('conversations.json', $all);
    });
    record_customer(['name' => $name, 'phone' => $phone, 'email' => $email, 'source' => 'chat', 'ref' => ['type' => 'chat', 'id' => $c['id'], 'label' => 'محادثة', 'at' => $c['createdAt']]]);
    respond_then(fn() => send_json(['conversation' => chat_safe_customer($c), 'accessToken' => $token, 'settings' => public_chat_settings()], 201), function () use ($customer) {
        notify_company('chat.new', ['vars' => ['name' => $customer['name']], 'title' => 'محادثة جديدة',
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
            $notify = ['requests.chatService', ['vars' => ['name' => $name], 'title' => 'طلب خدمة جديد من المحادثة', 'rows' => $rows, 'linkLabel' => 'فتح مركز المحادثات', 'replyTo' => $email]];
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
        $notify = ['chat.message', ['vars' => ['name' => $name], 'title' => 'رسالة جديدة من زائر', 'rows' => chat_customer_rows($c), 'body' => $msg, 'linkLabel' => 'فتح مركز المحادثات', 'replyTo' => $email]];
        if ($auto && ($c['mode'] ?? '') !== 'human') { $addAuto(); return; }
        if (($c['mode'] ?? '') === 'human') { chat_maybe_remind_unavailable($c); $extra = ['human' => true]; return; }
        if ((get_settings()['chat']['aiEnabled'] ?? null) === false) { $extra = ['human' => true]; return; }
        // لا يوجد وكيل ذكاء اصطناعي مفعّل في هذه النسخة بعد: الردود التقليدية
        conv_add_message($c, ['sender' => 'ai', 'text' => chat_rule_reply($c, $msg), 'kind' => 'message']);
    });
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
    if ($f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp'])) send_json(['error' => 'تعذر رفع الملف.'], 400);
    $ok = in_array($f['type'], ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], true) && preg_match('/\.(jpe?g|png|webp|pdf)$/i', (string)$f['name']);
    if (!$ok) send_json(['error' => 'نوع الملف غير مسموح.'], 400);
    $ext = strtolower('.' . pathinfo((string)$f['name'], PATHINFO_EXTENSION));
    $sigExt = $ext === '.jpeg' ? '.jpg' : $ext;
    if (!brief_check_signature($f['tmp'], $sigExt)) send_json(['error' => 'نوع الملف غير مسموح.'], 400);
    $dir = UPLOADS_DIR . '/chat';
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    $uuid = sprintf('%s-%s-4%s-%s%s-%s', rand_hex(4), rand_hex(2), substr(rand_hex(2), 1), dechex(8 + random_int(0, 3)), substr(rand_hex(2), 1), rand_hex(6));
    $final = $uuid . $ext;
    if (!move_uploaded_file($f['tmp'], $dir . '/' . $final)) send_json(['error' => 'تعذر رفع الملف.'], 400);
    $updated = conv_mutate($c['id'], function (&$c) use ($final, $f) {
        chat_mark_customer($c, true);
        conv_add_message($c, ['sender' => 'customer', 'text' => 'مرفق', 'kind' => 'attachment',
            'attachment' => ['url' => '/images/chat/' . $final, 'name' => (string)$f['name'], 'type' => (string)$f['type'], 'size' => (int)$f['size']]]);
    });
    send_json(['conversation' => chat_safe_customer($updated)], 201);
}
