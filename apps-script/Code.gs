/**
 * 年終愛筵報名 — Google Apps Script 後端
 * 資料存放在綁定的 Google 試算表：
 *   「報名名單」工作表：所有報名資料與桌號
 *   「桌長」工作表：桌號與桌長姓名（直接在試算表修改即可）
 */

const CAPACITY = 10;        // 每桌人數上限
const TABLE_COUNT = 20;     // 第一次建立「桌長」工作表時的桌數
const SHEET_REG = '報名名單';
const SHEET_TABLES = '桌長';
const HEADERS = ['編號', '報名時間', '姓名', '性別', '身分', '小區', '備註', '桌號', '修改碼'];

const GENDERS = ['男', '女'];
const ROLES = ['聖徒', '福音朋友'];
const AREAS = ['霧峰', '朝陽', '其他'];

/** 第一次使用時手動執行一次，建立工作表 */
function setup() {
  regSheet_();
  tablesSheet_();
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
function regSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_REG);
  if (!sh) {
    sh = ss.insertSheet(SHEET_REG);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('@');
    sh.getRange('I:I').setNumberFormat('@');
  }
  return sh;
}

function tablesSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(SHEET_TABLES);
  if (!sh) {
    sh = ss.insertSheet(SHEET_TABLES);
    const rows = [['桌號', '桌長']];
    for (let i = 1; i <= TABLE_COUNT; i++) rows.push([i, '桌長' + i]);
    sh.getRange(1, 1, rows.length, 2).setValues(rows);
    sh.setFrozenRows(1);
  }
  return sh;
}

function readTables_() {
  const values = tablesSheet_().getDataRange().getValues().slice(1);
  return values
    .filter((r) => r[0] !== '')
    .map((r) => ({ no: Number(r[0]), captain: String(r[1] || '') }));
}

function readPeople_() {
  const sh = regSheet_();
  const values = sh.getDataRange().getValues().slice(1);
  return values.map((r, i) => ({
    row: i + 2,
    id: String(r[0]),
    name: String(r[2]),
    gender: String(r[3]),
    role: String(r[4]),
    area: String(r[5]),
    note: String(r[6]),
    table: Number(r[7]) || 0,
    code: String(r[8]),
  }));
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
  regSheet_().appendRow([id, new Date(), safe_(name), d.gender, d.role, safe_(area), safe_(note), '', code]);
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
  regSheet_().getRange(me.row, 8).setValue(table || '');
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
