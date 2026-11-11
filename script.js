// =============================================================
// سكريبت مشترك لكل صفحات الموقع (الرئيسية، من نحن، مشاريعنا)
// يشمل الآن: تحميل الإعدادات والبانرات من لوحة التحكم، عرض الأعمال
// ديناميكياً من قاعدة البيانات، معرض صور بالسحب لكل عمل، وستديو
// تصفح صور بملء الشاشة (Lightbox)، وتوسيط الشعار على الجوال.
// كل جزء يتحقق أولاً من وجود عناصره في الصفحة قبل التشغيل.
// =============================================================

const CATEGORY_LABELS = {
  ar: { residential: 'سكني', commercial: 'تجاري', industrial: 'صناعي' },
  en: { residential: 'Residential', commercial: 'Commercial', industrial: 'Industrial' },
};

/* =============================================================
   محرك الترجمة (عربي/إنجليزي)
   ============================================================= */
const LANG_KEY = 'alomran_lang';

function getLang() {
  return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'ar';
}

// يستخرج النص المناسب من أي حقل ثنائي اللغة {ar, en}؛ يتراجع للعربي
// ثم للإنجليزي إن كانت اللغة المطلوبة فارغة، أو يعيد النص كما هو لو
// كان أصلاً نصاً عادياً (توافق مع أي بيانات قديمة).
function pick(field) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  const lang = getLang();
  return field[lang] || field.ar || field.en || '';
}

// كل النصوص الثابتة بالواجهة (القائمة، الأزرار، العناوين الثابتة،
// نصوص النماذج، الفوتر) — غير المرتبطة ببيانات لوحة التحكم.
const STATIC_TEXT = {
  navHome: { ar: 'الرئيسية', en: 'Home' },
  navAbout: { ar: 'العمران', en: 'Alomran' },
  navServices: { ar: 'خدماتنا', en: 'Services' },
  navProjects: { ar: 'أعمالنا', en: 'Our Work' },
  navContact: { ar: 'تواصل معنا', en: 'Contact' },
  loginLink: { ar: 'تسجيل الدخول', en: 'Login' },
  quoteBtn: { ar: 'اطلب عرض سعر', en: 'Request a Quote' },
  browseProjectsBtn: { ar: 'استعرض مشاريعنا', en: 'Browse Our Projects' },
  heroTrust: { ar: 'ضمانات معتمدة • فريق هندسي سعودي • تسليم في الوقت', en: 'Certified Warranties • Saudi Engineering Team • On-Time Delivery' },
  certifiedContractor: { ar: 'مقاول عام معتمد – كود البناء السعودي', en: 'Certified General Contractor – Saudi Building Code' },
  quoteNowBtn: { ar: 'اطلب عرض سعر الآن', en: 'Request a Quote Now' },
  aboutEyebrow2: { ar: 'عن العمران', en: 'About Alomran' },

  aboutEyebrow: { ar: 'عن العمران', en: 'About Alomran' },
  aboutTitle: { ar: 'خبرة سعودية في بناء ما يبقى', en: 'Saudi Expertise Building What Lasts' },
  readMoreBtn: { ar: 'قراءة المزيد عن الشركة', en: 'Read More About Us' },

  servicesEyebrow: { ar: 'خدماتنا', en: 'Our Services' },
  servicesTitle: { ar: 'حلول بناء متكاملة تحت سقف واحد', en: 'Complete Construction Solutions Under One Roof' },
  servicesSubtitle: { ar: 'ننفذ مشروعك بإدارة هندسية محترفة، من العظم حتى التسليم، مع التزام كامل بالجودة والوقت.', en: 'We execute your project with professional engineering management, from shell to handover, with full commitment to quality and time.' },

  projectsEyebrow: { ar: 'مشاريعنا', en: 'Our Projects' },
  projectsTitle: { ar: 'أعمال منفذة بمعايير العمران', en: 'Work Executed to Alomran Standards' },
  viewAllProjectsBtn: { ar: 'عرض جميع المشاريع', en: 'View All Projects' },
  filterAll: { ar: 'الكل', en: 'All' },
  filterResidential: { ar: 'سكني', en: 'Residential' },
  filterCommercial: { ar: 'تجاري', en: 'Commercial' },
  filterIndustrial: { ar: 'صناعي', en: 'Industrial' },
  areaLabel: { ar: 'المساحة', en: 'Area' },

  contactEyebrow: { ar: 'تواصل معنا', en: 'Contact Us' },
  contactTitle: { ar: 'خلنا نبني مشروعك القادم معاً', en: "Let's Build Your Next Project Together" },
  contactSubtitle: { ar: 'عبئ النموذج وسيتواصل معك مدير المشاريع لتحديد موعد زيارة أو مكالمة تعريفية.', en: 'Fill out the form and our project manager will contact you to arrange a visit or introductory call.' },
  formNameLabel: { ar: 'الاسم الكامل', en: 'Full Name' },
  formNamePlaceholder: { ar: 'اكتب اسمك الكامل', en: 'Your full name' },
  formPhoneLabel: { ar: 'رقم الجوال', en: 'Phone Number' },
  formProjectTypeLabel: { ar: 'نوع المشروع', en: 'Project Type' },
  formProjectTypeChoose: { ar: 'اختر نوع المشروع', en: 'Choose project type' },
  formProjectTypeVilla: { ar: 'فيلا', en: 'Villa' },
  formProjectTypeResidential: { ar: 'مبنى سكني', en: 'Residential Building' },
  formProjectTypeCommercial: { ar: 'مبنى تجاري', en: 'Commercial Building' },
  formProjectTypeFactory: { ar: 'مصنع / مستودع', en: 'Factory / Warehouse' },
  formProjectTypeOther: { ar: 'أخرى', en: 'Other' },
  formMessageLabel: { ar: 'الرسالة', en: 'Message' },
  formMessagePlaceholder: { ar: 'اذكر المدينة والمساحة التقريبية وتفاصيل مشروعك...', en: 'Mention the city, approximate area, and your project details...' },
  formConsent: { ar: 'أوافق على التواصل معي بخصوص هذا الطلب، والاحتفاظ ببياناتي لغرض تقديم عرض السعر.', en: 'I agree to be contacted regarding this request, and for my data to be kept for the purpose of providing a quote.' },
  formSubmitBtn: { ar: 'إرسال الطلب', en: 'Submit Request' },
  followUs: { ar: 'تابعنا على', en: 'Follow Us' },
  workingHours: { ar: 'الأحد – الخميس | 8:00 ص – 5:00 م', en: 'Sunday – Thursday | 8:00 AM – 5:00 PM' },
  openInMaps: { ar: 'افتح في خرائط جوجل', en: 'Open in Google Maps' },

  footerAbout: { ar: 'عن العمران', en: 'About Us' },
  footerServices: { ar: 'خدماتنا', en: 'Services' },
  footerProjects: { ar: 'المشاريع', en: 'Projects' },
  footerContact: { ar: 'تواصل معنا', en: 'Contact' },
  footerCompanyCol: { ar: 'الشركة', en: 'Company' },
  footerServicesCol: { ar: 'خدماتنا', en: 'Services' },
  footerContactCol: { ar: 'تواصل', en: 'Contact' },
  footerTagline: { ar: 'شركة سعودية متخصصة في تنفيذ وإدارة المشاريع السكنية والتجارية والصناعية. نبني بثقة، من الفكرة إلى التسليم.', en: 'A Saudi company executing and managing residential, commercial and industrial projects. We build with trust, from concept to handover.' },
  copyright: { ar: '© 2026 جميع الحقوق محفوظة لشركة العمران الذهبية للمقاولات العامة.', en: '© 2026 All rights reserved — Alomran Al-Dhahabiya General Contracting.' },
  companyName: { ar: 'العمران الذهبية', en: 'Alomran Al-Dhahabiya' },
  svcVillasFooter: { ar: 'الفلل السكنية', en: 'Residential Villas' },
  svcBuildingsFooter: { ar: 'المباني التجارية', en: 'Commercial Buildings' },
  svcFactoriesFooter: { ar: 'المصانع والمستودعات', en: 'Factories & Warehouses' },
  svcFinishingFooter: { ar: 'التشطيب والإشراف', en: 'Finishing & Supervision' },
  jeddahKsa: { ar: 'جدة، المملكة العربية السعودية', en: 'Jeddah, Saudi Arabia' },

  quickCta: { ar: 'تواصل معنا', en: 'Contact Us' },

  breadcrumbHome: { ar: 'الرئيسية', en: 'Home' },
  breadcrumbAbout: { ar: 'من نحن', en: 'About Us' },
  breadcrumbProjects: { ar: 'مشاريعنا', en: 'Projects' },

  aboutPageEyebrow: { ar: 'من نحن', en: 'About Us' },
  aboutPageH1: { ar: 'خبرة في البناء، والتزام في التنفيذ', en: 'Experience in Building, Commitment in Execution' },
  storyEyebrow: { ar: 'قصتنا', en: 'Our Story' },
  storyH2: { ar: 'نمو تدريجي وخبرة متراكمة', en: 'Steady Growth, Accumulated Experience' },
  missionVisionEyebrow: { ar: 'رسالتنا ورؤيتنا', en: 'Mission & Vision' },
  missionVisionH2: { ar: 'نبني قيمة تتجاوز حدود المشروع', en: 'Building Value Beyond the Project' },
  valuesEyebrow: { ar: 'قيمنا', en: 'Our Values' },
  valuesH2: { ar: 'مبادئ تحكم كل قرار تنفيذي', en: 'Principles Behind Every Execution Decision' },
  timelineEyebrow: { ar: 'مسيرتنا', en: 'Our Journey' },
  timelineH2: { ar: 'محطات في طريق العمران', en: 'Milestones Along Alomran\'s Path' },
  teamEyebrow: { ar: 'فريق العمل', en: 'Our Team' },
  teamH2: { ar: 'فرق متخصصة لكل مرحلة من مشروعك', en: 'Specialised Teams for Every Stage of Your Project' },
  certsEyebrow: { ar: 'الاعتمادات والشهادات', en: 'Certifications' },
  licensesEyebrow: { ar: 'الشهادات والتراخيص', en: 'Licenses & Certificates' },
  licensesH2: { ar: 'تراخيص وشهادات رسمية معتمدة', en: 'Official, Accredited Licenses' },
  licensesText: { ar: 'نعمل وفق تراخيص وشهادات نظامية تضمن لعملائنا الموثوقية والالتزام بالأنظمة.', en: 'We operate under official licenses and certificates that assure our clients of reliability and compliance.' },
  awardsEyebrow: { ar: 'التكريم والشكر والتقدير', en: 'Awards & Appreciation' },
  awardsH2: { ar: 'ثقة نعتز بها', en: 'Trust We Are Proud Of' },
  awardsText: { ar: 'شهادات تكريم من جهات رسمية، وخطابات شكر وتقدير من عملائنا على مشاريع أنجزناها.', en: 'Awards from official bodies and letters of appreciation from our clients for projects we delivered.' },
  partnersEyebrow: { ar: 'شركاؤنا', en: 'Our Partners' },
  partnersH2: { ar: 'شركاء النجاح', en: 'Partners in Success' },
  partnersText: { ar: 'نفخر بالعمل مع نخبة من الجهات والشركات الرائدة.', en: 'We are proud to work with leading organisations and companies.' },
  certsH2: { ar: 'معايير موثّقة، لا مجرد وعود', en: 'Documented Standards, Not Just Promises' },

  projectsPageH1: { ar: 'مشاريع تعكس خبرة التنفيذ', en: 'Projects That Reflect Our Execution Expertise' },
  filterByTypeEyebrow: { ar: 'تصفية حسب النوع', en: 'Filter by Type' },
  allProjectsH2: { ar: 'جميع المشاريع', en: 'All Projects' },

  statProjectsDone: { ar: 'مشروع منجز', en: 'Completed Projects' },
  heroFloatOngoing: { ar: 'مشاريع في مختلف مناطق المملكة', en: 'Projects Across the Kingdom' },
  checklistQuality: { ar: 'جودة تنفيذ مطابقة للمواصفات', en: 'Execution Quality Matching Specifications' },
  checklistTime: { ar: 'التزام بمواعيد التسليم', en: 'Commitment to Handover Dates' },
  checklistTransparency: { ar: 'شفافية في التكاليف والتقارير', en: 'Transparent Costs and Reporting' },
  checklistSafety: { ar: 'سلامة ومسؤولية في كل موقع', en: 'Safety and Responsibility on Every Site' },
  statYears: { ar: 'سنة خبرة', en: 'Years of Experience' },
  statSatisfaction: { ar: 'رضا العملاء', en: 'Client Satisfaction' },
  statCitiesServed: { ar: 'منطقة نغطيها', en: 'Regions Covered' },
  ctaHomeTitle: { ar: 'جاهز تبدأ مشروعك مع العمران؟', en: 'Ready to Start Your Project with Alomran?' },
  ctaHomeText: { ar: 'أرسل تفاصيل مشروعك، وسيتواصل معك فريقنا خلال 24 ساعة بجدول وتكلفة تقديرية واضحة.', en: 'Send your project details, and our team will contact you within 24 hours with a clear schedule and estimated cost.' },
  formHint: { ar: 'متوسط وقت الرد: خلال يوم عمل واحد. جميع العروض مجانية وغير ملزمة.', en: 'Average response time: within one business day. All quotes are free and non-binding.' },
  contactCardTitle: { ar: 'العمران الذهبية للمقاولات العامة', en: 'Alomran Al-Dhahabiya General Contracting' },
  contactCardDesc: { ar: 'ننفذ مشاريع سكنية وتجارية وصناعية في كافة مناطق المملكة العربية السعودية، انطلاقاً من مقرنا في جدة.', en: 'We deliver residential, commercial and industrial projects across all regions of Saudi Arabia, from our base in Jeddah.' },
  brandNameStrong: { ar: 'العمران', en: 'Alomran' },
  brandNameSmall: { ar: 'الذهبية للمقاولات العامة', en: 'Al-Dhahabiya General Contracting' },

  aboutPageIntro: { ar: 'شركة سعودية متخصصة في تنفيذ وإدارة المشاريع الإنشائية والسكنية والتجارية والصناعية منذ عام 2009، نعتمد منهجية واضحة تبدأ بفهم احتياجات العميل وتنتهي بالتسليم وفق المتطلبات المتفق عليها.', en: "A Saudi company executing and managing construction, residential, commercial and industrial projects since 2009, with a clear methodology that starts with understanding the client's needs and ends with handover to the agreed requirements." },
  ctaAboutTitle: { ar: 'عندك فكرة مشروع؟ خلنا نحوّلها لخطة تنفيذ واضحة', en: 'Have a Project Idea? Let Us Turn It Into a Clear Execution Plan' },
  ctaAboutText: { ar: 'احصل على استشارة أولية مجانية وعرض سعر تقديري خلال 24 ساعة.', en: 'Get a free initial consultation and an estimated quote within 24 hours.' },
  contactNowBtn: { ar: 'تواصل معنا الآن', en: 'Contact Us Now' },

  projectsPageIntro: { ar: 'نماذج مختارة من مشاريع الشركة في القطاعات السكنية والتجارية والصناعية، منفذة بمعايير كود البناء السعودي.', en: 'Selected projects from our residential, commercial and industrial work, executed to Saudi Building Code standards.' },
  ctaProjectsTitle: { ar: 'عجبك مشروع مشابه لفكرتك؟', en: 'Liked a Project Similar to Your Idea?' },
  ctaProjectsText: { ar: 'أرسل تفاصيل مشروعك وسيتواصل معك فريقنا خلال 24 ساعة بجدول وتكلفة تقديرية واضحة.', en: 'Send your project details and our team will contact you within 24 hours with a clear schedule and estimated cost.' },

  relatedProjectsEyebrow: { ar: 'أعمال أخرى قد تعجبك', en: 'Other Projects You May Like' },
  relatedProjectsH2: { ar: 'استعرض المزيد من مشاريعنا', en: 'Explore More of Our Projects' },
};
// نصوص الأقسام والصفحات المضافة (public/js/site-text.js) إن كان محمّلاً في الصفحة
if (window.SITE_TEXT_EXTRA) Object.assign(STATIC_TEXT, window.SITE_TEXT_EXTRA);

