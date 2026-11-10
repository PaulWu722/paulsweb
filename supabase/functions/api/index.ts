// 簡易活動登記 — Supabase Edge Function
// 前端 POST { action, idToken, ... }，回傳 { ok, data } 或 { ok:false, error }（與 gas/Code.gs 相同協定）
import { createClient } from 'npm:@supabase/supabase-js@2';

const CHANNEL_ID = Deno.env.get('LINE_CHANNEL_ID') ?? '2012412693';
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

class UserError extends Error {}

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

// ---------- 欄位轉換（DB snake_case ↔ 前端 camelCase） ----------
const toEvent = (e: Row, regs: Row[] = []) => ({
  id: e.id, ownerId: e.owner_id, ownerName: e.owner_name, title: e.title,
  date: e.date, time: e.time ?? '', location: e.location ?? '', description: e.description ?? '',
  capacity: e.capacity, maxPerPerson: e.max_per_person, deadline: e.deadline ?? '',
  askPhone: e.ask_phone, status: e.status, createdAt: e.created_at,
  total: regs.reduce((n, r) => n + Number(r.count || 1), 0), regCount: regs.length,
});
const toReg = (r: Row) => ({
  eventId: r.event_id, userId: r.user_id, displayName: r.display_name, name: r.name,
  phone: r.phone ?? '', count: r.count, note: r.note ?? '', createdAt: r.created_at,
});
function eventInput(src: Row = {}) {
  const map: Record<string, string> = {
    title: 'title', date: 'date', time: 'time', location: 'location', description: 'description',
    capacity: 'capacity', maxPerPerson: 'max_per_person', deadline: 'deadline', askPhone: 'ask_phone', status: 'status',
  };
  const out: Row = {};
  for (const [k, col] of Object.entries(map)) {
    if (src[k] === undefined) continue;
    let v = src[k];
    if (k === 'deadline' || k === 'time') v = v || null;
    if (k === 'capacity') v = Math.max(0, Number(v) || 0);
    if (k === 'maxPerPerson') v = Math.min(20, Math.max(1, Number(v) || 1));
    if (k === 'askPhone') v = v === true || v === 'true';
    if (k === 'status' && v !== 'open' && v !== 'closed') continue;
    out[col] = v;
  }
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

// ---------- 動作 ----------
const actions: Record<string, (b: Row, u: User) => Promise<unknown>> = {
  async createEvent(b, u) {
    const input = eventInput(b.event as Row);
    if (!input.title || !input.date) throw new UserError('請填寫活動名稱與日期');
    delete input.status;
    const ev = must(await db.from('events')
      .insert({ ...input, owner_id: u.userId, owner_name: u.displayName }).select('id').single());
    return { id: (ev as Row).id };
  },

  async updateEvent(b, u) {
    const ev = await getEvent(String(b.id));
    if (ev.owner_id !== u.userId) throw new UserError('只有主辦人可以修改');
    must(await db.from('events').update({ ...eventInput(b.event as Row), updated_at: new Date().toISOString() })
      .eq('id', ev.id));
    return {};
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
      regs: isOwner ? regs.map(toReg) : null,
    };
  },

  async register(b, u) {
    const r = (b.reg ?? {}) as Row;
    must(await db.rpc('register_event', {
      p_event_id: String(b.id), p_user_id: u.userId, p_display_name: u.displayName,
      p_name: String(r.name ?? ''), p_phone: String(r.phone ?? ''), p_count: Number(r.count) || 1,
      p_note: String(r.note ?? ''),
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
