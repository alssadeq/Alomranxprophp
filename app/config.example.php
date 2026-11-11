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

    // إرسال عبر SMTP (مثل بريد Hostinger: smtp.hostinger.com على 465). اتركه فارغاً لاستخدام بريد الاستضافة الافتراضي.
    'smtp_host' => '',
    'smtp_port' => 465,
    'smtp_user' => '',
    'smtp_pass' => '',

    'timezone' => 'Asia/Riyadh',
];
