import { kv, KEY_OWNER_CHAT } from "./_kv.js";
import { tg } from "./_telegram.js";
import crypto from "crypto";

// POST /api/github-webhook
// GitHub sends push events here. We parse commit messages and notify
// the owner about pipeline stages — independent of whether routines
// themselves remember to call notify-bot.sh.
//
// Auth: X-Hub-Signature-256 with GITHUB_WEBHOOK_SECRET.
//
// We map commit-message prefixes to human-friendly stages:
//   "curator [..."        → 🎯 Куратор собрал идеи
//   "bigidea [..."        → 🎯 Big Idea выбрана
//   "tester [..."         → 🧪 Тестовые Threads готовы
//   "pillar [..."         → 📝 Pillar готов
//   "pillar-editor [..."  → ✏️ Pillar отредактирован
//   "atomizer [..."       → 🪓 Атомизатор разбил pillar
//   "carousel-writer ["   → 🖼 Carousel черновик
//   "reels-writer ["      → 🎬 Reels черновик
//   "threads-writer ["    → 🧵 Threads черновик
//   "stories-writer ["    → 📸 Stories черновик
//   "format-editor [..."  → 📦 Pillar-cycle завершён
//   "studio-day [..."     → 🎬 Studio Day готов
//   "weekly-analyst [..." → 📊 Weekly Report готов
//   "weekly-strategist [" → 🎯 Стратегия обновлена
//   "weekly-planner [..." → 📅 План на след. неделю готов

const STAGE_MAP = [
  { re: /^curator\s*\[/i, emoji: "🎯", title: "Куратор", desc: "собрал идеи недели" },
  { re: /^bigidea\s*\[/i, emoji: "🎯", title: "Big Idea", desc: "выбрана тема недели" },
  { re: /^tester\s*\[/i, emoji: "🧪", title: "Hypothesis Tester", desc: "3 Threads-версии готовы" },
  { re: /^pillar-editor\s*\[/i, emoji: "✏️", title: "Pillar Editor", desc: "pillar проверен" },
  { re: /^pillar\s+\d/i, emoji: "📝", title: "Pillar Writer", desc: "длинный pillar готов" },
  { re: /^atomizer\s*\[/i, emoji: "🪓", title: "Atomizer", desc: "pillar разбит на 4 формата — запускаются 4 writer-а" },
  { re: /^carousel-writer\s*\[/i, emoji: "🖼", title: "Carousel", desc: "черновик готов" },
  { re: /^reels-writer\s*\[/i, emoji: "🎬", title: "Reels", desc: "3 версии хука готовы" },
  { re: /^threads-writer\s*\[/i, emoji: "🧵", title: "Threads", desc: "посты готовы" },
  { re: /^stories-writer\s*\[/i, emoji: "📸", title: "Stories", desc: "слайды готовы" },
  { re: /^format-editor\s*\[/i, emoji: "📦", title: "Format Editor", desc: "pillar-cycle завершён, проверь черновики в боте" },
  { re: /^studio-day\s*\[/i, emoji: "🎬", title: "Studio Day", desc: "пакет рилсов на пятницу" },
  { re: /^weekly-analyst\s*\[/i, emoji: "📊", title: "Weekly Analyst", desc: "метрики недели" },
  { re: /^weekly-strategist\s*\[/i, emoji: "🎯", title: "Strategist", desc: "стратегия обновлена" },
  { re: /^weekly-planner\s*\[/i, emoji: "📅", title: "Planner", desc: "план на следующую неделю готов" }
];

function classify(msg) {
  for (const s of STAGE_MAP) {
    if (s.re.test(msg)) return s;
  }
  return null;
}

function verifySignature(payload, signatureHeader) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(payload);
  const expected = "sha256=" + hmac.digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}

export const config = {
  api: {
    bodyParser: false
  }
};

async function readRawBody(req) {
  return await new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  const rawBody = await readRawBody(req);
  const sigHeader = req.headers["x-hub-signature-256"];

  if (!verifySignature(rawBody, sigHeader)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  const event = req.headers["x-github-event"];
  if (event !== "push") {
    return res.status(200).json({ ok: true, skipped: `event=${event}` });
  }

  const ref = payload?.ref || "";
  const branch = ref.replace(/^refs\/heads\//, "");
  const commits = payload?.commits || [];

  const ownerChatId = await kv.get(KEY_OWNER_CHAT);
  if (!ownerChatId) {
    return res.status(200).json({ ok: true, skipped: "no owner registered" });
  }

  const notified = [];
  const merged = [];
  for (const c of commits) {
    const msg = (c.message || "").split("\n")[0].trim();
    const stage = classify(msg);
    if (!stage) continue;

    // Auto-merge routine branches into main so the next pipeline stage
    // (which reads from main) can find the result.
    let mergeStatus = null;
    if (branch.startsWith("claude/") && stage) {
      mergeStatus = await mergeIntoMain(payload.repository?.full_name, branch);
      if (mergeStatus.ok) merged.push(branch);
    }

    const text =
      `${stage.emoji} <b>${stage.title}</b>: ${stage.desc}\n\n` +
      `<i>${msg}</i>\n\n` +
      (branch === "main"
        ? `📦 в <code>main</code> — следующая стадия может стартовать`
        : mergeStatus?.ok
          ? `🌿 <code>${branch}</code> → auto-merged в <code>main</code> ✅`
          : `🌿 в ветке <code>${branch}</code> — merge не удался: ${mergeStatus?.error || "проверь"}`);

    await tg("sendMessage", {
      chat_id: ownerChatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    });
    notified.push(msg);
  }

  return res.status(200).json({ ok: true, notified, merged });
}

async function mergeIntoMain(repoFullName, headBranch) {
  const token = process.env.GITHUB_TOKEN;
  if (!token || !repoFullName) {
    return { ok: false, error: "GITHUB_TOKEN missing" };
  }
  try {
    const res = await fetch(`https://api.github.com/repos/${repoFullName}/merges`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        base: "main",
        head: headBranch,
        commit_message: `auto-merge: routine result from ${headBranch}`
      })
    });
    if (res.status === 201 || res.status === 204) {
      return { ok: true };
    }
    const body = await res.text();
    return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
