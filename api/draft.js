import { kv, KEY_OWNER_CHAT, nextDraftId, saveDraft, updateDraft } from "./_kv.js";
import { tg, draftCardKeyboard, formatDraftCard } from "./_telegram.js";

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
      error: "Owner chat_id not set. Send /claim to the bot first to register yourself as owner."
    });
  }

  let payload;
  try {
    payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const fm = payload?.frontmatter || {};
  const body = (payload?.body || "").toString().trim();
  if (!body) {
    return res.status(400).json({ error: "Empty body" });
  }

  const id = await nextDraftId();
  const draft = {
    id,
    body,
    rubric: fm.rubric || "📝",
    length: fm.length || "medium",
    sources: fm.sources || [],
    designer_brief: fm.designer_brief || "",
    target_publish_time: fm.target_publish_time || null,
    status: "pending_review",
    created_at: Math.floor(Date.now() / 1000),
    owner_chat_id: ownerChatId
  };

  await saveDraft(id, draft);

  const sent = await tg("sendMessage", {
    chat_id: ownerChatId,
    text: formatDraftCard(draft),
    parse_mode: "HTML",
    reply_markup: draftCardKeyboard(id),
    disable_web_page_preview: true
  });

  if (!sent.ok) {
    return res.status(500).json({ error: "Failed to deliver draft to owner", tg: sent });
  }

  await updateDraft(id, { owner_message_id: sent.result?.message_id });

  return res.status(200).json({
    ok: true,
    draft_id: id,
    delivered_to: ownerChatId
  });
}
