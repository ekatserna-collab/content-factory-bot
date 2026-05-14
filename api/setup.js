export default async function handler(req, res) {
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  if (!TOKEN) return res.status(500).json({ error: "TELEGRAM_BOT_TOKEN is not configured" });

  const host = req.headers.host;
  const proto = req.headers["x-forwarded-proto"] || "https";
  const webhookUrl = `${proto}://${host}/api/bot`;

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: webhookUrl, drop_pending_updates: true })
    });
    const data = await tgRes.json();

    const commands = [
      { command: "menu", description: "Главное меню" },
      { command: "draft", description: "Сгенерировать пост сейчас" },
      { command: "weekly", description: "Пересмотр стратегии и плана" },
      { command: "queue", description: "Очередь публикаций" },
      { command: "status", description: "Статус бота" },
      { command: "claim", description: "Регистрация владельца (1 раз)" },
      { command: "id", description: "Показать свой chat_id" },
      { command: "help", description: "Справка" }
    ];
    const cmdRes = await fetch(`https://api.telegram.org/bot${TOKEN}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commands })
    });
    const cmdData = await cmdRes.json();

    const meRes = await fetch(`https://api.telegram.org/bot${TOKEN}/getMe`);
    const meData = await meRes.json();

    return res.status(200).json({
      ok: true,
      webhook_url: webhookUrl,
      telegram_response: data,
      commands_response: cmdData,
      bot_info: meData?.result,
      next_step: meData?.ok && data?.ok
        ? `Открой Telegram, найди бота @${meData.result.username} и напиши /start`
        : "Что-то пошло не так. Проверь токен."
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
