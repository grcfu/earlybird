import { Resend } from "resend";
import { buildChatText, buildEmailHtml, type NotifyListing } from "@/lib/notify/format";

export type ChannelKind = "EMAIL" | "DISCORD" | "TELEGRAM";

// App URL used in message footers / CTAs.
function appUrl(): string {
  return process.env.APP_URL || "http://localhost:3000";
}

// --- Email (Resend) ---
async function sendEmail(target: string, listings: NotifyListing[]): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set — cannot send email notifications");
  }
  const from = process.env.RESEND_FROM || "EarlyBird <onboarding@resend.dev>";
  const { subject, html } = buildEmailHtml(listings, appUrl());
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({ from, to: target, subject, html });
  if (error) throw new Error(`Resend error: ${error.message ?? String(error)}`);
}

// --- Discord (incoming webhook URL) ---
async function sendDiscord(target: string, listings: NotifyListing[]): Promise<void> {
  // Discord message content caps at 2000 chars.
  const content = buildChatText(listings, appUrl()).slice(0, 1990);
  const res = await fetch(target, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, flags: 4 }), // flags:4 = suppress embeds
  });
  if (!res.ok) {
    throw new Error(`Discord webhook HTTP ${res.status} ${await safeBody(res)}`);
  }
}

// --- Telegram (target = "botToken|chatId", or a full sendMessage URL) ---
async function sendTelegram(target: string, listings: NotifyListing[]): Promise<void> {
  const text = buildChatText(listings, appUrl()).slice(0, 4090);
  let url: string;
  let body: Record<string, unknown>;

  if (target.startsWith("http")) {
    url = target;
    body = { text, disable_web_page_preview: true };
  } else {
    const sep = target.indexOf("|");
    if (sep === -1) {
      throw new Error('Telegram target must be "botToken|chatId" or a full URL');
    }
    const token = target.slice(0, sep);
    const chatId = target.slice(sep + 1);
    url = `https://api.telegram.org/bot${token}/sendMessage`;
    body = { chat_id: chatId, text, disable_web_page_preview: true };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Telegram HTTP ${res.status} ${await safeBody(res)}`);
  }
}

async function safeBody(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return "";
  }
}

// Dispatch to the right channel. Throws on failure (caller logs + continues).
export async function sendViaChannel(
  channel: ChannelKind,
  target: string,
  listings: NotifyListing[],
): Promise<void> {
  switch (channel) {
    case "EMAIL":
      return sendEmail(target, listings);
    case "DISCORD":
      return sendDiscord(target, listings);
    case "TELEGRAM":
      return sendTelegram(target, listings);
    default:
      throw new Error(`Unknown channel: ${channel}`);
  }
}
