<?php
// index.php — نقطة الدخول الوحيدة لنسخة PHP من موقع العمران الذهبية.
// الملفات الثابتة (css, js, images, fonts) يخدمها الخادم مباشرة عبر .htaccess،
// وكل ما عداها يمر من هنا.

declare(strict_types=1);

if (PHP_VERSION_ID < 80100) {
    http_response_code(500);
    exit('يتطلب الموقع PHP 8.1 أو أحدث. غيّر إصدار PHP من لوحة الاستضافة.');
}

foreach (['lib', 'mail', 'pages', 'public_api', 'briefs', 'reviews', 'chat', 'auth', 'admin', 'admin2', 'customers', 'ai', 'devcenter'] as $m) require __DIR__ . "/app/$m.php";

ini_set('display_errors', '0');
date_default_timezone_set('UTC');

header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: SAMEORIGIN');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
header_remove('X-Powered-By');
if (is_https()) header('Strict-Transport-Security: max-age=31536000; includeSubDomains');

set_exception_handler(function (Throwable $e) {
    log_error($e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine(), $e->getTraceAsString());
    if (str_starts_with(request_path(), '/api/')) send_json(['error' => 'حدث خطأ غير متوقع. حاول مرة أخرى.'], 500);
    send_html('<!DOCTYPE html><html lang="ar" dir="rtl"><meta charset="UTF-8"><body style="font-family:Tahoma,Arial;text-align:center;padding:60px">حدث خطأ غير متوقع. حاول مرة أخرى بعد قليل.</body></html>', 500);
});

ensure_data_dir();
parse_multipart_non_post();
ensure_default_works();
customers_sync_once();

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = request_path();
$qs = isset($_SERVER['QUERY_STRING']) && $_SERVER['QUERY_STRING'] !== '' ? '?' . $_SERVER['QUERY_STRING'] : '';
$isGet = $method === 'GET' || $method === 'HEAD';
$verb = $method === 'HEAD' ? 'GET' : $method;

// التقرير الدوري والتذكيرات (بديل المؤقت في Node) بعد إنهاء الطلب
register_shutdown_function(function () {
    if (function_exists('fastcgi_finish_request')) @fastcgi_finish_request();
    notify_tick();
});

maintenance_gate($path);

