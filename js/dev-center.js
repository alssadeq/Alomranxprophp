// js/dev-center.js
// يعمل على 3 صفحات: developer-setup.html، developer-login.html،
// /developer-center — ملف منفصل تماماً عن js/dashboard.js (لا يشترك
// معه بأي حالة أو دالة)، بنفس أسلوب التمييز عبر data-page.

(function () {
  'use strict';

  const PAGE = document.currentScript.getAttribute('data-page');

  async function api(path, options = {}) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    let data = {};
    try { data = await res.json(); } catch (e) { /* استجابة بدون محتوى JSON (مثل تنزيل ملف) */ }
    if (!res.ok) {
      const err = new Error(data.error || 'حدث خطأ غير متوقع');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('ar-SA'); } catch (e) { return iso; }
  }

  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  function riskBadge(risk) {
    const r = (risk || 'NONE').toLowerCase();
    const labels = { none: 'لا يوجد', low: 'منخفضة', medium: 'متوسطة', high: 'عالية', critical: 'حرجة' };
    return `<span class="risk-badge risk-${r}">${labels[r] || risk}</span>`;
  }

  function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.add('hidden'), 3200);
  }

  /* ============================= صفحة إعداد المطوّر الأول ============================= */

  if (PAGE === 'developer-setup') {
    const form = document.getElementById('devSetupForm');
    const errorBox = document.getElementById('devSetupError');
    const GRANT_KEY = 'alomran_dev_setup_grant';
    let setupGrant = '';
    try { setupGrant = sessionStorage.getItem(GRANT_KEY) || ''; } catch (_) {}
    const tokenField = document.getElementById('bootstrapToken').closest('.form-field');
    if (setupGrant) {
      tokenField.hidden = true;
      const note = document.createElement('p');
      note.className = 'form-note';
      note.id = 'setupGrantNote';
      note.textContent = 'تمت إعادة التعيين من هذا المتصفح، يمكنك إنشاء حساب المطوّر مباشرة دون رمز التهيئة (صالح لمدة 30 دقيقة).';
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
        await api('/api/developer/setup', { method: 'POST', headers, body: JSON.stringify({ username, password, bootstrapToken: setupGrant ? '' : bootstrapToken }) });
        try { sessionStorage.removeItem(GRANT_KEY); } catch (_) {}
        window.location.href = '/developer-center';
      } catch (err) {
        if (setupGrant && err.status === 403) {
          setupGrant = '';
          try { sessionStorage.removeItem(GRANT_KEY); } catch (_) {}
          tokenField.hidden = false;
          document.getElementById('setupGrantNote')?.remove();
        }
        errorBox.textContent = err.message;
        errorBox.classList.remove('hidden');
      }
    });
  }

  /* ============================= صفحة دخول المطوّر ============================= */

  if (PAGE === 'developer-login') {
    const form = document.getElementById('devLoginForm');
    const errorBox = document.getElementById('devLoginError');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorBox.classList.add('hidden');
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      try {
        await api('/api/developer/login', { method: 'POST', body: JSON.stringify({ username, password }) });
        window.location.href = '/developer-center';
      } catch (err) {
        errorBox.textContent = err.message;
        errorBox.classList.remove('hidden');
      }
    });
  }

  /* ============================= مركز تحكم المطوّر ============================= */

  if (PAGE === 'developer-center') {
    const devPasswordForm = document.getElementById('devPasswordForm');
    if (devPasswordForm) {
      devPasswordForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = document.getElementById('devCpMessage');
        try {
          const currentPassword = document.getElementById('dev-cp-current').value;
          const newPassword = document.getElementById('dev-cp-new').value;
          if (newPassword.length < 12) throw new Error('كلمة المرور الجديدة يجب ألا تقل عن 12 حرفاً.');
          const result = await api('/api/developer/password', { method: 'PATCH', body: JSON.stringify({ currentPassword, newPassword }) });
          msg.textContent = result.ok ? 'تم تغيير كلمة المرور بنجاح.' : 'تعذر تغيير كلمة المرور.';
          devPasswordForm.reset();
        } catch (err) { msg.textContent = err.message || 'تعذر تغيير كلمة المرور.'; }
      });
    }
    async function init() {
      try {
        const data = await api('/api/developer/session');
        document.getElementById('currentDevLabel').textContent = data.developer.username + ' (مطوّر)';
      } catch (e) {
        window.location.href = '/developer-login';
        return;
      }
      setupTabs();
      setupLogout();
      loadHealth();
      loadSecurity();
      loadErrors();
      loadPerformance();
      loadDatabase();
      loadAudit();
      loadBackups();
      loadExports();
      loadUpdateReport();
      loadSmartUpdates();
      loadVersionCheck();
      loadAiAgents();
      loadMaintenanceSettings();
      loadFeatureFlags();
      wireButtons();
    }

    function setupTabs() {
      const tabs = document.querySelectorAll('.dash-tab');
      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          tabs.forEach(t => t.classList.remove('is-active'));
          document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('is-active'));
          tab.classList.add('is-active');
          document.getElementById('tab-' + tab.dataset.tab).classList.add('is-active');
        });
      });
    }

    function setupLogout() {
      document.getElementById('devLogoutBtn').addEventListener('click', async () => {
        await api('/api/developer/logout', { method: 'POST' });
        window.location.href = '/developer-login';
      });
    }

    /* ---------- الحالة العامة ---------- */
    async function loadHealth() {
      const box = document.getElementById('healthStats');
      const infoBox = document.getElementById('systemInfo');
      try {
        const h = await api('/api/developer/system-health');
        box.innerHTML = `
          <div class="dev-stat-card"><span class="num">${h.status === 'up' ? 'يعمل ✓' : h.status}</span><span class="label">حالة التطبيق</span></div>
          <div class="dev-stat-card"><span class="num">${Math.floor(h.uptimeSeconds / 60)} دقيقة</span><span class="label">مدة التشغيل منذ آخر بدء</span></div>
          <div class="dev-stat-card"><span class="num">${h.memory.rssMB} MB</span><span class="label">استهلاك الذاكرة (RSS)</span></div>
          <div class="dev-stat-card"><span class="num">${h.dataFiles === 'ok' ? 'سليمة ✓' : 'خطأ ✗'}</span><span class="label">ملفات البيانات</span></div>
        `;
        const info = await api('/api/developer/system-info');
        infoBox.innerHTML = `
          <div class="overview-row"><span>إصدار التطبيق</span><strong>${escapeHtml(info.appVersion)}</strong></div>
          <div class="overview-row"><span>إصدار Node.js الحالي</span><strong>${escapeHtml(info.nodeVersion)}</strong></div>
          <div class="overview-row"><span>إصدار Node.js المطلوب</span><strong>${escapeHtml(info.requiredNodeVersion)}</strong></div>
          <div class="overview-row"><span>البيئة (Environment)</span><strong>${escapeHtml(info.environment)}</strong></div>
          <div class="overview-row"><span>إصدار الكود (Git commit)</span><strong>${escapeHtml(info.gitCommit)}</strong></div>
        `;
      } catch (e) { box.innerHTML = `<p class="muted">تعذر تحميل الحالة: ${escapeHtml(e.message)}</p>`; }
    }

    /* ---------- الأمان ---------- */
    async function loadSecurity() {
      const box = document.getElementById('securityEvents');
      try {
        const { events } = await api('/api/developer/security-events');
        if (!events.length) { box.innerHTML = '<p class="muted">لا توجد محاولات دخول فاشلة مسجّلة.</p>'; return; }
        box.innerHTML = events.map(ev => `
          <div class="overview-row">
            <span>${ev.type === 'failed_developer_login' ? 'محاولة دخول مطوّر فاشلة' : 'محاولة دخول فاشلة'} — ${escapeHtml(ev.username || '—')} ${ev.ip ? '(' + escapeHtml(ev.ip) + ')' : ''}</span>
            <strong>${fmtDate(ev.timestamp)}</strong>
          </div>`).join('');
      } catch (e) { box.innerHTML = `<p class="muted">تعذر التحميل: ${escapeHtml(e.message)}</p>`; }
    }

    /* ---------- الأخطاء ---------- */
    async function loadErrors() {
      const box = document.getElementById('errorLog');
      try {
        const { errors } = await api('/api/developer/error-log');
        if (!errors.length) { box.innerHTML = '<p class="muted">لا توجد أخطاء مسجّلة. 👍</p>'; return; }
        box.innerHTML = errors.map(er => `
          <div class="overview-row">
            <span>${escapeHtml(er.message)} ${er.path ? '— ' + escapeHtml(er.method + ' ' + er.path) : ''}</span>
            <strong>${fmtDate(er.timestamp)}</strong>
          </div>`).join('');
      } catch (e) { box.innerHTML = `<p class="muted">تعذر التحميل: ${escapeHtml(e.message)}</p>`; }
    }

    /* ---------- الأداء ---------- */
    async function loadPerformance() {
      const box = document.getElementById('perfRoutes');
      try {
        const stats = await api('/api/developer/performance');
        if (!stats.routes.length) { box.innerHTML = '<p class="muted">لا توجد بيانات كافية بعد.</p>'; return; }
        box.innerHTML = stats.routes.map(r => `
          <div class="overview-row">
            <span>${escapeHtml(r.route)} (${r.count} طلب${r.errors ? '، ' + r.errors + ' خطأ' : ''})</span>
            <strong>متوسط ${r.avgMs}ms / أقصى ${r.maxMs}ms</strong>
          </div>`).join('');
      } catch (e) { box.innerHTML = `<p class="muted">تعذر التحميل: ${escapeHtml(e.message)}</p>`; }
    }

    /* ---------- قاعدة البيانات ---------- */
    async function loadDatabase() {
      const box = document.getElementById('dbFiles');
      try {
        const { files } = await api('/api/developer/database-center');
        box.innerHTML = files.map(f => `
          <div class="overview-row">
            <span>${escapeHtml(f.file)} ${f.valid ? '✓' : '⚠️ غير صالح'} ${f.recordCount != null ? '— ' + f.recordCount + ' عنصر' : ''}</span>
            <strong>${fmtBytes(f.sizeBytes)} — ${fmtDate(f.lastModified)}</strong>
          </div>`).join('');
      } catch (e) { box.innerHTML = `<p class="muted">تعذر التحميل: ${escapeHtml(e.message)}</p>`; }
    }

    /* ---------- سجل التدقيق ---------- */
    async function loadAudit() {
      const box = document.getElementById('auditLog');
      try {
        const { entries } = await api('/api/developer/audit-log');
        if (!entries.length) { box.innerHTML = '<p class="muted">لا توجد إجراءات مسجّلة بعد.</p>'; return; }
        box.innerHTML = entries.map(a => `
          <div class="overview-row">
            <span><strong>${escapeHtml(a.username)}</strong> — ${escapeHtml(a.action)} ${a.details ? '(' + escapeHtml(a.details) + ')' : ''}</span>
            <strong>${fmtDate(a.timestamp)}</strong>
          </div>`).join('');
      } catch (e) { box.innerHTML = `<p class="muted">تعذر التحميل: ${escapeHtml(e.message)}</p>`; }
    }

    /* ---------- النسخ الاحتياطي ---------- */
    async function loadBackups() {
      const box = document.getElementById('backupsList');
      setupRestoreUpload();
      try {
        const { backups } = await api('/api/developer/backups');
        if (!backups.length) { box.innerHTML = '<p class="muted">لا توجد نسخ احتياطية بعد.</p>'; return; }
        box.innerHTML = backups.map(b => `
          <div class="overview-row">
            <span><strong>${escapeHtml(b.typeLabel || '')}</strong><span class="backup-badge ${b.type === 'site' ? 'site' : ''}">${b.name.endsWith('.zip') ? 'ZIP' : 'TAR.GZ'}</span><br>
              <span class="muted">${fmtDate(b.createdAt)} — ${fmtBytes(b.size)} — ${escapeHtml(b.name)}</span></span>
            <span>
              <a class="btn btn-outline btn-sm" href="/api/developer/backups/${encodeURIComponent(b.name)}/download">تنزيل</a>
              <button class="btn btn-dark btn-sm" data-restore-backup="${escapeHtml(b.name)}">استعادة</button>
              <button class="btn btn-danger btn-sm" data-delete-backup="${escapeHtml(b.name)}">حذف</button>
            </span>
          </div>`).join('');
        box.querySelectorAll('[data-restore-backup]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const name = btn.getAttribute('data-restore-backup');
            if (!confirm('استعادة هذه النسخة؟\n\nستُستبدل بيانات الموقع الحالية (الحسابات، الأعمال، الإعدادات، الرسائل...) والصور بما في النسخة. كود الموقع لا يتغير.\n\nقبل الاستعادة تُنشأ نسخة احتياطية تلقائية من البيانات الحالية للرجوع إليها.')) return;
            btn.disabled = true; btn.textContent = 'جارِ الاستعادة...';
            try {
              const r = await api('/api/developer/backups/' + encodeURIComponent(name) + '/restore', { method: 'POST' });
              alert(`تمت الاستعادة بنجاح ✅\nملفات البيانات: ${r.files} — الصور: ${r.images}\nنسخة الأمان قبل الاستعادة: ${r.safetyBackup}\n\nقد يُطلب منك تسجيل الدخول من جديد.`);
              loadBackups();
            } catch (e) { showToast(e.message); btn.disabled = false; btn.textContent = 'استعادة'; }
          });
        });
        box.querySelectorAll('[data-delete-backup]').forEach(btn => {
          btn.addEventListener('click', async () => {
            const name = btn.getAttribute('data-delete-backup');
            if (!confirm('هل أنت متأكد من حذف هذه النسخة الاحتياطية؟ لا يمكن التراجع.')) return;
            try {
              await api('/api/developer/backups/' + encodeURIComponent(name), { method: 'DELETE' });
              showToast('تم حذف النسخة الاحتياطية.');
              loadBackups();
            } catch (e) { showToast(e.message); }
          });
        });
      } catch (e) { box.innerHTML = `<p class="muted">تعذر التحميل: ${escapeHtml(e.message)}</p>`; }
    }

    function setupRestoreUpload() {
      const form = document.getElementById('restoreUploadForm');
      if (!form || form.dataset.bound) return;
      form.dataset.bound = '1';
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('restoreUploadFile'), msg = document.getElementById('restoreUploadMessage'), btn = document.getElementById('restoreUploadBtn');
        if (!input.files[0]) { msg.textContent = 'اختر ملف النسخة الاحتياطية أولاً.'; return; }
        if (!confirm('استعادة البيانات من هذا الملف؟\n\nستُستبدل بيانات الموقع الحالية والصور بما في الملف. كود الموقع لا يتغير.\nقبل الاستعادة تُنشأ نسخة احتياطية تلقائية من البيانات الحالية.')) return;
        const fd = new FormData(); fd.append('backup', input.files[0], input.files[0].name);
        btn.disabled = true; msg.textContent = 'جارِ رفع الملف واستعادة البيانات... لا تغلق الصفحة.';
        try {
          const res = await fetch('/api/developer/backups/upload-restore', { method: 'POST', credentials: 'same-origin', body: fd });
          let data = {}; try { data = await res.json(); } catch (_) {}
          if (!res.ok) throw new Error(data.error || 'تعذرت الاستعادة.');
          msg.textContent = `تمت الاستعادة بنجاح ✅ ملفات البيانات: ${data.files} — الصور: ${data.images}. نسخة الأمان: ${data.safetyBackup}`;
          input.value = '';
          loadBackups();
        } catch (err) { msg.textContent = err.message; }
        finally { btn.disabled = false; }
      });
    }

    async function loadExports() {
      const box = document.getElementById('exportsList');
      try {
        const { datasets } = await api('/api/developer/exports');
        box.innerHTML = datasets.map(d => `
          <div class="overview-row">
            <span>${escapeHtml(d.label)}</span>
            <span>${d.formats.map(f => `<a class="btn btn-outline btn-sm" href="/api/developer/exports/${encodeURIComponent(d.id)}?format=${f}" download>${f.toUpperCase()}</a>`).join(' ')}</span>
          </div>`).join('');
      } catch (e) { box.innerHTML = `<p class="muted">تعذر التحميل: ${escapeHtml(e.message)}</p>`; }
    }

    /* ---------- التحديثات والإصدارات ---------- */
    let selectedSmartUpdateId = null;
    const updateStatusMap = { READY:'جاهز للفحص/التثبيت', SCHEDULED:'مجدول', APPLYING:'قيد التثبيت', APPLIED:'مثبت', ROLLED_BACK:'تم Rollback', FAILED_APPLY:'فشل التثبيت', NONE:'لا يوجد' };
    function updateStatusLabel(status) { return updateStatusMap[status] || status || '—'; }

    /* ---------- ترقيم تلقائي لرقم الإصدار عند إنشاء تحديث جديد ---------- */
    // بدلاً من إجبار المطوّر على حساب رقم الإصدار التالي يدوياً، يُقترح
    // تلقائياً من الإصدار الحالي المثبَّت + نوع التحديث المختار (Semver:
    // Major يزيد X، Minor/Feature/Design يزيد Y، والباقي يزيد Z). يبقى
    // الحقل قابلاً للتعديل اليدوي — التعديل اليدوي يوقف الاقتراح التلقائي
    // حتى يتغيّر نوع التحديث مجدداً أو يُفرَّغ الحقل.
    let currentAppVersion = '0.0.0';
    let versionAutoFilled = true;
    function parseSemver(v) {
      const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v || '').trim());
      return m ? { major: +m[1], minor: +m[2], patch: +m[3] } : { major: 0, minor: 0, patch: 0 };
    }
    function computeNextVersion(current, releaseType) {
      const { major, minor, patch } = parseSemver(current);
      const type = String(releaseType || 'Patch').toLowerCase();
      if (type === 'major') return `${major + 1}.0.0`;
      if (type === 'minor' || type === 'feature' || type === 'design') return `${major}.${minor + 1}.0`;
      return `${major}.${minor}.${patch + 1}`; // Patch, Security, Bug Fix, Content
    }
    function suggestNextVersion() {
      const input = document.getElementById('smartUpdateVersion');
      const typeSelect = document.getElementById('smartUpdateReleaseType');
      if (!input || !typeSelect) return;
      if (input.value && !versionAutoFilled) return; // المطوّر عدّل القيمة يدوياً بنفسه
      input.value = computeNextVersion(currentAppVersion, typeSelect.value);
      versionAutoFilled = true;
    }

    function renderUpdateDashboard(d) {
      if (!d) return;
      currentAppVersion = d.currentVersion || currentAppVersion;
      document.getElementById('metricCurrentVersion').textContent = d.currentVersion || '—';
      document.getElementById('metricAvailable').textContent = d.availableUpdates ?? 0;
      document.getElementById('metricLastInstalled').textContent = d.lastInstalledVersion || '—';
      document.getElementById('metricScheduled').textContent = d.scheduledUpdates ?? 0;
      const status = d.status === 'UP_TO_DATE' ? '🟢 محدث' : d.status === 'UPDATES_AVAILABLE' ? '🟠 توجد تحديثات' : '🔵 جاهز للإدارة';
      document.getElementById('updateSystemStatus').textContent = status;
      document.getElementById('updateLastUpdate').textContent = d.lastUpdate ? `آخر تحديث: ${fmtDate(d.lastUpdate)} · آخر عملية: ${updateStatusLabel(d.lastStatus)}` : 'لم يتم تثبيت تحديثات من هذا المركز بعد.';
      suggestNextVersion();
    }
    function renderUpdateChecks(p) {
      const checks = p.checks || {};
      const labels = { version:'الإصدار الحالي', compatibility:'التوافق', storage:'مساحة التخزين', permissions:'صلاحيات الملفات', dependencies:'Dependencies', manifest:'Manifest', signature:'Signature', backup:'Backup', migrations:'Migrations' };
      return `<div class="overview-list">${Object.keys(labels).map(k => `<div class="overview-row"><span>${labels[k]}</span><strong>${checks[k] ? '🟢 ناجح' : '🔴 فشل'}</strong></div>`).join('')}</div>`;
    }
    function renderSmartUpdatePreview(update) {
      const box = document.getElementById('smartUpdatePreview'); const meta = document.getElementById('smartUpdatePreviewMeta');
      if (!update) { box.innerHTML = '<p class="muted">اختر تحديثاً من السجل لعرض التفاصيل.</p>'; meta.textContent='اختر تحديثاً من السجل'; selectedSmartUpdateId=null; return; }
      selectedSmartUpdateId = update.id; const p = update.preview || {};
      meta.textContent = `${escapeHtml(update.manifest?.title || 'تحديث')} — v${escapeHtml(update.manifest?.version || '—')}`;
      const changes = p.changes || [];
      const group = (arr, cls, icon, title) => `<div class="card" style="margin:10px 0;padding:12px;"><div class="card-head-row"><strong>${icon} ${title}</strong><span class="muted">${arr.length}</span></div>${arr.length ? `<div class="overview-list">${arr.map(c=>`<div class="overview-row"><code>${escapeHtml(c.path)}</code>${riskBadge(c.risk)}</div>`).join('')}</div>` : '<p class="muted">لا يوجد.</p>'}</div>`;
      const added = (p.diff?.added || []).map(path => ({path,risk:'MEDIUM'})); const modified=(p.diff?.modified || []).map(path=>({path,risk:'MEDIUM'})); const deleted=(p.diff?.deleted || []).map(path=>({path,risk:'HIGH'}));
      const signed = p.signature?.verified ? '🟢 توقيع موثوق' : p.signature?.present ? '🔴 توقيع غير متحقق' : '⚪ بدون توقيع';
      const canApply = ['READY','SCHEDULED'].includes(update.status) && !p.noOp && Object.values(p.checks || {}).every(Boolean);
      box.innerHTML = `<div class="update-preview-head"><div><div class="update-history-title">${escapeHtml(update.manifest?.title || 'تحديث')} — v${escapeHtml(update.manifest?.version || '—')}</div><div class="update-history-meta">الحالي ${escapeHtml(p.currentVersion||'—')} ← الهدف ${escapeHtml(p.targetVersion||update.manifest?.version||'—')} · ${escapeHtml(update.manifest?.releaseType||'Patch')} · ${fmtDate(update.uploadedAt)}</div><p class="form-note">${escapeHtml(update.manifest?.description || 'لا يوجد وصف.')}</p></div><div>${riskBadge(p.overallRisk || 'NONE')}<br><span class="muted">${signed}</span></div></div>
      <div class="dev-grid" style="margin-top:14px;"><div class="dev-stat-card"><span class="num">${p.fileCount||0}</span><span class="label">ملف متأثر</span></div><div class="dev-stat-card"><span class="num">${fmtBytes(p.totalBytes||0)}</span><span class="label">حجم التغيير</span></div><div class="dev-stat-card"><span class="num">${p.needsRestart || update.manifest?.requiresRestart ? 'نعم' : 'لا'}</span><span class="label">إعادة تشغيل</span></div><div class="dev-stat-card"><span class="num">${p.migrations?.length || 0}</span><span class="label">Migrations</span></div></div>
      <h3 style="font-size:14px;margin:16px 0 8px;">Pre-Update Check</h3>${renderUpdateChecks(p)}
      ${group(added,'add','+','الملفات الجديدة')}${group(modified,'modify','~','الملفات المعدلة')}${group(deleted,'delete','−','الملفات المحذوفة')}
      ${p.migrations?.length ? `<div class="update-bundle-rule"><strong>Database Migration:</strong> ${p.migrations.length} migration آمن بصيغة JSON، والملفات المتأثرة: ${escapeHtml((p.migrationDataFiles||[]).join('، ') || '—')}</div>` : ''}
      ${update.manifest?.releaseNotes ? `<div class="update-bundle-rule"><strong>Release Notes</strong><br>${escapeHtml(update.manifest.releaseNotes).replace(/\n/g,'<br>')}</div>` : ''}
      <div class="update-actions" style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">${canApply ? '<button id="applySelectedUpdateBtn" class="btn btn-dark btn-sm">تثبيت التحديث</button>' : ''}${update.status==='SCHEDULED' ? '<button id="cancelScheduleBtn" class="btn btn-outline btn-sm">إلغاء الجدولة</button>' : ''}${update.status==='READY' ? '<button id="scheduleUpdateBtn" class="btn btn-outline btn-sm">جدولة التحديث</button>' : ''}${update.snapshot ? '<button id="rollbackSelectedUpdateBtn" class="btn btn-outline btn-sm">Rollback</button>' : ''}${['READY','SCHEDULED'].includes(update.status) ? '<button id="deleteSelectedUpdateBtn" class="btn btn-outline btn-sm">حذف الحزمة</button>' : ''}</div>`;
      const applyBtn=document.getElementById('applySelectedUpdateBtn');
      if(applyBtn) applyBtn.addEventListener('click', async()=>{ if(!confirm('سيتم إنشاء Backup + Snapshot ثم تثبيت الإصدار. هل تريد المتابعة؟'))return; const steps=['إنشاء النسخة الاحتياطية','فحص التحديث','تثبيت الملفات','تشغيل Migration','Health Check','إكمال التحديث']; showUpdateProgress(steps,0); applyBtn.disabled=true; try{ for(let i=1;i<3;i++){showUpdateProgress(steps,i);await new Promise(r=>setTimeout(r,180));} showUpdateProgress(steps,2); const {update:result}=await api('/api/developer/updates/packages/'+encodeURIComponent(selectedSmartUpdateId)+'/apply',{method:'POST'}); for(let i=3;i<steps.length;i++){showUpdateProgress(steps,i);await new Promise(r=>setTimeout(r,120));} hideUpdateProgress(); renderSmartUpdatePreview(result); await loadSmartUpdates(); showToast('تم تثبيت الإصدار بنجاح.'); }catch(e){hideUpdateProgress();showToast(e.message);applyBtn.disabled=false;} });
      const rb=document.getElementById('rollbackSelectedUpdateBtn'); if(rb) rb.addEventListener('click',async()=>{if(!confirm('سيتم استعادة Snapshot وبيانات Migration المرتبطة بها. هل تريد Rollback؟'))return;rb.disabled=true;try{const{update:result}=await api('/api/developer/updates/packages/'+encodeURIComponent(selectedSmartUpdateId)+'/rollback',{method:'POST'});renderSmartUpdatePreview(result);await loadSmartUpdates();showToast('تم تنفيذ Rollback.');}catch(e){showToast(e.message);rb.disabled=false;}});
      const del=document.getElementById('deleteSelectedUpdateBtn'); if(del) del.addEventListener('click',async()=>{if(!confirm('حذف حزمة التحديث من مركز الإصدارات؟'))return;try{await api('/api/developer/updates/packages/'+encodeURIComponent(selectedSmartUpdateId),{method:'DELETE'});renderSmartUpdatePreview(null);await loadSmartUpdates();showToast('تم حذف الحزمة.');}catch(e){showToast(e.message);}});
      const schedule=document.getElementById('scheduleUpdateBtn'); if(schedule) schedule.addEventListener('click',async()=>{const when=prompt('أدخل موعد التثبيت بصيغة ISO، مثال 2026-09-12T03:00:00+03:00');if(!when)return;try{const{update:result}=await api('/api/developer/updates/packages/'+encodeURIComponent(selectedSmartUpdateId)+'/schedule',{method:'POST',body:JSON.stringify({scheduledAt:when}),headers:{'Content-Type':'application/json'}});renderSmartUpdatePreview(result);await loadSmartUpdates();showToast('تمت جدولة التحديث.');}catch(e){showToast(e.message);}});
      const cancel=document.getElementById('cancelScheduleBtn'); if(cancel) cancel.addEventListener('click',async()=>{try{const{update:result}=await api('/api/developer/updates/packages/'+encodeURIComponent(selectedSmartUpdateId)+'/cancel-schedule',{method:'POST'});renderSmartUpdatePreview(result);await loadSmartUpdates();showToast('تم إلغاء الجدولة.');}catch(e){showToast(e.message);}});
    }
    function showUpdateProgress(steps,index){let box=document.getElementById('updateProgressBox');if(!box){box=document.createElement('div');box.id='updateProgressBox';box.className='card';document.getElementById('smartUpdatePreviewCard').prepend(box);}box.innerHTML=`<strong>جاري تنفيذ التحديث</strong><div class="overview-list" style="margin-top:10px;">${steps.map((x,i)=>`<div class="overview-row"><span>${i<index?'✓':i===index?'●':'○'} ${x}</span><span>${i<index?'تم':i===index?'قيد التنفيذ':'انتظار'}</span></div>`).join('')}</div>`;}
    function hideUpdateProgress(){const box=document.getElementById('updateProgressBox');if(box)box.remove();}
    function renderSmartUpdateHistory(updates){const box=document.getElementById('smartUpdateHistory');if(!updates.length){box.innerHTML='<p class="muted">لا توجد إصدارات في السجل بعد.</p>';return;}box.innerHTML=updates.map(u=>`<div class="overview-row update-history-row"><div style="min-width:0;flex:1;"><div class="update-history-title">${escapeHtml(u.title||'تحديث')} — v${escapeHtml(u.version||'—')}</div><div class="update-history-meta">${escapeHtml(updateStatusLabel(u.status))} · ${escapeHtml(u.releaseType||'Patch')} · ${fmtDate(u.appliedAt||u.uploadedAt)} · رفع بواسطة ${escapeHtml(u.uploadedBy||'—')} ${u.appliedBy?'· تثبيت بواسطة '+escapeHtml(u.appliedBy):''} ${u.scheduledAt?'· مجدول '+fmtDate(u.scheduledAt):''}</div></div><div class="update-actions">${u.mandatory?'⚠️ ':''}${riskBadge(u.overallRisk||'NONE')}<button class="btn btn-outline btn-sm" data-open-update="${escapeHtml(u.id)}">التفاصيل</button></div></div>`).join('');box.querySelectorAll('[data-open-update]').forEach(btn=>btn.addEventListener('click',async()=>{try{const{update}=await api('/api/developer/updates/packages/'+encodeURIComponent(btn.getAttribute('data-open-update')));renderSmartUpdatePreview(update);document.getElementById('smartUpdatePreviewCard').scrollIntoView({behavior:'smooth',block:'start'});}catch(e){showToast(e.message);}}));}
    async function loadSmartUpdates(){try{const d=await api('/api/developer/updates/dashboard');renderUpdateDashboard(d.dashboard);const{updates}=await api('/api/developer/updates/history');renderSmartUpdateHistory(updates);if(selectedSmartUpdateId){try{const{update}=await api('/api/developer/updates/packages/'+encodeURIComponent(selectedSmartUpdateId));renderSmartUpdatePreview(update);}catch(_){}}}catch(e){document.getElementById('smartUpdateHistory').innerHTML=`<p class="muted">تعذر تحميل مركز الإصدارات: ${escapeHtml(e.message)}</p>`;}}
    function renderUpdateReport(report){const box=document.getElementById('updateReport');if(!report){box.innerHTML='<p class="muted">لم يتم تشغيل أي فحص بعد.</p>';return;}const outdatedRows=report.outdated?.length?report.outdated.map(p=>`<div class="overview-row"><span>${escapeHtml(p.name)} — الحالي ${escapeHtml(p.current)} ← الأحدث ${escapeHtml(p.latest)}</span>${riskBadge(p.risk)}</div>`).join(''):'<p class="muted">لا توجد حزم قديمة.</p>';const vulnRows=report.vulnerablePackages?.length?report.vulnerablePackages.map(v=>`<div class="overview-row"><span>${escapeHtml(v.name)} ${v.fixAvailable?'(يوجد إصلاح)':''}</span>${riskBadge(v.severity)}</div>`).join(''):'<p class="muted">لا توجد ثغرات معروفة في الفحص الأخير.</p>';box.innerHTML=`<div class="dev-flex-between"><span class="muted">آخر فحص: ${fmtDate(report.checkedAt)}</span><span>الخطورة: ${riskBadge(report.overallRisk)}</span></div><h3 style="font-size:14px;margin:14px 0 8px;">حزم قديمة</h3><div class="overview-list">${outdatedRows}</div><h3 style="font-size:14px;margin:14px 0 8px;">ثغرات npm audit</h3><div class="overview-list">${vulnRows}</div>`;}
    async function loadUpdateReport(){try{const{report}=await api('/api/developer/updates/report');renderUpdateReport(report);}catch(e){}}

    /* ---------- التحقق من إصدار جديد للتطبيق (مراقبة الإصدار) ---------- */
    function renderVersionCheck(status) {
      const pill = document.getElementById('versionCheckStatusPill');
      const box = document.getElementById('versionCheckResult');
      const lastChecked = document.getElementById('versionCheckLastChecked');
      if (!status) return;
      lastChecked.textContent = status.lastCheckedAt ? `آخر فحص: ${fmtDate(status.lastCheckedAt)}` : 'لم يُفحص بعد.';
      const r = status.lastResult;
      if (!status.checkUrl) {
        pill.textContent = '⚪ غير مُعَدّ';
        box.innerHTML = '<p class="muted">لم يتم تحديد رابط مصدر التحقق بعد — افتح "إعدادات مصدر التحقق" أدناه.</p>';
      } else if (!r) {
        pill.textContent = '⚪ لم يُفحص بعد';
        box.innerHTML = '<p class="muted">اضغط "فحص الآن" لتنفيذ أول فحص.</p>';
      } else if (!r.ok) {
        pill.textContent = '🔴 تعذر آخر فحص';
        box.innerHTML = `<p class="muted">${escapeHtml(r.error || 'تعذر الاتصال بمصدر التحقق.')}</p>`;
      } else if (status.updateAvailable) {
        pill.textContent = `🟠 يوجد إصدار جديد v${escapeHtml(r.latestVersion)}`;
        box.innerHTML = `<div class="overview-row"><span>الإصدار الحالي</span><strong>${escapeHtml(status.currentVersion)}</strong></div>
          <div class="overview-row"><span>أحدث إصدار مُعلَن</span><strong>${escapeHtml(r.latestVersion)}${r.mandatory ? ' ⚠️ إجباري/أمني' : ''}</strong></div>
          ${r.releaseNotes ? `<div class="update-bundle-rule"><strong>ما الجديد</strong><br>${escapeHtml(r.releaseNotes).replace(/\n/g, '<br>')}</div>` : ''}
          ${r.downloadUrl ? `<p class="form-note"><a href="${escapeHtml(r.downloadUrl)}" target="_blank" rel="noopener">رابط الحزمة/التفاصيل ↗</a></p>` : ''}
          <p class="form-note">لتثبيته: نزّل/جهّز حزمة التحديث بهذا الرقم وارفعها عبر "إنشاء تحديث جديد" أدناه.</p>`;
      } else {
        pill.textContent = '🟢 محدث';
        box.innerHTML = `<div class="overview-row"><span>الإصدار الحالي</span><strong>${escapeHtml(status.currentVersion)}</strong></div><p class="muted">لا يوجد إصدار أحدث من الإصدار المُعلَن حالياً.</p>`;
      }
      document.getElementById('versionCheckUrl').value = status.checkUrl || '';
      document.getElementById('versionCheckInterval').value = status.intervalHours || 24;
      document.getElementById('versionCheckAutoEnabled').checked = !!status.autoCheckEnabled;
    }
    async function loadVersionCheck() {
      try { const { status } = await api('/api/developer/version-check'); renderVersionCheck(status); }
      catch (e) { document.getElementById('versionCheckResult').innerHTML = `<p class="muted">تعذر تحميل حالة فحص الإصدار: ${escapeHtml(e.message)}</p>`; }
    }

    /* ---------- وضع الصيانة ---------- */
    async function loadMaintenanceSettings() {
      try {
        const m = await api('/api/developer/maintenance');
        document.getElementById('maintenanceToggle').checked = !!m.enabled;
        document.getElementById('maintenanceMessageAr').value = (m.message && m.message.ar) || '';
        document.getElementById('maintenanceMessageEn').value = (m.message && m.message.en) || '';
        document.getElementById('maintenanceStatus').textContent = m.updatedAt
          ? `آخر تحديث: ${fmtDate(m.updatedAt)} بواسطة ${m.updatedBy || '—'}`
          : '';
      } catch (e) { showToast(e.message); }
    }

    /* ---------- وكلاء الذكاء الاصطناعي ---------- */
    let aiState = null;
    const AI_STATUS = {
      ok: ['ai-status-ok', '● متصل'],
      error: ['ai-status-error', '⚠ خطأ في الاتصال'],
      off: ['ai-status-off', '○ متوقف'],
    };
    function aiStatus(a) {
      if (!a.enabled) return AI_STATUS.off;
      if (a.status?.state === 'error') return AI_STATUS.error;
      if (a.status?.state === 'ok') return AI_STATUS.ok;
      return ['ai-status-off', '● مفعّل (لم يُختبر بعد)'];
    }
    function aiCard(a) {
      const [cls, label] = aiStatus(a);
      const note = a.enabled && a.status?.state === 'error' && a.status.message ? `<p class="form-note ai-status-note">${escapeHtml(a.status.message)} — ${fmtDate(a.status.at)}</p>` : '';
      const lim = aiState.limits;
      return `
      <article class="card ai-agent-card" data-agent="${escapeHtml(a.id)}">
        <div class="ai-agent-head">
          <div><h3>${escapeHtml(a.name)}</h3><span class="ai-status ${cls}">${label}</span></div>
          <label class="ai-switch" title="تشغيل / إيقاف"><input type="checkbox" data-f="enabled" ${a.enabled ? 'checked' : ''}><span></span></label>
        </div>
        ${note}
        <div class="form-field">
          <label>API Key</label>
          <div class="ai-key-row">
            <input type="password" data-f="apiKey" maxlength="4096" autocomplete="new-password" spellcheck="false" dir="ltr" placeholder="${a.hasKey ? '•••••••••••• ' + escapeHtml(a.keyHint) : 'أدخل المفتاح'}">
            <button type="button" class="btn btn-outline btn-sm" data-act="reveal">إظهار</button>
          </div>
          <p class="form-note">${a.hasKey ? 'مفتاح محفوظ ومشفّر (ينتهي بـ ' + escapeHtml(a.keyHint) + '). اكتب مفتاحاً جديداً لاستبداله فقط.' : 'لا يوجد مفتاح محفوظ.'}</p>
        </div>
        <div class="form-field">
          <label>Model</label>
          <div class="ai-key-row">
            <input type="text" data-f="model" list="ai-models-${escapeHtml(a.id)}" maxlength="160" dir="ltr" spellcheck="false" value="${escapeHtml(a.model)}" placeholder="اختر أو اكتب معرّف النموذج">
            <button type="button" class="btn btn-outline btn-sm" data-act="models">جلب النماذج</button>
          </div>
          <datalist id="ai-models-${escapeHtml(a.id)}"></datalist>
        </div>
        <div class="form-grid ai-mini-grid">
          <div class="form-field"><label>الأولوية</label><input type="number" data-f="priority" min="${lim.priority[0]}" max="${lim.priority[1]}" value="${a.priority}"></div>
          <div class="form-field"><label>Temperature</label><input type="number" data-f="temperature" step="0.1" min="${lim.temperature[0]}" max="${lim.temperature[1]}" value="${a.temperature}"></div>
          <div class="form-field"><label>Max tokens</label><input type="number" data-f="maxTokens" min="${lim.maxTokens[0]}" max="${lim.maxTokens[1]}" value="${a.maxTokens}"></div>
          <div class="form-field"><label>Timeout (ms)</label><input type="number" data-f="timeout" step="1000" min="${lim.timeout[0]}" max="${lim.timeout[1]}" value="${a.timeout}"></div>
        </div>
        <details class="ai-extra">
          <summary>تعليمات إضافية لهذا الوكيل فقط</summary>
          <textarea data-f="systemInstructions" rows="3" placeholder="اختياري — تُضاف بعد التعليمات العامة">${escapeHtml(a.systemInstructions)}</textarea>
        </details>
        <div class="ai-agent-actions">
          <button type="button" class="btn btn-dark btn-sm" data-act="save">حفظ</button>
          <button type="button" class="btn btn-outline btn-sm" data-act="test">اختبار الاتصال</button>
          ${a.hasKey ? '<button type="button" class="btn btn-outline btn-sm" data-act="remove-key">حذف المفتاح</button>' : ''}
        </div>
        <p class="form-note" data-msg></p>
      </article>`;
    }
    function renderAiAgents() {
      const grid = document.getElementById('aiAgentsGrid');
      const agents = aiState.agents.slice().sort((x, y) => x.priority - y.priority);
      grid.innerHTML = agents.map(aiCard).join('');
      grid.querySelectorAll('.ai-agent-card').forEach(wireAiCard);
      document.getElementById('aiDefaultAgent').value = aiState.defaultAgent;
    }
    function fillAiInstructions() {
      document.querySelectorAll('#aiInstructionsForm [data-ins]').forEach((el) => { el.value = aiState.instructions[el.dataset.ins] || ''; });
    }
    async function loadAiAgents() {
      try {
        aiState = await api('/api/developer/ai-agents');
        renderAiAgents();
        fillAiInstructions();
      } catch (e) {
        document.getElementById('aiAgentsGrid').innerHTML = `<p class="muted">تعذر التحميل: ${escapeHtml(e.message)}</p>`;
      }
    }
    function wireAiCard(card) {
      const id = card.dataset.agent;
      const msg = card.querySelector('[data-msg]');
      const field = name => card.querySelector(`[data-f="${name}"]`);
      const say = (text, ok) => { msg.textContent = text; msg.style.color = ok === false ? 'var(--danger)' : ''; };
      async function save(extra = {}) {
        const body = {
          model: field('model').value.trim(),
          priority: Number(field('priority').value),
          temperature: Number(field('temperature').value),
          maxTokens: Number(field('maxTokens').value),
          timeout: Number(field('timeout').value),
          systemInstructions: field('systemInstructions').value,
          ...extra,
        };
        const key = field('apiKey').value.trim();
        if (key) body.apiKey = key;
        aiState = await api('/api/developer/ai-agents/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify(body) });
        renderAiAgents();
      }
      field('enabled').addEventListener('change', async (e) => {
        try { await save({ enabled: e.target.checked }); showToast(e.target.checked ? 'تم تشغيل الوكيل.' : 'تم إيقاف الوكيل.'); }
        catch (err) { e.target.checked = !e.target.checked; say(err.message, false); }
      });
      card.querySelector('[data-act="reveal"]').addEventListener('click', (e) => {
        const input = field('apiKey');
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        e.currentTarget.textContent = show ? 'إخفاء' : 'إظهار';
      });
      card.querySelector('[data-act="save"]').addEventListener('click', async () => {
        try { await save(); showToast('تم حفظ إعداد الوكيل.'); } catch (err) { say(err.message, false); }
      });
      card.querySelector('[data-act="test"]').addEventListener('click', async (e) => {
        const b = e.currentTarget; b.disabled = true; say('جارِ اختبار الاتصال...');
        try {
          if (field('apiKey').value.trim() || field('model').value.trim() !== (aiState.agents.find(a => a.id === id)?.model || '')) await save();
          const r = await api('/api/developer/ai-agents/' + encodeURIComponent(id) + '/test', { method: 'POST' });
          aiState = await api('/api/developer/ai-agents');
          renderAiAgents();
          const fresh = document.querySelector(`.ai-agent-card[data-agent="${id}"] [data-msg]`);
          if (fresh) { fresh.textContent = r.ok ? `✓ الاتصال ناجح خلال ${r.latencyMs}ms` : `✗ ${r.error}`; fresh.style.color = r.ok ? '' : 'var(--danger)'; }
        } catch (err) { say(err.message, false); b.disabled = false; }
      });
      card.querySelector('[data-act="models"]').addEventListener('click', async (e) => {
        const b = e.currentTarget; b.disabled = true; say('جارِ جلب النماذج المتاحة لهذا المفتاح...');
        try {
          if (field('apiKey').value.trim()) await save();
          const r = await api('/api/developer/ai-agents/' + encodeURIComponent(id) + '/models', { method: 'POST' });
          const list = document.getElementById('ai-models-' + id);
          if (list) list.innerHTML = r.models.map(m => `<option value="${escapeHtml(m)}"></option>`).join('');
          const current = document.querySelector(`.ai-agent-card[data-agent="${id}"] [data-f="model"]`);
          if (current) current.focus();
          const fresh = document.querySelector(`.ai-agent-card[data-agent="${id}"] [data-msg]`);
          if (fresh) fresh.textContent = r.models.length ? `تم جلب ${r.models.length} نموذجاً — اختر من القائمة في حقل Model ثم احفظ.` : 'لم يُعثر على نماذج لهذا المفتاح.';
        } catch (err) { say(err.message, false); } finally { b.disabled = false; }
      });
      const rm = card.querySelector('[data-act="remove-key"]');
      if (rm) rm.addEventListener('click', async () => {
        if (!confirm('حذف مفتاح API لهذا الوكيل؟ سيتم إيقاف الوكيل.')) return;
        try { aiState = await api('/api/developer/ai-agents/' + encodeURIComponent(id) + '/key', { method: 'DELETE' }); renderAiAgents(); showToast('تم حذف المفتاح.'); }
        catch (err) { say(err.message, false); }
      });
    }
    function wireAiAgents() {
      document.getElementById('aiDefaultAgent').addEventListener('change', async (e) => {
        try { aiState = await api('/api/developer/ai-agents/default', { method: 'PUT', body: JSON.stringify({ defaultAgent: e.target.value }) }); showToast('تم حفظ الوكيل الافتراضي.'); }
        catch (err) { showToast(err.message); e.target.value = aiState.defaultAgent; }
      });
      document.getElementById('aiInstructionsForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const body = {};
        document.querySelectorAll('#aiInstructionsForm [data-ins]').forEach((el) => { body[el.dataset.ins] = el.value; });
        try { aiState = await api('/api/developer/ai-agents/instructions', { method: 'PUT', body: JSON.stringify(body) }); showToast('تم حفظ التعليمات.'); }
        catch (err) { showToast(err.message); }
      });
      document.getElementById('aiInstructionsReset').addEventListener('click', async () => {
        if (!confirm('استعادة التعليمات الافتراضية؟ ستُستبدل التعليمات الحالية.')) return;
        try { aiState = await api('/api/developer/ai-agents/instructions/reset', { method: 'POST' }); fillAiInstructions(); showToast('تمت استعادة التعليمات الافتراضية.'); }
        catch (err) { showToast(err.message); }
      });
      document.getElementById('aiPreviewForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('aiPreviewInput');
        const box = document.getElementById('aiPreviewResult');
        const btn = e.submitter || e.target.querySelector('button');
        if (!input.value.trim()) return;
        btn.disabled = true; box.hidden = false; box.textContent = 'جارِ انتظار الرد...';
        try {
          const r = await api('/api/developer/ai-agents/preview', { method: 'POST', body: JSON.stringify({ message: input.value }) });
          const name = (aiState.agents.find(a => a.id === r.agentId) || {}).name || '';
          box.innerHTML = r.ok
            ? `<span class="ai-preview-meta">أجاب: ${escapeHtml(name)}${r.handoff ? ' — سيُحوَّل للموظف' : ''}</span><div class="ai-preview-text">${escapeHtml(r.reply)}</div>`
            : `<span class="ai-preview-meta">${escapeHtml(r.error)}</span>`;
          aiState = await api('/api/developer/ai-agents'); renderAiAgents();
        } catch (err) { box.textContent = err.message; } finally { btn.disabled = false; }
      });
    }

    /* ---------- الميزات التجريبية ---------- */
    async function loadFeatureFlags() {
      const box = document.getElementById('featureFlagsList');
      try {
        const { flags } = await api('/api/developer/feature-flags');
        const keys = Object.keys(flags);
        if (!keys.length) { box.innerHTML = '<p class="muted">لا توجد ميزات تجريبية معرَّفة بعد.</p>'; return; }
        box.innerHTML = keys.map(k => `
          <div class="overview-row">
            <span>${escapeHtml(k)}</span>
            <label class="dev-switch-label">
              <input type="checkbox" data-flag-key="${escapeHtml(k)}" ${flags[k].enabled ? 'checked' : ''}>
              ${flags[k].enabled ? 'مفعّلة' : 'معطّلة'}
            </label>
          </div>`).join('');
        box.querySelectorAll('[data-flag-key]').forEach(input => {
          input.addEventListener('change', async () => {
            const key = input.getAttribute('data-flag-key');
            try {
              await api('/api/developer/feature-flags', { method: 'POST', body: JSON.stringify({ key, enabled: input.checked }) });
              showToast('تم تحديث الميزة.');
              loadFeatureFlags();
            } catch (e) { showToast(e.message); }
          });
        });
      } catch (e) { box.innerHTML = `<p class="muted">تعذر التحميل: ${escapeHtml(e.message)}</p>`; }
    }

    /* ---------- ربط الأزرار ---------- */
    function wireButtons() {
      document.getElementById('refreshHealthBtn').addEventListener('click', loadHealth);
      document.getElementById('refreshSecurityBtn').addEventListener('click', loadSecurity);
      document.getElementById('refreshErrorsBtn').addEventListener('click', loadErrors);
      document.getElementById('refreshPerfBtn').addEventListener('click', loadPerformance);
      document.getElementById('refreshDbBtn').addEventListener('click', loadDatabase);
      document.getElementById('refreshAuditBtn').addEventListener('click', loadAudit);

      document.getElementById('refreshBackupsBtn').addEventListener('click', loadBackups);
      document.getElementById('createBackupBtn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = 'جارِ الإنشاء والتحقق...';
        const msg = document.getElementById('createBackupMessage');
        msg.textContent = '';
        const type = (document.querySelector('input[name="backupType"]:checked') || {}).value || 'data';
        try {
          const { backup } = await api('/api/developer/backups', { method: 'POST', body: JSON.stringify({ type }) });
          msg.textContent = `تم إنشاء النسخة والتحقق من سلامتها: ${backup.files} ملف — ${fmtBytes(backup.size)}.`;
          showToast('تم إنشاء النسخة الاحتياطية والتحقق من سلامتها بنجاح.');
          loadBackups();
        } catch (e2) {
          msg.textContent = e2.message;
          showToast(e2.message);
        } finally {
          btn.disabled = false;
          btn.textContent = 'إنشاء النسخة الآن';
        }
      });

      document.getElementById('refreshSmartUpdatesBtn').addEventListener('click', loadSmartUpdates);

      document.getElementById('runVersionCheckBtn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true; btn.textContent = 'جارِ الفحص...';
        try {
          const { status } = await api('/api/developer/version-check/run', { method: 'POST' });
          renderVersionCheck(status);
          showToast(status.lastResult && status.lastResult.ok ? (status.updateAvailable ? `يوجد إصدار جديد v${status.lastResult.latestVersion}` : 'التطبيق محدث لآخر إصدار.') : (status.lastResult && status.lastResult.error) || 'تعذر تنفيذ الفحص.');
        } catch (e2) {
          showToast(e2.message);
        } finally {
          btn.disabled = false; btn.textContent = 'فحص الآن';
        }
      });

      document.getElementById('versionCheckSettingsForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = document.getElementById('versionCheckSettingsMessage');
        try {
          const { status } = await api('/api/developer/version-check/settings', {
            method: 'PATCH',
            body: JSON.stringify({
              checkUrl: document.getElementById('versionCheckUrl').value.trim(),
              intervalHours: Number(document.getElementById('versionCheckInterval').value),
              autoCheckEnabled: document.getElementById('versionCheckAutoEnabled').checked,
            }),
          });
          renderVersionCheck(status);
          msg.textContent = 'تم حفظ إعدادات فحص الإصدار.';
          showToast('تم حفظ إعدادات فحص الإصدار.');
        } catch (e2) {
          msg.textContent = e2.message;
        }
      });

      document.getElementById('smartUpdateReleaseType').addEventListener('change', suggestNextVersion);
      document.getElementById('smartUpdateVersion').addEventListener('input', () => { versionAutoFilled = false; });
      suggestNextVersion();

      document.getElementById('smartUpdateUploadForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const input=document.getElementById('smartUpdatePackage'), message=document.getElementById('smartUpdateUploadMessage'), btn=document.getElementById('uploadSmartUpdateBtn');
        if(!input.files.length){message.textContent='اختر ملف ZIP أولاً.';return;}
        const fd=new FormData(e.currentTarget); fd.set('requiresRestart',document.getElementById('smartUpdateRestart').checked?'true':'false'); fd.set('requiresMigration',document.getElementById('smartUpdateMigration').checked?'true':'false'); fd.set('mandatory',document.getElementById('smartUpdateMandatory').checked?'true':'false');
        btn.disabled=true;btn.textContent='جارِ الرفع والفحص...';message.textContent='';
        try{const res=await fetch('/api/developer/updates/upload',{method:'POST',credentials:'same-origin',body:fd});let data={};try{data=await res.json();}catch(_){}if(!res.ok)throw new Error(data.error||'تعذر رفع التحديث.');message.textContent='تم رفع التحديث وفحصه بنجاح. راجع المعاينة قبل التثبيت.';input.value='';versionAutoFilled=true;renderSmartUpdatePreview(data.update);await loadSmartUpdates();showToast('التحديث جاهز للمراجعة.');}catch(err){message.textContent=err.message;}finally{btn.disabled=false;btn.textContent='رفع وفحص التحديث';}
      });

      document.getElementById('updatePolicyForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try{await api('/api/developer/updates/settings',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({retentionCount:Number(document.getElementById('updateRetentionCount').value),maintenanceDuringUpdate:document.getElementById('updateMaintenanceToggle').checked,autoRollbackOnHealthFailure:document.getElementById('updateAutoRollbackToggle').checked})});document.getElementById('updatePolicyMessage').textContent='تم حفظ السياسة.';showToast('تم حفظ سياسة التحديثات.');}catch(err){showToast(err.message);}
      });

      document.getElementById('runUpdateCheckBtn').addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = 'جارِ الفحص... قد يستغرق دقيقة';
        try {
          const { report } = await api('/api/developer/updates/check', { method: 'POST' });
          renderUpdateReport(report);
          showToast('اكتمل فحص التحديثات.');
        } catch (e2) {
          showToast(e2.message);
        } finally {
          btn.disabled = false;
          btn.textContent = 'تشغيل فحص جديد';
        }
      });

      wireAiAgents();

      document.getElementById('saveMaintenanceBtn').addEventListener('click', async () => {
        try {
          const enabled = document.getElementById('maintenanceToggle').checked;
          const ar = document.getElementById('maintenanceMessageAr').value.trim();
          const en = document.getElementById('maintenanceMessageEn').value.trim();
          const result = await api('/api/developer/maintenance', {
            method: 'POST',
            body: JSON.stringify({ enabled, message: { ar, en } }),
          });
          showToast(enabled ? 'تم تفعيل وضع الصيانة على الموقع العام.' : 'تم إيقاف وضع الصيانة.');
          document.getElementById('maintenanceStatus').textContent =
            `آخر تحديث: ${fmtDate(result.maintenance.updatedAt)} بواسطة ${result.maintenance.updatedBy}`;
        } catch (e) { showToast(e.message); }
      });

      document.getElementById('addFlagBtn').addEventListener('click', async () => {
        const input = document.getElementById('newFlagKey');
        const key = input.value.trim();
        if (!key) return;
        try {
          await api('/api/developer/feature-flags', { method: 'POST', body: JSON.stringify({ key, enabled: false }) });
          input.value = '';
          showToast('تمت إضافة الميزة (معطّلة افتراضياً).');
          loadFeatureFlags();
        } catch (e) { showToast(e.message); }
      });

      document.getElementById('devResetSetupBtn').addEventListener('click', async () => {
        const confirmed = confirm('⚠️ تحذير: سيؤدي هذا إلى حذف جميع حسابات المطورين والرجوع إلى صفحة الإعداد الأولية. هل تريد المتابعة؟');
        if (!confirmed) return;

        const confirmedAgain = confirm('هل أنت متأكد تماماً؟ لا يمكن التراجع عن هذا الإجراء.');
        if (!confirmedAgain) return;

        const reset = prompt('اكتب "reset" للتأكيد النهائي:');
        if (reset !== 'reset') {
          showToast('تم الإلغاء. لم تتم إعادة التعيين.');
          return;
        }

        try {
          document.getElementById('devResetSetupBtn').disabled = true;
          document.getElementById('devResetSetupBtn').textContent = 'جارِ إعادة التعيين...';
          const result = await api('/api/developer/reset-setup', { method: 'POST' });
          try { if (result.setupGrant) sessionStorage.setItem('alomran_dev_setup_grant', result.setupGrant); } catch (_) {}
          showToast('تم إعادة تعيين الإعدادات. سيتم نقلك إلى صفحة الإعداد...');
          setTimeout(() => { window.location.href = '/developer-setup'; }, 1500);
        } catch (err) {
          document.getElementById('devResetSetupBtn').disabled = false;
          document.getElementById('devResetSetupBtn').textContent = 'إعادة تعيين الإعدادات';
          document.getElementById('devResetSetupMessage').textContent = err.message;
        }
      });
    }

    init();
  }
})();
