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
              <button type="button" class="tb-edit" data-table="${t.no}" aria-label="編輯第 ${t.no} 桌桌長" title="編輯桌長">✎</button>
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
      if (view === 'people') setView('people');
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


  // ================= 報名資料分頁 =================
  let view = location.hash === '#people' ? 'people' : 'seats';
  let people = null;
  let sortKey = 'table';
  let sortDir = 1;

  const areaGroup = (a) => (!a ? '-' : a.startsWith('其他') ? '其他' : a);
  const tableLabel = (r) => (r.table ? `第 ${r.table} 桌` : '尚未安排');

  function setView(v) {
    view = v;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('is-active', t.dataset.view === v));
    $('#view-seats').hidden = v !== 'seats';
    $('#view-people').hidden = v !== 'people';
    history.replaceState(null, '', v === 'people' ? '#people' : location.pathname + location.search);
    if (v === 'people') loadPeople(true);
    else load(true);
  }

  async function loadPeople(silent = false) {
    try {
      const [res, ov] = await Promise.all([call('adminPeople', { pass }), call('adminOverview', { pass })]);
      tablesInfo = ov.tables;
      capacity = ov.capacity;
      people = res.list.map((r, i) => ({ ...r, idx: i + 1 }));
      renderPeople();
      if (!silent) toast('已更新');
    } catch (e) {
      if (/密碼/.test(e.message)) return logout(e.message);
      toast(e.message, true);
    }
  }

  function filteredPeople() {
    const q = $('#f-q').value.trim().toLowerCase();
    const g = $('#f-gender').value, r = $('#f-role').value, a = $('#f-area').value, seat = $('#f-seat').value;
    return people.filter((p) => {
      if (q && ![p.name, p.note, p.code, p.captain].join(' ').toLowerCase().includes(q)) return false;
      if (g && (g === '-' ? p.gender : p.gender !== g)) return false;
      if (r && (r === '-' ? p.role : p.role !== r)) return false;
      if (a && areaGroup(p.area) !== a) return false;
      if (seat === 'seated' && !p.table) return false;
      if (seat === 'unseated' && p.table) return false;
      return true;
    }).sort((x, y) => {
      const k = sortKey;
      let vx = x[k], vy = y[k];
      if (k === 'table') { vx = x.table || 9999; vy = y.table || 9999; }
      if (typeof vx === 'number' && typeof vy === 'number') return (vx - vy) * sortDir || x.idx - y.idx;
      vx = String(vx ?? ''); vy = String(vy ?? '');
      if (!vx && vy) return 1;           // 空白排最後
      if (vx && !vy) return -1;
      return vx.localeCompare(vy, 'zh-Hant') * sortDir || x.idx - y.idx;
    });
  }

  function renderPeople() {
    if (!people) return;
    const count = (f) => people.filter(f).length;
    const stat = (n, label, cls = '') => `<li class="${cls}"><b>${n}</b><span>${label}</span></li>`;
    $('#people-stats').innerHTML = [
      stat(people.length, '總人數（含桌長）'),
      stat(count((p) => p.gender === '男'), '男'),
      stat(count((p) => p.gender === '女'), '女'),
      stat(count((p) => !p.gender), '性別未填', 'muted-stat'),
      stat(count((p) => areaGroup(p.area) === '霧峰'), '霧峰'),
      stat(count((p) => areaGroup(p.area) === '朝陽'), '朝陽'),
      stat(count((p) => areaGroup(p.area) === '其他'), '其他'),
      stat(count((p) => !p.area), '小區未填', 'muted-stat'),
      stat(count((p) => p.role === '福音朋友'), '福音朋友'),
      stat(count((p) => p.role === '學生'), '學生'),
    ].join('');

    const rows = filteredPeople();
    $('#f-count').textContent = `顯示 ${rows.length} / ${people.length} 筆`;
    const dash = '<span class="blank">—</span>';
    $('#people-body').innerHTML = rows.map((p, i) => `
      <tr class="${p.is_captain ? 'is-captain-row' : ''}${p.table ? '' : ' is-unseated'}">
        <td class="num">${i + 1}</td>
        <td class="name">${esc(p.name)}${p.is_captain ? ' <span class="tag tag-cap">桌長</span>' : ''}${p.family_size > 1 ? ` <span class="tag" title="同一組報名 ${p.family_size} 人">家庭 ${p.family_size}</span>` : ''}</td>
        <td>${p.gender ? `<span class="g g-${p.gender === '男' ? 'm' : 'f'}">${esc(p.gender)}</span>` : dash}</td>
        <td>${esc(p.role) || dash}</td>
        <td>${esc(p.area) || dash}</td>
        <td class="nowrap">${p.table ? `${tableLabel(p)}<small>${esc(p.captain)}</small>` : '<span class="tag tag-warn">尚未安排</span>'}</td>
        <td class="nowrap muted-cell">${esc(p.source)}</td>
        <td class="nowrap muted-cell">${esc(p.created) || dash}</td>
        <td class="mono">${esc(p.code) || dash}</td>
        <td class="note">${esc(p.note) || ''}</td>
        <td class="nowrap"><button type="button" class="row-edit" data-idx="${p.idx}">✎ 編輯</button></td>
      </tr>`).join('') || '<tr><td colspan="11" class="empty-row">沒有符合條件的資料</td></tr>';

    document.querySelectorAll('.people-table th').forEach((th) => {
      th.classList.toggle('sorted', th.dataset.sort === sortKey);
      th.dataset.dir = th.dataset.sort === sortKey ? (sortDir > 0 ? '▲' : '▼') : '';
    });
  }

  function downloadCsv() {
    if (!people) return;
    const head = ['姓名', '性別', '身分', '小區', '桌號', '桌長', '是否桌長', '來源', '報名時間', '修改碼', '備註'];
    const rows = filteredPeople().map((p) => [p.name, p.gender, p.role, p.area, p.table || '尚未安排', p.captain,
      p.is_captain ? '是' : '', p.source, p.created, p.code, p.note]);
    const cell = (v) => {
      const t = String(v ?? '');
      return /[",\n]/.test(t) || /^[=+\-@]/.test(t) ? `"${(/^[=+\-@]/.test(t) ? "'" : '') + t.replace(/"/g, '""')}"` : t;
    };
    const csv = '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `aiyan-roster-${new Date().toISOString().slice(0, 10)}.csv`;
    a.hidden = true;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setView(t.dataset.view)));
  ['#f-q', '#f-gender', '#f-role', '#f-area', '#f-seat'].forEach((id) =>
    $(id).addEventListener('input', renderPeople));
  document.querySelector('.people-table thead').addEventListener('click', (e) => {
    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    if (sortKey === th.dataset.sort) sortDir = -sortDir;
    else { sortKey = th.dataset.sort; sortDir = 1; }
    renderPeople();
  });
  $('#people-refresh').addEventListener('click', () => loadPeople());
  $('#people-csv').addEventListener('click', downloadCsv);


  // ================= 編輯資料 =================
  let tablesInfo = [];
  let capacity = 10;
  let editing = null; // 正在編輯的人（null = 新增）

  const refreshAll = () => (view === 'people' ? loadPeople(true) : load(true));

  // 呼叫後端；密碼失效就登出，其他錯誤回傳訊息
  async function act(action, args) {
    try {
      return { ok: true, res: await call(action, { pass, ...args }) };
    } catch (e) {
      if (/密碼/.test(e.message)) { logout(e.message); return { ok: false, msg: e.message, out: true }; }
      return { ok: false, msg: e.message };
    }
  }

  function parseArea(area) {
    if (area === '霧峰' || area === '朝陽') return { sel: area, other: '' };
    if (!area) return { sel: '', other: '' };
    const m = area.match(/^其他[（(](.*)[）)]$/);
    return { sel: '其他', other: m ? m[1] : area === '其他' ? '' : area };
  }

  function updateTableHint() {
    const f = $('#person-form');
    const no = Number(f.elements.table.value) || 0;
    const t = tablesInfo.find((x) => x.no === no);
    const hint = $('#table-hint');
    hint.textContent = '';
    if (!t) return;
    const mine = editing && editing.table === no;
    const after = t.count + (mine || (t.captain && f.elements.pname.value.trim() === t.captain) ? 0 : 1);
    if (!mine && after > capacity) hint.textContent = `⚠ 這桌目前 ${t.count}/${capacity} 人，儲存後會超過上限（後台可以超過）。`;
  }

  function openPerson(p) {
    editing = p || null;
    const f = $('#person-form');
    f.reset();
    $('#person-error').textContent = '';
    $('#person-title').textContent = p ? '編輯資料' : '新增人員';
    $('#person-save').textContent = p ? '儲存修改' : '新增';
    $('#person-delete').hidden = !p;
    f.elements.table.innerHTML = '<option value="0">尚未安排</option>' + tablesInfo.map((t) =>
      `<option value="${t.no}">第 ${t.no} 桌 ${esc(t.captain || '（桌長待定）')}・${t.count}/${capacity}</option>`).join('');
    if (p) {
      const a = parseArea(p.area);
      f.elements.pname.value = p.name;
      f.elements.gender.value = p.gender || '';
      f.elements.role.value = p.role || '';
      f.elements.area.value = a.sel;
      f.elements.areaOther.value = a.other;
      f.elements.table.value = String(p.table || 0);
      f.elements.note.value = p.note || '';
    }
    $('#person-family-hint').textContent = p && p.family_size > 1
      ? `此人與其他 ${p.family_size - 1} 位是同一組報名。修改小區、備註或桌次時，會自動把他單獨分出來，不會影響其他家人。` : '';
    updateTableHint();
    $('#person-modal').showModal();
    f.elements.pname.focus();
  }

  $('#person-form').addEventListener('input', updateTableHint);

  $('#person-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const other = f.elements.areaOther.value.trim();
    const args = {
      name: f.elements.pname.value, gender: f.elements.gender.value, role: f.elements.role.value,
      area: f.elements.area.value === '其他' && other ? `其他（${other}）` : f.elements.area.value,
      note: f.elements.note.value, table: Number(f.elements.table.value) || 0,
    };
    const btn = $('#person-save');
    btn.disabled = true;
    const r = await act(editing ? 'adminUpdatePerson' : 'adminAddPerson', editing ? { ...args, person: editing.id } : args);
    btn.disabled = false;
    if (!r.ok) { if (!r.out) $('#person-error').textContent = r.msg; return; }
    $('#person-modal').close();
    toast(editing ? `已更新 ${args.name.trim()}` : `已新增 ${args.name.trim()}`);
    refreshAll();
  });

  $('#person-delete').addEventListener('click', async () => {
    if (!editing) return;
    if (!confirm(`確定要刪除「${editing.name}」嗎？\n刪除後無法復原。`)) return;
    const r = await act('adminDeletePerson', { person: editing.id });
    if (!r.ok) { if (!r.out) $('#person-error').textContent = r.msg; return; }
    $('#person-modal').close();
    toast(`已刪除 ${editing.name}`);
    refreshAll();
  });

  // ---- 桌長 ----
  let captainTable = 0;
  function openCaptain(no) {
    const t = (view === 'people' ? tablesInfo : (data && data.tables) || []).find((x) => x.no === no);
    if (!t) return;
    captainTable = no;
    $('#captain-title').textContent = `編輯第 ${no} 桌桌長`;
    $('#captain-form').elements.captain.value = t.captain || '';
    $('#captain-error').textContent = '';
    $('#captain-modal').showModal();
    $('#captain-form').elements.captain.focus();
  }

  $('#captain-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = e.target.elements.captain.value.trim();
    const r = await act('adminSetCaptain', { table: captainTable, captain: name });
    if (!r.ok) { if (!r.out) $('#captain-error').textContent = r.msg; return; }
    $('#captain-modal').close();
    toast(name ? `第 ${captainTable} 桌桌長：${name}` : `第 ${captainTable} 桌桌長待定`);
    refreshAll();
  });

  $('#add-table').addEventListener('click', async () => {
    const r = await act('adminAddTable', {});
    if (!r.ok) { if (!r.out) toast(r.msg, true); return; }
    toast('已新增一桌');
    load(true);
  });

  $('#add-person').addEventListener('click', () => openPerson(null));

  $('#people-body').addEventListener('click', (e) => {
    const btn = e.target.closest('.row-edit');
    if (!btn) return;
    const p = people.find((x) => x.idx === Number(btn.dataset.idx));
    if (!p) return;
    if (p.id) openPerson(p);
    else openCaptain(p.table); // 尚未報名的桌長：只能改桌長姓名
  });

  $('#tables').addEventListener('click', (e) => {
    const b = e.target.closest('.tb-edit');
    if (b) openCaptain(Number(b.dataset.table));
  });

  document.querySelectorAll('dialog').forEach((d) =>
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

  // ---------- 初始化 ----------
  $('#demo-banner').hidden = LIVE;
  const refreshCurrent = () => (view === 'people' ? loadPeople(true) : load(true));
  if (pass) {
    showBoard(true);
    setView(view);
  }
  setInterval(() => { if (pass && !document.hidden) refreshCurrent(); }, 15000);
  document.addEventListener('visibilitychange', () => { if (pass && !document.hidden) refreshCurrent(); });
})();