/* ============================= الواجهات البرمجية ============================= */
if (str_starts_with($path, '/api/')) {
    header('Cache-Control: no-store');
    csrf_check($path, $method);
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 256 * 1024 && str_contains(strtolower((string)($_SERVER['CONTENT_TYPE'] ?? '')), 'json')) send_json(['error' => 'حجم الطلب كبير جداً.'], 413);
    $p = rtrim($path, '/');
    if (str_starts_with($p, '/api/developer/')) route_developer($p, $verb);

    $routes = [
        // عام
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
        // الدخول والحسابات
        'POST /api/setup' => 'api_setup',
        'POST /api/login' => 'api_login',
        'POST /api/logout' => 'api_logout',
        'GET /api/session' => 'api_session',
        'POST /api/password/forgot' => 'api_password_forgot',
        'POST /api/password/reset' => 'api_password_reset',
        'PUT /api/user/profile' => 'api_user_profile',
        'PATCH /api/users/me/password' => 'api_users_me_password',
        'GET /api/users' => 'api_users_list',
        'POST /api/users' => 'api_users_create',
        'POST /api/admin/reset-setup' => 'api_admin_reset_setup',
        // الأعمال
        'GET /api/works' => 'api_works_list',
        'POST /api/works' => 'api_works_create',
        // الإعدادات
        'GET /api/settings' => 'api_settings_full',
        'PUT /api/settings/logo' => fn() => settings_image_field('logo'),
        'PUT /api/settings/favicon' => fn() => settings_image_field('favicon'),
        'PUT /api/settings/share' => 'api_settings_share',
        'PUT /api/settings/share/image' => fn() => api_settings_share_image(false),
        'DELETE /api/settings/share/image' => fn() => api_settings_share_image(true),
        'PUT /api/settings/project-logo' => fn() => api_settings_logo_toggle('projectLogo'),
        'PUT /api/settings/banner-logo' => fn() => api_settings_logo_toggle('bannerLogo'),
        'PUT /api/settings/login-button' => 'api_settings_login_button',
        'PATCH /api/settings/banner-text-visibility' => 'api_settings_banner_text',
        'PUT /api/settings/stats' => 'api_settings_stats',
        'PUT /api/settings/services' => 'api_settings_services',
        'PUT /api/settings/testimonials' => 'api_settings_testimonials',
        'PUT /api/settings/team' => 'api_settings_team',
        'PUT /api/settings/chat' => 'api_settings_chat',
        'PUT /api/settings/typography' => 'api_settings_typography',
        'PUT /api/settings/welcome' => 'api_settings_welcome',
        'PUT /api/settings/content' => 'api_settings_content',
        // التقييمات وبريد الشركة
        'GET /api/reviews' => 'api_reviews_list',
        'POST /api/reviews' => 'api_reviews_create',
        'PUT /api/reviews/email-settings' => 'api_reviews_email_settings',
        'POST /api/reviews/email-preview' => 'api_reviews_email_preview',
        'POST /api/reviews/email-test' => 'api_reviews_email_test',
        'PUT /api/reviews/settings' => 'api_reviews_settings',
        'PUT /api/reviews/settings/image' => fn() => api_reviews_settings_image(false),
        'DELETE /api/reviews/settings/image' => fn() => api_reviews_settings_image(true),
        'GET /api/mail-account' => 'api_mail_account_get',
        'PUT /api/mail-account' => 'api_mail_account_put',
        'POST /api/mail-account/test' => 'api_mail_account_test',
        // الرسائل والنظرة العامة والسجل
        'GET /api/messages' => 'api_messages_list',
        'GET /api/activity-log' => 'api_activity_log',
        'GET /api/overview' => 'api_overview',
        // وسائل التواصل
        'GET /api/social' => 'api_social_list',
        'POST /api/social' => 'api_social_create',
        'POST /api/social/reorder' => 'api_social_reorder',
        'PUT /api/social/upload-icon' => 'api_social_upload_icon',
        'GET /api/social/export' => 'api_social_export',
        'POST /api/social/import' => 'api_social_import',
        // العملاء والبريف والجرس والإشعارات
        'GET /api/customers' => 'api_customers_list',
        'POST /api/customers' => 'api_customers_create',
        'GET /api/customers/report' => 'api_customers_report',
        'GET /api/customers/export.csv' => 'api_customers_export',
        'GET /api/briefs' => 'api_briefs_list',
        'GET /api/inbox' => 'api_inbox',
        'POST /api/inbox/read' => 'api_inbox_read',
        'GET /api/notifications-settings' => 'api_notifications_get',
        'PUT /api/notifications-settings' => 'api_notifications_put',
        'POST /api/notifications-settings/test' => fn() => api_notifications_action('test'),
        'POST /api/notifications-settings/digest-now' => fn() => api_notifications_action('digest-now'),
        'POST /api/notifications-settings/reminders-now' => fn() => api_notifications_action('reminders-now'),
        // المحادثات (فريق خدمة العملاء)
        'GET /api/chat/admin' => 'api_chat_admin_list',
        'POST /api/chat/admin/presence' => 'api_chat_admin_presence',
        'GET /api/chat/admin-analytics' => 'api_chat_admin_analytics',
        // الصحة
        'GET /api/session-health' => fn() => send_json(['status' => 'ok', 'sessionMiddleware' => true, 'secureCookie' => is_https(), 'protocol' => is_https() ? 'https' : 'http', 'secure' => is_https(), 'hasSessionId' => !empty($_COOKIE['alomran_sid'])]),
        'GET /api/runtime-health' => fn() => send_json(['status' => 'ok', 'version' => app_version(), 'node' => 'PHP ' . PHP_VERSION, 'environment' => 'production', 'port' => (int)($_SERVER['SERVER_PORT'] ?? 0), 'storage' => is_writable(DATA_DIR) ? 'available' : 'unavailable']),
    ];
    $key = "$verb $p";
    if (isset($routes[$key])) { $routes[$key](); exit; }

    $id = '([^/]{1,120})';
    $patterns = [
        ['GET', "#^/api/chat/conversations/([A-Za-z0-9_-]{1,80})$#", fn($m) => api_chat_get($m[1])],
        ['POST', "#^/api/review/$id$#", fn($m) => api_review_submit($m[1])],
        ['PUT', "#^/api/works/$id$#", fn($m) => api_works_update($m[1])],
        ['DELETE', "#^/api/works/$id$#", fn($m) => api_works_delete($m[1])],
        ['PATCH', "#^/api/works/$id/visibility$#", fn($m) => api_works_visibility($m[1])],
        ['PATCH', "#^/api/works/$id/pin$#", fn($m) => api_works_pin($m[1])],
        ['PUT', "#^/api/works/$id/images$#", fn($m) => api_works_images($m[1])],
        ['PATCH', "#^/api/users/$id/permissions$#", fn($m) => api_users_permissions($m[1])],
        ['PATCH', "#^/api/users/$id/suspend$#", fn($m) => api_users_suspend($m[1])],
        ['DELETE', "#^/api/users/$id$#", fn($m) => api_users_delete($m[1])],
        ['POST', "#^/api/users/$id/reset-password$#", fn($m) => api_users_reset_password($m[1])],
        ['DELETE', "#^/api/settings/banner/$id$#", fn($m) => api_banner_delete($m[1])],
        ['PUT', "#^/api/settings/banner/$id$#", fn($m) => api_banner_put($m[1])],
        ['PUT', "#^/api/settings/background/$id$#", fn($m) => api_settings_background($m[1])],
        ['PUT', "#^/api/settings/showcase/$id$#", fn($m) => api_showcase_put($m[1])],
        ['POST', "#^/api/settings/showcase/$id/$id/images$#", fn($m) => api_showcase_images($m[1], $m[2])],
        ['PUT', "#^/api/settings/showcase/$id/$id/image$#", fn($m) => api_showcase_image($m[1], $m[2])],
        ['POST', "#^/api/settings/custom-banners/$id$#", fn($m) => api_custom_banner_create($m[1])],
        ['PUT', "#^/api/settings/custom-banners/$id/$id/image$#", fn($m) => api_custom_banner_image($m[1], $m[2])],
        ['DELETE', "#^/api/settings/custom-banners/$id/$id/image$#", fn($m) => api_custom_banner_image($m[1], $m[2], true)],
        ['PUT', "#^/api/settings/custom-banners/$id/$id$#", fn($m) => api_custom_banner_update($m[1], $m[2])],
        ['DELETE', "#^/api/settings/custom-banners/$id/$id$#", fn($m) => api_custom_banner_delete($m[1], $m[2])],
        ['PUT', "#^/api/settings/sections/$id/reorder$#", fn($m) => api_sections_reorder($m[1])],
        ['PUT', "#^/api/settings/sections/$id/$id/image$#", fn($m) => api_sections_image($m[1], $m[2], false)],
        ['PUT', "#^/api/settings/sections/$id/$id/bg-image$#", fn($m) => api_sections_image($m[1], $m[2], true)],
        ['PUT', "#^/api/settings/sections/$id$#", fn($m) => api_sections_put($m[1])],
        ['POST', "#^/api/reviews/$id/sent$#", fn($m) => api_reviews_sent($m[1])],
        ['POST', "#^/api/reviews/$id/email$#", fn($m) => api_reviews_email($m[1])],
        ['POST', "#^/api/reviews/$id/approve$#", fn($m) => api_reviews_approve($m[1])],
        ['POST', "#^/api/reviews/$id/hide$#", fn($m) => api_reviews_hide($m[1])],
        ['DELETE', "#^/api/reviews/$id$#", fn($m) => api_reviews_delete($m[1])],
        ['PATCH', "#^/api/messages/$id/read$#", fn($m) => api_messages_read($m[1])],
        ['DELETE', "#^/api/messages/$id$#", fn($m) => api_messages_delete($m[1])],
        ['PUT', "#^/api/social/$id$#", fn($m) => api_social_update($m[1])],
        ['DELETE', "#^/api/social/$id$#", fn($m) => api_social_delete($m[1])],
        ['POST', "#^/api/social/$id/duplicate$#", fn($m) => api_social_duplicate($m[1])],
        ['GET', "#^/api/customers/$id$#", fn($m) => api_customers_get($m[1])],
        ['PATCH', "#^/api/customers/$id$#", fn($m) => api_customers_update($m[1])],
        ['DELETE', "#^/api/customers/$id$#", fn($m) => api_customers_delete($m[1])],
        ['POST', "#^/api/customers/$id/contact$#", fn($m) => api_customers_contact($m[1])],
        ['PATCH', "#^/api/briefs/$id$#", fn($m) => api_briefs_update($m[1])],
        ['DELETE', "#^/api/briefs/$id$#", fn($m) => api_briefs_delete($m[1])],
        ['GET', "#^/api/chat/admin/$id$#", fn($m) => api_chat_admin_get($m[1])],
        ['POST', "#^/api/chat/admin/$id/claim$#", fn($m) => api_chat_admin_claim($m[1])],
        ['POST', "#^/api/chat/admin/$id/release$#", fn($m) => api_chat_admin_release($m[1])],
        ['POST', "#^/api/chat/admin/$id/reply$#", fn($m) => api_chat_admin_reply($m[1])],
        ['POST', "#^/api/chat/admin/$id/close$#", fn($m) => api_chat_admin_close($m[1])],
    ];
    foreach ($patterns as [$mth, $re, $fn]) {
        if ($verb === $mth && preg_match($re, $p, $m)) { $fn(array_map('rawurldecode', $m)); exit; }
    }
    send_json(['error' => 'غير موجود.'], 404);
}

