<?php
// app/briefs.php
// «بريف المشروع»: نفس lib/briefs.js — يُحفظ في data/briefs.json والمرفقات في data/brief-files،
// ويُعرض كتقرير مرتب قابل للطباعة عبر رابط خاص (يُحفظ hash الرمز فقط).

declare(strict_types=1);

const BRIEF_OPTIONS = [
    'preferredContact' => ['phone' => 'اتصال', 'whatsapp' => 'واتساب', 'email' => 'بريد إلكتروني'],
    'projectType' => [
        'new_build' => 'بناء جديد', 'villa' => 'فيلا', 'residential_building' => 'عمارة سكنية', 'commercial' => 'مبنى تجاري',
        'office' => 'مكتب', 'warehouse' => 'مستودع', 'industrial' => 'مشروع صناعي', 'renovation' => 'ترميم', 'finishing' => 'تشطيب',
        'redevelopment' => 'تطوير / إعادة تأهيل', 'other' => 'مشروع آخر',
    ],
    'siteStatus' => [
        'land' => 'أرض', 'under_construction' => 'تحت الإنشاء', 'existing' => 'مبنى قائم',
        'needs_renovation' => 'يحتاج ترميم', 'needs_finishing' => 'يحتاج تشطيب',
    ],
    'budget' => [
        'lt100k' => 'أقل من 100,000 ريال', '100k_250k' => '100,000 – 250,000 ريال', '250k_500k' => '250,000 – 500,000 ريال',
        '500k_1m' => '500,000 – 1,000,000 ريال', 'gt1m' => 'أكثر من 1,000,000 ريال', 'specific' => 'ميزانية محددة', 'undecided' => 'لم أحدد الميزانية بعد',
    ],
    'startWhen' => ['now' => 'فوراً', 'month' => 'خلال شهر', '1_3m' => 'خلال 1–3 أشهر', '3_6m' => 'خلال 3–6 أشهر', 'later' => 'لاحقاً'],
    'hasDeadline' => ['yes' => 'نعم', 'no' => 'لا'],
    'scope' => [
        'design' => 'تصميم هندسي', 'permits' => 'استخراج / متابعة التراخيص', 'structural' => 'أعمال إنشائية', 'electrical' => 'أعمال كهرباء',
        'plumbing' => 'أعمال سباكة', 'hvac' => 'أعمال تكييف', 'interior_finishing' => 'تشطيبات داخلية', 'facades' => 'واجهات',
        'external' => 'أعمال خارجية', 'renovation' => 'ترميم', 'turnkey' => 'تسليم مفتاح', 'project_management' => 'إدارة المشروع', 'other' => 'أخرى',
    ],
    'fileCategory' => [
        'drawings' => 'المخططات الهندسية', 'land_plan' => 'مخطط الأرض', 'site_photos' => 'صور الموقع',
        'designs' => 'التصاميم', 'pdf' => 'ملف PDF', 'other' => 'مستندات أخرى',
    ],
    'status' => [
        'new' => 'جديد', 'reviewing' => 'قيد المراجعة', 'needs_info' => 'بحاجة لمعلومات', 'studied' => 'تمت دراسة الطلب', 'contacted' => 'تم التواصل',
        'quoted' => 'عرض سعر', 'in_progress' => 'قيد التنفيذ', 'completed' => 'مكتمل', 'closed' => 'مغلق',
    ],
];
const BRIEF_LEGACY = [
    'clientType' => ['individual' => 'فرد', 'company' => 'شركة / مؤسسة', 'government' => 'جهة حكومية'],
    'projectType' => ['government' => 'مشروع حكومي'],
    'scope' => ['architectural_design' => 'تصميم معماري', 'structural_design' => 'تصميم إنشائي', 'skeleton' => 'تنفيذ العظم', 'finishing' => 'تشطيبات', 'supervision' => 'إشراف هندسي'],
    'siteStatus' => ['empty_land' => 'أرض فضاء', 'existing_building' => 'مبنى قائم'],
    'plans' => ['approved' => 'مخططات معتمدة', 'preliminary' => 'مخططات مبدئية', 'none' => 'لا توجد مخططات'],
    'permit' => ['yes' => 'متوفرة', 'in_progress' => 'قيد الإجراء', 'no' => 'غير متوفرة'],
    'budget' => ['lt500k' => 'أقل من 500 ألف ريال', '1m_3m' => '1 – 3 مليون ريال', '3m_10m' => '3 – 10 مليون ريال', 'gt10m' => 'أكثر من 10 مليون ريال'],
    'finishLevel' => ['economy' => 'اقتصادي', 'standard' => 'متوسط', 'luxury' => 'فاخر'],
    'status' => ['won' => 'تم التعاقد'],
];
const BRIEF_FILE_TYPES = [
    'application/pdf' => '.pdf', 'image/jpeg' => '.jpg', 'image/png' => '.png', 'image/webp' => '.webp',
    'image/vnd.dwg' => '.dwg', 'application/acad' => '.dwg', 'application/x-dwg' => '.dwg', 'image/x-dwg' => '.dwg',
];
const BRIEF_MAX_FILES = 10;
const BRIEF_MAX_FILE = 15 * 1024 * 1024;
const BRIEF_MAX_TOTAL = 60 * 1024 * 1024;
const BRIEF_NOT_FOUND = '<!DOCTYPE html><html lang="ar" dir="rtl"><meta charset="UTF-8"><title>غير موجود</title><body style="font-family:Tahoma,Arial;text-align:center;padding:60px">الرابط غير صالح أو انتهت صلاحيته.</body></html>';

