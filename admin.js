(() => {
  'use strict';

  const CFG = window.APP_CONFIG || {};
  const { call, LIVE } = window.FeastAPI;
  const PASS_KEY = 'aiyan-admin-pass';
  const $ = (s) => document.querySelector(s);
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let pass = sessionStorage.getItem(PASS_KEY) || '';
  let data = null;
  let dragging = false;
  let busy = false;
  let sortables = [];

  // ---------- 工具 ----------
  let toastTimer;
  function toast(msg, isError = false) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.toggle('error', isError);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  const memberCount = (t) => t.members.filter((m) => m.name !== t.captain).length;

  // ---------- 畫面 ----------
  function chip(m) {
    return `<li class="name-chip" data-id="${esc(m.id)}" data-family="${esc(m.family)}" title="${esc(m.area)}">${esc(m.name)}</li>`;
  }

  function render() {
    if (!data) return;
    const cap = data.capacity;
    $('#cap').textContent = cap;

    // 統計
    const seated = data.tables.reduce((n, t) => n + memberCount(t), 0);
    const captains = data.tables.filter((t) => t.captain).length;
    const open = data.tables.reduce((n, t) => n + Math.max(0, cap - t.count), 0);
    const over = data.tables.filter((t) => t.count > cap);
    $('#stats').innerHTML = `
      <li><b>${seated + captains}</b><span>已入座（含桌長）</span></li>
      <li class="${data.unseated.length ? 'warn' : ''}"><b>${data.unseated.length}</b><span>尚未安排</span></li>
      <li><b>${open}</b><span>剩餘空位</span></li>
      <li class="${over.length ? 'danger' : ''}"><b>${over.length}</b><span>超過人數的桌</span></li>`;

    // 尚未安排
    $('#unseated-count').textContent = data.unseated.length;
    $('#unseated').innerHTML = data.unseated.map(chip).join('');

    // 各桌
    $('#tables').innerHTML = data.tables.map((t) => {
      const n = t.count;
      const state = n > cap ? 'over' : n >= cap ? 'full' : 'open';
      const label = n > cap ? `超過 ${n - cap} 人` : n >= cap ? '已滿' : `剩 ${cap - n} 位`;
      const others = t.members.filter((m) => m.name !== t.captain);
      return `
        <section class="table-board is-${state}">
          <header>
            <div class="tb-title">
              <span class="tb-no">${t.no}</span>
              <span class="tb-captain">${esc(t.captain || '桌長待定')}</span>
            </div>
            <span class="tb-count" title="${label}">${n}/${cap}<small>${label}</small></span>
          </header>
          ${t.captain ? `<div class="captain-chip">👑 ${esc(t.captain)}</div>` : ''}
          <ul class="chip-list drop-zone" data-table="${t.no}">${others.map(chip).join('')}</ul>
        </section>`;
    }).join('');

    bindDrag();
  }

  function bindDrag() {
    sortables.forEach((s) => s.destroy());
    sortables = [...document.querySelectorAll('.drop-zone')].map((el) =>
      Sortable.create(el, {
        group: 'seats',
        animation: 150,
        emptyInsertThreshold: 24,
        ghostClass: 'chip-ghost',
        chosenClass: 'chip-chosen',
        delay: 120,
        delayOnTouchOnly: true,
        onStart: () => { dragging = true; document.body.classList.add('is-dragging'); },
        onEnd: (evt) => {
          dragging = false;
          document.body.classList.remove('is-dragging');
          if (evt.from === evt.to) return;
          move(evt.item.dataset.id, Number(evt.to.dataset.table), evt.item.textContent);
        },
      })
    );
  }

  // ---------- 資料 ----------
  async function load(silent = false) {
    if (busy || dragging) return;
    try {
      data = await call('adminOverview', { pass });
      render();
      if (!silent) toast('已更新');
    } catch (e) {
      if (/密碼/.test(e.message)) return logout(e.message);
      toast(e.message, true);
    }
  }

  async function move(person, table, name) {
    busy = true;
    try {
      data = await call('adminMove', { pass, person, table });
      toast(table ? `${name} → 第 ${table} 桌` : `${name} → 尚未安排`);
    } catch (e) {
      toast(e.message, true);
    } finally {
      busy = false;
      render();
      if (!data) load(true);
    }
  }

  // ---------- 複製成群組公告文字 ----------
  function buildText() {
    const ev = CFG.EVENT || {};
    const lines = [];
    if (CFG.ORG_NAME) lines.push(CFG.ORG_NAME);
    lines.push(`${ev.date ? ev.date.replace(/（.*?）/, '') : ''}年終愛筵桌次及名單`);
    if (ev.place) lines.push(`愛筵地點：${ev.place}`);
    lines.push('', '第一位為桌長', '');
    lines.push(`☆報名參加尚未入桌：${data.unseated.map((m) => m.name).join('、')}`, '');
    data.tables.forEach((t) => {
      const others = t.members.filter((m) => m.name !== t.captain).map((m) => m.name);
      if (!t.captain && !others.length) return;
      lines.push(`${t.no}-${t.captain || '桌長待定'}（${t.count}人）：${others.join('、')}`);
    });
    return lines.join('\n');
  }

  async function copyText() {
    if (!data) return;
    const text = buildText();
    try {
      await navigator.clipboard.writeText(text);
      toast('已複製，可以貼到群組了');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      toast('已複製，可以貼到群組了');
    }
  }

  // ---------- 登入 ----------
  function showBoard(on) {
    $('#gate').hidden = on;
    $('#board').hidden = !on;
    $('#logout').hidden = !on;
  }

  function logout(msg) {
    pass = '';
    data = null;
    sessionStorage.removeItem(PASS_KEY);
    showBoard(false);
    if (msg) $('#gate-error').textContent = msg;
  }

  $('#gate-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const input = e.target.pass;
    $('#gate-error').textContent = '';
    btn.disabled = true;
    try {
      data = await call('adminOverview', { pass: input.value });
      pass = input.value;
      sessionStorage.setItem(PASS_KEY, pass);
      input.value = '';
      showBoard(true);
      render();
    } catch (err) {
      $('#gate-error').textContent = err.message;
      input.select();
    } finally {
      btn.disabled = false;
    }
  });

  $('#logout').addEventListener('click', (e) => { e.preventDefault(); logout(); });
  $('#refresh').addEventListener('click', () => load());
  $('#copy-text').addEventListener('click', copyText);

  // ---------- 初始化 ----------
  $('#demo-banner').hidden = LIVE;
  if (pass) {
    showBoard(true);
    load(true);
  }
  setInterval(() => { if (pass && !document.hidden) load(true); }, 15000);
  document.addEventListener('visibilitychange', () => { if (pass && !document.hidden) load(true); });
})();
