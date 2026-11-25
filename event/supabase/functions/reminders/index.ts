// 活動前提醒 — 由 pg_cron 每 10 分鐘呼叫一次（見 supabase/cron.sql）
// 需要的 Secrets：CRON_SECRET、LINE_CHANNEL_ACCESS_TOKEN（Messaging API channel，需與 LINE Login 同一個 Provider）
import { createClient } from 'npm:@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
const LIFF_ID = Deno.env.get('LIFF_ID') ?? '2012523033-BncNNabf';
const OFFSETS: Record<string, { ms: number; text: string }> = {
  '7d': { ms: 7 * 24 * 3600e3, text: '再 7 天' },
  '24h': { ms: 24 * 3600e3, text: '明天' },
  '1h': { ms: 3600e3, text: '再 1 小時' },
};
const WINDOW_MS = 30 * 60e3; // 錯過提醒時間 30 分鐘內仍會補發，超過就略過（避免剛建立就收到 7 天前提醒）

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
function fmtWhen(ts: string) {
  const d = new Date(new Date(ts).getTime() + 8 * 3600e3);
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日（${WEEK[d.getUTCDay()]}）${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

async function multicast(token: string, to: string[], messages: unknown[]) {
  for (let i = 0; i < to.length; i += 500) {
    const res = await fetch('https://api.line.me/v2/bot/message/multicast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to: to.slice(i, i + 500), messages }),
    });
    if (!res.ok) throw new Error(`LINE multicast ${res.status}: ${await res.text()}`);
  }
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return new Response('forbidden', { status: 403 });
  const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
  if (!token) return Response.json({ ok: false, error: 'LINE_CHANNEL_ACCESS_TOKEN 未設定' }, { status: 500 });

  const now = Date.now();
  const { data: events, error } = await db.from('events').select('*')
    .gt('start_at', new Date(now).toISOString())
    .lt('start_at', new Date(now + 7 * 24 * 3600e3 + WINDOW_MS).toISOString())
    .neq('reminders', '{}');
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const log: string[] = [];
  for (const ev of events ?? []) {
    const start = new Date(ev.start_at).getTime();
    const due = (ev.reminders as string[]).filter((r) => {
      const o = OFFSETS[r];
      return o && !(ev.reminders_sent as string[]).includes(r) && now >= start - o.ms && now < start - o.ms + WINDOW_MS;
    });
    if (!due.length) continue;

    const { data: regs } = await db.from('registrations').select('user_id').eq('event_id', ev.id).eq('status', 'active');
    const to = [...new Set((regs ?? []).map((r) => r.user_id as string))];
    const r = due[due.length - 1]; // 同時到期只發最接近的一則
    const lines = [`⏰ 活動提醒：${OFFSETS[r].text}`, `【${ev.title}】`, `🕒 ${fmtWhen(ev.start_at)}`];
    if (ev.location) lines.push(`📍 ${ev.location}`);
    lines.push('', `活動資訊：https://liff.line.me/${LIFF_ID}?event=${ev.id}`);
    try {
      if (to.length) await multicast(token, to, [{ type: 'text', text: lines.join('\n') }]);
      await db.from('events').update({ reminders_sent: [...(ev.reminders_sent as string[]), ...due] }).eq('id', ev.id);
      log.push(`${ev.id} ${due.join(',')} → ${to.length} 人`);
    } catch (e) {
      console.error(e);
      log.push(`${ev.id} 失敗：${(e as Error).message}`);
    }
  }
  return Response.json({ ok: true, sent: log });
});