function brief_files_dir(): string { return DATA_DIR . '/brief-files'; }

function briefs_all(): array {
    $list = read_json('briefs.json', []);
    if (!is_list($list)) return [];
    foreach ($list as &$b) if (($b['status'] ?? '') === 'won') $b['status'] = 'in_progress';
    return $list;
}

/* ---------- التحقق ---------- */
function b_text($v, int $max): string { return mb_slice(preg_replace('/\s+/u', ' ', trim(str_val($v))), $max); }
function b_long($v, int $max): string { return mb_slice(trim(str_replace("\r\n", "\n", str_val($v))), $max); }
// null = فارغ، false = قيمة غير صحيحة
function b_num($v, float $min, float $max) {
    $s = trim(ar_digits(str_val($v)));
    if ($s === '') return null;
    $s = str_replace(',', '', $s);
    if (!is_numeric($s)) return false;
    $n = (float)$s;
    if ($n < $min || $n > $max) return false;
    $r = round($n * 100) / 100;
    return $r == (int)$r ? (int)$r : $r;
}
function b_pick(string $group, $v): string { $v = str_val($v); return array_key_exists($v, BRIEF_OPTIONS[$group]) ? $v : ''; }
function b_iso_date($v): string {
    $s = str_val($v);
    if (!preg_match('/^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/', $s, $m)) return '';
    return checkdate((int)$m[2], (int)$m[3], (int)$m[1]) ? $s : '';
}

function brief_validate($body): array {
    $b = is_array($body) ? $body : [];
    $errors = [];
    $client = [
        'name' => b_text($b['name'] ?? '', 100),
        'phone' => preg_replace('/[\s()-]/', '', ar_digits(str_val($b['phone'] ?? ''))),
        'email' => strtolower(b_text($b['email'] ?? '', 254)),
        'city' => b_text($b['city'] ?? '', 80),
        'district' => b_text($b['district'] ?? '', 120),
        'preferredContact' => b_pick('preferredContact', $b['preferredContact'] ?? '') ?: 'phone',
    ];
    if (mb_len($client['name']) < 2) $errors[] = 'يرجى إدخال الاسم الكامل.';
    if (!preg_match('/^\+[1-9][0-9]{7,14}$/', $client['phone'])) $errors[] = 'يرجى إدخال رقم جوال صحيح.';
    if ($client['email'] !== '' && !preg_match('/^[^\s@]+@[^\s@]+\.[^\s@]+$/', $client['email'])) $errors[] = 'البريد الإلكتروني غير صحيح.';
    if ($client['preferredContact'] === 'email' && $client['email'] === '') $errors[] = 'أدخل بريدك الإلكتروني أو اختر وسيلة تواصل أخرى.';
    if (mb_len($client['city']) < 2) $errors[] = 'يرجى إدخال المدينة.';

    $scope = [];
    if (is_list($b['scope'] ?? null)) foreach ($b['scope'] as $x) { $v = b_pick('scope', $x); if ($v !== '' && !in_array($v, $scope, true)) $scope[] = $v; }
    $project = [
        'projectType' => b_pick('projectType', $b['projectType'] ?? ''),
        'projectName' => b_text($b['projectName'] ?? '', 150),
        'description' => b_long($b['description'] ?? '', 5000),
        'location' => b_text($b['location'] ?? '', 250),
        'siteStatus' => b_pick('siteStatus', $b['siteStatus'] ?? ''),
        'landArea' => b_num($b['landArea'] ?? null, 1, 100000000),
        'builtArea' => b_num($b['builtArea'] ?? null, 1, 100000000),
        'floors' => b_num($b['floors'] ?? null, 0, 200),
        'units' => b_num($b['units'] ?? null, 0, 100000),
        'requiredArea' => b_num($b['requiredArea'] ?? null, 1, 100000000),
        'budget' => b_pick('budget', $b['budget'] ?? ''),
        'budgetAmount' => null,
        'startWhen' => b_pick('startWhen', $b['startWhen'] ?? ''),
        'targetDate' => b_iso_date($b['targetDate'] ?? ''),
        'hasDeadline' => b_pick('hasDeadline', $b['hasDeadline'] ?? ''),
        'scope' => $scope,
        'scopeOther' => in_array('other', $scope, true) ? b_text($b['scopeOther'] ?? '', 200) : '',
        'specialRequirements' => b_long($b['specialRequirements'] ?? '', 5000),
    ];
    if ($project['projectType'] === '') $errors[] = 'يرجى اختيار نوع المشروع.';
    if (mb_len($project['description']) < 10) $errors[] = 'يرجى كتابة وصف المشروع بالتفصيل.';
    if (mb_len($project['location']) < 2) $errors[] = 'يرجى إدخال موقع المشروع.';
    foreach (['landArea', 'builtArea', 'floors', 'units', 'requiredArea'] as $k) {
        if ($project[$k] === false) $errors[] = 'قيمة رقمية غير صحيحة في مساحة المشروع.';
    }
    if ($project['budget'] === 'specific') {
        $amt = b_num($b['budgetAmount'] ?? null, 1, 100000000000);
        $project['budgetAmount'] = $amt === false ? null : $amt;
        if ($amt === null || $amt === false) $errors[] = 'يرجى إدخال مبلغ الميزانية المحددة بالريال.';
    }
    if (($b['consent'] ?? null) !== true) $errors[] = 'يرجى الموافقة على استخدام بياناتك للتواصل معك بخصوص الطلب.';
    return $errors ? ['errors' => array_values(array_unique($errors))] : ['client' => $client, 'project' => $project];
}

