<?php
// انسخ هذا الملف باسم config.php داخل مجلد app (اختياري).
// لا تُرفع config.php إلى GitHub لأنها قد تحتوي كلمة مرور البريد.
return [
    // عنوان الموقع الرسمي (لروابط المشاركة والبريد). اتركه فارغاً ليؤخذ من الطلب تلقائياً.
    'base_url' => 'https://alomrango.com',

    // البريد الذي تصله إشعارات الطلبات إن لم تُضبط المستلمين من لوحة التحكم
    'notify_email' => '',

    // المرسل. يُفضّل بريد على نفس الدومين مثل info@alomrango.com
    'mail_from' => 'info@alomrango.com',
    'mail_from_name' => 'العمران الذهبية للمقاولات العامة',

    // يُفضّل ضبط بريد الشركة من لوحة التحكم. هذا بديل اختياري (مثل smtp.hostinger.com على 465).
    'smtp_host' => '',
    'smtp_port' => 465,
    'smtp_user' => '',
    'smtp_pass' => '',

    'timezone' => 'Asia/Riyadh',

    // نفس SESSION_SECRET في استضافة Node القديمة لتعمل مفاتيح الذكاء الاصطناعي المحفوظة (اختياري)
    'session_secret' => '',

    // رمز التهيئة لإنشاء أول حساب (اختياري؛ يُنشأ تلقائياً في data/bootstrap-token.txt)
    'bootstrap_token' => '',

    // false لإيقاف الإرسال عبر بريد الاستضافة الافتراضي (mail) إن لم يُضبط بريد الشركة
    'php_mail' => true,
];
