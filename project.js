/* =========================================================
   منطق صفحة تفاصيل المشروع (project.html)
   يعتمد على الدوال المشتركة الموجودة في script.js (يجب تحميله أولاً):
   getLang, pick, escapeHtml, CATEGORY_LABELS, loadPublicSettings,
   buildProjectCard, observeReveal
   ========================================================= */
(async function initProjectDetail() {
  const params = new URLSearchParams(window.location.search);
  const workId = params.get('id');

  const titleEl = document.getElementById('pd-title');
  const breadcrumbTitleEl = document.getElementById('pd-breadcrumb-title');
  const categoryEl = document.getElementById('pd-category');
  const metaEl = document.getElementById('pd-meta');
  const descEl = document.getElementById('pd-description');
  const galleryEl = document.getElementById('pd-gallery');
  const relatedGrid = document.getElementById('relatedWorksGrid');

  if (!workId) {
    window.location.href = 'projects.html';
    return;
  }

  let works = [];
  try {
    const res = await fetch('/api/works/public');
    const data = await res.json();
    works = data.works || [];
  } catch (e) {
    galleryEl.innerHTML = '<p class="muted" style="text-align:center;">تعذر تحميل بيانات المشروع.</p>';
    return;
  }

  const work = works.find(w => w.id === workId);
  if (!work) {
    window.location.href = 'projects.html';
    return;
  }

  const title = pick(work.title);
  const city = pick(work.city);
  const meta = pick(work.meta);
  const area = pick(work.area);
  const description = pick(work.description);
  const categoryLabel = CATEGORY_LABELS[getLang()][work.category] || work.category;

  document.title = title + ' | العمران الذهبية للمقاولات العامة';
  titleEl.textContent = title;
  breadcrumbTitleEl.textContent = title;
  categoryEl.textContent = categoryLabel;
  metaEl.textContent = [city, meta, area].filter(Boolean).join(' ‧ ');
  descEl.textContent = description;
  if (!description) descEl.style.display = 'none';

  /* ---------- بطاقة المشروع أعلى الصور (تصميم الهوية) ---------- */
  const cardSettings = await loadPublicSettings();
  if (work.showCard !== false) {
    renderProjectCard(work, cardSettings, categoryLabel);
    document.getElementById('pd-hero').hidden = true;
    document.getElementById('pd-description-section').hidden = true;
    document.getElementById('pd-card-section').hidden = false;
    document.getElementById('pd-card-breadcrumb-title').textContent = title;
    document.querySelector('.pd-gallery-section').classList.add('is-after-card');
  }

  /* ---------- كل صور المشروع، مكدّسة عمودياً بدون قص ---------- */
  const images = work.images && work.images.length ? work.images : [];
  if (images.length) {
    galleryEl.innerHTML = images.map((src, i) => `
      <img src="${escapeAttr(safeUrl(src, ""))}" alt="${escapeHtml(title)} - ${i + 1}" class="project-detail-image" loading="${i === 0 ? 'eager' : 'lazy'}">
    `).join('');
  } else {
    galleryEl.innerHTML = '<p class="muted" style="text-align:center;">لا توجد صور مرفوعة لهذا المشروع بعد.</p>';
  }

  /* ---------- أعمال مقترحة: حتى 6، بالأولوية لنفس التصنيف ---------- */
  const settings = cardSettings;
  const projectLogo = settings ? settings.projectLogo : null;
  const logoSrc = (projectLogo && projectLogo.visible && projectLogo.image) ? projectLogo.image : '';

  const others = works.filter(w => w.id !== work.id);
  const sameCategory = others.filter(w => w.category === work.category);
  const otherCategory = others.filter(w => w.category !== work.category);
  const suggested = sameCategory.concat(otherCategory).slice(0, 6);

  if (suggested.length) {
    relatedGrid.innerHTML = '';
    suggested.forEach(w => relatedGrid.appendChild(buildProjectCard(w, logoSrc)));
    if (typeof observeReveal === 'function') observeReveal(relatedGrid);
  } else {
    relatedGrid.innerHTML = '<p class="muted" style="text-align:center;grid-column:1/-1;">لا توجد أعمال أخرى بعد.</p>';
  }
})();

/* =========================================================
   بطاقة المشروع: اسم المشروع، المالك، نوع المشروع، المساحة،
   الوصف، وجهة التنفيذ مع شعار الشركة. تظهر فوق صور المشروع مباشرة.
   ========================================================= */
