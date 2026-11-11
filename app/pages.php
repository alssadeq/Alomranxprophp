<?php
// app/pages.php
// صفحات الموقع العامة: تُرسل ومعها إعدادات الموقع والأعمال مضمّنة، والشعار والأيقونة
// مستبدلة من الخادم، وبطاقة المشاركة (Open Graph) — نفس سلوك نسخة Node.

declare(strict_types=1);

const SITE_PAGES = ['index', 'about', 'methodology', 'privacy', 'project', 'projects'];
const DEFAULT_SHARE = [
    'image' => '/images/share-card.jpg',
    'title' => 'العمران الذهبية للمقاولات العامة | العمران… ثقة وإتقان',
    'description' => 'أهلاً بك في العمران الذهبية للمقاولات العامة 👋 نبني للمستقبل بقيمة تدوم: تنفيذ وإدارة المشاريع السكنية والتجارية والصناعية في المملكة منذ 2009. تواصل معنا واطلب عرض سعر لمشروعك.',
];

function safe_asset($u): string {
    return (is_string($u) && preg_match('#^/images/[A-Za-z0-9._/-]+$#', $u)) ? $u : '';
}

function meta_tags(array $tags): string {
    $out = '';
    foreach ($tags as [$k, $n, $v]) $out .= '<meta ' . $k . '="' . $n . '" content="' . attr($v) . '">';
    return $out;
}

function share_meta(string $name, string $html, array $settings): string {
    $share = is_array($settings['share'] ?? null) ? $settings['share'] : [];
    $pick = function ($v, string $fb): string {
        $t = is_array($v) ? (str_val($v['ar'] ?? '') ?: str_val($v['en'] ?? '')) : '';
        return trim($t ?: $fb);
    };
    $tag = function (string $re) use ($html): string {
        return preg_match($re, $html, $m) ? str_replace(['&quot;', '&amp;'], ['"', '&'], $m[1]) : '';
    };
    $isHome = $name === 'index';
    $title = $isHome ? $pick($share['title'] ?? null, DEFAULT_SHARE['title']) : ($tag('#<title>([^<]*)</title>#i') ?: DEFAULT_SHARE['title']);
    $desc = $isHome ? $pick($share['description'] ?? null, DEFAULT_SHARE['description']) : ($tag('#<meta name="description" content="([^"]*)"#i') ?: DEFAULT_SHARE['description']);
    $base = site_base_url();
    $img = safe_asset($share['image'] ?? null) ?: DEFAULT_SHARE['image'];
    $qs = $name === 'project' && !empty($_SERVER['QUERY_STRING']) ? '?' . $_SERVER['QUERY_STRING'] : '';
    $pageUrl = $base . ($isHome ? '/' : '/' . $name) . $qs;
    $tags = [
        ['property', 'og:type', 'website'], ['property', 'og:site_name', COMPANY], ['property', 'og:locale', 'ar_SA'],
        ['property', 'og:title', $title], ['property', 'og:description', $desc], ['property', 'og:url', $pageUrl],
        ['property', 'og:image', $base . $img], ['property', 'og:image:alt', $title],
        ['name', 'twitter:card', 'summary_large_image'], ['name', 'twitter:title', $title],
        ['name', 'twitter:description', $desc], ['name', 'twitter:image', $base . $img],
    ];
    if ($img === DEFAULT_SHARE['image']) { $tags[] = ['property', 'og:image:width', '1200']; $tags[] = ['property', 'og:image:height', '630']; }
    return meta_tags($tags);
}

