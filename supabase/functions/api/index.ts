// 簡易活動登記 — Supabase Edge Function
// 前端 POST { action, idToken, ... }，回傳 { ok, data } 或 { ok:false, error }
import { createClient } from 'npm:@supabase/supabase-js@2';

const CHANNEL_ID = Deno.env.get('LINE_CHANNEL_ID') ?? '2012523033';
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type User = { userId: string; displayName: string };
type Row = Record<string, unknown>;
type Question = { id: string; label: string; type: 'text' | 'select' | 'companions'; options?: string[] };

class UserError extends Error {}

const THEMES = ['classic', 'feast', 'prayer', 'gospel', 'youth', 'kids', 'bible', 'serve'];
const REMINDERS = ['7d', '24h', '1h'];
const MAX_COMPANIONS = 10;

// ---------- LINE ID Token 驗證（同一個 instance 內快取） ----------
const tokenCache = new Map<string, { user: User; exp: number }>();
async function verifyIdToken(idToken?: string): Promise<User> {
  if (!idToken) throw new UserError('請先登入 LINE');
  const now = Date.now() / 1000;
  const hit = tokenCache.get(idToken);
  if (hit && hit.exp > now) return hit.user;

  const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    body: new URLSearchParams({ id_token: idToken, client_id: CHANNEL_ID }),
  });
  if (!res.ok) throw new UserError('登入已過期，請重新開啟頁面');
  const p = await res.json();
  const user = { userId: p.sub, displayName: p.name || 'LINE 使用者' };
  if (tokenCache.size > 1000) tokenCache.clear();
  tokenCache.set(idToken, { user, exp: p.exp - 30 });
  return user;
}

// ---------- 時間：前端用台灣時間 'YYYY-MM-DDTHH:MM' ----------
const LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const toLocal = (ts: unknown) => (ts ? new Date(new Date(String(ts)).getTime() + 8 * 3600e3).toISOString().slice(0, 16) : '');
function fromLocal(s: unknown, label: string) {
  if (!s) return null;
  if (!LOCAL_RE.test(String(s))) throw new UserError(`${label}格式不正確`);
  return `${s}:00+08:00`;
}
const httpsUrl = (v: unknown, label: string) => {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (!/^https:\/\/\S+$/i.test(s) || s.length > 500) throw new UserError(`${label}需為 https:// 開頭的網址`);
  return s;
};
const clip = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);

// ---------- 欄位轉換 ----------
const toEvent = (e: Row, regs: Row[] = []) => ({
  id: e.id, ownerId: e.owner_id, ownerName: e.owner_name, title: e.title,
  startAt: toLocal(e.start_at), endAt: toLocal(e.end_at), deadlineAt: toLocal(e.deadline_at),
  location: e.location ?? '', mapUrl: e.map_url ?? '', description: e.description ?? '',
  imageUrl: e.image_url ?? '', buttonText: e.button_text || '我要登記', theme: e.theme || 'classic',
  questions: (e.questions as Question[]) ?? [], reminders: (e.reminders as string[]) ?? [],
  capacity: e.capacity, askPhone: e.ask_phone, status: e.status, createdAt: e.created_at,
  total: regs.reduce((n, r) => n + Number(r.count || 1), 0), regCount: regs.length,
});
const toPublicReg = (r: Row) => ({ name: r.name, answers: r.answers ?? {}, count: r.count });
const toReg = (r: Row) => ({
  ...toPublicReg(r), displayName: r.display_name, phone: r.phone ?? '', note: r.note ?? '', createdAt: r.created_at,
});

function cleanQuestions(src: unknown): Question[] {
  if (!Array.isArray(src)) return [];
  const out: Question[] = [];
  const seen = new Set<string>();
  for (const q of src.slice(0, 10)) {
    const id = String(q?.id ?? '').slice(0, 20);
    const type = q?.type;
    const label = clip(q?.label, 30);
    if (!/^[\w-]+$/.test(id) || seen.has(id) || !label || !['text', 'select', 'companions'].includes(type)) continue;
    if (type === 'companions' && out.some((x) => x.type === 'companions')) continue;
    const item: Question = { id, label, type };
    if (type === 'select') {
      item.options = [...new Set((Array.isArray(q.options) ? q.options : []).map((o: unknown) => clip(o, 30)).filter(Boolean))]
        .slice(0, 30) as string[];
      if (!item.options.length) throw new UserError(`「${label}」至少要有一個選項`);
    }
    seen.add(id);
    out.push(item);
  }
  return out;
}

