import {
  kv,
  KEY_OWNER_CHAT,
  getDraft,
  updateDraft,
  enqueue,
  removeFromQueue,
  setAwaitingEdits,
  getAwaitingEdits,
  clearAwaitingEdits
} from "./_kv.js";
import {
  tg,
  draftCardKeyboard,
  formatDraftCard,
  calcScheduleTime,
  formatScheduledMsg,
  mainMenuKeyboard,
  MENU_TEXT,
  fireRoutine
} from "./_telegram.js";

export default async function handler(req, res) {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return res.status(500).json({ error: "TELEGRAM_BOT_TOKEN is not configured" });
  }

  if (req.method === "GET") {
    return res.status(200).json({
      status: "ok",
      version: "0.2",
      message: "Bot v0.2: content factory with draft approval queue."
    });
  }

  try {
    const update = req.body;
    if (update?.callback_query) {
      await handleCallback(update.callback_query);
    } else if (update?.message) {
      await handleMessage(update.message);
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Bot handler error:", err);
    return res.status(200).json({ ok: true, error: String(err) });
  }
}

async function handleMessage(message) {
  const chatId = message.chat.id;
  const text = (message.text || "").trim();
  const firstName = message.from?.first_name || "друг";

  const awaitingDraftId = await getAwaitingEdits(chatId);
  if (awaitingDraftId && text && !text.startsWith("/")) {
    return handleEditNote(chatId, awaitingDraftId, text);
  }

  if (text === "/start") {
    return tg("sendMessage", {
      chat_id: chatId,
      text:
        `Привет, ${firstName}! 👋\n\n` +
        `Я бот-редактор канала <b>@aiplaceeee</b>. Жми кнопки ниже или используй команды.\n\n` +
        `<b>Команды:</b>\n` +
        `/menu — главное меню\n` +
        `/claim — зарегистрироваться как владелец (один раз)\n` +
        `/id — показать твой chat_id\n` +
        `/queue — очередь публикаций\n` +
        `/status — статус бота\n` +
        `/help — подробная справка`,
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard()
    });
  }

  if (text === "/menu") {
    return tg("sendMessage", {
      chat_id: chatId,
      text: MENU_TEXT,
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard()
    });
  }

  if (text === "/draft" || text === "/produce") {
    const r = await fireRoutine("daily");
    return replyFireResult(chatId, "Daily Producer", r);
  }

  if (text === "/weekly") {
    const r = await fireRoutine("weekly");
    return replyFireResult(chatId, "Weekly Strategist", r);
  }

  if (text === "/claim") {
    const existing = await kv.get(KEY_OWNER_CHAT);
    if (existing && String(existing) !== String(chatId)) {
      return tg("sendMessage", {
        chat_id: chatId,
        text:
          `Владелец уже зарегистрирован (chat_id: <code>${existing}</code>).\n` +
          `Если это ошибка — обратись к разработчику чтобы сбросить.`,
        parse_mode: "HTML"
      });
    }
    await kv.set(KEY_OWNER_CHAT, chatId);
    return tg("sendMessage", {
      chat_id: chatId,
      text:
        `Готово ✅\n` +
        `Ты зарегистрирован как владелец канала. Все черновики от агентов теперь будут приходить тебе сюда.\n\n` +
        `Твой chat_id: <code>${chatId}</code>\n\n` +
        MENU_TEXT,
      parse_mode: "HTML",
      reply_markup: mainMenuKeyboard()
    });
  }

  if (text === "/id") {
    return tg("sendMessage", {
      chat_id: chatId,
      text: `Твой chat_id: <code>${chatId}</code>`,
      parse_mode: "HTML"
    });
  }

  if (text === "/queue") {
    const queueIds = await kv.zrange("queue:scheduled", 0, -1, { withScores: true });
    if (!queueIds || queueIds.length === 0) {
      return tg("sendMessage", { chat_id: chatId, text: "Очередь пуста." });
    }
    const lines = [];
    for (let i = 0; i < queueIds.length; i += 2) {
      const did = queueIds[i];
      const ts = Number(queueIds[i + 1]);
      const d = await getDraft(did);
      lines.push(
        `#${did} → ${formatScheduledMsg(null, ts)} · ${d?.rubric || "📝"} · ${(d?.body || "").slice(0, 60)}…`
      );
    }
    return tg("sendMessage", {
      chat_id: chatId,
      text: `<b>Очередь (${lines.length}):</b>\n\n${lines.join("\n")}`,
      parse_mode: "HTML"
    });
  }

  if (text === "/status") {
    const owner = await kv.get(KEY_OWNER_CHAT);
    const qLen = await kv.zcard("queue:scheduled");
    return tg("sendMessage", {
      chat_id: chatId,
      text:
        `Статус ✅\n` +
        `Версия: 0.2\n` +
        `Владелец: ${owner ? `<code>${owner}</code>` : "не зарегистрирован (/claim)"}\n` +
        `В очереди: ${qLen} черновиков`,
      parse_mode: "HTML"
    });
  }

  if (text === "/help") {
    return tg("sendMessage", {
      chat_id: chatId,
      text:
        `<b>Как пользоваться</b>\n\n` +
        `<b>Получение черновиков:</b>\n` +
        `1) Жми кнопку «✨ Сгенерировать пост» в /menu — агент проснётся, через 2–5 мин пришлёт готовый черновик.\n` +
        `2) Либо ждёшь авто-запуска по расписанию (3 раза в день, без твоего участия).\n\n` +
        `<b>На каждом черновике 5 кнопок:</b>\n` +
        `   • ✅ В канал сейчас — публикация немедленно\n` +
        `   • ⏰ Завтра 09:00 — в очередь\n` +
        `   • 🌆 Сегодня 19:00 — в очередь\n` +
        `   • ✏️ Доработать — следующим сообщением напиши правки, агент учтёт\n` +
        `   • ❌ Отклонить — отметится как отказанный\n\n` +
        `<b>Команды:</b>\n` +
        `/menu — главное меню с кнопками\n` +
        `/draft — запустить генерацию поста (то же что кнопка)\n` +
        `/weekly — запустить пересмотр стратегии + плана\n` +
        `/queue — очередь публикаций\n` +
        `/status — статус бота\n` +
        `/claim — регистрация владельца (один раз)`,
      parse_mode: "HTML"
    });
  }

  return tg("sendMessage", {
    chat_id: chatId,
    text:
      `Не понял команду. Используй /help чтобы увидеть список.\n\n` +
      (text ? `Ты написал: «${text.slice(0, 200)}»` : "")
  });
}

