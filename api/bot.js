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

  if (text === "/pillar" || text === "/cycle") {
    const r = await fireRoutine("pillar_cycle");
    return replyFireResult(chatId, "Pillar-Cycle", r);
  }

  if (text === "/bigidea" || text === "/curator") {
    const r = await fireRoutine("curator");
    return replyFireResult(chatId, "Куратор + Продюсер", r);
  }

  if (text === "/test" || text === "/threads") {
    const r = await fireRoutine("tester");
    return replyFireResult(chatId, "Hypothesis Tester", r);
  }

  if (text === "/studio") {
    const r = await fireRoutine("studio");
    return replyFireResult(chatId, "Studio Day Orchestrator", r);
  }

  if (text === "/weekly") {
    const r = await fireRoutine("weekly");
    return replyFireResult(chatId, "Weekly Strategist", r);
  }

  if (text === "/draft" || text === "/produce") {
    const r = await fireRoutine("daily");
    return replyFireResult(chatId, "Daily Producer (legacy)", r);
  }

  if (text === "/funnel" || text.startsWith("/funnel ")) {
    return tg("sendMessage", {
      chat_id: chatId,
      text:
        `🎬 <b>Воронка продаж — Funnel Producer</b>\n\n` +
        `Запуск воронки активируется только когда канал на <b>стадии 1+</b> (накоплено 15+ содержательных постов).\n\n` +
        `Для запуска нужно:\n` +
        `1. Указать продукт (консультация / разработка / курс)\n` +
        `2. Дата open cart\n` +
        `3. Длительность open cart (4-7 дней)\n` +
        `4. Цена + value stack\n` +
        `5. Есть ли lead magnet\n\n` +
        `Пока канал на стадии 0 — рано. Сначала набираем контекст.\n` +
        `Прочитай <code>knowledge/methodologies/funnel-launches.md</code> в репо для деталей.`,
      parse_mode: "HTML"
    });
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
        `<b>📦 Главный режим — недельный pillar-cycle:</b>\n` +
        `Один раз в неделю запускаешь Pillar-cycle → агенты делают:\n` +
        `• 📝 Длинный pillar для Telegram\n` +
        `• 🖼 Carousel 8-12 слайдов\n` +
        `• 🎬 Reels-сценарий (3 версии хука)\n` +
        `• 🧵 3-5 Threads постов\n` +
        `• 📸 Stories серия\n\n` +
        `Каждый формат прилетает отдельной карточкой с кнопками одобрения.\n\n` +
        `<b>🧪 По частям (если нужен контроль):</b>\n` +
        `• /bigidea — только Куратор соберёт идеи\n` +
        `• /test — 3 Threads для теста угла\n` +
        `• /studio — пакет Reels на студио-день\n` +
        `• /weekly — пересмотр стратегии (вс)\n\n` +
        `<b>📋 Управление:</b>\n` +
        `• /menu — главное меню\n` +
        `• /queue — очередь публикаций\n` +
        `• /status — статус бота\n` +
        `• /claim — регистрация владельца (один раз)\n\n` +
        `<b>🎬 Запуски (будущее, стадия 1+):</b>\n` +
        `• /funnel — запуск воронки продаж (PLF + Тимочко)\n\n` +
        `<b>На каждом черновике 5 кнопок:</b>\n` +
        `   • ✅ В канал сейчас\n` +
        `   • ⏰ Завтра 09:00\n` +
        `   • 🌆 Сегодня 19:00\n` +
        `   • ✏️ Доработать — следующим сообщением правки\n` +
        `   • ❌ Отклонить`,
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
    const labels = {
      pillar_cycle: "Pillar-Cycle",
      curator: "Куратор + Продюсер",
      tester: "Hypothesis Tester",
      studio: "Studio Day",
      weekly: "Weekly Strategist",
      daily: "Daily Producer"
    };
    const label = labels[kind] || kind;
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
    if (view === "funnel") return handleMessage({ chat: { id: chatId }, text: "/funnel", from: { first_name: "" } });
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
