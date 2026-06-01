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

export function round(n: number, decimals = 2): number {
  return Math.round(n * 10 ** decimals) / 10 ** decimals;
}
