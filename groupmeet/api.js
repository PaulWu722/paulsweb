// 資料存取：有設定 Supabase 就連線，否則用示範模式（localStorage + IndexedDB，只存在這台裝置）
(() => {
  'use strict';
  const CFG = window.GM_CONFIG || {};
  const LIVE = !!(CFG.SUPABASE_URL && CFG.SUPABASE_KEY);
  const BUCKET = 'groupmeet';
  const MAX_SIZE = 50 * 1024 * 1024;

  const hasChinese = (s) => /[一-鿿]/.test(s || '');
  const friendly = (err, fallback = '連線發生問題，請稍後再試') => {
    if (hasChinese(err && err.message)) return new Error(err.message);
    console.error(err);
    return new Error(fallback);
  };
  const checkFile = (file) => {
    if (!file) return;
    if (file.type && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) throw new Error('只能上傳 PDF 檔');
    if (file.size > MAX_SIZE) throw new Error('檔案太大（上限 50MB）');
  };

  // ================= Supabase =================
  let sb = null;
  const client = () => (sb ||= window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY));
  async function rpc(fn, args = {}) {
    const { data, error } = await client().rpc(fn, args);
    if (error) throw friendly(error);
    return data;
  }
  async function uploadLive(pass, file) {
    if (!file) return null;
    checkFile(file);
    const { path } = await rpc('gm_admin_ticket', { p_pass: pass });
    const { error } = await client().storage.from(BUCKET)
      .upload(path, file, { contentType: 'application/pdf', upsert: false, cacheControl: '31536000' });
    if (error) throw friendly(error, /size|large/i.test(error.message) ? '檔案太大（上限 50MB）' : 'PDF 上傳失敗，請再試一次');
    return path;
  }
  async function removeFileLive(path) {
    if (!path) return;
    const { error } = await client().storage.from(BUCKET).remove([path]);
    if (error) console.warn('刪除舊 PDF 失敗', error);
  }

  const live = {
    list: () => rpc('gm_list'),
    fileUrl: async (item) => item.file_path
      ? client().storage.from(BUCKET).getPublicUrl(item.file_path).data.publicUrl : null,
    login: (pass) => rpc('gm_admin_login', { p_pass: pass }),
    async add(pass, d) {
      const path = await uploadLive(pass, d.file);
      return rpc('gm_admin_add', {
        p_pass: pass, p_date: d.date, p_title: d.title, p_note: d.note || '', p_bible: d.bible || [],
        p_path: path, p_file_name: d.file ? d.file.name : null, p_file_size: d.file ? d.file.size : null,
      });
    },
    async update(pass, d) {
      const path = await uploadLive(pass, d.file);
      const r = await rpc('gm_admin_update', {
        p_pass: pass, p_id: d.id, p_date: d.date, p_title: d.title, p_note: d.note || '', p_bible: d.bible || [],
        p_path: path, p_file_name: d.file ? d.file.name : null, p_file_size: d.file ? d.file.size : null,
      });
      await removeFileLive(r.old_path);
      return r.items;
    },
    async remove(pass, id) {
      const r = await rpc('gm_admin_delete', { p_pass: pass, p_id: id });
      await removeFileLive(r.path);
      return r.items;
    },
  };

  // ================= 示範模式 =================
  const DEMO_KEY = 'groupmeet-demo-v1';
  const DEMO_PASS = '1234';
  const loadDb = () => {
    try { return JSON.parse(localStorage.getItem(DEMO_KEY)) || { items: [] }; } catch { return { items: [] }; }
  };
  const saveDb = (db) => localStorage.setItem(DEMO_KEY, JSON.stringify(db));
  const sorted = (items) => [...items].sort((a, b) =>
    b.meet_date.localeCompare(a.meet_date) || b.created_at.localeCompare(a.created_at));

  let idbP = null;
  const idb = () => (idbP ||= new Promise((resolve, reject) => {
    const req = indexedDB.open('groupmeet-demo', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
  const idbDo = async (mode, fn) => {
    const db = await idb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('files', mode);
      const req = fn(tx.objectStore('files'));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
    });
  };
  const urlCache = new Map();

  const checkPass = (pass) => { if (pass !== DEMO_PASS) throw new Error('密碼錯誤（示範模式密碼：1234）'); };
  const validate = (d) => {
    if (!d.date) throw new Error('請選擇聚會日期');
    if (!String(d.title || '').trim()) throw new Error('請填寫標題');
    checkFile(d.file);
  };
  const putFile = async (file) => {
    if (!file) return null;
    const path = `demo/${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`;
    await idbDo('readwrite', (s) => s.put(file, path));
    return path;
  };
  const delFile = (path) => path && idbDo('readwrite', (s) => s.delete(path)).catch(() => {});

  const demo = {
    list: async () => sorted(loadDb().items),
    async fileUrl(item) {
      if (!item.file_path) return null;
      if (urlCache.has(item.file_path)) return urlCache.get(item.file_path);
      const blob = await idbDo('readonly', (s) => s.get(item.file_path));
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      urlCache.set(item.file_path, url);
      return url;
    },
    login: async (pass) => { checkPass(pass); return { ok: true }; },
    async add(pass, d) {
      checkPass(pass); validate(d);
      const path = await putFile(d.file);
      const db = loadDb();
      db.items.push({
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        meet_date: d.date, title: d.title.trim(), note: d.note || '', bible: d.bible || [],
        file_path: path, file_name: d.file ? d.file.name : '', file_size: d.file ? d.file.size : 0,
        created_at: new Date().toISOString(),
      });
      saveDb(db);
      return sorted(db.items);
    },
    async update(pass, d) {
      checkPass(pass); validate(d);
      const db = loadDb();
      const it = db.items.find((x) => x.id === d.id);
      if (!it) throw new Error('找不到這筆信息，請重新整理');
      Object.assign(it, { meet_date: d.date, title: d.title.trim(), note: d.note || '', bible: d.bible || [] });
      if (d.file) {
        const old = it.file_path;
        Object.assign(it, { file_path: await putFile(d.file), file_name: d.file.name, file_size: d.file.size });
        await delFile(old);
      }
      saveDb(db);
      return sorted(db.items);
    },
    async remove(pass, id) {
      checkPass(pass);
      const db = loadDb();
      const it = db.items.find((x) => x.id === id);
      if (!it) throw new Error('找不到這筆信息，請重新整理');
      db.items = db.items.filter((x) => x.id !== id);
      saveDb(db);
      await delFile(it.file_path);
      return sorted(db.items);
    },
  };

  window.GM_API = { live: LIVE, ...(LIVE ? live : demo) };
})();