function render_site_page(string $name): void {
    $file = ROOT_DIR . '/' . $name . '.html';
    if (!in_array($name, SITE_PAGES, true) || !is_file($file)) { not_found(); }
    $html = (string)file_get_contents($file);
    $settings = public_settings();
    $works = visible_works();
    $logo = safe_asset($settings['logo'] ?? null);
    $favicon = safe_asset($settings['favicon'] ?? null);
    if ($logo) $html = str_replace('src="/images/alomran-logo.png"', 'src="' . attr($logo) . '"', $html);

    // زر تسجيل الدخول: يُزال إن كان مخفياً في الجهازين، وإلا يُخفى في جهاز واحد
    $lb = is_array($settings['loginButton'] ?? null) ? $settings['loginButton'] : [];
    $showDesktop = ($lb['desktop'] ?? null) !== false;
    $showMobile = ($lb['mobile'] ?? null) !== false;
    if (!$showDesktop && !$showMobile) $html = preg_replace('#\s*<a href="/login" class="header-login"[\s\S]*?</a>#', '', $html, 1);
    elseif (!$showDesktop || !$showMobile) {
        $pos = strpos($html, 'class="header-login"');
        if ($pos !== false) $html = substr_replace($html, 'class="header-login ' . ($showDesktop ? 'hide-mobile' : 'hide-desktop') . '"', $pos, strlen('class="header-login"'));
    }

    $head = share_meta($name, $html, $settings)
        . '<style>html.site-preload body{opacity:0}body{transition:opacity .3s ease}</style>'
        . "<script>document.documentElement.classList.add('site-preload');setTimeout(function(){document.documentElement.classList.remove('site-preload')},3000);window.__SITE_SETTINGS__=" . json_for_script($settings) . ';window.__SITE_WORKS__=' . json_for_script($works) . ';</script>'
        . ($logo ? '<link rel="preload" as="image" href="' . attr($logo) . '">' : '')
        . ($favicon ? '<link rel="icon" href="' . attr($favicon) . '">' : '');
    $html = preg_replace_callback('#<head([^>]*)>#i', fn($m) => $m[0] . $head, $html, 1);
    header('Cache-Control: no-cache');
    send_html($html);
}

function not_found(): void {
    send_html('<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>الصفحة غير موجودة</title></head>'
        . '<body style="font-family:Tahoma,Arial,sans-serif;text-align:center;padding:70px 20px;background:#f3efe8;color:#1E2A32">'
        . '<h1 style="font-size:22px">الصفحة غير موجودة</h1><p><a href="/" style="color:#1E2A32;font-weight:700">العودة إلى الصفحة الرئيسية</a></p></body></html>', 404);
}

// لوحة التحكم تُنقل في المرحلة الثانية من نسخة PHP
function admin_coming_soon(): void {
    header('X-Robots-Tag: noindex, nofollow');
    send_html('<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>لوحة التحكم</title></head>'
        . '<body style="font-family:Tahoma,Arial,sans-serif;text-align:center;padding:70px 20px;background:#f3efe8;color:#1E2A32">'
        . '<h1 style="font-size:22px">لوحة التحكم قيد التجهيز</h1><p>يجري نقل لوحة التحكم إلى نسخة الاستضافة الحالية، وستتوفر قريباً.</p>'
        . '<p><a href="/" style="color:#1E2A32;font-weight:700">العودة إلى الموقع</a></p></body></html>', 503);
}

// الصور: المرفوعة من لوحة التحكم في data/uploads (الصور الأصلية في images/ تُخدم مباشرة من الخادم)
function serve_upload(string $rel): void {
    $rel = ltrim($rel, '/');
    if ($rel === '' || str_contains($rel, '..') || !preg_match('#^[A-Za-z0-9._/-]+$#', $rel)) not_found();
    $file = UPLOADS_DIR . '/' . $rel;
    if (!is_file($file)) not_found();
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    $types = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'gif' => 'image/gif',
        'svg' => 'image/svg+xml', 'ico' => 'image/x-icon', 'avif' => 'image/avif', 'pdf' => 'application/pdf',
        'woff2' => 'font/woff2', 'woff' => 'font/woff', 'ttf' => 'font/ttf', 'otf' => 'font/otf', 'mp4' => 'video/mp4', 'webm' => 'video/webm'];
    $type = $types[$ext] ?? 'application/octet-stream';
    header('Content-Type: ' . $type);
    header('X-Content-Type-Options: nosniff');
    if ($ext === 'svg') header("Content-Security-Policy: default-src 'none'; sandbox");
    $mtime = filemtime($file);
    $etag = '"' . dechex($mtime) . '-' . dechex(filesize($file)) . '"';
    header('ETag: ' . $etag);
    header('Last-Modified: ' . gmdate('D, d M Y H:i:s', $mtime) . ' GMT');
    header('Cache-Control: public, max-age=0');
    if (trim((string)($_SERVER['HTTP_IF_NONE_MATCH'] ?? '')) === $etag) { http_response_code(304); exit; }
    header('Content-Length: ' . filesize($file));
    readfile($file);
    exit;
}
