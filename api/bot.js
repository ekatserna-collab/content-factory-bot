export default async function handler(req, res) {
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: "TELEGRAM_BOT_TOKEN is not configured" });

  if (req.method === "GET") {
    return res.status(200).json({
      status: "ok",
      message: "Bot is alive. Send a message to your bot on Telegram to test.",
      hint: "Visit /api/setup to register the webhook with Telegram."
    });
  }

  try {
    const update = req.body;
    const message = update?.message;
    if (!message) return res.status(200).json({ ok: true });

    const chatId = message.chat.id;
    const text = (message.text || "").trim();
    const firstName = message.from?.first_name || "друг";

    let reply;
    if (text === "/start") {
      reply =
        `Привет, ${firstName}! 👋\n\n` +
        `Я твой контент-завод. Здесь ты будешь получать черновики постов на одобрение и управлять публикациями.\n\n` +
        `Сейчас я только что развернулся на твоём Vercel и подключён к боту. Если ты это видишь — значит всё работает.\n\n` +
        `Следующий шаг: пришли мне в чат Claude свой Telegram-канал и тему/нишу твоего контента.`;
    } else if (text === "/ping") {
      reply = "pong";
    } else if (text === "/status") {
      reply =
        `Статус: онлайн ✅\n` +
        `Версия: 0.1 (минимальный бот)\n` +
        `Что умеет сейчас: принимать сообщения, отвечать.\n` +
        `Что будет дальше: черновики постов, кнопки одобрения, автопостинг.`;
    } else {
      reply =
        `Получил твоё сообщение: "${text}"\n\n` +
        `Бот работает. Команды: /start, /status, /ping.`;
    }

    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: reply, parse_mode: "HTML" })
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Bot error:", err);
    return res.status(200).json({ ok: true, error: String(err) });
  }
}
