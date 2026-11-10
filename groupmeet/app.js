// 首頁：本次聚會（信息 PDF／聖經進度 兩個分頁）＋ 往期信息
(() => {
  'use strict';
  const { $, $$, esc, fmtDate, today, bibleText, toast } = window.GM;
  const API = window.GM_API;
  const B = window.GM_BIBLE;
  const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38';

  let items = [];
  let current = null;
  let tab = 'pdf';

  // ---------- 選出「本次聚會」：今天以後最近的一次；都過了就取最新的一次 ----------
  function pickDefault(list) {
    const t = today();
    const upcoming = list.filter((x) => x.meet_date >= t);
    return upcoming.length ? upcoming[upcoming.length - 1] : list[0];
  }

  async function load() {
    try {
      items = await API.list();
    } catch (e) {
      $('#loading').textContent = e.message;
      return;
    }
    $('#loading').hidden = true;
    if (!items.length) { $('#empty').hidden = false; return; }
    const fromHash = items.find((x) => x.id === decodeURIComponent(location.hash.slice(1)));
    select(fromHash || pickDefault(items), false);
  }

  function select(item, scroll = true) {
    current = item;
    const isDefault = item === pickDefault(items);
    if (isDefault) history.replaceState(null, '', location.pathname + location.search);
    else history.replaceState(null, '', '#' + encodeURIComponent(item.id));

    $('#current').hidden = false;
    const upcoming = item.meet_date >= today();
    $('#cur-badge').textContent = isDefault ? (upcoming ? '本次聚會' : '最近一次聚會') : '往期信息';
    $('#cur-badge').className = 'badge' + (isDefault ? '' : ' past');
    $('#cur-date').textContent = fmtDate(item.meet_date);
    $('#cur-title').textContent = item.title;
    $('#cur-note').textContent = item.note || '';
    $('#cur-note').hidden = !item.note;
    $('#back-current').hidden = isDefault;

    const hasPdf = !!item.file_path;
    const hasBible = Array.isArray(item.bible) && item.bible.length > 0;
    $('#tab-btn-bible').querySelector('small').textContent = hasBible ? bibleText(item.bible) : '';
    setTab(!hasPdf && hasBible ? 'bible' : tab === 'bible' && hasBible ? 'bible' : 'pdf');

    renderBible();
    openPdf(item);
    renderArchive();
    if (scroll) $('#current').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function setTab(t) {
    tab = t;
    $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === t));
    $$('.tab').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === t));
    $('#tab-pdf').hidden = t !== 'pdf';
    $('#tab-bible').hidden = t !== 'bible';
    if (t === 'pdf') relayout();
  }

  // ---------- 聖經進度 ----------
  const READ_KEY = 'groupmeet-read-v1';
  const readSet = () => { try { return new Set(JSON.parse(localStorage.getItem(READ_KEY)) || []); } catch { return new Set(); } };
  const saveRead = (s) => localStorage.setItem(READ_KEY, JSON.stringify([...s].slice(-3000)));
  const readKey = (b, c) => `${current.id}:${b}:${c}`;

  function renderBible() {
    const box = $('#bible-body');
    const segs = (current.bible || []).map(B.normalize).filter(Boolean);
    if (!segs.length) {
      box.innerHTML = '<p class="empty-note">這次聚會沒有設定讀經進度。</p>';
      return;
    }
    const read = readSet();
    let total = 0, done = 0;
    const html = segs.map((s) => {
      const unit = s.book.no === 19 ? '篇' : '章';
      const chips = [];
      for (let c = s.c1; c <= s.c2; c++) {
        total++;
        const on = read.has(readKey(s.b, c));
        if (on) done++;
        chips.push(`<a class="chap${on ? ' read' : ''}" href="${B.chapterUrl(s.b, c)}" target="_blank" rel="noopener"
          data-b="${s.b}" data-c="${c}" title="在恢復本網站閱讀 ${esc(s.book.name)} 第 ${c} ${unit}">
          <span class="chap-no">${c}</span><span class="chap-unit">${unit}</span></a>`);
      }
      return `<div class="seg">
        <div class="seg-head"><span class="testament">${s.book.testament}</span><h3>${esc(B.label(s))}</h3></div>
        <div class="chaps">${chips.join('')}</div>
      </div>`;
    }).join('');
    const pct = total ? Math.round((done / total) * 100) : 0;
    box.innerHTML = `
      <div class="progress-row">
        <div class="progress"><div class="progress-bar" style="width:${pct}%"></div></div>
        <span class="progress-text">已讀 ${done} / ${total} ${segs.length === 1 && segs[0].book.no === 19 ? '篇' : '章'}</span>
      </div>
      ${html}
      <p class="muted bible-hint">點章數會在新分頁開啟<a href="https://www.recoveryversion.com.tw/" target="_blank" rel="noopener">聖經恢復本</a>（含註解）並標記為已讀。
        ${done ? '<button type="button" class="link-btn" id="reset-read">清除已讀記號</button>' : ''}</p>`;
  }

  $('#bible-body').addEventListener('click', (e) => {
    const a = e.target.closest('.chap');
    if (a) {
      const s = readSet();
      s.add(readKey(a.dataset.b, a.dataset.c));
      saveRead(s);
      setTimeout(renderBible, 50);
      return;
    }
    if (e.target.id === 'reset-read') {
      const s = readSet();
      [...s].filter((k) => k.startsWith(current.id + ':')).forEach((k) => s.delete(k));
      saveRead(s);
      renderBible();
    }
  });

  // ---------- PDF 閱讀器（pdf.js，手機也能直接看） ----------
  let pdfjsP = null;
  const loadPdfjs = () => (pdfjsP ||= import(`${PDFJS}/build/pdf.min.mjs`).then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = `${PDFJS}/build/pdf.worker.min.mjs`;
    return lib;
  }));

  let doc = null, zoom = 1, token = 0, observer = null, lastWidth = 0, firstRatio = 1.414;

  async function openPdf(item) {
    const my = ++token;
    const pages = $('#pages');
    doc && doc.destroy && doc.destroy();
    doc = null;
    observer && observer.disconnect();
    zoom = 1;
    $('#zoom-label').textContent = '100%';
    $('#page-count').textContent = '';
    $('#pdf-tools').hidden = !item.file_path;
    if (!item.file_path) {
      pages.innerHTML = '<p class="empty-note">這次聚會沒有上傳信息 PDF。</p>';
      return;
    }
    pages.innerHTML = '<p class="empty-note">PDF 載入中…</p>';
    const url = await API.fileUrl(item);
    if (my !== token) return;
    if (!url) { pages.innerHTML = '<p class="empty-note">找不到 PDF 檔案。</p>'; return; }
    $('#pdf-open').href = url;
    $('#pdf-download').href = url;
    $('#pdf-download').download = item.file_name || `${item.title}.pdf`;
    try {
      const lib = await loadPdfjs();
      const d = await lib.getDocument({
        url, cMapUrl: `${PDFJS}/cmaps/`, cMapPacked: true, standardFontDataUrl: `${PDFJS}/standard_fonts/`,
      }).promise;
      if (my !== token) { d.destroy(); return; }
      doc = d;
      const p1 = await doc.getPage(1);
      const vp = p1.getViewport({ scale: 1 });
      firstRatio = vp.height / vp.width;
      $('#page-count').textContent = `共 ${doc.numPages} 頁`;
      layout();
    } catch (e) {
      console.error(e);
      if (my !== token) return;
      pages.innerHTML = `<p class="empty-note">這台裝置無法直接顯示 PDF，請按上方「開新視窗」或「下載」。</p>
        <iframe class="pdf-frame" src="${esc(url)}" title="PDF"></iframe>`;
    }
  }

  function layout() {
    if (!doc) return;
    const pages = $('#pages');
    observer && observer.disconnect();
    lastWidth = pages.clientWidth;
    const w = Math.floor((lastWidth - 2) * zoom);
    pages.innerHTML = '';
    const my = token;
    observer = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        observer.unobserve(en.target);
        renderPage(en.target, w, my);
      });
    }, { root: null, rootMargin: '800px 0px' });
    for (let n = 1; n <= doc.numPages; n++) {
      const div = document.createElement('div');
      div.className = 'page';
      div.dataset.n = n;
      div.style.width = w + 'px';
      div.style.height = Math.round(w * firstRatio) + 'px';
      pages.appendChild(div);
      observer.observe(div);
    }
  }

  async function renderPage(div, w, my) {
    try {
      const page = await doc.getPage(Number(div.dataset.n));
      if (my !== token) return;
      const base = page.getViewport({ scale: 1 });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const vp = page.getViewport({ scale: (w / base.width) * dpr });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      canvas.style.width = w + 'px';
      canvas.style.height = Math.round(w * (base.height / base.width)) + 'px';
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      if (my !== token || !div.isConnected) return;
      div.style.height = '';
      div.replaceChildren(canvas);
    } catch (e) {
      if (my === token) console.warn('render page failed', e);
    }
  }

  function relayout() {
    const pages = $('#pages');
    if (doc && pages.clientWidth && Math.abs(pages.clientWidth - lastWidth) > 8) layout();
  }
  let rT = null;
  window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(relayout, 250); });

  function setZoom(z) {
    zoom = Math.min(3, Math.max(0.5, Math.round(z * 100) / 100));
    $('#zoom-label').textContent = Math.round(zoom * 100) + '%';
    layout();
  }
  $('#zoom-in').addEventListener('click', () => setZoom(zoom + 0.25));
  $('#zoom-out').addEventListener('click', () => setZoom(zoom - 0.25));
  $('#zoom-label').addEventListener('click', () => setZoom(1));

  // ---------- 往期 ----------
  function renderArchive() {
    const list = $('#archive-list');
    const q = $('#archive-search').value.trim().toLowerCase();
    let lastYear = '';
    const rows = items.filter((x) => !q || `${x.title} ${x.note} ${bibleText(x.bible)} ${x.meet_date}`.toLowerCase().includes(q));
    $('#archive').hidden = items.length < 2 && !q;
    list.innerHTML = rows.map((x) => {
      const y = x.meet_date.slice(0, 4);
      const head = y !== lastYear ? `<li class="year">${y} 年</li>` : '';
      lastYear = y;
      const bt = bibleText(x.bible);
      return `${head}<li><button type="button" class="arch-row${current && x.id === current.id ? ' active' : ''}" data-id="${esc(x.id)}">
        <span class="arch-date">${esc(fmtDate(x.meet_date, false))}</span>
        <span class="arch-main"><span class="arch-title">${esc(x.title)}</span>
          ${bt ? `<span class="arch-bible">📖 ${esc(bt)}</span>` : ''}</span>
        <span class="arch-icons">${x.file_path ? '📄' : ''}</span>
      </button></li>`;
    }).join('') || '<li class="empty-note">找不到符合的信息</li>';
  }
  $('#archive-list').addEventListener('click', (e) => {
    const row = e.target.closest('.arch-row');
    if (!row) return;
    const it = items.find((x) => x.id === row.dataset.id);
    if (it) select(it);
  });
  $('#archive-search').addEventListener('input', renderArchive);
  $('#back-current').addEventListener('click', () => select(pickDefault(items)));
  $$('.tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

  $('#share-btn').addEventListener('click', async () => {
    const url = location.href;
    const text = current ? `${fmtDate(current.meet_date)} ${current.title}` : document.title;
    try {
      if (navigator.share) await navigator.share({ title: text, url });
      else { await navigator.clipboard.writeText(url); toast('已複製連結'); }
    } catch { /* 使用者取消 */ }
  });

  document.title = `${window.GM_CONFIG.SITE_NAME || 'Group Meet'}｜${window.GM_CONFIG.SUBTITLE || ''}`;
  window.GM.demoBanner();
  load();
})();
