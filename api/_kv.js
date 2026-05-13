import { Redis } from "@upstash/redis";

export const kv = Redis.fromEnv();

export const KEY_OWNER_CHAT = "owner:chat_id";
export const KEY_DRAFT_COUNTER = "draft:counter";
export const KEY_QUEUE = "queue:scheduled";
export const KEY_AWAITING_EDITS = "awaiting_edits";
export const draftKey = (id) => `draft:${id}`;

export async function nextDraftId() {
  const n = await kv.incr(KEY_DRAFT_COUNTER);
  return String(n);
}

export async function saveDraft(id, data) {
  await kv.set(draftKey(id), data, { ex: 60 * 60 * 24 * 30 });
}

export async function getDraft(id) {
  return await kv.get(draftKey(id));
}

export async function updateDraft(id, patch) {
  const cur = (await getDraft(id)) || {};
  const next = { ...cur, ...patch };
  await saveDraft(id, next);
  return next;
}

export async function enqueue(id, unixTs) {
  await kv.zadd(KEY_QUEUE, { score: unixTs, member: id });
}

export async function dueDrafts(nowTs, limit = 5) {
  return await kv.zrange(KEY_QUEUE, 0, nowTs, {
    byScore: true,
    offset: 0,
    count: limit
  });
}

export async function removeFromQueue(id) {
  await kv.zrem(KEY_QUEUE, id);
}

export async function setAwaitingEdits(chatId, draftId) {
  await kv.hset(KEY_AWAITING_EDITS, { [String(chatId)]: draftId });
}

export async function getAwaitingEdits(chatId) {
  return await kv.hget(KEY_AWAITING_EDITS, String(chatId));
}

export async function clearAwaitingEdits(chatId) {
  await kv.hdel(KEY_AWAITING_EDITS, String(chatId));
}
