import { kv, getDraft, dueDrafts, removeFromQueue, updateDraft } from "./_kv.js";
import { tg } from "./_telegram.js";

export default async function handler(req, res) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  if (expected && auth !== `Bearer ${expected}`) {
    return res.status(401).json({ error: "Unauthorized cron call" });
  }

  const now = Math.floor(Date.now() / 1000);
  const due = await dueDrafts(now, 10);

  if (!due || due.length === 0) {
    return res.status(200).json({ ok: true, published: 0, message: "Nothing due" });
  }

  const channel = "@" + (process.env.CHANNEL_USERNAME || "aiplaceeee");
  const results = [];

  for (const draftId of due) {
    try {
      const draft = await getDraft(draftId);
      if (!draft) {
        await removeFromQueue(draftId);
        results.push({ id: draftId, ok: false, reason: "draft missing" });
        continue;
      }
      if (draft.status === "published") {
        await removeFromQueue(draftId);
        results.push({ id: draftId, ok: false, reason: "already published" });
        continue;
      }

      const tgRes = await tg("sendMessage", {
        chat_id: channel,
        text: draft.body,
        parse_mode: "HTML",
        disable_web_page_preview: false
      });

      if (tgRes.ok) {
        await updateDraft(draftId, {
          status: "published",
          published_at: now,
          published_message_id: tgRes.result?.message_id
        });
        await removeFromQueue(draftId);
        results.push({ id: draftId, ok: true, message_id: tgRes.result?.message_id });

        const ownerChatId = draft.owner_chat_id;
        if (ownerChatId) {
          await tg("sendMessage", {
            chat_id: ownerChatId,
            text: `✅ Запланированный пост #${draftId} опубликован в ${channel}.`
          });
        }
      } else {
        results.push({ id: draftId, ok: false, tg: tgRes });
      }
    } catch (err) {
      results.push({ id: draftId, ok: false, error: String(err) });
    }
  }

  return res.status(200).json({
    ok: true,
    published: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    details: results
  });
}
