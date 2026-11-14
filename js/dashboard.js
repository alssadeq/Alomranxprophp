// js/dashboard.js
// يعمل هذا الملف على صفحتين: /login و /dashboard
// التمييز بينهما عبر data-page في وسم <script> نفسه.

(function () {
  'use strict';

  const PAGE = document.currentScript.getAttribute('data-page');

  /* ============================= أدوات مساعدة عامة ============================= */

  async function api(path, options = {}) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
      ...options,
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* استجابة بدون محتوى JSON */ }
    if (!res.ok) {
      const err = new Error(data.error || 'حدث خطأ غير متوقع');
      err.status = res.status;
      if (data.existingId) err.existingId = data.existingId;
      throw err;
    }
    return data;
  }

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  // لوحة التحكم نفسها تبقى بالعربي فقط؛ هذه الدالة تعرض القيمة العربية
  // من أي حقل ثنائي اللغة {ar, en}، وتتراجع للإنجليزي إن كان العربي فارغاً.
  function biText(field) {
    if (!field) return '';
    if (typeof field === 'string') return field;
    return field.ar || field.en || '';
  }
  function biAr(field) { return (field && field.ar) || ''; }
  function biEn(field) { return (field && field.en) || ''; }

  function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.add('hidden'), 3200);
  }

  const CATEGORY_LABELS = { residential: 'سكني', commercial: 'تجاري', industrial: 'صناعي' };

  /* ============================= صفحة إعداد الحساب الأول ============================= */

  if (PAGE === 'setup') {
    const form = document.getElementById('setupForm');
    const errorBox = document.getElementById('setupError');
    const GRANT_KEY = 'alomran_setup_grant';
    let setupGrant = '';
    try { setupGrant = sessionStorage.getItem(GRANT_KEY) || ''; } catch (_) {}
    const tokenField = document.getElementById('bootstrapToken').closest('.form-field');
    // بعد «إعادة تعيين الإعدادات» من نفس المتصفح لا حاجة لإدخال رمز التهيئة.
    if (setupGrant) {
      tokenField.hidden = true;
      const note = document.createElement('p');
      note.className = 'form-note';
      note.id = 'setupGrantNote';
      note.textContent = 'تمت إعادة التعيين من هذا المتصفح، يمكنك إنشاء الحساب مباشرة دون رمز التهيئة (صالح لمدة 30 دقيقة).';
      tokenField.after(note);
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorBox.classList.add('hidden');
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      const bootstrapToken = document.getElementById('bootstrapToken').value.trim();
      if (password !== confirmPassword) {
        errorBox.textContent = 'كلمتا المرور غير متطابقتين.';
        errorBox.classList.remove('hidden');
        return;
      }
      try {
        const headers = { 'Content-Type': 'application/json' };
        // الرمز يُرسل في جسم الطلب: الترويسات لا تقبل الحروف العربية إن نُسخ سطر السجل كاملاً
        if (setupGrant) headers['X-Setup-Grant'] = setupGrant;
        await api('/api/setup', { method: 'POST', headers, body: JSON.stringify({ username, email: document.getElementById('email').value.trim(), password, bootstrapToken: setupGrant ? '' : bootstrapToken }) });
        errorBox.textContent = 'تم إنشاء الحساب بنجاح. جاري الدخول إلى لوحة التحكم...';
        errorBox.classList.remove('hidden');
        errorBox.classList.add('auth-success');
        const submitButton = form.querySelector('button[type=submit]');
        if (submitButton) { submitButton.disabled = true; submitButton.textContent = 'تم الإنشاء ✓'; }
        try { sessionStorage.removeItem(GRANT_KEY); } catch (_) {}
        setTimeout(() => { window.location.href = '/dashboard'; }, 700);
      } catch (err) {
        if (setupGrant && err.status === 403) {
          // انتهت صلاحية الإذن (أو أُعيد تشغيل الخادم): نعود لطلب رمز التهيئة.
          setupGrant = '';
          try { sessionStorage.removeItem(GRANT_KEY); } catch (_) {}
          tokenField.hidden = false;
          document.getElementById('setupGrantNote')?.remove();
        }
        errorBox.classList.remove('auth-success');
        errorBox.textContent = err.message;
        errorBox.classList.remove('hidden');
      }
    });
  }

  /* ============================= صفحة تسجيل الدخول ============================= */

  if (PAGE === 'login') {
    const form = document.getElementById('loginForm');
    const errorBox = document.getElementById('loginError');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorBox.classList.add('hidden');
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      try {
        await api('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) });
        window.location.href = '/dashboard';
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.classList.remove('hidden');
      }
    });
  }

  /* ============================= استعادة كلمة المرور ============================= */

  function showAuthMessage(box, text, success) {
    box.textContent = text;
    box.classList.toggle('auth-success', !!success);
    box.classList.remove('hidden');
  }

  if (PAGE === 'forgot-password') {
    const form = document.getElementById('forgotForm');
    const box = document.getElementById('forgotMessage');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const button = form.querySelector('button[type=submit]');
      button.disabled = true;
      try {
        const result = await api('/api/password/forgot', { method: 'POST', body: JSON.stringify({ email: document.getElementById('email').value.trim() }) });
        showAuthMessage(box, result.message, true);
      } catch (err) {
        showAuthMessage(box, err.message, false);
        button.disabled = false;
      }
    });
  }

  if (PAGE === 'reset-password') {
    const form = document.getElementById('resetForm');
    const box = document.getElementById('resetMessage');
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
    // نزيل الرمز من شريط العنوان وسجل المتصفح بعد قراءته.
    history.replaceState(null, '', window.location.pathname);
    if (!token) {
      showAuthMessage(box, 'رابط الاستعادة غير مكتمل. اطلب رابطاً جديداً من صفحة "نسيت كلمة المرور".', false);
      form.querySelector('button[type=submit]').disabled = true;
    }
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPassword = document.getElementById('password').value;
      if (newPassword !== document.getElementById('confirmPassword').value) {
        showAuthMessage(box, 'كلمتا المرور غير متطابقتين.', false);
        return;
      }
      const button = form.querySelector('button[type=submit]');
      button.disabled = true;
      try {
        const result = await api('/api/password/reset', { method: 'POST', body: JSON.stringify({ token, newPassword }) });
        showAuthMessage(box, result.message, true);
        setTimeout(() => { window.location.href = '/login'; }, 1500);
      } catch (err) {
        showAuthMessage(box, err.message, false);
        button.disabled = false;
      }
    });
  }

  /* ============================= صفحة لوحة التحكم ============================= */

  if (PAGE === 'dashboard') {
    let currentUser = null;
    let pendingConfirmAction = null;

    /* ---------- تحقق من الجلسة أولاً ---------- */
    async function init() {
      try {
        const data = await api('/api/session');
        currentUser = data.user;
      } catch (e) {
        window.location.href = '/login';
        return;
      }
      fillUserMenu();
      const dateBox = document.getElementById('dashHeaderDate');
      if (dateBox) {
        try {
          dateBox.textContent = new Date().toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          });
        } catch (e) { /* غير حرج */ }
      }
      if (currentUser.isAdmin) {
        document.getElementById('adminUsersSection').classList.remove('hidden');
      }

      // إظهار قسم حذف الحساب للمالكين فقط
      if (['super_admin', 'owner'].includes(currentUser.role)) {
        const ownerDeleteSection = document.getElementById('ownerDeleteSection');
        if (ownerDeleteSection) ownerDeleteSection.classList.remove('hidden');
      }
      if (currentUser.role === 'super_admin') {
        document.getElementById('resetSetupCard').classList.remove('hidden');
        const ownerOption = document.getElementById('nu-role-owner');
        ownerOption.hidden = false;
        ownerOption.disabled = false;
      }

      if (!currentUser.isAdmin) {
        const messagesTab = document.querySelector('.dash-tab[data-tab="messages"]');
        const messagesPanel = document.getElementById('tab-messages');
        const recentMessages = document.getElementById('ov-recent-messages');
        if (messagesTab) messagesTab.classList.add('hidden');
        if (messagesPanel) messagesPanel.classList.add('hidden');
        if (recentMessages) recentMessages.closest('.overview-card')?.classList.add('hidden');
      }
      setupBriefs();
      setupCustomers();
      setupChatCenter();
      setupNotifications();
      setupBell();
      setupTabs();
      setupThemeToggle();
      setupLogout();
      setupConfirmModal();
      setupPermModal();

      loadWorks();
      setupAddWorkForm();

      setupUpdateProfile();
      setupChangePassword();
      setupDeleteAccount();
      setupResetSetup();
      if (currentUser.isAdmin) {
        loadUsers();
        setupAddUserForm();
      }

      loadIdentity();
      setupIdentityUploads();
      setupProjectLogo();
      setupBannerLogoAndText();
      setupStatsForm();
      setupServicesAdd();
      setupTestimonials();
      setupShowcases();
      setupShareCard();
      setupLoginButtonToggle();
      setupReviews();
      setupTeamAdd();
      setupWelcomeForm();
      setupTypographyForm();

      loadHeaderLogo();
      setupFooterForm();
      setupMapForm();

      loadOverview();
      if (currentUser.isAdmin) {
        loadMessages();
        loadActivityLog();
      }
      setupActivityRefresh();
      loadSocialPlatforms();
      setupSocialAdd();
      setupSocialExportImport();
      setupSocialSearch();
      loadSectionsEditor('home');
      setupSectionsPageSwitcher();
    }

    /* ---------- تبويب نظرة عامة ---------- */
    async function loadOverview() {
      try {
        const data = await api('/api/overview');
        const c = data.counts;
        document.getElementById('ov-works').textContent = c.works;
        document.getElementById('ov-services').textContent = c.services;
        document.getElementById('ov-banners').textContent = c.banners;
        document.getElementById('ov-messages').textContent = c.messages;
        document.getElementById('ov-users').textContent = c.users;

        const worksBox = document.getElementById('ov-recent-works');
        worksBox.innerHTML = data.recentWorks.length
          ? data.recentWorks.map(w => `
              <div class="overview-row">
                <div><strong>${escapeHtml(biText(w.title))}</strong> — ${escapeHtml(biText(w.city))}</div>
                <span>${CATEGORY_LABELS[w.category] || w.category}</span>
              </div>
            `).join('')
          : '<p class="muted">لا توجد أعمال بعد.</p>';

        const msgBox = document.getElementById('ov-recent-messages');
        msgBox.innerHTML = data.recentMessages.length
          ? data.recentMessages.map(m => `
              <div class="overview-row">
                <div><strong>${escapeHtml(m.name)}</strong> — ${escapeHtml(m.projectType || 'استفسار')}</div>
                <span>${new Date(m.createdAt).toLocaleDateString('ar-SA')}</span>
              </div>
            `).join('')
          : '<p class="muted">لا توجد رسائل بعد.</p>';
      } catch (err) {
        showToast('تعذر تحميل نظرة عامة: ' + err.message);
      }
    }

    /* ---------- تبويب الرسائل ---------- */
    async function loadMessages() {
      try {
        const messages = await api('/api/messages');
        const container = document.getElementById('messagesList');
        const unread = messages.filter(m => !m.read).length;
        document.getElementById('messagesUnreadCount').textContent = unread ? `${unread} غير مقروءة` : '';

        if (!messages.length) {
          container.innerHTML = '<p class="muted">لا توجد رسائل بعد.</p>';
          return;
        }
        container.innerHTML = '';
        messages.forEach(m => {
          const row = el(`
            <div class="message-row ${m.read ? '' : 'unread'}" data-id="${m.id}">
              <div class="message-row-head">
                <strong>${escapeHtml(m.name)}</strong>
                <span class="message-meta">${escapeHtml(m.phone)} · ${new Date(m.createdAt).toLocaleString('ar-SA')}</span>
              </div>
              ${m.projectType ? `<div class="message-meta">نوع المشروع: ${escapeHtml(m.projectType)}</div>` : ''}
              ${m.message ? `<div class="message-body">${escapeHtml(m.message)}</div>` : ''}
              <div class="message-actions">
                <button type="button" class="btn btn-outline btn-sm msg-toggle-read">${m.read ? 'تعليم كغير مقروءة' : 'تعليم كمقروءة'}</button>
                <button type="button" class="btn btn-danger btn-sm msg-delete">حذف</button>
              </div>
            </div>
          `);
          row.querySelector('.msg-toggle-read').addEventListener('click', async () => {
            try {
              await api(`/api/messages/${m.id}/read`, { method: 'PATCH', body: JSON.stringify({ read: !m.read }) });
              loadMessages();
              loadOverview();
            } catch (err) { showToast(err.message); }
          });
          row.querySelector('.msg-delete').addEventListener('click', () => {
            askConfirm('حذف الرسالة', `هل تريد حذف رسالة "${m.name}" نهائياً؟`, async () => {
              try {
                await api(`/api/messages/${m.id}`, { method: 'DELETE' });
                loadMessages();
                loadOverview();
              } catch (err) { showToast(err.message); }
            });
          });
          container.appendChild(row);
        });
      } catch (err) {
        showToast('تعذر تحميل الرسائل: ' + err.message);
      }
    }

    /* ---------- سجل النشاط ---------- */
    const ACTIVITY_ACTION_LABELS = {
      create: { icon: '➕', verb: 'أضاف' },
      update: { icon: '✏️', verb: 'عدّل' },
      delete: { icon: '🗑️', verb: 'حذف' },
      suspend: { icon: '⛔', verb: 'أوقف' },
      reactivate: { icon: '✅', verb: 'أعاد تفعيل' },
    };
    const ACTIVITY_ENTITY_LABELS = {
      work: 'عمل', user: 'مستخدم', message: 'رسالة', social: 'منصة تواصل', settings: 'إعدادات',
    };

    async function loadActivityLog() {
      const container = document.getElementById('activityLogList');
      try {
        const entries = await api('/api/activity-log');
        if (!entries.length) {
          container.innerHTML = '<p class="muted">لا يوجد أي نشاط مسجّل بعد.</p>';
          return;
        }
        container.innerHTML = entries.map(entry => {
          const actionInfo = ACTIVITY_ACTION_LABELS[entry.action] || { icon: '•', verb: entry.action };
          const entityLabel = ACTIVITY_ENTITY_LABELS[entry.entity] || entry.entity;
          return `
            <div class="overview-row">
              <div>${actionInfo.icon} <strong>${escapeHtml(entry.username)}</strong> ${actionInfo.verb} ${entityLabel}: ${escapeHtml(entry.label || '')}</div>
              <span>${new Date(entry.timestamp).toLocaleString('ar-SA')}</span>
            </div>
          `;
        }).join('');
      } catch (err) {
        container.innerHTML = `<p class="muted">تعذر تحميل سجل النشاط: ${escapeHtml(err.message)}</p>`;
      }
    }

    function setupActivityRefresh() {
      document.getElementById('refreshActivityBtn').addEventListener('click', loadActivityLog);
    }

    /* ---------- شعار رأس لوحة التحكم (يظهر لكل المستخدمين، وليس المسؤول فقط) ---------- */
    async function loadHeaderLogo() {
      try {
        const settings = await api('/api/settings/public');
        const box = document.getElementById('dashHeaderLogo');
        if (box && settings.logo) {
          box.innerHTML = `<img src="${settings.logo}" alt="شعار العمران">`;
        }
      } catch (e) { /* غير حرج، يبقى الرأس بدون شعار إن تعذر التحميل */ }
    }

    /* ---------- الوضع الفاتح / الداكن (يُحفظ في هذا الجهاز) ---------- */
    function setupThemeToggle() {
      const btn = document.getElementById('themeToggle');
      if (!btn) return;
      const sync = () => {
        const dark = document.body.getAttribute('data-theme') === 'dark';
        const label = dark ? 'الوضع الفاتح' : 'الوضع الداكن';
        btn.setAttribute('aria-label', label); btn.title = label;
        btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
      };
      btn.addEventListener('click', () => {
        const dark = document.body.getAttribute('data-theme') !== 'dark';
        if (dark) document.body.setAttribute('data-theme', 'dark'); else document.body.removeAttribute('data-theme');
        try { localStorage.setItem('dash-theme', dark ? 'dark' : 'light'); } catch (e) {}
        sync();
      });
      sync();
    }

    /* ---------- التبويبات ---------- */
    function setupTabs() {
      const tabs = document.querySelectorAll('.dash-tab');
      const pageTitle = document.getElementById('dashPageTitle');
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          tabs.forEach(t => t.classList.remove('is-active'));
          document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('is-active'));
          tab.classList.add('is-active');
          document.getElementById('tab-' + tab.dataset.tab).classList.add('is-active');
          if (pageTitle) pageTitle.textContent = tab.childNodes[0].textContent.trim();
          const label = document.getElementById('dashNavToggleLabel');
          if (label) label.textContent = tab.childNodes[0].textContent.trim();
          setMobileNav(false);
          if (window.matchMedia('(max-width:860px)').matches) window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      });
      setupMobileNav();
    }

    /* ---------- الجوال: قائمة الأقسام تُفتح من زر بدل الشريط الأفقي ---------- */
    function setMobileNav(open) {
      const side = document.getElementById('dashSidebar');
      const btn = document.getElementById('dashNavToggle');
      if (!side || !btn) return;
      side.classList.toggle('nav-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    function setupMobileNav() {
      const side = document.getElementById('dashSidebar');
      const btn = document.getElementById('dashNavToggle');
      if (!side || !btn) return;
      btn.addEventListener('click', (e) => { e.stopPropagation(); setMobileNav(!side.classList.contains('nav-open')); });
      document.addEventListener('click', (e) => { if (side.classList.contains('nav-open') && !side.contains(e.target)) setMobileNav(false); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && side.classList.contains('nav-open')) { setMobileNav(false); btn.focus(); } });
      // عدد العناصر المنتظرة (مثل التقييمات) يظهر على الزر وهو مغلق
      const badge = document.getElementById('dashNavToggleBadge');
      const syncBadge = () => {
        const total = [...document.querySelectorAll('.dash-tab:not(.hidden) .tab-count:not([hidden])')].reduce((n, b) => n + (parseInt(b.textContent, 10) || 0), 0);
        badge.hidden = !total; badge.textContent = total;
      };
      new MutationObserver(syncBadge).observe(document.getElementById('dashTabsNav'), { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'class'] });
      syncBadge();
    }

    function setupLogout() {
      const logout = async () => {
        await api('/api/logout', { method: 'POST' });
        window.location.href = '/login';
      };
      document.getElementById('logoutBtn').addEventListener('click', logout);
      setupUserMenu(logout);
    }

    // قائمة المستخدم في رأس اللوحة: بياناته، والانتقال لإعدادات حسابه، وتسجيل الخروج
    function fillUserMenu() {
      if (!currentUser) return;
      const roles = { super_admin: 'المالك الرئيسي', owner: 'مالك', editor: 'محرر', viewer: 'مشاهد' };
      document.getElementById('currentUserLabel').textContent = currentUser.username;
      document.getElementById('userMenuRole').textContent = roles[currentUser.role] || (currentUser.isAdmin ? 'مسؤول' : 'موظف');
      document.getElementById('userMenuEmail').textContent = currentUser.email || '';
      document.getElementById('userMenuAvatar').textContent = (currentUser.username || '؟').trim().charAt(0).toUpperCase();
    }
    function setupUserMenu(logout) {
      const btn = document.getElementById('userMenuBtn'), menu = document.getElementById('userMenu');
      const setOpen = (open) => { menu.hidden = !open; btn.setAttribute('aria-expanded', open ? 'true' : 'false'); };
      btn.addEventListener('click', (e) => { e.stopPropagation(); fillUserMenu(); setOpen(menu.hidden); });
      document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target) && e.target !== btn) setOpen(false); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { setOpen(false); btn.focus(); } });
      document.getElementById('userMenuAccount').addEventListener('click', () => {
        setOpen(false);
        document.querySelector('.dash-tab[data-tab="account"]')?.click();
        document.getElementById('tab-account')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      document.getElementById('userMenuLogout').addEventListener('click', logout);
    }

    /* ---------- نافذة تأكيد عامة (تُستخدم للحذف بكل أنواعه) ---------- */
    function setupConfirmModal() {
      const modal = document.getElementById('confirmModal');
      document.getElementById('confirmCancel').addEventListener('click', () => {
        modal.classList.add('hidden');
        pendingConfirmAction = null;
      });
      document.getElementById('confirmOk').addEventListener('click', async () => {
        if (pendingConfirmAction) {
          try {
            await pendingConfirmAction();
          } catch (err) {
            showToast(err.message);
          }
        }
        modal.classList.add('hidden');
        pendingConfirmAction = null;
      });
    }

    function askConfirm(title, message, action) {
      document.getElementById('confirmTitle').textContent = title;
      document.getElementById('confirmMessage').textContent = message;
      pendingConfirmAction = action;
      document.getElementById('confirmModal').classList.remove('hidden');
    }

    /* ============================= تبويب الأعمال ============================= */

    function setupAddWorkForm() {
      document.getElementById('addWorkForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
          title: { ar: document.getElementById('w-title-ar').value.trim(), en: document.getElementById('w-title-en').value.trim() },
          city: { ar: document.getElementById('w-city-ar').value.trim(), en: document.getElementById('w-city-en').value.trim() },
          category: document.getElementById('w-category').value,
          meta: { ar: document.getElementById('w-meta-ar').value.trim(), en: document.getElementById('w-meta-en').value.trim() },
          area: { ar: document.getElementById('w-area-ar').value.trim(), en: document.getElementById('w-area-en').value.trim() },
          description: { ar: document.getElementById('w-description-ar').value.trim(), en: document.getElementById('w-description-en').value.trim() },
        };
        const imageFiles = document.getElementById('w-images').files;

        try {
          const result = await api('/api/works', { method: 'POST', body: JSON.stringify(payload) });
          const newWorkId = result.work.id;

          if (imageFiles && imageFiles.length > 0) {
            const fd = new FormData();
            (await compressImages(imageFiles, 'work')).forEach(file => fd.append('images[]', file, file.name));
            try {
              await api(`/api/works/${newWorkId}/images`, { method: 'PUT', body: fd });
            } catch (imgErr) {
              showToast('تمت إضافة العمل، لكن تعذر رفع الصور: ' + imgErr.message);
              e.target.reset();
              loadWorks();
              return;
            }
          }

          e.target.reset();
          showToast('تمت إضافة العمل' + (imageFiles.length ? ' وصوره' : '') + ' بنجاح.');
          loadWorks();
        } catch (err) {
          showToast(err.message);
        }
      });
    }

    async function loadWorks() {
      const container = document.getElementById('worksList');
      try {
        const data = await api('/api/works');
        const works = (data.works || []).sort((a, b) => a.order - b.order);
        renderWorks(works);
      } catch (err) {
        container.innerHTML = `<p class="muted">تعذر تحميل الأعمال: ${err.message}</p>`;
      }
    }

    function renderWorks(works) {
      const container = document.getElementById('worksList');
      const pinnedCount = works.filter(w => w.pinned).length;
      document.getElementById('pinnedCount').textContent = `${pinnedCount} / 6 مثبتة بالرئيسية`;

      if (!works.length) {
        container.innerHTML = '<p class="muted">لا توجد أعمال بعد.</p>';
        return;
      }

      container.innerHTML = '';
      works.forEach(w => {
        const perms = currentUser.isAdmin ? { addWork: true, editWork: true, hideWork: true, deleteWork: true } : currentUser.permissions;
        const coverImage = (w.images && w.images[0]) || '';
        const statusLabel = w.visible ? 'ظاهر' : 'مخفي';
        const metaLabel = CATEGORY_LABELS[w.category] || w.category;

        const card = el(`
          <div class="work-card" data-id="${w.id}">
            ${coverImage
              ? `<img class="work-card-image" src="${coverImage}" alt="${escapeAttr(biText(w.title))}">`
              : `<div class="work-card-image placeholder">لا توجد صورة</div>`}
            <div class="work-card-body">
              <h3 class="work-card-title">${escapeHtml(biText(w.title))}</h3>
              <div class="work-card-meta">${escapeHtml(metaLabel)}<span class="sep">‧</span>${escapeHtml(statusLabel)}</div>
              <div class="work-card-chips"></div>
            </div>
          </div>
        `);

        const chips = card.querySelector('.work-card-chips');

        if (perms.editWork) {
          const editBtn = el(`<button type="button" class="chip-btn">تعديل</button>`);
          editBtn.addEventListener('click', () => openEditWork(w));
          chips.appendChild(editBtn);

          const imagesBtn = el(`<button type="button" class="chip-btn">الصور</button>`);
          imagesBtn.addEventListener('click', () => openImagesModal(w));
          chips.appendChild(imagesBtn);

          const pinBtn = el(`<button type="button" class="chip-btn ${w.pinned ? 'is-on' : ''}">${w.pinned ? 'إلغاء التثبيت' : 'تثبيت بالرئيسية'}</button>`);
          pinBtn.addEventListener('click', async () => {
            try {
              await api(`/api/works/${w.id}/pin`, { method: 'PATCH', body: JSON.stringify({ pinned: !w.pinned }) });
              loadWorks();
            } catch (err) { showToast(err.message); }
          });
          chips.appendChild(pinBtn);
        }

        if (perms.hideWork) {
          const visBtn = el(`<button type="button" class="chip-btn">${w.visible ? 'إخفاء' : 'إظهار'}</button>`);
          visBtn.addEventListener('click', async () => {
            try {
              await api(`/api/works/${w.id}/visibility`, { method: 'PATCH', body: JSON.stringify({ visible: !w.visible }) });
              loadWorks();
            } catch (err) { showToast(err.message); }
          });
          chips.appendChild(visBtn);
        }

        if (perms.deleteWork) {
          const delBtn = el(`<button type="button" class="chip-btn danger">حذف</button>`);
          delBtn.addEventListener('click', () => {
            askConfirm('حذف العمل', `هل أنت متأكد من حذف "${biText(w.title)}" نهائياً؟ لا يمكن التراجع عن هذا الإجراء.`, async () => {
              await api(`/api/works/${w.id}`, { method: 'DELETE' });
              showToast('تم حذف العمل.');
              loadWorks();
            });
          });
          chips.appendChild(delBtn);
        }

        container.appendChild(card);
      });
    }

    /* ---------- تعديل عمل ---------- */
    function openEditWork(work) {
      const overlay = el(`
        <div class="modal-overlay">
          <div class="modal-box" style="max-width:520px;">
            <h3>تعديل: ${escapeHtml(biText(work.title))}</h3>
            <div class="bi-field">
              <label>اسم المشروع</label>
              <div class="bi-row"><span class="bi-badge">AR</span><input type="text" id="ew-title-ar" value="${escapeAttr(biAr(work.title))}"></div>
              <div class="bi-row"><span class="bi-badge en">EN</span><input type="text" id="ew-title-en" value="${escapeAttr(biEn(work.title))}"></div>
            </div>
            <div class="bi-field">
              <label>المدينة</label>
              <div class="bi-row"><span class="bi-badge">AR</span><input type="text" id="ew-city-ar" value="${escapeAttr(biAr(work.city))}"></div>
              <div class="bi-row"><span class="bi-badge en">EN</span><input type="text" id="ew-city-en" value="${escapeAttr(biEn(work.city))}"></div>
            </div>
            <div class="form-field">
              <label>التصنيف</label>
              <select id="ew-category">
                <option value="residential" ${work.category === 'residential' ? 'selected' : ''}>سكني</option>
                <option value="commercial" ${work.category === 'commercial' ? 'selected' : ''}>تجاري</option>
                <option value="industrial" ${work.category === 'industrial' ? 'selected' : ''}>صناعي</option>
              </select>
            </div>
            <div class="bi-field">
              <label>وصف مختصر</label>
              <div class="bi-row"><span class="bi-badge">AR</span><input type="text" id="ew-meta-ar" value="${escapeAttr(biAr(work.meta))}"></div>
              <div class="bi-row"><span class="bi-badge en">EN</span><input type="text" id="ew-meta-en" value="${escapeAttr(biEn(work.meta))}"></div>
            </div>
            <div class="bi-field">
              <label>المساحة</label>
              <div class="bi-row"><span class="bi-badge">AR</span><input type="text" id="ew-area-ar" value="${escapeAttr(biAr(work.area))}"></div>
              <div class="bi-row"><span class="bi-badge en">EN</span><input type="text" id="ew-area-en" value="${escapeAttr(biEn(work.area))}"></div>
            </div>
            <div class="bi-field">
              <label>وصف تفصيلي (يظهر عند تصفح صور المشروع)</label>
              <div class="bi-row"><span class="bi-badge">AR</span><textarea id="ew-description-ar" rows="3">${escapeHtml(biAr(work.description))}</textarea></div>
              <div class="bi-row"><span class="bi-badge en">EN</span><textarea id="ew-description-en" rows="3">${escapeHtml(biEn(work.description))}</textarea></div>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-outline" id="ewCancel">إلغاء</button>
              <button type="button" class="btn btn-dark" id="ewSave">حفظ التعديلات</button>
            </div>
          </div>
        </div>
      `);
      document.body.appendChild(overlay);
      overlay.querySelector('#ewCancel').addEventListener('click', () => overlay.remove());
      overlay.querySelector('#ewSave').addEventListener('click', async () => {
        const payload = {
          title: { ar: overlay.querySelector('#ew-title-ar').value.trim(), en: overlay.querySelector('#ew-title-en').value.trim() },
          city: { ar: overlay.querySelector('#ew-city-ar').value.trim(), en: overlay.querySelector('#ew-city-en').value.trim() },
          category: overlay.querySelector('#ew-category').value,
          meta: { ar: overlay.querySelector('#ew-meta-ar').value.trim(), en: overlay.querySelector('#ew-meta-en').value.trim() },
          area: { ar: overlay.querySelector('#ew-area-ar').value.trim(), en: overlay.querySelector('#ew-area-en').value.trim() },
          description: { ar: overlay.querySelector('#ew-description-ar').value.trim(), en: overlay.querySelector('#ew-description-en').value.trim() },
        };
        try {
          await api(`/api/works/${work.id}`, { method: 'PUT', body: JSON.stringify(payload) });
          showToast('تم حفظ التعديلات.');
          overlay.remove();
          loadWorks();
        } catch (err) { showToast(err.message); }
      });
    }

    /* ---------- رفع صور معرض العمل ---------- */
    function openImagesModal(work) {
      const overlay = el(`
        <div class="modal-overlay">
          <div class="modal-box">
            <h3>صور المشروع: ${escapeHtml(work.title)}</h3>
            <p class="form-note">اختر الصور (بدون حد أقصى لعددها) — سيتم استبدال كل الصور الحالية بهذه الصور الجديدة.</p>
            <div class="form-field"><input type="file" id="im-files" accept="image/*" multiple><p class="size-hint">📐 المقاس المقترح: أفقية 1600 × 1200 بكسل (4:3)</p></div>
            <div class="modal-actions">
              <button type="button" class="btn btn-outline" id="imCancel">إلغاء</button>
              <button type="button" class="btn btn-dark" id="imSave">رفع الصور</button>
            </div>
          </div>
        </div>
      `);
      document.body.appendChild(overlay);
      overlay.querySelector('#imCancel').addEventListener('click', () => overlay.remove());
      overlay.querySelector('#imSave').addEventListener('click', async () => {
        const files = overlay.querySelector('#im-files').files;
        if (!files.length) { showToast('اختر صورة واحدة على الأقل.'); return; }
        const fd = new FormData();
        (await compressImages(files, 'work')).forEach(f => fd.append('images[]', f, f.name));
        try {
          await api(`/api/works/${work.id}/images`, { method: 'PUT', body: fd });
          showToast('تم تحديث صور المشروع.');
          overlay.remove();
          loadWorks();
        } catch (err) { showToast(err.message); }
      });
    }

    /* ============================= تبويب الحساب والمستخدمين ============================= */

    function setupUpdateProfile() {
      const form = document.getElementById('updateProfileForm');
      const msg = document.getElementById('upMessage');

      // تحميل البيانات الحالية عند الفتح
      if (currentUser && currentUser.username) {
        document.getElementById('up-username').value = currentUser.username || '';
        document.getElementById('up-email').value = currentUser.email || '';
      }

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('up-username').value.trim();
        const email = document.getElementById('up-email').value.trim();

        const payload = {};
        if (username && username !== currentUser.username) payload.username = username;
        if (email && email !== currentUser.email) payload.email = email;

        if (!username && !email) {
          msg.textContent = 'يجب ملء حقل واحد على الأقل.';
          return;
        }

        try {
          const result = await api('/api/user/profile', { method: 'PUT', body: JSON.stringify(payload) });
          msg.textContent = result.message || 'تم تحديث البيانات بنجاح.';
          currentUser = result.user;
          fillUserMenu();
        } catch (err) {
          msg.textContent = err.message;
        }
      });
    }

    function setupChangePassword() {
      document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentPassword = document.getElementById('cp-current').value;
        const newPassword = document.getElementById('cp-new').value;
        const msg = document.getElementById('cpMessage');
        try {
          await api('/api/users/me/password', { method: 'PATCH', body: JSON.stringify({ currentPassword, newPassword }) });
          msg.textContent = 'تم تحديث كلمة المرور بنجاح.';
          e.target.reset();
        } catch (err) {
          msg.textContent = err.message;
        }
      });
    }

    function setupDeleteAccount() {
      const btn = document.getElementById('deleteAccountBtn');
      if (!btn) return;

      btn.addEventListener('click', async () => {
        const confirmed = confirm('⚠️ هل أنت متأكد من حذف حسابك؟ هذا لا يمكن التراجع عنه!');
        if (!confirmed) return;

        const confirmed2 = confirm('هذا سيحذف حسابك نهائياً. اكتب "delete" في الخانة التالية للتأكيد.');
        if (!confirmed2) return;

        const confirmation = prompt('اكتب "delete" للتأكيد:');
        if (confirmation !== 'delete') {
          alert('إلغاء: كلمة التأكيد غير صحيحة.');
          return;
        }

        try {
          await api(`/api/users/${currentUser.id}`, { method: 'DELETE' });
          alert('تم حذف حسابك بنجاح.');
          window.location.href = '/login';
        } catch (err) {
          alert('خطأ: ' + err.message);
        }
      });
    }

    function setupResetSetup() {
      const btn = document.getElementById('resetSetupBtn');
      if (!btn) return;

      btn.addEventListener('click', async () => {
        const confirmed = confirm('⚠️ تحذير: هذا سيحذف جميع المستخدمين والرسائل والمحادثات!\n\nهل أنت متأكد من رغبتك في إعادة تعيين الإعدادات؟');
        if (!confirmed) return;

        const confirmed2 = confirm('تأكيد نهائي: اكتب "reset" في الخانة التالية.');
        if (!confirmed2) return;

        const confirmation = prompt('اكتب "reset" للتأكيد:');
        if (confirmation !== 'reset') {
          alert('إلغاء: كلمة التأكيد غير صحيحة.');
          return;
        }

        try {
          const result = await api('/api/admin/reset-setup', { method: 'POST' });
          try { if (result.setupGrant) sessionStorage.setItem('alomran_setup_grant', result.setupGrant); } catch (_) {}
          alert('تم إعادة تعيين الإعدادات. سيتم نقلك إلى صفحة الإعداد.');
          window.location.href = '/setup';
        } catch (err) {
          alert('خطأ: ' + err.message);
        }
      });
    }

    const PERMISSION_KEYS = ['addWork', 'editWork', 'hideWork', 'deleteWork', 'viewMessages', 'replyMessages', 'manageChat'];
    const ROLE_LABELS = { super_admin: 'المالك الرئيسي', owner: 'مالك', editor: 'محرر', viewer: 'مشاهد' };

    function setupAddUserForm() {
      document.getElementById('nu-role').addEventListener('change', (e) => {
        const role = e.target.value;
        PERMISSION_KEYS.forEach(k => {
          const box = document.getElementById('nu-' + k);
          if (role === 'owner') box.checked = true;
          else if (role === 'viewer') box.checked = false;
          box.disabled = role === 'owner';
        });
      });
      document.getElementById('addUserForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('nu-email') ? document.getElementById('nu-email').value.trim() : '';
        const role = document.getElementById('nu-role') ? document.getElementById('nu-role').value : 'editor';
        const payload = {
          username: document.getElementById('nu-username').value.trim(),
          email: email,
          password: document.getElementById('nu-password').value,
          role: role,
          permissions: {
            addWork: document.getElementById('nu-addWork').checked,
            editWork: document.getElementById('nu-editWork').checked,
            hideWork: document.getElementById('nu-hideWork').checked,
            deleteWork: document.getElementById('nu-deleteWork').checked,
            viewMessages: document.getElementById('nu-viewMessages') ? document.getElementById('nu-viewMessages').checked : false,
            replyMessages: document.getElementById('nu-replyMessages') ? document.getElementById('nu-replyMessages').checked : false,
            manageChat: document.getElementById('nu-manageChat') ? document.getElementById('nu-manageChat').checked : false,
          },
        };
        try {
            const result = await api('/api/users', { method: 'POST', body: JSON.stringify(payload) });
          showToast(result.message || 'تم إنشاء المستخدم بنجاح.');
          e.target.reset();
          document.getElementById('nu-role').dispatchEvent(new Event('change'));
          loadUsers();
        } catch (err) { showToast(err.message); }
      });
    }

    async function loadUsers() {
      const container = document.getElementById('usersList');
      try {
        const data = await api('/api/users');
        renderUsers(data.users || []);
      } catch (err) {
        container.innerHTML = `<p class="muted">تعذر تحميل المستخدمين: ${err.message}</p>`;
      }
    }

    function isOwnerRole(role) {
      return role === 'super_admin' || role === 'owner';
    }

    // Mirrors the server rules: owners manage non-owners; only the super admin manages other owners.
    function canManage(u) {
      if (u.id === currentUser.id || u.role === 'super_admin') return false;
      if (isOwnerRole(u.role)) return currentUser.role === 'super_admin';
      return isOwnerRole(currentUser.role);
    }

    function renderUsers(users) {
      const container = document.getElementById('usersList');
      container.innerHTML = '';
      users.forEach(u => {
        const row = el(`
          <div class="user-row" data-id="${u.id}">
            <div class="work-row-main">
              <strong>${escapeHtml(u.username)}</strong>
              ${u.email ? `<span class="muted">${escapeHtml(u.email)}</span>` : ''}
              <span class="work-tag">${escapeHtml(ROLE_LABELS[u.role] || u.role || '')}</span>
              ${u.id === currentUser.id ? '<span class="muted">(أنت)</span>' : ''}
              <span class="user-status ${u.suspended ? 'suspended' : 'active'}">${u.suspended ? 'موقوف' : 'نشط'}</span>
            </div>
            <div class="work-actions"></div>
          </div>
        `);
        const actions = row.querySelector('.work-actions');

        if (canManage(u)) {
          const permBtn = el(`<button type="button">الصلاحيات</button>`);
          permBtn.addEventListener('click', () => openPermModal(u));
          actions.appendChild(permBtn);
        }

        if (u.id === currentUser.id) {
          // حذف الحساب الخاص يتم من قسم "حذف حسابك"
        } else if (u.role === 'super_admin') {
          actions.appendChild(el(`<span class="muted" style="font-size:12.5px">لا يمكن حذف المالك الرئيسي</span>`));
        } else if (canManage(u)) {
          const delBtn = el(`<button type="button" class="danger">حذف</button>`);
          delBtn.addEventListener('click', () => {
            askConfirm('حذف المستخدم', `هل أنت متأكد من حذف المستخدم "${u.username}" نهائياً؟`, async () => {
              try {
                await api(`/api/users/${u.id}`, { method: 'DELETE' });
                showToast('تم حذف المستخدم.');
                loadUsers();
              } catch (err) {
                showToast('خطأ: ' + err.message);
              }
            });
          });
          actions.appendChild(delBtn);
        }
        container.appendChild(row);
      });
    }

    /* ---------- نافذة الصلاحيات + الإيقاف المؤقت ---------- */
    let permModalUserId = null;
    let permModalUser = null;
    function setupPermModal() {
      document.getElementById('permModalCancel').addEventListener('click', () => {
        document.getElementById('permModal').classList.add('hidden');
      });
      document.getElementById('permModalSave').addEventListener('click', async () => {
        if (!permModalUserId) return;
        const permissions = {
          addWork: document.getElementById('pm-addWork').checked,
          editWork: document.getElementById('pm-editWork').checked,
          hideWork: document.getElementById('pm-hideWork').checked,
          deleteWork: document.getElementById('pm-deleteWork').checked,
          viewMessages: document.getElementById('pm-viewMessages') ? document.getElementById('pm-viewMessages').checked : false,
          replyMessages: document.getElementById('pm-replyMessages') ? document.getElementById('pm-replyMessages').checked : false,
          manageChat: document.getElementById('pm-manageChat') ? document.getElementById('pm-manageChat').checked : false,
        };
        const suspended = document.getElementById('pm-suspended').checked;
        try {
          if (!permModalUser.isAdmin) {
            await api(`/api/users/${permModalUserId}/permissions`, { method: 'PATCH', body: JSON.stringify({ permissions }) });
          }
          if (suspended !== !!permModalUser.suspended) {
            await api(`/api/users/${permModalUserId}/suspend`, { method: 'PATCH', body: JSON.stringify({ suspended }) });
          }
          showToast('تم حفظ التغييرات.');
          document.getElementById('permModal').classList.add('hidden');
          loadUsers();
        } catch (err) {
          showToast(err.message);
        }
      });
    }

    function openPermModal(user) {
      permModalUserId = user.id;
      permModalUser = user;
      document.getElementById('permModalUsername').textContent = user.username;
      ['addWork', 'editWork', 'hideWork', 'deleteWork', 'viewMessages', 'replyMessages', 'manageChat'].forEach(k => {
        document.getElementById('pm-' + k).disabled = !!user.isAdmin;
      });
      document.getElementById('pm-addWork').checked = !!user.permissions.addWork;
      document.getElementById('pm-editWork').checked = !!user.permissions.editWork;
      document.getElementById('pm-hideWork').checked = !!user.permissions.hideWork;
      document.getElementById('pm-deleteWork').checked = !!user.permissions.deleteWork;

      // صلاحيات خدمة العملاء
      if (document.getElementById('pm-viewMessages')) document.getElementById('pm-viewMessages').checked = !!user.permissions.viewMessages;
      if (document.getElementById('pm-replyMessages')) document.getElementById('pm-replyMessages').checked = !!user.permissions.replyMessages;
      if (document.getElementById('pm-manageChat')) document.getElementById('pm-manageChat').checked = !!user.permissions.manageChat;

      document.getElementById('pm-suspended').checked = !!user.suspended;

      // إضافة زر حذف المستخدم إذا كان الحساب قابلاً للحذف
      const deleteContainer = document.getElementById('deleteUserBtnContainer');
      if (deleteContainer) {
        deleteContainer.innerHTML = '';
        if (canManage(user)) {
          const resetBtn = el(`<button type="button" class="btn btn-outline btn-sm">تعيين كلمة مرور جديدة</button>`);
          resetBtn.addEventListener('click', async () => {
            const newPassword = prompt(`كلمة المرور الجديدة للمستخدم "${user.username}" (12 حرفاً على الأقل):`);
            if (newPassword === null) return;
            if (newPassword.length < 12) { showToast('كلمة المرور يجب ألا تقل عن 12 حرفاً.'); return; }
            try {
              const result = await api(`/api/users/${user.id}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) });
              showToast(result.message || 'تم تعيين كلمة المرور الجديدة.');
            } catch (err) {
              showToast('خطأ: ' + err.message);
            }
          });
          deleteContainer.appendChild(resetBtn);

          const delBtn = el(`<button type="button" class="danger" id="permModalDeleteBtn">حذف هذا المستخدم</button>`);
          delBtn.addEventListener('click', () => {
            askConfirm('حذف المستخدم', `هل أنت متأكد من حذف المستخدم "${user.username}" نهائياً؟`, async () => {
              try {
                await api(`/api/users/${user.id}`, { method: 'DELETE' });
                showToast('تم حذف المستخدم.');
                document.getElementById('permModal').classList.add('hidden');
                loadUsers();
              } catch (err) {
                showToast('خطأ: ' + err.message);
              }
            });
          });
          deleteContainer.appendChild(delBtn);
        }
      }

      document.getElementById('permModal').classList.remove('hidden');
    }

    /* ============================= تبويب الهوية والمظهر ============================= */

    async function loadIdentity() {
      try {
        const settings = await api('/api/settings');

        fillTypographyForm(settings.typography || {});

        renderIdentityPreview('logoPreview', settings.logo);
        renderIdentityPreview('faviconPreview', settings.favicon);
        fillShareCard(settings.share || {});
        const lb = settings.loginButton || {};
        document.getElementById('loginBtnDesktop').checked = lb.desktop !== false;
        document.getElementById('loginBtnMobile').checked = lb.mobile !== false;
        renderIdentityPreview('aboutBgPreview', settings.aboutHeroBg);
        renderIdentityPreview('projectsBgPreview', settings.projectsHeroBg);
        renderBanners(settings.banners || []);

        const projectLogo = settings.projectLogo || { image: '', visible: true };
        renderIdentityPreview('projectLogoPreview', projectLogo.image);
        document.getElementById('projectLogoVisible').checked = !!projectLogo.visible;

        const bannerLogo = settings.bannerLogo || { image: '', visible: true };
        renderIdentityPreview('bannerLogoPreview', bannerLogo.image);
        document.getElementById('bannerLogoVisible').checked = !!bannerLogo.visible;
        document.getElementById('bannerTextVisible').checked = settings.bannerTextVisible !== false;

        const stats = settings.stats || {};
        document.getElementById('stat-years').value = stats.yearsExperience || '';
        document.getElementById('stat-projects').value = stats.projectsDone || '';
        document.getElementById('stat-cities').value = stats.citiesServed || '';
        document.getElementById('stat-satisfaction').value = stats.clientSatisfaction || '';

        renderServicesEditor(settings.services || []);
        renderTestimonialsEditor(settings.testimonials || [], settings.testimonialsVisible !== false);
        ['licenses', 'awards', 'partners'].forEach(k => renderShowcase(k, settings[k] || []));
        renderTeamEditor(settings.team || []);

        const welcome = settings.welcomeMessage || {};
        document.getElementById('welcomeEnabled').checked = !!welcome.enabled;
        document.getElementById('welcomeTitle-ar').value = biAr(welcome.title);
        document.getElementById('welcomeTitle-en').value = biEn(welcome.title);
        document.getElementById('welcomeMessageText-ar').value = biAr(welcome.message);
        document.getElementById('welcomeMessageText-en').value = biEn(welcome.message);
        document.getElementById('welcomeButtonText-ar').value = biAr(welcome.buttonText);
        document.getElementById('welcomeButtonText-en').value = biEn(welcome.buttonText);
        document.getElementById('welcomeDuration').value = welcome.durationSeconds || 6;


        const content = settings.content || {};
        document.getElementById('footerTagline-ar').value = biAr(content.footerTagline);
        document.getElementById('footerTagline-en').value = biEn(content.footerTagline);
        document.getElementById('mapUrl').value = content.mapUrl || '';
        document.getElementById('mapCoords').value = content.mapCoords || '';
      } catch (err) {
        showToast('تعذر تحميل إعدادات الهوية: ' + err.message);
      }
    }

    function renderIdentityPreview(elementId, src) {
      const box = document.getElementById(elementId);
      if (!box) return;
      box.innerHTML = src ? `<img src="${src}" alt="">` : 'لا يوجد ملف مرفوع بعد';
    }

    function renderBanners(banners) {
      const container = document.getElementById('bannersEditor');
      container.innerHTML = '';
      for (let i = 0; i < 5; i++) {
        const b = banners[i] || { image: '', title: { ar: '', en: '' } };
        const card = el(`
          <div class="banner-edit-card" data-slot="${i + 1}">
            <strong class="banner-edit-title">البانر ${i + 1}</strong>
            <div class="identity-preview">${b.image ? `<img src="${escapeAttr(b.image)}" alt="">` : 'لا توجد صورة'}</div>
            <div class="bi-row"><span class="bi-badge">AR</span><input type="text" class="bn-ar" placeholder="النص العربي" value="${escapeAttr(biAr(b.title))}"></div>
            <div class="bi-row"><span class="bi-badge en">EN</span><input type="text" class="bn-en" placeholder="English text" value="${escapeAttr(biEn(b.title))}"></div>
            <input type="text" class="bn-link" dir="ltr" maxlength="600" placeholder="رابط عند الضغط (اختياري): https://... أو /projects" value="${escapeAttr(b.link || '')}">
            <input type="file" class="bn-file" accept="image/png,image/jpeg,image/webp">
            <p class="size-hint">📐 1920 × 1080 بكسل (16:9)</p>
            <div class="banner-edit-actions">
              <button type="button" class="btn btn-dark btn-sm bn-save">حفظ البانر ${i + 1}</button>
              ${b.image ? '<button type="button" class="btn btn-outline btn-sm bn-del">حذف</button>' : ''}
            </div>
          </div>
        `);
        card.querySelector('.bn-del')?.addEventListener('click', async () => {
          if (!confirm(`حذف البانر ${i + 1}؟ ستُحذف صورته نهائياً.`)) return;
          try { await api(`/api/settings/banner/${i + 1}`, { method: 'DELETE' }); showToast(`تم حذف البانر ${i + 1}.`); loadIdentity(); }
          catch (err) { showToast(err.message); }
        });
        card.querySelector('.bn-save').addEventListener('click', async () => {
          const fd = new FormData();
          fd.append('titleAr', card.querySelector('.bn-ar').value.trim());
          fd.append('titleEn', card.querySelector('.bn-en').value.trim());
          fd.append('link', card.querySelector('.bn-link').value.trim());
          const file = card.querySelector('.bn-file').files[0];
          if (file) { const img = await compressImage(file, 'background'); fd.append('image', img, img.name); }
          try {
            await api(`/api/settings/banner/${i + 1}`, { method: 'PUT', body: fd });
            showToast(`تم حفظ البانر ${i + 1}.`);
            loadIdentity();
          } catch (err) { showToast(err.message); }
        });
        container.appendChild(card);
      }
    }

    let servicesCache = [];

    function renderServicesEditor(services) {
      servicesCache = services.slice();
      const container = document.getElementById('servicesEditor');
      container.innerHTML = '';
      servicesCache.forEach((s, i) => {
        const card = el(`
          <div class="banner-edit-card" data-index="${i}">
            <div class="bi-row"><span class="bi-badge">AR</span><input type="text" class="svc-title-ar" placeholder="عنوان الخدمة" value="${escapeAttr(biAr(s.title))}"></div>
            <div class="bi-row"><span class="bi-badge en">EN</span><input type="text" class="svc-title-en" placeholder="Service title" value="${escapeAttr(biEn(s.title))}"></div>
            <div class="bi-row"><span class="bi-badge">AR</span><textarea class="svc-desc-ar" rows="2" placeholder="وصف الخدمة">${escapeHtml(biAr(s.description))}</textarea></div>
            <div class="bi-row"><span class="bi-badge en">EN</span><textarea class="svc-desc-en" rows="2" placeholder="Service description">${escapeHtml(biEn(s.description))}</textarea></div>
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn btn-dark btn-sm svc-save" style="flex:1;">حفظ</button>
              <button type="button" class="btn btn-danger btn-sm svc-remove">حذف</button>
            </div>
          </div>
        `);
        card.querySelector('.svc-save').addEventListener('click', () => {
          servicesCache[i] = {
            title: { ar: card.querySelector('.svc-title-ar').value.trim(), en: card.querySelector('.svc-title-en').value.trim() },
            description: { ar: card.querySelector('.svc-desc-ar').value.trim(), en: card.querySelector('.svc-desc-en').value.trim() },
          };
          saveServices();
        });
        card.querySelector('.svc-remove').addEventListener('click', () => {
          if (servicesCache.length <= 1) {
            showToast('يجب أن تبقى خدمة واحدة على الأقل.');
            return;
          }
          servicesCache.splice(i, 1);
          saveServices();
        });
        container.appendChild(card);
      });
    }

    async function saveServices() {
      const msgBox = document.getElementById('servicesMessage');
      try {
        await api('/api/settings/services', { method: 'PUT', body: JSON.stringify({ services: servicesCache }) });
        msgBox.textContent = 'تم حفظ الخدمات بنجاح.';
        loadIdentity();
      } catch (err) { msgBox.textContent = err.message; }
    }

    /* ---------- آراء العملاء: إضافة وتعديل وترتيب وإخفاء ---------- */
    let testimonialsCache = [];
    function readTestimonialCards() {
      return [...document.querySelectorAll('#testimonialsEditor .testimonial-edit')].map(card => ({
        id: card.dataset.id || '',
        ...(card.dataset.reviewId ? { reviewId: card.dataset.reviewId, source: 'review' } : {}),
        name: { ar: card.querySelector('.ts-name-ar').value.trim(), en: card.querySelector('.ts-name-en').value.trim() },
        role: { ar: card.querySelector('.ts-role-ar').value.trim(), en: card.querySelector('.ts-role-en').value.trim() },
        text: { ar: card.querySelector('.ts-text-ar').value.trim(), en: card.querySelector('.ts-text-en').value.trim() },
        rating: parseInt(card.querySelector('.ts-rating').value, 10) || 5,
        visible: card.querySelector('.ts-visible').checked,
      }));
    }
    function renderTestimonialsEditor(list, visible) {
      testimonialsCache = list.map(t => ({ ...t }));
      if (visible !== undefined) document.getElementById('testimonialsVisible').checked = visible;
      const box = document.getElementById('testimonialsEditor');
      box.innerHTML = testimonialsCache.length ? '' : '<p class="muted">لا توجد آراء بعد. اضغط «إضافة رأي عميل».</p>';
      testimonialsCache.forEach((t, i) => {
        const card = el(`
          <div class="banner-edit-card testimonial-edit" data-id="${escapeAttr(t.id || '')}"${t.reviewId ? ` data-review-id="${escapeAttr(t.reviewId)}"` : ''}>
            <div class="ts-head">
              <strong>الرأي ${i + 1}${t.reviewId ? ' <span class="rvd-status approved">✓ من رابط التقييم</span>' : ''}</strong>
              <span class="ts-tools">
                <button type="button" class="btn btn-outline btn-sm ts-up" title="تحريك للأعلى" ${i === 0 ? 'disabled' : ''}>▲</button>
                <button type="button" class="btn btn-outline btn-sm ts-down" title="تحريك للأسفل" ${i === testimonialsCache.length - 1 ? 'disabled' : ''}>▼</button>
              </span>
            </div>
            <div class="bi-row"><span class="bi-badge">AR</span><input type="text" class="ts-name-ar" placeholder="اسم العميل" value="${escapeAttr(biAr(t.name))}"></div>
            <div class="bi-row"><span class="bi-badge en">EN</span><input type="text" dir="ltr" class="ts-name-en" placeholder="Client name" value="${escapeAttr(biEn(t.name))}"></div>
            <div class="bi-row"><span class="bi-badge">AR</span><input type="text" class="ts-role-ar" placeholder="الصفة أو المشروع (مثال: مالك فيلا – جدة)" value="${escapeAttr(biAr(t.role))}"></div>
            <div class="bi-row"><span class="bi-badge en">EN</span><input type="text" dir="ltr" class="ts-role-en" placeholder="Role / project (e.g. Villa owner – Jeddah)" value="${escapeAttr(biEn(t.role))}"></div>
            <div class="bi-row"><span class="bi-badge">AR</span><textarea class="ts-text-ar" rows="3" placeholder="رأي العميل">${escapeHtml(biAr(t.text))}</textarea></div>
            <div class="bi-row"><span class="bi-badge en">EN</span><textarea dir="ltr" class="ts-text-en" rows="3" placeholder="Client review">${escapeHtml(biEn(t.text))}</textarea></div>
            <div class="ts-foot">
              <label>التقييم
                <select class="ts-rating">${[5, 4, 3, 2, 1].map(n => `<option value="${n}"${(t.rating || 5) === n ? ' selected' : ''}>${'★'.repeat(n)}${'☆'.repeat(5 - n)} (${n})</option>`).join('')}</select>
              </label>
              <label class="perm-check"><input type="checkbox" class="ts-visible"${t.visible === false ? '' : ' checked'}> ظاهر</label>
              <button type="button" class="btn btn-danger btn-sm ts-remove">حذف</button>
            </div>
          </div>
        `);
        const move = (to) => { testimonialsCache = readTestimonialCards(); const [it] = testimonialsCache.splice(i, 1); testimonialsCache.splice(to, 0, it); renderTestimonialsEditor(testimonialsCache); };
        card.querySelector('.ts-up').addEventListener('click', () => move(i - 1));
        card.querySelector('.ts-down').addEventListener('click', () => move(i + 1));
        card.querySelector('.ts-remove').addEventListener('click', () => {
          if (!confirm('حذف هذا الرأي؟')) return;
          testimonialsCache = readTestimonialCards(); testimonialsCache.splice(i, 1); renderTestimonialsEditor(testimonialsCache);
          document.getElementById('testimonialsMessage').textContent = 'اضغط «حفظ آراء العملاء» لتأكيد الحذف.';
        });
        box.appendChild(card);
      });
    }
    function setupTestimonials() {
      document.getElementById('addTestimonialBtn').addEventListener('click', () => {
        testimonialsCache = readTestimonialCards();
        testimonialsCache.push({ name: { ar: '', en: '' }, role: { ar: '', en: '' }, text: { ar: '', en: '' }, rating: 5, visible: true });
        renderTestimonialsEditor(testimonialsCache);
        document.querySelector('#testimonialsEditor .testimonial-edit:last-child .ts-name-ar')?.focus();
      });
      document.getElementById('saveTestimonialsBtn').addEventListener('click', async () => {
        const msgBox = document.getElementById('testimonialsMessage');
        const list = readTestimonialCards();
        const incomplete = list.filter(t => !(t.name.ar || t.name.en) || !(t.text.ar || t.text.en)).length;
        try {
          const r = await api('/api/settings/testimonials', { method: 'PUT', body: JSON.stringify({ testimonials: list, visible: document.getElementById('testimonialsVisible').checked }) });
          renderTestimonialsEditor(r.testimonials, r.visible);
          loadReviews(true);
          msgBox.textContent = 'تم حفظ آراء العملاء.' + (incomplete ? ` (تجاهلنا ${incomplete} بدون اسم أو نص)` : '');
        } catch (err) { msgBox.textContent = err.message; }
      });
    }

    /* ---------- التقييمات: روابط تقييم خاصة لكل عميل + الموافقة على النشر ---------- */
    const REVIEW_STATUS = {
      invited: { label: 'لم يقيّم بعد', cls: 'invited' },
      pending: { label: 'بانتظار الموافقة', cls: 'pending' },
      approved: { label: 'منشور في الموقع', cls: 'approved' },
      hidden: { label: 'مخفي', cls: 'hidden' },
    };
    const reviewsState = { list: [], filter: 'all', data: null };

    const fmtDay = (iso) => { try { return new Date(iso).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { year: 'numeric', month: 'short', day: 'numeric' }); } catch (_) { return ''; } };
    const starsText = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
    const waNumber = (p) => { let d = String(p || '').replace(/\D/g, ''); if (d.startsWith('00')) d = d.slice(2); if (d.startsWith('05')) d = '966' + d.slice(1); else if (d.startsWith('5') && d.length === 9) d = '966' + d; return d; };

    async function copyText(text) {
      try { await navigator.clipboard.writeText(text); return true; } catch (_) {
        const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (_) {} ta.remove(); return ok;
      }
    }

    // أزرار إرسال الرابط: نسخ الرابط، نسخ الرسالة كاملة، واتساب، البريد
    // خياران للإرسال: واتساب أو الإيميل (من بريد الشركة)، مع نسخ الرابط كخيار إضافي
    function reviewShareButtons(r) {
      return `<div class="rvd-send">
          <button type="button" class="btn rvd-wa rvd-send-btn" data-act="whatsapp">${WA_ICON} إرسال عبر الواتساب</button>
          <button type="button" class="btn btn-dark rvd-send-btn" data-act="email">✉️ إرسال عبر الإيميل</button>
        </div>
        <div class="rvd-share">
          <input type="text" readonly dir="ltr" value="${escapeAttr(r.link)}" aria-label="رابط التقييم">
          <button type="button" class="btn btn-outline btn-sm" data-act="copy">📋 نسخ الرابط</button>
          <button type="button" class="btn btn-outline btn-sm" data-act="copyMsg">📝 نسخ الرسالة</button>
        </div>`;
    }
    const WA_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3zM12 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4C2.7 15.6 2.2 13.8 2.2 12 2.2 6.6 6.6 2.2 12 2.2S21.8 6.6 21.8 12 17.4 21.8 12 21.8zM12 0C5.4 0 0 5.4 0 12c0 2.1.6 4.2 1.6 6L0 24l6.2-1.6c1.8 1 3.8 1.5 5.8 1.5 6.6 0 12-5.4 12-12S18.6 0 12 0z"/></svg>';

    // واتساب: تُفتح النافذة فوراً عند الضغط (حتى لا يحجبها المتصفح) ثم يوضع فيها الرابط
    function sendInviteWhatsApp(r, say, win) {
      let phone = r.phone;
      if (!phone) {
        const v = prompt('رقم جوال العميل على واتساب (مثال: 0555123456)\nاتركه فارغاً لاختيار جهة الاتصال من واتساب.', '');
        if (v === null) { if (win) win.close(); return; }
        phone = v.trim();
      }
      const url = `https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(r.message)}`;
      if (win && !win.closed) win.location.href = url; else window.open(url, '_blank', 'noopener');
      api(`/api/reviews/${encodeURIComponent(r.id)}/sent`, { method: 'POST', body: JSON.stringify({ via: 'whatsapp', phone }) }).then(() => loadReviews(true)).catch(() => {});
      say(`فُتح واتساب برسالة الدعوة لـ ${r.name}. اضغط «إرسال» في واتساب لإتمام الإرسال.`);
    }

    // الإيميل: يُرسل من بريد الشركة المضبوط في لوحة التحكم
    async function sendInviteEmail(r, say, btn) {
      if (reviewsState.data && !reviewsState.data.mailConfigured) {
        say('لم يُضبط بريد الشركة للإرسال بعد. اضبطه من بطاقة «بريد الشركة للإرسال» أدناه ثم أعد المحاولة.');
        document.getElementById('mailAccountCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return false;
      }
      let email = r.email;
      if (!email) {
        const v = prompt('البريد الإلكتروني للعميل:', '');
        if (v === null || !v.trim()) return false;
        email = v.trim();
      }
      if (btn) btn.disabled = true;
      say('جارِ إرسال الدعوة بالإيميل...');
      try {
        await api(`/api/reviews/${encodeURIComponent(r.id)}/email`, { method: 'POST', body: JSON.stringify({ email }) });
        say(`✅ تم إرسال دعوة التقييم إلى ${email} من ${reviewsState.data?.senderAddress || 'بريد الشركة'}.`);
        loadReviews(true);
        return true;
      } catch (err) {
        say(err.message);
        if (err.status === 400 && /بريد الشركة/.test(err.message)) document.getElementById('mailAccountCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return false;
      } finally { if (btn) btn.disabled = false; }
    }

    function bindReviewActions(node, r, msgBox) {
      const say = (t) => { msgBox.textContent = t; };
      const markSent = (via) => api(`/api/reviews/${encodeURIComponent(r.id)}/sent`, { method: 'POST', body: JSON.stringify({ via }) }).then(() => loadReviews(true)).catch(() => {});
      node.querySelectorAll('[data-act]').forEach(btn => btn.addEventListener('click', async () => {
        const act = btn.dataset.act;
        if (act === 'copy' || act === 'copyMsg') {
          const ok = await copyText(act === 'copy' ? r.link : r.message);
          say(ok ? (act === 'copy' ? 'تم نسخ رابط التقييم.' : 'تم نسخ رسالة الدعوة مع الرابط.') : 'تعذر النسخ، انسخ الرابط يدوياً.');
          if (ok) markSent('copy');
        } else if (act === 'whatsapp') {
          sendInviteWhatsApp(r, say, r.phone ? window.open('', '_blank') : null);
        } else if (act === 'email') {
          sendInviteEmail(r, say, btn);
        } else if (act === 'approve' || act === 'hide') {
          btn.disabled = true;
          try {
            const out = await api(`/api/reviews/${encodeURIComponent(r.id)}/${act}`, { method: 'POST' });
            say(act === 'approve' ? 'تمت الموافقة، والتقييم ظاهر الآن في قسم «ماذا يقول عنا عملاؤنا».' : 'تم إخفاء التقييم من الموقع.');
            if (act === 'approve' && reviewsState.data && !reviewsState.data.testimonialsVisible) say('تمت الموافقة. تنبيه: قسم آراء العملاء مخفي حالياً، فعّل «إظهار قسم آراء العملاء» ليظهر في الموقع.');
            renderTestimonialsEditor(out.testimonials);
            loadReviews(true);
          } catch (err) { say(err.message); btn.disabled = false; }
        } else if (act === 'delete') {
          if (!confirm(r.review ? 'حذف هذا التقييم نهائياً؟ سيُحذف أيضاً من آراء العملاء في الموقع إن كان منشوراً.' : 'حذف طلب التقييم؟ لن يعمل الرابط بعد الحذف.')) return;
          try {
            const out = await api(`/api/reviews/${encodeURIComponent(r.id)}`, { method: 'DELETE' });
            renderTestimonialsEditor(out.testimonials || []);
            say('تم الحذف.'); loadReviews(true);
          } catch (err) { say(err.message); }
        }
      }));
    }

    function renderReviews() {
      const list = reviewsState.list;
      const count = (s) => list.filter(r => r.status === s).length;
      const rated = list.filter(r => r.review);
      const avg = rated.length ? (rated.reduce((a, r) => a + r.review.rating, 0) / rated.length).toFixed(1) : '—';
      document.getElementById('reviewsStats').innerHTML = [
        [count('pending'), 'بانتظار الموافقة'], [count('approved'), 'منشورة في الموقع'], [rated.length, 'تقييمات مستلمة'], [avg === '—' ? avg : avg + ' ★', 'متوسط التقييم'],
      ].map(([n, l]) => `<div class="overview-stat-card"><span class="overview-stat-num">${n}</span><span class="overview-stat-label">${l}</span></div>`).join('');

      const pending = count('pending');
      const badge = document.getElementById('reviewsPendingCount');
      if (badge) { badge.hidden = !pending; badge.textContent = pending; }

      const filters = [['all', 'الكل', list.length], ['pending', 'بانتظار الموافقة', pending], ['approved', 'منشورة', count('approved')], ['hidden', 'مخفية', count('hidden')], ['invited', 'لم يقيّم بعد', count('invited')]];
      const fbox = document.getElementById('reviewsFilters');
      fbox.innerHTML = filters.map(([k, l, n]) => `<button type="button" class="rvd-filter${reviewsState.filter === k ? ' on' : ''}" data-f="${k}">${l} <b>${n}</b></button>`).join('');
      fbox.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { reviewsState.filter = b.dataset.f; renderReviews(); }));

      const box = document.getElementById('reviewsList');
      const shown = reviewsState.filter === 'all' ? list : list.filter(r => r.status === reviewsState.filter);
      // التقييمات بانتظار الموافقة أولاً
      shown.sort((a, b) => (b.status === 'pending') - (a.status === 'pending'));
      box.innerHTML = shown.length ? '' : `<p class="muted">${list.length ? 'لا توجد عناصر في هذا التصنيف.' : 'لا توجد طلبات تقييم بعد. أنشئ أول رابط من الأعلى.'}</p>`;
      const msgBox = document.getElementById('reviewsMessage');
      const crit = (reviewsState.data && reviewsState.data.criteria) || {};
      shown.forEach(r => {
        const st = REVIEW_STATUS[r.status] || REVIEW_STATUS.invited;
        const rv = r.review;
        const sent = r.sentAt ? `أُرسل ${fmtDay(r.sentAt)}` : 'لم يُرسل بعد';
        const opened = r.openedAt ? ` · فُتح ${fmtDay(r.openedAt)}` : '';
        const critRows = rv && Object.keys(rv.criteria || {}).length
          ? `<div class="rvd-crit">${Object.entries(rv.criteria).map(([k, v]) => `<span>${escapeHtml(crit[k] || k)} <b>${starsText(v)}</b></span>`).join('')}</div>` : '';
        const node = el(`
          <article class="rvd-item rvd-${st.cls}">
            <header>
              <div><strong>${escapeHtml(rv ? rv.name : r.name)}</strong>${r.project ? `<span class="rvd-proj">📍 ${escapeHtml(r.project)}</span>` : ''}</div>
              <span class="rvd-status ${st.cls}">${st.label}</span>
            </header>
            ${rv ? `
              <div class="rvd-stars">${starsText(rv.rating)} <small>(${rv.rating}/5)</small></div>
              <p class="rvd-text">${escapeHtml(rv.text)}</p>
              ${rv.role ? `<p class="rvd-meta">الصفة: ${escapeHtml(rv.role)}</p>` : ''}
              ${critRows}
              <p class="rvd-meta">
                ${rv.recommend === true ? '👍 ينصح بالتعامل معنا · ' : rv.recommend === false ? '🤔 غير متأكد من التوصية · ' : ''}
                ${rv.consent ? '✅ وافق على النشر' : '🔒 لم يوافق على النشر (للاطلاع الداخلي فقط)'} · وصل ${fmtDay(r.submittedAt)}${rv.lang === 'en' ? ' · بالإنجليزية' : ''}
              </p>
              <div class="rvd-actions">
                ${r.status !== 'approved' ? `<button type="button" class="btn btn-sand btn-sm" data-act="approve" ${rv.consent ? '' : 'disabled title="العميل لم يوافق على النشر"'}>✓ موافقة وإظهار في الموقع</button>` : ''}
                ${r.status === 'approved' ? `<button type="button" class="btn btn-outline btn-sm" data-act="hide">إخفاء من الموقع</button>` : ''}
                <button type="button" class="btn btn-danger btn-sm" data-act="delete">حذف</button>
              </div>` : `
              <p class="rvd-meta">أُنشئ ${fmtDay(r.createdAt)} · ${sent}${opened}${r.phone ? ` · <span dir="ltr">${escapeHtml(r.phone)}</span>` : ''}${r.email ? ` · ${escapeHtml(r.email)}` : ''}</p>
              ${reviewShareButtons(r)}
              <div class="rvd-actions"><button type="button" class="btn btn-danger btn-sm" data-act="delete">حذف الطلب</button></div>`}
          </article>`);
        bindReviewActions(node, r, msgBox);
        box.appendChild(node);
      });
    }

    async function loadReviews(silent) {
      try {
        const data = await api('/api/reviews');
        reviewsState.data = data; reviewsState.list = data.reviews || [];
        renderReviews();
        if (!silent) { fillReviewInviteSettings(data); fillReviewEmail(data); }
      } catch (err) {
        document.getElementById('reviewsList').innerHTML = `<p class="muted">${escapeHtml(err.message)}</p>`;
      }
    }

    function fillReviewInviteSettings(data) {
      const inv = data.invite || {}, d = data.defaults || {};
      document.getElementById('ris-title').value = inv.title || d.title || '';
      document.getElementById('ris-description').value = inv.description || d.description || '';
      document.getElementById('ris-message').value = inv.message || d.message || '';
      reviewsState.image = inv.image || '';
      updateReviewPreview();
    }
    function updateReviewPreview() {
      const d = (reviewsState.data && reviewsState.data.defaults) || {};
      document.getElementById('rvPreviewImg').src = reviewsState.image || d.image || '/images/review-share.jpg';
      document.getElementById('rvPreviewTitle').textContent = document.getElementById('ris-title').value.trim() || d.title || '';
      document.getElementById('rvPreviewDesc').textContent = document.getElementById('ris-description').value.trim() || d.description || '';
      document.getElementById('rvPreviewHost').textContent = location.host;
    }

    /* ---------- بريد دعوة التقييم: تخصيص + معاينة حيّة + رسالة تجريبية ---------- */
    const RVE_TEXT = ['senderName', 'replyTo', 'subject', 'heading', 'body', 'button', 'buttonColor', 'footer'];
    const rveEl = (k) => document.getElementById('rve-' + k);
    function readReviewEmailForm() {
      const out = {};
      RVE_TEXT.forEach(k => { out[k] = rveEl(k).value.trim(); });
      out.showImage = rveEl('showImage').checked;
      out.showStars = rveEl('showStars').checked;
      return out;
    }
    function fillReviewEmail(data) {
      const e = data.email || {}, d = data.emailDefaults || {};
      // الحقول تُعرض بالنص المحفوظ أو الافتراضي، فيرى المسؤول ما سيُرسل فعلاً
      RVE_TEXT.forEach(k => { rveEl(k).value = e[k] || (k === 'replyTo' ? '' : d[k] || ''); });
      rveEl('buttonColor-picker').value = /^#[0-9a-f]{6}$/i.test(rveEl('buttonColor').value) ? rveEl('buttonColor').value : '#1E2A32';
      rveEl('showImage').checked = e.showImage !== false;
      rveEl('showStars').checked = e.showStars !== false;
      if (!rveEl('testTo').value) rveEl('testTo').value = data.userEmail || '';
      const status = document.getElementById('reviewEmailStatus');
      status.innerHTML = data.mailSource === 'dashboard'
        ? `✅ تُرسل الدعوات من بريد الشركة <span dir="ltr">${escapeHtml(data.senderAddress || '')}</span>.`
        : data.mailConfigured
          ? `تُرسل الدعوات حالياً من بريد الاستضافة <span dir="ltr">${escapeHtml(data.senderAddress || '')}</span>. لإرسالها من بريد الشركة اضبطه في بطاقة «بريد الشركة للإرسال».`
          : '⚠️ لم يُضبط بريد الشركة للإرسال بعد، فلن يعمل «إرسال عبر الإيميل» حتى تضبطه في بطاقة «بريد الشركة للإرسال» أعلاه.';
      reviewsState.senderAddress = data.senderAddress || '';
      refreshReviewEmailPreview();
    }
    let rvePreviewTimer = null, rvePreviewSeq = 0;
    function refreshReviewEmailPreview() {
      clearTimeout(rvePreviewTimer);
      rvePreviewTimer = setTimeout(async () => {
        const seq = ++rvePreviewSeq;
        const form = readReviewEmailForm();
        try {
          const out = await api('/api/reviews/email-preview', { method: 'POST', body: JSON.stringify(form) });
          if (seq !== rvePreviewSeq) return;
          rveEl('preview').srcdoc = out.html;
          rveEl('previewSubject').textContent = out.subject;
          const name = form.senderName || (reviewsState.data && reviewsState.data.accountName) || 'العمران الذهبية للمقاولات العامة';
          rveEl('previewFrom').textContent = name + (reviewsState.senderAddress ? ` <${reviewsState.senderAddress}>` : '');
        } catch (_) { /* المعاينة غير حرجة */ }
      }, 350);
    }
    function setupReviewEmail() {
      const msg = document.getElementById('reviewEmailMessage');
      document.querySelectorAll('#reviewEmailCard input, #reviewEmailCard textarea').forEach(inp => {
        if (inp.id === 'rve-testTo') return;
        inp.addEventListener(inp.type === 'checkbox' || inp.type === 'color' ? 'change' : 'input', refreshReviewEmailPreview);
      });
      rveEl('buttonColor-picker').addEventListener('input', () => { rveEl('buttonColor').value = rveEl('buttonColor-picker').value; refreshReviewEmailPreview(); });
      rveEl('buttonColor').addEventListener('input', () => { if (/^#[0-9a-f]{6}$/i.test(rveEl('buttonColor').value)) rveEl('buttonColor-picker').value = rveEl('buttonColor').value; });
      document.getElementById('saveReviewEmailBtn').addEventListener('click', async () => {
        const d = (reviewsState.data && reviewsState.data.emailDefaults) || {};
        const form = readReviewEmailForm();
        // ما يطابق النص الافتراضي لا يُحفظ، فيبقى الافتراضي محدّثاً مع التحديثات القادمة
        RVE_TEXT.forEach(k => { if (form[k] === d[k]) form[k] = ''; });
        try {
          await api('/api/reviews/email-settings', { method: 'PUT', body: JSON.stringify(form) });
          msg.textContent = 'تم حفظ بريد الدعوة. ستُرسل الدعوات القادمة بهذا الشكل.';
          const data = await api('/api/reviews'); reviewsState.data = data; fillReviewEmail(data);
        } catch (err) { msg.textContent = err.message; }
      });
      document.getElementById('resetReviewEmailBtn').addEventListener('click', () => {
        if (!confirm('استعادة النصوص والإعدادات الافتراضية في النموذج؟ (لن تُحفظ حتى تضغط «حفظ بريد الدعوة»)')) return;
        const d = (reviewsState.data && reviewsState.data.emailDefaults) || {};
        RVE_TEXT.forEach(k => { rveEl(k).value = d[k] || ''; });
        rveEl('buttonColor-picker').value = d.buttonColor || '#1E2A32';
        rveEl('showImage').checked = true; rveEl('showStars').checked = true;
        msg.textContent = 'تمت استعادة النص الافتراضي في النموذج. اضغط «حفظ بريد الدعوة» لاعتماده.';
        refreshReviewEmailPreview();
      });
      document.getElementById('testReviewEmailBtn').addEventListener('click', async (e) => {
        const btn = e.currentTarget; btn.disabled = true; msg.textContent = 'جارِ إرسال الرسالة التجريبية...';
        try {
          const out = await api('/api/reviews/email-test', { method: 'POST', body: JSON.stringify({ to: rveEl('testTo').value.trim(), email: readReviewEmailForm() }) });
          msg.textContent = `تم إرسال رسالة تجريبية إلى ${out.to}. تحقق من صندوق الوارد (والرسائل غير المرغوب فيها).`;
        } catch (err) { msg.textContent = err.message; } finally { btn.disabled = false; }
      });
    }

    /* ---------- بريد الشركة للإرسال (SMTP من لوحة التحكم) ---------- */
    const mailState = { providers: {}, account: null };
    const maEl = (k) => document.getElementById('ma-' + k);
    function applyProviderPreset(force) {
      const p = mailState.providers[maEl('provider').value] || {};
      const note = maEl('providerNote');
      note.hidden = !p.note; note.textContent = p.note ? 'ℹ️ ' + p.note : '';
      const custom = maEl('provider').value === 'custom';
      // خادم المزود الجاهز ثابت؛ يُعدَّل يدوياً فقط مع «خادم آخر»
      maEl('host').readOnly = !custom;
      if (custom) { maEl('advanced').open = true; return; }
      maEl('host').value = p.host || '';
      if (force) {
        maEl('port').value = p.port || 465;
        maEl('secure').value = p.secure ? '1' : '0';
      }
    }
    function renderMailStatus(source, a) {
      const box = document.getElementById('mailAccountStatus');
      const last = a && a.lastTest ? ` · آخر اختبار: ${a.lastTest.ok ? '✅ نجح' : '❌ فشل'} (${fmtDay(a.lastTest.at)})` : '';
      if (source === 'dashboard') { box.className = 'mail-status ok'; box.innerHTML = `✅ الرسائل تُرسل من بريد الشركة <b dir="ltr">${escapeHtml(a.fromEmail)}</b>${escapeHtml(last)}`; }
      else if (source === 'env') { box.className = 'mail-status warn'; box.textContent = 'الرسائل تُرسل حالياً من بريد إعدادات الاستضافة. اضبط بريد الشركة أدناه وفعّله ليُرسل منه بدلاً من ذلك.'; }
      else { box.className = 'mail-status warn'; box.textContent = '⚠️ لم يُضبط بريد للإرسال بعد. اكتب بريد الشركة وكلمة مروره أدناه، ثم اضغط «اختبار الاتصال والإرسال» وبعدها «حفظ».'; }
    }
    async function loadMailAccount() {
      try {
        const data = await api('/api/mail-account');
        mailState.providers = data.providers || {};
        const a = mailState.account = data.account || {};
        const sel = maEl('provider');
        sel.innerHTML = Object.entries(mailState.providers).map(([k, p]) => `<option value="${escapeAttr(k)}">${escapeHtml(p.label)}</option>`).join('');
        sel.value = a.provider || 'hostinger';
        maEl('fromEmail').value = a.fromEmail || '';
        maEl('fromName').value = a.fromName || '';
        maEl('user').value = a.user && a.user !== a.fromEmail ? a.user : '';
        maEl('pass').value = '';
        maEl('pass').placeholder = a.hasPassword ? '•••••••• محفوظة — اتركها فارغة للإبقاء عليها' : 'كلمة مرور البريد';
        maEl('enabled').checked = a.updatedAt ? a.enabled : true;
        if (a.host) { maEl('host').value = a.host; maEl('port').value = a.port; maEl('secure').value = a.secure ? '1' : '0'; applyProviderPreset(false); }
        else applyProviderPreset(true);
        if (!maEl('testTo').value) maEl('testTo').value = (reviewsState.data && reviewsState.data.userEmail) || currentUser.email || '';
        renderMailStatus(data.source, a);
      } catch (err) { document.getElementById('mailAccountMessage').textContent = err.message; }
    }
    function readMailForm() {
      return {
        provider: maEl('provider').value, fromEmail: maEl('fromEmail').value.trim(), fromName: maEl('fromName').value.trim(),
        pass: maEl('pass').value, host: maEl('host').value.trim(), port: parseInt(maEl('port').value, 10) || '',
        secure: maEl('secure').value === '1', user: maEl('user').value.trim(), enabled: maEl('enabled').checked,
      };
    }
    function setupMailAccount() {
      const msg = document.getElementById('mailAccountMessage');
      maEl('provider').addEventListener('change', () => applyProviderPreset(true));
      maEl('port').addEventListener('change', () => { const p = parseInt(maEl('port').value, 10); if (p === 465) maEl('secure').value = '1'; else if (p === 587) maEl('secure').value = '0'; });
      maEl('save').addEventListener('click', async () => {
        maEl('save').disabled = true;
        try {
          const out = await api('/api/mail-account', { method: 'PUT', body: JSON.stringify(readMailForm()) });
          msg.textContent = out.account.enabled ? 'تم حفظ بريد الشركة. ستُرسل الرسائل منه من الآن.' : 'تم الحفظ (الإرسال من بريد الشركة متوقف).';
          await loadMailAccount(); loadReviews();
        } catch (err) { msg.textContent = err.message; } finally { maEl('save').disabled = false; }
      });
      maEl('test').addEventListener('click', async () => {
        maEl('test').disabled = true; msg.textContent = 'جارِ الاتصال بخادم البريد وإرسال رسالة تجريبية...';
        try {
          const out = await api('/api/mail-account/test', { method: 'POST', body: JSON.stringify({ ...readMailForm(), to: maEl('testTo').value.trim() }) });
          msg.textContent = `✅ نجح الاتصال، وأُرسلت رسالة تجريبية إلى ${out.to}.` + (mailState.account && mailState.account.ready ? '' : ' اضغط «حفظ بريد الشركة» لاعتماده.');
          // تحديث سطر الحالة فقط، دون إعادة تعبئة النموذج (حتى لا تُمسح القيم غير المحفوظة)
          api('/api/mail-account').then(d => { mailState.account = d.account; renderMailStatus(d.source, d.account); }).catch(() => {});
        } catch (err) { msg.textContent = '❌ ' + err.message; } finally { maEl('test').disabled = false; }
      });
      loadMailAccount();
    }

    function setupReviews() {
      const tab = document.querySelector('.dash-tab[data-tab="reviews"]');
      if (!currentUser.isAdmin) { tab?.classList.add('hidden'); document.getElementById('tab-reviews')?.classList.add('hidden'); return; }
      tab?.addEventListener('click', () => loadReviews(true));
      document.getElementById('reviewsRefreshBtn').addEventListener('click', () => loadReviews(true));

      // إنشاء طلب التقييم ثم إرساله مباشرة بالطريقة المختارة (واتساب أو الإيميل)
      const inviteForm = document.getElementById('reviewInviteForm');
      inviteForm.addEventListener('submit', (e) => e.preventDefault());
      inviteForm.querySelectorAll('[data-send]').forEach(btn => btn.addEventListener('click', async () => {
        const via = btn.dataset.send;
        const msg = document.getElementById('reviewInviteMessage');
        const say = (t) => { msg.textContent = t; };
        const val = (id) => document.getElementById(id).value.trim();
        if (!val('ri-name')) { say('اكتب اسم العميل.'); document.getElementById('ri-name').focus(); return; }
        if (via === 'email') {
          if (!val('ri-email')) { say('اكتب بريد العميل الإلكتروني للإرسال عبر الإيميل.'); document.getElementById('ri-email').focus(); return; }
          if (reviewsState.data && !reviewsState.data.mailConfigured) { await sendInviteEmail({}, say); return; }
        }
        // نافذة واتساب تُفتح الآن (أثناء الضغط) حتى لا يحجبها المتصفح
        const win = via === 'whatsapp' && val('ri-phone') ? window.open('', '_blank') : null;
        btn.disabled = true;
        try {
          const out = await api('/api/reviews', { method: 'POST', body: JSON.stringify({ name: val('ri-name'), project: val('ri-project'), phone: val('ri-phone'), email: val('ri-email') }) });
          const r = out.review;
          inviteForm.reset();
          const result = document.getElementById('reviewInviteResult');
          result.innerHTML = '';
          const node = el(`<div class="rvd-created"><p class="rvd-created-title">رابط تقييم ${escapeHtml(r.name)}:</p>${reviewShareButtons(r)}<details><summary>معاينة رسالة واتساب</summary><pre class="rvd-msg">${escapeHtml(r.message)}</pre></details></div>`);
          bindReviewActions(node, r, msg);
          result.appendChild(node);
          if (via === 'whatsapp') sendInviteWhatsApp(r, say, win);
          else if (via === 'email') await sendInviteEmail(r, say);
          else say(`تم إنشاء رابط التقييم لـ ${r.name}.`);
          loadReviews(true);
        } catch (err) { if (win) win.close(); say(err.message); } finally { btn.disabled = false; }
      }));

      ['ris-title', 'ris-description'].forEach(id => document.getElementById(id).addEventListener('input', updateReviewPreview));
      setupReviewEmail();
      setupMailAccount();
      bindImageUpload({ input: 'reviewImageFile', button: 'reviewImageUploadBtn', preset: 'share', endpoint: '/api/reviews/settings/image', msgBox: 'reviewInviteSettingsMessage', done: 'تم رفع صورة رابط التقييم.', after: () => loadReviews() });
      document.getElementById('reviewImageResetBtn').addEventListener('click', async () => {
        const box = document.getElementById('reviewInviteSettingsMessage');
        if (!reviewsState.image) { box.textContent = 'الصورة الافتراضية مستخدمة حالياً.'; return; }
        if (!confirm('حذف الصورة المرفوعة والعودة إلى الصورة الافتراضية؟')) return;
        try { await api('/api/reviews/settings/image', { method: 'DELETE' }); box.textContent = 'تمت استعادة الصورة الافتراضية.'; loadReviews(); }
        catch (err) { box.textContent = err.message; }
      });
      document.getElementById('saveReviewInviteBtn').addEventListener('click', async () => {
        const box = document.getElementById('reviewInviteSettingsMessage');
        const d = (reviewsState.data && reviewsState.data.defaults) || {};
        const val = (id) => document.getElementById(id).value.trim();
        const message = val('ris-message');
        if (message && !message.includes('{الرابط}')) { box.textContent = 'أضف {الرابط} في نص الرسالة ليصل الرابط للعميل.'; return; }
        // القيم المطابقة للنص الافتراضي لا تُحفظ، فيبقى الافتراضي محدّثاً مع التحديثات القادمة
        const same = (v, def) => (v === def ? '' : v);
        try {
          await api('/api/reviews/settings', { method: 'PUT', body: JSON.stringify({ title: same(val('ris-title'), d.title), description: same(val('ris-description'), d.description), message: same(message, d.message) }) });
          box.textContent = 'تم حفظ رسالة الدعوة.'; loadReviews();
        } catch (err) { box.textContent = err.message; }
      });
      loadReviews();
    }

    /* ---------- صفحة "من نحن": الشهادات والتراخيص، شهادات التكريم، الشركاء ---------- */
    const SHOWCASE = {
      licenses: { titleAr: 'عنوان الشهادة أو الترخيص', titleEn: 'Certificate / license title', descAr: 'الجهة المانحة، رقم الترخيص، تاريخ الانتهاء...', descEn: 'Issuer, license number, expiry...', linkPh: 'رابط التحقق (اختياري): https://...', preset: 'document', hint: 'صورة أو مسح للشهادة بوضوح: أفقية 1600 × 1200 أو طولية 1200 × 1600 بكسل (JPG/PNG). يمكنك اختيار عدة صور (مثل صفحات الترخيص) ثم تحديد الصورة الرئيسية بـ ⭐', imgLabel: 'صور الشهادة أو الترخيص', hasDesc: true, multi: true },
      awards: { titleAr: 'العنوان (مثال: خطاب شكر وتقدير)', titleEn: 'Title', descAr: 'الجهة المكرِّمة والسنة، أو اسم العميل لخطاب الشكر', descEn: 'Awarding body & year, or client name', linkPh: 'رابط (اختياري): https://...', preset: 'document', hint: 'صورة أو مسح للشهادة أو الخطاب: أفقية 1600 × 1200 أو طولية 1200 × 1600 بكسل. يمكنك اختيار عدة صور ثم تحديد الرئيسية بـ ⭐', imgLabel: 'صور الشهادة أو الخطاب', hasDesc: true, typed: true, multi: true },
      partners: { titleAr: 'اسم الشريك', titleEn: 'Partner name', linkPh: 'رابط موقع الشريك (اختياري): https://...', preset: 'logo', hint: 'شعار PNG بخلفية شفافة، يُفضّل أفقي 400 × 200 بكسل', imgLabel: 'شعار الشريك', hasDesc: false },
    };
    const showcaseCard = (kind) => document.querySelector(`.showcase-card[data-showcase="${kind}"]`);
    function readShowcase(kind) {
      return [...showcaseCard(kind).querySelectorAll('.showcase-item')].map(c => ({
        id: c.dataset.id, image: c.dataset.image || '',
        title: { ar: c.querySelector('.sc-title-ar').value.trim(), en: c.querySelector('.sc-title-en').value.trim() },
        description: SHOWCASE[kind].hasDesc ? { ar: c.querySelector('.sc-desc-ar').value.trim(), en: c.querySelector('.sc-desc-en').value.trim() } : { ar: '', en: '' },
        ...(SHOWCASE[kind].typed ? { type: c.querySelector('.sc-type').value, project: { ar: c.querySelector('.sc-project-ar').value.trim(), en: c.querySelector('.sc-project-en').value.trim() } } : {}),
        link: c.querySelector('.sc-link').value.trim(),
        visible: c.querySelector('.sc-visible').checked,
        _file: SHOWCASE[kind].multi ? null : (c.querySelector('.sc-file').files[0] || null),
        // عدة صور: المرفوعة سابقاً بترتيبها (الأولى رئيسية)، والجديدة بانتظار الحفظ
        ...(SHOWCASE[kind].multi ? { images: JSON.parse(c.dataset.images || '[]'), _files: showcasePending.get(c.dataset.id) || [] } : {}),
      }));
    }
    const showcasePending = new Map(); // معرّف العنصر -> صور جديدة لم تُرفع بعد
    const SHOWCASE_MAX = 12;
    // شبكة صور العنصر: ⭐ لتحديد الرئيسية، ✕ للحذف
    function renderShowcaseThumbs(card, kind) {
      const box = card.querySelector('.sc-thumbs');
      const images = JSON.parse(card.dataset.images || '[]');
      const pending = showcasePending.get(card.dataset.id) || [];
      if (!images.length && !pending.length) { box.innerHTML = '<p class="muted sc-thumbs-empty">لا توجد صور بعد</p>'; return; }
      const urls = pending.map(f => f._url || (f._url = URL.createObjectURL(f)));
      box.innerHTML = images.map((u, j) => `
          <div class="sc-thumb${j === 0 ? ' is-main' : ''}" data-i="${j}">
            <img src="${escapeAttr(u)}" alt="">
            ${j === 0 ? '<span class="sc-main-badge">⭐ الرئيسية</span>' : '<button type="button" class="sc-make-main" title="جعلها الصورة الرئيسية">⭐</button>'}
            <button type="button" class="sc-del" title="حذف الصورة">✕</button>
          </div>`).join('') + pending.map((f, j) => `
          <div class="sc-thumb is-pending${!images.length && j === 0 ? ' is-main' : ''}" data-p="${j}">
            <img src="${escapeAttr(urls[j])}" alt="">
            ${!images.length && j === 0 ? '<span class="sc-main-badge">⭐ الرئيسية</span>' : (!images.length ? '<button type="button" class="sc-make-main" title="جعلها الصورة الرئيسية">⭐</button>' : '')}
            <span class="sc-new-badge">جديدة</span>
            <button type="button" class="sc-del" title="إزالة">✕</button>
          </div>`).join('');
      box.querySelectorAll('.sc-thumb').forEach(t => {
        const i = t.dataset.i !== undefined ? +t.dataset.i : null, p = t.dataset.p !== undefined ? +t.dataset.p : null;
        t.querySelector('.sc-make-main')?.addEventListener('click', () => {
          if (i !== null) { const [x] = images.splice(i, 1); images.unshift(x); card.dataset.images = JSON.stringify(images); }
          else { const [x] = pending.splice(p, 1); pending.unshift(x); }
          renderShowcaseThumbs(card, kind);
          showcaseCard(kind).querySelector('.showcase-msg').textContent = 'اضغط زر الحفظ لاعتماد الصورة الرئيسية.';
        });
        t.querySelector('.sc-del').addEventListener('click', () => {
          if (i !== null) { if (!confirm('حذف هذه الصورة؟ تُحذف نهائياً بعد الحفظ.')) return; images.splice(i, 1); card.dataset.images = JSON.stringify(images); }
          else pending.splice(p, 1);
          renderShowcaseThumbs(card, kind);
        });
      });
    }
    function renderShowcase(kind, list) {
      const cfg = SHOWCASE[kind], box = showcaseCard(kind).querySelector('.showcase-editor');
      box.innerHTML = list.length ? '' : '<p class="muted">لا توجد عناصر بعد.</p>';
      list.forEach((it, i) => {
        const card = el(`
          <div class="banner-edit-card testimonial-edit showcase-item" data-id="${escapeAttr(it.id || ('sc_' + Date.now() + '_' + i))}" data-image="${escapeAttr(it.image || '')}" data-images="${escapeAttr(JSON.stringify(it.images || [it.image, ...(it.gallery || [])].filter(Boolean)))}">
            <div class="ts-head">
              <strong>${i + 1}</strong>
              <span class="ts-tools">
                <button type="button" class="btn btn-outline btn-sm sc-up" ${i === 0 ? 'disabled' : ''}>▲</button>
                <button type="button" class="btn btn-outline btn-sm sc-down" ${i === list.length - 1 ? 'disabled' : ''}>▼</button>
              </span>
            </div>
            ${cfg.multi ? `<div class="sc-thumbs"></div>` : `<div class="identity-preview showcase-preview">${it.image ? `<img src="${escapeAttr(it.image)}" alt="">` : 'لا توجد صورة'}</div>`}
            <label class="sc-img-label">${cfg.imgLabel}</label>
            <input type="file" class="sc-file" accept="image/png,image/jpeg,image/webp${kind === 'partners' ? ',image/svg+xml' : ''}"${cfg.multi ? ' multiple' : ''}>
            <p class="size-hint">📐 ${cfg.hint}</p>
            <div class="bi-row"><span class="bi-badge">AR</span><input type="text" class="sc-title-ar" placeholder="${cfg.titleAr}" value="${escapeAttr(biAr(it.title))}"></div>
            <div class="bi-row"><span class="bi-badge en">EN</span><input type="text" dir="ltr" class="sc-title-en" placeholder="${cfg.titleEn}" value="${escapeAttr(biEn(it.title))}"></div>
            ${cfg.hasDesc ? `
            <div class="bi-row"><span class="bi-badge">AR</span><input type="text" class="sc-desc-ar" placeholder="${cfg.descAr}" value="${escapeAttr(biAr(it.description))}"></div>
            <div class="bi-row"><span class="bi-badge en">EN</span><input type="text" dir="ltr" class="sc-desc-en" placeholder="${cfg.descEn}" value="${escapeAttr(biEn(it.description))}"></div>` : ''}
            ${cfg.typed ? `
            <label class="sc-img-label">النوع</label>
            <select class="sc-type">
              <option value="award"${it.type !== 'thanks' ? ' selected' : ''}>🏆 تكريم وجوائز (من جهة رسمية أو مسابقة)</option>
              <option value="thanks"${it.type === 'thanks' ? ' selected' : ''}>🤝 شكر وتقدير من عميل</option>
            </select>
            <div class="sc-project-fields">
              <div class="bi-row"><span class="bi-badge">AR</span><input type="text" class="sc-project-ar" placeholder="المشروع (مثال: فيلا سكنية – جدة)" value="${escapeAttr(biAr(it.project))}"></div>
              <div class="bi-row"><span class="bi-badge en">EN</span><input type="text" dir="ltr" class="sc-project-en" placeholder="Project (e.g. Villa – Jeddah)" value="${escapeAttr(biEn(it.project))}"></div>
            </div>` : ''}
            <input type="text" dir="ltr" class="sc-link" maxlength="600" placeholder="${cfg.linkPh}" value="${escapeAttr(it.link || '')}">
            <div class="ts-foot">
              <label class="perm-check"><input type="checkbox" class="sc-visible"${it.visible === false ? '' : ' checked'}> ظاهر</label>
              <button type="button" class="btn btn-danger btn-sm sc-remove">حذف</button>
            </div>
          </div>`);
        // حقول المشروع تظهر فقط لخطابات الشكر من العملاء
        const typeSel = card.querySelector('.sc-type');
        if (typeSel) { const sync = () => { card.querySelector('.sc-project-fields').hidden = typeSel.value !== 'thanks'; }; typeSel.addEventListener('change', sync); sync(); }
        const fileInput = card.querySelector('.sc-file');
        if (cfg.multi) {
          if (it._files && it._files.length) showcasePending.set(card.dataset.id, it._files);
          renderShowcaseThumbs(card, kind);
          fileInput.addEventListener('change', () => {
            const pending = showcasePending.get(card.dataset.id) || [];
            const room = SHOWCASE_MAX - JSON.parse(card.dataset.images || '[]').length - pending.length;
            const picked = [...fileInput.files];
            pending.push(...picked.slice(0, Math.max(0, room)));
            showcasePending.set(card.dataset.id, pending);
            fileInput.value = '';
            renderShowcaseThumbs(card, kind);
            const msg = showcaseCard(kind).querySelector('.showcase-msg');
            msg.textContent = picked.length > room ? `الحد الأقصى ${SHOWCASE_MAX} صورة لكل عنصر؛ أُضيف ${Math.max(0, room)} فقط.` : 'اضغط زر الحفظ لرفع الصور.';
          });
        } else fileInput.addEventListener('change', () => {
          const f = fileInput.files[0]; if (!f) return;
          card.querySelector('.showcase-preview').innerHTML = `<img src="${URL.createObjectURL(f)}" alt="">`;
        });
        const move = (to) => { const cur = readShowcase(kind); const [x] = cur.splice(i, 1); cur.splice(to, 0, x); renderShowcase(kind, cur); };
        card.querySelector('.sc-up').addEventListener('click', () => move(i - 1));
        card.querySelector('.sc-down').addEventListener('click', () => move(i + 1));
        card.querySelector('.sc-remove').addEventListener('click', () => {
          if (!confirm('حذف هذا العنصر؟ ستُحذف صوره نهائياً بعد الحفظ.')) return;
          showcasePending.delete(card.dataset.id);
          const cur = readShowcase(kind); cur.splice(i, 1); renderShowcase(kind, cur);
          showcaseCard(kind).querySelector('.showcase-msg').textContent = 'اضغط زر الحفظ لتأكيد الحذف.';
        });
        // ملف مختار قبل إعادة الرسم (عند الترتيب) يبقى بانتظار الحفظ
        if (it._file) { const dt = new DataTransfer(); dt.items.add(it._file); fileInput.files = dt.files; card.querySelector('.showcase-preview').innerHTML = `<img src="${URL.createObjectURL(it._file)}" alt="">`; }
        box.appendChild(card);
      });
    }
    function setupShowcases() {
      Object.keys(SHOWCASE).forEach(kind => {
        const root = showcaseCard(kind); if (!root) return;
        root.querySelector('.showcase-add').addEventListener('click', () => {
          const cur = readShowcase(kind);
          cur.push({ id: 'sc_' + Date.now(), title: { ar: '', en: '' }, description: { ar: '', en: '' }, link: '', visible: true });
          renderShowcase(kind, cur);
          root.querySelector('.showcase-item:last-child .sc-title-ar')?.focus();
        });
        root.querySelector('.showcase-save').addEventListener('click', async (e) => {
          const btn = e.currentTarget, msg = root.querySelector('.showcase-msg');
          const list = readShowcase(kind);
          const missing = list.filter(it => !(it.title.ar || it.title.en)).length;
          btn.disabled = true; msg.textContent = 'جارِ الحفظ...';
          try {
            await api(`/api/settings/showcase/${kind}`, { method: 'PUT', body: JSON.stringify({ items: list.map(({ _file, _files, image, ...rest }) => rest) }) });
            // عدة صور: رفع الصور الجديدة لكل عنصر دفعة واحدة (بعد ضغطها)
            let batch = 0;
            for (const it of list.filter(x => x._files && x._files.length && (x.title.ar || x.title.en))) {
              msg.textContent = `جارِ رفع الصور (${++batch})...`;
              const fd = new FormData();
              for (const f of it._files) { const img = await compressImage(f, SHOWCASE[kind].preset); fd.append('images[]', img, img.name); }
              await api(`/api/settings/showcase/${kind}/${encodeURIComponent(it.id)}/images`, { method: 'POST', body: fd });
              showcasePending.delete(it.id);
            }
            // رفع الصور المختارة لكل عنصر بعد حفظ بياناته
            let uploaded = 0;
            for (const it of list.filter(x => x._file && (x.title.ar || x.title.en))) {
              msg.textContent = `جارِ رفع الصور (${++uploaded})...`;
              const img = await compressImage(it._file, SHOWCASE[kind].preset);
              const fd = new FormData(); fd.append('image', img, img.name);
              await api(`/api/settings/showcase/${kind}/${encodeURIComponent(it.id)}/image`, { method: 'PUT', body: fd });
            }
            const fresh = await api('/api/settings');
            renderShowcase(kind, fresh[kind] || []);
            msg.textContent = 'تم الحفظ.' + (missing ? ` (تجاهلنا ${missing} بدون عنوان)` : '');
          } catch (err) { msg.textContent = err.message; }
          finally { btn.disabled = false; }
        });
      });
    }

    function setupServicesAdd() {
      document.getElementById('addServiceBtn').addEventListener('click', () => {
        servicesCache.push({ title: '', description: '' });
        renderServicesEditor(servicesCache);
      });
    }

    let teamCache = [];

    function renderTeamEditor(team) {
      teamCache = team.slice();
      const container = document.getElementById('teamEditor');
      container.innerHTML = '';
      teamCache.forEach((member, i) => {
        const card = el(`
          <div class="banner-edit-card" data-index="${i}">
            <div class="bi-row"><span class="bi-badge">AR</span><input type="text" class="team-name-ar" placeholder="الاسم" value="${escapeAttr(biAr(member.name))}"></div>
            <div class="bi-row"><span class="bi-badge en">EN</span><input type="text" class="team-name-en" placeholder="Name" value="${escapeAttr(biEn(member.name))}"></div>
            <div class="bi-row"><span class="bi-badge">AR</span><input type="text" class="team-role-ar" placeholder="المسمى الوظيفي" value="${escapeAttr(biAr(member.role))}"></div>
            <div class="bi-row"><span class="bi-badge en">EN</span><input type="text" class="team-role-en" placeholder="Job title" value="${escapeAttr(biEn(member.role))}"></div>
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn btn-dark btn-sm team-save" style="flex:1;">حفظ</button>
              <button type="button" class="btn btn-danger btn-sm team-remove">حذف</button>
            </div>
          </div>
        `);
        card.querySelector('.team-save').addEventListener('click', () => {
          teamCache[i] = {
            name: { ar: card.querySelector('.team-name-ar').value.trim(), en: card.querySelector('.team-name-en').value.trim() },
            role: { ar: card.querySelector('.team-role-ar').value.trim(), en: card.querySelector('.team-role-en').value.trim() },
          };
          saveTeam();
        });
        card.querySelector('.team-remove').addEventListener('click', () => {
          teamCache.splice(i, 1);
          saveTeam();
        });
        container.appendChild(card);
      });
    }

    async function saveTeam() {
      const msgBox = document.getElementById('teamMessage');
      try {
        await api('/api/settings/team', { method: 'PUT', body: JSON.stringify({ team: teamCache }) });
        msgBox.textContent = 'تم حفظ فريق العمل بنجاح.';
        loadIdentity();
      } catch (err) { msgBox.textContent = err.message; }
    }

    function setupTeamAdd() {
      document.getElementById('addTeamMemberBtn').addEventListener('click', () => {
        teamCache.push({ name: '', role: '' });
        renderTeamEditor(teamCache);
      });
    }

    function setupStatsForm() {
      document.getElementById('statsForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const msgBox = document.getElementById('statsMessage');
        const stats = {
          yearsExperience: document.getElementById('stat-years').value.trim(),
          projectsDone: document.getElementById('stat-projects').value.trim(),
          citiesServed: document.getElementById('stat-cities').value.trim(),
          clientSatisfaction: document.getElementById('stat-satisfaction').value.trim(),
        };
        try {
          await api('/api/settings/stats', { method: 'PUT', body: JSON.stringify({ stats }) });
          msgBox.textContent = 'تم حفظ الإحصاءات بنجاح.';
        } catch (err) { msgBox.textContent = err.message; }
      });
    }

    function setupWelcomeForm() {
      document.getElementById('welcomeForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const msgBox = document.getElementById('welcomeMessage2');
        const payload = {
          enabled: document.getElementById('welcomeEnabled').checked,
          title: { ar: document.getElementById('welcomeTitle-ar').value.trim(), en: document.getElementById('welcomeTitle-en').value.trim() },
          message: { ar: document.getElementById('welcomeMessageText-ar').value.trim(), en: document.getElementById('welcomeMessageText-en').value.trim() },
          buttonText: { ar: document.getElementById('welcomeButtonText-ar').value.trim(), en: document.getElementById('welcomeButtonText-en').value.trim() },
          durationSeconds: parseInt(document.getElementById('welcomeDuration').value, 10) || 6,
        };
        try {
          await api('/api/settings/welcome', { method: 'PUT', body: JSON.stringify(payload) });
          msgBox.textContent = 'تم حفظ رسالة الترحيب بنجاح.';
        } catch (err) { msgBox.textContent = err.message; }
      });
    }

    /* =========================================================
       تبويب "أقسام الرئيسية": بطاقة واحدة قابلة للفتح لكل قسم
       من الأقسام الستة، كلها مبنية بنفس دالة القالب الواحدة —
       تفادياً لتكرار نفس كود الألوان والحقول 6 مرات.
       ========================================================= */
    const PAGE_SECTIONS_CONFIG = {
      home: [
        { key: 'banners', label: 'البنرات المتحركة (أعلى الصفحة)', hasText: false, hasImage: false, note: 'صور ونصوص البانرات الثلاثة تُدار من تبويب "الهوية والمظهر" ← البانرات الثلاثة.' },
        { key: 'hero', label: 'الهيرو (أعلى الصفحة الرئيسية)', hasText: false, hasImage: true, imageLabel: 'صورة الهيرو', contentType: 'hero' },
        { key: 'about', label: 'قسم "عن الشركة" المختصر', hasText: true, hasImage: true, imageLabel: 'صورة القسم' },
        { key: 'services', label: 'قسم الخدمات', hasText: true, hasImage: false },
        { key: 'stats', label: 'شريط الإحصائيات', hasText: false, hasImage: false, note: 'الأرقام نفسها (سنوات الخبرة، المشاريع، رضا العملاء، المناطق) تُدار من تبويب "الهوية والمظهر" ← الإحصائيات.' },
        { key: 'process', label: 'قسم "منهجيتنا" المختصر', hasText: true, hasImage: false, note: 'الصفحة الكاملة للمنهجية: /methodology' },
        { key: 'projects', label: 'قسم الأعمال المميزة', hasText: 'titleOnly', hasImage: false },
        { key: 'whyUs', label: 'قسم "لماذا العمران؟"', hasText: true, hasImage: false },
        { key: 'testimonials', label: 'قسم "ماذا يقول عنا عملاؤنا" (آراء العملاء)', hasText: true, hasImage: false, note: 'الآراء نفسها (الاسم، النص، التقييم) تُدار من تبويب "الهوية والمظهر" ← آراء العملاء. يظهر القسم عند وجود رأي واحد ظاهر على الأقل.' },
        { key: 'cta', label: 'شريط الدعوة للتواصل', hasText: true, hasImage: false },
        { key: 'contact', label: 'قسم التواصل', hasText: true, hasImage: false },
      ],
      about: [
        { key: 'pageHero', label: 'رأس الصفحة (العنوان الرئيسي)', hasText: true, hasImage: false },
        { key: 'story', label: 'قصة الشركة', hasText: 'titleOnly', hasImage: true, imageLabel: 'صورة القصة', contentType: 'story' },
        { key: 'missionVision', label: 'الرسالة والرؤية', hasText: 'titleOnly', hasImage: false, contentType: 'missionVision' },
        { key: 'values', label: 'القيم', hasText: true, hasImage: false, contentType: 'valuesList' },
        { key: 'expertise', label: 'منظومة العمل المتكاملة', hasText: true, hasImage: false },
        { key: 'timeline', label: 'المسيرة الزمنية', hasText: 'titleOnly', hasImage: false, contentType: 'timelineList' },
        { key: 'team', label: 'فريق العمل', hasText: true, hasImage: false, note: 'أعضاء الفريق يُدارون من تبويب "الهوية والمظهر".' },
        { key: 'certifications', label: 'الاعتمادات والشهادات', hasText: 'titleOnly', hasImage: false, contentType: 'certsList' },
        { key: 'licenses', label: 'الشهادات والتراخيص (بالصور)', hasText: true, hasImage: false, note: 'العناصر نفسها (الصور والعناوين والروابط) تُدار من تبويب "الهوية والمظهر" ← الشهادات والتراخيص. يظهر القسم عند وجود عنصر ظاهر واحد على الأقل.' },
        { key: 'awards', label: 'التكريم والشكر والتقدير', hasText: true, hasImage: false, note: 'الشهادات وخطابات الشكر نفسها تُدار من تبويب "الهوية والمظهر" ← التكريم والشكر والتقدير.' },
        { key: 'partners', label: 'شركاؤنا', hasText: true, hasImage: false, note: 'الشركاء (الاسم والشعار والرابط) يُدارون من تبويب "الهوية والمظهر" ← شركاؤنا.' },
        { key: 'cta', label: 'شريط الدعوة للتواصل', hasText: true, hasImage: false },
      ],
      projects: [
        { key: 'pageHero', label: 'رأس الصفحة (العنوان الرئيسي)', hasText: true, hasImage: false },
        { key: 'grid', label: 'شبكة المشاريع والتصفية', hasText: 'titleOnly', hasImage: false },
        { key: 'cta', label: 'شريط الدعوة للتواصل', hasText: true, hasImage: false },
      ],
      methodology: [
        { key: 'pageHero', label: 'رأس الصفحة (العنوان الرئيسي)', hasText: false, hasImage: false },
        { key: 'phases', label: 'مراحل العمل', hasText: false, hasImage: false },
        { key: 'quality', label: 'الجودة والسلامة', hasText: false, hasImage: false },
        { key: 'faq', label: 'الأسئلة الشائعة', hasText: false, hasImage: false },
        { key: 'cta', label: 'شريط الدعوة للتواصل', hasText: false, hasImage: false },
      ],
      privacy: [
        { key: 'pageHero', label: 'رأس الصفحة (العنوان الرئيسي)', hasText: false, hasImage: false },
        { key: 'content', label: 'نص سياسة الخصوصية', hasText: false, hasImage: false },
      ],
    };
    let currentSectionsPage = 'home';

    function sectionCardTemplate(cfg) {
      const textFieldsHtml = cfg.hasText === true ? `
        <div class="bi-field">
          <label>العنوان</label>
          <div class="bi-row"><span class="bi-badge">AR</span><input type="text" class="sec-title-ar"></div>
          <div class="bi-row"><span class="bi-badge en">EN</span><input type="text" class="sec-title-en"></div>
        </div>
        <div class="bi-field">
          <label>المحتوى</label>
          <div class="bi-row"><span class="bi-badge">AR</span><textarea class="sec-content-ar" rows="2"></textarea></div>
          <div class="bi-row"><span class="bi-badge en">EN</span><textarea class="sec-content-en" rows="2"></textarea></div>
        </div>
      ` : cfg.hasText === 'titleOnly' ? `
        <div class="bi-field">
          <label>العنوان</label>
          <div class="bi-row"><span class="bi-badge">AR</span><input type="text" class="sec-title-ar"></div>
          <div class="bi-row"><span class="bi-badge en">EN</span><input type="text" class="sec-title-en"></div>
        </div>
      ` : '';

      const noteHtml = cfg.note ? `<p class="form-note">${cfg.note}</p>` : '';

      // محتوى غني مضمّن داخل بطاقة القسم نفسها (بدل تبويب "محتوى الصفحات" المُلغى)
      let richContentHtml = '';
      if (cfg.contentType === 'hero') {
        richContentHtml = `
          <div class="bi-field">
            <label>عنوان الهيرو</label>
            <div class="bi-row"><span class="bi-badge">AR</span><textarea class="sec-hero-title-ar" rows="2" placeholder="نبني بثقة..&#10;من الفكرة إلى التسليم"></textarea></div>
            <div class="bi-row"><span class="bi-badge en">EN</span><textarea class="sec-hero-title-en" rows="2"></textarea></div>
            <p class="form-note" style="margin-top:4px;">استخدم سطراً جديداً للتحكم بمكان فاصل الأسطر، تماماً كما يظهر بالموقع.</p>
          </div>
          <div class="bi-field">
            <label>النبذة (الفقرة أسفل العنوان)</label>
            <div class="bi-row"><span class="bi-badge">AR</span><textarea class="sec-hero-subtitle-ar" rows="3"></textarea></div>
            <div class="bi-row"><span class="bi-badge en">EN</span><textarea class="sec-hero-subtitle-en" rows="3"></textarea></div>
          </div>
        `;
      } else if (cfg.contentType === 'story') {
        richContentHtml = `
          <div class="bi-field">
            <label>الفقرة الأولى</label>
            <div class="bi-row"><span class="bi-badge">AR</span><textarea class="sec-story-p1-ar" rows="3"></textarea></div>
            <div class="bi-row"><span class="bi-badge en">EN</span><textarea class="sec-story-p1-en" rows="3"></textarea></div>
          </div>
          <div class="bi-field">
            <label>الفقرة الثانية</label>
            <div class="bi-row"><span class="bi-badge">AR</span><textarea class="sec-story-p2-ar" rows="3"></textarea></div>
            <div class="bi-row"><span class="bi-badge en">EN</span><textarea class="sec-story-p2-en" rows="3"></textarea></div>
          </div>
          <div class="bi-field">
            <label>الفقرة الثالثة</label>
            <div class="bi-row"><span class="bi-badge">AR</span><textarea class="sec-story-p3-ar" rows="3"></textarea></div>
            <div class="bi-row"><span class="bi-badge en">EN</span><textarea class="sec-story-p3-en" rows="3"></textarea></div>
          </div>
        `;
      } else if (cfg.contentType === 'missionVision') {
        richContentHtml = `
          <div class="bi-field">
            <label>رسالتنا</label>
            <div class="bi-row"><span class="bi-badge">AR</span><textarea class="sec-mission-ar" rows="2"></textarea></div>
            <div class="bi-row"><span class="bi-badge en">EN</span><textarea class="sec-mission-en" rows="2"></textarea></div>
          </div>
          <div class="bi-field">
            <label>رؤيتنا</label>
            <div class="bi-row"><span class="bi-badge">AR</span><textarea class="sec-vision-ar" rows="2"></textarea></div>
            <div class="bi-row"><span class="bi-badge en">EN</span><textarea class="sec-vision-en" rows="2"></textarea></div>
          </div>
        `;
      } else if (cfg.contentType === 'valuesList') {
        richContentHtml = `
          <label style="display:block; margin:8px 0 6px; font-weight:600; font-size:13px;">القيم الأربع</label>
          <div id="embeddedValuesEditor" class="banners-editor"><p class="muted">جارِ التحميل...</p></div>
        `;
      } else if (cfg.contentType === 'timelineList') {
        richContentHtml = `
          <label style="display:block; margin:8px 0 6px; font-weight:600; font-size:13px;">محطات المسيرة</label>
          <div id="embeddedTimelineEditor" class="banners-editor"><p class="muted">جارِ التحميل...</p></div>
          <button type="button" id="addTimelineBtn" class="btn btn-outline btn-sm" style="margin-top:10px;">+ إضافة محطة جديدة</button>
          <p id="timelineMessage" class="form-note"></p>
        `;
      } else if (cfg.contentType === 'certsList') {
        richContentHtml = `
          <label style="display:block; margin:8px 0 6px; font-weight:600; font-size:13px;">الاعتمادات والشهادات</label>
          <div id="embeddedCertsEditor" class="banners-editor"><p class="muted">جارِ التحميل...</p></div>
          <button type="button" id="addCertBtn" class="btn btn-outline btn-sm" style="margin-top:10px;">+ إضافة اعتماد جديد</button>
          <p id="certsMessage" class="form-note"></p>
        `;
      }

      const imageHtml = cfg.hasImage ? `
        <label style="display:block; margin:14px 0 6px; font-weight:600; font-size:13px;">${cfg.imageLabel}</label>
        <div class="sec-mode-toggle sec-image-mode-toggle">
          <button type="button" data-mode="upload">رفع صورة</button>
          <button type="button" data-mode="url">رابط صورة</button>
        </div>
        <div class="sec-image-upload-panel">
          <input type="file" class="sec-image-file" accept="image/png,image/jpeg,image/webp">
          <p class="size-hint">📐 ${['hero', 'about'].includes(cfg.key) ? 'المقاس المقترح: مربع 1200 × 1200 بكسل — تظهر الصورة كاملة بدون قص على الجوال' : 'المقاس المقترح: 1400 × 1000 بكسل'}</p>
        </div>
        <div class="sec-image-url-panel" style="display:none;">
          <input type="text" class="sec-image-url" placeholder="https://example.com/image.jpg">
        </div>
      ` : '';

      return `
        <details class="section-editor-card" data-key="${cfg.key}">
          <summary>
            <span class="sec-drag-handle" draggable="true" title="اسحب لإعادة الترتيب">⋮⋮</span>
            <span class="sec-move-btns"><button type="button" class="sec-move" data-dir="-1" title="تحريك للأعلى" aria-label="تحريك للأعلى">▲</button><button type="button" class="sec-move" data-dir="1" title="تحريك للأسفل" aria-label="تحريك للأسفل">▼</button></span>
            <label class="sec-visible-toggle">
              <input type="checkbox" class="sec-visible-cb" checked> ظاهر
            </label>
            <span class="sec-card-label">${cfg.label}</span>
            <span class="sec-card-preview" data-key="${cfg.key}"></span>
          </summary>
          <div class="section-editor-body">
            ${textFieldsHtml}
            ${richContentHtml}
            ${noteHtml}

            <label style="display:block; margin:14px 0 6px; font-weight:600; font-size:13px;">خلفية القسم</label>
            <div class="sec-mode-toggle sec-bg-mode-toggle">
              <button type="button" data-mode="color">لون خلفية</button>
              <button type="button" data-mode="image">صورة خلفية</button>
            </div>
            <div class="sec-bg-color-panel">
              <div class="color-input-row">
                <input type="color" class="sec-bg-color-picker" value="#ffffff">
                <input type="text" class="sec-bg-color" placeholder="اتركه فارغاً لاستخدام لون التصميم الافتراضي">
              </div>
            </div>
            <div class="sec-bg-image-panel" style="display:none;">
              <input type="file" class="sec-bg-image-file" accept="image/png,image/jpeg,image/webp">
              <p class="size-hint">📐 المقاس المقترح للخلفية: 1920 × 1080 بكسل</p>
            </div>

            <div class="form-grid" style="margin-top:12px;">
              <div class="form-field">
                <label>لون البطاقات/العناصر داخل القسم</label>
                <div class="color-input-row">
                  <input type="color" class="sec-box-color-picker" value="#ffffff">
                  <input type="text" class="sec-box-color" placeholder="اختياري">
                </div>
              </div>
              <div class="form-field">
                <label>لون النص داخل القسم</label>
                <div class="color-input-row">
                  <input type="color" class="sec-text-color-picker" value="#1a1a1a">
                  <input type="text" class="sec-text-color" placeholder="اختياري">
                </div>
              </div>
            </div>

            ${imageHtml}

            <label class="perm-check" style="margin-top:14px;">
              <input type="checkbox" class="sec-hover-effect"> تفعيل تأثير تفاعلي (رفعة وظل) عند تمرير الماوس فوق عناصر القسم
            </label>

            <button type="button" class="btn btn-sand sec-save" style="margin-top:14px;">حفظ إعدادات هذا القسم</button>
            <p class="form-note sec-save-msg"></p>
          </div>
        </details>
      `;
    }

    async function loadSectionsEditor(page) {
      currentSectionsPage = page || currentSectionsPage;
      const container = document.getElementById('sectionsEditor');
      container.innerHTML = '<p class="muted">جارِ التحميل...</p>';

      let sections = {};
      let content = {};
      let banners = [];
      try {
        const settings = await api('/api/settings');
        sections = (settings.pageSections && settings.pageSections[currentSectionsPage]) || {};
        content = settings.content || {};
        banners = (settings.customBanners && settings.customBanners[currentSectionsPage]) || [];
      } catch (err) {
        container.innerHTML = `<p class="muted">تعذر تحميل إعدادات الأقسام: ${escapeHtml(err.message)}</p>`;
        return;
      }

      const configs = PAGE_SECTIONS_CONFIG[currentSectionsPage];
      // الأقسام الثابتة والبنرات المضافة في قائمة واحدة حسب ترتيبها في الصفحة
      const items = configs.map(cfg => ({ type: 'section', key: cfg.key, cfg, order: (sections[cfg.key] && sections[cfg.key].order) || 0 }))
        .concat(banners.map(b => ({ type: 'banner', key: b.id, banner: b, order: Number(b.order) || 0 })));
      items.sort((a, b) => a.order - b.order);

      container.innerHTML = customBannerToolbarTemplate(items) + '<div class="sections-list">' + items.map(it => (it.type === 'section' ? sectionCardTemplate(it.cfg) : customBannerCardTemplate(it.banner))).join('') + '</div>';

      items.forEach((it) => {
        const card = container.querySelector(`.section-editor-card[data-key="${it.key}"]`);
        if (it.type === 'section') wireSectionCard(card, it.cfg, sections[it.key] || {}, content);
        else wireCustomBannerCard(card, it.banner);
      });

      wireCustomBannerToolbar(container);
      bindSectionsDragDrop(container.querySelector('.sections-list'));
      bindSectionsMoveButtons(container.querySelector('.sections-list'));
    }

    /* ---------- البنرات المضافة داخل أقسام الصفحة ---------- */
    const CB_HEIGHTS = { sm: 'صغير', md: 'متوسط', lg: 'كبير' };

    function customBannerToolbarTemplate(items) {
      const opts = items.map(it => `<option value="${escapeHtml(it.key)}">بعد: ${escapeHtml(it.type === 'section' ? it.cfg.label : ('بنر — ' + (biAr(it.banner.title) || 'بدون عنوان')))}</option>`).join('');
      return `
        <div class="card cb-toolbar">
          <div class="cb-toolbar-row">
            <div class="form-field" style="flex:1; min-width:200px; margin:0;">
              <label>مكان البنر الجديد في الصفحة</label>
              <select class="cb-new-position">
                <option value="top">أعلى الصفحة</option>
                ${opts}
                <option value="end" selected>نهاية الصفحة</option>
              </select>
            </div>
            <button type="button" class="btn btn-sand cb-add-btn">＋ إضافة بنر جديد</button>
          </div>
          <p class="form-note" style="margin:8px 0 0;">بعد الإضافة افتح بطاقة البنر لرفع الصورة وكتابة العنوان والرابط. يمكنك تغيير مكانه في أي وقت بالأسهم ▲▼.</p>
        </div>`;
    }

    function wireCustomBannerToolbar(container) {
      const btn = container.querySelector('.cb-add-btn');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const after = container.querySelector('.cb-new-position').value;
          const { banner } = await api(`/api/settings/custom-banners/${currentSectionsPage}`, { method: 'POST', body: JSON.stringify({ after }) });
          showToast('تمت إضافة البنر. ارفع صورته واكتب محتواه ثم احفظ.');
          await loadSectionsEditor(currentSectionsPage);
          const card = document.querySelector(`#sectionsEditor .section-editor-card[data-key="${banner.id}"]`);
          if (card) { card.open = true; card.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
        } catch (err) { showToast(err.message); }
        finally { btn.disabled = false; }
      });
    }

    function customBannerCardTemplate(b) {
      const bi = (cls, label, rows) => `
        <div class="bi-field">
          <label>${label}</label>
          <div class="bi-row"><span class="bi-badge">AR</span>${rows ? `<textarea class="${cls}-ar" rows="${rows}"></textarea>` : `<input type="text" class="${cls}-ar">`}</div>
          <div class="bi-row"><span class="bi-badge en">EN</span>${rows ? `<textarea class="${cls}-en" rows="${rows}"></textarea>` : `<input type="text" class="${cls}-en">`}</div>
        </div>`;
      const imgSlot = (kind, label, hint) => `
        <div class="cb-image-slot" data-kind="${kind}">
          <label style="display:block; margin:14px 0 6px; font-weight:600; font-size:13px;">${label}</label>
          <div class="cb-image-preview"></div>
          <input type="file" class="cb-image-file" accept="image/png,image/jpeg,image/webp">
          <p class="size-hint">📐 ${hint}</p>
          <button type="button" class="btn btn-outline btn-sm cb-image-remove" hidden>حذف هذه الصورة</button>
        </div>`;
      return `
        <details class="section-editor-card cb-card" data-key="${escapeHtml(b.id)}" data-type="banner">
          <summary>
            <span class="sec-drag-handle" draggable="true" title="اسحب لإعادة الترتيب">⋮⋮</span>
            <span class="sec-move-btns"><button type="button" class="sec-move" data-dir="-1" title="تحريك للأعلى" aria-label="تحريك للأعلى">▲</button><button type="button" class="sec-move" data-dir="1" title="تحريك للأسفل" aria-label="تحريك للأسفل">▼</button></span>
            <label class="sec-visible-toggle"><input type="checkbox" class="sec-visible-cb" checked> ظاهر</label>
            <span class="sec-card-label">🖼️ بنر مضاف</span>
            <span class="sec-card-preview"></span>
          </summary>
          <div class="section-editor-body">
            ${imgSlot('desktop', 'صورة البنر', 'المقاس المقترح: 1920 × 700 بكسل')}
            ${imgSlot('mobile', 'صورة خاصة للجوال (اختياري)', 'المقاس المقترح: 1080 × 1080 بكسل. إن لم تُرفع تُستخدم صورة البنر نفسها')}
            ${bi('cb-title', 'العنوان (اختياري)')}
            ${bi('cb-subtitle', 'النص (اختياري)', 2)}
            ${bi('cb-btn', 'نص الزر (اختياري)')}
            <div class="form-field">
              <label>الرابط عند الضغط (اختياري)</label>
              <input type="text" class="cb-link" placeholder="/brief أو https://...">
              <p class="form-note" style="margin-top:4px;">إن كتبت نص الزر يظهر زر بهذا الرابط، وإلا يصبح البنر كله قابلاً للضغط.</p>
            </div>
            <div class="form-grid">
              <div class="form-field">
                <label>ارتفاع البنر</label>
                <select class="cb-height">${Object.entries(CB_HEIGHTS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
              </div>
              <div class="form-field">
                <label>&nbsp;</label>
                <label class="perm-check"><input type="checkbox" class="cb-overlay"> تظليل الصورة لوضوح النص</label>
              </div>
            </div>
            <div class="cb-actions">
              <button type="button" class="btn btn-sand cb-save">حفظ البنر</button>
              <button type="button" class="btn btn-danger cb-delete">حذف البنر</button>
            </div>
            <p class="form-note sec-save-msg"></p>
          </div>
        </details>`;
    }

    function wireCustomBannerCard(card, b) {
      const base = `/api/settings/custom-banners/${currentSectionsPage}/${encodeURIComponent(b.id)}`;
      const preview = () => { card.querySelector('.sec-card-preview').textContent = biAr(b.title) || (b.image ? '' : 'بدون صورة بعد'); };
      preview();
      card.querySelector('.sec-visible-toggle').addEventListener('click', (e) => e.stopPropagation());
      card.querySelector('.sec-drag-handle').addEventListener('click', (e) => e.stopPropagation());

      const fill = (cls, v) => { setVal(card, `.${cls}-ar`, biAr(v)); setVal(card, `.${cls}-en`, biEn(v)); };
      fill('cb-title', b.title); fill('cb-subtitle', b.subtitle); fill('cb-btn', b.buttonText);
      setVal(card, '.cb-link', b.link || '');
      card.querySelector('.cb-height').value = b.height || 'md';
      card.querySelector('.cb-overlay').checked = b.overlay !== false;

      const visibleCb = card.querySelector('.sec-visible-cb');
      visibleCb.checked = b.visible !== false;
      visibleCb.addEventListener('change', async () => {
        try {
          await api(base, { method: 'PUT', body: JSON.stringify({ visible: visibleCb.checked }) });
          b.visible = visibleCb.checked;
          showToast(visibleCb.checked ? 'تم إظهار البنر في الصفحة.' : 'تم إخفاء البنر من الصفحة.');
        } catch (err) { showToast(err.message); visibleCb.checked = !visibleCb.checked; }
      });

      const showImages = () => {
        card.querySelectorAll('.cb-image-slot').forEach((slot) => {
          const url = slot.dataset.kind === 'mobile' ? b.imageMobile : b.image;
          slot.querySelector('.cb-image-preview').innerHTML = url ? `<img src="${escapeHtml(url)}" alt="" style="max-width:100%; max-height:160px; border-radius:10px; display:block; margin-bottom:8px;">` : '';
          slot.querySelector('.cb-image-remove').hidden = !url;
        });
        preview();
      };
      showImages();
      card.querySelectorAll('.cb-image-slot').forEach((slot) => {
        slot.querySelector('.cb-image-remove').addEventListener('click', async () => {
          if (!confirm('حذف هذه الصورة من البنر؟')) return;
          try {
            const r = await api(`${base}/image${slot.dataset.kind === 'mobile' ? '?kind=mobile' : ''}`, { method: 'DELETE' });
            Object.assign(b, r.banner); showImages(); showToast('تم حذف الصورة.');
          } catch (err) { showToast(err.message); }
        });
      });

      card.querySelector('.cb-save').addEventListener('click', async () => {
        const msg = card.querySelector('.sec-save-msg');
        const btn = card.querySelector('.cb-save');
        const val = (cls) => ({ ar: card.querySelector(`.${cls}-ar`).value.trim(), en: card.querySelector(`.${cls}-en`).value.trim() });
        btn.disabled = true;
        msg.textContent = 'جارِ الحفظ...';
        try {
          let r = await api(base, { method: 'PUT', body: JSON.stringify({
            title: val('cb-title'), subtitle: val('cb-subtitle'), buttonText: val('cb-btn'),
            link: card.querySelector('.cb-link').value.trim(), height: card.querySelector('.cb-height').value,
            overlay: card.querySelector('.cb-overlay').checked,
          }) });
          Object.assign(b, r.banner);
          for (const slot of card.querySelectorAll('.cb-image-slot')) {
            const file = slot.querySelector('.cb-image-file').files[0];
            if (!file) continue;
            const fd = new FormData();
            const img = await compressImage(file, slot.dataset.kind === 'mobile' ? 'section' : 'background');
            fd.append('image', img, img.name);
            r = await api(`${base}/image${slot.dataset.kind === 'mobile' ? '?kind=mobile' : ''}`, { method: 'PUT', body: fd });
            Object.assign(b, r.banner);
            slot.querySelector('.cb-image-file').value = '';
          }
          showImages();
          msg.textContent = 'تم حفظ البنر بنجاح.';
        } catch (err) { msg.textContent = err.message; }
        finally { btn.disabled = false; }
      });

      card.querySelector('.cb-delete').addEventListener('click', async () => {
        if (!confirm('حذف هذا البنر نهائياً من الصفحة؟')) return;
        try {
          await api(base, { method: 'DELETE' });
          showToast('تم حذف البنر.');
          await loadSectionsEditor(currentSectionsPage);
        } catch (err) { showToast(err.message); }
      });
    }

    // تحريك قسم أو بنر خطوة للأعلى أو الأسفل (بديل السحب، ويعمل على الجوال)
    function bindSectionsMoveButtons(list) {
      list.querySelectorAll('.sec-move').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const card = btn.closest('.section-editor-card');
          const dir = Number(btn.dataset.dir);
          const sibling = dir < 0 ? card.previousElementSibling : card.nextElementSibling;
          if (!sibling) return;
          if (dir < 0) sibling.before(card); else sibling.after(card);
          const order = Array.from(list.querySelectorAll('.section-editor-card')).map(c => c.dataset.key);
          try {
            await api(`/api/settings/sections/${currentSectionsPage}/reorder`, { method: 'PUT', body: JSON.stringify({ order }) });
            showToast('تم حفظ الترتيب.');
          } catch (err) {
            showToast(err.message);
            if (dir < 0) sibling.after(card); else sibling.before(card);
          }
        });
      });
    }

    /* كل صفحة لها تبويبها: قسم «الهوية والمظهر» وقسم «الأقسام والبنرات» */
    function setupSectionsPageSwitcher() {
      const showSub = (panel, sub) => {
        panel.querySelectorAll('.page-subtab').forEach(b => b.classList.toggle('is-active', b.dataset.sub === sub));
        panel.querySelectorAll('.page-sub').forEach(d => d.classList.toggle('is-active', d.dataset.sub === sub));
        try { localStorage.setItem('dash-page-sub', sub); } catch (e) {}
      };
      const openPage = (panel) => {
        const page = panel.dataset.page;
        const editor = document.getElementById('sectionsEditor');
        const host = panel.querySelector('.page-sections-host');
        if (editor && host && editor.parentElement !== host) host.appendChild(editor);
        if (page !== currentSectionsPage || !editor.childElementCount) loadSectionsEditor(page);
      };
      let savedSub = 'identity';
      try { savedSub = localStorage.getItem('dash-page-sub') || 'identity'; } catch (e) {}
      document.querySelectorAll('.page-panel').forEach(panel => {
        showSub(panel, savedSub === 'sections' ? 'sections' : 'identity');
        panel.querySelectorAll('.page-subtab').forEach(btn => {
          btn.addEventListener('click', () => showSub(panel, btn.dataset.sub));
        });
        panel.querySelectorAll('.page-goto-sections').forEach(btn => {
          btn.addEventListener('click', () => showSub(panel, 'sections'));
        });
        const tab = document.querySelector(`.dash-tab[data-tab="page-${panel.dataset.page}"]`);
        if (tab) tab.addEventListener('click', () => openPage(panel));
      });
    }

    function bindSectionsDragDrop(container) {
      let draggedCard = null;
      container.querySelectorAll('.section-editor-card').forEach(card => {
        const handle = card.querySelector('.sec-drag-handle');
        handle.addEventListener('mousedown', () => { card.setAttribute('draggable', 'true'); });
        card.addEventListener('dragstart', () => {
          draggedCard = card;
          card.classList.add('dragging');
        });
        card.addEventListener('dragend', () => {
          card.classList.remove('dragging');
          card.removeAttribute('draggable');
          container.querySelectorAll('.section-editor-card').forEach(c => c.classList.remove('drag-over'));
        });
        card.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (card !== draggedCard) card.classList.add('drag-over');
        });
        card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
        card.addEventListener('drop', async (e) => {
          e.preventDefault();
          card.classList.remove('drag-over');
          if (!draggedCard || card === draggedCard) return;
          const cards = Array.from(container.querySelectorAll('.section-editor-card'));
          const fromIdx = cards.indexOf(draggedCard);
          const toIdx = cards.indexOf(card);
          if (fromIdx < toIdx) card.after(draggedCard); else card.before(draggedCard);

          const newOrder = Array.from(container.querySelectorAll('.section-editor-card')).map(c => c.dataset.key);
          try {
            await api(`/api/settings/sections/${currentSectionsPage}/reorder`, { method: 'PUT', body: JSON.stringify({ order: newOrder }) });
            showToast('تم حفظ ترتيب الأقسام بنجاح.');
          } catch (err) { showToast(err.message); }
        });
      });
    }

    // يبني نصاً قصيراً يلخّص المحتوى الفعلي داخل القسم، ليظهر بجانب اسمه
    // بدون فتح البطاقة — يسهّل التمييز بين الأقسام بنظرة واحدة.
    function computeSectionPreview(cfg, s, content) {
      const clip = (str, n) => {
        str = (str || '').replace(/\s+/g, ' ').trim();
        return str.length > n ? str.slice(0, n) + '…' : str;
      };
      if (cfg.contentType === 'hero') {
        return clip(biAr(content.heroTitle), 60);
      }
      if (cfg.contentType === 'story') {
        const story = Array.isArray(content.aboutStory) ? content.aboutStory : [];
        const first = story.find(p => biAr(p));
        return clip(biAr(first), 60);
      }
      if (cfg.contentType === 'missionVision') {
        return clip(biAr(content.mission), 60);
      }
      if (cfg.contentType === 'valuesList') {
        const n = (content.values || []).length;
        return n ? `${n} قيم` : '';
      }
      if (cfg.contentType === 'timelineList') {
        const n = (content.timeline || []).length;
        return n ? `${n} محطات` : '';
      }
      if (cfg.contentType === 'certsList') {
        const n = (content.certifications || []).length;
        return n ? `${n} اعتمادات` : '';
      }
      if (cfg.hasText === true || cfg.hasText === 'titleOnly') {
        return clip(biAr(s.title), 60);
      }
      return '';
    }

    function wireSectionCard(card, cfg, s, content) {
      content = content || {};
      const previewEl = card.querySelector('.sec-card-preview');
      if (previewEl) previewEl.textContent = computeSectionPreview(cfg, s, content);

      // منع ضغطة القائمة (الظاهر) أو مقبض السحب من فتح/طي البطاقة عن طريق الخطأ
      card.querySelector('.sec-visible-toggle').addEventListener('click', (e) => e.stopPropagation());
      card.querySelector('.sec-drag-handle').addEventListener('click', (e) => e.stopPropagation());

      const visibleCb = card.querySelector('.sec-visible-cb');
      visibleCb.checked = s.visible !== false;
      visibleCb.addEventListener('change', async () => {
        try {
          await api(`/api/settings/sections/${currentSectionsPage}`, { method: 'PUT', body: JSON.stringify({ [cfg.key]: { visible: visibleCb.checked } }) });
          showToast(visibleCb.checked ? 'تم إظهار القسم بالصفحة الرئيسية.' : 'تم إخفاء القسم من الصفحة الرئيسية.');
        } catch (err) {
          showToast(err.message);
          visibleCb.checked = !visibleCb.checked;
        }
      });

      // تعبئة القيم الحالية
      if (cfg.hasText === true || cfg.hasText === 'titleOnly') {
        setVal(card, '.sec-title-ar', biAr(s.title));
        setVal(card, '.sec-title-en', biEn(s.title));
      }
      if (cfg.hasText === true) {
        setVal(card, '.sec-content-ar', biAr(s.content));
        setVal(card, '.sec-content-en', biEn(s.content));
      }

      // تعبئة وتوصيل المحتوى الغني المضمّن (بدل تبويب "محتوى الصفحات" المُلغى)
      if (cfg.contentType === 'hero') {
        setVal(card, '.sec-hero-title-ar', biAr(content.heroTitle));
        setVal(card, '.sec-hero-title-en', biEn(content.heroTitle));
        setVal(card, '.sec-hero-subtitle-ar', biAr(content.heroSubtitle));
        setVal(card, '.sec-hero-subtitle-en', biEn(content.heroSubtitle));
      } else if (cfg.contentType === 'story') {
        const story = Array.isArray(content.aboutStory) ? content.aboutStory : [];
        setVal(card, '.sec-story-p1-ar', biAr(story[0])); setVal(card, '.sec-story-p1-en', biEn(story[0]));
        setVal(card, '.sec-story-p2-ar', biAr(story[1])); setVal(card, '.sec-story-p2-en', biEn(story[1]));
        setVal(card, '.sec-story-p3-ar', biAr(story[2])); setVal(card, '.sec-story-p3-en', biEn(story[2]));
      } else if (cfg.contentType === 'missionVision') {
        setVal(card, '.sec-mission-ar', biAr(content.mission)); setVal(card, '.sec-mission-en', biEn(content.mission));
        setVal(card, '.sec-vision-ar', biAr(content.vision)); setVal(card, '.sec-vision-en', biEn(content.vision));
      } else if (cfg.contentType === 'valuesList') {
        renderValuesEditor(content.values || []);
      } else if (cfg.contentType === 'timelineList') {
        renderTimelineEditor(content.timeline || []);
        setupTimelineAdd();
      } else if (cfg.contentType === 'certsList') {
        renderCertsEditor(content.certifications || []);
        setupCertsAdd();
      }

      setVal(card, '.sec-bg-color', s.bgColor || '');
      if (s.bgColor) card.querySelector('.sec-bg-color-picker').value = s.bgColor;
      setVal(card, '.sec-box-color', s.boxColor || '');
      if (s.boxColor) card.querySelector('.sec-box-color-picker').value = s.boxColor;
      setVal(card, '.sec-text-color', s.textColor || '');
      if (s.textColor) card.querySelector('.sec-text-color-picker').value = s.textColor;
      const hoverCb = card.querySelector('.sec-hover-effect');
      if (hoverCb) hoverCb.checked = !!s.hoverEffect;

      // تبديل وضع الخلفية (لون/صورة)
      setActiveMode(card, '.sec-bg-mode-toggle', s.bgMode || 'color');
      toggleModePanels(card, 'bg', s.bgMode || 'color');
      card.querySelectorAll('.sec-bg-mode-toggle button').forEach(btn => {
        btn.addEventListener('click', () => {
          setActiveMode(card, '.sec-bg-mode-toggle', btn.dataset.mode);
          toggleModePanels(card, 'bg', btn.dataset.mode);
        });
      });

      // تبديل وضع صورة القسم (رفع/رابط)
      if (cfg.hasImage) {
        setActiveMode(card, '.sec-image-mode-toggle', s.imageMode || 'upload');
        toggleModePanels(card, 'image', s.imageMode || 'upload');
        card.querySelectorAll('.sec-image-mode-toggle button').forEach(btn => {
          btn.addEventListener('click', () => {
            setActiveMode(card, '.sec-image-mode-toggle', btn.dataset.mode);
            toggleModePanels(card, 'image', btn.dataset.mode);
          });
        });
        setVal(card, '.sec-image-url', s.imageMode === 'url' ? (s.image || '') : '');
      }

      // مزامنة منتقي اللون المرئي مع الحقل النصي
      ['bg-color', 'box-color', 'text-color'].forEach(field => {
        const picker = card.querySelector(`.sec-${field}-picker`);
        const text = card.querySelector(`.sec-${field}`);
        picker.addEventListener('input', () => { text.value = picker.value; });
        text.addEventListener('input', () => { if (/^#[0-9a-fA-F]{3,6}$/.test(text.value)) picker.value = text.value; });
      });

      card.querySelector('.sec-save').addEventListener('click', () => saveSectionCard(card, cfg));
    }

    function setVal(card, selector, value) {
      const el = card.querySelector(selector);
      if (el) el.value = value || '';
    }
    function setActiveMode(card, toggleSelector, mode) {
      card.querySelectorAll(`${toggleSelector} button`).forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.mode === mode);
      });
    }
    function toggleModePanels(card, kind, mode) {
      if (kind === 'bg') {
        card.querySelector('.sec-bg-color-panel').style.display = mode === 'color' ? '' : 'none';
        card.querySelector('.sec-bg-image-panel').style.display = mode === 'image' ? '' : 'none';
      } else {
        card.querySelector('.sec-image-upload-panel').style.display = mode === 'upload' ? '' : 'none';
        card.querySelector('.sec-image-url-panel').style.display = mode === 'url' ? '' : 'none';
      }
    }

    async function saveSectionCard(card, cfg) {
      const msgBox = card.querySelector('.sec-save-msg');
      const bgMode = card.querySelector('.sec-bg-mode-toggle button.is-active').dataset.mode;
      const payload = {
        bgMode,
        bgColor: card.querySelector('.sec-bg-color').value.trim(),
        boxColor: card.querySelector('.sec-box-color').value.trim(),
        textColor: card.querySelector('.sec-text-color').value.trim(),
        hoverEffect: card.querySelector('.sec-hover-effect').checked,
      };
      if (cfg.hasText === true || cfg.hasText === 'titleOnly') {
        payload.title = { ar: card.querySelector('.sec-title-ar').value.trim(), en: card.querySelector('.sec-title-en').value.trim() };
      }
      if (cfg.hasText === true) {
        payload.content = { ar: card.querySelector('.sec-content-ar').value.trim(), en: card.querySelector('.sec-content-en').value.trim() };
      }
      if (cfg.hasImage) {
        const imageMode = card.querySelector('.sec-image-mode-toggle button.is-active').dataset.mode;
        payload.imageMode = imageMode;
        if (imageMode === 'url') payload.image = card.querySelector('.sec-image-url').value.trim();
      }

      try {
        // 1) حفظ الحقول النصية والألوان الخاصة بالقسم
        await api(`/api/settings/sections/${currentSectionsPage}`, { method: 'PUT', body: JSON.stringify({ [cfg.key]: payload }) });

        // 1ب) حفظ المحتوى الغني المضمّن (الهيرو / القصة / الرسالة والرؤية) إن وُجد بهذا القسم
        if (cfg.contentType === 'hero') {
          await api('/api/settings/content', { method: 'PUT', body: JSON.stringify({
            heroTitle: { ar: card.querySelector('.sec-hero-title-ar').value, en: card.querySelector('.sec-hero-title-en').value },
            heroSubtitle: { ar: card.querySelector('.sec-hero-subtitle-ar').value.trim(), en: card.querySelector('.sec-hero-subtitle-en').value.trim() },
          })});
        } else if (cfg.contentType === 'story') {
          const aboutStory = [
            { ar: card.querySelector('.sec-story-p1-ar').value.trim(), en: card.querySelector('.sec-story-p1-en').value.trim() },
            { ar: card.querySelector('.sec-story-p2-ar').value.trim(), en: card.querySelector('.sec-story-p2-en').value.trim() },
            { ar: card.querySelector('.sec-story-p3-ar').value.trim(), en: card.querySelector('.sec-story-p3-en').value.trim() },
          ];
          await api('/api/settings/content', { method: 'PUT', body: JSON.stringify({ aboutStory }) });
        } else if (cfg.contentType === 'missionVision') {
          await api('/api/settings/content', { method: 'PUT', body: JSON.stringify({
            mission: { ar: card.querySelector('.sec-mission-ar').value.trim(), en: card.querySelector('.sec-mission-en').value.trim() },
            vision: { ar: card.querySelector('.sec-vision-ar').value.trim(), en: card.querySelector('.sec-vision-en').value.trim() },
          })});
        }

        // 2) رفع صورة الخلفية إذا اختير وضع "صورة" وتم اختيار ملف
        const bgFile = card.querySelector('.sec-bg-image-file');
        if (bgMode === 'image' && bgFile && bgFile.files[0]) {
          const fd = new FormData();
          const bgImg = await compressImage(bgFile.files[0], 'background'); fd.append('image', bgImg, bgImg.name);
          await api(`/api/settings/sections/${currentSectionsPage}/${cfg.key}/bg-image`, { method: 'PUT', body: fd });
        }

        // 3) رفع صورة القسم نفسه إذا اختير وضع "رفع" وتم اختيار ملف
        if (cfg.hasImage) {
          const imgFile = card.querySelector('.sec-image-file');
          const imageMode = card.querySelector('.sec-image-mode-toggle button.is-active').dataset.mode;
          if (imageMode === 'upload' && imgFile && imgFile.files[0]) {
            const fd2 = new FormData();
            const secImg = await compressImage(imgFile.files[0], 'section'); fd2.append('image', secImg, secImg.name);
            await api(`/api/settings/sections/${currentSectionsPage}/${cfg.key}/image`, { method: 'PUT', body: fd2 });
          }
        }

        msgBox.textContent = 'تم حفظ إعدادات القسم بنجاح.';

        // تحديث فوري لنص المعاينة بجانب اسم القسم دون الحاجة لإعادة تحميل الصفحة كاملة
        const previewEl = card.querySelector('.sec-card-preview');
        if (previewEl) {
          const clip = (str, n) => {
            str = (str || '').replace(/\s+/g, ' ').trim();
            return str.length > n ? str.slice(0, n) + '…' : str;
          };
          if (cfg.contentType === 'hero') {
            previewEl.textContent = clip(card.querySelector('.sec-hero-title-ar').value, 60);
          } else if (cfg.contentType === 'story') {
            const p1 = card.querySelector('.sec-story-p1-ar').value;
            const p2 = card.querySelector('.sec-story-p2-ar').value;
            previewEl.textContent = clip(p1 || p2, 60);
          } else if (cfg.contentType === 'missionVision') {
            previewEl.textContent = clip(card.querySelector('.sec-mission-ar').value, 60);
          } else if (cfg.hasText === true || cfg.hasText === 'titleOnly') {
            previewEl.textContent = clip(card.querySelector('.sec-title-ar').value, 60);
          }
        }
      } catch (err) {
        msgBox.textContent = err.message;
      }
    }

    // مكتبة الخطوط (نفس القائمة في lib/typography.js وملفاتها في css/fonts.css)
    const FONT_LIBRARY = [
      { id: 'IBMPlexSansArabic', family: 'IBM Plex Sans Arabic', label: 'IBM Plex Sans Arabic', scripts: 'عربي + لاتيني · 400–700' },
      { id: 'ClashDisplay', family: 'ClashDisplay', label: 'Clash Display', scripts: 'لاتيني' },
      { id: 'EmadDianaExtra', family: 'EmadDianaExtra', label: 'Emad Diana Extra', scripts: 'عربي' },
      { id: 'StolzlBook', family: 'StolzlBook', label: 'Stolzl Book', scripts: 'لاتيني' },
    ];
    const FONT_ROLES = ['heading', 'subheading', 'body', 'buttons'];
    // علامات تنصيص مفردة: القيمة تُكتب أيضاً داخل خاصية style="..." في HTML
    const FONT_FALLBACK = "'IBM Plex Sans Arabic', system-ui, sans-serif";
    function cleanFontName(v) { return String(v || '').replace(/[^A-Za-z0-9؀-ۿ \-]/g, '').trim(); }
    function roleFont(role) {
      const select = document.querySelector(`[data-font-role="${role}"]`);
      if (select.value === 'custom') return { source: 'custom', value: cleanFontName(document.querySelector(`[data-custom-for="${role}"]`).value) };
      return { source: 'preset', value: select.value };
    }
    function roleStack(role) {
      const f = roleFont(role);
      const family = f.source === 'custom' ? f.value : (FONT_LIBRARY.find(x => x.id === f.value) || {}).family;
      return family ? `"${family}", ${FONT_FALLBACK}` : FONT_FALLBACK;
    }
    function updateTypographyPreview() {
      const box = document.getElementById('typoPreview');
      if (!box) return;
      const px = (id, fallback) => { const n = parseInt(document.getElementById(id).value, 10); return n >= 10 ? Math.min(n, 72) + 'px' : fallback; };
      box.querySelector('.typo-preview-h1').style.fontFamily = roleStack('heading');
      box.querySelector('.typo-preview-h1').style.fontSize = px('fontSizeH1', '30px');
      box.querySelector('.typo-preview-h2').style.fontFamily = roleStack('subheading');
      box.querySelector('.typo-preview-h2').style.fontSize = px('fontSizeH2', '22px');
      box.querySelector('.typo-preview-body').style.fontFamily = roleStack('body');
      box.querySelector('.typo-preview-body').style.fontSize = px('fontSizeBody', '15px');
      box.querySelector('.typo-preview-btn').style.fontFamily = roleStack('buttons');
    }
    function fillTypographyForm(typo) {
      const fonts = typo.fonts || {};
      FONT_ROLES.forEach((role) => {
        const f = fonts[role] || { source: 'preset', value: 'IBMPlexSansArabic' };
        const select = document.querySelector(`[data-font-role="${role}"]`);
        const custom = document.querySelector(`[data-custom-for="${role}"]`);
        select.value = f.source === 'custom' ? 'custom' : f.value;
        if (!select.value) select.value = 'IBMPlexSansArabic';
        custom.value = f.source === 'custom' ? f.value : '';
        custom.hidden = select.value !== 'custom';
      });
      const sizes = typo.fontSizes || {};
      document.getElementById('fontSizeH1').value = sizes.h1 || '';
      document.getElementById('fontSizeH2').value = sizes.h2 || '';
      document.getElementById('fontSizeBody').value = sizes.body || '';
      updateTypographyPreview();
    }

    function setupTypographyForm() {
      document.getElementById('fontLibrary').innerHTML = FONT_LIBRARY.map(f => `
        <div class="font-library-item">
          <div class="font-library-meta"><strong>${escapeHtml(f.label)}</strong><span>${escapeHtml(f.scripts)}</span></div>
          <div class="font-library-sample" style="font-family:'${f.family}', ${FONT_FALLBACK};">العمران الذهبية للمقاولات العامة — Alomran 2026</div>
        </div>`).join('');
      const options = FONT_LIBRARY.map(f => `<option value="${f.id}">${escapeHtml(f.label)}</option>`).join('') + '<option value="custom">خط مخصص (اكتب اسمه)</option>';
      FONT_ROLES.forEach((role) => {
        const select = document.querySelector(`[data-font-role="${role}"]`);
        const custom = document.querySelector(`[data-custom-for="${role}"]`);
        select.innerHTML = options;
        select.value = 'IBMPlexSansArabic';
        select.addEventListener('change', () => { custom.hidden = select.value !== 'custom'; if (!custom.hidden) custom.focus(); updateTypographyPreview(); });
        custom.addEventListener('input', updateTypographyPreview);
      });
      ['fontSizeH1', 'fontSizeH2', 'fontSizeBody'].forEach(id => document.getElementById(id).addEventListener('input', updateTypographyPreview));
      updateTypographyPreview();

      document.getElementById('saveTypographyBtn').addEventListener('click', async () => {
        const msgBox = document.getElementById('typographyMessage');
        const fonts = {};
        for (const role of FONT_ROLES) {
          fonts[role] = roleFont(role);
          if (fonts[role].source === 'custom' && !fonts[role].value) {
            msgBox.textContent = 'اكتب اسم الخط المخصص أولاً.';
            document.querySelector(`[data-custom-for="${role}"]`).focus();
            return;
          }
        }
        const payload = {
          fonts,
          fontSizes: {
            h1: document.getElementById('fontSizeH1').value.trim(),
            h2: document.getElementById('fontSizeH2').value.trim(),
            body: document.getElementById('fontSizeBody').value.trim(),
          },
        };
        try {
          const r = await api('/api/settings/typography', { method: 'PUT', body: JSON.stringify(payload) });
          fillTypographyForm(r.typography || {});
          msgBox.textContent = 'تم حفظ إعدادات الخطوط بنجاح.';
        } catch (err) { msgBox.textContent = err.message; }
      });
    }

    let valuesCache = [];

    function renderValuesEditor(values) {
      valuesCache = values.slice();
      const container = document.getElementById('embeddedValuesEditor');
      container.innerHTML = '';
      valuesCache.forEach((v, i) => {
        const card = el(`
          <div class="banner-edit-card" data-index="${i}">
            <div class="bi-row"><span class="bi-badge">AR</span><input type="text" class="val-title-ar" placeholder="عنوان القيمة" value="${escapeAttr(biAr(v.title))}"></div>
            <div class="bi-row"><span class="bi-badge en">EN</span><input type="text" class="val-title-en" placeholder="Value title" value="${escapeAttr(biEn(v.title))}"></div>
            <div class="bi-row"><span class="bi-badge">AR</span><textarea class="val-desc-ar" rows="2" placeholder="وصف القيمة">${escapeHtml(biAr(v.description))}</textarea></div>
            <div class="bi-row"><span class="bi-badge en">EN</span><textarea class="val-desc-en" rows="2" placeholder="Value description">${escapeHtml(biEn(v.description))}</textarea></div>
            <button type="button" class="btn btn-dark btn-sm val-save" style="width:100%;">حفظ</button>
          </div>
        `);
        card.querySelector('.val-save').addEventListener('click', () => {
          valuesCache[i] = {
            title: { ar: card.querySelector('.val-title-ar').value.trim(), en: card.querySelector('.val-title-en').value.trim() },
            description: { ar: card.querySelector('.val-desc-ar').value.trim(), en: card.querySelector('.val-desc-en').value.trim() },
          };
          saveValues();
        });
        container.appendChild(card);
      });
    }

    // يحدّث نص المعاينة (عدد العناصر) بجانب اسم القسم بعد أي تعديل على قائمة
    // (القيم/المسيرة الزمنية/الاعتمادات) دون الحاجة لإعادة تحميل الصفحة
    function updateSectionPreviewCount(sectionKey, count, label) {
      const el = document.querySelector(`.sec-card-preview[data-key="${sectionKey}"]`);
      if (el) el.textContent = count ? `${count} ${label}` : '';
    }

    async function saveValues() {
      try {
        await api('/api/settings/content', { method: 'PUT', body: JSON.stringify({ values: valuesCache }) });
        showToast('تم حفظ القيم بنجاح.');
        updateSectionPreviewCount('values', valuesCache.length, 'قيم');
      } catch (err) { showToast(err.message); }
    }

    let timelineCache = [];

    function renderTimelineEditor(timeline) {
      timelineCache = timeline.slice();
      const container = document.getElementById('embeddedTimelineEditor');
      container.innerHTML = '';
      timelineCache.forEach((t, i) => {
        const card = el(`
          <div class="banner-edit-card" data-index="${i}">
            <input type="text" class="tl-year" placeholder="السنة (مثال: 2026)" value="${escapeAttr(t.year || '')}">
            <div class="bi-row"><span class="bi-badge">AR</span><input type="text" class="tl-title-ar" placeholder="عنوان المحطة" value="${escapeAttr(biAr(t.title))}"></div>
            <div class="bi-row"><span class="bi-badge en">EN</span><input type="text" class="tl-title-en" placeholder="Milestone title" value="${escapeAttr(biEn(t.title))}"></div>
            <div class="bi-row"><span class="bi-badge">AR</span><textarea class="tl-desc-ar" rows="2" placeholder="الوصف">${escapeHtml(biAr(t.description))}</textarea></div>
            <div class="bi-row"><span class="bi-badge en">EN</span><textarea class="tl-desc-en" rows="2" placeholder="Description">${escapeHtml(biEn(t.description))}</textarea></div>
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn btn-dark btn-sm tl-save" style="flex:1;">حفظ</button>
              <button type="button" class="btn btn-danger btn-sm tl-remove">حذف</button>
            </div>
          </div>
        `);
        card.querySelector('.tl-save').addEventListener('click', () => {
          timelineCache[i] = {
            year: card.querySelector('.tl-year').value.trim(),
            title: { ar: card.querySelector('.tl-title-ar').value.trim(), en: card.querySelector('.tl-title-en').value.trim() },
            description: { ar: card.querySelector('.tl-desc-ar').value.trim(), en: card.querySelector('.tl-desc-en').value.trim() },
          };
          saveTimeline();
        });
        card.querySelector('.tl-remove').addEventListener('click', () => {
          timelineCache.splice(i, 1);
          saveTimeline();
        });
        container.appendChild(card);
      });
    }

    async function saveTimeline() {
      const msgBox = document.getElementById('timelineMessage');
      try {
        await api('/api/settings/content', { method: 'PUT', body: JSON.stringify({ timeline: timelineCache }) });
        msgBox.textContent = 'تم حفظ المسيرة الزمنية بنجاح.';
        updateSectionPreviewCount('timeline', timelineCache.length, 'محطات');
      } catch (err) { msgBox.textContent = err.message; }
    }

    function setupTimelineAdd() {
      document.getElementById('addTimelineBtn').addEventListener('click', () => {
        timelineCache.push({ year: '', title: { ar: '', en: '' }, description: { ar: '', en: '' } });
        renderTimelineEditor(timelineCache);
      });
    }

    let certsCache = [];

    function renderCertsEditor(certifications) {
      certsCache = certifications.slice();
      const container = document.getElementById('embeddedCertsEditor');
      container.innerHTML = '';
      certsCache.forEach((cert, i) => {
        const card = el(`
          <div class="banner-edit-card" data-index="${i}">
            <div class="bi-row"><span class="bi-badge">AR</span><textarea class="cert-text-ar" rows="2" placeholder="نص الاعتماد أو الشهادة">${escapeHtml(biAr(cert))}</textarea></div>
            <div class="bi-row"><span class="bi-badge en">EN</span><textarea class="cert-text-en" rows="2" placeholder="Certification text">${escapeHtml(biEn(cert))}</textarea></div>
            <div style="display:flex; gap:8px;">
              <button type="button" class="btn btn-dark btn-sm cert-save" style="flex:1;">حفظ</button>
              <button type="button" class="btn btn-danger btn-sm cert-remove">حذف</button>
            </div>
          </div>
        `);
        card.querySelector('.cert-save').addEventListener('click', () => {
          certsCache[i] = { ar: card.querySelector('.cert-text-ar').value.trim(), en: card.querySelector('.cert-text-en').value.trim() };
          saveCerts();
        });
        card.querySelector('.cert-remove').addEventListener('click', () => {
          certsCache.splice(i, 1);
          saveCerts();
        });
        container.appendChild(card);
      });
    }

    async function saveCerts() {
      const msgBox = document.getElementById('certsMessage');
      try {
        await api('/api/settings/content', { method: 'PUT', body: JSON.stringify({ certifications: certsCache }) });
        msgBox.textContent = 'تم حفظ الاعتمادات بنجاح.';
        updateSectionPreviewCount('certifications', certsCache.length, 'اعتمادات');
      } catch (err) { msgBox.textContent = err.message; }
    }

    function setupCertsAdd() {
      document.getElementById('addCertBtn').addEventListener('click', () => {
        certsCache.push({ ar: '', en: '' });
        renderCertsEditor(certsCache);
      });
    }

    function setupMapForm() {
      document.getElementById('mapForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const msgBox = document.getElementById('mapMessage');
        const payload = { mapUrl: document.getElementById('mapUrl').value.trim(), mapCoords: document.getElementById('mapCoords').value.trim() };
        try {
          await api('/api/settings/content', { method: 'PUT', body: JSON.stringify(payload) });
          msgBox.textContent = 'تم حفظ موقع الخريطة. سيفتح الضغط على الخريطة هذا الرابط.';
        } catch (err) { msgBox.textContent = err.message; }
      });
    }

    function setupFooterForm() {
      document.getElementById('footerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const msgBox = document.getElementById('footerMessage');
        const payload = {
          footerTagline: {
            ar: document.getElementById('footerTagline-ar').value.trim(),
            en: document.getElementById('footerTagline-en').value.trim(),
          },
        };
        try {
          await api('/api/settings/content', { method: 'PUT', body: JSON.stringify(payload) });
          msgBox.textContent = 'تم حفظ نص الفوتر بنجاح.';
        } catch (err) { msgBox.textContent = err.message; }
      });
    }

    function setupIdentityUploads() {
      const map = {
        logo: { preset: 'logo', input: 'logoFile', endpoint: '/api/settings/logo', preview: 'logoPreview', msgBox: 'identityMessage' },
        favicon: { preset: 'icon', input: 'faviconFile', endpoint: '/api/settings/favicon', preview: 'faviconPreview', msgBox: 'identityMessage' },
        about: { preset: 'background', input: 'aboutBgFile', endpoint: '/api/settings/background/about', preview: 'aboutBgPreview', msgBox: 'bgMessage' },
        projects: { preset: 'background', input: 'projectsBgFile', endpoint: '/api/settings/background/projects', preview: 'projectsBgPreview', msgBox: 'projectsBgMessage' },
      };
      document.querySelectorAll('[data-upload]').forEach(btn => {
        const key = btn.getAttribute('data-upload');
        const conf = map[key];
        if (!conf) return;
        bindImageUpload({ input: conf.input, button: btn, preset: conf.preset, endpoint: conf.endpoint, msgBox: conf.msgBox, done: 'تم الرفع بنجاح، واستُبدلت الصورة السابقة.' });
      });
    }

    // رفع صورة هوية (شعار، أيقونة، خلفية): يبدأ الرفع فور اختيار الملف، ويبقى الزر لإعادة المحاولة.
    // الخادم يحذف الصورة السابقة بعد حفظ الجديدة.
    function bindImageUpload({ input, button, preset, endpoint, msgBox, done, after = loadIdentity }) {
      const fileInput = document.getElementById(input);
      const btn = typeof button === 'string' ? document.getElementById(button) : button;
      const box = document.getElementById(msgBox);
      if (!fileInput || !btn) return;
      const run = async () => {
        const file = fileInput.files[0];
        if (!file) { box.textContent = 'اختر ملفاً أولاً.'; return; }
        btn.disabled = true; box.textContent = 'جارِ رفع الصورة...';
        try {
          const img = await compressImage(file, preset);
          const fd = new FormData();
          fd.append('image', img, img.name);
          await api(endpoint, { method: 'PUT', body: fd });
          box.textContent = done;
          fileInput.value = '';
          after();
        } catch (err) {
          box.textContent = 'تعذر رفع الصورة: ' + err.message;
        } finally { btn.disabled = false; }
      };
      btn.addEventListener('click', run);
      fileInput.addEventListener('change', () => { if (fileInput.files[0]) run(); });
    }

    /* ---------- زر تسجيل دخول الموظفين في رأس الموقع: يُحفظ فور التغيير ---------- */
    function setupLoginButtonToggle() {
      const d = document.getElementById('loginBtnDesktop'), m = document.getElementById('loginBtnMobile');
      const msg = document.getElementById('loginButtonMessage');
      const save = async () => {
        try {
          await api('/api/settings/login-button', { method: 'PUT', body: JSON.stringify({ desktop: d.checked, mobile: m.checked }) });
          msg.textContent = !d.checked && !m.checked ? 'تم: الزر مخفي من الموقع. ادخل لاحقاً من الرابط /login مباشرة.'
            : d.checked && m.checked ? 'تم: الزر ظاهر على الكمبيوتر والجوال.'
            : `تم: الزر ظاهر على ${d.checked ? 'الكمبيوتر' : 'الجوال'} فقط.`;
        } catch (err) { msg.textContent = err.message; }
      };
      d.addEventListener('change', save); m.addEventListener('change', save);
    }

    /* ---------- بطاقة مشاركة الرابط (Open Graph): الصورة والعنوان والرسالة الترحيبية ---------- */
    // نفس القيم الافتراضية في الخادم (shareMeta في server.js) حين لا يُحفظ شيء بعد
    const SHARE_DEFAULTS = {
      image: '/images/share-card.jpg',
      title: 'العمران الذهبية للمقاولات العامة | العمران… ثقة وإتقان',
      description: 'أهلاً بك في العمران الذهبية للمقاولات العامة 👋 نبني للمستقبل بقيمة تدوم: تنفيذ وإدارة المشاريع السكنية والتجارية والصناعية في المملكة منذ 2009. تواصل معنا واطلب عرض سعر لمشروعك.',
    };
    let shareImage = '';

    function fillShareCard(share) {
      shareImage = share.image || '';
      const t = share.title || {}, d = share.description || {};
      document.getElementById('shareTitle-ar').value = t.ar || SHARE_DEFAULTS.title;
      document.getElementById('shareTitle-en').value = t.en || '';
      document.getElementById('shareDesc-ar').value = d.ar || SHARE_DEFAULTS.description;
      document.getElementById('shareDesc-en').value = d.en || '';
      updateSharePreview();
    }

    function updateSharePreview() {
      document.getElementById('sharePreviewImg').src = shareImage || SHARE_DEFAULTS.image;
      document.getElementById('sharePreviewTitle').textContent = document.getElementById('shareTitle-ar').value.trim() || SHARE_DEFAULTS.title;
      document.getElementById('sharePreviewDesc').textContent = document.getElementById('shareDesc-ar').value.trim() || SHARE_DEFAULTS.description;
      document.getElementById('sharePreviewHost').textContent = location.host;
    }

    function setupShareCard() {
      const box = document.getElementById('shareMessage');
      ['shareTitle-ar', 'shareDesc-ar'].forEach(id => document.getElementById(id).addEventListener('input', updateSharePreview));
      bindImageUpload({ input: 'shareImageFile', button: 'shareImageUploadBtn', preset: 'share', endpoint: '/api/settings/share/image', msgBox: 'shareMessage', done: 'تم رفع صورة المشاركة بنجاح.' });
      document.getElementById('shareImageResetBtn').addEventListener('click', async () => {
        if (!shareImage) { box.textContent = 'الصورة الافتراضية مستخدمة حالياً.'; return; }
        if (!confirm('حذف صورة المشاركة المرفوعة والعودة إلى الصورة الافتراضية؟')) return;
        try {
          await api('/api/settings/share/image', { method: 'DELETE' });
          box.textContent = 'تمت استعادة الصورة الافتراضية.';
          loadIdentity();
        } catch (err) { box.textContent = err.message; }
      });
      document.getElementById('saveShareBtn').addEventListener('click', async () => {
        const val = (id) => document.getElementById(id).value.trim();
        const payload = {
          title: { ar: val('shareTitle-ar'), en: val('shareTitle-en') },
          description: { ar: val('shareDesc-ar'), en: val('shareDesc-en') },
        };
        try {
          await api('/api/settings/share', { method: 'PUT', body: JSON.stringify(payload) });
          box.textContent = 'تم حفظ بطاقة المشاركة بنجاح.';
        } catch (err) { box.textContent = err.message; }
      });
    }

    /* ---------- شعار بطاقات المشاريع: رفع مستقل + إظهار/إخفاء ---------- */
    function setupProjectLogo() {
      bindImageUpload({ input: 'projectLogoFile', button: 'projectLogoUploadBtn', preset: 'logo', endpoint: '/api/settings/project-logo', msgBox: 'projectLogoMessage', done: 'تم رفع شعار بطاقات المشاريع، واستُبدل الشعار السابق.' });

      document.getElementById('projectLogoVisible').addEventListener('change', async (e) => {
        const fd = new FormData();
        fd.append('visible', e.target.checked ? 'true' : 'false');
        try {
          await api('/api/settings/project-logo', { method: 'PUT', body: fd });
          showToast(e.target.checked ? 'تم إظهار الشعار في بطاقات المشاريع.' : 'تم إخفاء الشعار من بطاقات المشاريع.');
        } catch (err) {
          showToast(err.message);
          e.target.checked = !e.target.checked; // تراجع عن التغيير في الواجهة إذا فشل الحفظ
        }
      });
    }

    /* ---------- شعار ونص البانر الرئيسي: رفع مستقل + إظهار/إخفاء لكل منهما ---------- */
    function setupBannerLogoAndText() {
      bindImageUpload({ input: 'bannerLogoFile', button: 'bannerLogoUploadBtn', preset: 'logo', endpoint: '/api/settings/banner-logo', msgBox: 'bannerLogoMessage', done: 'تم رفع شعار البانر، واستُبدل الشعار السابق.' });

      document.getElementById('bannerLogoVisible').addEventListener('change', async (e) => {
        const fd = new FormData();
        fd.append('visible', e.target.checked ? 'true' : 'false');
        try {
          await api('/api/settings/banner-logo', { method: 'PUT', body: fd });
          showToast(e.target.checked ? 'تم إظهار شعار البانر.' : 'تم إخفاء شعار البانر.');
        } catch (err) {
          showToast(err.message);
          e.target.checked = !e.target.checked;
        }
      });

      document.getElementById('bannerTextVisible').addEventListener('change', async (e) => {
        try {
          await api('/api/settings/banner-text-visibility', { method: 'PATCH', body: JSON.stringify({ visible: e.target.checked }) });
          showToast(e.target.checked ? 'تم إظهار نص البانر.' : 'تم إخفاء نص البانر.');
        } catch (err) {
          showToast(err.message);
          e.target.checked = !e.target.checked;
        }
      });
    }

    /* =========================================================
       تبويب وسائل التواصل الاجتماعي: مكتبة الأيقونات + القائمة
       + السحب والإفلات لإعادة الترتيب + نافذة الإضافة/التعديل
       ========================================================= */
    const SOCIAL_ICON_LIBRARY = {
      instagram: { nameAr: 'إنستغرام', color: '#E4405F', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zM12 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>` },
      facebook: { nameAr: 'فيسبوك', color: '#1877F2', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.23.19 2.23.19v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12z"/></svg>` },
      twitter: { nameAr: 'X (تويتر)', color: '#000000', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.901 1.153h3.68l-8.04 9.19L24 22.847h-7.406l-5.8-7.584-6.638 7.584H.476l8.6-9.83L0 1.153h7.594l5.243 6.932L18.901 1.153zm-1.29 19.494h2.039L6.486 3.24H4.298L17.611 20.647z"/></svg>` },
      threads: { nameAr: 'ثريدز', color: '#000000', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.523-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.781 3.63 2.695 6.54 2.717 2.623-.02 4.358-.643 5.8-2.08 1.641-1.639 1.611-3.646 1.088-4.878-.31-.73-.873-1.336-1.63-1.772-.192 1.363-.622 2.442-1.284 3.213-.87 1.014-2.093 1.567-3.638 1.645-1.184.06-2.324-.222-3.211-.792-1.048-.673-1.664-1.71-1.735-2.917-.14-2.36 1.755-4.056 4.717-4.226.99-.058 1.918-.014 2.775.13-.114-.685-.345-1.23-.688-1.628-.47-.545-1.196-.822-2.157-.822h-.028c-.775.004-1.833.214-2.502 1.234l-1.732-1.18c.9-1.37 2.373-2.125 4.146-2.128h.037c2.966 0 4.755 1.826 5.13 5.212.221.107.437.221.646.343 1.24.72 2.146 1.808 2.623 3.146.663 1.858.68 4.88-1.756 7.312-1.858 1.855-4.132 2.703-7.373 2.726Zm1.033-11.998c-.135 0-.27.002-.408.01-1.834.104-2.933.973-2.868 2.267.068 1.353 1.362 1.981 2.607 1.915 1.226-.065 2.822-.564 3.086-3.61a8.096 8.096 0 0 0-2.417-.582Z"/></svg>` },
      whatsapp: { nameAr: 'واتساب', color: '#25D366', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347M12 21.785c-1.973 0-3.916-.523-5.6-1.514l-.402-.238-4.166 1.093 1.114-4.06-.263-.415A9.719 9.719 0 0 1 1.238 12c0-5.397 4.393-9.788 9.793-9.788 2.617 0 5.076 1.02 6.923 2.868a9.716 9.716 0 0 1 2.869 6.92c0 5.398-4.393 9.789-9.793 9.789zM12 0C5.373 0 0 5.372 0 12c0 2.116.552 4.184 1.6 6.005L0 24l6.13-1.606A11.94 11.94 0 0 0 12 24c6.627 0 12-5.372 12-12S18.627 0 12 0z"/></svg>` },
      telegram: { nameAr: 'تيليجرام', color: '#26A5E4', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>` },
      youtube: { nameAr: 'يوتيوب', color: '#FF0000', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>` },
      tiktok: { nameAr: 'تيك توك', color: '#000000', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.6 5.82s.51.5 0 0A4.278 4.278 0 0 1 15.54 3h-3.09v12.4a2.592 2.592 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48z"/></svg>` },
      snapchat: { nameAr: 'سناب شات', color: '#FFFC00', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.2c2.8 0 5.1 2.2 5.1 5v2.2c0 .4.2.7.6.9.6.3 1.2.6 1.6 1 .3.3.4.7.2 1.1-.3.5-.9.8-1.7 1 .5.8 1.3 1.3 2.3 1.5.4.1.6.4.5.8-.2.8-1.3 1.3-2.5 1.4-.5.1-.8.3-.9.7-.2 1.2-1.4 2-2.7 1.7-.5-.1-1-.3-1.5-.7-.5.4-1 .6-1.5.7-1.3.3-2.5-.5-2.7-1.7-.1-.4-.4-.6-.9-.7-1.2-.1-2.3-.6-2.5-1.4-.1-.4.1-.7.5-.8 1-.2 1.8-.7 2.3-1.5-.8-.2-1.4-.5-1.7-1-.2-.4-.1-.8.2-1.1.4-.4 1-.7 1.6-1 .4-.2.6-.5.6-.9V7.2c0-2.8 2.3-5 5.1-5z"/></svg>` },
      linkedin: { nameAr: 'لينكدإن', color: '#0A66C2', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452H16.89v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.346V9h3.414v1.561h.049c.476-.9 1.637-1.85 3.37-1.85 3.604 0 4.268 2.372 4.268 5.456v6.285zM5.337 7.433a2.063 2.063 0 1 1 0-4.126 2.063 2.063 0 0 1 0 4.126zM7.119 20.452H3.555V9h3.564v11.452z"/></svg>` },
      pinterest: { nameAr: 'بينترست', color: '#E60023', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.237 2.648 7.856 6.38 9.316-.088-.79-.168-2.004.035-2.869.183-.781 1.172-4.978 1.172-4.978s-.298-.597-.298-1.48c0-1.388.805-2.425 1.808-2.425.852 0 1.263.638 1.263 1.404 0 .856-.545 2.135-.827 3.322-.236.992.498 1.802 1.476 1.802 1.771 0 3.132-1.867 3.132-4.56 0-2.384-1.715-4.05-4.163-4.05-2.836 0-4.5 2.126-4.5 4.325 0 .856.329 1.773.739 2.271a.298.298 0 0 1 .069.285c-.076.315-.247.991-.281 1.129-.044.182-.146.221-.338.134-1.263-.586-2.051-2.428-2.051-3.906 0-3.18 2.31-6.098 6.661-6.098 3.497 0 6.215 2.492 6.215 5.823 0 3.474-2.191 6.27-5.231 6.27-1.021 0-1.982-.53-2.309-1.157l-.628 2.392c-.227.87-.841 1.961-1.252 2.626.942.291 1.946.448 2.985.448 5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>` },
      discord: { nameAr: 'ديسكورد', color: '#5865F2', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.055c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>` },
      reddit: { nameAr: 'ريديت', color: '#FF4500', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.612.612-1.847.827-2.512.827-.665 0-1.9-.215-2.512-.827a.326.326 0 0 0-.232-.094z"/></svg>` },
      behance: { nameAr: 'بيهانس', color: '#1769FF', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 7h6a3 3 0 0 1 0 6H2z M2 13h6.5a3 3 0 0 1 0 6H2z M15 12a4.5 4.5 0 1 1 9 .3c0 .2 0 .4 0 .5h-7 M15.5 7h5.5"/></svg>` },
      dribbble: { nameAr: 'دريبل', color: '#EA4C89', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.372 0 0 5.372 0 12s5.372 12 12 12 12-5.372 12-12S18.628 0 12 0zm9.885 11.441c-.117-.023-4.633-.977-9.174-.394-.36-.783-.727-1.55-1.106-2.302 4.848-2.135 6.858-5.191 6.883-5.24a10.35 10.35 0 0 1 3.397 7.936zM12 1.769c2.298 0 4.407.82 6.049 2.183-.017.024-1.937 2.878-6.582 4.783C9.257 5.02 6.976 2.288 6.63 1.888 8.253 1.187 10.076.9 12 1.769zm-6.917.667c.28.317 2.529 2.958 4.807 6.567-6.09 1.622-11.464 1.591-11.994 1.581A10.44 10.44 0 0 1 5.083 2.436zM1.13 12.008c0-.11.006-.219.01-.328.526.011 6.786.088 13.274-1.822.372.723.72 1.457 1.043 2.194-.169.048-.336.098-.5.152C8.244 14 5.294 20.157 5.023 20.744A10.4 10.4 0 0 1 1.13 12.008zm11.887 10.29a10.3 10.3 0 0 1-6.115-1.987c.226-.457 2.34-4.635 8.916-6.783a.05.05 0 0 1 .02-.006c1.535 3.921 2.156 7.209 2.312 8.135a10.4 10.4 0 0 1-5.133 2.641zm6.6-3.62c-.111-.66-.7-3.822-2.132-7.681 4.28-.68 8.03.427 8.435.55a10.463 10.463 0 0 1-6.303 7.13z"/></svg>` },
      github: { nameAr: 'جيت هب', color: '#181717', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>` },
      gitlab: { nameAr: 'جيت لاب', color: '#FC6D26', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.955 13.587l-1.342-4.135-2.664-8.189a.455.455 0 0 0-.867 0L16.418 9.45H7.582L4.918 1.263a.455.455 0 0 0-.867 0L1.386 9.45.044 13.587a.924.924 0 0 0 .331 1.023l11.507 8.335a.492.492 0 0 0 .586 0l11.507-8.335a.924.924 0 0 0 .331-1.023"/></svg>` },
      vimeo: { nameAr: 'فيميو', color: '#1AB7EA', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M22.396 7.164c-.093 2.026-1.507 4.8-4.245 8.32-2.83 3.68-5.226 5.52-7.187 5.52-1.215 0-2.24-1.122-3.08-3.368-.56-2.052-1.118-4.104-1.68-6.157-.622-2.246-1.29-3.368-2.004-3.368-.156 0-.7.328-1.635.98l-.98-1.26a300 300 0 0 0 3.032-2.706c1.372-1.184 2.402-1.81 3.09-1.876 1.624-.156 2.624.954 3 3.33.404 2.563.685 4.157.84 4.782.466 2.11 1.005 3.163 1.618 3.163.475 0 1.19-.751 2.146-2.253.955-1.503 1.466-2.646 1.537-3.435.14-1.301-.376-1.953-1.537-1.953-.549 0-1.113.126-1.692.375 1.124-3.68 3.27-5.47 6.438-5.372 2.35.073 3.458 1.591 3.328 4.556z"/></svg>` },
      twitch: { nameAr: 'تويتش', color: '#9146FF', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0 1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/></svg>` },
      spotify: { nameAr: 'سبوتيفاي', color: '#1DB954', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.48.12-1.021-.12-1.141-.6-.12-.48.12-1.02.6-1.14 4.32-1.32 9.719-.66 13.379 1.62.361.181.54.78.24 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.6.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>` },
      soundcloud: { nameAr: 'ساوند كلاود', color: '#FF5500', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M1.175 12.225c-.051 0-.094.046-.101.104l-.233 2.154.233 2.105c.007.058.05.104.101.104.05 0 .09-.046.099-.104l.255-2.105-.255-2.154c-.009-.058-.05-.104-.099-.104M0 12.283c-.049 0-.085.046-.085.104l-.007 2.037.007 2.017c0 .058.036.104.085.104.048 0 .085-.046.085-.104l.009-2.017-.009-2.037c0-.058-.037-.104-.085-.104m4.703-1.8c-.081 0-.144.06-.153.145l-.219 3.751.219 3.633c.009.084.072.144.153.144.081 0 .144-.06.153-.144l.246-3.633-.246-3.751c-.009-.084-.072-.145-.153-.145m1.216-.183c-.09 0-.162.072-.171.162l-.211 3.933.211 3.807c.009.09.081.162.171.162.09 0 .162-.072.171-.162l.235-3.807-.235-3.933c-.009-.09-.081-.162-.171-.162m8.6-1.194a5.53 5.53 0 0 0-2.32.51 6.617 6.617 0 0 0-11.6 1.05 3.87 3.87 0 0 0-.7-.06c-2.1 0-3.8 1.7-3.8 3.8s1.7 3.8 3.8 3.8h14.62a3.51 3.51 0 0 0 3.5-3.55c0-3.087-2.5-5.55-3.5-5.55z"/></svg>` },
      medium: { nameAr: 'ميديوم', color: '#000000', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.54 12a6.8 6.8 0 0 1-6.77 6.82A6.8 6.8 0 0 1 0 12a6.8 6.8 0 0 1 6.77-6.82A6.8 6.8 0 0 1 13.54 12zM20.96 12c0 3.54-1.51 6.42-3.38 6.42-1.87 0-3.38-2.88-3.38-6.42s1.51-6.42 3.38-6.42 3.38 2.88 3.38 6.42M24 12c0 3.17-.53 5.75-1.19 5.75-.66 0-1.19-2.58-1.19-5.75s.53-5.75 1.19-5.75C23.47 6.25 24 8.83 24 12z"/></svg>` },
      figma: { nameAr: 'فيجما', color: '#F24E1E', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 24c2.208 0 4-1.792 4-4v-4H8c-2.208 0-4 1.792-4 4s1.792 4 4 4zM4 12c0-2.208 1.792-4 4-4h4v8H8c-2.208 0-4-1.792-4-4zM4 4c0-2.208 1.792-4 4-4h4v8H8C5.792 8 4 6.208 4 4zM12 0h4c2.208 0 4 1.792 4 4s-1.792 4-4 4h-4V0zM20 12c0 2.208-1.792 4-4 4s-4-1.792-4-4 1.792-4 4-4 4 1.792 4 4z"/></svg>` },
      email: { nameAr: 'بريد إلكتروني', color: '#6B7280', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>` },
      website: { nameAr: 'موقع إلكتروني', color: '#6B7280', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24zm7.94 8h-3.19a15.9 15.9 0 0 0-1.4-4.16A8.03 8.03 0 0 1 19.94 8zM12 2.04c.83 1.2 1.66 2.8 2.14 5.96H9.86c.48-3.16 1.31-4.76 2.14-5.96zM2.26 14a7.9 7.9 0 0 1 0-4h3.7a16.5 16.5 0 0 0 0 4h-3.7zm.8 2h3.19a15.9 15.9 0 0 0 1.4 4.16A8.03 8.03 0 0 1 3.06 16zm3.19-8H3.06a8.03 8.03 0 0 1 4.6-4.16A15.9 15.9 0 0 0 6.26 8zM12 21.96c-.83-1.2-1.66-2.8-2.14-5.96h4.28c-.48 3.16-1.31 4.76-2.14 5.96zM14.36 14H9.64a14.5 14.5 0 0 1 0-4h4.72a14.5 14.5 0 0 1 0 4zm.29 6.16a15.9 15.9 0 0 0 1.4-4.16h3.19a8.03 8.03 0 0 1-4.6 4.16zM18.04 14a16.5 16.5 0 0 0 0-4h3.7a7.9 7.9 0 0 1 0 4h-3.7z"/></svg>` },
      rss: { nameAr: 'RSS', color: '#FFA500', svg: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4a16 16 0 0 1 16 16h-3.5A12.5 12.5 0 0 0 4 7.5V4zm0 6.5A9.5 9.5 0 0 1 13.5 20H10a6 6 0 0 0-6-6v-3.5zM6.18 17.82a1.82 1.82 0 1 1-3.64 0 1.82 1.82 0 0 1 3.64 0z"/></svg>` },
    };
    const SOCIAL_ICON_NAMES = Object.fromEntries(Object.entries(SOCIAL_ICON_LIBRARY).map(([k, v]) => [k, v.nameAr]));
    SOCIAL_ICON_NAMES.custom = 'مخصص (SVG)';
    SOCIAL_ICON_NAMES.upload = 'رفع صورة';
    const SOCIAL_SHAPE_LABELS = { circle: 'دائرة', square: 'مربع', rounded: 'مربع دائري' };
    const SOCIAL_SHADOW_LABELS = { none: 'بدون ظل', light: 'خفيف', medium: 'متوسط', strong: 'قوي' };
    const SOCIAL_STATUS_LABELS = { visible: '🟢 ظاهر', hidden: '🟡 مخفي مؤقتاً', disabled: '🔴 معطّل' };

    function socialShapeRadius(shape) {
      return shape === 'circle' ? '50%' : shape === 'square' ? '4px' : '13px';
    }
    function socialShadowCss(level) {
      return { none: 'none', light: '0 4px 10px rgba(0,0,0,.15)', medium: '0 6px 16px rgba(0,0,0,.28)', strong: '0 10px 26px rgba(0,0,0,.4)' }[level] || 'none';
    }
    function socialIconMarkup(p) {
      if (p.iconKey === 'upload' && p.iconImageUrl) {
        return `<img src="${p.iconImageUrl}" alt="" style="width:100%;height:100%;object-fit:cover;">`;
      }
      if (p.iconKey === 'custom' && p.customSvg) return p.customSvg;
      return (SOCIAL_ICON_LIBRARY[p.iconKey] || SOCIAL_ICON_LIBRARY.website).svg;
    }
    function socialPreviewStyle(p) {
      const border = p.borderEnabled ? `border:${p.borderWidth || 1}px solid ${p.borderColor || '#ffffff'};` : 'border:none;';
      return `border-radius:${socialShapeRadius(p.shape)};background:${p.bgColor};color:${p.iconColor};box-shadow:${socialShadowCss(p.shadow)};${border}box-sizing:border-box;overflow:hidden;`;
    }

    let socialCache = [];
    let socialSearchText = '';

    async function loadSocialPlatforms() {
      try {
        const data = await api('/api/social');
        socialCache = data.items || [];
        renderSocialList();
        document.getElementById('socialCount').textContent = `${socialCache.length} منصة`;
      } catch (err) {
        document.getElementById('socialList').innerHTML = `<p class="muted">تعذر تحميل المنصات: ${escapeHtml(err.message)}</p>`;
      }
    }

    function renderSocialList() {
      const container = document.getElementById('socialList');
      const filtered = socialCache.filter(p => p.name.toLowerCase().includes(socialSearchText.toLowerCase()));
      if (!filtered.length) {
        container.innerHTML = '<p class="muted">لا توجد منصات مطابقة.</p>';
        return;
      }
      container.innerHTML = '';
      filtered.forEach(p => {
        const row = el(`
          <div class="social-row" draggable="true" data-id="${p.id}">
            <span class="social-row-handle" title="اسحب لإعادة الترتيب">☰</span>
            <div class="social-row-icon" style="${socialPreviewStyle(p)}">${socialIconMarkup(p)}</div>
            <div class="social-row-main">
              <div class="social-row-name">${escapeHtml(p.name)}</div>
              <div class="social-row-meta">
                <span><span class="social-status-dot"></span> ${SOCIAL_STATUS_LABELS[p.status] || p.status}</span>
                <span>${SOCIAL_SHAPE_LABELS[p.shape] || p.shape}</span>
                ${p.showHeader ? '<span>الهيدر</span>' : ''}
                ${p.showFooter ? '<span>الفوتر</span>' : ''}
                ${!p.showDesktop ? '<span>مخفي بالكمبيوتر</span>' : ''}
                ${!p.showMobile ? '<span>مخفي بالجوال</span>' : ''}
              </div>
            </div>
            <div class="social-row-clicks"><strong>${p.clicks || 0}</strong>نقرة</div>
            <div class="social-row-actions">
              <button type="button" class="chip-btn sr-edit">تعديل</button>
              <button type="button" class="chip-btn sr-dup">نسخ</button>
              <button type="button" class="chip-btn danger sr-del">حذف</button>
            </div>
          </div>
        `);
        row.querySelector('.sr-edit').addEventListener('click', () => openSocialForm(p));
        row.querySelector('.sr-dup').addEventListener('click', () => duplicateSocialPlatform(p.id));
        row.querySelector('.sr-del').addEventListener('click', () => deleteSocialPlatform(p.id, p.name));
        container.appendChild(row);
      });
      bindSocialDragDrop(container);
    }

    function setupSocialSearch() {
      document.getElementById('socialSearch').addEventListener('input', (e) => {
        socialSearchText = e.target.value.trim();
        renderSocialList();
      });
    }

    function bindSocialDragDrop(container) {
      let draggedEl = null;
      container.querySelectorAll('.social-row').forEach(row => {
        row.addEventListener('dragstart', () => {
          draggedEl = row;
          row.classList.add('dragging');
        });
        row.addEventListener('dragend', () => {
          row.classList.remove('dragging');
          container.querySelectorAll('.social-row').forEach(r => r.classList.remove('drag-over'));
        });
        row.addEventListener('dragover', (e) => {
          e.preventDefault();
          if (row !== draggedEl) row.classList.add('drag-over');
        });
        row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
        row.addEventListener('drop', async (e) => {
          e.preventDefault();
          row.classList.remove('drag-over');
          if (!draggedEl || row === draggedEl) return;
          const rows = Array.from(container.querySelectorAll('.social-row'));
          const fromIdx = rows.indexOf(draggedEl);
          const toIdx = rows.indexOf(row);
          if (fromIdx < toIdx) row.after(draggedEl); else row.before(draggedEl);

          const orderedIds = Array.from(container.querySelectorAll('.social-row')).map(r => parseInt(r.dataset.id, 10));
          try {
            await api('/api/social/reorder', { method: 'POST', body: JSON.stringify({ ids: orderedIds }) });
            loadSocialPlatforms();
          } catch (err) { showToast(err.message); }
        });
      });
    }

    async function duplicateSocialPlatform(id) {
      try {
        await api(`/api/social/${id}/duplicate`, { method: 'POST' });
        showToast('تم نسخ المنصة.');
        loadSocialPlatforms();
      } catch (err) { showToast(err.message); }
    }

    function deleteSocialPlatform(id, name) {
      askConfirm('حذف المنصة', `هل تريد حذف منصة "${name}" نهائياً؟`, async () => {
        try {
          await api(`/api/social/${id}`, { method: 'DELETE' });
          showToast('تم حذف المنصة.');
          loadSocialPlatforms();
        } catch (err) { showToast(err.message); }
      });
    }

    function setupSocialAdd() {
      document.getElementById('addSocialBtn').addEventListener('click', () => openSocialForm(null));
    }

    function setupSocialExportImport() {
      document.getElementById('exportSocialBtn').addEventListener('click', async () => {
        try {
          const data = await api('/api/social/export');
          const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'social-platforms-export.json';
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          showToast('تم تنزيل النسخة الاحتياطية بنجاح.');
        } catch (err) { showToast(err.message); }
      });

      const importInput = document.getElementById('importSocialFile');
      document.getElementById('importSocialBtn').addEventListener('click', () => importInput.click());
      importInput.addEventListener('change', () => {
        const file = importInput.files[0];
        if (!file) return;
        askConfirm('استيراد نسخة احتياطية', 'سيتم استبدال كل منصات التواصل الحالية بمحتوى الملف المرفوع. هل تريد المتابعة؟', async () => {
          try {
            const text = await file.text();
            const data = JSON.parse(text);
            await api('/api/social/import', { method: 'POST', body: JSON.stringify(data) });
            showToast('تم استيراد النسخة الاحتياطية بنجاح.');
            loadSocialPlatforms();
          } catch (err) {
            showToast('تعذر الاستيراد: ' + (err.message || 'ملف غير صالح.'));
          } finally {
            importInput.value = '';
          }
        });
      });
    }

    function openSocialForm(platform) {
      const isNew = !platform;
      const p = platform || {
        name: '', url: '', iconKey: 'instagram', customSvg: '', iconImageUrl: '',
        shape: 'circle', bgColor: '#ffffff', iconColor: '#4a4e53', shadow: 'light',
        borderEnabled: true, borderColor: '#dddddd', borderWidth: 1, status: 'visible',
        showHeader: false, showFooter: true, showDesktop: true, showMobile: true,
      };

      const overlay = el(`
        <div class="modal-overlay">
          <div class="modal-box" style="max-width:900px;">
            <h3>${isNew ? 'إضافة منصة جديدة' : 'تعديل: ' + escapeHtml(p.name)}</h3>
            <div class="social-form-grid">
              <div>
                <div class="form-field">
                  <label>اسم المنصة</label>
                  <input type="text" id="sf-name" value="${escapeAttr(p.name)}" placeholder="مثال: إنستغرام">
                </div>
                <div class="form-field">
                  <label>الرابط</label>
                  <input type="text" id="sf-url" value="${escapeAttr(p.url)}" placeholder="https://instagram.com/yourpage">
                </div>

                <div class="form-field">
                  <label>الأيقونة</label>
                  <select id="sf-icon-key">
                    ${Object.entries(SOCIAL_ICON_NAMES).map(([k, name]) =>
                      `<option value="${k}" ${p.iconKey === k ? 'selected' : ''}>${escapeHtml(name)}</option>`
                    ).join('')}
                  </select>
                  <div class="icon-grid" id="sf-icon-grid"></div>
                </div>
                <div class="form-field" id="sf-custom-svg-field" style="display:${p.iconKey === 'custom' ? '' : 'none'};">
                  <label>كود SVG مخصص</label>
                  <textarea id="sf-custom-svg" rows="3" placeholder="&lt;svg viewBox=&quot;0 0 24 24&quot;&gt;...&lt;/svg&gt;">${escapeHtml(p.customSvg || '')}</textarea>
                </div>
                <div class="form-field" id="sf-upload-field" style="display:${p.iconKey === 'upload' ? '' : 'none'};">
                  <label>رفع صورة الأيقونة</label>
                  <input type="file" id="sf-upload-file" accept="image/png,image/jpeg,image/webp,image/svg+xml">
                  <input type="hidden" id="sf-icon-image-url" value="${escapeAttr(p.iconImageUrl || '')}">
                </div>

                <div class="form-field">
                  <label>الشكل</label>
                  <select id="sf-shape">
                    ${Object.entries(SOCIAL_SHAPE_LABELS).map(([k, l]) => `<option value="${k}" ${p.shape === k ? 'selected' : ''}>${l}</option>`).join('')}
                  </select>
                </div>

                <div class="form-field">
                  <label>لون الخلفية</label>
                  <div class="color-input-row">
                    <input type="color" id="sf-bg-color-picker" value="${p.bgColor}">
                    <input type="text" id="sf-bg-color" value="${escapeAttr(p.bgColor)}">
                  </div>
                </div>
                <div class="form-field">
                  <label>لون الأيقونة</label>
                  <div class="color-input-row">
                    <input type="color" id="sf-icon-color-picker" value="${p.iconColor}">
                    <input type="text" id="sf-icon-color" value="${escapeAttr(p.iconColor)}">
                  </div>
                </div>
                <button type="button" class="btn btn-outline btn-sm" id="sf-use-official" style="width:auto;">🎨 استخدم اللون الرسمي للمنصة</button>

                <div class="form-field" style="margin-top:10px;">
                  <label>مستوى الظل</label>
                  <select id="sf-shadow">
                    ${Object.entries(SOCIAL_SHADOW_LABELS).map(([k, l]) => `<option value="${k}" ${p.shadow === k ? 'selected' : ''}>${l}</option>`).join('')}
                  </select>
                </div>

                <label class="perm-check"><input type="checkbox" id="sf-border-enabled" ${p.borderEnabled ? 'checked' : ''}> إظهار إطار</label>
                <div class="form-grid" style="margin-top:6px;">
                  <div class="form-field">
                    <label>لون الإطار</label>
                    <div class="color-input-row">
                      <input type="color" id="sf-border-color-picker" value="${p.borderColor}">
                      <input type="text" id="sf-border-color" value="${escapeAttr(p.borderColor)}">
                    </div>
                  </div>
                  <div class="form-field">
                    <label>سمك الإطار (px)</label>
                    <input type="number" id="sf-border-width" min="0" max="8" value="${p.borderWidth}">
                  </div>
                </div>

                <div class="form-field" style="margin-top:10px;">
                  <label>الحالة</label>
                  <select id="sf-status">
                    ${Object.entries(SOCIAL_STATUS_LABELS).map(([k, l]) => `<option value="${k}" ${p.status === k ? 'selected' : ''}>${l}</option>`).join('')}
                  </select>
                </div>

                <label style="display:block; margin:10px 0 4px; font-weight:600; font-size:13px;">مكان الظهور</label>
                <div class="visibility-grid">
                  <label class="perm-check"><input type="checkbox" id="sf-show-header" ${p.showHeader ? 'checked' : ''}> رأس الصفحة</label>
                  <label class="perm-check"><input type="checkbox" id="sf-show-footer" ${p.showFooter ? 'checked' : ''}> تذييل الصفحة</label>
                  <label class="perm-check"><input type="checkbox" id="sf-show-desktop" ${p.showDesktop ? 'checked' : ''}> الكمبيوتر</label>
                  <label class="perm-check"><input type="checkbox" id="sf-show-mobile" ${p.showMobile ? 'checked' : ''}> الجوال</label>
                </div>
              </div>

              <div class="social-preview-box">
                <span style="font-size:12px; color:var(--muted);">معاينة حية</span>
                <div class="social-preview-icon" id="sf-preview"></div>
                <span id="sf-preview-name" style="font-weight:700; font-size:13px;">${escapeHtml(p.name || 'اسم المنصة')}</span>
              </div>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-outline" id="sfCancel">إلغاء</button>
              <button type="button" class="btn btn-dark" id="sfSave">${isNew ? 'إضافة المنصة' : 'حفظ التعديلات'}</button>
            </div>
          </div>
        </div>
      `);
      document.body.appendChild(overlay);

      function currentFormState() {
        return {
          name: overlay.querySelector('#sf-name').value.trim(),
          url: overlay.querySelector('#sf-url').value.trim(),
          iconKey: overlay.querySelector('#sf-icon-key').value,
          customSvg: overlay.querySelector('#sf-custom-svg').value.trim(),
          iconImageUrl: overlay.querySelector('#sf-icon-image-url').value.trim(),
          shape: overlay.querySelector('#sf-shape').value,
          bgColor: overlay.querySelector('#sf-bg-color').value.trim(),
          iconColor: overlay.querySelector('#sf-icon-color').value.trim(),
          shadow: overlay.querySelector('#sf-shadow').value,
          borderEnabled: overlay.querySelector('#sf-border-enabled').checked,
          borderColor: overlay.querySelector('#sf-border-color').value.trim(),
          borderWidth: parseInt(overlay.querySelector('#sf-border-width').value, 10) || 0,
          status: overlay.querySelector('#sf-status').value,
          showHeader: overlay.querySelector('#sf-show-header').checked,
          showFooter: overlay.querySelector('#sf-show-footer').checked,
          showDesktop: overlay.querySelector('#sf-show-desktop').checked,
          showMobile: overlay.querySelector('#sf-show-mobile').checked,
        };
      }

      function refreshPreview() {
        const state = currentFormState();
        overlay.querySelector('#sf-preview').innerHTML = socialIconMarkup(state);
        overlay.querySelector('#sf-preview').setAttribute('style', socialPreviewStyle(state));
        overlay.querySelector('#sf-preview-name').textContent = state.name || 'اسم المنصة';
        overlay.querySelector('#sf-custom-svg-field').style.display = state.iconKey === 'custom' ? '' : 'none';
        overlay.querySelector('#sf-upload-field').style.display = state.iconKey === 'upload' ? '' : 'none';
      }

      function renderIconGrid() {
        const grid = overlay.querySelector('#sf-icon-grid');
        grid.innerHTML = Object.entries(SOCIAL_ICON_LIBRARY).map(([key, def]) => `
          <div class="icon-grid-item${overlay.querySelector('#sf-icon-key').value === key ? ' is-selected' : ''}" data-key="${key}" title="${escapeAttr(def.nameAr)}">${def.svg}</div>
        `).join('');
        grid.querySelectorAll('.icon-grid-item').forEach(item => {
          item.addEventListener('click', () => {
            overlay.querySelector('#sf-icon-key').value = item.dataset.key;
            grid.querySelectorAll('.icon-grid-item').forEach(i => i.classList.remove('is-selected'));
            item.classList.add('is-selected');
            refreshPreview();
          });
        });
      }
      renderIconGrid();

      // مزامنة منتقي اللون النصي مع منتقي اللون المرئي (color input)
      [['bg-color'], ['icon-color'], ['border-color']].forEach(([base]) => {
        const picker = overlay.querySelector(`#sf-${base}-picker`);
        const text = overlay.querySelector(`#sf-${base}`);
        picker.addEventListener('input', () => { text.value = picker.value; refreshPreview(); });
        text.addEventListener('input', () => { if (/^#[0-9a-fA-F]{3,6}$/.test(text.value)) picker.value = text.value; refreshPreview(); });
      });

      overlay.querySelector('#sf-icon-key').addEventListener('change', () => {
        renderIconGrid();
        refreshPreview();
      });
      overlay.querySelectorAll('#sf-shape, #sf-shadow, #sf-status').forEach(elm => elm.addEventListener('change', refreshPreview));
      overlay.querySelector('#sf-border-enabled').addEventListener('change', refreshPreview);
      overlay.querySelector('#sf-border-width').addEventListener('input', refreshPreview);
      overlay.querySelector('#sf-custom-svg').addEventListener('input', refreshPreview);
      overlay.querySelector('#sf-name').addEventListener('input', refreshPreview);

      overlay.querySelector('#sf-use-official').addEventListener('click', () => {
        const key = overlay.querySelector('#sf-icon-key').value;
        const def = SOCIAL_ICON_LIBRARY[key];
        if (!def) { showToast('اختر أيقونة من المكتبة أولاً.'); return; }
        overlay.querySelector('#sf-bg-color').value = def.color;
        overlay.querySelector('#sf-bg-color-picker').value = def.color;
        overlay.querySelector('#sf-icon-color').value = '#ffffff';
        overlay.querySelector('#sf-icon-color-picker').value = '#ffffff';
        refreshPreview();
      });

      overlay.querySelector('#sf-upload-file').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const fd = new FormData();
          const img = await compressImage(file, 'icon');
          fd.append('image', img, img.name);
          const data = await api('/api/social/upload-icon', { method: 'PUT', body: fd });
          if (data.iconImageUrl) {
            overlay.querySelector('#sf-icon-image-url').value = data.iconImageUrl;
            refreshPreview();
          }
        } catch (err) { showToast('تعذر رفع الصورة: ' + err.message); }
      });

      overlay.querySelector('#sfCancel').addEventListener('click', () => overlay.remove());
      overlay.querySelector('#sfSave').addEventListener('click', async () => {
        const payload = currentFormState();
        if (!payload.name) { showToast('اسم المنصة مطلوب.'); return; }
        try {
          if (isNew) {
            await api('/api/social', { method: 'POST', body: JSON.stringify(payload) });
            showToast('تمت إضافة المنصة بنجاح.');
          } else {
            await api(`/api/social/${platform.id}`, { method: 'PUT', body: JSON.stringify(payload) });
            showToast('تم حفظ التعديلات.');
          }
          overlay.remove();
          loadSocialPlatforms();
        } catch (err) { showToast(err.message); }
      });

      refreshPreview();
    }

    /* ---------- تنظيف نصوص بسيط لمنع أي حقن HTML من بيانات مخزّنة ---------- */
    function escapeHtml(str) {
      return String(str).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      }[c]));
    }
    function escapeAttr(str) { return escapeHtml(str); }

    /* ---------- مركز المحادثات: الرد المباشر مع موظف واحد لكل محادثة ---------- */
    let chatDesk = { me: null, list: [], openId: null, filter: 'active', listTimer: null, convTimer: null, lastRenderKey: '' };
    const chatTabActive = () => document.getElementById('tab-chat')?.classList.contains('is-active') && !document.hidden;
    function chatTime(iso) { try { return new Date(iso).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }); } catch (_) { return ''; } }
    function chatAgo(iso) {
      if (!iso) return 'لم يظهر بعد';
      const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
      return m < 1 ? 'قبل لحظات' : m < 60 ? `قبل ${m} دقيقة` : m < 1440 ? `قبل ${Math.round(m / 60)} ساعة` : new Date(iso).toLocaleDateString('ar-SA');
    }
    // علامات رسائل الفريق والمساعد: ✓ تم الإرسال، ✓✓ تم الاستلام، ✓✓ ملونة تمت القراءة
    function chatTicks(status) {
      const label = { sent: 'تم الإرسال', delivered: 'تم الاستلام', read: 'تمت القراءة' }[status];
      if (!label) return '';
      const second = status === 'sent' ? '' : '<path d="M8.4 8.6l1.4 1.4L16.5 2.5"/>';
      return `<svg class="chat-ticks is-${status}" viewBox="0 0 18 12" role="img" aria-label="${label}"><title>${label}</title><path d="M1.2 6.4l3.6 3.6L11.5 2.5"/>${second}</svg>`;
    }
    function assigneeBadge(c) {
      if (!c.assignee) return c.mode === 'human' ? '<span class="chat-badge chat-badge-wait">بانتظار موظف</span>' : '<span class="chat-badge">المساعد الذكي</span>';
      if (c.assignee.me) return '<span class="chat-badge chat-badge-me">محادثتك</span>';
      return `<span class="chat-badge chat-badge-other">يرد: ${escapeHtml(c.assignee.name)}${c.assignee.online ? '' : ' (غير متصل)'}</span>`;
    }
    function renderChatList() {
      const box = document.getElementById('chatAdminList');
      let list = chatDesk.list;
      if (chatDesk.filter === 'active') list = list.filter(c => c.status !== 'closed');
      if (chatDesk.filter === 'mine') list = list.filter(c => c.assignee?.me);
      // المتصلون أولاً، ثم من ينتظر موظفاً، ثم الأحدث
      list = list.slice().sort((a, b) => (b.customerOnline - a.customerOnline) || ((b.mode === 'human' && !b.assignee) - (a.mode === 'human' && !a.assignee)) || (Date.parse(b.updatedAt) - Date.parse(a.updatedAt)));
      box.innerHTML = list.length ? list.map(c => `
        <button type="button" class="chat-item${c.id === chatDesk.openId ? ' is-open' : ''}" data-conv="${escapeHtml(c.id)}">
          <span class="chat-item-top">
            <span class="chat-dot ${c.customerOnline ? 'on' : ''}" title="${c.customerOnline ? 'العميل متصل الآن' : 'غير متصل'}"></span>
            <strong>${escapeHtml(c.customer?.name || 'زائر')}</strong>
            ${c.unreadForStaff ? `<span class="chat-unread">${c.unreadForStaff}</span>` : ''}
            <small>${chatTime(c.lastMessage?.createdAt || c.updatedAt)}</small>
          </span>
          <span class="chat-item-last">${['ai', 'human'].includes(c.lastMessage?.sender) ? chatTicks(c.lastMessage.status) + ' ' : ''}${escapeHtml(c.lastMessage?.text || '')}</span>
          <span class="chat-item-meta">${assigneeBadge(c)}${c.status === 'closed' ? '<span class="chat-badge">مغلقة</span>' : ''}</span>
        </button>`).join('') : '<p class="muted">لا توجد محادثات في هذا التصنيف.</p>';
      box.querySelectorAll('[data-conv]').forEach(b => b.onclick = () => openChat(b.dataset.conv));
    }
    async function loadChatList() {
      try {
        const [d, stats] = await Promise.all([api('/api/chat/admin'), api('/api/chat/admin-analytics')]);
        chatDesk.me = d.me; chatDesk.list = d.conversations;
        document.getElementById('chatStaffOnline').innerHTML = d.onlineStaff.length
          ? `<span class="chat-dot on"></span> متصل من الفريق: ${d.onlineStaff.map(x => escapeHtml(x.name)).join('، ')}` : '';
        const online = d.conversations.filter(c => c.customerOnline).length;
        const waiting = d.conversations.filter(c => c.mode === 'human' && !c.assignee && c.status !== 'closed').length;
        document.getElementById('chatAnalytics').innerHTML = [
          [online, 'عملاء متصلون الآن'], [waiting, 'بانتظار موظف'], [stats.total, 'كل المحادثات'], [stats.transferred, 'محولة للموظفين'],
        ].map(([n, l]) => `<div class="overview-stat-card"><span class="overview-stat-num">${n}</span><span class="overview-stat-label">${l}</span></div>`).join('');
        renderChatList();
      } catch (e) { document.getElementById('chatAdminList').innerHTML = `<p class="muted">تعذر تحميل المحادثات: ${escapeHtml(e.message)}</p>`; }
    }
    function chatSenderLabel(m, conv) {
      if (m.sender === 'customer') return escapeHtml(conv.customer?.name || 'العميل');
      if (m.sender === 'human') return escapeHtml(m.staffName || 'موظف');
      if (m.sender === 'system') return 'النظام';
      return 'المساعد الذكي';
    }
    function renderChatView(d, force) {
      const c = d.conversation; const view = document.getElementById('chatDeskView');
      const key = JSON.stringify([c.messages.length, c.messages[c.messages.length - 1]?.id, c.messages.map(m => m.status || '').join(), d.assignee, d.customerOnline, d.canReply, c.status, c.mode]);
      if (!force && key === chatDesk.lastRenderKey) return;
      chatDesk.lastRenderKey = key;
      const draft = document.getElementById('chatReplyText')?.value || '';
      const me = chatDesk.me || {};
      const mine = d.assignee?.me;
      const lockedOther = d.assignee && !d.assignee.me && d.assignee.online;
      const actions = [];
      if (me.canReply && !mine && !lockedOther) actions.push('<button type="button" class="btn btn-dark btn-sm" data-chat-act="claim">استلام المحادثة</button>');
      if (me.canReply && lockedOther && me.isAdmin) actions.push('<button type="button" class="btn btn-outline btn-sm" data-chat-act="takeover">نقل المحادثة إليّ</button>');
      if (mine) actions.push('<button type="button" class="btn btn-outline btn-sm" data-chat-act="release">تحرير المحادثة</button>');
      if (me.canReply && (mine || (me.isAdmin && d.assignee) || (!d.assignee && c.mode === 'human'))) actions.push('<button type="button" class="btn btn-outline btn-sm" data-chat-act="ai">إعادة للمساعد الذكي</button>');
      if (me.canReply && c.status !== 'closed' && (!lockedOther || me.isAdmin)) actions.push('<button type="button" class="btn btn-outline btn-sm" data-chat-act="close">إغلاق</button>');
      let replyNote = '';
      if (!me.canReply) replyNote = 'لديك صلاحية عرض المحادثات فقط.';
      else if (lockedOther) replyNote = `يرد على هذه المحادثة الآن ${escapeHtml(d.assignee.name)}؛ يمكنك متابعتها دون الرد لتجنب تعدد الردود.`;
      else if (!mine) replyNote = 'عند الإرسال تُستلم المحادثة باسمك ولن يستطيع غيرك الرد عليها.';
      const canType = me.canReply && !lockedOther;
      view.innerHTML = `
        <div class="chat-view-head">
          <div>
            <strong>${escapeHtml(c.customer?.name || 'زائر')}</strong>
            <span class="chat-presence"><span class="chat-dot ${d.customerOnline ? 'on' : ''}"></span>${d.customerOnline ? 'متصل الآن' : 'آخر ظهور ' + chatAgo(d.customerSeenAt)}</span>
            <div class="chat-view-contact">${c.customer?.phone ? `<a href="tel:${escapeHtml(c.customer.phone)}" dir="ltr">${escapeHtml(c.customer.phone)}</a>` : ''}${c.customer?.email ? ` · <a href="mailto:${escapeHtml(c.customer.email)}">${escapeHtml(c.customer.email)}</a>` : ''}</div>
          </div>
          <div class="chat-view-actions">${assigneeBadge({ ...d, mode: c.mode })}${actions.join('')}</div>
        </div>
        ${c.aiSummary ? `<p class="chat-summary"><strong>ملخص:</strong> ${escapeHtml(c.aiSummary)}</p>` : ''}
        <div class="chat-view-messages" id="chatViewMessages">${c.messages.map(m => `
          <div class="chat-bubble ${m.sender === 'customer' ? 'from-customer' : m.sender === 'system' ? 'from-system' : m.sender === 'human' ? 'from-staff' : 'from-ai'}">
            <span class="chat-bubble-who">${chatSenderLabel(m, c)} · ${chatTime(m.createdAt)}${['ai', 'human'].includes(m.sender) ? ' ' + chatTicks(m.status) : ''}</span>
            <div>${escapeHtml(m.text || '').replace(/\n/g, '<br>')}</div>
            ${m.attachment ? `<a href="${escapeHtml(m.attachment.url)}" target="_blank" rel="noopener">📎 ${escapeHtml(m.attachment.name)}</a>` : ''}
          </div>`).join('')}</div>
        <form class="chat-reply" id="chatReplyForm">
          <textarea id="chatReplyText" rows="2" maxlength="3000" placeholder="${canType ? 'اكتب ردك للعميل...' : ''}" ${canType ? '' : 'disabled'}></textarea>
          <button type="submit" class="btn btn-dark" ${canType ? '' : 'disabled'}>إرسال</button>
        </form>
        ${replyNote ? `<p class="form-note chat-reply-note">${replyNote}</p>` : ''}`;
      const msgs = document.getElementById('chatViewMessages'); msgs.scrollTop = msgs.scrollHeight;
      const ta = document.getElementById('chatReplyText'); ta.value = draft;
      ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); document.getElementById('chatReplyForm').requestSubmit(); } });
      document.getElementById('chatReplyForm').onsubmit = async (e) => {
        e.preventDefault();
        const text = ta.value.trim(); if (!text) return;
        const btn = e.target.querySelector('button'); btn.disabled = true;
        try { const r = await api(`/api/chat/admin/${encodeURIComponent(c.id)}/reply`, { method: 'POST', body: JSON.stringify({ text }) }); ta.value = ''; renderChatView(r, true); loadChatList(); }
        catch (err) { showToast(err.message); openChat(c.id); }
        finally { btn.disabled = false; }
      };
      view.querySelectorAll('[data-chat-act]').forEach(b => b.onclick = () => chatAction(c.id, b.dataset.chatAct));
    }
    async function chatAction(id, act) {
      const path = { claim: 'claim', takeover: 'claim', release: 'release', ai: 'release', close: 'close' }[act];
      const body = act === 'takeover' ? { force: true } : act === 'ai' ? { toAi: true } : {};
      if (act === 'takeover' && !confirm('نقل المحادثة إليك؟ سيتوقف الموظف الحالي عن الرد عليها.')) return;
      if (act === 'close' && !confirm('إغلاق المحادثة؟')) return;
      try {
        const r = await api(`/api/chat/admin/${encodeURIComponent(id)}/${path}`, { method: 'POST', body: JSON.stringify(body) });
        if (r.conversation) renderChatView(r, true); else openChat(id);
        loadChatList();
        if (act === 'claim' || act === 'takeover') document.getElementById('chatReplyText')?.focus();
      } catch (err) { showToast(err.message); openChat(id); }
    }
    async function openChat(id) {
      if (chatDesk.openId !== id) chatDesk.lastRenderKey = '';
      chatDesk.openId = id;
      document.querySelectorAll('.chat-item').forEach(b => b.classList.toggle('is-open', b.dataset.conv === id));
      document.querySelector('.chat-desk')?.classList.add('has-open');
      try { renderChatView(await api('/api/chat/admin/' + encodeURIComponent(id))); }
      catch (e) { document.getElementById('chatDeskView').innerHTML = `<p class="muted">${escapeHtml(e.message)}</p>`; }
    }
    function chatPollLoop() {
      clearTimeout(chatDesk.listTimer); clearTimeout(chatDesk.convTimer);
      const tickList = async () => { if (chatTabActive()) await loadChatList(); chatDesk.listTimer = setTimeout(tickList, 5000); };
      const tickConv = async () => { if (chatTabActive() && chatDesk.openId) await openChat(chatDesk.openId); chatDesk.convTimer = setTimeout(tickConv, 3000); };
      chatDesk.listTimer = setTimeout(tickList, 5000); chatDesk.convTimer = setTimeout(tickConv, 3000);
      // نبض الحضور: يبقى الموظف "متصلاً" ما دامت لوحة التحكم مفتوحة في أي قسم،
      // فلا تظهر للعميل رسالة عدم توفر الموظفين وأحدهم يعمل على اللوحة
      const ping = () => api('/api/chat/admin/presence', { method: 'POST', body: '{}' }).catch(() => {});
      ping(); clearInterval(chatDesk.presenceTimer); chatDesk.presenceTimer = setInterval(ping, 25000);
    }
    async function loadChatSettings() {
      try {
        const set = await api('/api/settings'); const c = set.chat || {};
        document.getElementById('chatEnabled').checked=c.enabled!==false;document.getElementById('chatAiEnabled').checked=c.aiEnabled!==false;document.getElementById('chatHumanEnabled').checked=c.humanEnabled!==false;document.getElementById('chatWhatsappEnabled').checked=c.whatsappEnabled!==false;document.getElementById('chatCallEnabled').checked=c.callEnabled!==false;document.getElementById('chatAssistantName').value=c.assistantName||'مساعد العمران';document.getElementById('chatPhone').value=c.phone||'+966555592666';document.getElementById('chatWhatsapp').value=c.whatsapp||'966555592666';document.getElementById('chatWelcome').value=c.welcomeMessage||'';document.getElementById('chatOffline').value=c.offlineMessage||'';document.getElementById('chatUnavailable').value=c.unavailableMessage||'';renderQuickReplyRows((c.quickReplies||[]).filter(q=>q.action!=='prices'));renderCannedRows(c.cannedReplies||[]);
      } catch (e) { showToast('تعذر تحميل إعدادات المحادثة: ' + e.message); }
    }
    // محرر اقتراحات المحادثة: نص الزر، نوعه، والرد التلقائي
    const QR_ACTIONS = [['message', 'رسالة (رد مخصص أو المساعد الذكي)'], ['services', 'خدماتنا'], ['service_request', 'طلب خدمة (نموذج الطلب)'], ['human', 'التحدث مع موظف'], ['whatsapp', 'واتساب'], ['call', 'اتصال']];
    const QR_DEFAULT_HINT = { services: 'افتراضي: قائمة الخدمات من الموقع مع سؤال عن عرض السعر', service_request: 'افتراضي: رسالة ترحيب ثم الانتقال إلى نموذج الطلب', human: 'يُحوَّل العميل إلى موظف (أو تظهر رسالة عدم التوفر مع زر واتساب)', whatsapp: 'افتراضي: دعوة للتواصل مع زر فتح واتساب', call: 'افتراضي: دعوة للاتصال مع زر اتصال', message: 'اكتب الرد التلقائي، أو اتركه فارغاً ليرد المساعد الذكي' };
    function quickReplyRow(q = {}) {
      const row = document.createElement('div');
      row.className = 'qr-row'; row.dataset.id = q.id || '';
      row.innerHTML = `
        <div class="qr-row-top">
          <input type="text" class="qr-text" maxlength="120" placeholder="نص الاقتراح" value="${escapeAttr(q.text || '')}">
          <select class="qr-action">${QR_ACTIONS.map(([v, l]) => `<option value="${v}"${(q.action || 'message') === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
          <label class="qr-enabled"><input type="checkbox" class="qr-on"${q.enabled === false ? '' : ' checked'}> ظاهر</label>
          <button type="button" class="btn btn-outline btn-sm qr-del" aria-label="حذف الاقتراح">حذف</button>
        </div>
        <textarea class="qr-reply" rows="2" maxlength="1000">${escapeHtml(q.reply || '')}</textarea>`;
      const sel = row.querySelector('.qr-action'), reply = row.querySelector('.qr-reply');
      const sync = () => { reply.placeholder = QR_DEFAULT_HINT[sel.value] || ''; reply.disabled = sel.value === 'human'; };
      sel.onchange = sync; sync();
      row.querySelector('.qr-del').onclick = () => row.remove();
      return row;
    }
    function renderQuickReplyRows(list) {
      const box = document.getElementById('chatQrList'); box.innerHTML = '';
      list.forEach(q => box.appendChild(quickReplyRow(q)));
      const add = document.getElementById('chatQrAdd');
      if (add && !add.dataset.bound) { add.dataset.bound = '1'; add.onclick = () => { const r = quickReplyRow({}); box.appendChild(r); r.querySelector('.qr-text').focus(); }; }
    }
    // محرر الردود الجاهزة: كلمات تُطابق رسالة العميل ← رد فوري
    function cannedRow(r = {}) {
      const row = document.createElement('div');
      row.className = 'qr-row'; row.dataset.id = r.id || '';
      row.innerHTML = `
        <div class="qr-row-top canned-top">
          <input type="text" class="cr-keywords" maxlength="600" placeholder="الكلمات: السلام عليكم، سلام عليكم" value="${escapeAttr((r.keywords || []).join('، '))}">
          <label class="qr-enabled"><input type="checkbox" class="cr-on"${r.enabled === false ? '' : ' checked'}> مفعّل</label>
          <button type="button" class="btn btn-outline btn-sm cr-del">حذف</button>
        </div>
        <textarea class="qr-reply cr-reply" rows="3" maxlength="1000" placeholder="الرد: وعليكم السلام ورحمة الله وبركاته، أهلاً بك...">${escapeHtml(r.reply || '')}</textarea>`;
      row.querySelector('.cr-del').onclick = () => row.remove();
      return row;
    }
    function renderCannedRows(list) {
      const box = document.getElementById('chatCannedList'); box.innerHTML = '';
      list.forEach(r => box.appendChild(cannedRow(r)));
      const add = document.getElementById('chatCannedAdd');
      if (add && !add.dataset.bound) { add.dataset.bound = '1'; add.onclick = () => { const r = cannedRow({}); box.appendChild(r); r.querySelector('.cr-keywords').focus(); }; }
    }
    function collectCanned() {
      return [...document.querySelectorAll('#chatCannedList .qr-row')].map((row, i) => ({
        id: row.dataset.id || 'cr_' + Date.now() + '_' + i,
        keywords: row.querySelector('.cr-keywords').value.split(/[,،\n]/).map(k => k.trim()).filter(Boolean),
        reply: row.querySelector('.cr-reply').value.trim(),
        enabled: row.querySelector('.cr-on').checked,
      })).filter(r => r.keywords.length && r.reply);
    }
    function collectQuickReplies() {
      return [...document.querySelectorAll('#chatQrList .qr-row')].map((row, i) => ({
        id: row.dataset.id || 'qr_' + Date.now() + '_' + i,
        text: row.querySelector('.qr-text').value.trim(),
        action: row.querySelector('.qr-action').value,
        reply: row.querySelector('.qr-action').value === 'human' ? '' : row.querySelector('.qr-reply').value.trim(),
        enabled: row.querySelector('.qr-on').checked,
      })).filter(q => q.text);
    }
    async function saveChatCenter(){try{const cur=await api('/api/settings');cur.chat=cur.chat||{};
      Object.assign(cur.chat,{enabled:document.getElementById('chatEnabled').checked,aiEnabled:document.getElementById('chatAiEnabled').checked,humanEnabled:document.getElementById('chatHumanEnabled').checked,whatsappEnabled:document.getElementById('chatWhatsappEnabled').checked,callEnabled:document.getElementById('chatCallEnabled').checked,assistantName:document.getElementById('chatAssistantName').value.trim(),phone:document.getElementById('chatPhone').value.trim(),whatsapp:document.getElementById('chatWhatsapp').value.trim(),welcomeMessage:document.getElementById('chatWelcome').value,offlineMessage:document.getElementById('chatOffline').value,unavailableMessage:document.getElementById('chatUnavailable').value,quickReplies:collectQuickReplies(),cannedReplies:collectCanned()});await api('/api/settings/chat',{method:'PUT',body:JSON.stringify(cur.chat)});document.getElementById('chatSettingsMsg').textContent='تم حفظ إعدادات المحادثة.';}catch(e){document.getElementById('chatSettingsMsg').textContent=e.message}}
    function setupChatCenter() {
      const p = currentUser.permissions || {};
      const canView = currentUser.isAdmin || p.manageChat || p.viewMessages || p.replyMessages;
      if (!canView) { document.querySelector('.dash-tab[data-tab="chat"]')?.classList.add('hidden'); return; }
      if (!currentUser.isAdmin) document.getElementById('chatSettingsCard')?.remove();
      else { loadChatSettings(); document.getElementById('saveChatSettingsBtn')?.addEventListener('click', saveChatCenter); }
      document.getElementById('chatRefreshBtn')?.addEventListener('click', () => { loadChatList(); if (chatDesk.openId) openChat(chatDesk.openId); });
      document.querySelectorAll('[data-chat-filter]').forEach(b => b.onclick = () => {
        chatDesk.filter = b.dataset.chatFilter;
        document.querySelectorAll('[data-chat-filter]').forEach(x => x.classList.toggle('is-active', x === b));
        renderChatList();
      });
      document.querySelector('.dash-tab[data-tab="chat"]')?.addEventListener('click', () => { loadChatList(); if (chatDesk.openId) openChat(chatDesk.openId); });
      loadChatList();
      chatPollLoop();
    }
    /* ============================= جرس الإشعارات والنغمة ============================= */
    const BELL_PREFS_KEY = 'alomran_bell_prefs';
    const BELL_POLL_MS = 20000;
    const BELL_TIME_FMT = { dateStyle: 'medium', timeStyle: 'short' };
    let bellPrefs = { sound: true, tone: 'chime', volume: 0.6 };
    let bellSeen = new Set();
    let bellLoaded = false;
    let bellTimer = null;
    let audioCtx = null;
    const baseTitle = document.title;

    try { Object.assign(bellPrefs, JSON.parse(localStorage.getItem(BELL_PREFS_KEY) || '{}')); } catch (_) {}
    function saveBellPrefs() { try { localStorage.setItem(BELL_PREFS_KEY, JSON.stringify(bellPrefs)); } catch (_) {} }

    // المتصفحات لا تسمح بتشغيل الصوت قبل أول تفاعل من المستخدم، لذلك نجهّز الصوت عند أول نقرة.
    function ensureAudio() {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      return audioCtx;
    }

    const TONES = {
      chime: [[880, 0, 0.5], [1318.5, 0.16, 0.7]],
      ding: [[1567.98, 0, 0.35]],
      pulse: [[660, 0, 0.18], [660, 0.24, 0.18]],
    };
    function playTone(name = bellPrefs.tone, volume = bellPrefs.volume) {
      const ctx = ensureAudio();
      if (!ctx) return;
      const start = ctx.currentTime + 0.02;
      for (const [freq, offset, dur] of TONES[name] || TONES.chime) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, start + offset);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.001, 0.35 * volume), start + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start + offset);
        osc.stop(start + offset + dur + 0.05);
      }
    }

    function bellTime(iso) { return new Date(iso).toLocaleString('ar-SA-u-ca-gregory-nu-latn', BELL_TIME_FMT); }

    function renderBell(data) {
      const count = document.getElementById('bellCount');
      count.textContent = data.unread > 99 ? '99+' : String(data.unread);
      count.hidden = !data.unread;
      document.getElementById('bellBtn').setAttribute('aria-label', data.unread ? `الإشعارات (${data.unread} غير مقروء)` : 'الإشعارات');
      document.title = data.unread ? `(${data.unread}) ${baseTitle}` : baseTitle;
      const list = document.getElementById('bellList');
      list.innerHTML = data.items.length ? data.items.map(i => `
        <button type="button" role="listitem" class="bell-item ${i.read ? '' : 'unread'}" data-id="${escapeHtml(i.id)}" data-tab="${escapeHtml(i.tab)}">
          <strong>${escapeHtml(i.title)}</strong>${i.text ? `<span>${escapeHtml(i.text)}</span>` : ''}<small>${bellTime(i.at)}</small>
        </button>`).join('') : '<p class="muted">لا توجد إشعارات بعد.</p>';
      document.getElementById('bellSoundBtn').textContent = bellPrefs.sound ? 'النغمة: تعمل' : 'النغمة: متوقفة';
      document.getElementById('bellSoundBtn').setAttribute('aria-pressed', String(bellPrefs.sound));
    }

    function announce(newItems) {
      if (!newItems.length) return;
      if (bellPrefs.sound) playTone();
      const btn = document.getElementById('bellBtn');
      btn.classList.remove('ringing'); void btn.offsetWidth; btn.classList.add('ringing');
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        const first = newItems[0];
        try { new Notification(newItems.length > 1 ? `${newItems.length} إشعارات جديدة` : first.title, { body: newItems.length > 1 ? first.title : first.text, tag: 'alomran-dashboard', lang: 'ar', dir: 'rtl' }); } catch (_) {}
      }
    }

    async function pollBell() {
      try {
        const data = await api('/api/inbox');
        const fresh = data.items.filter(i => !i.read && !bellSeen.has(i.id));
        data.items.forEach(i => bellSeen.add(i.id));
        if (bellLoaded) announce(fresh);
        bellLoaded = true;
        renderBell(data);
      } catch (err) {
        if (err.status === 401 || err.status === 403) { clearInterval(bellTimer); bellTimer = null; }
      }
    }

    function setBellOpen(open) {
      document.getElementById('bellPanel').hidden = !open;
      document.getElementById('bellBtn').setAttribute('aria-expanded', String(open));
    }

    function setupSoundSettings() {
      const en = document.getElementById('snd-enabled');
      const tone = document.getElementById('snd-tone');
      const vol = document.getElementById('snd-volume');
      en.checked = bellPrefs.sound; tone.value = bellPrefs.tone; vol.value = String(bellPrefs.volume);
      en.addEventListener('change', () => { bellPrefs.sound = en.checked; saveBellPrefs(); pollBell(); });
      tone.addEventListener('change', () => { bellPrefs.tone = tone.value; saveBellPrefs(); playTone(); });
      vol.addEventListener('change', () => { bellPrefs.volume = Number(vol.value); saveBellPrefs(); playTone(); });
      document.getElementById('snd-test').addEventListener('click', () => playTone());
      const permBtn = document.getElementById('desktop-perm');
      const note = document.getElementById('desktop-perm-note');
      const syncPerm = () => {
        if (!('Notification' in window)) { permBtn.hidden = true; note.textContent = 'هذا المتصفح لا يدعم إشعارات سطح المكتب.'; return; }
        const p = Notification.permission;
        permBtn.hidden = p !== 'default';
        note.textContent = p === 'granted' ? 'إشعارات المتصفح مفعّلة: تظهر عندما تكون لوحة التحكم في الخلفية.' : p === 'denied' ? 'إشعارات المتصفح محظورة؛ يمكن السماح بها من إعدادات الموقع في المتصفح.' : '';
      };
      permBtn.addEventListener('click', async () => { try { await Notification.requestPermission(); } catch (_) {} syncPerm(); });
      syncPerm();
    }

    function setupBell() {
      document.addEventListener('pointerdown', ensureAudio, { once: true });
      document.addEventListener('keydown', ensureAudio, { once: true });
      const btn = document.getElementById('bellBtn');
      btn.addEventListener('click', (e) => { e.stopPropagation(); setBellOpen(document.getElementById('bellPanel').hidden); });
      document.addEventListener('click', (e) => { if (!e.target.closest('.bell-wrap')) setBellOpen(false); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !document.getElementById('bellPanel').hidden) { setBellOpen(false); btn.focus(); } });
      document.getElementById('bellList').addEventListener('click', async (e) => {
        const item = e.target.closest('.bell-item');
        if (!item) return;
        setBellOpen(false);
        document.querySelector(`.dash-tab[data-tab="${item.dataset.tab}"]:not(.hidden)`)?.click();
        try { renderBell(await api('/api/inbox/read', { method: 'POST', body: JSON.stringify({ id: item.dataset.id }) })); } catch (_) {}
      });
      document.getElementById('bellReadAll').addEventListener('click', async () => {
        try { renderBell(await api('/api/inbox/read', { method: 'POST', body: JSON.stringify({ all: true }) })); } catch (err) { showToast(err.message); }
      });
      document.getElementById('bellSoundBtn').addEventListener('click', () => {
        bellPrefs.sound = !bellPrefs.sound; saveBellPrefs();
        document.getElementById('snd-enabled').checked = bellPrefs.sound;
        document.getElementById('bellSoundBtn').textContent = bellPrefs.sound ? 'النغمة: تعمل' : 'النغمة: متوقفة';
        document.getElementById('bellSoundBtn').setAttribute('aria-pressed', String(bellPrefs.sound));
        if (bellPrefs.sound) playTone();
        pollBell();
      });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) pollBell(); });
      setupSoundSettings();
      pollBell();
      bellTimer = setInterval(pollBell, BELL_POLL_MS);
    }

    /* ============================= إشعارات البريد ============================= */
    let ntfConfig = null;

    function renderNtfEvents(cfg) {
      for (const group of ['chat', 'requests']) {
        const box = document.querySelector(`.ntf-events[data-group="${group}"]`);
        box.innerHTML = Object.entries(cfg.eventDefs).filter(([, d]) => d.group === group).map(([key, d]) => {
          const t = cfg.templates[key] || {};
          return `<div class="ntf-event" data-event="${escapeHtml(key)}">
            <label class="perm-check"><input type="checkbox" data-event="${escapeHtml(key)}"> ${escapeHtml(d.label)}${key === 'chat.message' ? ' <small class="muted">(رسالة واحدة كحد أقصى كل 10 دقائق لكل محادثة)</small>' : ''}</label>
            <details class="ntf-template"${t.subject || t.intro ? ' open' : ''}>
              <summary>تخصيص الرسالة${t.subject || t.intro ? ' <span class="ntf-custom-badge">مخصصة</span>' : ''}</summary>
              <div class="form-field"><label>عنوان الرسالة</label><input type="text" data-tpl="subject" maxlength="200" placeholder="${escapeHtml(d.subject)}" value="${escapeHtml(t.subject || '')}"></div>
              ${key === 'requests.brief' ? '<p class="form-note">رسالة البريف تحتوي التقرير كاملاً، لذلك يُخصَّص عنوانها فقط.</p>' : `<div class="form-field"><label>نص المقدمة</label><textarea data-tpl="intro" rows="2" maxlength="1000" placeholder="${escapeHtml(d.intro)}">${escapeHtml(t.intro || '')}</textarea></div>`}
              <p class="form-note">المتغيرات: ${cfg.placeholders.map(p => `<code>${escapeHtml(p)}</code>`).join(' ')} — اترك الحقل فارغاً لاستخدام النص الافتراضي.</p>
            </details>
          </div>`;
        }).join('');
      }
    }

    function syncNtfDisabled() {
      for (const group of ['chat', 'requests']) {
        const on = document.getElementById(`ntf-${group}-enabled`).checked;
        document.querySelectorAll(`.ntf-events[data-group="${group}"] input, .ntf-events[data-group="${group}"] textarea, #ntf-${group}-recipients`).forEach(el => { el.disabled = !on; });
      }
      const digestOn = document.getElementById('ntf-digest-enabled').checked;
      ['ntf-digest-frequency', 'ntf-digest-weekday', 'ntf-digest-hour'].forEach(id => { document.getElementById(id).disabled = !digestOn; });
      document.getElementById('ntf-digest-weekday-wrap').hidden = document.getElementById('ntf-digest-frequency').value !== 'weekly';
      const remOn = document.getElementById('ntf-reminders-enabled').checked;
      ['ntf-rem-customers', 'ntf-rem-chats', 'ntf-rem-briefs', 'ntf-rem-after', 'ntf-rem-hour'].forEach(id => { document.getElementById(id).disabled = !remOn; });
    }

    function renderNotifications(cfg) {
      ntfConfig = cfg;
      const set = (id, v) => { document.getElementById(id).value = v; };
      set('ntfSenderName', cfg.sender.name || '');
      set('ntfReplyTo', cfg.sender.replyTo || '');
      document.getElementById('ntfSenderNote').textContent = cfg.senderAddress ? `يُرسل من العنوان: ${cfg.senderAddress} (من إعدادات الخادم SMTP_FROM).` : '';
      set('ntfRecipients', cfg.recipients.join(', '));
      document.getElementById('ntfRecipientsNote').textContent = cfg.recipients.length
        ? '' : (cfg.effectiveRecipients.length ? `إذا تُرك فارغاً تُرسل الإشعارات إلى بريد المالك الرئيسي: ${cfg.effectiveRecipients.join('، ')}` : 'لا يوجد بريد للمالك الرئيسي؛ أضف عنواناً واحداً على الأقل.');
      renderNtfEvents(cfg);
      for (const group of ['chat', 'requests']) {
        document.getElementById(`ntf-${group}-enabled`).checked = cfg[group].enabled;
        set(`ntf-${group}-recipients`, cfg[group].recipients.join(', '));
        document.querySelectorAll(`.ntf-events[data-group="${group}"] input[data-event]`).forEach(box => { box.checked = !!cfg[group].events[box.dataset.event]; });
      }
      document.getElementById('ntf-digest-enabled').checked = cfg.digest.enabled;
      set('ntf-digest-frequency', cfg.digest.frequency);
      set('ntf-digest-weekday', String(cfg.digest.weekday));
      set('ntf-digest-hour', String(cfg.digest.hour));
      document.getElementById('ntf-reminders-enabled').checked = cfg.reminders.enabled;
      document.getElementById('ntf-rem-customers').checked = cfg.reminders.customers;
      document.getElementById('ntf-rem-chats').checked = cfg.reminders.chats;
      document.getElementById('ntf-rem-briefs').checked = cfg.reminders.briefs;
      set('ntf-rem-after', cfg.reminders.afterHours);
      set('ntf-rem-hour', String(cfg.reminders.hour));
      syncNtfDisabled();

      const status = document.getElementById('ntfStatus');
      status.className = 'ntf-status ' + (cfg.mailConfigured ? 'ok' : 'warn');
      const last = [cfg.state.digestDate ? `آخر تقرير دوري: ${cfg.state.digestDate}` : '', cfg.state.reminderDate ? `آخر تذكير: ${cfg.state.reminderDate}` : ''].filter(Boolean).join(' · ');
      status.textContent = (cfg.mailConfigured
        ? `إرسال البريد مفعّل على الخادم.${cfg.linksConfigured ? '' : ' تنبيه: APP_BASE_URL غير مضبوط، لذلك لن تحتوي الرسائل على روابط للوحة التحكم.'}`
        : 'تنبيه: إرسال البريد غير مفعّل على الخادم. أضف إعدادات SMTP (SMTP_HOST وSMTP_FROM…) في متغيرات البيئة حتى تُرسل الإشعارات.') + (last ? ` ${last}` : '');
    }

    async function loadNotifications() {
      try { renderNotifications(await api('/api/notifications-settings')); }
      catch (err) { document.getElementById('ntfMsg').textContent = err.message; }
    }

    function collectNotifications() {
      const val = (id) => document.getElementById(id).value;
      const group = (name) => {
        const events = {};
        document.querySelectorAll(`.ntf-events[data-group="${name}"] input[data-event]`).forEach(b => { events[b.dataset.event] = b.checked; });
        return { enabled: document.getElementById(`ntf-${name}-enabled`).checked, recipients: val(`ntf-${name}-recipients`), events };
      };
      const templates = {};
      document.querySelectorAll('.ntf-event').forEach(ev => {
        const subject = ev.querySelector('[data-tpl=subject]')?.value.trim() || '';
        const intro = ev.querySelector('[data-tpl=intro]')?.value.trim() || '';
        if (subject || intro) templates[ev.dataset.event] = { subject, intro };
      });
      return {
        sender: { name: val('ntfSenderName'), replyTo: val('ntfReplyTo') },
        recipients: val('ntfRecipients'),
        chat: group('chat'), requests: group('requests'), templates,
        digest: { enabled: document.getElementById('ntf-digest-enabled').checked, frequency: val('ntf-digest-frequency'), weekday: Number(val('ntf-digest-weekday')), hour: Number(val('ntf-digest-hour')) },
        reminders: {
          enabled: document.getElementById('ntf-reminders-enabled').checked, afterHours: Number(val('ntf-rem-after')), hour: Number(val('ntf-rem-hour')),
          customers: document.getElementById('ntf-rem-customers').checked, chats: document.getElementById('ntf-rem-chats').checked, briefs: document.getElementById('ntf-rem-briefs').checked,
        },
      };
    }

    function setupNotifications() {
      if (!currentUser.isAdmin) return;
      document.querySelector('.dash-tab[data-tab="notifications"]').classList.remove('hidden');
      document.getElementById('tab-notifications').addEventListener('change', (e) => {
        if (e.target.matches('#ntf-chat-enabled, #ntf-requests-enabled, #ntf-digest-enabled, #ntf-reminders-enabled, #ntf-digest-frequency')) syncNtfDisabled();
      });
      const msg = document.getElementById('ntfMsg');
      document.getElementById('ntfSaveBtn').addEventListener('click', async () => {
        try {
          renderNotifications(await api('/api/notifications-settings', { method: 'PUT', body: JSON.stringify(collectNotifications()) }));
          msg.textContent = 'تم حفظ إعدادات الإشعارات.';
          showToast('تم حفظ إعدادات الإشعارات.');
        } catch (err) { msg.textContent = err.message; }
      });
      const action = (id, url, done) => document.getElementById(id).addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try { msg.textContent = done(await api(url, { method: 'POST' })); }
        catch (err) { msg.textContent = err.message; }
        finally { btn.disabled = false; }
      });
      action('ntfTestBtn', '/api/notifications-settings/test', r => r.message);
      action('ntfDigestNow', '/api/notifications-settings/digest-now', r => r.sent ? `أُرسل تقرير الطلبات إلى: ${r.to.join('، ')} (${r.counts.received} مستلم، ${r.counts.pending} بانتظار المراجعة).` : r.message);
      action('ntfRemindersNow', '/api/notifications-settings/reminders-now', r => r.sent ? `أُرسل التذكير إلى: ${r.to.join('، ')} (${r.counts.total} عنصر).` : r.message);
      loadNotifications();
    }

    /* ============================= قاعدة العملاء ============================= */
    let cusCache = [];
    let cusOptions = null;
    let cusCurrent = null;
    let cusChannel = 'whatsapp';
    let cusCanEdit = false;
    const COMPANY_NAME = 'العمران الذهبية للمقاولات العامة';

    function cusDate(iso, withTime) {
      if (!iso) return '';
      return new Date(iso).toLocaleString('ar-SA-u-ca-gregory-nu-latn', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
    }
    function cusStatusBadge(s) { return `<span class="cus-badge s-${escapeHtml(s)}">${escapeHtml(cusOptions.status[s] || s)}</span>`; }

    function renderCustomers() {
      const box = document.getElementById('cusList');
      const q = document.getElementById('cusSearch').value.trim().toLowerCase();
      const st = document.getElementById('cusStatusFilter').value;
      const src = document.getElementById('cusSourceFilter').value;
      const list = cusCache.filter(c => (!st || c.status === st) && (!src || c.sources.includes(src)) &&
        (!q || [c.name, c.phone, c.email, c.organization].join(' ').toLowerCase().includes(q)));
      document.getElementById('cusCount').textContent = `${list.length} من ${cusCache.length} عميل`;
      if (!list.length) { box.innerHTML = `<p class="muted">${cusCache.length ? 'لا توجد نتائج مطابقة.' : 'لا يوجد عملاء بعد. سيظهر العملاء تلقائياً عند تواصلهم عبر الموقع.'}</p>`; return; }
      box.innerHTML = list.map(c => `
        <button type="button" class="cus-row" data-id="${escapeHtml(c.id)}">
          <span><strong>${escapeHtml(c.name)}</strong>${c.organization ? ` <span class="muted">— ${escapeHtml(c.organization)}</span>` : ''}
            <span class="cus-meta">${c.phone ? `<span dir="ltr">${escapeHtml(c.phone)}</span>` : ''}${c.email ? `<span dir="ltr">${escapeHtml(c.email)}</span>` : ''}<span>آخر نشاط: ${cusDate(c.lastActivityAt)}</span><span>${c.refsCount} طلب · ${c.contactsCount} تواصل</span></span></span>
          <span class="cus-badges">${cusStatusBadge(c.status)}${c.sources.map(s => `<span class="cus-badge src">${escapeHtml(cusOptions.sources[s] || s)}</span>`).join('')}</span>
        </button>`).join('');
    }

    async function loadCustomers() {
      try {
        const data = await api('/api/customers');
        cusCache = data.customers;
        cusOptions = data.options;
        const fill = (id, obj) => { const sel = document.getElementById(id); if (sel.dataset.filled) return; sel.dataset.filled = '1'; sel.insertAdjacentHTML('beforeend', Object.entries(obj).map(([v, t]) => `<option value="${v}">${escapeHtml(t)}</option>`).join('')); };
        fill('cusStatusFilter', cusOptions.status);
        fill('cusSourceFilter', cusOptions.sources);
        fill('cus-status', cusOptions.status);
        renderCustomers();
      } catch (err) {
        document.getElementById('cusList').innerHTML = `<p class="muted">تعذر تحميل العملاء: ${escapeHtml(err.message)}</p>`;
      }
    }

    /* ---------- نافذة العميل ---------- */
    function renderTimeline(c) {
      const events = [
        ...c.requests.map(r => ({ at: r.at, html: `<strong>${escapeHtml(r.label || '')}</strong>${r.link ? ` · <a href="${escapeHtml(r.link)}" target="_blank" rel="noopener">عرض التقرير</a>` : ''}${r.text ? `<p>${escapeHtml(r.text)}</p>` : ''}` })),
        ...c.contactLog.map(l => ({ at: l.at, failed: l.result === 'failed', html: `<strong>${escapeHtml(cusOptions.channels[l.channel] || l.channel)}${l.result === 'failed' ? ' — فشل الإرسال' : ''}</strong> · ${escapeHtml(l.byName || '')}${l.subject ? `<p><b>${escapeHtml(l.subject)}</b></p>` : ''}${l.body ? `<p>${escapeHtml(l.body)}</p>` : ''}` })),
      ].sort((a, b) => String(b.at).localeCompare(String(a.at)));
      document.getElementById('cusTimeline').innerHTML = events.length
        ? events.map(e => `<div class="cus-event ${e.failed ? 'failed' : ''}"><small>${cusDate(e.at, true)}</small>${e.html}</div>`).join('')
        : '<p class="muted">لا يوجد سجل بعد.</p>';
    }

    function setChannel(ch) {
      cusChannel = ch;
      document.querySelectorAll('.cus-channel-tabs button').forEach(b => b.classList.toggle('is-active', b.dataset.channel === ch));
      const c = cusCurrent;
      const body = document.getElementById('cus-body');
      document.getElementById('cusSubjectField').hidden = ch !== 'email';
      document.getElementById('cusBodyField').hidden = ch === 'call';
      document.getElementById('cusBodyLabel').textContent = ch === 'note' ? 'نص الملاحظة' : 'نص الرسالة';
      const send = document.getElementById('cusSendBtn');
      const note = document.getElementById('cusChannelNote');
      const greeting = `مرحباً ${c.name}،\n`;
      if (!body.value.trim() || body.dataset.auto === '1') { body.value = ch === 'note' ? '' : greeting; body.dataset.auto = '1'; }
      send.disabled = false;
      if (ch === 'whatsapp') {
        send.textContent = 'فتح واتساب';
        note.textContent = c.phone ? 'تُفتح المحادثة في واتساب بالرسالة الجاهزة، ويُسجَّل التواصل في سجل العميل.' : 'لا يوجد رقم جوال لهذا العميل.';
        send.disabled = !c.phone;
      } else if (ch === 'email') {
        send.textContent = 'إرسال البريد';
        if (!document.getElementById('cus-subject').value) document.getElementById('cus-subject').value = COMPANY_NAME;
        note.textContent = !c.email ? 'لا يوجد بريد إلكتروني لهذا العميل.' : (cusCurrent.mailConfigured ? `يُرسل من خادم الموقع إلى ${c.email}، والردود تصل إلى بريدك.` : 'إرسال البريد غير مفعّل على الخادم (إعدادات SMTP).');
        send.disabled = !c.email || !cusCurrent.mailConfigured;
      } else if (ch === 'call') {
        send.textContent = c.phone ? `اتصال ${c.phone}` : 'اتصال';
        note.textContent = c.phone ? 'يفتح تطبيق الاتصال في جهازك ويُسجَّل التواصل.' : 'لا يوجد رقم جوال لهذا العميل.';
        send.disabled = !c.phone;
      } else {
        send.textContent = 'حفظ الملاحظة';
        note.textContent = 'ملاحظة متابعة داخلية تُضاف للسجل ولا تُرسل للعميل.';
      }
      if (!cusCanEdit) { send.disabled = true; note.textContent = 'لا تملك صلاحية التواصل مع العملاء.'; }
    }

    async function openCustomer(id) {
      try {
        const data = await api('/api/customers/' + encodeURIComponent(id));
        cusCurrent = { ...data.customer, mailConfigured: data.mailConfigured };
        const c = cusCurrent;
        document.getElementById('cusModalTitle').textContent = c.name;
        document.getElementById('cus-name').value = c.name;
        document.getElementById('cus-org').value = c.organization || '';
        document.getElementById('cus-phone').value = c.phone || '';
        document.getElementById('cus-email').value = c.email || '';
        document.getElementById('cus-status').value = c.status;
        document.getElementById('cus-notes').value = c.notes || '';
        document.querySelectorAll('#cusForm input, #cusForm select, #cusForm textarea').forEach(el => { el.disabled = !cusCanEdit; });
        document.querySelector('#cusForm button[type=submit]').hidden = !cusCanEdit;
        document.getElementById('cusDeleteBtn').classList.toggle('hidden', !currentUser.isAdmin);
        document.getElementById('cus-subject').value = '';
        document.getElementById('cus-body').value = '';
        setChannel(c.phone ? 'whatsapp' : 'email');
        renderTimeline(c);
        document.getElementById('cusModal').classList.remove('hidden');
        document.getElementById('cus-name').focus();
      } catch (err) { showToast(err.message); }
    }

    function closeCustomer() {
      document.getElementById('cusModal').classList.add('hidden');
      cusCurrent = null;
    }

    async function logContact(payload) {
      const data = await api('/api/customers/' + encodeURIComponent(cusCurrent.id) + '/contact', { method: 'POST', body: JSON.stringify(payload) });
      cusCurrent.contactLog = data.customer.contactLog;
      cusCurrent.status = data.customer.status;
      document.getElementById('cus-status').value = data.customer.status;
      renderTimeline(cusCurrent);
      loadCustomers();
      loadCustomerReport();
    }

    async function sendContact() {
      const c = cusCurrent;
      const body = document.getElementById('cus-body').value.trim();
      const subject = document.getElementById('cus-subject').value.trim();
      const btn = document.getElementById('cusSendBtn');
      try {
        if (cusChannel === 'whatsapp') {
          // تُفتح النافذة فوراً (قبل أي انتظار) حتى لا يمنعها المتصفح.
          window.open(`https://wa.me/${c.phone.replace(/\D/g, '')}?text=${encodeURIComponent(body)}`, '_blank', 'noopener');
          await logContact({ channel: 'whatsapp', body });
          showToast('تم تسجيل التواصل عبر واتساب.');
        } else if (cusChannel === 'call') {
          window.location.href = 'tel:' + c.phone;
          await logContact({ channel: 'call' });
        } else if (cusChannel === 'email') {
          btn.disabled = true; btn.textContent = 'جارِ الإرسال...';
          await logContact({ channel: 'email', subject, body });
          showToast('تم إرسال البريد إلى العميل.');
        } else {
          await logContact({ channel: 'note', body });
          showToast('تمت إضافة الملاحظة.');
        }
        const b = document.getElementById('cus-body'); b.value = ''; b.dataset.auto = '';
        setChannel(cusChannel);
      } catch (err) {
        showToast(err.message);
        setChannel(cusChannel);
      }
    }

    /* ---------- التقرير ---------- */
    function cusRangeDates() {
      const v = document.getElementById('cusRange').value;
      const iso = (d) => d.toISOString().slice(0, 10);
      if (v === 'all') return {};
      if (v === 'custom') return { from: document.getElementById('cusFrom').value || undefined, to: document.getElementById('cusTo').value || undefined };
      const from = new Date(Date.now() - Number(v) * 24 * 60 * 60 * 1000);
      return { from: iso(from), to: iso(new Date()) };
    }

    function barsHtml(items) {
      const max = Math.max(1, ...items.map(i => i.value));
      if (!items.length) return '<p class="muted">لا توجد بيانات في هذه الفترة.</p>';
      return items.map(i => `<div class="cus-bar" title="${escapeHtml(i.label)}: ${i.value}">
        <span class="cus-bar-label">${escapeHtml(i.label)}</span>
        <span class="cus-bar-track"><span class="cus-bar-fill" style="display:block;width:${(i.value / max) * 100}%"></span></span>
        <span class="cus-bar-value">${i.value}</span></div>`).join('');
    }

    async function loadCustomerReport() {
      const { from, to } = cusRangeDates();
      const qs = new URLSearchParams();
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      try {
        const r = await api('/api/customers/report?' + qs.toString());
        const period = from || to ? `الفترة: ${from ? cusDate(from) : 'البداية'} — ${to ? cusDate(to) : 'اليوم'}` : 'كل الفترات';
        document.getElementById('cusReportPeriod').textContent = `${period} · أُنشئ في ${cusDate(new Date().toISOString(), true)}`;
        const t = r.totals;
        const rate = t.customers ? Math.round((t.clients / t.customers) * 100) : 0;
        document.getElementById('cusReportTotals').innerHTML = [
          [t.customers, 'إجمالي العملاء'], [t.newInRange, 'عملاء جدد في الفترة'], [t.contactedInRange, 'تم التواصل معهم في الفترة'],
          [t.neverContacted, 'لم يُتواصل معهم بعد'], [`${t.clients} (${rate}%)`, 'تحولوا إلى عملاء'],
        ].map(([n, l]) => `<div class="overview-stat-card"><span class="overview-stat-num">${n}</span><span class="overview-stat-label">${l}</span></div>`).join('');
        const maxM = Math.max(1, ...r.monthly.map(m => m.value));
        const monthName = (k) => new Date(k + '-01T00:00:00Z').toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { month: 'short', timeZone: 'UTC' });
        document.getElementById('cusChartMonthly').outerHTML = `<div id="cusChartMonthly"><div class="cus-cols">${r.monthly.map(m => `<div class="cus-col" title="${monthName(m.key)} ${m.key.slice(0, 4)}: ${m.value} عميل جديد"><span class="cus-col-value">${m.value || ''}</span><span class="cus-col-fill" style="height:${(m.value / maxM) * 100}%"></span></div>`).join('')}</div><div class="cus-col-labels">${r.monthly.map(m => `<span>${monthName(m.key)}</span>`).join('')}</div></div>`;
        document.getElementById('cusChartStatus').innerHTML = barsHtml(r.byStatus);
        document.getElementById('cusChartSource').innerHTML = barsHtml(r.bySource);
        document.getElementById('cusChartChannel').innerHTML = barsHtml(r.byChannel);
        document.getElementById('cusChartServices').innerHTML = barsHtml(r.topServices);
      } catch (err) {
        document.getElementById('cusReportTotals').innerHTML = `<p class="muted">تعذر تحميل التقرير: ${escapeHtml(err.message)}</p>`;
      }
    }

    function setupCustomers() {
      const canSee = currentUser.isAdmin || !!(currentUser.permissions && currentUser.permissions.viewMessages);
      cusCanEdit = currentUser.isAdmin || !!(currentUser.permissions && currentUser.permissions.replyMessages);
      if (!canSee) { document.querySelector('.dash-tab[data-tab="customers"]')?.classList.add('hidden'); return; }
      if (cusCanEdit) document.getElementById('cusAddBtn').classList.remove('hidden');
      if (currentUser.isAdmin) document.getElementById('cusExportBtn').classList.remove('hidden');

      document.getElementById('cusRefreshBtn').addEventListener('click', () => { loadCustomers(); loadCustomerReport(); });
      document.getElementById('cusSearch').addEventListener('input', renderCustomers);
      document.getElementById('cusStatusFilter').addEventListener('change', renderCustomers);
      document.getElementById('cusSourceFilter').addEventListener('change', renderCustomers);
      document.getElementById('cusList').addEventListener('click', (e) => {
        const row = e.target.closest('.cus-row');
        if (row) openCustomer(row.dataset.id);
      });
      document.getElementById('cusModalClose').addEventListener('click', closeCustomer);
      document.getElementById('cusModal').addEventListener('click', (e) => { if (e.target.id === 'cusModal') closeCustomer(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && cusCurrent) closeCustomer(); });
      document.querySelectorAll('.cus-channel-tabs button').forEach(b => b.addEventListener('click', () => setChannel(b.dataset.channel)));
      document.getElementById('cus-body').addEventListener('input', (e) => { e.target.dataset.auto = ''; });
      document.getElementById('cusSendBtn').addEventListener('click', sendContact);

      document.getElementById('cusForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
          name: document.getElementById('cus-name').value, organization: document.getElementById('cus-org').value,
          phone: document.getElementById('cus-phone').value.trim(), email: document.getElementById('cus-email').value.trim(),
          status: document.getElementById('cus-status').value, notes: document.getElementById('cus-notes').value,
        };
        try {
          const data = await api('/api/customers/' + encodeURIComponent(cusCurrent.id), { method: 'PATCH', body: JSON.stringify(payload) });
          Object.assign(cusCurrent, data.customer);
          document.getElementById('cusModalTitle').textContent = data.customer.name;
          document.getElementById('cus-phone').value = data.customer.phone;
          setChannel(cusChannel);
          showToast('تم حفظ بيانات العميل.');
          loadCustomers();
          loadCustomerReport();
        } catch (err) { showToast(err.message); }
      });

      document.getElementById('cusDeleteBtn').addEventListener('click', () => {
        const c = cusCurrent;
        askConfirm('حذف العميل', `هل تريد حذف "${c.name}" وسجل تواصله نهائياً من قاعدة العملاء؟`, async () => {
          try {
            await api('/api/customers/' + encodeURIComponent(c.id), { method: 'DELETE' });
            closeCustomer();
            showToast('تم حذف العميل.');
            loadCustomers();
            loadCustomerReport();
          } catch (err) { showToast(err.message); }
        });
      });

      document.getElementById('cusAddBtn').addEventListener('click', async () => {
        const name = prompt('اسم العميل:');
        if (!name) return;
        const phone = prompt('رقم الجوال (مثال: 0555555555 أو +966555555555) — يمكن تركه فارغاً إذا أدخلت البريد:') || '';
        const email = phone ? '' : (prompt('البريد الإلكتروني:') || '');
        try {
          const data = await api('/api/customers', { method: 'POST', body: JSON.stringify({ name, phone, email }) });
          showToast('تمت إضافة العميل.');
          await loadCustomers();
          openCustomer(data.customer.id);
        } catch (err) {
          showToast(err.message);
          if (err.existingId) openCustomer(err.existingId);
        }
      });

      const range = document.getElementById('cusRange');
      range.addEventListener('change', () => {
        const custom = range.value === 'custom';
        document.getElementById('cusFrom').hidden = !custom;
        document.getElementById('cusTo').hidden = !custom;
        loadCustomerReport();
      });
      document.getElementById('cusFrom').addEventListener('change', loadCustomerReport);
      document.getElementById('cusTo').addEventListener('change', loadCustomerReport);
      document.getElementById('cusPrintBtn').addEventListener('click', () => {
        document.body.classList.add('printing-report');
        window.print();
      });
      window.addEventListener('afterprint', () => document.body.classList.remove('printing-report'));

      loadCustomers();
      loadCustomerReport();
    }

    /* ============================= بريفات المشاريع ============================= */
    let briefsCache = [];
    let briefsOptions = null;
    let canEditBriefs = false;

    let briefsLegacy = {};
    // تسميات النسخة السابقة من النموذج تُستخدم للعرض فقط، ولا تظهر في قوائم الاختيار.
    function briefLabel(group, value) { return (briefsOptions && briefsOptions[group] && briefsOptions[group][value]) || (briefsLegacy[group] && briefsLegacy[group][value]) || value || ''; }
    const briefNum = (n, unit) => (n == null ? '' : `${Number(n).toLocaleString('en-US')}${unit ? ' ' + unit : ''}`);
    const briefSize = (b) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
    const briefBudget = (p) => (p.budget === 'specific' && p.budgetAmount != null ? briefNum(p.budgetAmount, 'ريال') : (briefLabel('budget', p.budget) || 'لم تُحدَّد'));

    // البريف بالترتيب: رقم الطلب ← العميل ← نوع المشروع ← الموقع ← المساحة ← الميزانية ← الجدول الزمني ← نطاق العمل ← المرفقات ← الملاحظات ← الحالة
    function briefDetails(b) {
      const c = b.client, p = b.project;
      const built = p.builtArea != null ? p.builtArea : p.buildArea;
      const area = [
        p.landArea != null && `الأرض ${briefNum(p.landArea, 'م²')}`,
        built != null && `المبنية ${briefNum(built, 'م²')}`,
        p.requiredArea != null && `المطلوبة ${briefNum(p.requiredArea, 'م²')}`,
        p.floors != null && `${briefNum(p.floors)} أدوار`,
        p.units != null && `${briefNum(p.units)} وحدات/غرف`,
      ].filter(Boolean).join(' · ');
      const timeline = [
        p.startWhen && `البدء: ${briefLabel('startWhen', p.startWhen)}`,
        p.startDate && `البدء: ${p.startDate}`,
        p.targetDate && `الإنجاز المستهدف: ${p.targetDate}`,
        p.hasDeadline && `موعد نهائي محدد: ${briefLabel('hasDeadline', p.hasDeadline)}`,
      ].filter(Boolean).join(' · ');
      const scope = (p.scope || []).map(s => (s === 'other' && p.scopeOther ? `أخرى: ${p.scopeOther}` : briefLabel('scope', s))).join('، ');
      const location = [p.location, c.district || p.district, c.city || p.city].filter(Boolean).join('، ');
      const rows = [
        ['رقم الطلب', `<span dir="ltr">${escapeHtml(b.ref)}</span>`],
        ['العميل', `${escapeHtml(c.name)} · <span dir="ltr">${escapeHtml(c.phone)}</span>${c.email ? ` · <span dir="ltr">${escapeHtml(c.email)}</span>` : ''} · يفضّل: ${escapeHtml(briefLabel('preferredContact', c.preferredContact || p.preferredContact))}`],
        ['نوع المشروع', escapeHtml([briefLabel('projectType', p.projectType), p.projectName, briefLabel('siteStatus', p.siteStatus)].filter(Boolean).join(' · '))],
        ['الموقع', escapeHtml(location)],
        ['المساحة', escapeHtml(area)],
        ['الميزانية', escapeHtml(briefBudget(p))],
        ['الجدول الزمني', escapeHtml(timeline)],
        ['نطاق العمل', escapeHtml(scope)],
        ['المرفقات', (b.files || []).map(f => `<a href="/brief/${encodeURIComponent(b.id)}/files/${encodeURIComponent(f.id)}" target="_blank" rel="noopener">${escapeHtml(briefLabel('fileCategory', f.category))}: ${escapeHtml(f.name)}</a> <span class="muted" dir="ltr">${briefSize(f.size)}</span>`).join('<br>')],
        ['وصف المشروع', escapeHtml(p.description || '').replace(/\n/g, '<br>')],
        ['متطلبات خاصة', escapeHtml(p.specialRequirements || '').replace(/\n/g, '<br>')],
      ].filter(([, v]) => v);
      return `<dl class="brief-dl">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
    }

    function renderBriefs() {
      const box = document.getElementById('briefsList');
      const q = document.getElementById('briefsSearch').value.trim().toLowerCase();
      const status = document.getElementById('briefsStatusFilter').value;
      const list = briefsCache.filter(b => (!status || b.status === status) &&
        (!q || [b.ref, b.client.name, b.client.phone, b.client.email, b.client.organization, b.client.city, b.project.city, b.project.projectName, b.project.location].join(' ').toLowerCase().includes(q)));
      if (!list.length) { box.innerHTML = `<p class="muted">${briefsCache.length ? 'لا توجد نتائج مطابقة.' : 'لم يصل أي طلب مشروع بعد.'}</p>`; return; }
      const statusOptions = Object.entries(briefsOptions.status).map(([v, t]) => `<option value="${v}">${escapeHtml(t)}</option>`).join('');
      box.innerHTML = list.map(b => {
        const waPhone = String(b.client.phone || '').replace(/\D/g, '');
        const waText = encodeURIComponent(`مرحباً ${b.client.name}، معك العمران الذهبية للمقاولات العامة بخصوص طلب مشروعك رقم ${b.ref}.`);
        const mailSubject = encodeURIComponent(`بخصوص طلب مشروعك ${b.ref} — العمران الذهبية للمقاولات العامة`);
        const city = b.client.city || b.project.city || '';
        return `<div class="brief-row ${b.status === 'new' ? 'is-new' : ''}" data-id="${escapeHtml(b.id)}">
          <div class="brief-row-head">
            <div><strong>${escapeHtml(b.client.name)}</strong>${b.project.projectName ? ` — ${escapeHtml(b.project.projectName)}` : ''}
              <div class="brief-meta"><span dir="ltr">${escapeHtml(b.ref)}</span><span>${escapeHtml(briefLabel('projectType', b.project.projectType))}</span><span>${escapeHtml(city)}</span><span>${escapeHtml(briefBudget(b.project))}</span>${(b.files || []).length ? `<span>📎 ${b.files.length}</span>` : ''}<span>${new Date(b.createdAt).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
            </div>
            <div class="brief-actions">
              <span class="brief-status brief-status-${escapeHtml(b.status)}">${escapeHtml(briefLabel('status', b.status))}</span>
              <select data-brief-status ${canEditBriefs ? '' : 'disabled'} aria-label="حالة الطلب">${statusOptions}</select>
              <a class="btn btn-dark btn-sm" href="/brief/${encodeURIComponent(b.id)}" target="_blank" rel="noopener">البريف الكامل</a>
            </div>
          </div>
          <details class="brief-details"><summary>عرض تفاصيل الطلب</summary>${briefDetails(b)}</details>
          <div class="brief-actions">
            <a class="btn btn-outline btn-sm" href="tel:${escapeHtml(b.client.phone)}" dir="ltr">${escapeHtml(b.client.phone)}</a>
            ${waPhone ? `<a class="btn btn-outline btn-sm" href="https://wa.me/${waPhone}?text=${waText}" target="_blank" rel="noopener">واتساب</a>` : ''}
            ${b.client.email ? `<a class="btn btn-outline btn-sm" href="mailto:${escapeHtml(b.client.email)}?subject=${mailSubject}">بريد</a>` : ''}
            ${currentUser.isAdmin ? '<button type="button" class="btn btn-danger btn-sm" data-brief-delete>حذف</button>' : ''}
          </div>
          <textarea class="brief-notes" data-brief-notes placeholder="ملاحظات داخلية (لا تظهر للعميل)" ${canEditBriefs ? '' : 'disabled'}>${escapeHtml(b.notes || '')}</textarea>
        </div>`;
      }).join('');
      box.querySelectorAll('.brief-row').forEach(row => {
        const b = briefsCache.find(x => x.id === row.dataset.id);
        row.querySelector('[data-brief-status]').value = b.status;
      });
    }

    async function loadBriefs() {
      try {
        const data = await api('/api/briefs');
        briefsCache = data.briefs;
        briefsOptions = data.options;
        briefsLegacy = data.legacy || {};
        const sel = document.getElementById('briefsStatusFilter');
        if (sel.options.length === 1) sel.insertAdjacentHTML('beforeend', Object.entries(briefsOptions.status).map(([v, t]) => `<option value="${v}">${escapeHtml(t)}</option>`).join(''));
        const count = (s) => briefsCache.filter(b => b.status === s).length;
        const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        document.getElementById('briefsStats').innerHTML = [
          [briefsCache.length, 'إجمالي الطلبات'], [count('new'), 'جديدة'], [count('reviewing') + count('needs_info') + count('studied'), 'قيد الدراسة'],
          [count('quoted'), 'عرض سعر'], [count('in_progress'), 'قيد التنفيذ'], [count('completed'), 'مكتملة'],
          [briefsCache.filter(b => new Date(b.createdAt) > monthAgo).length, 'آخر 30 يوماً'],
        ].map(([n, l]) => `<div class="overview-stat-card"><span class="overview-stat-num">${n}</span><span class="overview-stat-label">${l}</span></div>`).join('');
        renderBriefs();
      } catch (err) {
        document.getElementById('briefsList').innerHTML = `<p class="muted">تعذر تحميل الطلبات: ${escapeHtml(err.message)}</p>`;
      }
    }

    function setupBriefs() {
      const canSeeBriefs = currentUser.isAdmin || !!(currentUser.permissions && currentUser.permissions.viewMessages);
      canEditBriefs = currentUser.isAdmin || !!(currentUser.permissions && currentUser.permissions.replyMessages);

      if (!canSeeBriefs) {
        document.querySelector('.dash-tab[data-tab="briefs"]')?.classList.add('hidden');
      } else {
        document.getElementById('briefsRefreshBtn').addEventListener('click', loadBriefs);
        document.getElementById('briefsSearch').addEventListener('input', renderBriefs);
        document.getElementById('briefsStatusFilter').addEventListener('change', renderBriefs);
        const list = document.getElementById('briefsList');
        list.addEventListener('change', async (e) => {
          const sel = e.target.closest('[data-brief-status]');
          if (!sel) return;
          const id = sel.closest('.brief-row').dataset.id;
          try {
            const { brief } = await api('/api/briefs/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ status: sel.value }) });
            Object.assign(briefsCache.find(b => b.id === id), brief);
            showToast('تم تحديث حالة الطلب.');
            loadBriefs();
          } catch (err) { showToast(err.message); }
        });
        list.addEventListener('focusout', async (e) => {
          const area = e.target.closest('[data-brief-notes]');
          if (!area) return;
          const id = area.closest('.brief-row').dataset.id;
          const b = briefsCache.find(x => x.id === id);
          if (!b || (b.notes || '') === area.value) return;
          try {
            await api('/api/briefs/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ notes: area.value }) });
            b.notes = area.value;
            showToast('تم حفظ الملاحظات.');
          } catch (err) { showToast(err.message); }
        });
        list.addEventListener('click', (e) => {
          const del = e.target.closest('[data-brief-delete]');
          if (!del) return;
          const id = del.closest('.brief-row').dataset.id;
          const b = briefsCache.find(x => x.id === id);
          askConfirm('حذف الطلب', `هل تريد حذف طلب "${b.client.name}" (${b.ref}) ومرفقاته نهائياً؟`, async () => {
            try {
              await api('/api/briefs/' + encodeURIComponent(id), { method: 'DELETE' });
              showToast('تم حذف الطلب.');
              loadBriefs();
            } catch (err) { showToast(err.message); }
          });
        });
        loadBriefs();
      }

    }


    init();
  }
})();
