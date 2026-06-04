// Thin wrapper around the Telegram Bot API. Uses plain fetch — no SDK needed.
// Reads TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from env.

const BASE = "https://api.telegram.org";

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN not set");
  return t;
}

function chatId(): string {
  const c = process.env.TELEGRAM_CHAT_ID;
  if (!c) throw new Error("TELEGRAM_CHAT_ID not set");
  return c;
}

export async function sendTelegramMessage(text: string): Promise<void> {
  const url = `${BASE}/bot${token()}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId(), text, parse_mode: "HTML" }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Telegram sendMessage failed ${res.status}: ${body}`);
  }
}
