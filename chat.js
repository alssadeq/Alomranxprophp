(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const SESSION_KEY = 'alomran_chat_session';
  const PROFILE_KEY = 'alomran_chat_profile';
  const VISITOR_KEY = 'alomran_chat_visitor';
  const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

  let settings = null;
  let conv = null;
  let chatToken = '';

  function storageGet(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; }
  }
  function storageSet(key, value) {
    try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }

  let visitorId = storageGet(VISITOR_KEY);
  if (!visitorId) { visitorId = crypto.randomUUID(); storageSet(VISITOR_KEY, visitorId); }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function api(url, opt = {}) {
    const headers = { ...(opt.headers || {}) };
    if (chatToken) headers['X-Chat-Token'] = chatToken;
    if (!(opt.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const r = await fetch(url, { credentials: 'same-origin', ...opt, headers });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error || 'تعذر تنفيذ العملية'); e.status = r.status; throw e; }
    return d;
  }

  function showError(message) {
    const box = $('smartChatError');
    box.textContent = message || '';
    box.hidden = !message;
  }

  /* ---------- عرض المحادثة ---------- */
  // زر داخل رسالة المساعد: واتساب أو اتصال أو نموذج طلب المشروع
  function ctaButton(cta) {
    if (!cta || !settings) return '';
    const href = cta.type === 'whatsapp' ? `https://wa.me/${settings.whatsapp}?text=${encodeURIComponent('السلام عليكم، أرغب في الاستفسار عن خدمات العمران الذهبية.')}`
      : cta.type === 'call' ? 'tel:' + settings.phone : cta.type === 'brief' ? '/brief' : '';
    if (!href || (cta.type === 'whatsapp' && !settings.whatsapp)) return '';
    const icon = cta.type === 'whatsapp' ? '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z"/></svg>' : cta.type === 'call' ? '📞' : '📝';
    const ext = cta.type === 'whatsapp' ? ' target="_blank" rel="noopener"' : '';
    return `<a class="smart-chat-cta is-${esc(cta.type)}" href="${esc(href)}"${ext}>${icon}<span>${esc(cta.label || '')}</span></a>`;
  }
  // علامات رسائل العميل: ✓ تم الإرسال، ✓✓ تم الاستلام، ✓✓ ملونة تمت القراءة
  function chatTicks(status) {
    const label = { sent: 'تم الإرسال', delivered: 'تم الاستلام', read: 'تمت القراءة' }[status];
    if (!label) return '';
    const second = status === 'sent' ? '' : '<path d="M8.4 8.6l1.4 1.4L16.5 2.5"/>';
    return `<svg class="chat-ticks is-${status}" viewBox="0 0 18 12" role="img" aria-label="${label}"><title>${label}</title><path d="M1.2 6.4l3.6 3.6L11.5 2.5"/>${second}</svg>`;
  }
  function addMessage(m) {
    const box = $('smartChatMessages');
    const el = document.createElement('div');
    el.className = 'smart-chat-msg ' + (['ai', 'human', 'system', 'customer'].includes(m.sender) ? m.sender : 'ai');
    const time = m.createdAt ? new Date(m.createdAt).toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }) : '';
    const link = m.attachment ? `<a href="${esc(m.attachment.url)}" target="_blank" rel="noopener">📎 ${esc(m.attachment.name)}</a>` : '';
    const who = m.sender === 'human' && m.staffName ? `<span class="smart-chat-staff">${esc(m.staffName)} · خدمة العملاء</span>` : '';
    const opts = Array.isArray(m.options) && m.options.length ? `<div class="smart-chat-options">${m.options.map(o => `<button type="button" data-service-option="${esc(o)}">${esc(o)}</button>`).join('')}</div>` : '';
    el.innerHTML = `${who}<div>${esc(m.text).replace(/\n/g, '<br>')}${opts}${ctaButton(m.cta)}</div>${link}<small>${esc(time)}${m.sender === 'customer' ? ' ' + chatTicks(m.status) : ''}</small>`;
    box.appendChild(el);
  }

  function renderConversation() {
    const box = $('smartChatMessages');
    box.innerHTML = '';
    (conv?.messages || []).forEach(addMessage);
    box.scrollTop = box.scrollHeight;
    renderHeader();
    if (!$('smartChatQuick').hidden) renderQuickReplies();
  }

  function renderQuickReplies() {
    const q = $('smartChatQuick');
    q.innerHTML = '';
    // زر ثابت للتحويل إلى موظف ما دامت المحادثة مع المساعد الآلي
    if (settings?.humanEnabled !== false && conv && conv.mode !== 'human') {
      const h = document.createElement('button');
      h.type = 'button';
      h.className = 'smart-chat-human';
      h.textContent = '👤 التواصل مع موظف';
      h.onclick = () => act('human', 'أرغب في التواصل مع موظف');
      q.appendChild(h);
    }
    (settings?.quickReplies || []).filter(x => x.action !== 'human').forEach((x) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = x.text;
      b.onclick = () => act(x.action, x.text, x.id);
      q.appendChild(b);
    });
  }

  function renderHeader() {
    if (!settings) return;
    const agent = conv && conv.mode === 'human' ? conv.agent : null;
    if (agent) {
      $('smartChatName').textContent = agent.name;
      $('smartChatStatus').textContent = agent.online ? '● متصل الآن — خدمة العملاء' : '○ خدمة العملاء — سيعود للرد قريباً';
      return;
    }
    $('smartChatStatus').textContent = settings.open ? '● متصل الآن' : '● خارج أوقات العمل';
    if (settings.assistantName) $('smartChatName').textContent = settings.assistantName;
    if (settings.assistantImage) $('smartChatAvatar').innerHTML = `<img src="${esc(settings.assistantImage)}" alt="">`;
  }

  // مرحلتان: نموذج بيانات الزائر قبل بدء المحادثة، ثم المحادثة نفسها.
  function showStage(stage) {
    const chatting = stage === 'chat';
    $('smartChatIntro').hidden = chatting;
    $('smartChatMessages').hidden = !chatting;
    $('smartChatQuick').hidden = !chatting;
    $('smartChatForm').hidden = !chatting;
    if (chatting) {
      renderConversation();
      renderQuickReplies();
      $('smartChatText').focus();
    } else {
      const profile = storageGet(PROFILE_KEY) || {};
      $('smartChatIntroName').value = $('smartChatIntroName').value || profile.name || '';
      $('smartChatIntroPhone').value = $('smartChatIntroPhone').value || profile.localPhone || '';
      if (profile.dial && $('smartChatIntroDial').querySelector(`option[value="${profile.dial}"]`)) $('smartChatIntroDial').value = profile.dial;
      $('smartChatIntroEmail').value = $('smartChatIntroEmail').value || profile.email || '';
      $('smartChatIntroName').focus();
    }
  }

  function applyFab() {
    const f = settings?.fab || {};
    const w = $('smartChatFab');
    w.style.setProperty('--fab-color', f.color || '#1E2A32');
    w.style.setProperty('--fab-size', (f.size || 58) + 'px');
    w.style.setProperty('--fab-radius', (f.radius ?? 999) + 'px');
    if (f.position === 'right') { w.style.left = 'auto'; w.style.right = (f.offsetX || 22) + 'px'; }
    else { w.style.right = 'auto'; w.style.left = (f.offsetX || 22) + 'px'; }
    w.style.bottom = (f.offsetY || 22) + 'px';
    $('smartChatFabButton').style.display = settings?.enabled === false ? 'none' : '';
  }

  /* ---------- استئناف محادثة سابقة ---------- */
  async function resumeSaved() {
    const saved = storageGet(SESSION_KEY);
    if (!saved || !saved.id || !saved.token || Date.now() - (saved.savedAt || 0) > SESSION_MAX_AGE) return false;
    chatToken = saved.token;
    try {
      const d = await api('/api/chat/conversations/' + encodeURIComponent(saved.id));
      conv = d.conversation;
      if (conv.status === 'closed') throw new Error('closed');
      return true;
    } catch (_) {
      chatToken = '';
      conv = null;
      storageSet(SESSION_KEY, null);
      return false;
    }
  }

  /* ---------- تحديث مباشر: ردود فريق خدمة العملاء ---------- */
  // كل 4 ثوانٍ والنافذة مفتوحة، وكل 20 ثانية وهي مغلقة (لإظهار عدد الرسائل الجديدة)،
  // ويتوقف عندما تكون الصفحة في الخلفية.
  let pollTimer = null;
  let seenCount = 0;
  const lastId = (c) => { const m = c?.messages || []; return m.length ? m[m.length - 1].id : ''; };
  function updateBadge() {
    const badge = $('smartChatBadge');
    const open = !$('smartChatPanel').hidden;
    if (open && conv) seenCount = conv.messages.length;
    const fresh = conv && !open ? conv.messages.slice(seenCount).filter(m => m.sender !== 'customer').length : 0;
    badge.textContent = fresh;
    badge.hidden = !fresh;
  }
  function schedulePoll() {
    clearTimeout(pollTimer);
    if (!conv) return;
    pollTimer = setTimeout(pollOnce, $('smartChatPanel').hidden ? 20000 : 4000);
  }
  async function pollOnce() {
    if (!conv) return;
    if (document.hidden) { schedulePoll(); return; }
    try {
      // read=1 فقط والمحادثة ظاهرة أمام العميل، فتظهر رسائل الفريق عنده كمقروءة
      const viewing = !$('smartChatPanel').hidden && !$('smartChatMessages').hidden;
      const d = await api('/api/chat/conversations/' + encodeURIComponent(conv.id) + (viewing ? '?read=1' : ''));
      const receipts = (c) => (c?.messages || []).map(m => m.status || '').join();
      const changed = lastId(d.conversation) !== lastId(conv) || receipts(d.conversation) !== receipts(conv) || JSON.stringify(d.conversation.agent) !== JSON.stringify(conv.agent) || d.conversation.mode !== conv.mode;
      conv = d.conversation;
      if (changed && !$('smartChatPanel').hidden && !$('smartChatMessages').hidden) {
        const box = $('smartChatMessages');
        const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
        const keep = box.scrollTop;
        renderConversation();
        if (!atBottom) box.scrollTop = keep;
      }
      updateBadge();
    } catch (err) {
      if (err.status === 403 || err.status === 404) { conv = null; chatToken = ''; storageSet(SESSION_KEY, null); return; }
    }
    schedulePoll();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && conv) pollOnce(); });

  /* ---------- فتح وإغلاق ---------- */
  async function open() {
    if (settings?.enabled === false) return;
    $('smartChatPanel').hidden = false;
    $('smartChatFabButton').setAttribute('aria-expanded', 'true');
    showError('');
    if (conv || await resumeSaved()) { showStage('chat'); updateBadge(); pollOnce(); }
    else showStage('intro');
  }

  function close() {
    $('smartChatPanel').hidden = true;
    $('smartChatFabButton').setAttribute('aria-expanded', 'false');
    $('smartChatFabButton').focus();
    if (conv) seenCount = conv.messages.length;
    schedulePoll();
  }

  async function startConversation(e) {
    e.preventDefault();
    showError('');
    const dial = $('smartChatIntroDial').value;
    // الرقم المحلي بدون الصفر في بدايته، بأرقام لاتينية: 0555... ← +966555...
    const localPhone = $('smartChatIntroPhone').value.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/\D/g, '').replace(/^0+/, '');
    if ($('smartChatIntroName').value.trim().length < 2) { showError('يرجى إدخال الاسم (حرفان على الأقل).'); $('smartChatIntroName').focus(); return; }
    if (localPhone.length < 6) { showError('يرجى إدخال رقم جوال صحيح.'); $('smartChatIntroPhone').focus(); return; }
    const customer = {
      name: $('smartChatIntroName').value.trim(),
      phone: `+${dial}${localPhone}`,
      email: $('smartChatIntroEmail').value.trim(),
    };
    const button = $('smartChatIntro').querySelector('button[type=submit]');
    button.disabled = true;
    try {
      const d = await api('/api/chat/conversations', { method: 'POST', body: JSON.stringify({ visitorId, customer }) });
      conv = d.conversation;
      chatToken = d.accessToken || '';
      if (d.settings) { settings = d.settings; renderHeader(); }
      storageSet(SESSION_KEY, { id: conv.id, token: chatToken, savedAt: Date.now() });
      storageSet(PROFILE_KEY, { name: customer.name, email: customer.email, dial, localPhone });
      showStage('chat');
      schedulePoll();
    } catch (err) {
      showError(err.message);
    } finally {
      button.disabled = false;
    }
  }

  // عند انتهاء صلاحية المحادثة المحفوظة (حُذفت أو أُغلقت) نعيد الزائر لنموذج البداية.
  function handleConversationError(err) {
    if (err.status === 403 || err.status === 404) {
      conv = null;
      chatToken = '';
      storageSet(SESSION_KEY, null);
      showStage('intro');
      showError('انتهت المحادثة السابقة. أدخل بياناتك لبدء محادثة جديدة.');
    } else {
      showError(err.message);
    }
  }

  async function postMessage(payload) {
    if (!conv) { showStage('intro'); return null; }
    const d = await api('/api/chat/messages', { method: 'POST', body: JSON.stringify({ conversationId: conv.id, ...payload }) });
    conv = d.conversation;
    renderConversation();
    return d;
  }

  async function send(quickReplyId) {
    const input = $('smartChatText');
    const text = input.value.trim();
    if (!text || !conv) return;
    showError('');
    input.value = '';
    // تظهر رسالة الزائر فوراً قبل وصول الرد.
    addMessage({ sender: 'customer', text, createdAt: new Date().toISOString() });
    $('smartChatMessages').scrollTop = $('smartChatMessages').scrollHeight;
    try {
      await postMessage(typeof quickReplyId === 'string' ? { text, quickReplyId } : { text });
    } catch (err) {
      input.value = text;
      renderConversation();
      handleConversationError(err);
    }
  }

  // اختيار خدمة من قائمة الخدمات داخل المحادثة
  $('smartChatMessages').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-service-option]');
    if (!b || !conv) return;
    const name = b.dataset.serviceOption;
    showError('');
    try { await postMessage({ text: 'أرغب في معرفة تفاصيل خدمة: ' + name, serviceOption: name }); }
    catch (err) { handleConversationError(err); }
  });

  async function act(action, text, quickReplyId) {
    showError('');
    try {
      if (action === 'service_request') {
        await postMessage({ text: text || 'أريد طلب خدمة', action: 'service_request', quickReplyId });
        // يظهر الرد التلقائي أولاً ثم يُنقل العميل إلى نموذج بريف المشروع
        setTimeout(() => { window.location.href = '/brief'; }, 2200);
        return;
      }
      if (action === 'whatsapp' || action === 'call') {
        // يظهر رد تلقائي فيه زر واتساب/اتصال (فتح النوافذ بعد انتظار الخادم تحجبه متصفحات الجوال)
        await postMessage({ text, action, quickReplyId });
        return;
      }
      if (action === 'human') {
        await postMessage({ text: 'أرغب في التحدث مع موظف', action: 'human' });
        return;
      }
      $('smartChatText').value = text || '';
      await send(quickReplyId);
    } catch (err) {
      handleConversationError(err);
    }
  }

  async function attach(e) {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f || !conv) return;
    showError('');
    const fd = new FormData();
    try {
      const img = window.compressImage ? await window.compressImage(f, 'chat') : f;
      fd.append('file', img, img.name || f.name);
      const d = await api('/api/chat/attachments', { method: 'POST', body: fd, headers: { 'X-Chat-Conversation': conv.id } });
      conv = d.conversation;
      renderConversation();
    } catch (err) {
      handleConversationError(err);
    }
  }

  $('smartChatFabButton').onclick = () => ($('smartChatPanel').hidden ? open() : close());
  // رابط «تواصل معنا» في القائمة يفتح نافذة المحادثة. إن كانت المحادثة متوقفة أو لم
  // تُحمّل إعداداتها، يبقى الرابط كما هو وينتقل لقسم التواصل.
  document.addEventListener('click', (e) => {
    const link = e.target.closest && e.target.closest('[data-open-chat]');
    if (!link || !settings || settings.enabled === false) return;
    e.preventDefault();
    if ($('smartChatPanel').hidden) open();
  });
  $('smartChatClose').onclick = close;
  $('smartChatMin').onclick = close;
  $('smartChatIntro').onsubmit = startConversation;
  $('smartChatForm').onsubmit = (e) => { e.preventDefault(); send(); };
  // مربع الكتابة يبدأ بسطر واحد ويكبر مع النص حتى حد أقصى
  const growInput = () => { const t = $('smartChatText'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 110) + 'px'; };
  $('smartChatText').addEventListener('input', growInput);
  $('smartChatForm').addEventListener('submit', () => setTimeout(growInput));
  $('smartChatText').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  });
  $('smartChatFile').onchange = attach;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('smartChatPanel').hidden) close(); });

  (async () => {
    try {
      settings = await api('/api/chat/settings');
      renderHeader();
      applyFab();
      // محادثة محفوظة: نستأنف المتابعة بصمت لإظهار ردود الفريق حتى والنافذة مغلقة
      if (await resumeSaved()) { seenCount = conv.messages.length; schedulePoll(); }
    } catch (_) {}
  })();
})();
