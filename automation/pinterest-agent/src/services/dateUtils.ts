export function yesterdayDate(): Date {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

export function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function yesterdayDateStr(): string {
  return formatDate(yesterdayDate());
}

// Parses a "YYYY-MM-DD" string into a Date using local Y/M/D components
// directly (not `new Date(dateStr)`, which parses as UTC midnight and can
// shift a day depending on the host's timezone offset).
export function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

// Returns the last `n` calendar-day strings ending `daysAgo` days before
// today (daysAgo=1 means the window ends yesterday), oldest first.
export function recentDateStrings(n: number, daysAgo = 1): string[] {
  const dates: string[] = [];
  for (let i = n + daysAgo - 1; i >= daysAgo; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(formatDate(d));
  }
  return dates;
}

export function round(n: number, decimals = 2): number {
  return Math.round(n * 10 ** decimals) / 10 ** decimals;
}