// يطبّق النصوص الثابتة على كل عنصر يحمل data-i18n="key"، ويدعم أيضاً
// data-i18n-placeholder للحقول التي تحتاج ترجمة الـ placeholder بدل النص.
function applyStaticTranslations() {
  const lang = getLang();
  document.querySelectorAll('[data-i18n]').forEach(elm => {
    const key = elm.getAttribute('data-i18n');
    const entry = STATIC_TEXT[key];
    if (entry) elm.textContent = entry[lang] || entry.ar;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(elm => {
    const key = elm.getAttribute('data-i18n-placeholder');
    const entry = STATIC_TEXT[key];
    if (entry) elm.setAttribute('placeholder', entry[lang] || entry.ar);
  });
}

let dynamicRerenderFn = null; // تُسجَّل لاحقاً بعد تحميل الإعدادات لأول مرة

function setLanguage(lang) {
  lang = lang === 'en' ? 'en' : 'ar';
  localStorage.setItem(LANG_KEY, lang);
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.body.classList.toggle('lang-en', lang === 'en');
  applyStaticTranslations();
  document.querySelectorAll('.lang-toggle-label').forEach(el => {
    el.textContent = lang === 'ar' ? 'EN' : 'AR';
  });
  if (typeof dynamicRerenderFn === 'function') dynamicRerenderFn();
}

function setupLanguageToggle() {
  document.querySelectorAll('[data-lang-toggle]').forEach(btn => {
    btn.addEventListener('click', () => setLanguage(getLang() === 'ar' ? 'en' : 'ar'));
  });
}


/* ---------------- القائمة على الجوال + توسيط الشعار عند الفتح ---------------- */
const menuToggle = document.getElementById('menuToggle');
const mainNav = document.getElementById('mainNav');
const siteHeader = document.querySelector('.site-header');
if (menuToggle && mainNav) {
  const setMenu = (open) => {
    mainNav.classList.toggle('open', open);
    menuToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (siteHeader) siteHeader.classList.toggle('nav-open', open);
  };
  menuToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    setMenu(!mainNav.classList.contains('open'));
  });
  mainNav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
  // إغلاق القائمة عند النقر خارجها أو الضغط على Escape
  document.addEventListener('click', (e) => {
    if (mainNav.classList.contains('open') && !mainNav.contains(e.target)) setMenu(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mainNav.classList.contains('open')) { setMenu(false); menuToggle.focus(); }
  });
}

/* ---------------- تمييز الرابط النشط أثناء التمرير ---------------- */
const trackedSections = ['home', 'about', 'services', 'projects', 'contact']
  .map(id => document.getElementById(id))
  .filter(Boolean);
if (trackedSections.length) {
  const navLinks = [...document.querySelectorAll('.main-nav a')];
  const navObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        navLinks.forEach(l => {
          const href = l.getAttribute('href') || '';
          l.classList.toggle('is-active', href === '#' + id || href.endsWith('#' + id));
        });
      }
    });
  }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
  trackedSections.forEach(s => navObserver.observe(s));
}

/* ---------------- ظهور واختفاء تدريجي عند التمرير ---------------- */
// كل كتلة محتوى في الصفحة تظهر تدريجياً عند دخولها الشاشة وتختفي تدريجياً عند خروجها
// (في الاتجاهين)، وبطاقات الشبكات تظهر واحدة تلو الأخرى. تُضاف العناصر تلقائياً، بما فيها
// المحتوى الذي يُحمَّل لاحقاً (المشاريع، الخدمات، الفريق...). يتوقف عند تفعيل "تقليل الحركة".
const REDUCED_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const GRID_RE = /(^|[-_\s])(grid|steps|list|timeline|cards|stats)([-_\s]|$)/;
const revealIO = !REDUCED_MOTION && 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    const el = e.target;
    clearTimeout(el._revealTimer);
    if (e.isIntersecting) {
      el.removeAttribute('data-reveal-dir');
      el.classList.add('reveal');
      requestAnimationFrame(() => el.classList.add('in'));
      // بعد اكتمال الظهور تُزال فئات الحركة حتى تعمل تأثيرات العنصر نفسه (مثل حركة البطاقات عند المرور)
      const delay = 800 + (parseInt(el.style.getPropertyValue('--reveal-i'), 10) || 0) * 80;
      el._revealTimer = setTimeout(() => el.classList.remove('reveal', 'in'), delay);
    } else {
      // يخرج من أعلى الشاشة (تمرير للأسفل) فيختفي صاعداً، ومن أسفلها فيختفي نازلاً
      el.setAttribute('data-reveal-dir', e.boundingClientRect.top < 0 ? 'up' : 'down');
      el.classList.add('reveal');
      el.classList.remove('in');
    }
  });
}, { rootMargin: '-6% 0px -6% 0px', threshold: 0 }) : null;
if (revealIO) document.documentElement.classList.add('js-motion');