async function handleEditNote(chatId, draftId, note) {
  const d = await getDraft(draftId);
  if (!d) {
    await clearAwaitingEdits(chatId);
    return tg("sendMessage", { chat_id: chatId, text: `Черновик #${draftId} не найден.` });
  }

  const edits = d.edit_notes || [];
  edits.push({ at: Math.floor(Date.now() / 1000), note });
  await updateDraft(draftId, { status: "awaiting_rework", edit_notes: edits });
  await clearAwaitingEdits(chatId);

  return tg("sendMessage", {
    chat_id: chatId,
    text:
      `Принял правки для черновика #${draftId} ✅\n\n` +
      `Заметка передастся агенту-Сценаристу при следующем запуске. Он перепишет и пришлёт новую версию.`
  });
}

async function replyFireResult(chatId, label, r) {
  if (r.ok) {
    return tg("sendMessage", {
      chat_id: chatId,
      text:
        `🚀 <b>${label}</b> запущен.\n\n` +
        `Агент проснулся на серверах Anthropic. Через 2–5 минут готовый черновик прилетит сюда с кнопками одобрения.\n\n` +
        (r.session?.url ? `🔍 Лог сессии: ${r.session.url}` : ""),
      parse_mode: "HTML",
      disable_web_page_preview: true
    });
  }
  return tg("sendMessage", {
    chat_id: chatId,
    text:
      `❌ Не удалось запустить ${label}.\n\n` +
      `<code>${(r.error || JSON.stringify(r.body)).toString().slice(0, 400)}</code>\n\n` +
      `Проверь что Routine создана и env vars прописаны.`,
    parse_mode: "HTML"
  });
}

