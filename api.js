// 共用的資料存取：有設定 Supabase 就連線，否則用示範模式（localStorage）
(() => {
  'use strict';
  const CFG = window.APP_CONFIG || {};
  const GENDERS = ['男', '女'];
  const ROLES = ['聖徒', '福音朋友'];
  const AREAS = ['霧峰', '朝陽', '其他'];

  // ================= 後端：Supabase =================
  // 每個動作對應 supabase/schema.sql 裡的一個資料庫函式
  const RPC = {
    state: () => ['feast_state', {}],
    adminOverview: (p) => ['feast_admin_overview', { p_pass: p.pass }],
    adminMove: (p) => ['feast_admin_move', { p_pass: p.pass, p_person: p.person, p_table: p.table }],
    register: (p) => ['feast_register', {
      p_members: p.data.members, p_area: p.data.area,
      p_area_other: p.data.areaOther || '', p_note: p.data.note || '',
    }],
    login: (p) => ['feast_login', { p_name: p.name, p_code: p.code }],
    me: (p) => ['feast_me', { p_id: p.id, p_code: p.code }],
    seat: (p) => ['feast_seat', { p_id: p.id, p_code: p.code, p_table: p.table }],
  };

  let sb = null;
  async function remoteCall(action, payload = {}) {
    if (!sb) sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY);
    const [fn, args] = RPC[action](payload);
    const { data, error } = await sb.rpc(fn, args);
    if (error) {
      // 資料庫裡 raise exception 的中文訊息會在 error.message
      const msg = /[\u4e00-\u9fff]/.test(error.message || '') ? error.message : '連線發生問題，請稍後再試';
      if (!/[\u4e00-\u9fff]/.test(error.message || '')) console.error(error);
      throw new Error(msg);
    }
    return { ok: true, ...data };
  }

  // ================= 示範模式：用 localStorage 模擬後端（邏輯同 supabase/schema.sql） =================
  const DEMO_KEY = 'aiyan-demo-db-v2';
  const DEMO_CAPACITY = 10;

  function demoSeed() {
    const names = '陳恩典 林喜樂 王平安 張信望 李以馬內利 黃榮光 吳憐恤 劉約書亞 蔡路得 楊撒母耳 許馬利亞 鄭提摩太 謝百基拉 郭亞居拉 洪多加 邱巴拿巴 曾以斯帖 周約瑟'.split(' ');
    const seats = [1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 5, 5, 5, 8];
    return {
      tables: Array.from({ length: 20 }, (_, i) => ({ no: i + 1, captain: `桌長${i + 1}` })),
      people: names.map((name, i) => ({
        id: 'demo' + i, group: 'demo' + i, code: String(1000 + i), name,
        gender: GENDERS[i % 2], role: ROLES[i % 3 === 0 ? 1 : 0], area: AREAS[i % 3], table: seats[i],
      })),
    };
  }

  const occupied = (t, people) => people.filter((p) => p.name !== t.captain).length + (t.captain ? 1 : 0);

  async function demoCall(action, p = {}) {
    const db = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null') || demoSeed();
    const party = (group, code) => {
      const ms = db.people.filter((x) => x.group === String(group) && x.code === String(code));
      if (!ms.length) throw new Error('找不到報名資料，請重新登入');
      return { id: group, code, table: ms[0].table, members: ms.map(({ name, gender, role, area }) => ({ name, gender, role, area })) };
    };
    const stateOf = () => ({
      capacity: DEMO_CAPACITY,
      tables: db.tables.map((t) => {
        const at = db.people.filter((q) => q.table === t.no);
        return { ...t, count: occupied(t, at), members: at.map((q) => ({ name: q.name, area: q.area, role: q.role })) };
      }),
    });
    let res;
    switch (action) {
      case 'state': res = stateOf(); break;
      case 'adminOverview':
      case 'adminMove': {
        if (p.pass !== '1234') throw new Error('密碼錯誤');
        if (action === 'adminMove') {
          const x = db.people.find((q) => q.id === p.person);
          if (!x) throw new Error('找不到這個人，請重新整理');
          const t = Number(p.table) || 0;
          if (t && !db.tables.some((tb) => tb.no === t)) throw new Error('桌號不正確');
          if (db.people.some((q) => q !== x && q.group === x.group)) x.group = Math.random().toString(36).slice(2, 12);
          x.table = t;
        }
        const pub = (q) => ({ id: q.id, name: q.name, area: q.area, family: q.group });
        res = {
          capacity: DEMO_CAPACITY,
          tables: db.tables.map((t) => {
            const at = db.people.filter((q) => q.table === t.no);
            return { ...t, count: occupied(t, at), members: at.map(pub) };
          }),
          unseated: db.people.filter((q) => !q.table).map(pub),
        };
        break;
      }
      case 'register': {
        const d = p.data || {};
        const list = d.members || [];
        if (!list.length) throw new Error('請至少填寫一位報名者');
        list.forEach((m, i) => {
          const who = list.length > 1 ? `第 ${i + 1} 位` : '';
          if (!String(m.name || '').trim()) throw new Error(`請填寫${who}姓名`);
          if (!GENDERS.includes(m.gender)) throw new Error(`請選擇${who || m.name}的性別`);
          if (!ROLES.includes(m.role)) throw new Error(`請選擇${who || m.name}的身分`);
        });
        if (!AREAS.includes(d.area)) throw new Error('請選擇小區');
        const other = String(d.areaOther || '').trim();
        const area = d.area === '其他' && other ? `其他（${other}）` : d.area;
        const group = Math.random().toString(36).slice(2, 12);
        const code = String(1000 + Math.floor(Math.random() * 9000));
        list.forEach((m, i) => db.people.push({
          id: i ? Math.random().toString(36).slice(2, 12) : group, group, code,
          name: m.name.trim(), gender: m.gender, role: m.role, area, note: i ? '' : d.note, table: 0,
        }));
        res = { me: party(group, code) };
        break;
      }
      case 'login': {
        const x = db.people.find((q) => q.name === String(p.name).trim() && q.code === String(p.code).trim());
        if (!x) throw new Error('姓名或修改碼不正確');
        res = { me: party(x.group, x.code) };
        break;
      }
      case 'me': res = { me: party(p.id, p.code) }; break;
      case 'seat': {
        const mine = db.people.filter((x) => x.group === String(p.id) && x.code === String(p.code));
        if (!mine.length) throw new Error('找不到報名資料，請重新登入');
        const t = Number(p.table);
        if (t !== 0) {
          const tb = db.tables.find((x) => x.no === t);
          if (!tb) throw new Error('桌號不正確');
          const others = db.people.filter((x) => x.table === t && x.group !== String(p.id));
          if (occupied(tb, others.concat(mine)) > DEMO_CAPACITY) {
            const left = Math.max(0, DEMO_CAPACITY - occupied(tb, others));
            throw new Error(left ? `這桌只剩 ${left} 個位子，不夠 ${mine.length} 位入座` : '這桌已經滿了，請選擇其他桌');
          }
        }
        mine.forEach((x) => { x.table = t; });
        res = { me: party(p.id, p.code), ...stateOf() };
        break;
      }
      default: throw new Error('未知的操作');
    }
    localStorage.setItem(DEMO_KEY, JSON.stringify(db));
    await new Promise((r) => setTimeout(r, 200));
    return JSON.parse(JSON.stringify({ ok: true, ...res }));
  }

  const LIVE = !!(CFG.SUPABASE_URL && CFG.SUPABASE_KEY);
  const call = LIVE ? remoteCall : demoCall;

  window.FeastAPI = { call, LIVE };
})();
