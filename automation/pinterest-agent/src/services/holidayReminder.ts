import { sendEmail } from "./sesClient";
import { sendTelegramMessage } from "./telegramClient";

interface Holiday {
  name: string;
  date: Date;
}

// month: 1-12, weekday: 0=Sun..6=Sat, n: 1-based
function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const day = 1 + (weekday - first + 7) % 7 + (n - 1) * 7;
  return new Date(Date.UTC(year, month - 1, day));
}

// Butcher's algorithm for Gregorian Easter
function easterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

// Hanukkah first night dates (month, day). Hebrew calendar is complex; hardcoded to 2035.
const HANUKKAH: Record<number, [number, number]> = {
  2025: [12, 14],
  2026: [12,  4],
  2027: [12, 24],
  2028: [12, 12],
  2029: [12,  1],
  2030: [11, 20],
  2031: [12,  8],
  2032: [11, 27],
  2033: [12, 16],
  2034: [12,  5],
  2035: [11, 25],
};

function getHolidays(year: number): Holiday[] {
  const d = (m: number, day: number) => new Date(Date.UTC(year, m - 1, day));
  const holidays: Holiday[] = [
    { name: "New Year's Day",    date: d(1, 1) },
    { name: "Valentine's Day",   date: d(2, 14) },
    { name: "St. Patrick's Day", date: d(3, 17) },
    { name: "Easter",            date: easterDate(year) },
    { name: "Mother's Day",      date: nthWeekdayOfMonth(year, 5, 0, 2) },  // 2nd Sunday May
    { name: "Father's Day",      date: nthWeekdayOfMonth(year, 6, 0, 3) },  // 3rd Sunday June
    { name: "Independence Day",  date: d(7, 4) },
    { name: "Halloween",         date: d(10, 31) },
    { name: "Thanksgiving",      date: nthWeekdayOfMonth(year, 11, 4, 4) }, // 4th Thursday November
    { name: "Christmas",         date: d(12, 25) },
  ];
  const hanukkah = HANUKKAH[year];
  if (hanukkah) holidays.push({ name: "Hanukkah", date: d(hanukkah[0], hanukkah[1]) });
  return holidays;
}

const SUGGESTIONS: Record<string, string> = {
  "New Year's Day":    "Ring in the new year! Promote winter and celebration-themed patterns.",
  "Valentine's Day":   "Hearts, roses, and love motifs — perfect last-minute gift patterns.",
  "St. Patrick's Day": "Celtic knots and shamrock designs. A niche with a loyal audience.",
  "Easter":            "Spring bunnies, eggs, and florals. Popular for home decoration stitchers.",
  "Mother's Day":      "Top handmade gift occasion of the year. Push your most popular patterns.",
  "Father's Day":      "Highlight masculine motifs: animals, maps, hobbies, humorous designs.",
  "Independence Day":  "Patriotic red-white-blue patterns and Americana motifs.",
  "Halloween":         "One of the biggest craft holidays. Feature skull, pumpkin, and gothic designs.",
  "Thanksgiving":      "Fall harvest, autumn leaves, and home decor patterns.",
  "Hanukkah":          "Jewish holiday decor: Star of David, menorah, and blue-and-silver motifs.",
  "Christmas":         "The #1 cross-stitch holiday. Ornaments, stockings, and holiday gifts.",
};

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function sendHolidayReminderIfDue(
  today: Date = new Date()
): Promise<{ sent: boolean; holiday?: string }> {
  const targetDate = new Date(today.getTime() + 14 * 86400000);
  const targetStr = toIsoDate(targetDate);
  const todayStr = toIsoDate(today);

  const holidays = getHolidays(targetDate.getUTCFullYear());
  const match = holidays.find((h) => toIsoDate(h.date) === targetStr);
  if (!match) return { sent: false };

  const suggestion = SUGGESTIONS[match.name] ?? "Great time to promote themed patterns!";

  const subject = `[cross-stitch] 2-week reminder: ${match.name} is on ${targetStr}`;

  const textBody = [
    `Holiday reminder — ${todayStr}`,
    "",
    `${match.name} is in 14 days (${targetStr}).`,
    "",
    suggestion,
    "",
    "Action: Review and pin relevant patterns on Pinterest before the holiday rush.",
  ].join("\n");

  const htmlBody = `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;color:#222;max-width:600px;margin:24px">
<h2 style="margin-bottom:4px">Holiday reminder</h2>
<p style="color:#888;margin-top:0">${todayStr}</p>
<p style="font-size:17px"><b>${match.name}</b> is in <b>14 days</b> — ${targetStr}</p>
<p style="color:#444">${suggestion}</p>
<p style="color:#555"><b>Action:</b> Review and pin relevant patterns on Pinterest before the holiday rush.</p>
<p style="color:#999;font-size:12px;margin-top:24px">Sent by the daily Lambda pipeline.</p>
</body></html>`;

  await sendEmail({ subject, textBody, htmlBody });
  await sendTelegramMessage(
    `🗓 <b>Holiday reminder</b>\n<b>${match.name}</b> in 14 days (${targetStr})\n${suggestion}`
  ).catch(() => {/* non-fatal */});

  return { sent: true, holiday: match.name };
}
