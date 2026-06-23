import { sendEmail } from "./sesClient";
import { sendTelegramMessage } from "./telegramClient";

interface Holiday {
  name: string;
  date: Date;
}

export interface HolidayReminderSent {
  holiday: string;
  daysAway: number;
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


function getHolidays(year: number): Holiday[] {
  const d = (m: number, day: number) => new Date(Date.UTC(year, m - 1, day));
  return [
    { name: "Valentine's Day",  date: d(2, 14) },
    { name: "Easter",           date: easterDate(year) },
    { name: "Mother's Day",     date: nthWeekdayOfMonth(year, 5, 0, 2) },  // 2nd Sunday May
    { name: "Independence Day", date: d(7, 4) },
    { name: "Halloween",        date: d(10, 31) },
    { name: "Thanksgiving",     date: nthWeekdayOfMonth(year, 11, 4, 4) }, // 4th Thursday November
    { name: "Christmas",        date: d(12, 25) },
  ];
}

const SUGGESTIONS: Record<string, string> = {
  "Valentine's Day":  "Hearts, roses, and love motifs make perfect gift patterns.",
  "Easter":           "Spring bunnies, eggs, and florals. Popular for home decoration stitchers.",
  "Mother's Day":     "Top handmade gift occasion of the year. Push your most popular patterns.",
  "Independence Day": "Patriotic red-white-blue patterns and Americana motifs.",
  "Halloween":        "One of the biggest craft holidays. Feature skull, pumpkin, and gothic designs.",
  "Thanksgiving":     "Fall harvest, autumn leaves, and home decor patterns.",
  "Christmas":        "The #1 cross-stitch holiday. Ornaments, stockings, and holiday gifts.",
};

const EARLY_ACTION = "Great time to start a full project — most patterns take 3–6 weeks to complete.";
const LATE_ACTION  = "Last call for quick patterns and small gifts. Pin last-minute ideas now.";

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function sendReminder(todayStr: string, holiday: Holiday, daysAway: number): Promise<void> {
  const holidayStr = toIsoDate(holiday.date);
  const suggestion = SUGGESTIONS[holiday.name] ?? "Great time to promote themed patterns!";
  const isEarly = daysAway === 28;
  const weeksLabel = isEarly ? "4 weeks" : "2 weeks";
  const action = isEarly ? EARLY_ACTION : LATE_ACTION;

  const subject = `[cross-stitch] ${weeksLabel} reminder: ${holiday.name} is on ${holidayStr}`;

  const textBody = [
    `Holiday reminder — ${todayStr}`,
    "",
    `${holiday.name} is in ${weeksLabel} (${holidayStr}).`,
    "",
    suggestion,
    "",
    `Action: ${action}`,
  ].join("\n");

  const htmlBody = `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,sans-serif;color:#222;max-width:600px;margin:24px">
<h2 style="margin-bottom:4px">Holiday reminder</h2>
<p style="color:#888;margin-top:0">${todayStr}</p>
<p style="font-size:17px"><b>${holiday.name}</b> is in <b>${weeksLabel}</b> — ${holidayStr}</p>
<p style="color:#444">${suggestion}</p>
<p style="color:#555"><b>Action:</b> ${action}</p>
<p style="color:#999;font-size:12px;margin-top:24px">Sent by the daily Lambda pipeline.</p>
</body></html>`;

  await sendEmail({ subject, textBody, htmlBody });
  await sendTelegramMessage(
    `🗓 <b>Holiday reminder — ${weeksLabel}</b>\n<b>${holiday.name}</b> on ${holidayStr}\n${suggestion}\n<i>${action}</i>`
  ).catch(() => {/* non-fatal */});
}

export async function sendHolidayReminderIfDue(
  today: Date = new Date()
): Promise<{ reminders: HolidayReminderSent[] }> {
  const todayStr = toIsoDate(today);
  const sent: HolidayReminderSent[] = [];

  for (const daysAway of [28, 14]) {
    const targetDate = new Date(today.getTime() + daysAway * 86400000);
    const targetStr = toIsoDate(targetDate);
    const holidays = getHolidays(targetDate.getUTCFullYear());
    const match = holidays.find((h) => toIsoDate(h.date) === targetStr);
    if (match) {
      await sendReminder(todayStr, match, daysAway);
      sent.push({ holiday: match.name, daysAway });
    }
  }

  return { reminders: sent };
}