const PD_ICONS = {
  building: '<svg viewBox="0 0 24 24"><path d="M4 21V5l8-3v19M12 21h8V9l-8-3"/><path d="M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2"/></svg>',
  layers: '<svg viewBox="0 0 24 24"><path d="M12 3 2 8l10 5 10-5-10-5Z"/><path d="m2 13 10 5 10-5"/><path d="m2 17.5 10 5 10-5" opacity=".55"/></svg>',
  owner: '<svg viewBox="0 0 24 24"><path d="M3 21h18"/><path d="M5 21V8h4v13M10 21V3h5v18M16 21v-9h3v9"/></svg>',
  area: '<svg viewBox="0 0 24 24"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7M3 9V3h6M21 15v6h-6M3 3l7 7M21 21l-7-7"/></svg>',
  info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v6M12 7.5v.01"/></svg>',
  photos: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>',
  residential: '<svg viewBox="0 0 24 24"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
  commercial: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2"/></svg>',
  industrial: '<svg viewBox="0 0 24 24"><path d="M2 21V10l10-6 10 6v11"/><path d="M6 21v-8h12v8M6 16h12M6 19h12"/></svg>',
};
const PD_TEXT = {
  ar: { projects: 'المشاريع', projectsEn: 'Our Projects', name: 'اسم المشروع', owner: 'المالك', type: 'نوع المشروع', area: 'مساحة المشروع', desc: 'وصف المشروع', exec: 'تنفيذ', photos: 'صور المشروع', company: 'شركة العمران الذهبية للمقاولات العامة', companyEn: 'Al-Omran Al-Dhahabia General Contracting Company' },
  en: { projects: 'Projects', projectsEn: 'المشاريع', name: 'Project name', owner: 'Owner', type: 'Project type', area: 'Project area', desc: 'Project description', exec: 'Executed by', photos: 'Project photos', company: 'Al-Omran Al-Dhahabia General Contracting Company', companyEn: 'شركة العمران الذهبية للمقاولات العامة' },
};

function renderProjectCard(work, settings, categoryLabel) {
  const box = document.getElementById('pd-card');
  if (!box) return;
  const lang = getLang() === 'en' ? 'en' : 'ar';
  const t = PD_TEXT[lang];
  const other = lang === 'ar' ? 'en' : 'ar';
  const v = (f) => pick(work[f]);
  const vOther = (f) => (work[f] && work[f][other] && work[f][other] !== v(f)) ? work[f][other] : '';
  const e = escapeHtml;
  const title = v('title');
  const titleOther = vOther('title');
  const type = v('projectType') || categoryLabel;
  const owner = v('owner');
  const area = v('area');
  const desc = v('description') || v('meta');
  const execMain = v('executedBy') || t.company;
  const execSub = v('executedBy') ? vOther('executedBy') : t.companyEn;
  const cover = (work.images && work.images[0]) ? safeUrl(work.images[0], '') : '';
  const logo = safeUrl((settings && settings.logo) || '/images/alomran-logo.png', '/images/alomran-logo.png');
  const catIcon = PD_ICONS[work.category] || PD_ICONS.building;
  const fact = (icon, label, value) => value ? `
      <div class="pd-fact">
        <span class="pd-ico" aria-hidden="true">${icon}</span>
        <span class="pd-fact-label">${e(label)}</span>
        <strong class="pd-fact-value">${e(value)}</strong>
      </div>` : '';

  box.innerHTML = `
    <header class="pd-card-hero${cover ? '' : ' no-photo'}">
      <div class="pd-card-headtext">
        <div class="pd-ribbon">
          <span class="pd-ico" aria-hidden="true">${PD_ICONS.building}</span>
          <span><b>${e(t.projects)}</b><small>${e(t.projectsEn)}</small></span>
        </div>
        <span class="pd-type-ico" aria-hidden="true">${catIcon}</span>
        <h1 class="pd-title">${e(title)}</h1>
        ${titleOther ? `<p class="pd-title-sub" dir="auto">${e(titleOther)}</p>` : ''}
        <span class="pd-rule" aria-hidden="true"></span>
      </div>
      ${cover ? `<div class="pd-card-photo"><img src="${escapeAttr(cover)}" alt="${escapeAttr(title)}"></div>` : ''}
    </header>

    <div class="pd-facts">
      ${fact(PD_ICONS.layers, t.name, title)}
      ${fact(PD_ICONS.owner, t.owner, owner)}
      ${fact(catIcon, t.type, type)}
      ${fact(PD_ICONS.area, t.area, area)}
    </div>

    ${desc ? `
    <section class="pd-desc">
      <h2 class="pd-tab"><span class="pd-ico" aria-hidden="true">${PD_ICONS.info}</span>${e(t.desc)}</h2>
      <div class="pd-desc-body">
        <p>${e(desc).replace(/\n/g, '<br>')}</p>
        <svg class="pd-sketch" viewBox="0 0 220 110" aria-hidden="true"><path d="M8 96h204M20 96V52l70-26 110 22v48M20 52l110 18 70-22M130 70v26M40 96V70h20v26M66 96V73h20v23M92 96V76h20v20M150 96V72h16v24M174 96V66h16v30"/></svg>
      </div>
    </section>` : ''}

    <div class="pd-exec">
      <span class="pd-exec-badge">${e(t.exec)}</span>
      <div class="pd-exec-name">
        <strong>${e(execMain)}</strong>
        ${execSub ? `<small dir="auto">${e(execSub)}</small>` : ''}
      </div>
      <img class="pd-exec-logo" src="${escapeAttr(logo)}" alt="${escapeAttr(t.company)}">
    </div>

    <div class="pd-photos-title">
      <span class="pd-ico" aria-hidden="true">${PD_ICONS.photos}</span>
      <h2>${e(t.photos)}</h2>
      <span class="pd-photos-line" aria-hidden="true"></span>
    </div>
  `;
}
