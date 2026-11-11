<?php
// app/reviews.php
// صفحة تقييم العميل عبر الرابط الخاص /review/<token> — نفس lib/reviews.js.

declare(strict_types=1);

const REVIEW_CRITERIA = [
    'quality' => 'جودة التنفيذ', 'timing' => 'الالتزام بالمواعيد', 'communication' => 'التواصل والتعامل',
    'safety' => 'النظافة والسلامة في الموقع', 'value' => 'القيمة مقابل السعر',
];
const REVIEW_DEFAULTS = [
    'image' => '/images/review-share.jpg',
    'title' => 'رأيك يهمنا — قيّم تجربتك مع العمران الذهبية',
    'description' => 'يسعدنا معرفة رأيك في تجربتك معنا ومساعدتنا على تقديم خدمة أفضل دائماً. التقييم لا يستغرق أكثر من دقيقة ⭐',
];

function review_clean($v, int $n): string {
    $s = str_replace("\r\n", "\n", str_val($v));
    $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $s);
    return mb_slice(trim($s), $n);
}

function review_find_index(array $list, string $token): ?int {
    if (!preg_match('/^[A-Za-z0-9_-]{20,64}$/', $token)) return null;
    foreach ($list as $i => $r) if (is_array($r) && !empty($r['token']) && hash_equals((string)$r['token'], $token)) return $i;
    return null;
}

function review_invite_settings(array $s): array {
    $c = is_array($s['reviewInvite'] ?? null) ? $s['reviewInvite'] : [];
    $txt = function ($v, string $fb): string { $t = is_array($v) ? (str_val($v['ar'] ?? '') ?: str_val($v['en'] ?? '')) : ''; return trim($t ?: $fb); };
    return [
        'image' => safe_asset($c['image'] ?? null),
        'title' => $txt($c['title'] ?? null, REVIEW_DEFAULTS['title']),
        'description' => $txt($c['description'] ?? null, REVIEW_DEFAULTS['description']),
    ];
}

