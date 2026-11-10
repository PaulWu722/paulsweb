/* 簡易活動登記 LIFF App */
(() => {
  const CFG = window.APP_CONFIG || {};
  const API_URL = CFG.SUPABASE_URL ? CFG.SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/api' : CFG.GAS_URL;
  const DEMO = !API_URL;
  const $app = document.getElementById('app');
  const $bar = document.getElementById('actionbar');
  const DRAFT_KEY = 'event-draft-v2';

  const state = { profile: null, idToken: null, liffReady: false, homeTab: 'new' };

  // ================= 常數 =================
  const THEMES = [
    { id: 'classic', name: '經典', c1: '#2f3a4f', c2: '#c8955a' },
    { id: 'feast', name: '愛筵聚餐', c1: '#a63d2a', c2: '#e3a857' },
    { id: 'prayer', name: '禱告', c1: '#2c4f8a', c2: '#9db7e0' },
    { id: 'gospel', name: '福音開展', c1: '#2e7050', c2: '#a3c98a' },
    { id: 'youth', name: '青年', c1: '#6b3fa0', c2: '#f2b544' },
    { id: 'kids', name: '兒童', c1: '#c0501a', c2: '#f5c842' },
    { id: 'bible', name: '讀經成全', c1: '#5a4632', c2: '#c9a46a' },
    { id: 'serve', name: '服事', c1: '#1f7078', c2: '#8fc7c9' },
  ];
  const themeOf = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

  const PRESETS = [
    { id: 'district', chip: '所屬大區？（下拉）', label: '所屬大區？', type: 'select', options: ['一大區', '二大區', '三大區'] },
    { id: 'hall', chip: '所屬會所？（下拉）', label: '所屬會所？', type: 'select', options: ['一會所', '二會所', '三會所'] },
    { id: 'prepare', chip: '我可以預備？', label: '我可以預備？', type: 'text' },
    { id: 'companions', chip: '同行人數', label: '同行人數', type: 'companions' },
    { id: 'diet', chip: '飲食需求', label: '飲食需求', type: 'select', options: ['葷食', '素食', '蛋奶素'] },
  ];
  const REMINDERS = [{ id: '7d', label: '前 7 天' }, { id: '24h', label: '前 24 小時' }, { id: '1h', label: '前 1 小時' }];
  const DESC_MAX = 1000;
  const DESC_CARD = 300;

  const ICON = {
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    cal: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    users: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/></svg>',
    flag: '<svg viewBox="0 0 24 24"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
    user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    share: '<svg viewBox="0 0 24 24"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>',
    list: '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/></svg>',
    copy: '<svg viewBox="0 0 24 24"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    lock: '<svg viewBox="0 0 24 24"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    phone: '<svg viewBox="0 0 24 24"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>',
    image: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>',
    map: '<svg viewBox="0 0 24 24"><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/></svg>',
    shuffle: '<svg viewBox="0 0 24 24"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>',
    bell: '<svg viewBox="0 0 24 24"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/></svg>',
    home: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8M5 9.5V21h14V9.5"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  };

  // ================= 工具 =================
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (msg, ms = 2400) => {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
  };
  const banner = (msg) => { const b = document.getElementById('banner'); b.innerHTML = msg; b.classList.remove('hidden'); };
  const initial = (name) => esc(String(name || '?').trim().charAt(0) || '?');
  const isTrue = (v) => v === true || v === 'true';
  const uid = () => 'q' + Math.random().toString(36).slice(2, 8);
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // 時間一律是台灣時間字串 'YYYY-MM-DDTHH:MM'
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  const parts = (s) => {
    const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    if (!m) return null;
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    return { y, mo, d, hm: m[4] ? `${m[4]}:${m[5]}` : '', wd: WEEK[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()], day: m[0].slice(0, 10) };
  };
  const toTime = (s) => (s ? new Date(s.length === 16 ? `${s}:00+08:00` : s).getTime() : NaN);
  const fmtDay = (p) => `${p.mo}月${p.d}日（${p.wd}）`;
  const fmtDT = (s) => { const p = parts(s); return p ? `${fmtDay(p)}${p.hm ? ' ' + p.hm : ''}` : ''; };
  const fmtRange = (a, b) => {
    const p = parts(a); if (!p) return '';
    const q = parts(b);
    if (!q) return fmtDT(a);
    return q.day === p.day ? `${fmtDay(p)} ${p.hm}–${q.hm}` : `${fmtDT(a)} – ${fmtDT(b)}`;
  };
  const shareUrl = (id) => `https://liff.line.me/${CFG.LIFF_ID}?event=${encodeURIComponent(id)}`;
  const mapsSearch = (q) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  const linkify = (text) => esc(text).replace(/https?:\/\/[^\s<]+[^\s<.,;:!?)\]」』）。，]/g,
    (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`);

  const statusOf = (ev) => {
    if (ev.status === 'closed') return { key: 'closed', text: '已截止' };
    if (ev.deadlineAt && Date.now() >= toTime(ev.deadlineAt)) return { key: 'closed', text: '已截止' };
    if (Number(ev.capacity) > 0 && ev.total >= Number(ev.capacity)) return { key: 'full', text: '已額滿' };
    if (ev.startAt && Date.now() > toTime(ev.endAt || ev.startAt)) return { key: 'closed', text: '已結束' };
    return { key: 'open', text: '登記中' };
  };
  const chip = (ev) => { const s = statusOf(ev); return `<span class="chip chip-${s.key}">${s.text}</span>`; };
  const dateTile = (s, theme) => {
    const p = parts(s); const t = theme && themeOf(theme);
    const style = t ? `style="--t1:${t.c1};--t2:${t.c2}"` : '';
    return p ? `<div class="date-tile${t ? ' themed' : ''}" ${style}><span>${p.mo}月</span><b>${p.d}</b><span>週${p.wd}</span></div>`
      : `<div class="date-tile"><b>?</b></div>`;
  };

  /** 接龍文字：林剛強，10大區（共 3 人） */
  const lineText = (r, questions) => {
    const bits = [r.name];
    for (const q of questions || []) if (q.type !== 'companions' && r.answers?.[q.id]) bits.push(r.answers[q.id]);
    return bits.join('，') + (Number(r.count) > 1 ? `（共 ${r.count} 人）` : '');
  };

  function setTop(title, back) {
    document.getElementById('top-title').textContent = title || '';
    const b = document.getElementById('top-back');
    if (back) { b.href = back; b.classList.remove('hidden'); } else b.classList.add('hidden');
  }
  function setBar(html) {
    $bar.innerHTML = html || '';
    $bar.classList.toggle('hidden', !html);
    document.body.classList.toggle('has-bar', !!html);
  }
  const busy = (btn, on, text) => {
    if (!btn) return;
    if (on) { btn.dataset.text = btn.innerHTML; btn.innerHTML = `<span class="spinner"></span>${text || '處理中…'}`; btn.disabled = true; }
    else { btn.innerHTML = btn.dataset.text || btn.innerHTML; btn.disabled = false; }
  };
  function openExternal(url) {
    if (state.liffReady && liff.isInClient()) liff.openWindow({ url, external: true });
    else window.open(url, '_blank', 'noopener');
  }

  // ================= API =================
  async function api(action, data = {}) {
    if (DEMO) return demoApi(action, clone(data));
    const res = await fetch(API_URL, {
      method: 'POST',
      // Supabase 用 JSON；GAS 用 text/plain 以避免 CORS preflight
      headers: CFG.SUPABASE_URL ? { 'Content-Type': 'application/json' } : undefined,
      body: JSON.stringify({ action, idToken: state.idToken, ...data }),
    });
    let json;
    try { json = await res.json(); } catch { throw new Error('伺服器沒有回應，請稍後再試'); }
    if (!json.ok) throw new Error(json.error || '發生錯誤');
    return json.data;
  }

  // 示範模式：資料存在 localStorage（規則與 supabase/functions/api 相同）
  function demoApi(action, d) {
    const db = JSON.parse(localStorage.getItem('demo-db-v2') || '{"events":[],"regs":[],"profiles":{}}');
    const save = () => localStorage.setItem('demo-db-v2', JSON.stringify(db));
    const me = state.profile;
    const active = (id) => db.regs.filter((r) => r.eventId === id && r.status === 'active');
    const withCount = (ev) => { const regs = active(ev.id); return { ...ev, total: regs.reduce((n, r) => n + Number(r.count || 1), 0), regCount: regs.length }; };
    const find = (id) => { const ev = db.events.find((e) => e.id === id); if (!ev) throw new Error('找不到活動'); return ev; };
    const prof = () => db.profiles[me.userId] || { name: '', phone: '', answers: {} };
    switch (action) {
      case 'createEvent': {
        if (!d.event.title) throw new Error('請填寫活動名稱');
        if (!d.event.startAt) throw new Error('請填寫開始時間');
        const ev = { ...d.event, id: Math.random().toString(36).slice(2, 12), ownerId: me.userId, ownerName: me.displayName, status: 'open', createdAt: new Date().toISOString() };
        db.events.push(ev); save(); return withCount(ev);
      }
      case 'updateEvent': {
        const ev = find(d.id); if (ev.ownerId !== me.userId) throw new Error('只有主辦人可以修改');
        Object.assign(ev, d.event); save(); return withCount(ev);
      }
      case 'getEvent': {
        const ev = withCount(find(d.id)); const regs = active(d.id);
        const mine = regs.find((r) => r.userId === me.userId) || null;
        const isOwner = ev.ownerId === me.userId;
        return { event: ev, myReg: mine, isOwner, list: regs, regs: isOwner ? regs : null, profile: mine ? null : prof() };
      }
      case 'register': {
        const ev = withCount(find(d.id));
        if (statusOf(ev).key === 'closed') throw new Error('登記已截止');
        const answers = {}; let count = 1;
        for (const q of ev.questions || []) {
          const v = String(d.reg.answers?.[q.id] ?? '').trim();
          if (q.type === 'companions') { const n = Math.min(10, Math.max(0, Math.floor(+v || 0))); count = 1 + n; answers[q.id] = String(n); }
          else if (q.type === 'select') { if (!v) throw new Error(`請選擇「${q.label}」`); answers[q.id] = v; }
          else if (v) answers[q.id] = v;
        }
        const old = active(d.id).find((r) => r.userId === me.userId);
        const extra = count - (old ? Number(old.count || 1) : 0);
        if (Number(ev.capacity) > 0 && ev.total + extra > Number(ev.capacity)) throw new Error(`名額不足（剩 ${Math.max(0, ev.capacity - ev.total + (old ? old.count : 0))} 位）`);
        const reg = { name: d.reg.name, phone: d.reg.phone || '', count, answers, note: '' };
        if (old) Object.assign(old, reg);
        else db.regs.push({ ...reg, eventId: d.id, userId: me.userId, displayName: me.displayName, status: 'active', createdAt: new Date().toISOString() });
        const p = prof(); p.name = reg.name; if (reg.phone) p.phone = reg.phone;
        for (const q of ev.questions || []) if (q.type !== 'companions' && answers[q.id]) p.answers[q.label] = answers[q.id];
        db.profiles[me.userId] = p; save(); return {};
      }
      case 'cancel': { const r = active(d.id).find((x) => x.userId === me.userId); if (r) r.status = 'cancelled'; save(); return {}; }
      case 'myEvents': {
        const created = db.events.filter((e) => e.ownerId === me.userId).map(withCount);
        const ids = db.regs.filter((r) => r.userId === me.userId && r.status === 'active').map((r) => r.eventId);
        return { created, joined: db.events.filter((e) => ids.includes(e.id)).map(withCount) };
      }
      case 'getProfile': return prof();
      case 'saveProfile': db.profiles[me.userId] = d.profile; save(); return {};
      case 'uploadImage': return { url: d.dataUrl };
    }
    throw new Error('未知的動作');
  }

  // ================= LIFF =================
  async function initLiff() {
    try {
      await liff.init({ liffId: CFG.LIFF_ID });
      state.liffReady = true;
      if (!liff.isLoggedIn()) {
        // LINE 登入的 redirect_uri 不能含 #（否則 400 Bad Request），先暫存 hash，登入回來再還原
        if (location.hash && location.hash !== '#/') sessionStorage.setItem('after-login-hash', location.hash);
        liff.login({ redirectUri: location.origin + location.pathname + location.search });
        return false;
      }
      const savedHash = sessionStorage.getItem('after-login-hash');
      if (savedHash) { sessionStorage.removeItem('after-login-hash'); history.replaceState(null, '', location.pathname + location.search + savedHash); }
      state.profile = await liff.getProfile();
      state.idToken = liff.getIDToken();
    } catch (e) {
      console.warn('LIFF 初始化失敗，改用測試身分', e);
      if (!DEMO) {
        $app.innerHTML = `<div class="empty-state"><div class="emoji">😥</div><h3>無法登入 LINE</h3><p>${esc(e.message)}</p><a class="btn" href="https://liff.line.me/${esc(CFG.LIFF_ID)}">從 LINE 重新開啟</a></div>`;
        return false;
      }
      let id = localStorage.getItem('demo-uid');
      if (!id) { id = 'U-demo-' + Math.random().toString(36).slice(2, 8); localStorage.setItem('demo-uid', id); }
      state.profile = { userId: id, displayName: '測試使用者', pictureUrl: '' };
    }
    if (DEMO) banner('⚠️ 示範模式：尚未設定 SUPABASE_URL，資料只會存在這支手機／瀏覽器。');
    const p = state.profile;
    document.getElementById('user').innerHTML = p.pictureUrl
      ? `<img src="${esc(p.pictureUrl)}" alt="${esc(p.displayName)}">`
      : `<span class="avatar">${initial(p.displayName)}</span>`;
    return true;
  }

  // ================= 圖卡（Flex Message）=================
  function cardParts(ev) {
    const desc = String(ev.description || '').trim();
    const truncated = desc.length > DESC_CARD;
    return { desc: truncated ? desc.slice(0, DESC_CARD).trimEnd() + '…' : desc, truncated };
  }

  function buildFlex(ev) {
    const t = themeOf(ev.theme);
    const url = shareUrl(ev.id);
    const { desc, truncated } = cardParts(ev);
    const row = (icon, text, action) => ({
      type: 'box', layout: 'baseline', spacing: 'md', ...(action ? { action } : {}),
      contents: [
        { type: 'text', text: icon, size: 'sm', flex: 0 },
        { type: 'text', text, size: 'sm', color: action ? t.c1 : '#444444', wrap: true, flex: 1, ...(action ? { decoration: 'underline' } : {}) },
      ],
    });
    const rows = [row('🕒', fmtRange(ev.startAt, ev.endAt) || '時間未定')];
    if (ev.location) rows.push(row('📍', ev.location, { type: 'uri', label: '地圖', uri: ev.mapUrl || mapsSearch(ev.location) }));
    if (Number(ev.capacity) > 0) rows.push(row('👥', `名額 ${ev.capacity} 人`));
    if (ev.deadlineAt) rows.push(row('⏰', `${fmtDT(ev.deadlineAt)} 截止`));
    const body = [
      { type: 'box', layout: 'vertical', backgroundColor: t.c1, paddingAll: '18px', spacing: 'xs', contents: [
        { type: 'text', text: '活動登記', size: 'xs', color: t.c2, weight: 'bold' },
        { type: 'text', text: ev.title || '活動', size: 'xl', color: '#FFFFFF', weight: 'bold', wrap: true },
      ] },
      { type: 'box', layout: 'vertical', paddingAll: '18px', spacing: 'sm', contents: [
        ...rows,
        ...(desc ? [{ type: 'separator', margin: 'lg' }, { type: 'text', text: desc, size: 'sm', color: '#555555', wrap: true, margin: 'lg' }] : []),
      ] },
    ];
    return {
      type: 'flex',
      altText: `📋 ${ev.title}｜${fmtRange(ev.startAt, ev.endAt)}`.slice(0, 400),
      contents: {
        type: 'bubble', size: 'mega',
        ...(ev.imageUrl && /^https:/.test(ev.imageUrl) ? { hero: { type: 'image', url: ev.imageUrl, size: 'full', aspectRatio: '20:13', aspectMode: 'cover', action: { type: 'uri', uri: url } } } : {}),
        body: { type: 'box', layout: 'vertical', paddingAll: '0px', contents: body },
        footer: { type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: '14px', contents: [
          { type: 'button', style: 'primary', color: t.c1, height: 'md', action: { type: 'uri', label: (ev.buttonText || '我要登記').slice(0, 20), uri: url } },
          ...(truncated ? [{ type: 'button', style: 'link', height: 'sm', color: t.c1, action: { type: 'uri', label: '看完整說明', uri: url } }] : []),
        ] },
      },
    };
  }

  /** 表單上的即時預覽（與 Flex 版面一致） */
  function previewHtml(ev) {
    const t = themeOf(ev.theme);
    const { desc, truncated } = cardParts(ev);
    const row = (icon, text, link) => `<div class="fx-row"><span>${icon}</span><span class="${link ? 'fx-link' : ''}">${esc(text)}</span></div>`;
    return `
      <div class="fx" style="--t1:${t.c1};--t2:${t.c2}">
        ${ev.imageUrl ? `<div class="fx-hero"><img src="${esc(ev.imageUrl)}" alt="" onerror="this.parentNode.remove()"></div>` : ''}
        <div class="fx-head"><small>活動登記</small><b class="${ev.title ? '' : 'ph'}">${esc(ev.title || '活動名稱')}</b></div>
        <div class="fx-body">
          ${row('🕒', fmtRange(ev.startAt, ev.endAt) || '開始時間')}
          ${ev.location ? row('📍', ev.location, true) : ''}
          ${Number(ev.capacity) > 0 ? row('👥', `名額 ${ev.capacity} 人`) : ''}
          ${ev.deadlineAt ? row('⏰', `${fmtDT(ev.deadlineAt)} 截止`) : ''}
          ${desc ? `<div class="fx-desc">${esc(desc)}</div>` : ''}
        </div>
        <div class="fx-foot">
          <div class="fx-btn">${esc(ev.buttonText || '我要登記')}</div>
          ${truncated ? '<div class="fx-more">看完整說明</div>' : ''}
        </div>
      </div>`;
  }

  async function shareEvent(ev) {
    try {
      if (state.liffReady && liff.isApiAvailable('shareTargetPicker')) {
        const r = await liff.shareTargetPicker([buildFlex(ev)]);
        if (r) toast('已發送到 LINE 🎉');
        return !!r;
      }
    } catch (e) { console.warn(e); toast('分享失敗：' + e.message); return false; }
    const url = shareUrl(ev.id);
    try { await navigator.clipboard.writeText(`${ev.title}\n${url}`); toast('這裡無法直接分享，已複製登記連結'); }
    catch { prompt('登記連結：', url); }
    return false;
  }

  async function installShortcut() {
    const url = `https://liff.line.me/${CFG.LIFF_ID}`;
    try {
      if (state.liffReady && liff.isApiAvailable && liff.isApiAvailable('createShortcutOnHomeScreen')) {
        await liff.createShortcutOnHomeScreen({ url });
        return;
      }
    } catch (e) { console.warn(e); }
    alert('請用以下方式加到桌面：\n\niPhone：用 Safari 打開 ' + url + '，按「分享」→「加入主畫面」\nAndroid：用 Chrome 打開，按右上角「⋮」→「加到主畫面」');
  }

  // ================= 路由 =================
  const routes = [
    [/^#?\/?$/, pageHome],
    [/^#\/e\/([\w-]+)$/, (id) => pageEvent(id)],
    [/^#\/e\/([\w-]+)\/edit$/, (id) => pageEdit(id)],
    [/^#\/e\/([\w-]+)\/manage$/, (id) => pageManage(id)],
    [/^#\/me$/, pageMe],
  ];
  const skeleton = `<div class="skeleton"><div></div><div></div><div></div></div>`;
  async function router() {
    const h = location.hash || '#/';
    window.scrollTo(0, 0);
    for (const [re, fn] of routes) {
      const m = h.match(re);
      if (m) {
        setBar('');
        $app.innerHTML = skeleton;
        try { await fn(...m.slice(1)); } catch (e) {
          console.error(e);
          setBar('');
          $app.innerHTML = `<div class="empty-state"><div class="emoji">😥</div><h3>出了點問題</h3><p>${esc(e.message)}</p><a class="btn btn-ghost" href="#/">回首頁</a></div>`;
        }
        return;
      }
    }
    location.hash = '#/';
  }

  // ================= 首頁 =================
  const eventRow = (ev) => {
    const cap = Number(ev.capacity) || 0;
    const pct = cap ? Math.min(100, (ev.total / cap) * 100) : 0;
    const p = parts(ev.startAt);
    return `
    <a class="event-row" href="#/e/${esc(ev.id)}">
      ${dateTile(ev.startAt, ev.theme)}
      <div class="event-row-body">
        <div class="event-row-title">${esc(ev.title)}</div>
        <div class="event-row-meta">${[p?.hm, ev.location].filter(Boolean).map(esc).join(' · ') || '&nbsp;'}</div>
        <div class="event-row-foot">${chip(ev)}<span class="count">${ICON.users}${ev.total}${cap ? ` / ${cap}` : ''} 人</span></div>
        ${cap ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ''}
      </div>
    </a>`;
  };
  const sortEvents = (a) => {
    const now = Date.now();
    const upcoming = a.filter((e) => toTime(e.endAt || e.startAt) >= now).sort((x, y) => String(x.startAt).localeCompare(String(y.startAt)));
    const past = a.filter((e) => !(toTime(e.endAt || e.startAt) >= now)).sort((x, y) => String(y.startAt).localeCompare(String(x.startAt)));
    return [...upcoming, ...past];
  };

  async function pageHome() {
    setTop('LINE 簡易活動登記');
    const { created, joined } = await api('myEvents');
    const render = () => {
      const tab = state.homeTab;
      $app.innerHTML = `
        <div class="tabs" role="tablist">
          <button class="${tab === 'new' ? 'on' : ''}" data-tab="new">新活動</button>
          <button class="${tab === 'created' ? 'on' : ''}" data-tab="created">已發布 <em>${created.length}</em></button>
          <button class="${tab === 'joined' ? 'on' : ''}" data-tab="joined">已登記 <em>${joined.length}</em></button>
        </div>
        <div id="tab-body"></div>`;
      $app.querySelectorAll('[data-tab]').forEach((b) => b.onclick = () => { state.homeTab = b.dataset.tab; render(); window.scrollTo(0, 0); });
      const body = document.getElementById('tab-body');
      if (tab === 'new') return renderForm(body, { past: created });
      setBar('');
      const list = sortEvents(tab === 'created' ? created : joined);
      body.innerHTML = (list.length ? `<div class="list">${list.map(eventRow).join('')}</div>` : `
        <div class="empty-state small">
          <div class="emoji">${tab === 'created' ? '🗓️' : '🎟️'}</div>
          <p>${tab === 'created' ? '還沒有發布的活動，到「新活動」建立第一個吧！' : '還沒有登記的活動。點朋友傳來的活動圖卡，登記後就會出現在這裡。'}</p>
        </div>`) + footerLinks();
      bindFooter(body);
    };
    render();
  }

  const footerLinks = () => `
    <div class="footer-links">
      <button type="button" data-act="install">${ICON.home}安裝到手機桌面</button>
      <a href="#/me">${ICON.user}我的個人資料</a>
    </div>`;
  const bindFooter = (root) => { const b = root.querySelector('[data-act="install"]'); if (b) b.onclick = installShortcut; };

  // ================= 活動表單（新增 / 編輯共用）=================
  const emptyDraft = () => ({
    title: '', startAt: '', endAt: '', location: '', mapUrl: '', capacity: '', deadlineAt: '',
    reminders: [], description: '', imageUrl: '', buttonText: '我要登記', theme: 'classic', questions: [], askPhone: false,
  });
  const loadDraft = () => { try { return { ...emptyDraft(), ...JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') }; } catch { return emptyDraft(); } };

  const field = (label, input, { optional, hint, cls = '' } = {}) => `
    <label class="field ${cls}">
      <span class="field-label">${label}${optional ? '<i>選填</i>' : ''}</span>
      ${input}
      ${hint ? `<span class="field-hint">${hint}</span>` : ''}
    </label>`;
  const picker = (type, name, value, ph) => `
    <div class="picker ${value ? '' : 'is-empty'}">
      <span class="picker-icon">${ICON.cal}</span>
      <input type="${type}" name="${name}" value="${esc(value)}">
      <span class="picker-ph">${ph}</span>
      <button type="button" class="picker-clear" data-clear="${name}" aria-label="清除">${ICON.x}</button>
    </div>`;

  /**
   * @param {HTMLElement} root
   * @param {{ past?: any[], event?: any }} opts  event 有值 = 編輯模式
   */
  function renderForm(root, opts = {}) {
    const editing = !!opts.event;
    const d = editing ? { ...emptyDraft(), ...clone(opts.event), capacity: opts.event.capacity || '' } : loadDraft();
    const persist = () => { if (!editing) localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); };
    const past = (opts.past || []).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 8);

    root.innerHTML = `
      ${!editing && past.length ? `
      <section class="block">
        <h3 class="block-title">從過去的活動套用</h3>
        <div class="past-list">${past.map((e) => `
          <button type="button" class="past" data-past="${esc(e.id)}" style="--t1:${themeOf(e.theme).c1}">
            <b>${esc(e.title)}</b><small>${esc(e.location || fmtDT(e.startAt))}</small>
          </button>`).join('')}</div>
        <p class="hint">套用後可以再修改；時間不會帶入，請填新的時間。</p>
      </section>` : ''}

      <section class="preview-box">
        <div class="preview-label"><span>圖卡預覽</span>群組裡的人會看到這張圖卡</div>
        <div id="preview"></div>
        <div class="theme-head"><h3>圖卡色調</h3><button type="button" class="btn-sm" id="shuffle">${ICON.shuffle}隨機換一個</button></div>
        <div class="themes">${THEMES.map((t) => `
          <button type="button" class="theme ${d.theme === t.id ? 'on' : ''}" data-theme="${t.id}">
            <i style="background:linear-gradient(135deg, ${t.c1} 50%, ${t.c2} 50%)"></i><span>${t.name}</span>
          </button>`).join('')}</div>
      </section>

      <form id="ef" novalidate>
        <section class="card">
          <h2 class="card-title">活動</h2>
          ${field('活動名稱', `<input name="title" maxlength="60" value="${esc(d.title)}" placeholder="例如：週六愛筵">`)}
          ${field('開始時間', picker('datetime-local', 'startAt', d.startAt, '選擇日期與時間'))}
          ${field('結束時間', picker('datetime-local', 'endAt', d.endAt, '不設定'), { optional: true })}
          ${field('地點', `<input name="location" maxlength="100" value="${esc(d.location)}" placeholder="例如：一會所大會堂">`, { optional: true })}
          <div class="field">
            <span class="field-label">地圖位置<i>選填</i></span>
            <div class="input-row">
              <input name="mapUrl" type="url" inputmode="url" value="${esc(d.mapUrl)}" placeholder="貼上 Google 地圖分享連結">
              <button type="button" class="btn-sm" id="find-map">${ICON.map}到地圖找</button>
            </div>
            <span class="field-hint">沒貼的話，點地點會用地名在 Google 地圖搜尋。要更準確：按「到地圖找」→ 選好地標 →「分享」→「複製連結」→ 貼回這裡。</span>
          </div>
        </section>

        <section class="card">
          <h2 class="card-title">名額與截止</h2>
          ${field('人數上限', `<input name="capacity" type="number" inputmode="numeric" min="0" value="${esc(d.capacity)}" placeholder="不限">`)}
          ${field('登記截止', picker('datetime-local', 'deadlineAt', d.deadlineAt, '不設定'))}
          <p class="hint">都可以留白。額滿或過了截止時間，登記會自動停止。</p>
        </section>

        <section class="card">
          <h2 class="card-title">${ICON.bell}活動前提醒</h2>
          <div class="toggle-chips" id="reminders">${REMINDERS.map((r) => `
            <button type="button" data-rem="${r.id}" class="${d.reminders.includes(r.id) ? 'on' : ''}">${r.label}</button>`).join('')}</div>
          <p class="hint" id="rem-hint"></p>
        </section>

        <section class="card">
          <h2 class="card-title">內容</h2>
          <div class="field">
            <span class="field-label">說明<i>選填</i></span>
            <textarea name="description" maxlength="${DESC_MAX}" rows="5" placeholder="要帶什麼、怎麼集合、聯絡誰">${esc(d.description)}</textarea>
            <span class="field-hint split"><span>說明裡的網址會變成可以點的連結。超過 ${DESC_CARD} 字時，圖卡上只放前段，點「看完整說明」看全文。</span><b id="desc-count">0／${DESC_MAX}</b></span>
          </div>
          <div class="field">
            <span class="field-label">圖片<i>選填</i></span>
            <div id="img-box"></div>
            <input type="file" id="img-file" accept="image/*" hidden>
            <input name="imageUrl" type="url" inputmode="url" value="${esc(d.imageUrl.startsWith('data:') ? '' : d.imageUrl)}" placeholder="或貼上圖片網址 https://" class="mt8">
          </div>
          ${field('按鈕文字', `<input name="buttonText" maxlength="20" value="${esc(d.buttonText)}" placeholder="我要登記">`)}
        </section>

        <section class="card">
          <h2 class="card-title">登記時要問的問題</h2>
          <p class="hint top">選填。回答會跟名字一起顯示在接龍名單，例如「林剛強，10大區」。</p>
          <div id="questions"></div>
          <label class="switch-row">
            <span><b>需要填寫電話</b><small>電話只有主辦人看得到</small></span>
            <input type="checkbox" name="askPhone" ${isTrue(d.askPhone) ? 'checked' : ''}>
            <span class="switch"></span>
          </label>
        </section>
      </form>
      ${editing ? '' : footerLinks()}`;

    setBar(editing
      ? `<button class="btn" type="button" id="submit">儲存變更</button>`
      : `<button class="btn btn-dark" type="button" id="submit">${ICON.send}發送到 LINE 群組</button>`);

    const f = root.querySelector('#ef');
    const $prev = root.querySelector('#preview');
    const refresh = () => { $prev.innerHTML = previewHtml(d); persist(); };

    // ---- 一般欄位 ----
    const syncPicker = (inp) => inp.closest('.picker')?.classList.toggle('is-empty', !inp.value);
    const onField = (e) => {
      const el = e.target;
      if (!el.name || el.closest('#questions')) return;
      d[el.name] = el.type === 'checkbox' ? el.checked : el.value;
      if (el.closest('.picker')) syncPicker(el);
      if (el.name === 'startAt') remHint();
      if (el.name === 'description') descCount();
      if (el.name === 'imageUrl') { d.imageUrl = el.value.trim(); imgBox(); }
      refresh();
    };
    f.addEventListener('input', onField);
    f.addEventListener('change', onField);
    f.querySelectorAll('[data-clear]').forEach((b) => b.onclick = () => {
      const inp = f.elements[b.dataset.clear]; inp.value = ''; d[inp.name] = ''; syncPicker(inp); remHint(); refresh();
    });

    // ---- 色調 ----
    const setTheme = (id) => { d.theme = id; root.querySelectorAll('[data-theme]').forEach((x) => x.classList.toggle('on', x.dataset.theme === id)); refresh(); };
    root.querySelectorAll('[data-theme]').forEach((b) => b.onclick = () => setTheme(b.dataset.theme));
    root.querySelector('#shuffle').onclick = () => {
      const others = THEMES.filter((t) => t.id !== d.theme);
      setTheme(others[Math.floor(Math.random() * others.length)].id);
    };

    // ---- 地圖 ----
    root.querySelector('#find-map').onclick = () => openExternal(d.location ? mapsSearch(d.location) : 'https://www.google.com/maps');

    // ---- 提醒 ----
    const remHint = () => {
      const ok = !!d.startAt;
      root.querySelectorAll('[data-rem]').forEach((b) => { b.disabled = !ok; });
      root.querySelector('#rem-hint').textContent = ok
        ? (d.reminders.length ? '時間到了會用 LINE 通知所有已登記的人（對方需加官方帳號好友）。' : '選擇要在活動前多久提醒已登記的人。')
        : '先填開始時間，才能設定提醒。';
    };
    root.querySelectorAll('[data-rem]').forEach((b) => b.onclick = () => {
      const id = b.dataset.rem;
      d.reminders = d.reminders.includes(id) ? d.reminders.filter((x) => x !== id) : [...d.reminders, id];
      b.classList.toggle('on'); remHint(); persist();
    });

    // ---- 說明字數 ----
    const descCount = () => {
      const n = (d.description || '').length;
      const el = root.querySelector('#desc-count');
      el.textContent = `${n}／${DESC_MAX}`; el.classList.toggle('over', n > DESC_CARD);
    };

    // ---- 圖片 ----
    const imgBox = () => {
      const box = root.querySelector('#img-box');
      box.innerHTML = d.imageUrl
        ? `<div class="img-preview"><img src="${esc(d.imageUrl)}" alt=""><button type="button" class="img-remove" aria-label="移除圖片">${ICON.x}</button></div>`
        : `<button type="button" class="btn-sm upload" id="img-pick">${ICON.image}上傳圖片</button>`;
      const pick = box.querySelector('#img-pick'); if (pick) pick.onclick = () => root.querySelector('#img-file').click();
      const rm = box.querySelector('.img-remove'); if (rm) rm.onclick = () => { d.imageUrl = ''; f.elements.imageUrl.value = ''; imgBox(); refresh(); };
    };
    root.querySelector('#img-file').onchange = async (e) => {
      const file = e.target.files[0]; e.target.value = '';
      if (!file) return;
      const box = root.querySelector('#img-box');
      box.innerHTML = `<div class="uploading"><span class="spinner dark"></span>上傳中…</div>`;
      try {
        const dataUrl = await resizeImage(file, 1200);
        const { url } = await api('uploadImage', { dataUrl });
        d.imageUrl = url; f.elements.imageUrl.value = url.startsWith('data:') ? '' : url;
        toast('圖片已上傳');
      } catch (err) { toast(err.message || '上傳失敗'); }
      imgBox(); refresh();
    };

    // ---- 問題 ----
    const renderQuestions = () => {
      const box = root.querySelector('#questions');
      const used = new Set(d.questions.map((q) => q.id));
      box.innerHTML = `
        ${d.questions.map((q, i) => `
          <div class="q" data-i="${i}">
            <div class="q-head">
              <span class="q-type">${q.type === 'select' ? '下拉' : q.type === 'companions' ? '人數' : '文字'}</span>
              <input class="q-label" value="${esc(q.label)}" maxlength="30" placeholder="輸入問題">
              <button type="button" class="q-del" aria-label="刪除問題">${ICON.trash}</button>
            </div>
            ${q.type === 'select' ? `<input class="q-opts" value="${esc((q.options || []).join('、'))}" placeholder="選項，用頓號「、」分隔">` : ''}
            ${q.type === 'text' ? `<button type="button" class="link" data-to-select>改成下拉選單</button>` : ''}
            ${q.type === 'companions' ? '<p class="hint">登記者可選 0～10 位同行者，會一起算進人數上限。</p>' : ''}
          </div>`).join('')}
        <div class="preset-chips">
          ${PRESETS.filter((p) => !used.has(p.id)).map((p) => `<button type="button" class="dash-chip" data-preset="${p.id}">${ICON.plus}${p.chip}</button>`).join('')}
          <button type="button" class="dash-chip solid" data-add>${ICON.plus}新增問題</button>
        </div>`;
      box.querySelectorAll('[data-preset]').forEach((b) => b.onclick = () => {
        if (d.questions.length >= 10) return toast('最多 10 個問題');
        const p = PRESETS.find((x) => x.id === b.dataset.preset);
        d.questions.push({ id: p.id, label: p.label, type: p.type, ...(p.options ? { options: [...p.options] } : {}) });
        renderQuestions(); persist();
      });
      box.querySelector('[data-add]').onclick = () => {
        if (d.questions.length >= 10) return toast('最多 10 個問題');
        d.questions.push({ id: uid(), label: '', type: 'text' });
        renderQuestions(); persist();
        const all = box.querySelectorAll('.q-label'); all[all.length - 1]?.focus();
      };
      box.querySelectorAll('.q').forEach((el) => {
        const i = +el.dataset.i; const q = d.questions[i];
        el.querySelector('.q-label').oninput = (e) => { q.label = e.target.value; persist(); };
        const opts = el.querySelector('.q-opts');
        if (opts) opts.oninput = (e) => { q.options = e.target.value.split(/[、,，\n]/).map((s) => s.trim()).filter(Boolean); persist(); };
        el.querySelector('.q-del').onclick = () => { d.questions.splice(i, 1); renderQuestions(); persist(); };
        const ts = el.querySelector('[data-to-select]');
        if (ts) ts.onclick = () => { q.type = 'select'; q.options = []; renderQuestions(); persist(); box.querySelector(`[data-i="${i}"] .q-opts`)?.focus(); };
      });
    };

    // ---- 從過去的活動套用 ----
    root.querySelectorAll('[data-past]').forEach((b) => b.onclick = () => {
      const e = past.find((x) => x.id === b.dataset.past);
      Object.assign(d, {
        title: e.title, location: e.location, mapUrl: e.mapUrl, capacity: e.capacity || '', description: e.description,
        imageUrl: e.imageUrl, buttonText: e.buttonText, theme: e.theme, questions: clone(e.questions || []), askPhone: e.askPhone,
        startAt: '', endAt: '', deadlineAt: '', reminders: [],
      });
      persist();
      renderForm(root, opts);
      toast('已套用，記得填新的時間');
      root.querySelector('[name="startAt"]')?.closest('.field')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    // ---- 送出 ----
    document.getElementById('submit').onclick = async (e) => {
      const btn = e.currentTarget;
      const data = clone(d);
      data.title = data.title.trim();
      data.capacity = Math.max(0, Math.floor(Number(data.capacity) || 0));
      data.questions = data.questions.map((q) => ({ ...q, label: q.label.trim() })).filter((q) => q.label);
      if (data.imageUrl.startsWith('data:') && !DEMO) data.imageUrl = '';
      const bad = (msg, name) => { toast(msg); if (name) f.elements[name]?.focus(); };
      if (!data.title) return bad('請填寫活動名稱', 'title');
      if (!data.startAt) return bad('請選擇開始時間');
      if (data.endAt && data.endAt < data.startAt) return bad('結束時間不能早於開始時間');
      if (data.deadlineAt && data.deadlineAt > (data.endAt || data.startAt)) return bad('登記截止不能晚於活動時間');
      if (data.mapUrl && !/^https:\/\//.test(data.mapUrl)) return bad('地圖位置需為 https:// 開頭的網址', 'mapUrl');
      if (data.imageUrl && !/^(https:\/\/|data:)/.test(data.imageUrl)) return bad('圖片網址需為 https:// 開頭', 'imageUrl');
      const noOpt = data.questions.find((q) => q.type === 'select' && !(q.options || []).length);
      if (noOpt) return bad(`「${noOpt.label}」至少要有一個選項`);

      busy(btn, true, editing ? '儲存中…' : '建立中…');
      try {
        if (editing) {
          await api('updateEvent', { id: opts.event.id, event: data });
          toast('已儲存');
          location.hash = '#/e/' + opts.event.id;
        } else {
          const ev = await api('createEvent', { event: data });
          localStorage.removeItem(DRAFT_KEY);
          busy(btn, false);
          await shareEvent(ev);
          state.homeTab = 'created';
          location.hash = '#/e/' + ev.id;
        }
      } catch (err) { toast(err.message); busy(btn, false); }
    };

    renderQuestions(); imgBox(); remHint(); descCount(); refresh();
    if (!editing) bindFooter(root);
  }

  function resizeImage(file, max) {
    return new Promise((resolve, reject) => {
      if (!/^image\//.test(file.type)) return reject(new Error('請選擇圖片檔'));
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('無法讀取這張圖片'));
      img.src = URL.createObjectURL(file);
    });
  }

  async function pageEdit(id) {
    setTop('編輯活動', `#/e/${id}`);
    const r = await api('getEvent', { id });
    if (!r.isOwner) throw new Error('只有主辦人可以編輯');
    $app.innerHTML = '<div id="form-root"></div>';
    renderForm(document.getElementById('form-root'), { event: r.event });
  }

  // ================= 活動頁 =================
  const infoRow = (icon, main, sub) => `
    <div class="info-row"><span class="info-icon">${icon}</span><div><b>${main}</b>${sub ? `<small>${sub}</small>` : ''}</div></div>`;

  function questionInput(q, value) {
    if (q.type === 'select') {
      return field(esc(q.label), `<div class="select"><select name="q_${esc(q.id)}"><option value="">請選擇</option>${(q.options || []).map((o) => `<option ${o === value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`);
    }
    if (q.type === 'companions') {
      const v = Number(value) || 0;
      return field(esc(q.label), `
        <div class="stepper" data-min="0" data-max="10">
          <button type="button" data-step="-1" aria-label="減少">${ICON.minus}</button>
          <input type="number" inputmode="numeric" name="q_${esc(q.id)}" value="${v}" min="0" max="10">
          <button type="button" data-step="1" aria-label="增加">${ICON.plus}</button>
        </div>`, { hint: '不含自己，沒有同行者填 0' });
    }
    return field(esc(q.label), `<input name="q_${esc(q.id)}" maxlength="100" value="${esc(value || '')}">`, { optional: true });
  }

  async function pageEvent(id) {
    setTop('活動登記', '#/');
    const { event: ev, myReg, isOwner, list, profile } = await api('getEvent', { id });
    const t = themeOf(ev.theme);
    const st = statusOf(ev);
    const cap = Number(ev.capacity) || 0;
    const remain = cap ? Math.max(0, cap - ev.total) : Infinity;
    const canSubmit = st.key === 'open' || (st.key === 'full' && !!myReg);
    const pct = cap ? Math.min(100, (ev.total / cap) * 100) : 0;
    const qs = ev.questions || [];
    const askPhone = isTrue(ev.askPhone);
    // 預設值：已登記資料 > 個人資料（依問題名稱比對）
    const pv = profile || {};
    const ans = (q) => (myReg ? myReg.answers?.[q.id] : (q.type === 'companions' ? 0 : pv.answers?.[q.label]));

    $app.innerHTML = `
      <section class="event-hero" style="--t1:${t.c1};--t2:${t.c2}">
        ${ev.imageUrl ? `<img class="event-hero-img" src="${esc(ev.imageUrl)}" alt="" onerror="this.remove()">` : ''}
        <div class="event-hero-inner">
          <div class="event-hero-top">
            ${dateTile(ev.startAt)}
            <div>
              ${chip(ev)}
              <h1>${esc(ev.title)}</h1>
              <p class="host">${ICON.user}主辦：${esc(ev.ownerName)}</p>
            </div>
          </div>
          <div class="capacity">
            <div class="capacity-nums"><b>${ev.total}</b><span>${cap ? ` / ${cap} 人已登記` : ' 人已登記'}</span>
              <em>${cap ? (remain > 0 ? `剩 ${remain} 位` : '已額滿') : '名額不限'}</em></div>
            ${cap ? `<div class="bar light"><i style="width:${pct}%"></i></div>` : ''}
          </div>
        </div>
      </section>

      <section class="card">
        ${infoRow(ICON.clock, esc(fmtRange(ev.startAt, ev.endAt)), '')}
        ${ev.location ? infoRow(ICON.pin, esc(ev.location), `<a href="#" data-map>在地圖上查看</a>`) : ''}
        ${ev.deadlineAt ? infoRow(ICON.flag, `登記截止 ${esc(fmtDT(ev.deadlineAt))}`, '') : ''}
        ${ev.description ? `<div class="desc">${linkify(ev.description)}</div>` : ''}
        <button class="btn btn-ghost" id="share">${ICON.share}轉傳活動圖卡</button>
      </section>

      ${isOwner ? `
      <section class="owner-tools">
        <a class="tool" href="#/e/${esc(id)}/manage">${ICON.list}<b>完整名單</b><small>含電話、可複製</small></a>
        <a class="tool" href="#/e/${esc(id)}/edit">${ICON.edit}<b>編輯活動</b><small>修改內容與設定</small></a>
      </section>` : ''}

      <form class="card" id="rf" novalidate>
        <h2 class="card-title">${myReg ? '我的登記' : '我要登記'}</h2>
        ${myReg ? `<div class="notice ok">${ICON.check}<span>你已完成登記${Number(myReg.count) > 1 ? `（共 ${myReg.count} 人）` : ''}，可以修改或取消。</span></div>` : ''}
        ${!canSubmit ? `<div class="notice warn">${ICON.lock}<span>目前${st.text}，${myReg ? '無法修改' : '無法登記'}。</span></div>` : ''}
        <fieldset ${canSubmit ? '' : 'disabled'}>
          ${field('姓名', `<input name="name" maxlength="30" value="${esc(myReg?.name || pv.name || state.profile.displayName)}">`)}
          ${askPhone ? field('電話', `<input name="phone" type="tel" inputmode="tel" maxlength="20" value="${esc(myReg?.phone || pv.phone || '')}" placeholder="09xx-xxx-xxx">`, { hint: '只有主辦人看得到' }) : ''}
          ${qs.map((q) => questionInput(q, ans(q))).join('')}
        </fieldset>
        ${myReg ? '<button class="btn-text danger" type="button" id="cancel">取消登記</button>' : ''}
      </form>

      <section class="card">
        <h2 class="card-title">接龍名單 <span class="muted">${list.length} 筆 · ${ev.total} 人</span></h2>
        ${list.length ? `<ol class="roll">${list.map((r) => `<li>${esc(lineText(r, qs))}</li>`).join('')}</ol>` : '<p class="hint">還沒有人登記，成為第一個吧！</p>'}
      </section>`;

    setBar(canSubmit ? `<button class="btn" type="button" id="submit" style="--btn:${t.c1}">${esc(myReg ? '更新登記資料' : (ev.buttonText || '我要登記'))}</button>` : '');

    document.getElementById('share').onclick = () => shareEvent(ev);
    const mapLink = $app.querySelector('[data-map]');
    if (mapLink) mapLink.onclick = (e) => { e.preventDefault(); openExternal(ev.mapUrl || mapsSearch(ev.location)); };
    const rf = document.getElementById('rf');
    bindSteppers(rf);
    const submit = document.getElementById('submit');
    if (submit) submit.onclick = async () => {
      const fd = new FormData(rf);
      const reg = { name: String(fd.get('name') || '').trim(), phone: String(fd.get('phone') || '').trim(), answers: {} };
      for (const q of qs) reg.answers[q.id] = String(fd.get('q_' + q.id) ?? '').trim();
      if (!reg.name) return toast('請填寫姓名');
      if (askPhone && !reg.phone) return toast('請填寫電話');
      const miss = qs.find((q) => q.type === 'select' && !reg.answers[q.id]);
      if (miss) return toast(`請選擇「${miss.label}」`);
      busy(submit, true, '送出中…');
      try { await api('register', { id, reg }); toast(myReg ? '已更新登記' : '登記成功 🎉'); router(); }
      catch (err) { toast(err.message); busy(submit, false); }
    };
    const c = document.getElementById('cancel');
    if (c) c.onclick = async () => {
      if (!confirm('確定要取消登記嗎？')) return;
      try { await api('cancel', { id }); toast('已取消登記'); router(); } catch (err) { toast(err.message); }
    };
  }

  function bindSteppers(root) {
    root.querySelectorAll('.stepper').forEach((st) => {
      const inp = st.querySelector('input'); const min = +st.dataset.min; const max = +st.dataset.max;
      st.querySelectorAll('[data-step]').forEach((b) => b.onclick = () => {
        inp.value = Math.min(max, Math.max(min, (Number(inp.value) || 0) + Number(b.dataset.step)));
      });
    });
  }

  // ================= 完整名單（主辦人）=================
  async function pageManage(id) {
    setTop('完整名單', `#/e/${id}`);
    const { event: ev, regs, isOwner } = await api('getEvent', { id });
    if (!isOwner) throw new Error('只有主辦人可以查看名單');
    const askPhone = isTrue(ev.askPhone);
    const closed = ev.status === 'closed';
    const cap = Number(ev.capacity) || 0;
    const qs = ev.questions || [];
    regs.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    $app.innerHTML = `
      <section class="manage-head">
        <div class="manage-title">${dateTile(ev.startAt, ev.theme)}<div><h1>${esc(ev.title)}</h1>${chip(ev)}</div></div>
        <div class="stats">
          <div><b>${regs.length}</b><span>登記筆數</span></div>
          <div><b>${ev.total}</b><span>總人數</span></div>
          <div><b>${cap ? Math.max(0, cap - ev.total) : '∞'}</b><span>剩餘名額</span></div>
        </div>
      </section>
      <div class="list">
        ${regs.length ? regs.map((r, i) => `
          <div class="person">
            <span class="avatar">${initial(r.name)}</span>
            <div class="person-body">
              <b>${esc(r.name)}${Number(r.count) > 1 ? ` <em class="tag">共 ${esc(r.count)} 人</em>` : ''}</b>
              <small>${esc([...qs.filter((q) => q.type !== 'companions').map((q) => r.answers?.[q.id]).filter(Boolean), askPhone ? r.phone : '', `LINE：${r.displayName}`].filter(Boolean).join(' · '))}</small>
            </div>
            ${askPhone && r.phone ? `<a class="icon-btn" href="tel:${esc(r.phone)}" aria-label="撥打 ${esc(r.phone)}">${ICON.phone}</a>` : ''}
            <span class="person-no">#${i + 1}</span>
          </div>`).join('') : `<div class="empty-state small"><div class="emoji">📭</div><p>還沒有人登記，先把活動圖卡發送出去吧！</p></div>`}
      </div>`;
    setBar(`
      <div class="bar-row">
        <button class="btn btn-ghost" id="copy">${ICON.copy}複製接龍</button>
        <button class="btn ${closed ? '' : 'btn-danger'}" id="toggle">${closed ? '重新開放' : '停止登記'}</button>
      </div>`);

    document.getElementById('toggle').onclick = async (e) => {
      if (!closed && !confirm('停止後其他人將無法登記，確定嗎？')) return;
      const b = e.currentTarget; busy(b, true);
      try { await api('updateEvent', { id, event: { status: closed ? 'open' : 'closed' } }); toast(closed ? '已重新開放登記' : '已停止登記'); router(); }
      catch (err) { toast(err.message); busy(b, false); }
    };
    document.getElementById('copy').onclick = async () => {
      const head = [`【${ev.title}】`, fmtRange(ev.startAt, ev.endAt), ev.location ? `📍 ${ev.location}` : '', `共 ${ev.total} 人`].filter(Boolean);
      const lines = [...head, '', ...regs.map((r, i) => `${i + 1}. ${lineText(r, qs)}${askPhone && r.phone ? ' ' + r.phone : ''}`)];
      try { await navigator.clipboard.writeText(lines.join('\n')); toast('已複製，可直接貼到聊天室'); }
      catch { prompt('請手動複製：', lines.join('\n')); }
    };
  }

  // ================= 我的個人資料 =================
  async function pageMe() {
    setTop('我的個人資料', '#/');
    const p = await api('getProfile');
    const entries = Object.entries(p.answers || {});
    $app.innerHTML = `
      <section class="profile-head">
        ${state.profile.pictureUrl ? `<img src="${esc(state.profile.pictureUrl)}" alt="">` : `<span class="avatar big">${initial(state.profile.displayName)}</span>`}
        <div><b>${esc(state.profile.displayName)}</b><small>登記活動時會自動帶入以下資料</small></div>
      </section>
      <form class="card" id="pf" novalidate>
        ${field('姓名', `<input name="name" maxlength="30" value="${esc(p.name || state.profile.displayName)}">`)}
        ${field('電話', `<input name="phone" type="tel" inputmode="tel" maxlength="20" value="${esc(p.phone || '')}" placeholder="09xx-xxx-xxx">`, { optional: true })}
        <div class="field">
          <span class="field-label">常用回答</span>
          <div id="ans">${entries.length ? entries.map(([k, v]) => `
            <div class="kv"><span>${esc(k)}</span><input data-k="${esc(k)}" value="${esc(v)}" maxlength="100"><button type="button" class="q-del" data-del aria-label="刪除">${ICON.trash}</button></div>`).join('')
            : '<p class="hint">登記活動時填過的答案（例如所屬大區）會自動記在這裡。</p>'}</div>
        </div>
      </form>
      ${footerLinks()}`;
    bindFooter($app);
    $app.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => b.closest('.kv').remove());
    setBar(`<button class="btn" type="button" id="save">儲存</button>`);
    document.getElementById('save').onclick = async (e) => {
      const f = document.getElementById('pf');
      const answers = {};
      f.querySelectorAll('[data-k]').forEach((i) => { if (i.value.trim()) answers[i.dataset.k] = i.value.trim(); });
      const b = e.currentTarget; busy(b, true, '儲存中…');
      try {
        await api('saveProfile', { profile: { name: f.elements.name.value.trim(), phone: f.elements.phone.value.trim(), answers } });
        toast('已儲存'); busy(b, false);
      } catch (err) { toast(err.message); busy(b, false); }
    };
  }

  // ================= 啟動 =================
  (async () => {
    if (!(await initLiff())) return;
    // 從分享連結 ?event=xxx 進入時，導到活動頁
    const ev = new URLSearchParams(location.search).get('event');
    if (ev) history.replaceState(null, '', location.pathname + '#/e/' + ev);
    window.addEventListener('hashchange', router);
    router();
  })();
})();
