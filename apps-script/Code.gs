/**
 * 年終愛筵報名 — Google Apps Script 後端
 * 資料存放在 Google 試算表「17會所事務」的「年終愛筵桌次表與報名」工作表：
 *   A–I 欄：報名名單（編號、報名時間、姓名、性別、身分、小區、備註、桌號、修改碼）
 *   K–L 欄：桌號與桌長姓名（直接在試算表修改即可，網站會自動更新）
 */

const SPREADSHEET_ID = '19cI8tOZLBeKKlzyn8H08o2yvSbS8IuQntcP-nxjiBVI';
const SHEET_NAME = '年終愛筵桌次表與報名';
const CAPACITY = 10;        // 每桌人數上限
const TABLE_COUNT = 20;     // 第一次建立桌長欄位時的桌數
const HEADERS = ['編號', '報名時間', '姓名', '性別', '身分', '小區', '備註', '桌號', '修改碼'];
const REG_COLS = HEADERS.length; // A–I
const TABLE_COL = 11;            // K 欄

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
      case 'me': res = { me: find_(req.id, req.code) }; break;
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
  let sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (!sh.getRange('A1').getValue()) {
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
    .map((r) => ({ no: Number(r[0]), captain: String(r[1] || '') }));
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
    }))
    .filter((p) => p.id !== '');
}

// ---------- 動作 ----------
function state_() {
  const people = readPeople_();
  return {
    capacity: CAPACITY,
    tables: readTables_().map((t) => ({
      no: t.no,
      captain: t.captain,
      members: people
        .filter((p) => p.table === t.no)
        .map((p) => ({ name: p.name, area: p.area, role: p.role })),
    })),
  };
}

function register_(d) {
  d = d || {};
  const name = String(d.name || '').trim().slice(0, 30);
  if (!name) throw new Error('請填寫姓名');
  if (GENDERS.indexOf(d.gender) < 0) throw new Error('請選擇性別');
  if (ROLES.indexOf(d.role) < 0) throw new Error('請選擇身分');
  if (AREAS.indexOf(d.area) < 0) throw new Error('請選擇小區');
  const other = String(d.areaOther || '').trim().slice(0, 20);
  const area = d.area === '其他' && other ? '其他（' + other + '）' : d.area;
  const note = String(d.note || '').trim().slice(0, 200);

  const id = Utilities.getUuid().replace(/-/g, '').slice(0, 10);
  const code = String(1000 + Math.floor(Math.random() * 9000));
  const people = readPeople_();
  const row = people.length ? Math.max.apply(null, people.map((p) => p.row)) + 1 : 2;
  const range = sheet_().getRange(row, 1, 1, REG_COLS);
  range.setNumberFormats([['@', 'yyyy/mm/dd hh:mm', '@', '@', '@', '@', '@', '0', '@']]);
  range.setValues([[id, new Date(), safe_(name), d.gender, d.role, safe_(area), safe_(note), '', code]]);
  return { me: { id, code, name, gender: d.gender, role: d.role, area, note, table: 0 } };
}

function login_(name, code) {
  name = String(name || '').trim();
  code = String(code || '').trim();
  const p = readPeople_().find((x) => clean_(x.name) === name && x.code === code);
  if (!p) throw new Error('姓名或修改碼不正確');
  return { me: public_(p) };
}

function find_(id, code) {
  const p = readPeople_().find((x) => x.id === String(id) && x.code === String(code));
  if (!p) throw new Error('找不到報名資料，請重新登入');
  return public_(p);
}

function seat_(id, code, table) {
  const people = readPeople_();
  const me = people.find((x) => x.id === String(id) && x.code === String(code));
  if (!me) throw new Error('找不到報名資料，請重新登入');
  table = Number(table) || 0;
  if (table !== 0) {
    if (!readTables_().some((t) => t.no === table)) throw new Error('桌號不正確');
    const count = people.filter((x) => x.table === table && x.id !== me.id).length;
    if (count >= CAPACITY) throw new Error('這桌已經滿了，請選擇其他桌');
  }
  sheet_().getRange(me.row, 8).setValue(table || '');
  me.table = table;
  return { me: public_(me), ...state_() };
}

// ---------- 工具 ----------
function public_(p) {
  return { id: p.id, code: p.code, name: clean_(p.name), gender: p.gender, role: p.role, area: clean_(p.area), note: clean_(p.note), table: p.table };
}

// 避免使用者輸入被試算表當成公式
function safe_(s) {
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function clean_(s) {
  return String(s).replace(/^'/, '');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
