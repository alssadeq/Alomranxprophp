// js/image-compress.js
// ضغط الصور في المتصفح قبل رفعها: تصغير أبعادها لتناسب المكان الذي تظهر فيه
// (خلفية بعرض الشاشة، صورة قسم، صورة مشروع، شعار...) ثم حفظها بصيغة WebP أو JPEG.
// الصورة الأصلية تُرفع كما هي إذا كانت SVG/ICO/GIF أو إذا لم يُنتج الضغط ملفاً أصغر.
(function () {
  // أقصى عرض × ارتفاع لكل استخدام، وجودة الحفظ
  const PRESETS = {
    background: { w: 1920, h: 1280, q: 0.8 },  // خلفيات الأقسام ورؤوس الصفحات والبانرات
    section: { w: 1400, h: 1400, q: 0.82 },    // صورة القسم (مربع الصورة)
    work: { w: 1600, h: 1200, q: 0.82 },       // صور المشاريع
    logo: { w: 640, h: 640, q: 0.9, alpha: true },
    icon: { w: 256, h: 256, q: 0.9, alpha: true },
    chat: { w: 1600, h: 1600, q: 0.8 },        // مرفقات المحادثة
    document: { w: 2000, h: 2000, q: 0.86 },   // صور الشهادات والتراخيص (تبقى نصوصها مقروءة)
    share: { w: 1200, h: 1200, q: 0.86, jpeg: true }, // صورة مشاركة الرابط: JPEG لأنه مدعوم في كل التطبيقات
  };
  const SKIP = /^image\/(svg\+xml|x-icon|vnd\.microsoft\.icon|gif)$/;

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('تعذر قراءة الصورة.')); };
      img.src = url;
    });
  }
  const toBlob = (canvas, type, q) => new Promise(r => canvas.toBlob(r, type, q));

  function hasTransparency(ctx, w, h) {
    try {
      const d = ctx.getImageData(0, 0, w, h).data;
      for (let i = 3; i < d.length; i += 16) if (d[i] < 250) return true;
    } catch (_) {}
    return false;
  }

  async function compressImage(file, preset) {
    const p = PRESETS[preset] || PRESETS.section;
    if (!file || !/^image\//.test(file.type) || SKIP.test(file.type)) return file;
    let img;
    try { img = await loadImage(file); } catch (_) { return file; }
    const scale = Math.min(1, p.w / img.naturalWidth, p.h / img.naturalHeight);
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    // صورة صغيرة الحجم وضمن الأبعاد: لا داعي لإعادة ترميزها
    if (scale === 1 && file.size < 150 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    const transparent = file.type !== 'image/jpeg' && hasTransparency(ctx, w, h);

    let blob = p.jpeg ? null : await toBlob(canvas, 'image/webp', p.q);
    if (!blob || blob.type !== 'image/webp') {
      // متصفح لا يدعم WebP: JPEG للصور المعتمة و PNG للشفافة
      if (transparent && !p.jpeg) blob = await toBlob(canvas, 'image/png');
      else {
        const c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
        const x = c2.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(canvas, 0, 0);
        blob = await toBlob(c2, 'image/jpeg', p.q);
      }
    }
    if (!blob || blob.size >= file.size) return file;
    const ext = { 'image/webp': '.webp', 'image/jpeg': '.jpg', 'image/png': '.png' }[blob.type] || '';
    const name = (file.name || 'image').replace(/\.[^.]+$/, '') + ext;
    try { return new File([blob], name, { type: blob.type, lastModified: Date.now() }); }
    catch (_) { blob.name = name; return blob; }
  }

  async function compressImages(files, preset) {
    const out = [];
    for (const f of Array.from(files || [])) out.push(await compressImage(f, preset));
    return out;
  }

  window.compressImage = compressImage;
  window.compressImages = compressImages;
})();