/* ---------- المرفقات ---------- */

function brief_clean_name($name): string {
    $base = trim(preg_replace('/\s+/u', ' ', preg_replace('/[\x00-\x1f\x7f<>:"\/\\\\|?*]+/u', ' ', str_val($name) ?: 'ملف')));
    $base = $base ?: 'ملف';
    return mb_len($base) > 120 ? mb_substr($base, -120, null, 'UTF-8') : $base;
}

function brief_check_signature(string $path, string $ext): bool {
    $head = (string)@file_get_contents($path, false, null, 0, 16);
    if (strlen($head) < 4) return false;
    return match ($ext) {
        '.pdf' => substr($head, 0, 5) === '%PDF-',
        '.png' => substr($head, 0, 8) === "\x89PNG\r\n\x1a\n",
        '.jpg' => substr($head, 0, 3) === "\xFF\xD8\xFF",
        '.webp' => substr($head, 0, 4) === 'RIFF' && substr($head, 8, 4) === 'WEBP',
        '.dwg' => substr($head, 0, 4) === 'AC10',
        default => false,
    };
}

// يجمع ملفات files[] المرفوعة بترتيبها
function uploaded_files(string $field): array {
    $f = $_FILES[$field] ?? null;
    if (!$f) return [];
    $out = [];
    if (is_array($f['name'])) {
        foreach ($f['name'] as $i => $n) $out[] = ['name' => $n, 'type' => $f['type'][$i], 'tmp' => $f['tmp_name'][$i], 'error' => $f['error'][$i], 'size' => $f['size'][$i]];
    } else {
        $out[] = ['name' => $f['name'], 'type' => $f['type'], 'tmp' => $f['tmp_name'], 'error' => $f['error'], 'size' => $f['size']];
    }
    return array_values(array_filter($out, fn($x) => $x['error'] !== UPLOAD_ERR_NO_FILE));
}

