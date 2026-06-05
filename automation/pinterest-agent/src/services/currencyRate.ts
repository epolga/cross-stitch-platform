export async function getUsdIlsRate(fallback: number): Promise<number> {
  try {
    const res = await fetch("https://boi.org.il/PublicApi/GetExchangeRates?key=USD");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { exchangeRates: { key: string; currentExchangeRate: number; unit: number }[] };
    const entry = data.exchangeRates?.find((r) => r.key === "USD");
    if (!entry) throw new Error("USD entry not found");
    return entry.currentExchangeRate / entry.unit;
  } catch {
    console.warn(`  [currencyRate] Bank of Israel API unavailable, using last known rate ${fallback}`);
    return fallback;
  }
}
