const TG_API = "https://api.telegram.org";

export function tgUrl(method) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return `${TG_API}/bot${token}/${method}`;
}

export async function tg(method, payload) {
  const res = await fetch(tgUrl(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!data.ok) {
    console.error(`Telegram API error in ${method}:`, data);
  }
  return data;
}

export function escapeMd(text) {
  return String(text).replace(/[_*\[\]()~`>#+\-=|{}.!]/g, (m) => "\\" + m);
}

export function draftCardKeyboard(draftId) {
  return {
    inline_keyboard: [
      [
        { text: "✅ В канал сейчас", callback_data: `publish:now:${draftId}` },
        { text: "⏰ Завтра 09:00", callback_data: `publish:morning:${draftId}` }
      ],
      [
        { text: "🌆 Сегодня 19:00", callback_data: `publish:evening:${draftId}` },
        { text: "✏️ Доработать", callback_data: `edit:${draftId}` }
      ],
      [
        { text: "❌ Отклонить", callback_data: `reject:${draftId}` }
      ]
    ]
  };
}

export function formatDraftCard(draft) {
  const rubric = draft.rubric || "📝";
  const length = draft.length || "?";
  const status = draft.status || "draft";
  const header =
    `${rubric} <b>Новый черновик #${draft.id}</b>\n` +
    `<i>длина: ${length} · статус: ${status}</i>\n\n` +
    `━━━━━━━━━━━━━━━━━━━\n\n`;
  return header + (draft.body || "");
}

const NOW = "now";
const MORNING = "morning";
const EVENING = "evening";

export function calcScheduleTime(slot) {
  const now = new Date();
  if (slot === NOW) return Math.floor(now.getTime() / 1000);
  if (slot === MORNING) {
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    t.setHours(9, 0, 0, 0);
    return Math.floor(t.getTime() / 1000);
  }
  if (slot === EVENING) {
    const t = new Date(now);
    t.setHours(19, 0, 0, 0);
    if (t.getTime() <= now.getTime()) {
      t.setDate(t.getDate() + 1);
    }
    return Math.floor(t.getTime() / 1000);
  }
  return Math.floor(now.getTime() / 1000);
}

export function formatScheduledMsg(slot, unixTs) {
  const dt = new Date(unixTs * 1000);
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const hh = String(dt.getHours()).padStart(2, "0");
  const mn = String(dt.getMinutes()).padStart(2, "0");
  return `${dd}.${mm} в ${hh}:${mn}`;
}
