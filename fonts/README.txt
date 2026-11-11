خطوط الموقع
===========

الملفات في هذا المجلد تُعرَّف في public/css/fonts.css، وتظهر في لوحة التحكم ←
الهوية والمظهر ← الخطوط، حيث يُختار خط لكل من: العناوين الرئيسية، العناوين
الثانوية، المحتوى، والأزرار، مع أحجام العنوان الرئيسي والثانوي والمحتوى.

  IBM Plex Sans Arabic  ibm-plex-sans-arabic-{arabic|latin}-{400|500|600|700}-normal.woff2
                        (ملف للحروف العربية وملف للحروف اللاتينية لكل وزن؛ يحمّل المتصفح
                        الملف الذي يحتاجه النص فقط)
  Clash Display         ClashDisplay-Variable.ttf   (لاتيني)
  Emad Diana Extra      Emad-DianaeXtra-Normal.otf  (عربي)
  Stolzl Book           Stolzl-Book.otf             (لاتيني)

إضافة خط جديد للمكتبة تتطلب: رفع ملفه هنا، وإضافة @font-face في css/fonts.css،
وإضافته إلى FONT_LIBRARY في lib/typography.js و public/script.js و public/js/dashboard.js.
