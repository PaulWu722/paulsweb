/**
 * 年終愛筵報名 — Google Apps Script 後端
 * 資料存放在 Google 試算表「17會所事務」的「年終愛筵桌次表與報名」工作表：
 *   A–J 欄：報名名單（編號、報名時間、姓名、性別、身分、小區、備註、桌號、修改碼、家庭編號）
 *   L–M 欄：桌號與桌長姓名（直接在試算表修改即可，網站會自動更新）
 *
 * 同一個家庭（一次報名的多位）共用「家庭編號」與「修改碼」，選桌時一起入座。
 * 每桌人數上限 CAPACITY 包含桌長。
 */

const SPREADSHEET_ID = '19cI8tOZLBeKKlzyn8H08o2yvSbS8IuQntcP-nxjiBVI';
const SHEET_NAME = '年終愛筵桌次表與報名';
const CAPACITY = 10;        // 每桌人數上限（含桌長）
const TABLE_COUNT = 20;     // 第一次建立桌長欄位時的桌數
const MAX_FAMILY = 10;      // 一次最多報名人數
const HEADERS = ['編號', '報名時間', '姓名', '性別', '身分', '小區', '備註', '桌號', '修改碼', '家庭編號'];
const REG_COLS = HEADERS.length; // A–J
const TABLE_COL = 12;            // L 欄

const GENDERS = ['男', '女'];
const ROLES = ['聖徒', '福音朋友'];
const AREAS = ['霧峰', '朝陽', '其他'];

/** 第一次使用時手動執行一次，確認權限並建立表頭 */
function setup() {
  sheet_();
}

function doGet() {
  return json_({ ok: true, ...state_() });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const req = JSON.parse(e.postData.contents);
    let res;
    switch (req.action) {
      case 'state': res = state_(); break;
      case 'register': res = register_(req.data); break;
      case 'login': res = login_(req.name, req.code); break;
      case 'me': res = { me: party_(req.id, req.code) }; break;
      case 'seat': res = seat_(req.id, req.code, req.table); break;
      default: throw new Error('未知的操作');
    }
    return json_({ ok: true, ...res });
  } catch (err) {
    return json_({ ok: false, error: err.message });
  } finally {
    lock.releaseLock();
  }
}

// ---------- 工作表 ----------
let sheetCache_ = null;
function sheet_() {
  if (sheetCache_) return sheetCache_;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (!sh.getRange(1, 1).getValue()) {
    sh.getRange(1, 1, 1, REG_COLS).setValues([HEADERS]);
  }
  if (!sh.getRange(1, TABLE_COL).getValue()) {
    const rows = [['桌號', '桌長']];
    for (let i = 1; i <= TABLE_COUNT; i++) rows.push([i, '桌長' + i]);
    sh.getRange(1, TABLE_COL, rows.length, 2).setValues(rows);
  }
  sheetCache_ = sh;
  return sh;
}

function dataRows_(col, width) {
  const sh = sheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, col, last - 1, width).getValues();
}

function readTables_() {
  return dataRows_(TABLE_COL, 2)
    .filter((r) => r[0] !== '')
    .map((r) => ({ no: Number(r[0]), captain: String(r[1] || '').trim() }));
}

function readPeople_() {
  return dataRows_(1, REG_COLS)
    .map((r, i) => ({
      row: i + 2,
      id: String(r[0]),
      name: String(r[2]),
      gender: String(r[3]),
      role: String(r[4]),
      area: String(r[5]),
      note: String(r[6]),
      table: Number(r[7]) || 0,
      code: String(r[8]),
      group: String(r[9] || r[0]),
    }))
    .filter((p) => p.id !== '');
}

// 一桌已坐人數：桌長算一位；若桌長本人也報名坐在自己這桌，不重複計算
function occupied_(table, people) {
  const others = people.filter((p) => p.name !== table.captain).length;
  return others + (table.captain ? 1 : 0);
}

