// js/review.js — صفحة تقييم العميل (/review/<token>)
// نموذج من 3 خطوات: التقييم العام بالنجوم، ثم تفاصيل التجربة (اختيارية)، ثم الرأي
// بكلمات العميل مع معاينة حيّة لشكله في الموقع. البيانات من window.__REVIEW__.
(function () {
  const data = window.__REVIEW__;
  const token = location.pathname.split('/').filter(Boolean).pop();
  const $ = (id) => document.getElementById(id);

  const T = {
    ar: {
      hello: (n) => n ? `أهلاً ${n} 👋` : 'أهلاً بك 👋',
      sub: (p) => p ? `يسعدنا معرفة رأيك في تجربتك معنا في «${p}». تقييمك يساعدنا على تقديم خدمة أفضل دائماً، ولن يستغرق أكثر من دقيقة.` : 'يسعدنا معرفة رأيك في تجربتك معنا. تقييمك يساعدنا على تقديم خدمة أفضل دائماً، ولن يستغرق أكثر من دقيقة.',
      stepRate: 'التقييم', stepDetails: 'التفاصيل', stepWords: 'رأيك',
      q1: 'كيف تقيّم تجربتك العامة مع العمران؟',
      moods: ['اختر عدد النجوم', 'ضعيفة', 'مقبولة', 'جيدة', 'جيدة جداً', 'ممتازة'],
      q2: 'قيّم جوانب التجربة', q2hint: 'اختياري — اضغط على النجوم لكل جانب.',
      criteria: { quality: 'جودة التنفيذ', timing: 'الالتزام بالمواعيد', communication: 'التواصل والتعامل', safety: 'النظافة والسلامة في الموقع', value: 'القيمة مقابل السعر' },
      qRecommend: 'هل تنصح غيرك بالتعامل معنا؟', yes: 'نعم، أنصح بها', notSure: 'لست متأكداً',
      q3: 'اكتب رأيك بكلماتك', textPh: 'مثال: تعاملت مع العمران في بناء فيلتي، وكانت التجربة ممتازة من حيث جودة التنفيذ والالتزام بالموعد…',
      chips: ['جودة تنفيذ عالية', 'التزام بالمواعيد', 'فريق محترف ومتعاون', 'تواصل سريع وواضح', 'أسعار مناسبة', 'نظافة الموقع والسلامة'],
      yourName: 'الاسم الظاهر مع التقييم', yourRole: 'الصفة أو المدينة (اختياري)', rolePh: 'مثال: مالك فيلا – جدة',
      consent: 'أوافق على نشر تقييمي واسمي في موقع العمران الذهبية.',
      previewLabel: 'معاينة شكل تقييمك في الموقع',
      back: 'السابق', next: 'التالي', submit: 'إرسال التقييم', sending: 'جارِ الإرسال…',
      needStars: 'اختر عدد النجوم أولاً.', needText: 'اكتب رأيك بكلمات قليلة على الأقل.', failed: 'تعذر الإرسال، حاول مرة أخرى.',
      thanksTitle: 'شكراً لك! وصلنا تقييمك 🌟', thanksText: 'نقدّر وقتك ورأيك كثيراً، فهو يساعدنا على التطوير المستمر وتقديم الأفضل لعملائنا.',
      doneTitle: 'شكراً لك! تقييمك وصلنا مسبقاً 🌟',
      invalidTitle: 'رابط التقييم غير صالح', invalidText: 'قد يكون الرابط ناقصاً أو حُذف. تواصل معنا وسنرسل لك رابطاً جديداً.',
      visit: 'زيارة موقع العمران', tagline: 'العمران… ثقة وإتقان', lang: 'English', anon: 'عميل العمران',
    },
    en: {
      hello: (n) => n ? `Hello ${n} 👋` : 'Hello 👋',
      sub: (p) => p ? `We'd love to hear about your experience with us on “${p}”. Your feedback helps us keep improving — it takes less than a minute.` : `We'd love to hear about your experience with us. Your feedback helps us keep improving — it takes less than a minute.`,
      stepRate: 'Rating', stepDetails: 'Details', stepWords: 'Your words',
      q1: 'How would you rate your overall experience with Alomran?',
      moods: ['Pick your stars', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'],
      q2: 'Rate the details', q2hint: 'Optional — tap the stars for each aspect.',
      criteria: { quality: 'Build quality', timing: 'Meeting deadlines', communication: 'Communication', safety: 'Site cleanliness & safety', value: 'Value for money' },
      qRecommend: 'Would you recommend us to others?', yes: 'Yes, I would', notSure: 'Not sure',
      q3: 'Tell us in your own words', textPh: 'e.g. Alomran built our villa — great build quality and they delivered on time…',
      chips: ['High build quality', 'On-time delivery', 'Professional team', 'Clear communication', 'Fair prices', 'Clean & safe site'],
      yourName: 'Name shown with your review', yourRole: 'Role or city (optional)', rolePh: 'e.g. Villa owner – Jeddah',
      consent: 'I agree to have my review and name published on the Alomran website.',
      previewLabel: 'Preview of your review on our website',
      back: 'Back', next: 'Next', submit: 'Send review', sending: 'Sending…',
      needStars: 'Please pick your star rating first.', needText: 'Please write a few words.', failed: 'Could not send. Please try again.',
      thanksTitle: 'Thank you! We got your review 🌟', thanksText: 'We truly appreciate your time and feedback — it helps us keep getting better for our clients.',
      doneTitle: 'Thank you! We already have your review 🌟',
      invalidTitle: 'Invalid review link', invalidText: 'The link may be incomplete or removed. Contact us and we will send you a new one.',
      visit: 'Visit Alomran website', tagline: 'Trust & Precision', lang: 'العربية', anon: 'Alomran client',
    },
  };
  const EMOJI = ['⭐', '😞', '😐', '🙂', '😀', '🤩'];
  let lang = 'ar';
  try { if (localStorage.getItem('rv-lang') === 'en') lang = 'en'; } catch (_) {}
  const state = { step: 1, rating: 0, criteria: {}, recommend: null };
  const t = () => T[lang];

  $('rvHero').src = window.__REVIEW_HERO__ || '/images/review-share.jpg';

  function applyLang() {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'en' ? 'ltr' : 'rtl';
    document.querySelectorAll('[data-t]').forEach(el => { const v = t()[el.dataset.t]; if (typeof v === 'string') el.textContent = v; });
    $('rvLang').textContent = t().lang;
    if (data) {
      $('rvHello').textContent = t().hello(data.name);
      $('rvSub').textContent = t().sub(data.project);
      if (data.done) document.querySelector('#rvThanks h1').textContent = t().doneTitle;
    }
    $('rvText').placeholder = t().textPh;
    $('rvRole').placeholder = t().rolePh;
    renderStars(); renderCriteria(); renderChips(); updatePreview();
  }

  function starButtons(box, value, onPick, size) {
    box.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'rv-star' + (i <= value ? ' on' : '') + (size ? ' ' + size : '');
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', i === value ? 'true' : 'false');
      b.setAttribute('aria-label', i + ' / 5'); b.textContent = '★';
      b.addEventListener('click', () => onPick(i));
      b.addEventListener('mouseenter', () => box.querySelectorAll('.rv-star').forEach((s, k) => s.classList.toggle('hover', k < i)));
      box.appendChild(b);
    }
    box.onmouseleave = () => box.querySelectorAll('.rv-star').forEach(s => s.classList.remove('hover'));
  }

  function renderStars() {
    starButtons($('rvStars'), state.rating, (i) => {
      state.rating = i; renderStars(); updatePreview(); $('rvError').textContent = '';
      $('rvMood').classList.remove('pop'); void $('rvMood').offsetWidth; $('rvMood').classList.add('pop');
    });
    $('rvEmoji').textContent = EMOJI[state.rating];
    $('rvMoodText').textContent = t().moods[state.rating];
  }

  function renderCriteria() {
    const box = $('rvCriteria'); box.innerHTML = '';
    Object.keys(T.ar.criteria).forEach(k => {
      const row = document.createElement('div'); row.className = 'rv-crit';
      const label = document.createElement('span'); label.textContent = t().criteria[k];
      const stars = document.createElement('div'); stars.className = 'rv-mini';
      starButtons(stars, state.criteria[k] || 0, (i) => { state.criteria[k] = i; renderCriteria(); }, 'sm');
      row.append(label, stars); box.appendChild(row);
    });
  }

  function renderChips() {
    const box = $('rvChips'); box.innerHTML = '';
    t().chips.forEach(c => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = '+ ' + c;
      b.addEventListener('click', () => {
        const ta = $('rvText'); const cur = ta.value.trim();
        if (cur.includes(c)) return;
        ta.value = cur ? cur.replace(/[.،,]?$/, lang === 'en' ? ', ' : '، ') + c : c;
        b.classList.add('used'); ta.dispatchEvent(new Event('input'));
      });
      box.appendChild(b);
    });
  }

  function updatePreview() {
    $('pvStars').textContent = '★'.repeat(state.rating) + '☆'.repeat(5 - state.rating);
    $('pvText').textContent = $('rvText').value.trim() || t().textPh;
    const name = $('rvName').value.trim() || t().anon;
    $('pvName').textContent = name;
    $('pvRole').textContent = $('rvRole').value.trim();
    $('pvAvatar').textContent = name.charAt(0);
  }

  function go(step) {
    state.step = step;
    document.querySelectorAll('.rv-step').forEach(s => s.classList.toggle('is-on', +s.dataset.step === step));
    document.querySelectorAll('.rv-steps li').forEach((li, i) => { li.classList.toggle('is-on', i < step); li.classList.toggle('is-cur', i === step - 1); });
    $('rvBar').style.width = (step / 3 * 100) + '%';
    $('rvBack').hidden = step === 1;
    $('rvNext').hidden = step === 3;
    $('rvSubmit').hidden = step !== 3;
    $('rvError').textContent = '';
    if (step === 3) setTimeout(() => $('rvText').focus(), 50);
  }

  function init() {
    if (!data) { $('rvInvalid').hidden = false; return applyLang(); }
    if (data.done) { $('rvThanks').hidden = false; return applyLang(); }
    $('rvForm').hidden = false;
    $('rvName').value = data.name || '';
    applyLang(); go(1);

    $('rvNext').addEventListener('click', () => {
      if (state.step === 1 && !state.rating) { $('rvError').textContent = t().needStars; return; }
      go(state.step + 1);
      document.querySelector('.rv-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('rvBack').addEventListener('click', () => go(state.step - 1));
    document.querySelectorAll('#rvRecommend button').forEach(b => b.addEventListener('click', () => {
      state.recommend = b.dataset.v === 'yes';
      document.querySelectorAll('#rvRecommend button').forEach(x => x.classList.toggle('on', x === b));
    }));
    ['rvText', 'rvName', 'rvRole'].forEach(id => $(id).addEventListener('input', () => { $('rvCount').textContent = $('rvText').value.length; updatePreview(); }));

    $('rvF').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!state.rating) { go(1); $('rvError').textContent = t().needStars; return; }
      if ($('rvText').value.trim().length < 10) { $('rvError').textContent = t().needText; $('rvText').focus(); return; }
      const btn = $('rvSubmit'); btn.disabled = true; btn.textContent = t().sending;
      try {
        const res = await fetch('/api/review/' + encodeURIComponent(token), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rating: state.rating, criteria: state.criteria, recommend: state.recommend,
            text: $('rvText').value, name: $('rvName').value, role: $('rvRole').value,
            consent: $('rvConsent').checked, lang,
          }),
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok && res.status !== 409) throw new Error(out.error || t().failed);
        $('rvForm').hidden = true; $('rvThanks').hidden = false;
        $('rvThanks').classList.add('celebrate');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err) {
        $('rvError').textContent = err.message || t().failed;
      } finally { btn.disabled = false; btn.textContent = t().submit; }
    });
  }

  $('rvLang').addEventListener('click', () => {
    lang = lang === 'ar' ? 'en' : 'ar';
    try { localStorage.setItem('rv-lang', lang); } catch (_) {}
    applyLang();
  });
  init();
})();