/** 前端傳入的活動欄位 → DB 欄位（白名單 + 驗證） */
function eventInput(src: Row = {}) {
  const out: Row = {};
  const has = (k: string) => src[k] !== undefined;
  if (has('title')) { out.title = clip(src.title, 60); if (!out.title) throw new UserError('請填寫活動名稱'); }
  if (has('startAt')) {
    out.start_at = fromLocal(src.startAt, '開始時間');
    out.date = src.startAt ? String(src.startAt).slice(0, 10) : null;
    out.time = src.startAt ? String(src.startAt).slice(11, 16) : null;
  }
  if (has('endAt')) out.end_at = fromLocal(src.endAt, '結束時間');
  if (has('deadlineAt')) out.deadline_at = fromLocal(src.deadlineAt, '登記截止');
  if (has('location')) out.location = clip(src.location, 100);
  if (has('mapUrl')) out.map_url = httpsUrl(src.mapUrl, '地圖位置');
  if (has('description')) out.description = String(src.description ?? '').slice(0, 1000);
  if (has('imageUrl')) out.image_url = httpsUrl(src.imageUrl, '圖片網址');
  if (has('buttonText')) out.button_text = clip(src.buttonText, 20) || '我要登記';
  if (has('theme')) out.theme = THEMES.includes(String(src.theme)) ? src.theme : 'classic';
  if (has('capacity')) out.capacity = Math.max(0, Math.floor(Number(src.capacity) || 0));
  if (has('askPhone')) out.ask_phone = src.askPhone === true;
  if (has('reminders')) out.reminders = (Array.isArray(src.reminders) ? src.reminders : []).filter((r) => REMINDERS.includes(String(r)));
  if (has('questions')) {
    const qs = cleanQuestions(src.questions);
    out.questions = qs;
    out.max_per_person = qs.some((q) => q.type === 'companions') ? MAX_COMPANIONS + 1 : 1;
  }
  if (has('status') && (src.status === 'open' || src.status === 'closed')) out.status = src.status;
  if (out.start_at && out.end_at && String(out.end_at) < String(out.start_at)) throw new UserError('結束時間不能早於開始時間');
  return out;
}

const must = <T>({ data, error }: { data: T; error: { message: string } | null }) => {
  if (error) throw new UserError(error.message);
  return data;
};
async function getEvent(id: string) {
  const ev = must(await db.from('events').select('*').eq('id', id).maybeSingle());
  if (!ev) throw new UserError('找不到活動');
  return ev as Row;
}
async function activeRegs(eventIds: string[]) {
  if (!eventIds.length) return [] as Row[];
  return must(await db.from('registrations').select('*').in('event_id', eventIds).eq('status', 'active')
    .order('created_at')) as Row[];
}
async function getProfile(userId: string) {
  return (must(await db.from('profiles').select('*').eq('user_id', userId).maybeSingle()) as Row | null)
    ?? { name: '', phone: '', answers: {} };
}

