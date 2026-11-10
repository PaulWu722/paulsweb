/**
 * 簡易活動登記 — Google Apps Script 後端
 * 資料存放在綁定的 Google 試算表（自動建立「Events」「Registrations」兩個工作表）。
 *
 * 部署方式：見 README.md
 */

// LINE Login Channel ID（LIFF ID 的「-」前面那串數字）
const CHANNEL_ID = '2012412693';

const EVENT_COLS = ['id', 'ownerId', 'ownerName', 'title', 'date', 'time', 'location', 'description',
  'capacity', 'maxPerPerson', 'deadline', 'askPhone', 'status', 'createdAt', 'updatedAt'];
const REG_COLS = ['eventId', 'userId', 'displayName', 'name', 'phone', 'count', 'note', 'status', 'createdAt', 'updatedAt'];
const EVENT_EDITABLE = ['title', 'date', 'time', 'location', 'description', 'capacity', 'maxPerPerson', 'deadline', 'askPhone', 'status'];

function doGet() {
  return json_({ ok: true, data: 'LIFF event API is running' });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const user = verifyIdToken_(body.idToken);
    const handler = ACTIONS[body.action];
    if (!handler) throw new Error('未知的動作');
    return json_({ ok: true, data: handler(body, user) });
  } catch (err) {
    return json_({ ok: false, error: err.message });
  }
}

const ACTIONS = {
  createEvent(b, user) {
    const ev = pick_(b.event, EVENT_EDITABLE);
    if (!ev.title || !ev.date) throw new Error('請填寫活動名稱與日期');
    const now = new Date().toISOString();
    Object.assign(ev, {
      id: Utilities.getUuid().replace(/-/g, '').slice(0, 10),
      ownerId: user.userId, ownerName: user.displayName,
      status: 'open', createdAt: now, updatedAt: now,
    });
    appendRow_(sheet_('Events', EVENT_COLS), EVENT_COLS, ev);
    return { id: ev.id };
  },

  updateEvent(b, user) {
    return withLock_(() => {
      const sh = sheet_('Events', EVENT_COLS);
      const rows = readAll_(sh, EVENT_COLS);
      const ev = rows.find((r) => r.id === b.id);
      if (!ev) throw new Error('找不到活動');
      if (ev.ownerId !== user.userId) throw new Error('只有主辦人可以修改');
      Object.assign(ev, pick_(b.event, EVENT_EDITABLE), { updatedAt: new Date().toISOString() });
      writeRow_(sh, EVENT_COLS, ev._row, ev);
      return {};
    });
  },

  getEvent(b, user) {
    const ev = getEvent_(b.id);
    const regs = activeRegs_(b.id);
    const isOwner = ev.ownerId === user.userId;
    const myReg = regs.find((r) => r.userId === user.userId) || null;
    return {
      event: withCount_(ev, regs),
      myReg: myReg && clean_(myReg),
      isOwner,
      regs: isOwner ? regs.map(clean_) : null,
    };
  },

  register(b, user) {
    return withLock_(() => {
      const ev = getEvent_(b.id);
      const regs = activeRegs_(b.id);
      const total = regs.reduce((n, r) => n + Number(r.count || 1), 0);
      const reg = b.reg || {};
      const maxPer = Math.max(1, Number(ev.maxPerPerson) || 1);
      const count = Math.min(maxPer, Math.max(1, Number(reg.count) || 1));
      const old = regs.find((r) => r.userId === user.userId);
      const extra = count - (old ? Number(old.count || 1) : 0);

      if (ev.status === 'closed') throw new Error('報名已截止');
      if (ev.deadline && new Date() > new Date(ev.deadline + 'T23:59:59+08:00')) throw new Error('報名已截止');
      if (Number(ev.capacity) > 0 && total + extra > Number(ev.capacity)) throw new Error('名額不足');
      if (!String(reg.name || '').trim()) throw new Error('請填寫姓名');
      if (isTrue_(ev.askPhone) && !String(reg.phone || '').trim()) throw new Error('請填寫電話');

      const sh = sheet_('Registrations', REG_COLS);
      const now = new Date().toISOString();
      const data = {
        name: String(reg.name).slice(0, 30), phone: String(reg.phone || '').slice(0, 20),
        count, note: String(reg.note || '').slice(0, 100), updatedAt: now,
      };
      if (old) {
        writeRow_(sh, REG_COLS, old._row, Object.assign(old, data));
      } else {
        appendRow_(sh, REG_COLS, Object.assign(data, {
          eventId: b.id, userId: user.userId, displayName: user.displayName, status: 'active', createdAt: now,
        }));
      }
      return {};
    });
  },

  cancel(b, user) {
    return withLock_(() => {
      const sh = sheet_('Registrations', REG_COLS);
      const r = readAll_(sh, REG_COLS).find((x) => x.eventId === b.id && x.userId === user.userId && x.status === 'active');
      if (r) writeRow_(sh, REG_COLS, r._row, Object.assign(r, { status: 'cancelled', updatedAt: new Date().toISOString() }));
      return {};
    });
  },

  myEvents(b, user) {
    const events = readAll_(sheet_('Events', EVENT_COLS), EVENT_COLS);
    const allRegs = readAll_(sheet_('Registrations', REG_COLS), REG_COLS).filter((r) => r.status === 'active');
    const regsOf = (id) => allRegs.filter((r) => r.eventId === id);
    const joinedIds = new Set(allRegs.filter((r) => r.userId === user.userId).map((r) => r.eventId));
    return {
      created: events.filter((e) => e.ownerId === user.userId).map((e) => withCount_(e, regsOf(e.id))),
      joined: events.filter((e) => joinedIds.has(e.id)).map((e) => withCount_(e, regsOf(e.id))),
    };
  },
};