function page_review(string $token): void {
    header('Cache-Control: no-store');
    header('X-Robots-Tag: noindex, nofollow');
    header('Referrer-Policy: no-referrer');
    $nonce = base64_encode(random_bytes(16));
    header("Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'nonce-$nonce'; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    $bot = (bool)preg_match('/bot|crawler|spider|facebookexternalhit|whatsapp|telegram|slack|twitter|discord|preview|linkedin|skype/i', (string)($_SERVER['HTTP_USER_AGENT'] ?? ''));

    $r = with_lock('reviews', function () use ($token, $bot) {
        $list = read_json('reviews.json', []);
        if (!is_list($list)) return null;
        $i = review_find_index($list, $token);
        if ($i === null) return null;
        // معاينة الرابط (واتساب وغيره) لا تُحتسب «فتحاً» من العميل
        if (!$bot && empty($list[$i]['openedAt'])) { $list[$i]['openedAt'] = now_iso(); write_json('reviews.json', $list); }
        return $list[$i];
    });

    $settings = get_settings();
    $cfg = review_invite_settings($settings);
    $img = site_base_url() . ($cfg['image'] ?: REVIEW_DEFAULTS['image']);
    $logo = safe_asset($settings['logo'] ?? null) ?: '/images/alomran-logo.png';
    $tags = [
        ['property', 'og:type', 'website'], ['property', 'og:site_name', COMPANY], ['property', 'og:locale', 'ar_SA'],
        ['property', 'og:title', $cfg['title']], ['property', 'og:description', $cfg['description']], ['property', 'og:image', $img], ['property', 'og:image:alt', $cfg['title']],
    ];
    if (!$cfg['image']) { $tags[] = ['property', 'og:image:width', '1200']; $tags[] = ['property', 'og:image:height', '800']; }
    array_push($tags, ['name', 'twitter:card', 'summary_large_image'], ['name', 'twitter:title', $cfg['title']], ['name', 'twitter:description', $cfg['description']], ['name', 'twitter:image', $img]);
    $data = $r ? ['name' => $r['name'] ?? '', 'project' => $r['project'] ?? '', 'done' => !empty($r['review']), 'criteria' => REVIEW_CRITERIA] : null;
    $html = (string)file_get_contents(__DIR__ . '/review-page.html');
    $html = str_replace('<!--META-->', meta_tags($tags), $html);
    $html = str_replace('<!--DATA-->', '<script nonce="' . $nonce . '">window.__REVIEW__=' . json_for_script($data) . ';window.__REVIEW_HERO__=' . json_for_script($cfg['image'] ?: REVIEW_DEFAULTS['image']) . ';</script>', $html);
    $html = str_replace('/images/alomran-logo.png', attr($logo), $html);
    send_html($html, $r ? 200 : 404);
}

function api_review_submit(string $token): void {
    rate_limit('review', 20, 30 * 60, 'تم تجاوز عدد المحاولات. حاول لاحقاً.');
    $b = json_body();
    $out = with_lock('reviews', function () use ($token, $b) {
        $list = read_json('reviews.json', []);
        if (!is_list($list)) $list = [];
        $i = review_find_index($list, $token);
        if ($i === null) return ['error' => 'رابط التقييم غير صالح أو انتهت صلاحيته.', 'status' => 404];
        $r = $list[$i];
        if (!empty($r['review'])) return ['error' => 'تم استلام تقييمك لهذا الرابط مسبقاً. شكراً لك!', 'status' => 409];
        $rating = (int)str_val($b['rating'] ?? '');
        if ($rating < 1 || $rating > 5) return ['error' => 'اختر عدد النجوم لتقييمك العام.'];
        $criteria = [];
        foreach (array_keys(REVIEW_CRITERIA) as $k) {
            $v = (int)str_val($b['criteria'][$k] ?? '');
            if ($v >= 1 && $v <= 5) $criteria[$k] = $v;
        }
        $text = review_clean($b['text'] ?? '', 1200);
        if (mb_len($text) < 10) return ['error' => 'اكتب رأيك بكلمات قليلة على الأقل (10 أحرف).'];
        $rec = $b['recommend'] ?? null;
        $review = [
            'rating' => $rating, 'criteria' => (object)$criteria, 'text' => $text,
            'name' => review_clean($b['name'] ?? '', 80) ?: ($r['name'] ?? ''),
            'role' => review_clean($b['role'] ?? '', 100),
            'recommend' => $rec === true ? true : ($rec === false ? false : null),
            'consent' => ($b['consent'] ?? null) === true,
            'lang' => ($b['lang'] ?? '') === 'en' ? 'en' : 'ar',
        ];
        $list[$i]['review'] = $review;
        $list[$i]['submittedAt'] = now_iso();
        $list[$i]['status'] = 'pending';
        write_json('reviews.json', $list);
        return ['review' => $review, 'invite' => $list[$i]];
    });
    if (isset($out['error'])) send_json(['error' => $out['error']], $out['status'] ?? 400);
    $rv = $out['review'];
    $inv = $out['invite'];
    respond_then(fn() => send_json(['ok' => true]), function () use ($rv, $inv) {
        notify_company('requests.review', [
            'vars' => ['name' => $rv['name']], 'title' => 'تقييم جديد من عميل',
            'rows' => [['العميل', $rv['name']], ['المشروع', $inv['project'] ?? ''],
                ['التقييم', str_repeat('★', $rv['rating']) . str_repeat('☆', 5 - $rv['rating']) . ' (' . $rv['rating'] . '/5)'],
                ['الموافقة على النشر', $rv['consent'] ? 'نعم' : 'لا — للاطلاع الداخلي فقط']],
            'body' => $rv['text'], 'linkLabel' => 'مراجعة التقييم في لوحة التحكم',
        ]);
    });
}