// ---------- 動作 ----------
function state_() {
  const people = readPeople_();
  return {
    capacity: CAPACITY,
    tables: readTables_().map((t) => {
      const at = people.filter((p) => p.table === t.no);
      return {
        no: t.no,
        captain: t.captain,
        count: occupied_(t, at),
        members: at.map((p) => ({ name: p.name, area: p.area, role: p.role })),
      };
    }),
  };
}

function register_(d) {
  d = d || {};
  const list = Array.isArray(d.members) ? d.members : [];
  if (!list.length) throw new Error('請至少填寫一位報名者');
  if (list.length > MAX_FAMILY) throw new Error('一次最多報名 ' + MAX_FAMILY + ' 位');
  const members = list.map((m, i) => {
    const name = String((m && m.name) || '').trim().slice(0, 30);
    const who = list.length > 1 ? '第 ' + (i + 1) + ' 位' : '';
    if (!name) throw new Error('請填寫' + who + '姓名');
    if (GENDERS.indexOf(m.gender) < 0) throw new Error('請選擇' + (who || name) + '的性別');
    if (ROLES.indexOf(m.role) < 0) throw new Error('請選擇' + (who || name) + '的身分');
    return { name, gender: m.gender, role: m.role };
  });
  if (AREAS.indexOf(d.area) < 0) throw new Error('請選擇小區');
  const other = String(d.areaOther || '').trim().slice(0, 20);
  const area = d.area === '其他' && other ? '其他（' + other + '）' : d.area;
  const note = String(d.note || '').trim().slice(0, 200);

  const group = newId_();
  const code = String(1000 + Math.floor(Math.random() * 9000));
  const now = new Date();
  const rows = members.map((m, i) => [
    i === 0 ? group : newId_(), now, safe_(m.name), m.gender, m.role, safe_(area), i === 0 ? safe_(note) : '', '', code, group,
  ]);

  const people = readPeople_();
  const start = people.length ? Math.max.apply(null, people.map((p) => p.row)) + 1 : 2;
  const range = sheet_().getRange(start, 1, rows.length, REG_COLS);
  range.setNumberFormats(rows.map(() => ['@', 'yyyy/mm/dd hh:mm', '@', '@', '@', '@', '@', '0', '@', '@']));
  range.setValues(rows);
  return { me: party_(group, code) };
}

function login_(name, code) {
  name = String(name || '').trim();
  code = String(code || '').trim();
  const p = readPeople_().find((x) => x.name === name && x.code === code);
  if (!p) throw new Error('姓名或修改碼不正確');
  return { me: party_(p.group, code) };
}

function party_(group, code, people) {
  people = people || readPeople_();
  const members = people.filter((x) => x.group === String(group) && x.code === String(code));
  if (!members.length) throw new Error('找不到報名資料，請重新登入');
  return {
    id: String(group),
    code: String(code),
    table: members[0].table,
    members: members.map((m) => ({ name: m.name, gender: m.gender, role: m.role, area: m.area })),
  };
}

function seat_(group, code, table) {
  const people = readPeople_();
  const mine = people.filter((x) => x.group === String(group) && x.code === String(code));
  if (!mine.length) throw new Error('找不到報名資料，請重新登入');
  table = Number(table) || 0;
  if (table !== 0) {
    const t = readTables_().find((x) => x.no === table);
    if (!t) throw new Error('桌號不正確');
    const others = people.filter((x) => x.table === table && x.group !== String(group));
    const after = occupied_(t, others.concat(mine));
    if (after > CAPACITY) {
      const left = Math.max(0, CAPACITY - occupied_(t, others));
      throw new Error(left ? '這桌只剩 ' + left + ' 個位子，不夠 ' + mine.length + ' 位入座' : '這桌已經滿了，請選擇其他桌');
    }
  }
  const sh = sheet_();
  mine.forEach((m) => { sh.getRange(m.row, 8).setValue(table || ''); m.table = table; });
  return { me: party_(group, code, people), ...state_() };
}

// ---------- 工具 ----------
function newId_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 10);
}

// 避免使用者輸入被試算表當成公式
function safe_(s) {
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