const isGrid = (el) => el.children.length >= 2 && GRID_RE.test(el.className || '');
function tagReveal(el, index) {
  if (!el || el.nodeType !== 1 || el.dataset.revealBound) return;
  if (/^(SCRIPT|STYLE|TEMPLATE|BR)$/.test(el.tagName) || el.hidden) return;
  el.dataset.revealBound = '1';
  if (!el.classList.contains('in')) el.classList.add('reveal');
  if (index !== undefined) el.style.setProperty('--reveal-i', Math.min(index, 6));
  revealIO.observe(el);
}
function revealBlock(el) {
  if (!el || el.nodeType !== 1) return;
  if (isGrid(el)) {
    // الشبكة نفسها تبقى ظاهرة، وتظهر بطاقاتها بالتتابع (قد تكون عُلِّمت ككتلة قبل تحميل بطاقاتها)
    if (el.dataset.revealBound) { revealIO.unobserve(el); clearTimeout(el._revealTimer); delete el.dataset.revealBound; el.removeAttribute('data-reveal-dir'); }
    el.classList.remove('reveal', 'in');
    [...el.children].forEach((child, i) => tagReveal(child, i));
    return;
  }
  // حاوية تضم شبكة أو عناصر مُعلَّمة مسبقاً: نعالج محتواها بدل تحريكها كاملة
  if (el.querySelector('.reveal, [data-reveal-bound]') || [...el.children].some(isGrid)) { [...el.children].forEach(revealBlock); return; }
  tagReveal(el);
}
function observeReveal(scope) {
  if (!revealIO) { (scope || document).querySelectorAll('.reveal').forEach(el => el.classList.add('in')); return; }
  const root = scope && scope !== document ? scope : null;
  if (root) { revealBlock(root); return; }
  document.querySelectorAll('.reveal').forEach(el => { if (isGrid(el)) revealBlock(el); else tagReveal(el); });
  document.querySelectorAll('main > section, main > div, footer').forEach((sec) => {
    const containers = sec.querySelectorAll(':scope > .container, :scope > .container-narrow, :scope > div');
    (containers.length ? [...containers] : [sec]).forEach(c => [...c.children].forEach(revealBlock));
  });
}
observeReveal(document);
// المحتوى الذي يُضاف لاحقاً من الإعدادات يُعالج تلقائياً
if (revealIO && document.querySelector('main')) {
  let pending = null;
  new MutationObserver((muts) => {
    muts.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) (pending = pending || new Set()).add(n.parentElement); }));
    if (!pending || pending.scheduled) return;
    pending.scheduled = true;
    requestAnimationFrame(() => {
      const parents = pending; pending = null;
      parents.forEach((p) => {
        if (!p) return;
        if (isGrid(p)) revealBlock(p);
        else if (p.closest('.reveal') == null) p.querySelectorAll(':scope > *').forEach(c => { if (isGrid(c)) revealBlock(c); });
      });
    });
  }).observe(document.querySelector('main'), { childList: true, subtree: true });
}

/* ---------------- Toast مشترك ---------------- */
const toast = document.getElementById('toast');
let toastTimer;
function showToast(msg) {
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3600);
}

/* ---------------- نموذج التواصل (الصفحة الرئيسية فقط) ---------------- */
const contactForm = document.getElementById('quoteForm');
if (contactForm) {
  contactForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = contactForm.name.value.trim();
    const phone = contactForm.phone.value.trim();
    const ptype = contactForm.ptype.value;
    const message = contactForm.message ? contactForm.message.value.trim() : '';
    const consent = document.getElementById('consent').checked;

    if (!name || phone.length < 9 || !ptype || !consent) {
      showToast('فضلاً أكمل البيانات المطلوبة بشكل صحيح.');
      return;
    }
    const waText = `مرحبا العمران الذهبية
الاسم: ${name}
الجوال: ${phone}
نوع المشروع: ${ptype}
الرسالة: ${message || '-'}`;
    const waUrl = 'https://wa.me/966555592666?text=' + encodeURIComponent(waText);

    // حفظ الرسالة في لوحة التحكم (لا يوقف فتح واتساب حتى لو فشل الحفظ)
    fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, projectType: ptype, message }),
    }).catch(() => {});

    window.open(waUrl, '_blank');
    showToast('تم فتح واتساب، سنتواصل معك قريباً.');
    contactForm.reset();
  });
}

/* =========================================================
   معرض صور المشروع داخل البطاقة: سحب يمين/يسار + أسهم + نقاط
   قابل للتطبيق على أي عنصر [data-gallery] يُنشأ حتى بعد تحميل
   الصفحة (يُستدعى من initGallery بعد بناء البطاقات ديناميكياً)
   ========================================================= */
