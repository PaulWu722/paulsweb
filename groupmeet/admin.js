// 管理頁：登入、上傳／修改／刪除每週信息
(() => {
  'use strict';
  const { $, esc, fmtDate, fmtSize, bibleText, toast, parseDate, ymd, today } = window.GM;
  const API = window.GM_API;
  const B = window.GM_BIBLE;
  const PASS_KEY = 'groupmeet-admin-pass';

  let pass = sessionStorage.getItem(PASS_KEY) || '';
  let items = [];
  let editing = null; // 正在編輯的那一筆
  let busy = false;

  const showError = (el, msg) => { el.textContent = msg || ''; el.hidden = !msg; };

  // ---------- 登入 ----------
  async function tryLogin(p, silent) {
    try {
      await API.login(p);
      pass = p;
      sessionStorage.setItem(PASS_KEY, p);
      $('#login').hidden = true;
      $('#editor').hidden = false;
      $('#list-card').hidden = false;
      $('#logout').hidden = false;
      await refresh();
      resetForm();
    } catch (e) {
      sessionStorage.removeItem(PASS_KEY);
      if (!silent) showError($('#login-error'), e.message);
    }
  }
  $('#login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    showError($('#login-error'), '');
    tryLogin($('#pass').value, false);
  });
  $('#logout').addEventListener('click', () => { sessionStorage.removeItem(PASS_KEY); location.reload(); });

  async function refresh() {
    items = await API.list();
    renderList();
  }

  // ---------- 讀經段落 ----------
  const bookOptions = (sel) => {
    const group = (from, to, name) => `<optgroup label="${name}">${B.BOOKS.slice(from, to).map((b, i) =>
      `<option value="${from + i + 1}"${from + i + 1 === sel ? ' selected' : ''}>${b[0]}</option>`).join('')}</optgroup>`;
    return group(0, 39, '舊約') + group(39, 66, '新約');
  };
  const chapterOptions = (bookNo, sel) => {
    const n = B.book(bookNo).chapters;
    let h = '';
    for (let c = 1; c <= n; c++) h += `<option value="${c}"${c === sel ? ' selected' : ''}>${c}</option>`;
    return h;
  };

  function addSeg(seg) {
    const s = B.normalize(seg || { b: 43, c1: 1, c2: 1 });
    const row = document.createElement('div');
    row.className = 'seg-row';
    row.innerHTML = `
      <select class="s-book" aria-label="書卷">${bookOptions(s.b)}</select>
      <div class="s-range">
        <select class="s-c1" aria-label="從第幾章">${chapterOptions(s.b, s.c1)}</select>
        <span>～</span>
        <select class="s-c2" aria-label="到第幾章">${chapterOptions(s.b, s.c2)}</select>
        <span class="s-unit">${s.b === 19 ? '篇' : '章'}</span>
      </div>
      <button type="button" class="icon-x" aria-label="移除這段">×</button>`;
    $('#segs').appendChild(row);
    updateSegHint();
  }

  $('#segs').addEventListener('change', (e) => {
    const row = e.target.closest('.seg-row');
    if (!row) return;
    const bSel = row.querySelector('.s-book'), c1 = row.querySelector('.s-c1'), c2 = row.querySelector('.s-c2');
    if (e.target === bSel) {
      const b = Number(bSel.value);
      c1.innerHTML = chapterOptions(b, 1);
      c2.innerHTML = chapterOptions(b, 1);
      row.querySelector('.s-unit').textContent = b === 19 ? '篇' : '章';
    } else if (e.target === c1 && Number(c2.value) < Number(c1.value)) {
      c2.value = c1.value;
    } else if (e.target === c2 && Number(c2.value) < Number(c1.value)) {
      c1.value = c2.value;
    }
  });
  $('#segs').addEventListener('click', (e) => {
    if (e.target.closest('.icon-x')) { e.target.closest('.seg-row').remove(); updateSegHint(); }
  });
  $('#add-seg').addEventListener('click', () => {
    const rows = readSegs();
    addSeg(rows.length ? nextAfter(rows[rows.length - 1], 1) : guessNext()[0] || { b: 43, c1: 1, c2: 1 });
  });
  function updateSegHint() {
    $('#add-seg').textContent = $('#segs').children.length ? '＋ 再加一段經文' : '＋ 新增讀經進度';
  }
  const readSegs = () => [...$('#segs').children].map((row) => ({
    b: Number(row.querySelector('.s-book').value),
    c1: Number(row.querySelector('.s-c1').value),
    c2: Number(row.querySelector('.s-c2').value),
  }));

  // 依上一段的長度，接著往下讀（讀完一卷就接下一卷）
  function nextAfter(seg, len) {
    const s = B.normalize(seg);
    let b = s.b, c1 = s.c2 + 1;
    if (c1 > s.book.chapters) { b = s.b === 66 ? 1 : s.b + 1; c1 = 1; }
    const max = B.book(b).chapters;
    return { b, c1, c2: Math.min(max, c1 + (len || s.c2 - s.c1 + 1) - 1) };
  }
  // 新增時，預設接續最近一週的進度
  function guessNext() {
    const last = items.find((x) => Array.isArray(x.bible) && x.bible.length);
    if (!last) return [];
    return last.bible.map(B.normalize).filter(Boolean).map((s) => nextAfter(s, s.c2 - s.c1 + 1));
  }

  // ---------- 檔案 ----------
  let file = null;
  function setFile(f) {
    file = f || null;
    $('#clear-file').hidden = !file;
    $('#drop').classList.toggle('has-file', !!file);
    if (file) {
      $('#drop-text').textContent = file.name;
      $('#drop-sub').textContent = fmtSize(file.size) + (editing && editing.file_path ? '（會取代原本的 PDF）' : '');
      if (!$('#f-title').value.trim()) $('#f-title').value = file.name.replace(/\.pdf$/i, '').trim();
    } else {
      $('#f-file').value = '';
      $('#drop-text').textContent = editing && editing.file_path
        ? `目前：${editing.file_name || 'PDF'}（要換檔才需要重新選）` : '點這裡選擇 PDF，或把檔案拖進來';
      $('#drop-sub').textContent = editing && editing.file_path ? fmtSize(editing.file_size || 0) : '上限 50MB';
    }
  }
  $('#f-file').addEventListener('change', (e) => setFile(e.target.files[0]));
  $('#clear-file').addEventListener('click', () => setFile(null));
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = [...e.dataTransfer.files].find((x) => x.type === 'application/pdf' || /\.pdf$/i.test(x.name));
    if (f) setFile(f); else toast('只能上傳 PDF 檔', 'error');
  });

  // ---------- 表單 ----------
  function defaultDate() {
    const latest = items[0];
    if (latest) {
      const d = parseDate(latest.meet_date);
      d.setDate(d.getDate() + 7);
      const next = ymd(d);
      if (next >= today()) return next;
    }
    return today();
  }

  function resetForm() {
    editing = null;
    $('#editor-title').textContent = '新增一週';
    $('#submit-btn').textContent = '發布';
    $('#cancel-edit').hidden = true;
    $('#f-date').value = defaultDate();
    $('#f-title').value = '';
    $('#f-note').value = '';
    $('#segs').innerHTML = '';
    guessNext().forEach(addSeg);
    updateSegHint();
    setFile(null);
    showError($('#form-error'), '');
  }

  function startEdit(it) {
    editing = it;
    $('#editor-title').textContent = `修改：${fmtDate(it.meet_date)}`;
    $('#submit-btn').textContent = '儲存修改';
    $('#cancel-edit').hidden = false;
    $('#f-date').value = it.meet_date;
    $('#f-title').value = it.title;
    $('#f-note').value = it.note || '';
    $('#segs').innerHTML = '';
    (it.bible || []).forEach(addSeg);
    updateSegHint();
    setFile(null);
    showError($('#form-error'), '');
    $('#editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('#cancel-edit').addEventListener('click', resetForm);

  $('#item-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    showError($('#form-error'), '');
    const data = {
      id: editing && editing.id,
      date: $('#f-date').value,
      title: $('#f-title').value.trim(),
      note: $('#f-note').value.trim(),
      bible: readSegs(),
      file,
    };
    if (!editing && !file && !data.bible.length) {
      showError($('#form-error'), '請至少上傳 PDF 或設定讀經進度');
      return;
    }
    busy = true;
    const btn = $('#submit-btn');
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = file ? '上傳中…' : '儲存中…';
    try {
      items = editing ? await API.update(pass, data) : await API.add(pass, data);
      toast(editing ? '已儲存修改' : '已發布 ✓', 'ok');
      renderList();
      resetForm();
    } catch (err) {
      showError($('#form-error'), err.message);
      if (/密碼錯誤/.test(err.message)) setTimeout(() => location.reload(), 1500);
    } finally {
      busy = false;
      btn.disabled = false;
      if (btn.textContent.endsWith('…')) btn.textContent = label;
    }
  });

  // ---------- 列表 ----------
  function renderList() {
    $('#list-count').textContent = items.length ? `共 ${items.length} 週` : '';
    $('#admin-list').innerHTML = items.map((x) => {
      const bt = bibleText(x.bible);
      return `<li class="admin-item" data-id="${esc(x.id)}">
        <div class="ai-main">
          <div class="ai-date">${esc(fmtDate(x.meet_date))}</div>
          <div class="ai-title">${esc(x.title)}</div>
          <div class="ai-sub muted">
            ${bt ? `<span>📖 ${esc(bt)}</span>` : '<span>📖 未設定進度</span>'}
            ${x.file_path ? `<span>📄 ${esc(x.file_name || 'PDF')}${x.file_size ? '・' + fmtSize(x.file_size) : ''}</span>` : '<span>📄 沒有 PDF</span>'}
          </div>
        </div>
        <div class="ai-actions">
          <a class="btn ghost small" href="./#${encodeURIComponent(x.id)}" target="_blank" rel="noopener">查看</a>
          <button type="button" class="btn ghost small" data-act="edit">修改</button>
          <button type="button" class="btn danger small" data-act="del">刪除</button>
        </div>
      </li>`;
    }).join('') || '<li class="empty-note">還沒有發布任何信息</li>';
  }

  $('#admin-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const it = items.find((x) => x.id === btn.closest('.admin-item').dataset.id);
    if (!it) return;
    if (btn.dataset.act === 'edit') { startEdit(it); return; }
    if (!confirm(`確定要刪除「${fmtDate(it.meet_date)} ${it.title}」？\nPDF 也會一併刪除，無法復原。`)) return;
    btn.disabled = true;
    try {
      items = await API.remove(pass, it.id);
      if (editing && editing.id === it.id) resetForm();
      renderList();
      toast('已刪除');
    } catch (err) {
      btn.disabled = false;
      toast(err.message, 'error');
    }
  });

  window.GM.demoBanner();
  if (pass) tryLogin(pass, true);
})();
