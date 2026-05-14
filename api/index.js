export default function handler(req, res) {
  res.status(200).json({
    status: "ok",
    name: "Telegram Content Factory Bot",
    version: "0.3",
    endpoints: {
      "/api/bot": "POST — Telegram webhook (auto-called by Telegram)",
      "/api/setup": "GET — open once to register the webhook"
    }
  });
}