function brief_store_files(array $files, $categories): array {
    if (count($files) > BRIEF_MAX_FILES) throw new RuntimeException('الحد الأقصى ' . BRIEF_MAX_FILES . ' ملفات.');
    $total = 0;
    $prepared = [];
    foreach ($files as $f) {
        if ($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE || $f['size'] > BRIEF_MAX_FILE) throw new RuntimeException('حجم أحد الملفات أكبر من 15 ميجابايت.');
        if ($f['error'] !== UPLOAD_ERR_OK || !is_upload($f['tmp'])) throw new RuntimeException('تعذر رفع الملفات.');
        $type = (string)$f['type'];
        $byName = preg_match('/\.(pdf|jpe?g|png|webp|dwg)$/i', (string)$f['name'], $m) ? strtolower('.' . $m[1]) : '';
        if (!isset(BRIEF_FILE_TYPES[$type]) || $byName === '') {
            throw new RuntimeException('نوع الملف "' . str_val($f['name']) . '" غير مسموح. المسموح: PDF, JPG, PNG, WEBP, DWG.');
        }
        $ext = (BRIEF_FILE_TYPES[$type] === '.dwg' || $byName === '.dwg') ? '.dwg' : BRIEF_FILE_TYPES[$type];
        if (!$f['size']) throw new RuntimeException('الملف "' . brief_clean_name($f['name']) . '" فارغ.');
        if (!brief_check_signature($f['tmp'], $ext)) throw new RuntimeException('الملف "' . brief_clean_name($f['name']) . '" تالف أو لا يطابق امتداده.');
        $total += (int)$f['size'];
        $prepared[] = [$f, $ext];
    }
    if ($total > BRIEF_MAX_TOTAL) throw new RuntimeException('الحجم الإجمالي للملفات أكبر من 60 ميجابايت.');
    $dir = brief_files_dir();
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    $out = [];
    $cats = is_list($categories) ? $categories : [];
    foreach ($prepared as $i => [$f, $ext]) {
        $id = rand_hex(12);
        if (!move_upload($f['tmp'], $dir . '/' . $id . $ext)) {
            foreach ($out as $o) @unlink($dir . '/' . $o['id'] . $o['ext']);
            throw new RuntimeException('تعذر رفع الملفات.');
        }
        @chmod($dir . '/' . $id . $ext, 0600);
        $out[] = [
            'id' => $id, 'ext' => $ext, 'name' => brief_clean_name($f['name']),
            'type' => $ext === '.dwg' ? 'image/vnd.dwg' : (string)$f['type'], 'size' => (int)$f['size'],
            'category' => b_pick('fileCategory', $cats[$i] ?? '') ?: ($ext === '.pdf' ? 'pdf' : 'other'),
        ];
    }
    return $out;
}

function brief_token_hash(string $token): string { return hash('sha256', $token); }

function brief_get(string $id): ?array {
    foreach (briefs_all() as $b) if (($b['id'] ?? '') === $id) return $b;
    return null;
}

function brief_check_token(?array $b, $token): bool {
    $token = str_val($token);
    if (!$b || empty($b['tokenHash']) || $token === '' || strlen($token) > 200) return false;
    return hash_equals((string)$b['tokenHash'], brief_token_hash($token));
}

/* ---------- POST /api/briefs ---------- */

