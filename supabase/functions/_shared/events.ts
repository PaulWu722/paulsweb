// api 與 line-bot 共用的資料存取工具
import { createClient } from 'npm:@supabase/supabase-js@2';

export const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

export const LIFF_ID = Deno.env.get('LIFF_ID') ?? '2012412693-a7phfbWa';
export const liffUrl = (id: string) => `https://liff.line.me/${LIFF_ID}?event=${encodeURIComponent(id)}`;

export type User = { userId: string; displayName: string };
export type Row = Record<string, unknown>;

/** 可以直接顯示給使用者看的錯誤 */
export class UserError extends Error {}

export const must = <T>({ data, error }: { data: T; error: { message: string } | null }) => {
  if (error) throw new UserError(error.message);
  return data;
};

// DB snake_case → 前端 camelCase
export const toEvent = (e: Row, regs: Row[] = []) => ({
  id: e.id as string, ownerId: e.owner_id, ownerName: e.owner_name, title: e.title as string,
  date: e.date as string, time: (e.time as string) ?? '', location: (e.location as string) ?? '',
  description: (e.description as string) ?? '',
  capacity: e.capacity as number, maxPerPerson: e.max_per_person as number, deadline: (e.deadline as string) ?? '',
  askPhone: e.ask_phone as boolean, status: e.status as string, createdAt: e.created_at,
  total: regs.reduce((n, r) => n + Number(r.count || 1), 0), regCount: regs.length,
});
export type EventView = ReturnType<typeof toEvent>;

export const toReg = (r: Row) => ({
  eventId: r.event_id, userId: r.user_id, displayName: r.display_name, name: r.name,
  phone: (r.phone as string) ?? '', count: r.count, note: (r.note as string) ?? '', createdAt: r.created_at,
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/** 前端/AI 傳入的活動欄位 → DB 欄位（只收白名單欄位並清理格式） */
export function eventInput(src: Row = {}) {
  const map: Record<string, string> = {
    title: 'title', date: 'date', time: 'time', location: 'location', description: 'description',
    capacity: 'capacity', maxPerPerson: 'max_per_person', deadline: 'deadline', askPhone: 'ask_phone', status: 'status',
  };
  const out: Row = {};
  for (const [k, col] of Object.entries(map)) {
    if (src[k] === undefined) continue;
    let v = src[k];
    if (k === 'date' && !DATE_RE.test(String(v))) throw new UserError('日期格式需為 YYYY-MM-DD');
    if (k === 'deadline') { v = v || null; if (v && !DATE_RE.test(String(v))) throw new UserError('截止日格式需為 YYYY-MM-DD'); }
    if (k === 'time') { v = v || null; if (v && !TIME_RE.test(String(v))) throw new UserError('時間格式需為 HH:MM'); }
    if (k === 'location' || k === 'description') v = v ?? '';
    if (k === 'capacity') v = Math.max(0, Number(v) || 0);
    if (k === 'maxPerPerson') v = Math.min(20, Math.max(1, Number(v) || 1));
    if (k === 'askPhone') v = v === true || v === 'true';
    if (k === 'status' && v !== 'open' && v !== 'closed') continue;
    out[col] = v;
  }
  return out;
}

export async function getEvent(id: string) {
  const ev = must(await db.from('events').select('*').eq('id', id).maybeSingle());
  if (!ev) throw new UserError('找不到活動');
  return ev as Row;
}

export async function activeRegs(eventIds: string[]) {
  if (!eventIds.length) return [] as Row[];
  return must(await db.from('registrations').select('*').in('event_id', eventIds).eq('status', 'active')
    .order('created_at')) as Row[];
}

export async function createEvent(input: Row, u: User) {
  const data = eventInput(input);
  if (!data.title || !data.date) throw new UserError('請填寫活動名稱與日期');
  delete data.status;
  const ev = must(await db.from('events')
    .insert({ ...data, owner_id: u.userId, owner_name: u.displayName }).select('*').single()) as Row;
  return toEvent(ev);
}

export async function updateEvent(id: string, input: Row, u: User) {
  const ev = await getEvent(id);
  if (ev.owner_id !== u.userId) throw new UserError('只有主辦人可以修改');
  const updated = must(await db.from('events').update({ ...eventInput(input), updated_at: new Date().toISOString() })
    .eq('id', id).select('*').single()) as Row;
  return toEvent(updated, await activeRegs([id]));
}

export async function eventsOwnedBy(userId: string) {
  const created = must(await db.from('events').select('*').eq('owner_id', userId)
    .order('date', { ascending: false })) as Row[];
  const regs = await activeRegs(created.map((e) => e.id as string));
  return created.map((e) => toEvent(e, regs.filter((r) => r.event_id === e.id)));
}

// ---------- 顯示 ----------
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
export function fmtDate(d: string) {
  if (!d) return '';
  const dt = new Date(d + 'T00:00:00Z');
  return isNaN(+dt) ? d : `${dt.getUTCFullYear()}/${dt.getUTCMonth() + 1}/${dt.getUTCDate()}（${WEEK[dt.getUTCDay()]}）`;
}
export const fmtDateTime = (ev: { date: string; time?: string }) => [fmtDate(ev.date), ev.time].filter(Boolean).join(' ');

/** 報名卡片（與前端分享的 Flex 訊息相同） */
export function flexCard(ev: EventView) {
  return {
    type: 'flex',
    altText: `📋 ${ev.title} 開放報名中`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm', contents: [
          { type: 'text', text: '活動報名', size: 'xs', color: '#06c755', weight: 'bold' },
          { type: 'text', text: ev.title, size: 'lg', weight: 'bold', wrap: true },
          { type: 'text', text: `📅 ${fmtDateTime(ev)}`, size: 'sm', color: '#555555', wrap: true },
          ...(ev.location ? [{ type: 'text', text: `📍 ${ev.location}`, size: 'sm', color: '#555555', wrap: true }] : []),
          ...(ev.capacity ? [{ type: 'text', text: `👥 名額 ${ev.capacity} 人`, size: 'sm', color: '#555555' }] : []),
          { type: 'text', text: `🙋 主辦：${ev.ownerName}`, size: 'sm', color: '#555555' },
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', contents: [
          { type: 'button', style: 'primary', color: '#06c755', action: { type: 'uri', label: '立即報名', uri: liffUrl(ev.id) } },
        ],
      },
    },
  };
}
