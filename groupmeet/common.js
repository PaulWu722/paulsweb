// 共用小工具
(() => {
  'use strict';
  const WD = ['日', '一', '二', '三', '四', '五', '六'];
  const pad = (n) => String(n).padStart(2, '0');
  const parseDate = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  window.GM = {
    $: (s, el = document) => el.querySelector(s),
    $$: (s, el = document) => [...el.querySelectorAll(s)],
    esc: (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    today: () => ymd(new Date()),
    ymd, parseDate,
    fmtDate(s, withYear = true) {
      const d = parseDate(s);
      return `${withYear ? d.getFullYear() + '/' : ''}${d.getMonth() + 1}/${d.getDate()}（${WD[d.getDay()]}）`;
    },
    fmtSize: (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'),
    bibleText: (bible) => (Array.isArray(bible) ? bible.map(window.GM_BIBLE.label).filter(Boolean).join('、') : ''),
    toast(msg, type = '') {
      let el = document.getElementById('toast');
      if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
      el.textContent = msg;
      el.className = 'toast show ' + type;
      clearTimeout(el._t);
      el._t = setTimeout(() => { el.className = 'toast ' + type; }, 2600);
    },
    demoBanner() {
      if (!window.GM_API.live) {
        const b = document.getElementById('demo-banner');
        if (b) b.hidden = false;
      }
    },
  };
})();