function api_briefs_create(): void {
    rate_limit('brief', 20, 30 * 60, 'تم تجاوز عدد البريفات المرسلة مؤقتاً. حاول لاحقاً.');
    $isMultipart = str_starts_with(strtolower((string)($_SERVER['CONTENT_TYPE'] ?? '')), 'multipart/form-data');
    if ($isMultipart) {
        if (empty($_POST) && empty($_FILES) && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) {
            send_json(['error' => 'حجم الملفات أكبر من المسموح في الاستضافة.'], 400);
        }
        $body = json_decode(str_val($_POST['data'] ?? '{}'), true);
        if (!is_array($body)) send_json(['error' => 'بيانات الطلب غير صالحة.'], 400);
    } else {
        $body = json_body();
    }
    // حقل مخفي لا يعبّئه إلا برامج السبام
    if (!empty($body['website'])) send_json(['ok' => true, 'ref' => 'PR-0', 'reportUrl' => null], 201);
    $result = brief_validate($body);
    if (isset($result['errors'])) send_json(['error' => $result['errors'][0], 'errors' => $result['errors']], 400);
    try {
        $files = $isMultipart ? brief_store_files(uploaded_files('files'), $body['categories'] ?? []) : [];
    } catch (RuntimeException $e) {
        send_json(['error' => $e->getMessage()], 400);
    }
    $token = b64url(random_bytes(32));
    $now = now_iso();
    $brief = [
        'id' => 'br_' . rand_hex(8),
        'ref' => 'PR-' . gmdate('Ymd') . '-' . strtoupper(rand_hex(2)),
        'tokenHash' => brief_token_hash($token),
        'client' => $result['client'], 'project' => $result['project'],
        'files' => $files, 'status' => 'new', 'notes' => '',
        'createdAt' => $now, 'updatedAt' => $now, 'ip' => client_ip(),
    ];
    try {
        with_lock('briefs', function () use ($brief) {
            $list = briefs_all();
            array_unshift($list, $brief);
            foreach (array_slice($list, 5000) as $old) foreach ($old['files'] ?? [] as $f) @unlink(brief_files_dir() . '/' . $f['id'] . $f['ext']);
            write_json('briefs.json', array_slice($list, 0, 5000));
        });
    } catch (Throwable $e) {
        foreach ($files as $f) @unlink(brief_files_dir() . '/' . $f['id'] . $f['ext']);
        log_error('تعذر حفظ طلب المشروع: ' . $e->getMessage());
        send_json(['error' => 'تعذر حفظ الطلب. حاول مرة أخرى.'], 500);
    }
    record_customer(['name' => $brief['client']['name'], 'phone' => $brief['client']['phone'], 'email' => $brief['client']['email'], 'source' => 'brief',
        'ref' => ['type' => 'brief', 'id' => $brief['id'], 'label' => 'طلب مشروع ' . $brief['ref'] . ': ' . brief_label('projectType', $brief['project']['projectType']), 'at' => $brief['createdAt']]]);
    $reportPath = '/brief/' . $brief['id'] . '?t=' . rawurlencode($token);
    respond_then(fn() => send_json(['ok' => true, 'ref' => $brief['ref'], 'reportUrl' => $reportPath], 201), function () use ($brief, $reportPath) {
        $base = notify_base_url();
        $company = brief_render_email($brief, $base ? $base . '/brief/' . $brief['id'] : null, true);
        notify_company('requests.brief', ['vars' => ['name' => $brief['client']['name'], 'phone' => $brief['client']['phone'], 'email' => $brief['client']['email'], 'ref' => $brief['ref'], 'project' => brief_label('projectType', $brief['project']['projectType'])],
            'subject' => $company['subject'], 'html' => $company['html'], 'text' => $company['text'], 'replyTo' => $brief['client']['email'] ?: null]);
        if (!mail_configured() || $brief['client']['email'] === '') return;
        $client = brief_render_email($brief, $base ? $base . $reportPath : null, false);
        $replyTo = (notify_config()['sender']['replyTo'] ?? '') ?: (effective_recipients()[0] ?? null);
        try { send_mail_or_throw([$brief['client']['email']], $client['subject'], $client['text'], $client['html'], $replyTo); }
        catch (Throwable $e) { log_error('فشل إرسال نسخة طلب المشروع ' . $brief['ref'] . ' للعميل: ' . $e->getMessage()); }
    });
}

/* ---------- التقرير ---------- */

function brief_label(string $group, $v): string {
    $v = str_val($v);
    if ($v === '') return '';
    return BRIEF_OPTIONS[$group][$v] ?? BRIEF_LEGACY[$group][$v] ?? '';
}
function fmt_number($n, string $unit = ''): string {
    if ($n === null || $n === '') return '';
    $f = (float)$n;
    $s = floor($f) == $f ? number_format($f, 0, '.', ',') : rtrim(rtrim(number_format($f, 3, '.', ','), '0'), '.');
    return $s . ($unit ? ' ' . $unit : '');
}
function fmt_size(int $bytes): string {
    return $bytes >= 1048576 ? sprintf('%.1f MB', $bytes / 1048576) : max(1, (int)round($bytes / 1024)) . ' KB';
}
const AR_MONTHS = [1 => 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
function fmt_date($iso): string {
    try {
        $d = new DateTime(str_val($iso));
        $d->setTimezone(new DateTimeZone('Asia/Riyadh'));
        $hour = (int)$d->format('G');
        $h12 = $hour % 12 ?: 12;
        return (int)$d->format('j') . ' ' . AR_MONTHS[(int)$d->format('n')] . ' ' . $d->format('Y') . ' في ' . $h12 . ':' . $d->format('i') . ' ' . ($hour < 12 ? 'ص' : 'م');
    } catch (Throwable $e) { return str_val($iso); }
}
function fmt_day($ymd): string {
    $ymd = str_val($ymd);
    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $ymd, $m)) return $ymd;
    return (int)$m[3] . ' ' . AR_MONTHS[(int)$m[2]] . ' ' . $m[1];
}
function fmt_month($ym): string {
    $ym = str_val($ym);
    if (!preg_match('/^(\d{4})-(\d{2})/', $ym, $m)) return '';
    return AR_MONTHS[(int)$m[2]] . ' ' . $m[1];
}
function brief_budget_text(array $p): string {
    if (($p['budget'] ?? '') === 'specific' && ($p['budgetAmount'] ?? null) !== null) return fmt_number($p['budgetAmount'], 'ريال');
    return brief_label('budget', $p['budget'] ?? '') ?: 'لم تُحدَّد';
}
function brief_scope_text(array $p): string {
    $out = [];
    foreach ($p['scope'] ?? [] as $s) $out[] = ($s === 'other' && !empty($p['scopeOther'])) ? 'أخرى: ' . $p['scopeOther'] : brief_label('scope', $s);
    return implode('، ', $out);
}

