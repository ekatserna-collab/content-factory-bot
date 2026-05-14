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
        { text: "📋 Pipeline-статус недели", callback_data: "ui:pipeline" }
      ],
      [
        { text: "🎯 Big Idea", callback_data: "fire:bigidea" },
        { text: "🧪 Test Threads", callback_data: "fire:tester" }
      ],
      [
        { text: "📝 Pillar Writer", callback_data: "fire:pillar" },
        { text: "🪓 Atomizer", callback_data: "fire:atomizer" }
      ],
      [
        { text: "🖼 Carousel", callback_data: "fire:carousel" },
        { text: "🎬 Reels", callback_data: "fire:reels_writer" }
      ],
      [
        { text: "🧵 Threads writer", callback_data: "fire:threads_writer" },
        { text: "📸 Stories writer", callback_data: "fire:stories_writer" }
      ],
      [
        { text: "✏️ Format Editor (4 formats)", callback_data: "fire:format_editor" }
      ],
      [
        { text: "📸 Studio Day", callback_data: "fire:studio" },
        { text: "🔍 Daily Research", callback_data: "fire:research" }
      ],
      [
        { text: "📊 Weekly Analyst", callback_data: "fire:analyst" },
        { text: "🎯 Strategy + Plan", callback_data: "fire:weekly" }
      ],
      [
        { text: "📋 Очередь", callback_data: "ui:queue" },
        { text: "📊 Статус", callback_data: "ui:status" }
      ],
      [
        { text: "🎬 Воронка", callback_data: "ui:funnel" },
        { text: "ℹ️ Справка", callback_data: "ui:help" }
      ]
    ]
  };
}

const MENU_TEXT =
  "🤖 <b>Контент-завод</b> для @aiplaceeee\n\n" +
  "Pipeline pattern — каждая стадия отдельная routine. Можно запустить по очереди (рекомендуется) или вручную.\n\n" +
  "<b>📋 Pipeline недельный (понедельник → среда):</b>\n" +
  "1. 🎯 Big Idea — Куратор + Продюсер\n" +
  "2. 🧪 Test Threads — 3 версии хука (опц)\n" +
  "3. 📝 Pillar Writer — длинный pillar\n" +
  "4. 🪓 Atomizer — бриф для 4 форматов\n" +
  "5. 🖼🎬🧵📸 4 параллельных format-writer\n" +
  "6. ✏️ Format Editor — batch review + submit\n\n" +
  "<b>📸 Дополнительные стадии:</b>\n" +
  "• Studio Day (чт) — пакет Reels на пятницу\n" +
  "• Daily Research (ежедн) — накопление сигналов\n\n" +
  "<b>📊 Weekly (воскресенье):</b>\n" +
  "• Analyst → Strategy + Plan\n\n" +
  "<b>🎬 Воронки (стадия канала ≥ 1):</b>\n" +
  "PLF-структура + Тимочко";

export { MENU_TEXT };

export async function fireRoutine(kind) {
  const map = {
    // Pipeline stages (sequential — основной поток)
    research: { url: process.env.ROUTINE_RESEARCH_URL, token: process.env.ROUTINE_RESEARCH_TOKEN, label: "🔍 Daily Researcher" },
    bigidea: { url: process.env.ROUTINE_BIGIDEA_URL, token: process.env.ROUTINE_BIGIDEA_TOKEN, label: "🎯 Big Idea (Curator+Producer)" },
    tester: { url: process.env.ROUTINE_TESTER_URL, token: process.env.ROUTINE_TESTER_TOKEN, label: "🧪 Hypothesis Tester" },
    pillar: { url: process.env.ROUTINE_PILLAR_URL, token: process.env.ROUTINE_PILLAR_TOKEN, label: "📝 Pillar Writer" },
    pillar_editor: { url: process.env.ROUTINE_PILLAR_EDITOR_URL, token: process.env.ROUTINE_PILLAR_EDITOR_TOKEN, label: "✏️ Pillar Editor" },
    atomizer: { url: process.env.ROUTINE_ATOMIZER_URL, token: process.env.ROUTINE_ATOMIZER_TOKEN, label: "🪓 Atomizer" },

    // 4 parallel format writers
    carousel: { url: process.env.ROUTINE_CAROUSEL_URL, token: process.env.ROUTINE_CAROUSEL_TOKEN, label: "🖼 Carousel Writer" },
    reels_writer: { url: process.env.ROUTINE_REELS_WRITER_URL, token: process.env.ROUTINE_REELS_WRITER_TOKEN, label: "🎬 Reels Writer" },
    threads_writer: { url: process.env.ROUTINE_THREADS_WRITER_URL, token: process.env.ROUTINE_THREADS_WRITER_TOKEN, label: "🧵 Threads Writer" },
    stories_writer: { url: process.env.ROUTINE_STORIES_WRITER_URL, token: process.env.ROUTINE_STORIES_WRITER_TOKEN, label: "📸 Stories Writer" },

    // Merge stage
    format_editor: { url: process.env.ROUTINE_FORMAT_EDITOR_URL, token: process.env.ROUTINE_FORMAT_EDITOR_TOKEN, label: "✏️ Format Editor (batch)" },

    // Async stages
    studio: { url: process.env.ROUTINE_STUDIO_URL, token: process.env.ROUTINE_STUDIO_TOKEN, label: "📸 Studio Day Orchestrator" },
    analyst: { url: process.env.ROUTINE_ANALYST_URL, token: process.env.ROUTINE_ANALYST_TOKEN, label: "📊 Weekly Analyst" },
    weekly: { url: process.env.ROUTINE_WEEKLY_URL, token: process.env.ROUTINE_WEEKLY_TOKEN, label: "🎯 Strategist + Planner" },

    // Legacy aliases для обратной совместимости (можно убрать после очистки env)
    pillar_cycle: { url: process.env.ROUTINE_BIGIDEA_URL, token: process.env.ROUTINE_BIGIDEA_TOKEN, label: "(legacy) Запускаю Big Idea — далее по cron автоматически" },
    curator: { url: process.env.ROUTINE_BIGIDEA_URL, token: process.env.ROUTINE_BIGIDEA_TOKEN, label: "(alias) Big Idea" },
    daily: { url: process.env.ROUTINE_BIGIDEA_URL, token: process.env.ROUTINE_BIGIDEA_TOKEN, label: "(legacy) Big Idea" }
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