// ---------- 動作 ----------
const actions: Record<string, (b: Row, u: User) => Promise<unknown>> = {
  async createEvent(b, u) {
    const input = eventInput({ ...(b.event as Row), status: undefined });
    if (!input.title) throw new UserError('請填寫活動名稱');
    if (!input.start_at) throw new UserError('請填寫開始時間');
    if (input.questions === undefined) { input.questions = []; input.max_per_person = 1; }
    const ev = must(await db.from('events')
      .insert({ ...input, owner_id: u.userId, owner_name: u.displayName }).select('*').single()) as Row;
    return toEvent(ev);
  },

  async updateEvent(b, u) {
    const ev = await getEvent(String(b.id));
    if (ev.owner_id !== u.userId) throw new UserError('只有主辦人可以修改');
    const input = eventInput(b.event as Row);
    if (input.start_at !== undefined && toLocal(input.start_at) !== toLocal(ev.start_at)) input.reminders_sent = [];
    const updated = must(await db.from('events').update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', ev.id).select('*').single()) as Row;
    return toEvent(updated, await activeRegs([ev.id as string]));
  },

  async getEvent(b, u) {
    const ev = await getEvent(String(b.id));
    const regs = await activeRegs([ev.id as string]);
    const isOwner = ev.owner_id === u.userId;
    const mine = regs.find((r) => r.user_id === u.userId);
    return {
      event: toEvent(ev, regs),
      myReg: mine ? toReg(mine) : null,
      isOwner,
      list: regs.map(toPublicReg),           // 接龍名單（不含電話）
      regs: isOwner ? regs.map(toReg) : null, // 主辦人完整名單
      profile: mine ? null : await getProfile(u.userId),
    };
  },

  async register(b, u) {
    const ev = await getEvent(String(b.id));
    const r = (b.reg ?? {}) as Row;
    const src = (r.answers ?? {}) as Row;
    const answers: Record<string, string> = {};
    let count = 1;
    for (const q of (ev.questions as Question[]) ?? []) {
      const v = clip(src[q.id], 100);
      if (q.type === 'companions') {
        const n = Math.min(MAX_COMPANIONS, Math.max(0, Math.floor(Number(v) || 0)));
        count = 1 + n;
        answers[q.id] = String(n);
      } else if (q.type === 'select') {
        if (!v) throw new UserError(`請選擇「${q.label}」`);
        if (!q.options?.includes(v)) throw new UserError(`「${q.label}」的選項不正確`);
        answers[q.id] = v;
      } else if (v) answers[q.id] = v;
    }
    const name = clip(r.name, 30);
    const phone = clip(r.phone, 20);
    must(await db.rpc('register_event', {
      p_event_id: ev.id, p_user_id: u.userId, p_display_name: u.displayName,
      p_name: name, p_phone: phone, p_count: count, p_note: clip(r.note, 100), p_answers: answers,
    }));
    // 記住個人資料（依問題名稱），下次報名自動帶入
    const prof = await getProfile(u.userId);
    const saved = { ...((prof.answers as Row) ?? {}) };
    for (const q of (ev.questions as Question[]) ?? []) if (q.type !== 'companions' && answers[q.id]) saved[q.label] = answers[q.id];
    must(await db.from('profiles').upsert({
      user_id: u.userId, name, phone: phone || prof.phone || '', answers: saved, updated_at: new Date().toISOString(),
    }));
    return {};
  },

  async cancel(b, u) {
    must(await db.from('registrations').update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('event_id', String(b.id)).eq('user_id', u.userId).eq('status', 'active'));
    return {};
  },

  async myEvents(_b, u) {
    const created = must(await db.from('events').select('*').eq('owner_id', u.userId)) as Row[];
    const myRegs = must(await db.from('registrations').select('event_id')
      .eq('user_id', u.userId).eq('status', 'active')) as Row[];
    const joinedIds = myRegs.map((r) => r.event_id as string);
    const joined = joinedIds.length
      ? must(await db.from('events').select('*').in('id', joinedIds)) as Row[]
      : [];
    const regs = await activeRegs([...new Set([...created.map((e) => e.id as string), ...joinedIds])]);
    const withCount = (e: Row) => toEvent(e, regs.filter((r) => r.event_id === e.id));
    return { created: created.map(withCount), joined: joined.map(withCount) };
  },

  async getProfile(_b, u) {
    const p = await getProfile(u.userId);
    return { name: p.name || '', phone: p.phone || '', answers: p.answers || {} };
  },

  async saveProfile(b, u) {
    const p = (b.profile ?? {}) as Row;
    const answers: Record<string, string> = {};
    for (const [k, v] of Object.entries((p.answers as Row) ?? {}).slice(0, 30)) {
      const key = clip(k, 30); const val = clip(v, 100);
      if (key && val) answers[key] = val;
    }
    must(await db.from('profiles').upsert({
      user_id: u.userId, name: clip(p.name, 30), phone: clip(p.phone, 20), answers, updated_at: new Date().toISOString(),
    }));
    return {};
  },

  async uploadImage(b) {
    const m = String(b.dataUrl ?? '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!m) throw new UserError('圖片格式不支援');
    const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    if (bytes.length > 3 * 1024 * 1024) throw new UserError('圖片太大（上限 3MB）');
    const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${m[1].split('/')[1]}`;
    must(await db.storage.from('event-images').upload(path, bytes, { contentType: m[1], upsert: false }));
    return { url: db.storage.from('event-images').getPublicUrl(path).data.publicUrl };
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  try {
    const body = await req.json();
    const user = await verifyIdToken(body.idToken);
    const fn = actions[body.action];
    if (!fn) throw new UserError('未知的動作');
    return reply({ ok: true, data: await fn(body, user) });
  } catch (e) {
    if (e instanceof UserError) return reply({ ok: false, error: e.message });
    console.error(e);
    return reply({ ok: false, error: '伺服器錯誤，請稍後再試' }, 500);
  }
});