function initGallery(gallery) {
  const slides = gallery.querySelector('.project-slides');
  if (!slides || gallery.dataset.galleryReady) return;
  gallery.dataset.galleryReady = '1';

  const imgs = Array.from(slides.children);
  const dotsWrap = gallery.querySelector('.thumb-dots');
  const prevBtn = gallery.querySelector('.thumb-nav.prev');
  const nextBtn = gallery.querySelector('.thumb-nav.next');
  let index = 0, startX = 0, currentX = 0, dragging = false;

  if (dotsWrap) {
    dotsWrap.innerHTML = '';
    imgs.forEach((_, i) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'thumb-dot' + (i === 0 ? ' is-active' : '');
      dot.setAttribute('aria-label', 'الانتقال للصورة ' + (i + 1));
      dot.addEventListener('click', (e) => { e.stopPropagation(); goTo(i); });
      dotsWrap.appendChild(dot);
    });
  }
  const dots = dotsWrap ? Array.from(dotsWrap.children) : [];

  function update() {
    slides.style.transform = `translateX(${index * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle('is-active', i === index));
  }
  function goTo(i) { index = Math.max(0, Math.min(imgs.length - 1, i)); update(); }
  function next() { goTo((index + 1) % imgs.length); }
  function prev() { goTo((index - 1 + imgs.length) % imgs.length); }

  if (prevBtn) prevBtn.addEventListener('click', (e) => { e.stopPropagation(); prev(); });
  if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); next(); });

  gallery.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; dragging = true; }, { passive: true });
  gallery.addEventListener('touchmove', (e) => { if (dragging) currentX = e.touches[0].clientX; }, { passive: true });
  gallery.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    const diff = currentX - startX;
    if (Math.abs(diff) > 40) { diff < 0 ? next() : prev(); }
    startX = 0; currentX = 0;
  });
  gallery.addEventListener('mousedown', (e) => { startX = e.clientX; dragging = true; });
  window.addEventListener('mousemove', (e) => { if (dragging) currentX = e.clientX; });
  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    const diff = currentX - startX;
    if (Math.abs(diff) > 40) { diff < 0 ? next() : prev(); }
    startX = 0; currentX = 0;
  });

  update();
  gallery._getIndex = () => index;
}
document.querySelectorAll('[data-gallery]').forEach(initGallery);

/* =========================================================
   ستديو تصفح الصور (Lightbox): يفتح بملء الشاشة عند الضغط على
   صورة المشروع أو اسمه، ويعرض كل صور نفس العمل بالتنقل الكامل
   ========================================================= */
function goToProjectPage(card, workId) {
  const thumb = card.querySelector('.project-thumb');
  const titleEl = card.querySelector('.project-body h3');
  const openPage = () => {
    window.location.href = '/project?id=' + encodeURIComponent(workId);
  };
  if (thumb) {
    thumb.style.cursor = 'pointer';
    thumb.addEventListener('click', (e) => {
      if (e.target.closest('.thumb-nav') || e.target.closest('.thumb-dot')) return;
      openPage();
    });
  }
  if (titleEl) {
    titleEl.style.cursor = 'pointer';
    titleEl.addEventListener('click', openPage);
  }
}

/* =========================================================
   بناء بطاقة مشروع ديناميكياً من بيانات لوحة التحكم
   ========================================================= */
function buildProjectCard(work, logoSrc) {
  const article = document.createElement('article');
  article.className = 'project-card';
  article.dataset.cat = work.category;

  const title = pick(work.title);
  const city = pick(work.city);
  const meta = pick(work.meta);
  const area = pick(work.area);
  const description = pick(work.description);

  const images = (work.images && work.images.length) ? work.images : [];
  const slidesHtml = images.map((src, i) =>
    `<img src="${escapeAttr(safeUrl(src, ""))}" alt="${escapeHtml(title)} - ${i + 1}" loading="lazy">`
  ).join('');

  article.innerHTML = `
    <div class="project-thumb" data-gallery>
      <div class="project-slides">${slidesHtml}</div>
      ${images.length > 1 ? `
        <button type="button" class="thumb-nav prev" aria-label="الصورة السابقة">‹</button>
        <button type="button" class="thumb-nav next" aria-label="الصورة التالية">›</button>
        <div class="thumb-dots"></div>
      ` : ''}
      ${logoSrc ? `<div class="project-logo-badge"><img src="${logoSrc}" alt="شعار العمران"></div>` : ''}
      <span class="project-tag">${CATEGORY_LABELS[getLang()][work.category] || work.category}</span>
    </div>
    <div class="project-body">
      <h3>${escapeHtml(title)}</h3>
      <div class="project-meta">${escapeHtml(city)}${meta ? ' <span class="meta-dot"></span> ' + escapeHtml(meta) : ''}</div>
      ${area ? `<div class="project-foot"><span>${STATIC_TEXT.areaLabel[getLang()]}</span><strong>${escapeHtml(area)}</strong></div>` : ''}
    </div>
  `;

  const galleryEl = article.querySelector('[data-gallery]');
  if (galleryEl) initGallery(galleryEl);
  goToProjectPage(article, work.id);

  return article;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function escapeAttr(str) { return escapeHtml(str == null ? '' : str); }
function safeUrl(url, fallback = '#') {
  const value = String(url || '').trim();
  if (!value) return fallback;
  if (/^(javascript|data|vbscript|file|blob):/i.test(value)) return fallback;
  if (/^(https?:\/\/|mailto:|tel:|\/images\/[A-Za-z0-9._-]+(?:\?.*)?)$/i.test(value) || value === '#') return value;
  return fallback;
}
function sanitizeSvgMarkup(value) {
  let svg = String(value || '').trim();
  if (!/^<svg\b/i.test(svg) || svg.length > 20000) return '';
  svg = svg.replace(/<\/?(script|iframe|object|embed|foreignObject|base|form)\b[^>]*>/gi, '');
  svg = svg.replace(/\s+on[a-z0-9_-]+\s*=\s*(['"']).*?\1/gi, '');
  svg = svg.replace(/\s+(?:href|xlink:href|src)\s*=\s*(['"])\s*(?:javascript|data|vbscript):.*?\1/gi, '');
  svg = svg.replace(/url\s*\(\s*(['"]?)(?:javascript|data|vbscript):.*?\1\s*\)/gi, 'none');
  return svg;
}

/* =========================================================
   جلب الإعدادات العامة (بانرات/خلفيات/سوشيال/شعار) وتطبيقها
   ========================================================= */
async function loadPublicSettings() {
  // الخادم يضمّن الإعدادات في الصفحة نفسها، فتُطبَّق فوراً دون انتظار طلب إضافي
  if (window.__SITE_SETTINGS__) { const s = window.__SITE_SETTINGS__; window.__SITE_SETTINGS__ = null; return s; }
  try {
    const res = await fetch('/api/settings/public');
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

/* =========================================================
   نظام إدارة وسائل التواصل الاجتماعي — عرض حي بالموقع
   يبني الأيقونات ديناميكياً من إعدادات لوحة التحكم (مو ثابتة
   بالكود)، ويحترم قواعد الإظهار (هيدر/فوتر/كمبيوتر/جوال)،
   ويسجّل نقرة حقيقية عند كل ضغطة من الزائر.
   ========================================================= */
const SOCIAL_ICON_LIBRARY = {
  instagram: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zM12 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>`,
  facebook: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.23.19 2.23.19v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12z"/></svg>`,
  twitter: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.847h-7.406l-5.8-7.584-6.638 7.584H.476l8.6-9.83L0 1.153h7.594l5.243 6.932L18.901 1.153zm-1.29 19.494h2.039L6.486 3.24H4.298L17.611 20.647z"/></svg>`,
  threads: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.523-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.781 3.63 2.695 6.54 2.717 2.623-.02 4.358-.643 5.8-2.08 1.641-1.639 1.611-3.646 1.088-4.878-.31-.73-.873-1.336-1.63-1.772-.192 1.363-.622 2.442-1.284 3.213-.87 1.014-2.093 1.567-3.638 1.645-1.184.06-2.324-.222-3.211-.792-1.048-.673-1.664-1.71-1.735-2.917-.14-2.36 1.755-4.056 4.717-4.226.99-.058 1.918-.014 2.775.13-.114-.685-.345-1.23-.688-1.628-.47-.545-1.196-.822-2.157-.822h-.028c-.775.004-1.833.214-2.502 1.234l-1.732-1.18c.9-1.37 2.373-2.125 4.146-2.128h.037c2.966 0 4.755 1.826 5.13 5.212.221.107.437.221.646.343 1.24.72 2.146 1.808 2.623 3.146.663 1.858.68 4.88-1.756 7.312-1.858 1.855-4.132 2.703-7.373 2.726Zm1.033-11.998c-.135 0-.27.002-.408.01-1.834.104-2.933.973-2.868 2.267.068 1.353 1.362 1.981 2.607 1.915 1.226-.065 2.822-.564 3.086-3.61a8.096 8.096 0 0 0-2.417-.582Z"/></svg>`,
  whatsapp: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12 21.785c-1.973 0-3.916-.523-5.6-1.514l-.402-.238-4.166 1.093 1.114-4.06-.263-.415A9.719 9.719 0 0 1 1.238 12c0-5.397 4.393-9.788 9.793-9.788 2.617 0 5.076 1.02 6.923 2.868a9.716 9.716 0 0 1 2.869 6.92c0 5.398-4.393 9.789-9.793 9.789zM12 0C5.373 0 0 5.372 0 12c0 2.116.552 4.184 1.6 6.005L0 24l6.13-1.606A11.94 11.94 0 0 0 12 24c6.627 0 12-5.372 12-12S18.627 0 12 0z"/></svg>`,
  telegram: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>`,
  youtube: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
  tiktok: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.6 5.82s.51.5 0 0A4.278 4.278 0 0 1 15.54 3h-3.09v12.4a2.592 2.592 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48z"/></svg>`,
  snapchat: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.2c2.8 0 5.1 2.2 5.1 5v2.2c0 .4.2.7.6.9.6.3 1.2.6 1.6 1 .3.3.4.7.2 1.1-.3.5-.9.8-1.7 1 .5.8 1.3 1.3 2.3 1.5.4.1.6.4.5.8-.2.8-1.3 1.3-2.5 1.4-.5.1-.8.3-.9.7-.2 1.2-1.4 2-2.7 1.7-.5-.1-1-.3-1.5-.7-.5.4-1 .6-1.5.7-1.3.3-2.5-.5-2.7-1.7-.1-.4-.4-.6-.9-.7-1.2-.1-2.3-.6-2.5-1.4-.1-.4.1-.7.5-.8 1-.2 1.8-.7 2.3-1.5-.8-.2-1.4-.5-1.7-1-.2-.4-.1-.8.2-1.1.4-.4 1-.7 1.6-1 .4-.2.6-.5.6-.9V7.2c0-2.8 2.3-5 5.1-5z"/></svg>`,
  linkedin: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452H16.89v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.346V9h3.414v1.561h.049c.476-.9 1.637-1.85 3.37-1.85 3.604 0 4.268 2.372 4.268 5.456v6.285zM5.337 7.433a2.063 2.063 0 1 1 0-4.126 2.063 2.063 0 0 1 0 4.126zM7.119 20.452H3.555V9h3.564v11.452z"/></svg>`,
  pinterest: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.237 2.648 7.856 6.38 9.316-.088-.79-.168-2.004.035-2.869.183-.781 1.172-4.978 1.172-4.978s-.298-.597-.298-1.48c0-1.388.805-2.425 1.808-2.425.852 0 1.263.638 1.263 1.404 0 .856-.545 2.135-.827 3.322-.236.992.498 1.802 1.476 1.802 1.771 0 3.132-1.867 3.132-4.56 0-2.384-1.715-4.05-4.163-4.05-2.836 0-4.5 2.126-4.5 4.325 0 .856.329 1.773.739 2.271a.298.298 0 0 1 .069.285c-.076.315-.247.991-.281 1.129-.044.182-.146.221-.338.134-1.263-.586-2.051-2.428-2.051-3.906 0-3.18 2.31-6.098 6.661-6.098 3.497 0 6.215 2.492 6.215 5.823 0 3.474-2.191 6.27-5.231 6.27-1.021 0-1.982-.53-2.309-1.157l-.628 2.392c-.227.87-.841 1.961-1.252 2.626.942.291 1.946.448 2.985.448 5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>`,
  discord: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>`,
  reddit: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.612.612-1.847.827-2.512.827-.665 0-1.9-.215-2.512-.827a.326.326 0 0 0-.232-.094z"/></svg>`,
  behance: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 7h6a3 3 0 0 1 0 6H2z M2 13h6.5a3 3 0 0 1 0 6H2z M15 12a4.5 4.5 0 1 1 9 .3c0 .2 0 .4 0 .5h-7 M15.5 7h5.5"/></svg>`,
  dribbble: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zm9.885 11.441c-.117-.023-4.633-.977-9.174-.394-.36-.783-.727-1.55-1.106-2.302 4.848-2.135 6.858-5.191 6.883-5.24a10.35 10.35 0 0 1 3.397 7.936zM12 1.769c2.298 0 4.407.82 6.049 2.183-.017.024-1.937 2.878-6.582 4.783C9.257 5.02 6.976 2.288 6.63 1.888 8.253 1.187 10.076.9 12 1.769zm-6.917.667c.28.317 2.529 2.958 4.807 6.567-6.09 1.622-11.464 1.591-11.994 1.581A10.44 10.44 0 0 1 5.083 2.436zM1.13 12.008c0-.11.006-.219.01-.328.526.011 6.786.088 13.274-1.822.372.723.72 1.457 1.043 2.194-.169.048-.336.098-.5.152C8.244 14 5.294 20.157 5.023 20.744A10.4 10.4 0 0 1 1.13 12.008zm11.887 10.29a10.3 10.3 0 0 1-6.115-1.987c.226-.457 2.34-4.635 8.916-6.783a.05.05 0 0 1 .02-.006c1.535 3.921 2.156 7.209 2.312 8.135a10.4 10.4 0 0 1-5.133 2.641zm6.6-3.62c-.111-.66-.7-3.822-2.132-7.681 4.28-.68 8.03.427 8.435.55a10.463 10.463 0 0 1-6.303 7.13z"/></svg>`,
  github: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>`,
  gitlab: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.955 13.587l-1.342-4.135-2.664-8.189a.455.455 0 0 0-.867 0L16.418 9.45H7.582L4.918 1.263a.455.455 0 0 0-.867 0L1.386 9.45.044 13.587a.924.924 0 0 0 .331 1.023l11.507 8.335a.492.492 0 0 0 .586 0l11.507-8.335a.924.924 0 0 0 .331-1.023"/></svg>`,
  vimeo: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22.396 7.164c-.093 2.026-1.507 4.8-4.245 8.32-2.83 3.68-5.226 5.52-7.187 5.52-1.215 0-2.24-1.122-3.08-3.368-.56-2.052-1.118-4.104-1.68-6.157-.622-2.246-1.29-3.368-2.004-3.368-.156 0-.7.328-1.635.98l-.98-1.26a300 300 0 0 0 3.032-2.706c1.372-1.184 2.402-1.81 3.09-1.876 1.624-.156 2.624.954 3 3.33.404 2.563.685 4.157.84 4.782.466 2.11 1.005 3.163 1.618 3.163.475 0 1.19-.751 2.146-2.253.955-1.503 1.466-2.646 1.537-3.435.14-1.301-.376-1.953-1.537-1.953-.549 0-1.113.126-1.692.375 1.124-3.68 3.27-5.47 6.438-5.372 2.35.073 3.458 1.591 3.328 4.556z"/></svg>`,
  twitch: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0 1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/></svg>`,
  spotify: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.48.12-1.021-.12-1.141-.6-.12-.48.12-1.02.6-1.14 4.32-1.32 9.719-.66 13.379 1.62.361.181.54.78.24 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.6.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`,
  soundcloud: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M1.175 12.225c-.051 0-.094.046-.101.104l-.233 2.154.233 2.105c.007.058.05.104.101.104.05 0 .09-.046.099-.104l.255-2.105-.255-2.154c-.009-.058-.05-.104-.099-.104M0 12.283c-.049 0-.085.046-.085.104l-.007 2.037.007 2.017c0 .058.036.104.085.104.048 0 .085-.046.085-.104l.009-2.017-.009-2.037c0-.058-.037-.104-.085-.104m4.703-1.8c-.081 0-.144.06-.153.145l-.219 3.751.219 3.633c.009.084.072.144.153.144.081 0 .144-.06.153-.144l.246-3.633-.246-3.751c-.009-.084-.072-.145-.153-.145m1.216-.183c-.09 0-.162.072-.171.162l-.211 3.933.211 3.807c.009.09.081.162.171.162.09 0 .162-.072.171-.162l.235-3.807-.235-3.933c-.009-.09-.081-.162-.171-.162m8.6-1.194a5.53 5.53 0 0 0-2.32.51 6.617 6.617 0 0 0-11.6 1.05 3.87 3.87 0 0 0-.7-.06c-2.1 0-3.8 1.7-3.8 3.8s1.7 3.8 3.8 3.8h14.62a3.51 3.51 0 0 0 3.5-3.55c0-3.087-2.5-5.55-3.5-5.55z"/></svg>`,
  medium: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.54 12a6.8 6.8 0 0 1-6.77 6.82A6.8 6.8 0 0 1 0 12a6.8 6.8 0 0 1 6.77-6.82A6.8 6.8 0 0 1 13.54 12zM20.96 12c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.38-2.88-3.38-6.42s1.51-6.42 3.38-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z"/></svg>`,
  figma: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 24c2.208 0 4-1.792 4-4v-4H8c-2.208 0-4 1.792-4 4s1.792 4 4 4zM4 12c0-2.208 1.792-4 4-4h4v8H8c-2.208 0-4-1.792-4-4zM4 4c0-2.208 1.792-4 4-4h4v8H8C5.792 8 4 6.208 4 4zM12 0h4c2.208 0 4 1.792 4 4s-1.792 4-4 4h-4V0zM20 12c0 2.208-1.792 4-4 4s-4-1.792-4-4 1.792-4 4-4 4 1.792 4 4z"/></svg>`,
  email: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>`,
  website: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24zm7.94 8h-3.19a15.9 15.9 0 0 0-1.4-4.16A8.03 8.03 0 0 1 19.94 8zM12 2.04c.83 1.2 1.66 2.8 2.14 5.96H9.86c.48-3.16 1.31-4.76 2.14-5.96zM2.26 14a7.9 7.9 0 0 1 0-4h3.7a16.5 16.5 0 0 0 0 4h-3.7zm.8 2h3.19a15.9 15.9 0 0 0 1.4 4.16A8.03 8.03 0 0 1 3.06 16zm3.19-8H3.06a8.03 8.03 0 0 1 4.6-4.16A15.9 15.9 0 0 0 6.26 8zM12 21.96c-.83-1.2-1.66-2.8-2.14-5.96h4.28c-.48 3.16-1.31 4.76-2.14 5.96zM14.36 14H9.64a14.5 14.5 0 0 1 0-4h4.72a14.5 14.5 0 0 1 0 4zm.29 6.16a15.9 15.9 0 0 0 1.4-4.16h3.19a8.03 8.03 0 0 1-4.6 4.16zM18.04 14a16.5 16.5 0 0 0 0-4h3.7a7.9 7.9 0 0 1 0 4h-3.7z"/></svg>`,
  rss: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4a16 16 0 0 1 16 16h-3.5A12.5 12.5 0 0 0 4 7.5V4zm0 6.5A9.5 9.5 0 0 1 13.5 20H10a6 6 0 0 0-6-6v-3.5zM6.18 17.82a1.82 1.82 0 1 1-3.64 0 1.82 1.82 0 0 1 3.64 0z"/></svg>`,
};

