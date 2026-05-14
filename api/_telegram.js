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
        { text: "📦 Запустить недельный pillar-cycle", callback_data: "fire:pillar_cycle" }
      ],
      [
        { text: "🎯 Big Idea недели", callback_data: "fire:curator" },
        { text: "🧪 Тестовые Threads", callback_data: "fire:tester" }
      ],
      [
        { text: "📸 Studio Day пакет", callback_data: "fire:studio" },
        { text: "📅 Weekly стратегия", callback_data: "fire:weekly" }
      ],
      [
        { text: "📋 Очередь", callback_data: "ui:queue" },
        { text: "📊 Статус", callback_data: "ui:status" }
      ],
      [
        { text: "🎬 Воронка (запуск)", callback_data: "ui:funnel" },
        { text: "ℹ️ Справка", callback_data: "ui:help" }
      ]
    ]
  };
}

const MENU_TEXT =
  "🤖 <b>Контент-завод</b> для @aiplaceeee\n\n" +
  "<b>Главное:</b>\n" +
  "📦 <b>Pillar-cycle</b> — полный цикл недели: Big Idea → длинный пост + карусель + Reels + Threads + Stories. 1 раз в неделю.\n\n" +
  "<b>По частям:</b>\n" +
  "🎯 <b>Big Idea</b> — Куратор соберёт 5-7 идей, Продюсер выберет одну\n" +
  "🧪 <b>Тестовые Threads</b> — 3 версии хука для теста до полного цикла\n" +
  "📸 <b>Studio Day</b> — пакет из 4-6 Reels-сценариев на 2 часа съёмки\n" +
  "📅 <b>Weekly стратегия</b> — пересмотр фокуса и плана (вс вечером)\n\n" +
  "<b>Запуски (когда стадия канала ≥ 1):</b>\n" +
  "🎬 <b>Воронка</b> — построить продающую серию (PLF + Тимочко)";

export { MENU_TEXT };

export async function fireRoutine(kind) {
  const map = {
    pillar_cycle: {
      url: process.env.ROUTINE_PILLAR_CYCLE_URL,
      token: process.env.ROUTINE_PILLAR_CYCLE_TOKEN,
      label: "Pillar-Cycle (полный недельный цикл)"
    },
    curator: {
      url: process.env.ROUTINE_CURATOR_URL,
      token: process.env.ROUTINE_CURATOR_TOKEN,
      label: "Куратор + Продюсер (Big Idea)"
    },
    tester: {
      url: process.env.ROUTINE_TESTER_URL,
      token: process.env.ROUTINE_TESTER_TOKEN,
      label: "Hypothesis Tester (3 Threads)"
    },
    studio: {
      url: process.env.ROUTINE_STUDIO_URL,
      token: process.env.ROUTINE_STUDIO_TOKEN,
      label: "Studio Day Orchestrator"
    },
    weekly: {
      url: process.env.ROUTINE_WEEKLY_URL,
      token: process.env.ROUTINE_WEEKLY_TOKEN,
      label: "Weekly Strategist"
    },
    daily: {
      url: process.env.ROUTINE_DAILY_URL,
      token: process.env.ROUTINE_DAILY_TOKEN,
      label: "Daily Producer (legacy)"
    }
  };
  const cfg = map[kind];
  if (!cfg || !cfg.url || !cfg.token) {
    const envBase = kind.toUpperCase();
    return {
      ok: false,
      error: `Routine "${kind}" ещё не настроена.\n\nЧто сделать:\n1. Создай Routine "${cfg?.label || kind}" на code.claude.com (repo: ekatserna-collab/content-factory-agents)\n2. Скопируй её Trigger URL и Token\n3. Добавь в Vercel env vars:\n   ROUTINE_${envBase}_URL = ...\n   ROUTINE_${envBase}_TOKEN = ...`
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
