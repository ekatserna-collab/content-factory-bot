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

export function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "✨ Сгенерировать пост", callback_data: "fire:daily" }
      ],
      [
        { text: "📅 Weekly: стратегия + план", callback_data: "fire:weekly" },
        { text: "📋 Очередь", callback_data: "ui:queue" }
      ],
      [
        { text: "📊 Статус", callback_data: "ui:status" },
        { text: "ℹ️ Справка", callback_data: "ui:help" }
      ]
    ]
  };
}

const MENU_TEXT =
  "🤖 <b>Контент-завод</b> для @aiplaceeee\n\n" +
  "Выбери действие. Если нужно прямо сейчас — жми «Сгенерировать пост», агент проснётся, " +
  "соберёт тему, напишет, оформит и пришлёт черновик сюда с кнопками одобрения.";

export { MENU_TEXT };

export async function fireRoutine(kind) {
  const map = {
    daily: {
      url: process.env.ROUTINE_DAILY_URL,
      token: process.env.ROUTINE_DAILY_TOKEN,
      label: "Daily Producer"
    },
    weekly: {
      url: process.env.ROUTINE_WEEKLY_URL,
      token: process.env.ROUTINE_WEEKLY_TOKEN,
      label: "Weekly Strategist"
    }
  };
  const cfg = map[kind];
  if (!cfg || !cfg.url || !cfg.token) {
    return {
      ok: false,
      error: `Routine ${kind} ещё не настроена. Создай Routine на code.claude.com и пропиши ROUTINE_${kind.toUpperCase()}_URL и ROUTINE_${kind.toUpperCase()}_TOKEN в env var Vercel.`
    };
  }
  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${cfg.token}`,
        "anthropic-beta": "experimental-cc-routine-2026-04-01",
        "Content-Type": "text/plain"
      },
      body: `manual trigger from Telegram bot at ${new Date().toISOString()}`
    });
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 300) }; }
    if (!res.ok) {
      return { ok: false, status: res.status, body: parsed };
    }
    return { ok: true, label: cfg.label, session: parsed };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