function brief_sections(array $b): array {
    $c = $b['client'] ?? [];
    $p = $b['project'] ?? [];
    return [
        ['معلومات العميل', [
            ['الاسم الكامل', $c['name'] ?? ''], ['الصفة', brief_label('clientType', $c['clientType'] ?? '')], ['الجهة', $c['organization'] ?? ''],
            ['رقم الجوال', $c['phone'] ?? '', 'ltr'], ['البريد الإلكتروني', $c['email'] ?? '', 'ltr'],
            ['المدينة', ($c['city'] ?? '') ?: ($p['city'] ?? '')], ['الحي', ($c['district'] ?? '') ?: ($p['district'] ?? '')],
            ['طريقة التواصل المفضلة', brief_label('preferredContact', ($c['preferredContact'] ?? '') ?: ($p['preferredContact'] ?? ''))],
        ]],
        ['تفاصيل المشروع', [
            ['نوع المشروع', brief_label('projectType', $p['projectType'] ?? '')], ['اسم المشروع', $p['projectName'] ?? ''],
            ['موقع المشروع', $p['location'] ?? ''], ['حالة المشروع', brief_label('siteStatus', $p['siteStatus'] ?? '')],
            ['المخططات', brief_label('plans', $p['plans'] ?? '')], ['رخصة البناء', brief_label('permit', $p['permit'] ?? '')],
        ]],
        ['مساحة المشروع', [
            ['مساحة الأرض', fmt_number($p['landArea'] ?? null, 'م²')],
            ['المساحة المبنية التقريبية', fmt_number(($p['builtArea'] ?? null) !== null ? $p['builtArea'] : ($p['buildArea'] ?? null), 'م²')],
            ['عدد الأدوار', fmt_number($p['floors'] ?? null)], ['عدد الوحدات / الغرف', fmt_number($p['units'] ?? null)],
            ['مساحة البناء المطلوبة', fmt_number($p['requiredArea'] ?? null, 'م²')],
        ]],
        ['الميزانية', [['الميزانية التقديرية', brief_budget_text($p)], ['مستوى التشطيب', brief_label('finishLevel', $p['finishLevel'] ?? '')]]],
        ['الجدول الزمني', [
            ['موعد بدء المشروع', brief_label('startWhen', $p['startWhen'] ?? '') ?: fmt_month($p['startDate'] ?? '')],
            ['الموعد المستهدف للإنجاز', !empty($p['targetDate']) ? fmt_day($p['targetDate']) : ''],
            ['يوجد موعد نهائي محدد', brief_label('hasDeadline', $p['hasDeadline'] ?? '')],
            ['المدة المستهدفة', ($p['duration'] ?? null) !== null ? fmt_number($p['duration']) . ' شهر' : ''],
        ]],
        ['نطاق العمل المطلوب', [['الأعمال المطلوبة', brief_scope_text($p)]]],
    ];
}
function brief_long_sections(array $b): array {
    $p = $b['project'] ?? [];
    return array_values(array_filter([['وصف المشروع', $p['description'] ?? ''], ['متطلبات أو مواصفات خاصة', $p['specialRequirements'] ?? '']], fn($x) => str_val($x[1]) !== ''));
}
function brief_table_rows(array $items): string {
    $out = '';
    foreach ($items as $it) {
        if (str_val($it[1]) === '') continue;
        $out .= '<tr><th>' . h($it[0]) . '</th><td' . (!empty($it[2]) ? ' dir="' . $it[2] . '"' : '') . '>' . h($it[1]) . '</td></tr>';
    }
    return $out;
}
function brief_file_url(array $b, array $f, string $token): string {
    return '/brief/' . rawurlencode($b['id']) . '/files/' . rawurlencode($f['id']) . ($token !== '' ? '?t=' . rawurlencode($token) : '');
}