if (!$isGet) send_json(['error' => 'غير مسموح.'], 405);

/* ============================= الصفحات ============================= */

// الروابط القديمة بامتداد ‎.html تُحوَّل للرابط النظيف
if (preg_match('#^/([a-z0-9-]+)\.html$#i', $path, $m)) {
    $name = strtolower($m[1]);
    header('Location: ' . ($name === 'index' ? '/' : '/' . $name) . $qs, true, 301);
    exit;
}

const ADMIN_PAGES = ['login', 'dashboard', 'setup', 'forgot-password', 'reset-password', 'developer-login', 'developer-setup', 'developer-center'];
$clean = $path === '/' ? 'index' : (preg_match('#^/([a-z0-9-]+)/?$#i', $path, $m) ? strtolower($m[1]) : null);
if ($clean !== null && in_array($clean, SITE_PAGES, true)) render_site_page($clean);
if ($clean !== null && in_array($clean, ADMIN_PAGES, true)) {
    guard_admin_page($clean);
    header('Cache-Control: no-store');
    header('X-Robots-Tag: noindex, nofollow');
    send_html((string)file_get_contents(__DIR__ . "/$clean.html"));
}
if ($clean === 'brief') {
    header('Cache-Control: no-cache');
    send_html((string)file_get_contents(__DIR__ . '/brief.html'));
}

if (preg_match('#^/review/([^/]{1,100})$#', $path, $m)) page_review($m[1]);
if (preg_match('#^/brief/([A-Za-z0-9_]{1,60})$#', $path, $m)) page_brief_report($m[1]);
if (preg_match('#^/brief/([A-Za-z0-9_]{1,60})/files/([A-Za-z0-9]{1,60})$#', $path, $m)) page_brief_file($m[1], $m[2]);
if (preg_match('#^/images/(.+)$#', $path, $m)) serve_upload($m[1]);

not_found();