function socialShapeRadius(shape) {
  return shape === 'circle' ? '50%' : shape === 'square' ? '4px' : '13px';
}
function socialShadowCss(level) {
  return { none: 'none', light: '0 4px 10px rgba(0,0,0,.15)', medium: '0 6px 16px rgba(0,0,0,.28)', strong: '0 10px 26px rgba(0,0,0,.4)' }[level] || 'none';
}
function socialIconSvg(p) {
  return (p.iconKey === 'custom' && p.customSvg) ? sanitizeSvgMarkup(p.customSvg) : (SOCIAL_ICON_LIBRARY[p.iconKey] || SOCIAL_ICON_LIBRARY.website);
}
function socialIsMobileViewport() {
  return window.matchMedia('(max-width: 760px)').matches;
}
function socialPlatformVisibleHere(p, containerType) {
  if (containerType === 'header' && !p.showHeader) return false;
  if (containerType === 'footer' && !p.showFooter) return false;
  if (socialIsMobileViewport() && !p.showMobile) return false;
  if (!socialIsMobileViewport() && !p.showDesktop) return false;
  return true;
}
function socialIconHTML(p) {
  const border = p.borderEnabled ? `border:${p.borderWidth || 1}px solid ${p.borderColor || '#ffffff'};` : 'border:none;';
  const radius = socialShapeRadius(p.shape);
  const safeName = escapeHtml(p.name || '');

  if (p.iconKey === 'upload' && p.iconImageUrl) {
    return `<a href="${p.url || '#'}" target="_blank" rel="noopener" aria-label="${safeName}"
      class="dynamic-social-icon" data-platform-id="${p.id}"
      style="display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:${radius};overflow:hidden;box-shadow:${socialShadowCss(p.shadow)};${border}box-sizing:border-box;transition:transform .2s ease, box-shadow .2s ease;">
      <img src="${p.iconImageUrl}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;">
    </a>`;
  }
  return `<a href="${p.url || '#'}" target="_blank" rel="noopener" aria-label="${safeName}"
    class="dynamic-social-icon" data-platform-id="${p.id}"
    style="display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:${radius};background:${p.bgColor};color:${p.iconColor};box-shadow:${socialShadowCss(p.shadow)};${border}box-sizing:border-box;transition:transform .2s ease, box-shadow .2s ease;">
    ${socialIconSvg(p)}
  </a>`;
}
function renderSocialInto(container, platforms, containerType) {
  if (!container) return;
  const visible = platforms.filter(p => socialPlatformVisibleHere(p, containerType));
  container.innerHTML = visible.map(socialIconHTML).join('');
}
async function recordSocialClick(platformId) {
  try {
    await fetch('/api/public/social/click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: parseInt(platformId, 10) }),
    });
  } catch (e) { /* أفضل جهد فقط، لا يوقف انتقال الزائر للرابط */ }
}
document.addEventListener('click', (e) => {
  const link = e.target.closest('.dynamic-social-icon');
  if (link) recordSocialClick(link.dataset.platformId);
});

async function loadAndRenderSocialPlatforms() {
  let platforms = [];
  try {
    const res = await fetch('/api/public/social', { cache: 'no-store' });
    const data = await res.json();
    platforms = data.items || [];
  } catch (e) { return; }
  if (!platforms.length) return;

  const renderAll = () => {
    document.querySelectorAll('[data-social-slot="footer"]').forEach(c => renderSocialInto(c, platforms, 'footer'));
    document.querySelectorAll('[data-social-slot="header"]').forEach(c => renderSocialInto(c, platforms, 'header'));
  };
  renderAll();

  // إعادة الرسم عند تغيير حجم الشاشة حتى تُحترم قواعد الإظهار (كمبيوتر/جوال) فوراً
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderAll, 200);
  });
}

function applyHeroBackground(selector, url) {
  if (!url) return;
  const section = document.querySelector(selector);
  if (!section) return;
  section.style.setProperty('--hero-bg-image', `url('${url}')`);
  section.classList.add('has-custom-bg');
}

function applyLogo(logoUrl) {
  if (!logoUrl) return;
  document.querySelectorAll('.brand-mark img').forEach(img => { img.src = logoUrl; });
}

