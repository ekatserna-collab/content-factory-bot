import { kv, KEY_OWNER_CHAT } from "./_kv.js";
import { tg } from "./_telegram.js";

// POST /api/notify
// Headers: Authorization: Bearer <BOT_API_SECRET>
// Body: { "text": "...", "parse_mode": "HTML" | "MarkdownV2" | undefined, "disable_preview": true|false }
//
// Sends a plain notification to the registered owner. Used by routines
// to surface pipeline status, completion, alerts.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const authHeader = req.headers.authorization || "";
  const expected = `Bearer ${process.env.BOT_API_SECRET}`;
  if (!process.env.BOT_API_SECRET || authHeader !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const ownerChatId = await kv.get(KEY_OWNER_CHAT);
  if (!ownerChatId) {
    return res.status(412).json({
      error: "Owner chat_id not set. Send /claim to the bot first."
    });
  }

  let payload;
  try {
    payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const text = (payload?.text || "").toString().trim();
  if (!text) {
    return res.status(400).json({ error: "Empty text" });
  }

  const tgPayload = {
    chat_id: ownerChatId,
    text: text.slice(0, 4000),
    disable_web_page_preview: payload?.disable_preview !== false
  };
  if (payload?.parse_mode === "HTML" || payload?.parse_mode === "MarkdownV2") {
    tgPayload.parse_mode = payload.parse_mode;
  }

  const tgRes = await tg("sendMessage", tgPayload);
  if (!tgRes.ok) {
    return res.status(502).json({ error: "Telegram send failed", details: tgRes });
  }

  return res.status(200).json({ ok: true, message_id: tgRes.result?.message_id });
}
