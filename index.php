<?php
// index.php — نقطة الدخول الوحيدة لنسخة PHP من موقع العمران الذهبية.
// الملفات الثابتة (css, js, images, fonts) يخدمها الخادم مباشرة عبر .htaccess،
// وكل ما عداها يمر من هنا.

declare(strict_types=1);

if (PHP_VERSION_ID < 80100) {
    http_response_code(500);
    exit('يتطلب الموقع PHP 8.1 أو أحدث. غيّر إصدار PHP من لوحة الاستضافة.');
}

require __DIR__ . '/app/lib.php';
require __DIR__ . '/app/mail.php';
require __DIR__ . '/app/pages.php';
require __DIR__ . '/app/public_api.php';
require __DIR__ . '/app/briefs.php';
require __DIR__ . '/app/reviews.php';
require __DIR__ . '/app/chat.php';

ini_set('display_errors', '0');
date_default_timezone_set('UTC');

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
header_remove('X-Powered-By');

set_exception_handler(function (Throwable $e) {
    log_error($e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine());
    if (str_starts_with(request_path(), '/api/')) send_json(['error' => 'حدث خطأ غير متوقع. حاول مرة أخرى.'], 500);
    send_html('<!DOCTYPE html><html lang="ar" dir="rtl"><meta charset="UTF-8"><body style="font-family:Tahoma,Arial;text-align:center;padding:60px">حدث خطأ غير متوقع. حاول مرة أخرى بعد قليل.</body></html>', 500);
});

ensure_data_dir();
ensure_default_works();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = request_path();
$qs = isset($_SERVER['QUERY_STRING']) && $_SERVER['QUERY_STRING'] !== '' ? '?' . $_SERVER['QUERY_STRING'] : '';
$isGet = $method === 'GET' || $method === 'HEAD';

/* ---------- الواجهات البرمجية ---------- */
if (str_starts_with($path, '/api/')) {
    header('Cache-Control: no-store');
    $routes = [
        'GET /api/settings/public' => 'api_settings_public',
        'GET /api/works/public' => 'api_works_public',
        'GET /api/public/social' => 'api_public_social',
        'POST /api/public/social/click' => 'api_public_social_click',
        'POST /api/contact' => 'api_contact',
        'POST /api/briefs' => 'api_briefs_create',
        'GET /api/chat/settings' => 'api_chat_settings',
        'POST /api/chat/conversations' => 'api_chat_create',
        'POST /api/chat/messages' => 'api_chat_message',
        'POST /api/chat/attachments' => 'api_chat_attachment',
    ];
    $key = ($method === 'HEAD' ? 'GET' : $method) . ' ' . rtrim($path, '/');
    if (isset($routes[$key])) { $routes[$key](); exit; }
    if ($isGet && preg_match('#^/api/chat/conversations/([A-Za-z0-9_-]{1,80})$#', $path, $m)) { api_chat_get($m[1]); exit; }
    if ($method === 'POST' && preg_match('#^/api/review/([^/]{1,100})$#', $path, $m)) { api_review_submit($m[1]); exit; }
    // لوحة التحكم وتسجيل الدخول: المرحلة الثانية
    if (preg_match('#^/api/(session|session-health)$#', $path)) send_json(['error' => 'غير مسجّل الدخول.'], 401);
    send_json(['error' => 'هذه الخدمة غير متاحة حالياً.'], 404);
}

if (!$isGet) send_json(['error' => 'غير مسموح.'], 405);

/* ---------- الصفحات ---------- */

// الروابط القديمة بامتداد ‎.html تُحوَّل للرابط النظيف
if (preg_match('#^/([a-z0-9-]+)\.html$#i', $path, $m)) {
    $name = strtolower($m[1]);
    header('Location: ' . ($name === 'index' ? '/' : '/' . $name) . $qs, true, 301);
    exit;
}

$clean = $path === '/' ? 'index' : (preg_match('#^/([a-z0-9-]+)/?$#i', $path, $m) ? strtolower($m[1]) : null);
if ($clean !== null && in_array($clean, SITE_PAGES, true)) render_site_page($clean);
if ($clean !== null && in_array($clean, ['login', 'dashboard', 'setup', 'forgot-password', 'reset-password', 'developer-login', 'developer-setup', 'developer-center'], true)) admin_coming_soon();
if ($clean === 'brief') {
    header('Cache-Control: no-cache');
    send_html((string)file_get_contents(__DIR__ . '/brief.html'));
}

if (preg_match('#^/review/([^/]{1,100})$#', $path, $m)) page_review($m[1]);
if (preg_match('#^/brief/([A-Za-z0-9_]{1,60})$#', $path, $m)) page_brief_report($m[1]);
if (preg_match('#^/brief/([A-Za-z0-9_]{1,60})/files/([A-Za-z0-9]{1,60})$#', $path, $m)) page_brief_file($m[1], $m[2]);
if (preg_match('#^/images/(.+)$#', $path, $m)) serve_upload($m[1]);

not_found();
