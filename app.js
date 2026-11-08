(() => {
  'use strict';

  const CFG = window.APP_CONFIG || {};
  const ME_KEY = 'aiyan-me';
  const $ = (s) => document.querySelector(s);
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let state = { capacity: 10, tables: [] };
  let me = null; // 目前登入的報名者 {id, code, name, gender, role, area, note, table}

  // ================= 後端：Google Apps Script =================
  async function remoteCall(action, payload = {}) {
    const res = await fetch(CFG.API_URL, {
      method: 'POST',
      // 用 text/plain 避免 CORS 預檢，Apps Script 才收得到
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...payload }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || '發生錯誤，請稍後再試');
    return json;
  }

  // ================= 示範模式：用 localStorage 模擬後端 =================
  const DEMO_KEY = 'aiyan-demo-db';
  const DEMO_CAPACITY = 10;
  const AREAS = ['霧峰', '朝陽', '其他'];
  const GENDERS = ['男', '女'];
  const ROLES = ['聖徒', '福音朋友'];

  function demoSeed() {
    const names = '陳恩典 林喜樂 王平安 張信望 李以馬內利 黃榮光 吳憐恤 劉約書亞 蔡路得 楊撒母耳 許馬利亞 鄭提摩太 謝百基拉 郭亞居拉 洪多加 邱巴拿巴 曾以斯帖 廖迦勒 賴拿俄米 周約瑟'.split(' ');
    const seats = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 5, 5, 5, 8];
    return {
      tables: Array.from({ length: 20 }, (_, i) => ({ no: i + 1, captain: `桌長${i + 1}` })),
      people: names.map((name, i) => ({
        id: 'demo' + i, code: String(1000 + i), name,
        gender: GENDERS[i % 2], role: ROLES[i % 3 === 0 ? 1 : 0], area: AREAS[i % 3], note: '', table: seats[i],
      })),
    };
  }

  function cleanRegistration(d = {}) {
    const name = String(d.name || '').trim();
    if (!name) throw new Error('請填寫姓名');
    if (!GENDERS.includes(d.gender)) throw new Error('請選擇性別');
    if (!ROLES.includes(d.role)) throw new Error('請選擇身分');
    if (!AREAS.includes(d.area)) throw new Error('請選擇小區');
    const other = String(d.areaOther || '').trim();
    return {
      name: name.slice(0, 30), gender: d.gender, role: d.role,
      area: d.area === '其他' && other ? `其他（${other.slice(0, 20)}）` : d.area,
      note: String(d.note || '').trim().slice(0, 200),
    };
  }

  async function demoCall(action, p = {}) {
    const db = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null') || demoSeed();
    const find = () => {
      const x = db.people.find((q) => q.id === p.id && q.code === String(p.code));
      if (!x) throw new Error('找不到報名資料，請重新登入');
      return x;
    };
    const stateOf = () => ({
      capacity: DEMO_CAPACITY,
      tables: db.tables.map((t) => ({
        ...t,
        members: db.people.filter((q) => q.table === t.no).map((q) => ({ name: q.name, area: q.area, role: q.role })),
      })),
    });
    let res;
    switch (action) {
      case 'state': res = stateOf(); break;
      case 'register': {
        const person = { ...cleanRegistration(p.data), id: Math.random().toString(36).slice(2, 10), code: String(1000 + Math.floor(Math.random() * 9000)), table: 0 };
        db.people.push(person);
        res = { me: person };
        break;
      }
      case 'login': {
        const x = db.people.find((q) => q.name === String(p.name).trim() && q.code === String(p.code).trim());
        if (!x) throw new Error('姓名或修改碼不正確');
        res = { me: x };
        break;
      }
      case 'me': res = { me: find() }; break;
      case 'seat': {
        const x = find();
        const t = Number(p.table);
        if (t !== 0) {
          if (!db.tables.some((tb) => tb.no === t)) throw new Error('桌號不正確');
          const n = db.people.filter((q) => q.table === t && q.id !== x.id).length;
          if (n >= DEMO_CAPACITY) throw new Error('這桌已經滿了，請選擇其他桌');
        }
        x.table = t;
        res = { me: x, ...stateOf() };
        break;
      }
      default: throw new Error('未知的操作');
    }
    localStorage.setItem(DEMO_KEY, JSON.stringify(db));
    await new Promise((r) => setTimeout(r, 200));
    return JSON.parse(JSON.stringify({ ok: true, ...res }));
  }

  const call = CFG.API_URL ? remoteCall : demoCall;

  // ================= 工具 =================
  let toastTimer;
  function toast(msg, isError = false) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.toggle('error', isError);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }

  function setMe(person) {
    me = person;
    if (person) localStorage.setItem(ME_KEY, JSON.stringify({ id: person.id, code: person.code }));
    else localStorage.removeItem(ME_KEY);
  }

  function applyState(s) {
    if (s && s.tables) state = { capacity: s.capacity, tables: s.tables };
  }

  const tableByNo = (no) => state.tables.find((t) => t.no === no);

  // ================= 畫面：桌子 =================
  function tableSvg(count, capacity, mine) {
    const cx = 80, cy = 80, r = 64;
    let chairs = '';
    for (let i = 0; i < capacity; i++) {
      const a = (i / capacity) * Math.PI * 2 - Math.PI / 2;
      const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      const cls = i < count ? (mine && i === count - 1 ? 'chair mine' : 'chair taken') : 'chair';
      chairs += `<circle class="${cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9"/>`;
    }
    return `<svg viewBox="0 0 160 160" aria-hidden="true">${chairs}<circle class="tabletop" cx="${cx}" cy="${cy}" r="46"/></svg>`;
  }

  function renderTables() {
    $('#capacity-text').textContent = state.capacity;
    $('#table-grid').innerHTML = state.tables.map((t) => {
      const n = t.members.length;
      const full = n >= state.capacity;
      const mine = !!me && me.table === t.no;
      const status = full ? '已滿' : `${n} / ${state.capacity} 人`;
      return `
        <button type="button" class="table-card${full ? ' is-full' : ''}${mine ? ' is-mine' : ''}" data-no="${t.no}"
          aria-label="第 ${t.no} 桌，桌長 ${esc(t.captain)}，${status}">
          <div class="table-visual">
            ${tableSvg(n, state.capacity, mine)}
            <div class="table-label">
              <span class="table-no">第 ${t.no} 桌</span>
              <span class="captain">${esc(t.captain)}</span>
            </div>
          </div>
          <div class="table-meta">
            ${full ? '<span class="badge badge-full">已滿</span>' : `<span class="badge">${n} / ${state.capacity}</span>`}
            ${mine ? '<span class="badge badge-mine">我的座位</span>' : ''}
          </div>
        </button>`;
    }).join('');
  }

  function renderMyStatus() {
    const el = $('#my-status');
    if (!me) {
      el.innerHTML = `
        <div class="status-text"><strong>還沒報名嗎？</strong>先完成上方的報名表，就可以選桌了。</div>
        <div class="status-actions">
          <a href="#register" class="btn btn-small btn-primary">去報名</a>
          <button type="button" class="btn btn-small btn-ghost" data-action="login">已報名？登入</button>
        </div>`;
      return;
    }
    const t = me.table ? tableByNo(me.table) : null;
    const where = t
      ? `你目前坐在 <strong>第 ${t.no} 桌</strong>（桌長 ${esc(t.captain)}）。想換桌，點選其他桌子即可。`
      : '你還沒有選桌，點選下方的桌子入座吧！';
    el.innerHTML = `
      <div class="status-text"><strong>👋 ${esc(me.name)}</strong>，${where}
        <span class="muted">修改碼：${esc(me.code)}</span></div>
      <div class="status-actions">
        <button type="button" class="btn btn-small btn-ghost" data-action="logout">切換身分</button>
      </div>`;
  }

  function render() {
    renderTables();
    renderMyStatus();
  }

  // ================= 桌子詳情視窗 =================
  let openTableNo = null;

  function renderModal() {
    const t = tableByNo(openTableNo);
    if (!t) return;
    const n = t.members.length;
    const full = n >= state.capacity;
    const mineHere = !!me && me.table === t.no;

    const list = n
      ? `<ol class="member-list">${t.members.map((m) => `
          <li><span class="avatar">${esc(m.name.slice(0, 1))}</span>
            <span class="m-name">${esc(m.name)}</span>
            <span class="m-tag">${esc(m.area)}</span></li>`).join('')}</ol>`
      : '<p class="empty">還沒有人入座，成為第一位吧！</p>';

    let action;
    if (!me) {
      action = `<p class="muted">報名後就可以選這桌。</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-primary" data-action="goto-register">前往報名</button>
          <button type="button" class="btn btn-ghost" data-action="login">已報名？登入</button>
        </div>`;
    } else if (mineHere) {
      action = `<p class="muted">你目前就坐在這桌 😊</p>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-action="seat" data-table="0">離開這桌</button></div>`;
    } else if (full) {
      action = '<div class="modal-actions"><button type="button" class="btn btn-primary" disabled>已滿</button></div>';
    } else {
      const label = me.table ? `換到這桌（目前在第 ${me.table} 桌）` : '我要坐這桌';
      action = `<div class="modal-actions"><button type="button" class="btn btn-primary" data-action="seat" data-table="${t.no}">${label}</button></div>`;
    }

    $('#table-modal-body').innerHTML = `
      <p class="modal-eyebrow">第 ${t.no} 桌</p>
      <h3>桌長：${esc(t.captain)}</h3>
      <p class="modal-count">${full ? '<span class="badge badge-full">已滿</span>' : `目前 ${n} / ${state.capacity} 人`}</p>
      ${list}
      ${action}`;
  }

  function openTable(no) {
    openTableNo = no;
    renderModal();
    $('#table-modal').showModal();
  }

  // ================= 動作 =================
  async function refresh() {
    try {
      applyState(await call('state'));
      render();
      if ($('#table-modal').open) renderModal();
    } catch (e) {
      $('#table-grid').innerHTML = `<p class="loading">座位載入失敗：${esc(e.message)}</p>`;
    }
  }

  async function seat(table, btn) {
    if (!me) return;
    btn.disabled = true;
    try {
      const res = await call('seat', { id: me.id, code: me.code, table });
      setMe(res.me);
      applyState(res);
      render();
      $('#table-modal').close();
      toast(table ? `已入座第 ${table} 桌 🎉` : '已離開這桌');
    } catch (e) {
      toast(e.message, true);
      await refresh();
    } finally {
      btn.disabled = false;
    }
  }

  // 報名表
  const form = $('#register-form');
  form.addEventListener('change', (e) => {
    if (e.target.name === 'area') form.areaOther.hidden = e.target.value !== '其他';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = $('#form-error');
    errEl.textContent = '';
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());
    const missing = [];
    if (!String(data.name || '').trim()) missing.push('姓名');
    if (!data.gender) missing.push('性別');
    if (!data.role) missing.push('身分');
    if (!data.area) missing.push('小區');
    if (missing.length) {
      errEl.textContent = `請填寫：${missing.join('、')}`;
      return;
    }
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = '送出中⋯⋯';
    try {
      const res = await call('register', { data });
      setMe(res.me);
      $('#success-name').textContent = res.me.name;
      $('#success-code').textContent = res.me.code;
      form.hidden = true;
      $('#register-success').hidden = false;
      render();
      $('#register').scrollIntoView({ behavior: 'smooth' });
    } catch (e2) {
      errEl.textContent = e2.message;
    } finally {
      btn.disabled = false;
      btn.textContent = '送出報名';
    }
  });

  $('#register-another').addEventListener('click', () => {
    form.reset();
    form.areaOther.hidden = true;
    form.hidden = false;
    $('#register-success').hidden = true;
    form.name.focus();
  });

  // 登入
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const errEl = $('#login-error');
    errEl.textContent = '';
    try {
      const res = await call('login', { name: f.name.value, code: f.code.value });
      setMe(res.me);
      $('#login-modal').close();
      f.reset();
      render();
      if ($('#table-modal').open) renderModal();
      toast(`歡迎回來，${res.me.name}！`);
    } catch (e2) {
      errEl.textContent = e2.message;
    }
  });

  // 事件委派
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.table-card');
    if (card) return openTable(Number(card.dataset.no));

    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    switch (btn.dataset.action) {
      case 'seat': return seat(Number(btn.dataset.table), btn);
      case 'login': return $('#login-modal').showModal();
      case 'logout':
        setMe(null);
        render();
        return toast('已登出，可用姓名＋修改碼重新登入');
      case 'goto-register':
        $('#table-modal').close();
        return $('#register').scrollIntoView({ behavior: 'smooth' });
    }
  });

  // 點視窗外面關閉
  document.querySelectorAll('dialog').forEach((d) =>
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); })
  );

  // ================= 初始化 =================
  function renderEventInfo() {
    const ev = CFG.EVENT || {};
    const items = [['📅', ev.date], ['⏰', ev.time], ['📍', ev.place]].filter(([, v]) => v);
    $('#event-info').innerHTML = items.map(([i, v]) => `<li>${i} ${esc(v)}</li>`).join('');
  }

  async function init() {
    $('#demo-banner').hidden = !!CFG.API_URL;
    renderEventInfo();
    const saved = JSON.parse(localStorage.getItem(ME_KEY) || 'null');
    if (saved) {
      try {
        setMe((await call('me', saved)).me);
      } catch {
        setMe(null);
      }
    }
    await refresh();
    // 定時更新，讓大家看到最新座位
    setInterval(() => { if (!document.hidden) refresh(); }, 20000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  }

  init();
})();
