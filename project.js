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
  const settings = await loadPublicSettings();
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
