/* 簡易活動登記 LIFF App */
(() => {
  const CFG = window.APP_CONFIG || {};
  const DEMO = !CFG.GAS_URL;
  const $app = document.getElementById('app');

  const state = { profile: null, idToken: null, liffReady: false };

  // ---------- 工具 ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (msg, ms = 2200) => {
    const t = document.getElementById('toast');
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.add('hidden'), ms);
  };
  const banner = (msg) => { const b = document.getElementById('banner'); b.innerHTML = msg; b.classList.remove('hidden'); };
  const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
  const fmtDate = (d) => {
    if (!d) return '';
    const dt = new Date(d + 'T00:00:00');
    return isNaN(dt) ? d : `${dt.getFullYear()}/${dt.getMonth() + 1}/${dt.getDate()}（${WEEK[dt.getDay()]}）`;
  };
  const fmtDateTime = (ev) => [fmtDate(ev.date), ev.time].filter(Boolean).join(' ');
  const shareUrl = (id) => `https://liff.line.me/${CFG.LIFF_ID}?event=${encodeURIComponent(id)}`;

  const statusOf = (ev) => {
    if (ev.status === 'closed') return { key: 'closed', text: '已截止' };
    if (ev.deadline && new Date() > new Date(ev.deadline + 'T23:59:59')) return { key: 'closed', text: '已截止' };
    if (Number(ev.capacity) > 0 && ev.total >= Number(ev.capacity)) return { key: 'full', text: '已額滿' };
    return { key: 'open', text: '報名中' };
  };
  const badge = (ev) => { const s = statusOf(ev); return `<span class="badge ${s.key === 'open' ? '' : s.key}">${s.text}</span>`; };

  // ---------- API ----------
  async function api(action, data = {}) {
    if (DEMO) return demoApi(action, data);
    const res = await fetch(CFG.GAS_URL, {
      method: 'POST',
      body: JSON.stringify({ action, idToken: state.idToken, ...data }), // text/plain，避免 CORS preflight
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || '發生錯誤');
    return json.data;
  }

  // 示範模式：資料存在 localStorage（規則與 gas/Code.gs 一致）
  function demoApi(action, d) {
    const db = JSON.parse(localStorage.getItem('demo-db') || '{"events":[],"regs":[]}');
    const save = () => localStorage.setItem('demo-db', JSON.stringify(db));
    const me = state.profile;
    const withCount = (ev) => {
      const regs = db.regs.filter((r) => r.eventId === ev.id && r.status === 'active');
      return { ...ev, total: regs.reduce((n, r) => n + Number(r.count || 1), 0), regCount: regs.length };
    };
    const find = (id) => { const ev = db.events.find((e) => e.id === id); if (!ev) throw new Error('找不到活動'); return ev; };
    switch (action) {
      case 'createEvent': {
        const ev = { ...d.event, id: Math.random().toString(36).slice(2, 10), ownerId: me.userId, ownerName: me.displayName, status: 'open', createdAt: new Date().toISOString() };
        db.events.push(ev); save(); return { id: ev.id };
      }
      case 'updateEvent': {
        const ev = find(d.id); if (ev.ownerId !== me.userId) throw new Error('只有主辦人可以修改');
        Object.assign(ev, d.event); save(); return {};
      }
      case 'getEvent': {
        const ev = withCount(find(d.id));
        const mine = db.regs.find((r) => r.eventId === d.id && r.userId === me.userId && r.status === 'active') || null;
        const isOwner = ev.ownerId === me.userId;
        return { event: ev, myReg: mine, isOwner, regs: isOwner ? db.regs.filter((r) => r.eventId === d.id && r.status === 'active') : null };
      }
      case 'register': {
        const ev = withCount(find(d.id)); const st = statusOf(ev);
        const old = db.regs.find((r) => r.eventId === d.id && r.userId === me.userId && r.status === 'active');
        const extra = Number(d.reg.count || 1) - (old ? Number(old.count || 1) : 0);
        if (st.key === 'closed') throw new Error('報名已截止');
        if (Number(ev.capacity) > 0 && ev.total + extra > Number(ev.capacity)) throw new Error('名額不足');
        if (old) Object.assign(old, d.reg, { updatedAt: new Date().toISOString() });
        else db.regs.push({ ...d.reg, eventId: d.id, userId: me.userId, displayName: me.displayName, status: 'active', createdAt: new Date().toISOString() });
        save(); return {};
      }
      case 'cancel': {
        const r = db.regs.find((x) => x.eventId === d.id && x.userId === me.userId && x.status === 'active');
        if (r) r.status = 'cancelled'; save(); return {};
      }
      case 'myEvents': {
        const created = db.events.filter((e) => e.ownerId === me.userId).map(withCount);
        const ids = db.regs.filter((r) => r.userId === me.userId && r.status === 'active').map((r) => r.eventId);
        const joined = db.events.filter((e) => ids.includes(e.id)).map(withCount);
        return { created, joined };
      }
    }
    throw new Error('未知的動作');
  }

  // ---------- LIFF 初始化 ----------
  async function initLiff() {
    try {
      await liff.init({ liffId: CFG.LIFF_ID });
      state.liffReady = true;
      if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return false; }
      state.profile = await liff.getProfile();
      state.idToken = liff.getIDToken();
    } catch (e) {
      console.warn('LIFF 初始化失敗，改用測試身分', e);
      if (!DEMO) { $app.innerHTML = `<div class="card">LIFF 初始化失敗：${esc(e.message)}<br>請從 LINE 開啟：<a href="${shareUrl('')}">${esc(CFG.LIFF_ID)}</a></div>`; return false; }
      let uid = localStorage.getItem('demo-uid');
      if (!uid) { uid = 'U-demo-' + Math.random().toString(36).slice(2, 8); localStorage.setItem('demo-uid', uid); }
      state.profile = { userId: uid, displayName: '測試使用者', pictureUrl: '' };
    }
    if (DEMO) banner('⚠️ 示範模式：尚未設定 GAS_URL，資料只會存在這支手機／瀏覽器。');
    const p = state.profile;
    document.getElementById('user').innerHTML = `${p.pictureUrl ? `<img src="${esc(p.pictureUrl)}" alt="">` : ''}<span>${esc(p.displayName)}</span>`;
    return true;
  }

  // ---------- 頁面 ----------
  const routes = [
    [/^#?\/?$/, pageHome],
    [/^#\/new$/, () => pageForm()],
    [/^#\/e\/([\w-]+)$/, (id) => pageEvent(id)],
    [/^#\/e\/([\w-]+)\/edit$/, (id) => pageForm(id)],
    [/^#\/e\/([\w-]+)\/manage$/, (id) => pageManage(id)],
  ];
  async function router() {
    const h = location.hash || '#/';
    window.scrollTo(0, 0);
    for (const [re, fn] of routes) {
      const m = h.match(re);
      if (m) {
        $app.innerHTML = '<div class="loading">載入中…</div>';
        try { await fn(...m.slice(1)); } catch (e) { $app.innerHTML = `<div class="card">😥 ${esc(e.message)}<a class="btn secondary" href="#/">回首頁</a></div>`; }
        return;
      }
    }
    location.hash = '#/';
  }

  const eventCard = (ev) => `
    <a class="card event-item" href="#/e/${esc(ev.id)}">
      <div class="title">${esc(ev.title)} ${badge(ev)}</div>
      <div class="meta">📅 ${esc(fmtDateTime(ev))}　👥 ${ev.total}${Number(ev.capacity) > 0 ? ' / ' + esc(ev.capacity) : ''} 人</div>
    </a>`;

  async function pageHome() {
    const { created, joined } = await api('myEvents');
    const sort = (a) => a.sort((x, y) => String(y.date).localeCompare(String(x.date)));
    $app.innerHTML = `
      <a class="btn" href="#/new">＋ 建立新活動</a>
      <div class="section-title">我主辦的活動</div>
      ${created.length ? sort(created).map(eventCard).join('') : '<div class="empty">還沒有建立活動</div>'}
      <div class="section-title">我報名的活動</div>
      ${joined.length ? sort(joined).map(eventCard).join('') : '<div class="empty">還沒有報名活動</div>'}`;
  }

  async function pageForm(id) {
    let ev = { title: '', date: '', time: '', location: '', description: '', capacity: '', deadline: '', askPhone: true, maxPerPerson: 1 };
    if (id) {
      const r = await api('getEvent', { id });
      if (!r.isOwner) throw new Error('只有主辦人可以編輯');
      ev = r.event;
    }
    $app.innerHTML = `
      <form class="card" id="f">
        <h2>${id ? '編輯活動' : '建立活動'}</h2>
        <label>活動名稱</label><input name="title" required maxlength="60" value="${esc(ev.title)}" placeholder="例：週六聚餐">
        <div class="row">
          <div><label>日期</label><input type="date" name="date" required value="${esc(ev.date)}"></div>
          <div><label>時間 <span class="opt">(選填)</span></label><input type="time" name="time" value="${esc(ev.time)}"></div>
        </div>
        <label>地點 <span class="opt">(選填)</span></label><input name="location" maxlength="100" value="${esc(ev.location)}">
        <label>活動說明 <span class="opt">(選填)</span></label><textarea name="description" maxlength="2000">${esc(ev.description)}</textarea>
        <div class="row">
          <div><label>名額上限 <span class="opt">(0=不限)</span></label><input type="number" name="capacity" min="0" value="${esc(ev.capacity || 0)}"></div>
          <div><label>每人最多報名</label><input type="number" name="maxPerPerson" min="1" max="20" value="${esc(ev.maxPerPerson || 1)}"></div>
        </div>
        <label>報名截止日 <span class="opt">(選填)</span></label><input type="date" name="deadline" value="${esc(ev.deadline)}">
        <label class="check"><input type="checkbox" name="askPhone" ${ev.askPhone && ev.askPhone !== 'false' ? 'checked' : ''}> 報名時需填寫電話</label>
        <button class="btn" type="submit">${id ? '儲存' : '建立活動'}</button>
        <a class="btn secondary" href="${id ? '#/e/' + esc(id) : '#/'}">取消</a>
      </form>`;
    document.getElementById('f').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      data.askPhone = fd.has('askPhone');
      data.capacity = Number(data.capacity || 0);
      data.maxPerPerson = Math.max(1, Number(data.maxPerPerson || 1));
      e.target.querySelector('button').disabled = true;
      try {
        if (id) { await api('updateEvent', { id, event: data }); toast('已儲存'); location.hash = '#/e/' + id; }
        else { const r = await api('createEvent', { event: data }); toast('活動已建立，快分享給朋友！'); location.hash = '#/e/' + r.id; }
      } catch (err) { toast(err.message); e.target.querySelector('button').disabled = false; }
    };
  }

  async function pageEvent(id) {
    const { event: ev, myReg, isOwner } = await api('getEvent', { id });
    const st = statusOf(ev);
    const cap = Number(ev.capacity) || 0;
    const remain = cap ? Math.max(0, cap - ev.total) : Infinity;
    const maxPer = Math.max(1, Number(ev.maxPerPerson) || 1);
    const allowCount = Math.min(maxPer, remain + (myReg ? Number(myReg.count || 1) : 0));
    const askPhone = ev.askPhone === true || ev.askPhone === 'true' || ev.askPhone === 'TRUE';
    const canEdit = st.key !== 'closed' && allowCount >= 1;

    const regForm = `
      <form class="card" id="rf">
        <h3>${myReg ? '我的報名資料' : '我要報名'}</h3>
        ${myReg ? '<div class="notice">✅ 你已完成報名，可以修改或取消。</div>' : ''}
        <label>姓名</label><input name="name" required maxlength="30" value="${esc(myReg?.name || state.profile.displayName)}">
        ${askPhone ? `<label>電話</label><input name="phone" type="tel" required maxlength="20" value="${esc(myReg?.phone || '')}">` : ''}
        ${maxPer > 1 ? `<label>人數</label><select name="count">${Array.from({ length: Math.max(1, allowCount) }, (_, i) => `<option ${Number(myReg?.count) === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select>` : ''}
        <label>備註 <span class="opt">(選填)</span></label><input name="note" maxlength="100" value="${esc(myReg?.note || '')}">
        ${canEdit ? `<button class="btn" type="submit">${myReg ? '更新報名' : '送出報名'}</button>` : `<div class="notice" style="margin-top:12px">目前${st.text}，無法${myReg ? '修改' : '報名'}。</div>`}
        ${myReg ? '<button class="btn danger" type="button" id="cancel">取消報名</button>' : ''}
      </form>`;

    $app.innerHTML = `
      <div class="card">
        <h2>${esc(ev.title)} ${badge(ev)}</h2>
        <ul class="meta-list">
          <li><span>📅</span><span>${esc(fmtDateTime(ev))}</span></li>
          ${ev.location ? `<li><span>📍</span><span>${esc(ev.location)}</span></li>` : ''}
          <li><span>👥</span><span>已報名 ${ev.total} 人${cap ? ` / 名額 ${cap} 人（剩 ${remain}）` : ''}</span></li>
          ${ev.deadline ? `<li><span>⏰</span><span>報名截止 ${esc(fmtDate(ev.deadline))}</span></li>` : ''}
          <li><span>🙋</span><span>主辦：${esc(ev.ownerName)}</span></li>
        </ul>
        ${cap ? `<div class="progress"><div style="width:${Math.min(100, (ev.total / cap) * 100)}%"></div></div>` : ''}
        ${ev.description ? `<div class="desc">${esc(ev.description)}</div>` : ''}
        <button class="btn secondary" id="share">📤 分享給 LINE 好友</button>
      </div>
      ${isOwner ? `<div class="card"><h3>主辦人工具</h3><div class="btn-row">
        <a class="btn" href="#/e/${esc(id)}/manage">報名名單</a>
        <a class="btn secondary" href="#/e/${esc(id)}/edit">編輯活動</a></div></div>` : ''}
      ${regForm}`;

    document.getElementById('share').onclick = () => shareEvent(ev);
    const rf = document.getElementById('rf');
    rf.onsubmit = async (e) => {
      e.preventDefault();
      const reg = Object.fromEntries(new FormData(rf).entries());
      reg.count = Number(reg.count || 1);
      rf.querySelector('[type=submit]').disabled = true;
      try { await api('register', { id, reg }); toast(myReg ? '已更新報名' : '報名成功！'); router(); }
      catch (err) { toast(err.message); rf.querySelector('[type=submit]').disabled = false; }
    };
    const c = document.getElementById('cancel');
    if (c) c.onclick = async () => {
      if (!confirm('確定要取消報名嗎？')) return;
      try { await api('cancel', { id }); toast('已取消報名'); router(); } catch (err) { toast(err.message); }
    };
  }

  async function pageManage(id) {
    const { event: ev, regs, isOwner } = await api('getEvent', { id });
    if (!isOwner) throw new Error('只有主辦人可以查看名單');
    const askPhone = ev.askPhone === true || ev.askPhone === 'true' || ev.askPhone === 'TRUE';
    const closed = ev.status === 'closed';
    regs.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    $app.innerHTML = `
      <div class="card">
        <h2>${esc(ev.title)} ${badge(ev)}</h2>
        <div>共 <b>${regs.length}</b> 筆報名，合計 <b>${ev.total}</b> 人</div>
        <div class="btn-row">
          <button class="btn ${closed ? '' : 'danger'}" id="toggle">${closed ? '重新開放報名' : '關閉報名'}</button>
          <button class="btn secondary" id="copy">複製名單</button>
        </div>
      </div>
      <div class="card table-wrap">
        ${regs.length ? `<table><thead><tr><th>#</th><th>姓名</th>${askPhone ? '<th>電話</th>' : ''}<th>人數</th><th>備註</th></tr></thead><tbody>
          ${regs.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}<div class="meta" style="color:var(--muted);font-size:12px">${esc(r.displayName)}</div></td>${askPhone ? `<td>${esc(r.phone)}</td>` : ''}<td>${esc(r.count || 1)}</td><td>${esc(r.note)}</td></tr>`).join('')}
        </tbody></table>` : '<div class="empty">還沒有人報名</div>'}
      </div>
      <a class="btn secondary" href="#/e/${esc(id)}">回活動頁</a>`;

    document.getElementById('toggle').onclick = async () => {
      try { await api('updateEvent', { id, event: { status: closed ? 'open' : 'closed' } }); toast(closed ? '已重新開放' : '已關閉報名'); router(); }
      catch (err) { toast(err.message); }
    };
    document.getElementById('copy').onclick = async () => {
      const lines = [`【${ev.title}】${fmtDateTime(ev)}`, `共 ${ev.total} 人`, ...regs.map((r, i) =>
        `${i + 1}. ${r.name}${askPhone ? ' ' + (r.phone || '') : ''}${Number(r.count) > 1 ? ` ×${r.count}` : ''}${r.note ? `（${r.note}）` : ''}`)];
      try { await navigator.clipboard.writeText(lines.join('\n')); toast('已複製，可直接貼到聊天室'); }
      catch { prompt('請手動複製：', lines.join('\n')); }
    };
  }

  // ---------- 分享 ----------
  async function shareEvent(ev) {
    const url = shareUrl(ev.id);
    const flex = {
      type: 'flex',
      altText: `📋 ${ev.title} 開放報名中`,
      contents: {
        type: 'bubble',
        body: {
          type: 'box', layout: 'vertical', spacing: 'sm', contents: [
            { type: 'text', text: '活動報名', size: 'xs', color: '#06c755', weight: 'bold' },
            { type: 'text', text: ev.title, size: 'lg', weight: 'bold', wrap: true },
            { type: 'text', text: `📅 ${fmtDateTime(ev)}`, size: 'sm', color: '#555555', wrap: true },
            ...(ev.location ? [{ type: 'text', text: `📍 ${ev.location}`, size: 'sm', color: '#555555', wrap: true }] : []),
            { type: 'text', text: `🙋 主辦：${ev.ownerName}`, size: 'sm', color: '#555555' },
          ],
        },
        footer: {
          type: 'box', layout: 'vertical', contents: [
            { type: 'button', style: 'primary', color: '#06c755', action: { type: 'uri', label: '立即報名', uri: url } },
          ],
        },
      },
    };
    try {
      if (state.liffReady && liff.isApiAvailable('shareTargetPicker')) {
        const r = await liff.shareTargetPicker([flex]);
        if (r) toast('已分享！');
        return;
      }
    } catch (e) { console.warn(e); }
    try { await navigator.clipboard.writeText(`${ev.title}\n${url}`); toast('已複製報名連結'); }
    catch { prompt('報名連結：', url); }
  }

  // ---------- 啟動 ----------
  (async () => {
    if (!(await initLiff())) return;
    // 從分享連結 ?event=xxx 進入時，導到活動頁
    const ev = new URLSearchParams(location.search).get('event');
    if (ev) {
      history.replaceState(null, '', location.pathname + '#/e/' + ev);
    }
    window.addEventListener('hashchange', router);
    router();
  })();
})();