function brief_render_report(array $b, string $nonce, string $token, bool $staff = false): string {
    $rows = '';
    foreach (brief_sections($b) as [$title, $items]) { $body = brief_table_rows($items); if ($body) $rows .= '<section><h2>' . h($title) . '</h2><table>' . $body . '</table></section>'; }
    $desc = '';
    foreach (brief_long_sections($b) as [$title, $v]) $desc .= '<section><h2>' . h($title) . '</h2><div class="desc">' . nl2br(h($v), false) . '</div></section>';
    $files = '';
    if (!empty($b['files'])) {
        $files = '<section><h2>الملفات والمخططات</h2><table>';
        foreach ($b['files'] as $f) $files .= '<tr><th>' . h(brief_label('fileCategory', $f['category'] ?? '')) . '</th><td><a href="' . h(brief_file_url($b, $f, $token)) . '" target="_blank" rel="noopener">' . h($f['name']) . '</a> <span class="size" dir="ltr">' . h(fmt_size((int)$f['size'])) . '</span></td></tr>';
        $files .= '</table></section>';
    }
    $staffBlock = '';
    if ($staff) {
        $staffBlock = '<section class="staff"><h2>متابعة داخلية</h2><table>' . brief_table_rows([['حالة الطلب', brief_label('status', $b['status'] ?? '')], ['آخر تحديث', fmt_date($b['updatedAt'] ?? '')]])
            . (!empty($b['notes']) ? '<tr><th>الملاحظات</th><td>' . nl2br(h($b['notes']), false) . '</td></tr>' : '') . '</table></section>';
    }
    $css = file_get_contents(__DIR__ . '/brief-report.css');
    return '<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow"><title>طلب مشروع ' . h($b['ref']) . ' — ' . h(COMPANY) . '</title>
<style>' . $css . '</style></head><body>
<div class="page">
<header><div><strong>' . h(COMPANY) . '</strong><span>طلب مشروع مقاولات</span></div>
<div class="meta">رقم الطلب<b dir="ltr">' . h($b['ref']) . '</b>' . h(fmt_date($b['createdAt'])) . '</div></header>
<main><h1>بريف المشروع</h1><p class="lead">هذا التقرير يلخّص البيانات التي أرسلها العميل عبر نموذج طلب المشروع في موقع ' . h(COMPANY) . '.</p>
' . $rows . $desc . $files . $staffBlock . '</main>
<footer>' . h(COMPANY) . ' — تم إنشاء هذا التقرير آلياً. للاستفسار عن الطلب يرجى ذكر الرقم ' . h($b['ref']) . '.</footer>
</div>
<div class="actions"><button type="button" id="printBtn">طباعة / حفظ PDF</button></div>
<script nonce="' . $nonce . '">document.getElementById(\'printBtn\').addEventListener(\'click\',function(){window.print()});</script>
</body></html>';
}

function brief_render_email(array $b, ?string $link, bool $forCompany): array {
    $cell = 'padding:8px 10px;border-bottom:1px solid #eee9df;text-align:right;vertical-align:top;font-size:14px';
    $h3 = 'font-size:15px;color:#1E2A32;margin:20px 0 6px;border-bottom:2px solid #C9B895;padding-bottom:4px';
    $tables = '';
    $plain = [];
    foreach (brief_sections($b) as [$title, $items]) {
        $body = '';
        $lines = [];
        foreach ($items as $it) {
            if (str_val($it[1]) === '') continue;
            $body .= '<tr><td style="' . $cell . ';width:36%;color:#5d6066;background:#faf8f4">' . h($it[0]) . '</td><td style="' . $cell . '">' . h($it[1]) . '</td></tr>';
            $lines[] = '- ' . $it[0] . ': ' . str_val($it[1]);
        }
        if ($body) $tables .= '<h3 style="' . $h3 . '">' . h($title) . '</h3><table style="width:100%;border-collapse:collapse">' . $body . '</table>';
        if ($lines) $plain[] = $title . "\n" . implode("\n", $lines);
    }
    $desc = '';
    $extra = '';
    foreach (brief_long_sections($b) as [$title, $v]) {
        $desc .= '<h3 style="' . $h3 . '">' . h($title) . '</h3><p style="background:#faf8f4;padding:10px 12px;border-radius:8px;font-size:14px">' . nl2br(h($v), false) . '</p>';
        $extra .= "\n\n" . $title . ":\n" . $v;
    }
    $files = '';
    $fileLines = '';
    if (!empty($b['files'])) {
        $li = '';
        $fl = [];
        foreach ($b['files'] as $f) { $li .= '<li>' . h(brief_label('fileCategory', $f['category'] ?? '')) . ': ' . h($f['name']) . '</li>'; $fl[] = '- ' . brief_label('fileCategory', $f['category'] ?? '') . ': ' . $f['name']; }
        $files = '<h3 style="' . $h3 . '">الملفات والمخططات</h3><ul style="font-size:14px;padding-right:18px">' . $li . '</ul><p style="font-size:12.5px;color:#7c7f85">يمكن فتح الملفات من التقرير المرتب.</p>';
        $fileLines = "\n\nالملفات المرفقة:\n" . implode("\n", $fl);
    }
    $name = $b['client']['name'];
    $intro = $forCompany
        ? '<p>وصل طلب مشروع جديد من <strong>' . h($name) . '</strong> عبر الموقع.</p>'
        : '<p>مرحباً ' . h($name) . '،</p><p>شكراً لتواصلك مع شركة ' . h(COMPANY) . '. تم استلام طلبك بنجاح، وسيقوم فريقنا بمراجعة تفاصيل المشروع والتواصل معك لاستكمال المتطلبات. هذه نسخة من البيانات التي أرسلتها:</p>';
    $button = $link ? '<p style="margin:24px 0"><a href="' . h($link) . '" style="display:inline-block;padding:11px 20px;background:#1E2A32;color:#fff;border-radius:999px;text-decoration:none;font-weight:700">عرض التقرير المرتب وطباعته</a></p>' : '';
    $html = '<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.8;color:#1a1a1a;max-width:680px;margin:auto">
    <div style="background:#1E2A32;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0"><strong style="font-size:18px">' . h(COMPANY) . '</strong><br><span style="color:#C9B895;font-size:13px">طلب مشروع رقم <span dir="ltr">' . h($b['ref']) . '</span></span></div>
    <div style="padding:6px 22px 22px;border:1px solid #eee9df;border-top:0;border-radius:0 0 12px 12px">' . $intro . $button . $tables . $desc . $files . '
    <p style="color:#7c7f85;font-size:12px;margin-top:24px">تم إرسال هذه الرسالة آلياً من موقع ' . h(COMPANY) . '.</p></div></div>';
    $text = ($forCompany ? 'طلب مشروع جديد من ' . $name : 'مرحباً ' . $name . '، تم استلام طلب مشروعك لدى ' . COMPANY . '.')
        . "\nرقم الطلب: " . $b['ref'] . "\n" . ($link ? "\nالتقرير المرتب: " . $link . "\n" : '') . "\n" . implode("\n\n", $plain) . $extra . $fileLines;
    $subject = $forCompany ? 'طلب مشروع جديد ' . $b['ref'] . ' — ' . $name : 'تم استلام طلب مشروعك ' . $b['ref'] . ' — ' . COMPANY;
    return ['subject' => $subject, 'html' => $html, 'text' => $text];
}

function brief_no_store_headers(): void {
    header('Cache-Control: no-store');
    header('X-Robots-Tag: noindex, nofollow');
    header('Referrer-Policy: no-referrer');
}

// GET /brief/:id?t=…
function page_brief_report(string $id): void {
    brief_no_store_headers();
    $b = brief_get($id);
    $staff = is_brief_staff();
    $token = $staff ? '' : str_val($_GET['t'] ?? '');
    if (!$b || (!$staff && !brief_check_token($b, $token))) send_html(BRIEF_NOT_FOUND, 404);
    $nonce = base64_encode(random_bytes(16));
    header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-$nonce'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    send_html(brief_render_report($b, $nonce, $token, $staff));
}

// GET /brief/:id/files/:fileId?t=…
function page_brief_file(string $id, string $fileId): void {
    brief_no_store_headers();
    $b = brief_get($id);
    if (!$b || (!is_brief_staff() && !brief_check_token($b, $_GET['t'] ?? ''))) send_html(BRIEF_NOT_FOUND, 404);
    $file = null;
    foreach ($b['files'] ?? [] as $f) if (($f['id'] ?? '') === $fileId) $file = $f;
    if (!$file || !preg_match('/^[a-f0-9]+$/', (string)$file['id']) || !preg_match('/^\.[a-z]+$/', (string)$file['ext'])) send_html(BRIEF_NOT_FOUND, 404);
    $full = brief_files_dir() . '/' . $file['id'] . $file['ext'];
    if (!is_file($full)) send_html(BRIEF_NOT_FOUND, 404);
    $inline = in_array($file['type'], ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], true);
    header('X-Content-Type-Options: nosniff');
    header("Content-Security-Policy: default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
    header('Content-Type: ' . ($inline ? $file['type'] : 'application/octet-stream'));
    header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . '; filename="file' . $file['ext'] . '"; filename*=UTF-8\'\'' . rawurlencode((string)$file['name']));
    header('Content-Length: ' . filesize($full));
    readfile($full);
    exit;
}
