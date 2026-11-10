(() => {
  'use strict';

  const CFG = window.APP_CONFIG || {};
  const ME_KEY = 'aiyan-me';
  const $ = (s) => document.querySelector(s);
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const GENDERS = ['男', '女'];
  const ROLES = ['聖徒', '福音朋友'];
  const AREAS = ['霧峰', '朝陽', '其他'];
  const MAX_FAMILY = 10;

  let state = { capacity: 10, tables: [] };
  // 目前登入的家庭 {id, code, table, members:[{name, gender, role, area}]}
  let me = null;

  const { call, LIVE } = window.FeastAPI;


  // ================= 工具 =================
  let toastTimer;
  function toast(msg, isError = false) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.toggle('error', isError);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
  }

  function setMe(party) {
    me = party;
    if (party) localStorage.setItem(ME_KEY, JSON.stringify({ id: party.id, code: party.code }));
    else localStorage.removeItem(ME_KEY);
  }

  function applyState(s) {
    if (s && s.tables) state = { capacity: s.capacity, tables: s.tables };
  }

  const tableByNo = (no) => state.tables.find((t) => t.no === no);
  const partySize = () => (me ? me.members.length : 0);
  const partyNames = () => (me ? me.members.map((m) => m.name).join('、') : '');

  // ================= 畫面：桌子 =================
  function tableSvg(t, mine) {
    const cap = state.capacity;
    const cx = 80, cy = 80, r = 64;
    const myCount = mine ? partySize() : 0;
    let chairs = '';
    for (let i = 0; i < cap; i++) {
      const a = (i / cap) * Math.PI * 2 - Math.PI / 2;
      const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      let cls = 'chair';
      if (i === 0 && t.captain) cls = 'chair captain';
      else if (i < t.count) cls = i >= t.count - myCount ? 'chair mine' : 'chair taken';
      chairs += `<circle class="${cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9"/>`;
    }
    return `<svg viewBox="0 0 160 160" aria-hidden="true">${chairs}<circle class="tabletop" cx="${cx}" cy="${cy}" r="46"/></svg>`;
  }

  function renderTables() {
    $('#capacity-text').textContent = state.capacity;
    $('#table-grid').innerHTML = state.tables.map((t) => {
      const full = t.count >= state.capacity;
      const mine = !!me && me.table === t.no;
      const status = full ? '已滿' : `${t.count} / ${state.capacity} 人`;
      return `
        <button type="button" class="table-card${full ? ' is-full' : ''}${mine ? ' is-mine' : ''}" data-no="${t.no}"
          aria-label="第 ${t.no} 桌，桌長 ${esc(t.captain || '待定')}，${status}">
          <div class="table-visual">
            ${tableSvg(t, mine)}
            <div class="table-label">
              <span class="table-no">第 ${t.no} 桌</span>
              <span class="captain${t.captain ? '' : ' tbd'}">${esc(t.captain || '桌長待定')}</span>
            </div>
          </div>
          <div class="table-meta">
            ${full ? '<span class="badge badge-full">已滿</span>' : `<span class="badge">${t.count} / ${state.capacity}</span>`}
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
    const we = partySize() > 1 ? `你們 ${partySize()} 位` : '你';
    const where = t
      ? `${we}目前坐在 <strong>第 ${t.no} 桌</strong>（桌長 ${esc(t.captain)}）。想換桌，點選其他桌子即可。`
      : `${we}還沒有選桌，點選下方的桌子入座吧！`;
    el.innerHTML = `
      <div class="status-text"><strong>👋 ${esc(partyNames())}</strong><br>${where}
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
    const full = t.count >= state.capacity;
    const left = state.capacity - t.count;
    const mineHere = !!me && me.table === t.no;
    const myNames = new Set(mineHere ? me.members.map((m) => m.name) : []);

    const rows = [];
    if (t.captain) {
      rows.push(`<li class="is-captain"><span class="avatar">${esc(t.captain.slice(0, 1))}</span>
        <span class="m-name">${esc(t.captain)}</span><span class="m-tag tag-captain">桌長</span></li>`);
    }
    t.members.filter((m) => m.name !== t.captain).forEach((m) => {
      const mine = myNames.has(m.name);
      rows.push(`<li${mine ? ' class="is-me"' : ''}><span class="avatar">${esc(m.name.slice(0, 1))}</span>
        <span class="m-name">${esc(m.name)}</span><span class="m-tag">${mine ? '我們' : esc(m.area)}</span></li>`);
    });
    const list = rows.length ? `<ol class="member-list">${rows.join('')}</ol>` : '<p class="empty">還沒有人入座。</p>';

    let action;
    if (!me) {
      action = `<p class="muted">報名後就可以選這桌。</p>
        <div class="modal-actions">
          <button type="button" class="btn btn-primary" data-action="goto-register">前往報名</button>
          <button type="button" class="btn btn-ghost" data-action="login">已報名？登入</button>
        </div>`;
    } else if (mineHere) {
      action = `<p class="muted">${partySize() > 1 ? '你們' : '你'}目前就坐在這桌 😊</p>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-action="seat" data-table="0">離開這桌</button></div>`;
    } else if (full) {
      action = '<div class="modal-actions"><button type="button" class="btn btn-primary" disabled>已滿</button></div>';
    } else if (left < partySize()) {
      action = `<p class="muted">這桌只剩 ${left} 個位子，不夠你們 ${partySize()} 位一起入座。</p>
        <div class="modal-actions"><button type="button" class="btn btn-primary" disabled>位子不夠</button></div>`;
    } else {
      const who = partySize() > 1 ? `我們 ${partySize()} 位坐這桌` : '我要坐這桌';
      const label = me.table ? `換到這桌（目前在第 ${me.table} 桌）` : who;
      action = `<div class="modal-actions"><button type="button" class="btn btn-primary" data-action="seat" data-table="${t.no}">${label}</button></div>`;
    }

    $('#table-modal-body').innerHTML = `
      <p class="modal-eyebrow">第 ${t.no} 桌</p>
      <h3>桌長：${esc(t.captain || '（未定）')}</h3>
      <p class="modal-count">${full ? '<span class="badge badge-full">已滿</span>' : `目前 ${t.count} / ${state.capacity} 人，還有 ${left} 個位子`}</p>
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

  // ---------- 報名表：多位家人 ----------
  const form = $('#register-form');
  const peopleEl = $('#people');
  let personSeq = 0;

  function chipGroup(name, values) {
    return values.map((v) => `<label class="chip"><input type="radio" name="${name}" value="${v}"><span>${v}</span></label>`).join('');
  }

  function addPerson() {
    const n = peopleEl.children.length;
    if (n >= MAX_FAMILY) return toast(`一次最多報名 ${MAX_FAMILY} 位`, true);
    const k = personSeq++;
    const div = document.createElement('div');
    div.className = 'person';
    div.innerHTML = `
      <div class="person-head">
        <span class="person-title"></span>
        <button type="button" class="person-remove" aria-label="移除這位">移除</button>
      </div>
      <label class="field"><span>姓名 <em>*</em></span>
        <input type="text" name="p${k}-name" maxlength="30" placeholder="請輸入姓名"></label>
      <div class="person-row">
        <fieldset class="field"><legend>性別 <em>*</em></legend><div class="chips">${chipGroup(`p${k}-gender`, GENDERS)}</div></fieldset>
        <fieldset class="field"><legend>身分 <em>*</em></legend><div class="chips">${chipGroup(`p${k}-role`, ROLES)}</div></fieldset>
      </div>`;
    div.dataset.k = k;
    peopleEl.appendChild(div);
    renumber();
    if (n) div.querySelector('input').focus();
  }

  function renumber() {
    const items = [...peopleEl.children];
    items.forEach((el, i) => {
      el.querySelector('.person-title').textContent = i === 0 ? (items.length > 1 ? '報名人' : '報名資料') : `家人 ${i}`;
      el.querySelector('.person-remove').hidden = items.length === 1;
    });
    $('#add-person').hidden = items.length >= MAX_FAMILY;
    form.querySelector('button[type=submit]').textContent = items.length > 1 ? `送出報名（${items.length} 位）` : '送出報名';
  }

  function resetForm() {
    form.reset();
    form.areaOther.hidden = true;
    peopleEl.innerHTML = '';
    addPerson();
  }

  $('#add-person').addEventListener('click', addPerson);
  peopleEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.person-remove');
    if (!btn) return;
    btn.closest('.person').remove();
    renumber();
  });

  form.addEventListener('change', (e) => {
    if (e.target.name === 'area') form.areaOther.hidden = e.target.value !== '其他';
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = $('#form-error');
    errEl.textContent = '';
    const fd = new FormData(form);
    const members = [...peopleEl.children].map((el) => {
      const k = el.dataset.k;
      return { name: String(fd.get(`p${k}-name`) || '').trim(), gender: fd.get(`p${k}-gender`), role: fd.get(`p${k}-role`) };
    });
    const missing = [];
    members.forEach((m, i) => {
      const who = members.length > 1 ? (i ? `家人 ${i} ` : '報名人') : '';
      if (!m.name) missing.push(`${who}姓名`);
      if (!m.gender) missing.push(`${who}${m.name && who ? `（${m.name}）` : ''}性別`);
      if (!m.role) missing.push(`${who}${m.name && who ? `（${m.name}）` : ''}身分`);
    });
    if (!fd.get('area')) missing.push('小區');
    if (missing.length) {
      errEl.textContent = `請填寫：${missing.join('、')}`;
      return;
    }
    const data = { members, area: fd.get('area'), areaOther: fd.get('areaOther'), note: fd.get('note') };
    const btn = form.querySelector('button[type=submit]');
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = '送出中⋯⋯';
    try {
      const res = await call('register', { data });
      setMe(res.me);
      $('#success-names').textContent = res.me.members.map((m) => m.name).join('、');
      $('#success-code').textContent = res.me.code;
      form.hidden = true;
      $('#register-success').hidden = false;
      render();
      $('#register').scrollIntoView({ behavior: 'smooth' });
    } catch (e2) {
      errEl.textContent = e2.message;
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });

  $('#register-another').addEventListener('click', () => {
    resetForm();
    form.hidden = false;
    $('#register-success').hidden = true;
    peopleEl.querySelector('input').focus();
  });

  // 登入
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const errEl = $('#login-error');
    errEl.textContent = '';
    try {
      const who = f.name.value.trim();
      const res = await call('login', { name: who, code: f.code.value });
      setMe(res.me);
      $('#login-modal').close();
      f.reset();
      render();
      if ($('#table-modal').open) renderModal();
      toast(`歡迎回來，${who}！`);
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
    if (ev.address) {
      const q = encodeURIComponent(`${ev.place || ''} ${ev.address}`.trim());
      $('#event-address').innerHTML =
        `${esc(ev.address)}　<a href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">開啟地圖 ↗</a>`;
    }
  }

  async function init() {
    $('#demo-banner').hidden = LIVE;
    renderEventInfo();
    resetForm();
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