async function handleCallback(cb) {
  const chatId = cb.message?.chat?.id;
  const messageId = cb.message?.message_id;
  const data = cb.data || "";
  const [action, ...rest] = data.split(":");

  const ack = (text) => tg("answerCallbackQuery", { callback_query_id: cb.id, text });

  if (action === "fire") {
    const kind = rest[0];
    const label = kind === "daily" ? "Daily Producer" : "Weekly Strategist";
    await ack(`Запускаю ${label}…`);
    const r = await fireRoutine(kind);
    return replyFireResult(chatId, label, r);
  }

  if (action === "ui") {
    const view = rest[0];
    await ack();
    if (view === "queue") return handleMessage({ chat: { id: chatId }, text: "/queue", from: { first_name: "" } });
    if (view === "status") return handleMessage({ chat: { id: chatId }, text: "/status", from: { first_name: "" } });
    if (view === "help") return handleMessage({ chat: { id: chatId }, text: "/help", from: { first_name: "" } });
    return;
  }

  if (action === "publish") {
    const slot = rest[0];
    const draftId = rest[1];
    const draft = await getDraft(draftId);
    if (!draft) return ack("Черновик не найден");

    if (slot === "now") {
      const result = await publishToChannel(draft);
      if (!result.ok) {
        await ack("Ошибка публикации");
        return tg("sendMessage", {
          chat_id: chatId,
          text: `Ошибка публикации #${draftId}: ${JSON.stringify(result.tg).slice(0, 300)}`
        });
      }
      await updateDraft(draftId, {
        status: "published",
        published_at: Math.floor(Date.now() / 1000),
        published_message_id: result.tg.result?.message_id
      });
      await editMessageStatus(chatId, messageId, draft, `✅ Опубликовано в @${process.env.CHANNEL_USERNAME || "aiplaceeee"}`);
      return ack("Опубликовано");
    }

    const ts = calcScheduleTime(slot);
    await enqueue(draftId, ts);
    await updateDraft(draftId, { status: "queued", scheduled_for: ts });
    await editMessageStatus(chatId, messageId, draft, `⏰ В очереди на ${formatScheduledMsg(slot, ts)}`);
    return ack("В очереди");
  }

  if (action === "edit") {
    const draftId = rest[0];
    await setAwaitingEdits(chatId, draftId);
    await ack("Жду правки");
    return tg("sendMessage", {
      chat_id: chatId,
      text:
        `Напиши, что переделать в черновике #${draftId}. Следующее твоё сообщение пойдёт агенту-Сценаристу как ТЗ.\n\n` +
        `Например: «слишком корпоративно, переписать живее», «убрать упоминание Make.com, заменить на n8n», «вступление слабое».`
    });
  }

  if (action === "reject") {
    const draftId = rest[0];
    const draft = await getDraft(draftId);
    if (!draft) return ack("Черновик не найден");
    await updateDraft(draftId, { status: "rejected", rejected_at: Math.floor(Date.now() / 1000) });
    await editMessageStatus(chatId, messageId, draft, `❌ Отклонён`);
    return ack("Отклонён");
  }

  return ack("Неизвестное действие");
}

async function publishToChannel(draft) {
  const channel = "@" + (process.env.CHANNEL_USERNAME || "aiplaceeee");
  const tgRes = await tg("sendMessage", {
    chat_id: channel,
    text: draft.body,
    parse_mode: "HTML",
    disable_web_page_preview: false
  });
  return { ok: tgRes.ok, tg: tgRes };
}

async function editMessageStatus(chatId, messageId, draft, statusLine) {
  return tg("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: `${statusLine}\n\n${formatDraftCard(draft)}`,
    parse_mode: "HTML",
    disable_web_page_preview: true
  });
}
