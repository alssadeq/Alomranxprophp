(() => {
  'use strict';
  const form = document.getElementById('briefForm');
  const errorBox = document.getElementById('briefError');
  const fileInput = document.getElementById('bf-files');
  const fileList = document.getElementById('bf-file-list');
  const progress = document.getElementById('briefProgress');

  const MAX_FILES = 10;
  const MAX_FILE = 15 * 1024 * 1024;
  const MAX_TOTAL = 60 * 1024 * 1024;
  const EXT_RE = /\.(pdf|jpe?g|png|webp|dwg)$/i;
  const CATEGORIES = [
    ['drawings', 'المخططات الهندسية'], ['land_plan', 'مخطط الأرض'], ['site_photos', 'صور الموقع'],
    ['designs', 'التصاميم'], ['pdf', 'ملف PDF'], ['other', 'مستندات أخرى'],
  ];
  let files = []; // [{ file, category }]

  const toLatin = (s) => String(s || '').replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660));
  const fmtSize = (b) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = !message;
    if (message) errorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function guessCategory(file) {
    if (/\.pdf$/i.test(file.name)) return 'pdf';
    if (/\.dwg$/i.test(file.name)) return 'drawings';
    return 'site_photos';
  }

  function renderFiles() {
    fileList.replaceChildren(...files.map((item, i) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.className = 'fname';
      name.textContent = item.file.name;
      const size = document.createElement('span');
      size.className = 'fsize';
      size.dir = 'ltr';
      size.textContent = fmtSize(item.file.size);
      const select = document.createElement('select');
      select.setAttribute('aria-label', 'نوع الملف');
      for (const [v, t] of CATEGORIES) select.add(new Option(t, v, false, v === item.category));
      select.addEventListener('change', () => { item.category = select.value; });
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'إزالة';
      remove.addEventListener('click', () => { files.splice(i, 1); renderFiles(); });
      li.append(name, size, select, remove);
      return li;
    }));
  }

  fileInput.addEventListener('change', () => {
    showError('');
    const problems = [];
    for (const file of fileInput.files) {
      if (!EXT_RE.test(file.name)) { problems.push(`"${file.name}": نوع غير مسموح.`); continue; }
      if (file.size > MAX_FILE) { problems.push(`"${file.name}": أكبر من 15 ميجابايت.`); continue; }
      if (files.length >= MAX_FILES) { problems.push(`الحد الأقصى ${MAX_FILES} ملفات.`); break; }
      if (files.some(f => f.file.name === file.name && f.file.size === file.size)) continue;
      files.push({ file, category: guessCategory(file) });
    }
    fileInput.value = '';
    renderFiles();
    if (problems.length) showError(problems.join(' '));
  });

  // إظهار الحقول الشرطية
  function syncConditional() {
    const budget = form.querySelector('input[name=budget]:checked');
    document.getElementById('bf-amount-wrap').hidden = !(budget && budget.value === 'specific');
    document.getElementById('bf-scope-other-wrap').hidden = !form.querySelector('input[name=scope][value=other]').checked;
  }
  form.addEventListener('change', syncConditional);

  function collect() {
    const fd = new FormData(form);
    const value = (k) => String(fd.get(k) || '').trim();
    const localPhone = toLatin(value('phone')).replace(/\D/g, '').replace(/^0+/, '');
    return {
      website: value('website'),
      name: value('name'),
      phone: localPhone ? `+${value('dial')}${localPhone}` : '',
      email: value('email'),
      city: value('city'),
      district: value('district'),
      preferredContact: value('preferredContact'),
      projectType: value('projectType'),
      projectName: value('projectName'),
      location: value('location'),
      description: String(fd.get('description') || '').trim(),
      siteStatus: value('siteStatus'),
      landArea: toLatin(value('landArea')),
      builtArea: toLatin(value('builtArea')),
      floors: toLatin(value('floors')),
      units: toLatin(value('units')),
      requiredArea: toLatin(value('requiredArea')),
      budget: value('budget'),
      budgetAmount: toLatin(value('budgetAmount')),
      startWhen: value('startWhen'),
      targetDate: value('targetDate'),
      hasDeadline: value('hasDeadline'),
      scope: fd.getAll('scope'),
      scopeOther: value('scopeOther'),
      specialRequirements: String(fd.get('specialRequirements') || '').trim(),
      consent: fd.get('consent') === 'on',
      categories: files.map(f => f.category),
    };
  }

  function localCheck(d) {
    if (d.name.length < 2) return 'يرجى إدخال الاسم الكامل.';
    if (!d.phone) return 'يرجى إدخال رقم الجوال.';
    if (d.preferredContact === 'email' && !d.email) return 'أدخل بريدك الإلكتروني أو اختر وسيلة تواصل أخرى.';
    if (d.city.length < 2) return 'يرجى إدخال المدينة.';
    if (!d.projectType) return 'يرجى اختيار نوع المشروع.';
    if (d.location.length < 2) return 'يرجى إدخال موقع المشروع.';
    if (d.description.length < 10) return 'يرجى كتابة وصف المشروع بالتفصيل.';
    if (d.budget === 'specific' && !d.budgetAmount) return 'يرجى إدخال مبلغ الميزانية المحددة بالريال.';
    if (files.reduce((s, f) => s + f.file.size, 0) > MAX_TOTAL) return 'الحجم الإجمالي للملفات أكبر من 60 ميجابايت.';
    if (!d.consent) return 'يرجى الموافقة على استخدام بياناتك للتواصل معك بخصوص الطلب.';
    return '';
  }

  // XHR بدل fetch لإظهار تقدم رفع الملفات.
  function send(body) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/briefs');
      xhr.withCredentials = true;
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) progress.firstElementChild.style.width = `${Math.round((e.loaded / e.total) * 100)}%`;
      });
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch (_) {}
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || 'تعذر إرسال الطلب. حاول مرة أخرى.'));
      };
      xhr.onerror = () => reject(new Error('تعذر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى.'));
      xhr.send(body);
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    const data = collect();
    const problem = localCheck(data);
    if (problem) return showError(problem);
    const button = form.querySelector('button[type=submit]');
    button.disabled = true;
    button.textContent = 'جارِ الإرسال...';
    const body = new FormData();
    body.append('data', JSON.stringify(data));
    for (const f of files) body.append('files[]', f.file, f.file.name);
    progress.hidden = !files.length;
    progress.firstElementChild.style.width = '0';
    try {
      const res = await send(body);
      document.getElementById('briefRef').textContent = res.ref;
      document.getElementById('briefMailNote').hidden = !data.email;
      const link = document.getElementById('briefReportLink');
      if (res.reportUrl) link.href = res.reportUrl; else link.hidden = true;
      form.hidden = true;
      document.getElementById('briefDone').hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      showError(err.message);
    } finally {
      button.disabled = false;
      button.textContent = 'إرسال طلب المشروع';
      progress.hidden = true;
    }
  });
})();