// ---------- LINE 身分驗證 ----------
function verifyIdToken_(idToken) {
  if (!idToken) throw new Error('請先登入 LINE');
  const cache = CacheService.getScriptCache();
  const key = 'tok_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken)).slice(0, 40);
  const hit = cache.get(key);
  if (hit) return JSON.parse(hit);

  const res = UrlFetchApp.fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'post', payload: { id_token: idToken, client_id: CHANNEL_ID }, muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) throw new Error('登入已過期，請重新開啟頁面');
  const p = JSON.parse(res.getContentText());
  const user = { userId: p.sub, displayName: p.name || 'LINE 使用者' };
  const ttl = Math.max(1, Math.min(600, p.exp - Math.floor(Date.now() / 1000) - 30));
  cache.put(key, JSON.stringify(user), ttl);
  return user;
}

// ---------- 試算表工具 ----------
function sheet_(name, cols) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:Z').setNumberFormat('@'); // 全部以文字儲存，避免日期/電話被自動轉格式
  }
  return sh;
}

function readAll_(sh, cols) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, cols.length).getValues().map((row, i) => {
    const o = { _row: i + 2 };
    cols.forEach((c, j) => { o[c] = row[j] instanceof Date ? row[j].toISOString() : String(row[j]); });
    return o;
  });
}

function appendRow_(sh, cols, obj) {
  sh.appendRow(cols.map((c) => (obj[c] === undefined ? '' : String(obj[c]))));
}

function writeRow_(sh, cols, row, obj) {
  sh.getRange(row, 1, 1, cols.length).setValues([cols.map((c) => (obj[c] === undefined ? '' : String(obj[c])))]);
}

function getEvent_(id) {
  const ev = readAll_(sheet_('Events', EVENT_COLS), EVENT_COLS).find((e) => e.id === id);
  if (!ev) throw new Error('找不到活動');
  return ev;
}

function activeRegs_(eventId) {
  return readAll_(sheet_('Registrations', REG_COLS), REG_COLS)
    .filter((r) => r.eventId === eventId && r.status === 'active');
}

function withCount_(ev, regs) {
  const e = clean_(ev);
  e.total = regs.reduce((n, r) => n + Number(r.count || 1), 0);
  e.regCount = regs.length;
  e.askPhone = isTrue_(ev.askPhone);
  return e;
}

function clean_(o) { const c = Object.assign({}, o); delete c._row; return c; }
function pick_(src, keys) { const o = {}; keys.forEach((k) => { if (src && src[k] !== undefined) o[k] = src[k]; }); return o; }
function isTrue_(v) { return v === true || String(v).toLowerCase() === 'true'; }

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