function applyFavicon(url) {
  if (!url) return;
  let link = document.querySelector('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = url;
}

/* ---------------- بانرات الصفحة الرئيسية (3 بانرات، تبديل كل 3 ثوانٍ) ---------------- */
// رابط البانر (اختياري): الضغط على البانر ينقل الزائر إليه. الروابط الخارجية تُفتح في تبويب جديد.
function bannerLinkHTML(link) {
  const l = String(link || '').trim();
  if (!l || !(/^https?:\/\//i.test(l) || /^\/(?!\/)/.test(l))) return '';
  const external = /^https?:\/\//i.test(l) && !l.startsWith(location.origin);
  return `<a class="hero-banner-link" href="${escapeAttr(l)}"${external ? ' target="_blank" rel="noopener"' : ''} aria-label="فتح رابط البانر"></a>`;
}

function setupBanners(banners, bannerLogo, bannerTextVisible) {
  const wrap = document.getElementById('heroBanners');
  if (!wrap) return;
  const usable = (banners || []).filter(b => b && b.image);
  if (!usable.length) return; // يبقى الشكل الافتراضي كما هو إن لم تُرفع بانرات بعد

  const showLogo = !!(bannerLogo && bannerLogo.visible && bannerLogo.image);
  const showText = bannerTextVisible !== false;

  wrap.innerHTML = usable.map((b, i) => `
    <div class="hero-banner-slide ${i === 0 ? 'is-active' : ''}" style="background-image:url('${escapeAttr(safeUrl(b.image, ""))}')">
      <div class="hero-banner-overlay"></div>
      <div class="hero-banner-content">
        ${showLogo ? `<div class="hero-banner-logo"><img src="${escapeAttr(safeUrl(bannerLogo.image, ""))}" alt="شعار العمران"></div>` : '<div></div>'}
        ${showText ? `
        <div class="hero-banner-text">
          <strong class="ar">${escapeHtml((b.title && b.title.ar) || '')}</strong>
          <span class="en">${escapeHtml((b.title && b.title.en) || '')}</span>
        </div>` : ''}
      </div>
      ${bannerLinkHTML(b.link)}
    </div>
  `).join('');

  if (usable.length > 1) {
    let current = 0;
    setInterval(() => {
      const slides = wrap.querySelectorAll('.hero-banner-slide');
      slides[current].classList.remove('is-active');
      current = (current + 1) % slides.length;
      slides[current].classList.add('is-active');
    }, 3000);
  }
}

/* ---------------- تحميل الأعمال (المميزة أو الكاملة) ---------------- */
async function loadPublicWorks() {
  if (window.__SITE_WORKS__) return window.__SITE_WORKS__;
  try {
    const res = await fetch('/api/works/public');
    if (!res.ok) return [];
    const data = await res.json();
    return data.works || [];
  } catch (e) {
    return [];
  }
}

async function renderFeaturedWorks(projectLogo) {
  const grid = document.getElementById('featuredWorksGrid');
  if (!grid) return;
  const works = await loadPublicWorks();
  const featured = works.filter(w => w.pinned).slice(0, 6);
  const logoSrc = (projectLogo && projectLogo.visible && projectLogo.image) ? safeUrl(projectLogo.image, '') : '';

  if (!featured.length) {
    grid.innerHTML = '<p class="muted" style="text-align:center;grid-column:1/-1;">لا توجد أعمال مميزة مثبّتة حالياً.</p>';
    return;
  }
  grid.innerHTML = '';
  featured.forEach(w => grid.appendChild(buildProjectCard(w, logoSrc)));
  observeReveal(grid);
}

async function renderAllWorks(projectLogo) {
  const grid = document.getElementById('projectsGrid');
  if (!grid) return;
  const works = await loadPublicWorks();
  const logoSrc = (projectLogo && projectLogo.visible && projectLogo.image) ? safeUrl(projectLogo.image, '') : '';

  if (!works.length) {
    grid.innerHTML = '<p class="muted" style="text-align:center;grid-column:1/-1;">لا توجد أعمال منشورة حالياً.</p>';
    return;
  }
  grid.innerHTML = '';
  works.forEach(w => grid.appendChild(buildProjectCard(w, logoSrc)));
  observeReveal(grid);

  const pills = document.querySelectorAll('.pill');
  const cards = () => document.querySelectorAll('#projectsGrid .project-card');
  pills.forEach(p => {
    p.addEventListener('click', () => {
      pills.forEach(x => x.classList.remove('is-active'));
      p.classList.add('is-active');
      const f = p.dataset.filter;
      cards().forEach(c => {
        const show = f === 'all' || c.dataset.cat === f;
        c.style.display = show ? '' : 'none';
      });
    });
  });
}

/* =========================================================
   إحصاءات الصفحة الرئيسية (سنوات الخبرة، المشاريع، المدن، الرضا)
   ========================================================= */
function applyStats(stats) {
  if (!stats) return;
  document.querySelectorAll('[data-stat]').forEach(el => {
    const key = el.dataset.stat;
    if (stats[key] !== undefined && stats[key] !== '') {
      el.textContent = stats[key];
    }
  });
}

/* =========================================================
   الزر العائم (تواصل سريع): إظهار/إخفاء الزر بالكامل، أو
   زر الواتساب/الاتصال كل على حدة، حسب إعدادات لوحة التحكم.
   ========================================================= */
/* =========================================================
   إعدادات موحّدة لكل قسم من أقسام الصفحة الرئيسية (الألوان،
   المحتوى، الصورة، والتأثير التفاعلي) — بنفس منطق التطبيق
   لكل قسم بلا استثناء، عدا الهيرو الذي يبقي عنوانه ونصه
   مُتحكَّماً بهما من بطاقة "الهيرو" المستقلة بلوحة التحكم
   (لتفادي تكرار نفس المحتوى في مكانين).
   ========================================================= */
const PAGE_SECTION_MAPS = {
  home: {
    banners: { root: '#heroBanners', box: '.hero-banner-slide', skipText: true },
    hero: { root: '#home', box: '.float-card', imageId: 'heroImage', skipText: true },
    stats: { root: '#statsBand', box: '.stat-item', skipText: true },
    process: { root: '#process', box: '.process-step', titleId: 'sec-process-title', contentId: 'sec-process-content' },
    whyUs: { root: '#why', box: '.why-item', titleId: 'sec-why-title', contentId: 'sec-why-content' },
    testimonials: { root: '#testimonials', box: '.testimonial-card', titleId: 'sec-testimonials-title', contentId: 'sec-testimonials-content' },
    about: { root: '#about', box: '.about-stat-box', titleId: 'sec-about-title', contentId: 'sec-about-content', imageId: 'aboutTeaserImage' },
    services: { root: '#services', box: '.service-card', titleId: 'sec-services-title', contentId: 'sec-services-content' },
    projects: { root: '#projects', box: '.project-card', titleId: 'sec-projects-title' },
    cta: { root: '#sec-cta', box: '.cta-band-inner', titleId: 'sec-cta-title', contentId: 'sec-cta-content' },
    contact: { root: '#contact', box: '.form-card, .contact-card-dark', titleId: 'sec-contact-title', contentId: 'sec-contact-content' },
  },
  about: {
    pageHero: { root: '#pg-about-pageHero', box: null, titleId: 'pg-about-pageHero-title', contentId: 'pg-about-pageHero-content' },
    story: { root: '#pg-about-story', box: '.about-media', titleId: 'pg-about-story-title', imageId: 'aboutStoryImage' },
    missionVision: { root: '#pg-about-missionVision', box: '.why-item', titleId: 'pg-about-missionVision-title' },
    values: { root: '#pg-about-values', box: '.value-card', titleId: 'pg-about-values-title', contentId: 'pg-about-values-content' },
    expertise: { root: '#pg-about-expertise', box: '.value-card', titleId: 'pg-about-expertise-title', contentId: 'pg-about-expertise-content' },
    timeline: { root: '#pg-about-timeline', box: '.timeline-item', titleId: 'pg-about-timeline-title' },
    team: { root: '#pg-about-team', box: '.team-card', titleId: 'pg-about-team-title', contentId: 'pg-about-team-content' },
    certifications: { root: '#pg-about-certifications', box: '.cert-card', titleId: 'pg-about-certifications-title' },
    licenses: { root: '#pg-about-licenses', box: '.doc-card', titleId: 'pg-about-licenses-title', contentId: 'pg-about-licenses-content' },
    awards: { root: '#pg-about-awards', box: '.doc-card', titleId: 'pg-about-awards-title', contentId: 'pg-about-awards-content' },
    partners: { root: '#pg-about-partners', box: '.partner-card', titleId: 'pg-about-partners-title', contentId: 'pg-about-partners-content' },
    cta: { root: '#pg-about-cta', box: '.cta-band-inner', titleId: 'pg-about-cta-title', contentId: 'pg-about-cta-content' },
  },
  projects: {
    pageHero: { root: '#pg-projects-pageHero', box: null, titleId: 'pg-projects-pageHero-title', contentId: 'pg-projects-pageHero-content' },
    grid: { root: '#pg-projects-grid', box: '.project-card', titleId: 'pg-projects-grid-title' },
    cta: { root: '#pg-projects-cta', box: '.cta-band-inner', titleId: 'pg-projects-cta-title', contentId: 'pg-projects-cta-content' },
  },
};

// يكتشف الصفحة الحالية تلقائياً حسب العناصر الموجودة، دون حاجة لتمرير اسمها يدوياً في كل صفحة
function detectCurrentPageKey() {
  if (document.getElementById('home')) return 'home';
  if (document.getElementById('pg-about-pageHero')) return 'about';
  if (document.getElementById('pg-projects-pageHero')) return 'projects';
  return null;
}

function applySectionSettings(pageSections) {
  if (!pageSections) return;
  const pageKey = detectCurrentPageKey();
  if (!pageKey) return;
  const sections = pageSections[pageKey];
  const domMap = PAGE_SECTION_MAPS[pageKey];
  if (!sections || !domMap) return;

  // ترتيب الأقسام بالصفحة حسب الترتيب المحفوظ من لوحة التحكم (سحب وإفلات)
  const orderedKeys = Object.keys(domMap).slice().sort((a, b) => {
    const oa = (sections[a] && sections[a].order) || 0;
    const ob = (sections[b] && sections[b].order) || 0;
    return oa - ob;
  });
  const parent = document.querySelector('main');
  if (parent) {
    orderedKeys.forEach((key) => {
      const root = document.querySelector(domMap[key].root);
      if (root && root.parentElement === parent) parent.appendChild(root);
    });
  }

  Object.keys(domMap).forEach((key) => {
    const map = domMap[key];
    const s = sections[key];
    const root = document.querySelector(map.root);
    if (!s || !root) return;

    // إظهار/إخفاء القسم بالكامل
    root.style.display = s.visible === false ? 'none' : '';
    if (s.visible === false) return;

    // الخلفية: لون أو صورة
    if (s.bgMode === 'image' && s.bgImage) {
      root.style.backgroundImage = `url('${s.bgImage}')`;
      root.style.backgroundSize = 'cover';
      root.style.backgroundPosition = 'center';
    } else if (s.bgColor) {
      root.style.backgroundColor = s.bgColor;
    }

    // لون النص العام داخل القسم
    if (s.textColor) root.style.color = s.textColor;

    // لون البطاقات/العناصر داخل القسم
    if (s.boxColor && map.box) {
      root.querySelectorAll(map.box).forEach(box => { box.style.backgroundColor = s.boxColor; });
    }

    // التأثير التفاعلي (تكبير/ظل خفيف عند تمرير الماوس فوق عناصر القسم)
    root.classList.toggle('sec-hover-fx', !!s.hoverEffect);

    // النصوص (عدا الهيرو، الذي يُدار من بطاقة الهيرو الخاصة به)
    if (!map.skipText) {
      if (map.titleId && s.title && (pick(s.title))) {
        const el = document.getElementById(map.titleId);
        if (el) el.textContent = pick(s.title);
      }
      if (map.contentId && s.content && pick(s.content)) {
        const el = document.getElementById(map.contentId);
        if (el) el.textContent = pick(s.content);
      }
    }

    // صورة القسم (رفع أو رابط) — تُطبَّق فقط على الأقسام التي لها صورة أصلاً
    if (map.imageId && s.image) {
      const imgEl = document.getElementById(map.imageId);
      if (imgEl) imgEl.src = s.image;
    }
  });
}

/* =========================================================
   الخطوط: الخط الفعّال للموقع (من المكتبة المرفوعة أو اسم مخصص)،
   وأحجام العنوان الرئيسي/الثانوي/المحتوى — تُطبَّق فوق أي قيم
   مبرمجة بالتصميم عبر أنماط inline (تضمن الأولوية دائماً).
   ========================================================= */
// أسماء الخطوط في CSS لكل خط في المكتبة (نفس القائمة في lib/typography.js؛ الملفات في css/fonts.css)
const FONT_FAMILIES = {
  IBMPlexSansArabic: 'IBM Plex Sans Arabic',
  ClashDisplay: 'ClashDisplay',
  EmadDianaExtra: 'EmadDianaExtra',
  StolzlBook: 'StolzlBook',
};
const FONT_FALLBACK = '"IBM Plex Sans Arabic", system-ui, -apple-system, "Segoe UI", Tahoma, Arial, sans-serif';

function fontStack(font) {
  if (!font || !font.value) return '';
  const family = font.source === 'custom'
    ? String(font.value).replace(/[^A-Za-z0-9؀-ۿ \-]/g, '').trim()
    : FONT_FAMILIES[font.value];
  return family ? `"${family}", ${FONT_FALLBACK}` : '';
}

// خط لكل دور (العناوين الرئيسية والثانوية والمحتوى والأزرار) وأحجام الخط من لوحة التحكم.
// تُطبَّق كقواعد CSS (وليس على عناصر محددة) حتى تشمل المحتوى الذي يُبنى لاحقاً.
function applyTypography(typography) {
  if (!typography) return;
  const fonts = typography.fonts || {};
  const sizes = typography.fontSizes || {};
  const rules = [];
  const add = (selector, stack) => { if (stack) rules.push(`${selector}{font-family:${stack} !important;}`); };
  add('body, input, select, textarea', fontStack(fonts.body));
  add('h2, h3, h4', fontStack(fonts.subheading));
  add('h1, .hero-banner-text .ar, .hero-banner-text .en', fontStack(fonts.heading));
  add('.btn, button, .pill', fontStack(fonts.buttons));
  // الحجم على الجوال لا يتجاوز نسبة من عرض الشاشة حتى لا تنكسر العناوين الكبيرة
  if (+sizes.h1) rules.push(`h1{font-size:min(${+sizes.h1}px, 9vw) !important;}`);
  if (+sizes.h2) rules.push(`h2{font-size:min(${+sizes.h2}px, 7.5vw) !important;}`);
  if (+sizes.body) rules.push(`body{font-size:${+sizes.body}px;}`);

  let style = document.getElementById('siteTypography');
  if (!style) {
    style = document.createElement('style');
    style.id = 'siteTypography';
    document.head.appendChild(style);
  }
  style.textContent = rules.join('\n');
}


/* =========================================================
   خدمات الصفحة الرئيسية — تُبنى بالكامل ديناميكياً، وتدعم أي
   عدد من الخدمات (وليس 4 فقط)؛ الأيقونات الأربع الأصلية تتكرر
   بالترتيب حفاظاً على الشكل الحالي حتى مع إضافة خدمات جديدة.
   ========================================================= */
const SERVICE_ICONS = [
  '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 10.5L12 4l9 6.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9.5z"/></svg>',
  '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="3" width="8" height="18" rx="1"></rect><rect x="14" y="8" width="6" height="13" rx="1"></rect></svg>',
  '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 21V9l4-3v0l4 3 4-2 6 2v12H3z"/><path d="M7 13v4M12 13v4M17 13v4"/></svg>',
  '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M3 21l7-7"/><path d="M14.5 6.5l3 3L7 20H4v-3L14.5 6.5z"/><path d="M13 7l3 3"/></svg>',
];

function applyServices(services) {
  const grid = document.getElementById('servicesGrid');
  if (!grid) return;
  if (!Array.isArray(services) || services.length === 0) return;

  grid.innerHTML = services.map((svc, i) => `
    <article class="service-card">
      <div class="svc-icon" aria-hidden="true">${SERVICE_ICONS[i % SERVICE_ICONS.length]}</div>
      <h3>${escapeHtml(pick(svc.title))}</h3>
      <p>${escapeHtml(pick(svc.description))}</p>
    </article>
  `).join('');
}

/* =========================================================
   صفحة "من نحن": الشهادات والتراخيص، شهادات التكريم، الشركاء
   ========================================================= */
const isSafeLink = (l) => /^https?:\/\//i.test(l || '') || /^\/(?!\/)/.test(l || '');
const linkAttrs = (l) => `href="${escapeAttr(l)}"${/^https?:\/\//i.test(l) && !l.startsWith(location.origin) ? ' target="_blank" rel="noopener"' : ''}`;
function showcaseItems(list) { return (Array.isArray(list) ? list : []).filter(it => it && it.visible !== false && hasText(it.title)); }
function applyDocs(sectionId, gridId, list, opts = {}) {
  const section = document.getElementById(sectionId), grid = document.getElementById(gridId);
  if (!section || !grid) return;
  const items = showcaseItems(list);
  section.hidden = !items.length;
  const en = getLang() === 'en';
  const TYPE = { award: en ? '🏆 Award' : '🏆 تكريم', thanks: en ? '🤝 Client thanks' : '🤝 شكر من عميل' };
  grid.innerHTML = items.map(it => {
    const title = pick(it.title), img = safeUrl(it.image, '');
    // كل صور العنصر (الرئيسية أولاً) تُفتح معاً في العارض
    const gallery = [img, ...(Array.isArray(it.gallery) ? it.gallery : []).map(u => safeUrl(u, ''))].filter(Boolean);
    const type = opts.typed ? (it.type === 'thanks' ? 'thanks' : 'award') : '';
    const desc = hasText(it.description) ? pick(it.description) : '';
    return `
    <article class="doc-card" ${type ? `data-type="${type}"` : ''}>
      ${type ? `<span class="doc-badge is-${type}">${TYPE[type]}</span>` : ''}
      ${img ? `<button type="button" class="doc-thumb" data-doc-img="${escapeAttr(img)}" data-doc-gallery="${escapeAttr(JSON.stringify(gallery))}" data-doc-title="${escapeAttr(title)}" aria-label="${escapeAttr(title)}"><img src="${escapeAttr(img)}" alt="${escapeAttr(title)}" loading="lazy">${gallery.length > 1 ? `<span class="doc-count">🖼 ${gallery.length}</span>` : ''}</button>`
            : `<div class="doc-thumb doc-thumb-empty" aria-hidden="true"><svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5"/><circle cx="12" cy="14" r="2.5"/><path d="M10.5 16.2 9.5 20l2.5-1.2 2.5 1.2-1-3.8"/></svg></div>`}
      <div class="doc-body">
        <h3>${escapeHtml(title)}</h3>
        ${desc ? `<p>${type === 'thanks' ? (en ? 'From: ' : 'من: ') : ''}${escapeHtml(desc)}</p>` : ''}
        ${type === 'thanks' && hasText(it.project) ? `<span class="doc-project">📍 ${escapeHtml(pick(it.project))}</span>` : ''}
        ${isSafeLink(it.link) ? `<a class="doc-link" ${linkAttrs(it.link)}>${getLang() === 'en' ? 'View / verify →' : 'عرض / تحقق ←'}</a>` : ''}
      </div>
    </article>`;
  }).join('');
  if (opts.filtersId) setupDocFilters(opts.filtersId, grid, items, TYPE, en);
}
// أزرار التصفية (الكل / تكريم / شكر العملاء) تظهر فقط عند وجود النوعين معاً
function setupDocFilters(filtersId, grid, items, TYPE, en) {
  const box = document.getElementById(filtersId);
  if (!box) return;
  const counts = { award: items.filter(i => i.type !== 'thanks').length, thanks: items.filter(i => i.type === 'thanks').length };
  box.hidden = !(counts.award && counts.thanks);
  if (box.hidden) return;
  const btn = (key, label, n) => `<button type="button" data-filter="${key}"${key === 'all' ? ' class="on"' : ''}>${label}<b>${n}</b></button>`;
  box.innerHTML = btn('all', en ? 'All' : 'الكل', items.length) + btn('award', en ? '🏆 Awards' : '🏆 تكريم وجوائز', counts.award) + btn('thanks', en ? '🤝 Client thanks' : '🤝 شكر من العملاء', counts.thanks);
  box.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
    box.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    grid.querySelectorAll('.doc-card').forEach(c => { c.hidden = b.dataset.filter !== 'all' && c.dataset.type !== b.dataset.filter; });
  }));
}
function applyPartners(list) {
  const section = document.getElementById('pg-about-partners'), grid = document.getElementById('partnersGrid');
  if (!section || !grid) return;
  const items = showcaseItems(list);
  section.hidden = !items.length;
  grid.innerHTML = items.map(it => {
    const name = pick(it.title), img = safeUrl(it.image, '');
    const inner = `<span class="partner-logo">${img ? `<img src="${escapeAttr(img)}" alt="${escapeAttr(name)}" loading="lazy">` : `<b>${escapeHtml(String(name).trim().charAt(0))}</b>`}</span><span class="partner-name">${escapeHtml(name)}</span>`;
    return isSafeLink(it.link) ? `<a class="partner-card" ${linkAttrs(it.link)}>${inner}</a>` : `<div class="partner-card">${inner}</div>`;
  }).join('');
}
// عارض الشهادات: الضغط على صورة الشهادة يعرضها بحجم كبير
(function setupDocLightbox() {
  const box = document.getElementById('docLightbox');
  if (!box) return;
  const img = box.querySelector('.doc-lightbox-img') || box.querySelector('img');
  const caption = box.querySelector('.doc-lightbox-caption');
  const counter = box.querySelector('.doc-lightbox-count');
  const strip = box.querySelector('.doc-lightbox-strip');
  const nav = box.querySelectorAll('.doc-lightbox-nav');
  let list = [], idx = 0, title = '';
  const show = (i) => {
    idx = (i + list.length) % list.length;
    img.src = list[idx]; img.alt = title;
    const many = list.length > 1;
    if (counter) { counter.hidden = !many; counter.textContent = `${idx + 1} / ${list.length}`; }
    nav.forEach(b => { b.hidden = !many; });
    if (strip) {
      strip.hidden = !many;
      strip.querySelectorAll('button').forEach((b, j) => b.classList.toggle('on', j === idx));
      strip.querySelector('button.on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
  };
  const close = () => { box.hidden = true; document.body.style.overflow = ''; };
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-doc-img]');
    if (t) {
      try { list = JSON.parse(t.dataset.docGallery || '[]'); } catch (_) { list = []; }
      if (!list.length) list = [t.dataset.docImg];
      title = t.dataset.docTitle || '';
      caption.textContent = title;
      if (strip) strip.innerHTML = list.map((u, j) => `<button type="button" data-j="${j}" aria-label="${j + 1}"><img src="${escapeAttr(u)}" alt=""></button>`).join('');
      show(0);
      box.hidden = false; document.body.style.overflow = 'hidden';
      return;
    }
    if (box.hidden) return;
    const s = e.target.closest('.doc-lightbox-strip button');
    if (s) { show(+s.dataset.j); return; }
    const n = e.target.closest('.doc-lightbox-nav');
    if (n) { show(idx + (n.dataset.dir === 'next' ? 1 : -1)); return; }
    if (e.target === box || e.target.closest('.doc-lightbox-close')) close();
  });
  document.addEventListener('keydown', (e) => {
    if (box.hidden) return;
    if (e.key === 'Escape') close();
    // في العربية: السهم الأيسر للتالي
    const rtl = document.documentElement.dir === 'rtl';
    if (e.key === 'ArrowLeft') show(idx + (rtl ? 1 : -1));
    if (e.key === 'ArrowRight') show(idx + (rtl ? -1 : 1));
  });
  // السحب على الجوال للتنقل بين الصور
  let x0 = null;
  img.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  img.addEventListener('touchend', (e) => {
    if (x0 === null || list.length < 2) return;
    const dx = e.changedTouches[0].clientX - x0; x0 = null;
    if (Math.abs(dx) < 40) return;
    const rtl = document.documentElement.dir === 'rtl';
    show(idx + ((dx < 0) !== rtl ? 1 : -1));
  });
})();

/* =========================================================
   آراء العملاء (الصفحة الرئيسية) — من لوحة التحكم
   ========================================================= */
function applyTestimonials(list, visible) {
  const section = document.getElementById('testimonials');
  const grid = document.getElementById('testimonialsGrid');
  if (!section || !grid) return;
  const items = (Array.isArray(list) ? list : []).filter(t => t && t.visible !== false && hasText(t.name) && hasText(t.text));
  section.hidden = visible === false || !items.length;
  if (section.hidden) return;
  const star = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path fill="currentColor" d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9z"/></svg>';
  grid.innerHTML = items.map(t => {
    const rating = Math.max(1, Math.min(5, parseInt(t.rating, 10) || 5));
    const name = pick(t.name);
    return `
    <article class="testimonial-card">
      <div class="testimonial-stars" role="img" aria-label="${rating} / 5">${Array.from({ length: 5 }, (_, i) => `<span class="${i < rating ? 'on' : ''}">${star}</span>`).join('')}</div>
      <blockquote>${escapeHtml(pick(t.text)).replace(/\n/g, '<br>')}</blockquote>
      <div class="testimonial-author">
        <span class="testimonial-avatar" aria-hidden="true">${escapeHtml(String(name).trim().charAt(0))}</span>
        <span><strong>${escapeHtml(name)}</strong>${hasText(t.role) ? `<small>${escapeHtml(pick(t.role))}</small>` : ''}</span>
        ${t.source === 'review' ? `<em class="testimonial-verified" title="${getLang() === 'en' ? 'Submitted by the client through a private review link' : 'أرسله العميل بنفسه عبر رابط التقييم الخاص'}">✓ ${getLang() === 'en' ? 'Verified client' : 'تقييم موثّق'}</em>` : ''}
      </div>
    </article>`;
  }).join('');
}

/* =========================================================
   فريق العمل (صفحة "من نحن") — يُبنى بالكامل ديناميكياً
   ========================================================= */
function applyTeam(team) {
  const grid = document.getElementById('teamGrid');
  if (!grid) return;
  if (!Array.isArray(team) || team.length === 0) {
    grid.innerHTML = '<p class="muted">لم تتم إضافة أعضاء فريق بعد.</p>';
    return;
  }
  grid.innerHTML = team.map(member => {
    const name = pick(member.name);
    const role = pick(member.role);
    // الأحرف الأولى بدون الألقاب (م. / أ. / د.) وأداة التعريف، مثل "الإدارة الهندسية" ← "إه"
    const initials = name.trim().split(/\s+/)
      .filter(w => !/^[\u0600-\u06FFA-Za-z]{1,3}\.$/.test(w))
      .slice(0, 2).map(w => w.replace(/^و?ال(?=\S{2,})/, '')[0] || '').join('');
    return `
      <article class="team-card">
        <div class="team-avatar" aria-hidden="true">${escapeHtml(initials)}</div>
        <h3>${escapeHtml(name)}</h3>
        <span>${escapeHtml(role)}</span>
      </article>
    `;
  }).join('');
}

/* =========================================================
   رسالة الترحيب عند أول زيارة (تظهر مرة واحدة لكل متصفح)
   ========================================================= */
const WELCOME_SEEN_KEY = 'alomran_welcome_seen';

function showWelcomeMessage(welcome) {
  if (!welcome || !welcome.enabled) return;
  if (localStorage.getItem(WELCOME_SEEN_KEY)) return;

  const overlay = document.createElement('div');
  overlay.className = 'welcome-overlay';
  overlay.innerHTML = `
    <div class="welcome-card">
      <button type="button" class="welcome-close" aria-label="إغلاق">×</button>
      <h2>${escapeHtml(pick(welcome.title))}</h2>
      <p>${escapeHtml(pick(welcome.message))}</p>
      <button type="button" class="btn btn-dark welcome-ok">${escapeHtml(pick(welcome.buttonText) || 'OK')}</button>
    </div>
  `;
  document.body.appendChild(overlay);

  function dismiss() {
    overlay.classList.remove('is-visible');
    localStorage.setItem(WELCOME_SEEN_KEY, '1');
    clearTimeout(autoTimer);
    setTimeout(() => overlay.remove(), 300);
  }
  overlay.querySelector('.welcome-close').addEventListener('click', dismiss);
  overlay.querySelector('.welcome-ok').addEventListener('click', dismiss);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) dismiss(); });

  requestAnimationFrame(() => overlay.classList.add('is-visible'));

  // تختفي الرسالة تلقائياً بعد المدة المحددة (بالثواني)، حتى لو لم يتفاعل الزائر
  const seconds = Number(welcome.durationSeconds) > 0 ? Number(welcome.durationSeconds) : 6;
  const autoTimer = setTimeout(dismiss, seconds * 1000);
}

/* =========================================================
   محتوى الصفحات النصي القابل للتعديل من لوحة التحكم:
   الهيرو، قصة الشركة، الرسالة والرؤية، القيم، المسيرة الزمنية،
   والاعتمادات. كل جزء يتحقق من وجود عنصره بالصفحة قبل التطبيق.
   ========================================================= */
const CERT_ICONS = [
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 6L9 17l-5-5"/></svg>',
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2l3 7h7l-5.5 4.5L18.5 21 12 16.5 5.5 21l2-7.5L2 9h7z"/></svg>',
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s7-5.3 7-11a7 7 0 1 0-14 0c0 5.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
];

// نص ثنائي اللغة فارغ لا يُطبَّق، حتى يبقى النص الموجود في الصفحة بدلاً من قسم فارغ
function hasText(field) {
  return !!String(pick(field) || '').trim();
}

// الخريطة المصغرة في قسم التواصل: رابطها (خرائط جوجل) وموضعها من الإعدادات.
// الإحداثيات تؤخذ من حقل الإحداثيات، أو من رابط جوجل الكامل إن احتوى عليها (@lat,lng).
function mapCoordsFrom(content) {
  const src = String(content.mapCoords || '') + ' ' + String(content.mapUrl || '');
  const m = /(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/.exec(String(content.mapCoords || ''))
    || /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/.exec(src)
    || /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/.exec(src)
    || /[?&](?:q|ll|query)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/.exec(src);
  return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
}
function applyMap(content) {
  const link = document.querySelector('.mini-map-link');
  if (link && /^https:\/\//i.test(content.mapUrl || '')) link.href = content.mapUrl;
  const frame = document.querySelector('.mini-map iframe');
  const c = mapCoordsFrom(content);
  if (frame && c) {
    const [lat, lng] = c;
    const bbox = [lng - 0.006, lat - 0.004, lng + 0.006, lat + 0.004].map(n => n.toFixed(6)).join('%2C');
    const url = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
    if (frame.getAttribute('src') !== url) frame.setAttribute('src', url);
  }
}

function applyContent(content) {
  if (!content) return;
  applyMap(content);

  const footerTaglineEl = document.getElementById('footerTagline');
  if (footerTaglineEl && hasText(content.footerTagline)) footerTaglineEl.textContent = pick(content.footerTagline);

  const heroTitleEl = document.getElementById('heroTitle');
  if (heroTitleEl && hasText(content.heroTitle)) {
    heroTitleEl.innerHTML = escapeHtml(pick(content.heroTitle)).replace(/\n/g, '<br>');
  }
  const heroSubEl = document.getElementById('heroSubtitle');
  if (heroSubEl && hasText(content.heroSubtitle)) heroSubEl.textContent = pick(content.heroSubtitle);

  const storyEl = document.getElementById('aboutStory');
  if (storyEl && Array.isArray(content.aboutStory) && content.aboutStory.some(hasText)) {
    storyEl.innerHTML = content.aboutStory
      .map(p => pick(p))
      .filter(p => p && p.trim())
      .map(p => `<p>${escapeHtml(p)}</p>`)
      .join('');
  }

  const missionEl = document.getElementById('missionText');
  if (missionEl && hasText(content.mission)) missionEl.textContent = pick(content.mission);
  const visionEl = document.getElementById('visionText');
  if (visionEl && hasText(content.vision)) visionEl.textContent = pick(content.vision);

  if (Array.isArray(content.values)) {
    document.querySelectorAll('[data-value]').forEach(card => {
      const idx = parseInt(card.dataset.value, 10);
      const v = content.values[idx];
      if (!v) return;
      const t = card.querySelector('[data-field="title"]');
      const d = card.querySelector('[data-field="description"]');
      if (t && hasText(v.title)) t.textContent = pick(v.title);
      if (d && hasText(v.description)) d.textContent = pick(v.description);
    });
  }

  const timelineGrid = document.getElementById('timelineGrid');
  if (timelineGrid) {
    if (Array.isArray(content.timeline) && content.timeline.length) {
      timelineGrid.innerHTML = content.timeline.map(item => `
        <div class="timeline-item">
          <div class="timeline-dot" aria-hidden="true"></div>
          <div class="timeline-year">${escapeHtml(item.year || '')}</div>
          <h3>${escapeHtml(pick(item.title))}</h3>
          <p>${escapeHtml(pick(item.description))}</p>
        </div>
      `).join('');
    } else {
      timelineGrid.innerHTML = '<p class="muted">لم تتم إضافة محطات بعد.</p>';
    }
  }

  const certsGrid = document.getElementById('certsGrid');
  if (certsGrid) {
    if (Array.isArray(content.certifications) && content.certifications.length) {
      certsGrid.innerHTML = content.certifications.map((text, i) => `
        <div class="cert-card">
          <div class="cert-icon" aria-hidden="true">${CERT_ICONS[i % CERT_ICONS.length]}</div>
          <span>${escapeHtml(pick(text))}</span>
        </div>
      `).join('');
    } else {
      certsGrid.innerHTML = '<p class="muted">لم تتم إضافة اعتمادات بعد.</p>';
    }
  }
}

/* ---------------- إظهار الصفحة بعد تطبيق الإعدادات ---------------- */
// الصفحة مخفية لحظات (html.site-preload) حتى يُطبَّق المحتوى والصور والخطوط المحفوظة،
// فلا يرى الزائر النسخة الافتراضية ثم تتغير. تنتظر الخطوط وصور أعلى الصفحة بحد أقصى.
function revealSite() {
  const root = document.documentElement;
  if (!root.classList.contains('site-preload')) return;
  const timeout = (ms) => new Promise(r => setTimeout(r, ms));
  const fonts = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  const firstImages = [...document.images].filter(img => {
    const r = img.getBoundingClientRect();
    return !img.complete && r.top < window.innerHeight && r.bottom > 0;
  }).map(img => new Promise(res => { img.addEventListener('load', res, { once: true }); img.addEventListener('error', res, { once: true }); }));
  Promise.race([Promise.all([fonts, ...firstImages]), timeout(1200)]).then(() => root.classList.remove('site-preload'));
}

/* ---------------- تشغيل كل شيء متعلق بالبيانات الديناميكية ---------------- */
(async function initDynamicContent() {
  setupLanguageToggle();
  document.documentElement.lang = getLang();
  document.documentElement.dir = getLang() === 'ar' ? 'rtl' : 'ltr';
  document.body.classList.toggle('lang-en', getLang() === 'en');
  applyStaticTranslations();
  document.querySelectorAll('.lang-toggle-label').forEach(el => {
    el.textContent = getLang() === 'ar' ? 'EN' : 'AR';
  });

  const settings = await loadPublicSettings();
  loadAndRenderSocialPlatforms(); // مستقل عن اللغة، يُحمَّل مرة واحدة فقط

  async function renderAll() {
    if (settings) {
      applyLogo(settings.logo);
      applyFavicon(settings.favicon);
      applyHeroBackground('.page-hero[data-hero="about"]', settings.aboutHeroBg);
      applyHeroBackground('.page-hero[data-hero="projects"]', settings.projectsHeroBg);
      setupBanners(settings.banners, settings.bannerLogo, settings.bannerTextVisible);
      applyStats(settings.stats);
      applyTypography(settings.typography);
      applyServices(settings.services);
      applyTestimonials(settings.testimonials, settings.testimonialsVisible);
      applyDocs('pg-about-licenses', 'licensesGrid', settings.licenses);
      applyDocs('pg-about-awards', 'awardsGrid', settings.awards, { typed: true, filtersId: 'awardsFilters' });
      applyPartners(settings.partners);
      applyTeam(settings.team);
      applyContent(settings.content);
      // صور الأقسام وخلفياتها تُطبَّق فوراً (ثم مرة أخرى بعد بناء بطاقات الأعمال)
      applySectionSettings(settings.pageSections);
    }
    const projectLogo = settings ? settings.projectLogo : null;
    await renderFeaturedWorks(projectLogo);
    await renderAllWorks(projectLogo);
    // بعد بناء بطاقات الأعمال ديناميكياً، حتى يجد لون "صندوق" القسم بطاقات فعلية يطبّق عليها
    if (settings) applySectionSettings(settings.pageSections);
  }

  dynamicRerenderFn = renderAll; // يُستدعى تلقائياً عند تبديل اللغة
  try { await renderAll(); } finally { revealSite(); }

  if (settings) showWelcomeMessage(settings.welcomeMessage);
})();
